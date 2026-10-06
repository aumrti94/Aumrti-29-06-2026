import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  resolveHospitalFromJwt, recordAsrUsage, estimateAudioSeconds, assumedBitrateKbps,
} from "../_shared/asr-metering.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// NOTE: there is deliberately no short→BCP-47 map here. Bhashini's ULCA pipeline wants the
// bare ISO-639 code ("hi", "or"), which is exactly what this endpoint already receives, so
// `language_code` is passed through untouched below. A map used to be computed here and then
// never used — and it mapped the WRONG WAY, so "fixing" the unused variable into the call
// would have broken every request. See _shared/asr-languages.ts for the real provider maps.

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // SECURITY (fixed 2026-09-19 — found while scoping Phase 10, no prior KNOWN-BUG entry):
  // this function accepted unauthenticated calls outright — the same gap bhashini-transcribe's
  // own header comment says was fixed there ("anyone holding the anon key could burn the
  // hospital's quota"), never carried over to this patient-facing sibling. Here the blast
  // radius is worse: an unauthenticated caller could also write a `patient_voice_sessions`
  // PHI row under ANY hospital_id/patient_id it chose, not just spend quota.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: { user }, error: authError } = await authClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Prefer env secrets. 2. Fall back to the GLOBAL platform_ai_keys (set at /platform → API Hub).
    let bhashiniApiKey = Deno.env.get("BHASHINI_API_KEY");
    let bhashiniUserId = Deno.env.get("BHASHINI_USER_ID");

    if (!bhashiniApiKey || !bhashiniUserId) {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: configData } = await supabaseAdmin
        .from("platform_ai_keys")
        .select("config")
        .eq("service_key", "bhashini")
        .eq("is_active", true)
        .maybeSingle();
      const cfg = configData?.config as Record<string, string> | null;
      bhashiniApiKey = bhashiniApiKey || cfg?.api_key;
      bhashiniUserId = bhashiniUserId || cfg?.user_id;
    }

    const { audio_base64, language_code, patient_id, hospital_id, session_type } = await req.json();

    if (!audio_base64 || !language_code) {
      return new Response(
        JSON.stringify({ error: "audio_base64 and language_code required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If Bhashini not configured, fall back to a mock transcript for development — but still
    // run the session-logging and metering below. Returning early here (as this used to) skipped
    // both entirely in every local/dev environment, since no environment without real Bhashini
    // credentials could ever reach the identity-verified PHI write this function exists to gate.
    const mock = !bhashiniApiKey || !bhashiniUserId;
    let transcript: string;
    let modelId: string | undefined;
    const asrStartedAt = Date.now();

    if (mock) {
      transcript = `[Voice input in ${language_code} — Bhashini API not configured. Add BHASHINI_API_KEY and BHASHINI_USER_ID secrets to enable live transcription.]`;
    } else {
      // Step 1: Get ASR pipeline config
      const pipelineRes = await fetch(
        "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "ulcaApiKey": bhashiniApiKey, "userId": bhashiniUserId },
          body: JSON.stringify({
            pipelineTasks: [{ taskType: "asr", config: { language: { sourceLanguage: language_code } } }],
            pipelineRequestConfig: { pipelineId: "64392f96daac500b55c543cd" },
          }),
        }
      );

      const pipelineData = await pipelineRes.json();
      const asrConfig = pipelineData?.pipelineResponseConfig?.[0];
      if (!asrConfig) {
        throw new Error("No ASR pipeline config returned from Bhashini");
      }

      const serviceEndpoint = asrConfig.config?.[0]?.serviceEndpoint || "https://dhruva-api.bhashini.gov.in/services/inference/pipeline";
      modelId = asrConfig.config?.[0]?.modelId;
      const authToken = pipelineData.pipelineInferenceAPIEndPoint?.inferenceApiKey?.value;

      // Step 2: Transcribe audio
      const transcribeRes = await fetch(serviceEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": authToken || "" },
        body: JSON.stringify({
          pipelineTasks: [{
            taskType: "asr",
            config: { language: { sourceLanguage: language_code }, serviceId: modelId || "" },
          }],
          inputData: {
            audio: [{ audioContent: audio_base64 }],
          },
        }),
      });

      const transcribeData = await transcribeRes.json();
      transcript = transcribeData?.pipelineResponse?.[0]?.output?.[0]?.source || "";
    }

    // Log session if patient context provided — only once the caller is confirmed to
    // actually BE that patient. The only real caller (VoiceInputButton.tsx, confirmed by
    // reading it directly) lives under src/components/portal/ — a patient-portal session,
    // not staff, so there is no public.users row to check here at all. Patients authenticate
    // via Supabase Auth email/phone OTP with no stored auth_user_id FK on `patients`
    // (confirmed live — PatientPortalLogin.tsx matches by email/phone at login time, not a
    // foreign key), so the same match is the real identity check, same as create-razorpay-order's
    // equivalent fix.
    if (patient_id && hospital_id) {
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: patient } = await sb
        .from("patients")
        .select("email, phone")
        .eq("id", patient_id)
        .eq("hospital_id", hospital_id)
        .maybeSingle();
      const last10 = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "").slice(-10);
      const emailMatches = !!patient?.email && !!user.email && patient.email.toLowerCase() === user.email.toLowerCase();
      const phoneMatches = !!patient?.phone && !!user.phone && last10(patient.phone) === last10(user.phone) && last10(user.phone).length === 10;
      if (emailMatches || phoneMatches) {
        await sb.from("patient_voice_sessions").insert({
          hospital_id,
          patient_id,
          session_type: session_type || "general",
          language_code,
          transcript,
        });
      }
    }

    // Meter the transcription. The hospital is derived from the JWT, NOT from
    // the hospital_id in the request body: that one is client-supplied and is
    // fine for attaching a session note, but billing must not be something a
    // caller can point at another tenant.
    void (async () => {
      const meterClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const billedHospitalId = await resolveHospitalFromJwt(req, meterClient);
      const bitrate = await assumedBitrateKbps(meterClient, "bhashini");
      const approxBytes = Math.floor((audio_base64?.length ?? 0) * 3 / 4);
      await recordAsrUsage(meterClient, {
        hospitalId: billedHospitalId,
        provider: "bhashini",
        model: modelId || "bhashini-asr",
        seconds: estimateAudioSeconds(approxBytes, bitrate),
        estimated: true,
        latencyMs: Date.now() - asrStartedAt,
      });
    })();

    return new Response(JSON.stringify({ transcript, language_code, ...(mock ? { mock: true } : {}) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
