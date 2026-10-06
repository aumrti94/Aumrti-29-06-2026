import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the inviting user's hospital_id
    const { data: inviter } = await supabaseAdmin
      .from("users")
      .select("hospital_id")
      // auth_user_id, NOT id — the two diverged in migration 20260322111223.
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!inviter?.hospital_id) {
      return new Response(JSON.stringify({ error: "No hospital found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { emails, hospital_id } = await req.json();

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return new Response(JSON.stringify({ error: "No emails provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];
    for (const email of emails.slice(0, 20)) {
      try {
        // Invite user via Supabase auth
        const { data: invited, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
        
        if (inviteErr) {
          results.push({ email, status: "error", message: inviteErr.message });
          continue;
        }

        // Create user record. id/auth_user_id fixed 2026-09-19 (Phase 10 — KNOWN-BUG-195's
        // own writeup flagged this exact conflation here as a separate follow-up, never
        // done): public.users.id and auth.users.id are deliberately DIFFERENT identifiers
        // (migration 20260322111223) — every RLS policy and get_user_hospital_id() resolve a
        // caller via auth_user_id, never id, so setting id: invited.user.id and leaving
        // auth_user_id null made every doctor invited through this path permanently
        // unresolvable (the account exists, but is functionally locked out immediately),
        // the identical failure shape KNOWN-BUG-195/-196 already fixed on the two sibling
        // provisioning functions.
        if (invited?.user) {
          const { error: userInsertErr } = await supabaseAdmin.from("users").insert({
            id: crypto.randomUUID(),
            auth_user_id: invited.user.id,
            hospital_id: inviter.hospital_id,
            full_name: email.split("@")[0],
            email,
            role: "doctor",
            is_active: true,
          });
          if (userInsertErr) {
            // The auth invite already went out — reporting "invited" here would be a real
            // lie: the doctor exists as an auth account with no staff profile at all, unable
            // to reach a single hospital-scoped screen. Not previously checked at all.
            results.push({ email, status: "error", message: `Invited but profile creation failed: ${userInsertErr.message}` });
            continue;
          }
        }

        results.push({ email, status: "invited" });
      } catch (e) {
        results.push({ email, status: "error", message: e.message });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
