/**
 * Phase 10 (docs/testing/PHASED_TEST_PLAN.md) — bhashini-patient-transcribe.
 *
 * Found live while scoping Phase 10, no prior KNOWN-BUG entry: this function accepted
 * unauthenticated calls outright — the same gap `bhashini-transcribe`'s own header comment
 * says was fixed there ("anyone holding the anon key could burn the hospital's quota"), never
 * carried over to this patient-facing sibling. Worse here: an unauthenticated caller could
 * also write a `patient_voice_sessions` PHI row under ANY hospital_id/patient_id it chose.
 * Fixed same pass: a real session is required, and the session-logging half additionally
 * verifies the caller genuinely IS the claimed patient (by email/phone match against
 * `patients` — the same identity check patients authenticate with at login, since there is no
 * stored auth_user_id FK on `patients`, confirmed by reading PatientPortalLogin.tsx directly).
 *
 * No real BHASHINI_API_KEY/BHASHINI_USER_ID is configured in this local environment, so a
 * genuinely authorized request correctly falls into the function's own documented mock-mode
 * branch (`mock: true`) rather than calling the real Bhashini ULCA pipeline — this is real,
 * intentional local behaviour, not a gap, and it usefully means the full success path
 * (including the PHI-write side effect under test) IS exercisable here, unlike a function that
 * terminates at "gateway not configured".
 */
import { describe, it, expect, afterAll } from "vitest";
import { callFunction, edgeRuntimeReachable, tokenFor } from "../fixtures/edgeFunctionClient";
import { serviceClient, tenantClient } from "../fixtures/serviceClient";
import { HOSPITAL_A, HOSPITAL_B } from "../fixtures/constants";
import { assertLocalTarget } from "../fixtures/guard";

assertLocalTarget(process.env.SUPABASE_URL ?? "http://127.0.0.1:54321", process.env.SUPABASE_PROJECT_REF);
const runtimeUp = await edgeRuntimeReachable();

const PATIENT_ID = "a0000000-0000-4000-8000-e00000000401";
const OTHER_PATIENT_ID = "a0000000-0000-4000-8000-e00000000402";
const PATIENT_EMAIL = "bhashini-patient-fixture@example.test";
const OTHER_PATIENT_EMAIL = "bhashini-patient-fixture-other@example.test";
const PATIENT_PASSWORD = "aumrti-e2e-local-only-patient";
const TINY_AUDIO = btoa("not-real-audio-bytes");

let patientToken = "";

if (runtimeUp) {
  const svc = serviceClient();

  await svc.from("patients").insert([
    { id: PATIENT_ID, hospital_id: HOSPITAL_A.id, full_name: "Test Patient BhashiniFixture", uhid: `${HOSPITAL_A.uhidPrefix}BHASHINI1`, phone: "9000000211", email: PATIENT_EMAIL, is_active: true },
    { id: OTHER_PATIENT_ID, hospital_id: HOSPITAL_A.id, full_name: "Test Patient BhashiniOther", uhid: `${HOSPITAL_A.uhidPrefix}BHASHINI2`, phone: "9000000212", email: OTHER_PATIENT_EMAIL, is_active: true },
  ] as never);

  const { error: createErr } = await svc.auth.admin.createUser({
    email: PATIENT_EMAIL, password: PATIENT_PASSWORD, email_confirm: true,
  });
  if (createErr && !createErr.message.includes("already been registered")) {
    throw new Error(`Could not create fixture patient auth user: ${createErr.message}`);
  }
  const patientClient = await tenantClient(PATIENT_EMAIL, PATIENT_PASSWORD);
  const { data: session } = await patientClient.auth.getSession();
  patientToken = session.session?.access_token ?? "";
}

afterAll(async () => {
  if (!runtimeUp) return;
  const svc = serviceClient();
  await svc.from("patient_voice_sessions").delete().in("patient_id", [PATIENT_ID, OTHER_PATIENT_ID]);
  await svc.from("patients").delete().in("id", [PATIENT_ID, OTHER_PATIENT_ID]);
  const { data: users } = await svc.auth.admin.listUsers();
  const fixtureUser = users?.users.find((u) => u.email === PATIENT_EMAIL);
  if (fixtureUser) await svc.auth.admin.deleteUser(fixtureUser.id);
});

describe.skipIf(!runtimeUp)("bhashini-patient-transcribe", () => {
  it("1. no Authorization header is rejected — this is the fix under test", async () => {
    const res = await callFunction("bhashini-patient-transcribe", {
      token: null,
      body: { audio_base64: TINY_AUDIO, language_code: "hi" },
    });
    expect(res.status).toBe(401);
  });

  it("2. a garbage bearer token is rejected", async () => {
    const res = await callFunction("bhashini-patient-transcribe", {
      token: "garbage",
      body: { audio_base64: TINY_AUDIO, language_code: "hi" },
    });
    expect(res.status).toBe(401);
  });

  it("3. missing audio_base64/language_code is a clean 400", async () => {
    const res = await callFunction("bhashini-patient-transcribe", { token: patientToken, body: {} });
    expect(res.status).toBe(400);
  });

  it("4. a real patient session transcribing WITHOUT patient context still works (no session logging attempted)", async () => {
    const res = await callFunction("bhashini-patient-transcribe", {
      token: patientToken,
      body: { audio_base64: TINY_AUDIO, language_code: "hi" },
    });
    expect(res.status).toBe(200);
    expect(res.json.mock).toBe(true);
  });

  it("5. a real patient transcribing under their OWN patient_id/hospital_id logs a real patient_voice_sessions row", async () => {
    const res = await callFunction("bhashini-patient-transcribe", {
      token: patientToken,
      body: { audio_base64: TINY_AUDIO, language_code: "hi", patient_id: PATIENT_ID, hospital_id: HOSPITAL_A.id, session_type: "chief_complaint" },
    });
    expect(res.status).toBe(200);

    const svc = serviceClient();
    const { data: rows, error } = await svc
      .from("patient_voice_sessions")
      .select("id, patient_id, hospital_id, session_type")
      .eq("patient_id", PATIENT_ID);
    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows![0].hospital_id).toBe(HOSPITAL_A.id);
  });

  it("6. the SAME patient session claiming a DIFFERENT patient_id does not write a PHI row for that patient — the actual fix under test", async () => {
    const res = await callFunction("bhashini-patient-transcribe", {
      token: patientToken,
      body: { audio_base64: TINY_AUDIO, language_code: "hi", patient_id: OTHER_PATIENT_ID, hospital_id: HOSPITAL_A.id },
    });
    // Transcription itself still succeeds — only the PHI-write side effect is gated.
    expect(res.status).toBe(200);

    const svc = serviceClient();
    const { data: rows, error } = await svc
      .from("patient_voice_sessions")
      .select("id")
      .eq("patient_id", OTHER_PATIENT_ID);
    expect(error).toBeNull();
    expect(rows ?? []).toHaveLength(0);
  });

  it("7. a real patient session claiming a hospital they don't belong to does not write a PHI row", async () => {
    const res = await callFunction("bhashini-patient-transcribe", {
      token: patientToken,
      body: { audio_base64: TINY_AUDIO, language_code: "hi", patient_id: PATIENT_ID, hospital_id: HOSPITAL_B.id },
    });
    expect(res.status).toBe(200);

    const svc = serviceClient();
    const { data: rows, error } = await svc
      .from("patient_voice_sessions")
      .select("id")
      .eq("patient_id", PATIENT_ID)
      .eq("hospital_id", HOSPITAL_B.id);
    expect(error).toBeNull();
    expect(rows ?? []).toHaveLength(0);
  });

  it("8. a completely different authenticated identity (hospital staff) cannot write a PHI row for this patient either", async () => {
    const staffToken = await tokenFor("a", "hospital_admin");
    const res = await callFunction("bhashini-patient-transcribe", {
      token: staffToken,
      body: { audio_base64: TINY_AUDIO, language_code: "hi", patient_id: PATIENT_ID, hospital_id: HOSPITAL_A.id, session_type: "staff_attempt" },
    });
    expect(res.status).toBe(200);

    const svc = serviceClient();
    const { data: rows, error } = await svc
      .from("patient_voice_sessions")
      .select("id")
      .eq("patient_id", PATIENT_ID)
      .eq("session_type", "staff_attempt");
    expect(error).toBeNull();
    expect(rows ?? []).toHaveLength(0);
  });
});
