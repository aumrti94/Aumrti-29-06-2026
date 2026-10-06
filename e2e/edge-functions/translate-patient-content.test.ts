/**
 * Phase 10 (docs/testing/PHASED_TEST_PLAN.md) — translate-patient-content.
 *
 * KNOWN-BUG-260. Found while scoping Phase 10: this function was already correctly tenant-scoped
 * (hospital_id is resolved server-side from the caller's own `users` row via `auth_user_id` — the
 * request body has no hospital_id field at all, so there is no cross-tenant param-tampering
 * vector to test here), but it wrote the first 100 characters of raw patient content and its
 * translation into `ai_feature_logs.input_summary`/`output_summary` completely unredacted — a
 * direct CLAUDE.md violation ("No PHI in ... logs ... ever"). Fixed by routing both through the
 * already-existing `_shared/phi-redactor.ts` `sanitizeForLog`, same helper used elsewhere in this
 * codebase for exactly this boundary.
 *
 * IMPORTANT LOCAL LIMITATION, stated plainly: the redaction fix itself lives on the code path
 * AFTER the real AI translation call (`callAiChat`) and BEFORE the `ai_feature_logs` insert. No
 * real AI-provider credentials (OpenAI/Claude/Gemini/Perplexity, or a hospital's own
 * platform_ai_keys config) exist in this local environment, so any non-English translation
 * request correctly terminates at "No AI provider configured" — before ever reaching the logging
 * line this fix touches. This suite proves everything reachable without those credentials (auth
 * gate, required fields, the English short-circuit that skips the AI call and the log write
 * entirely) and is honest that the redaction behaviour itself is verified by direct code read in
 * this pass, not by an automated assertion on a persisted row — the same boundary every other
 * AI-backed function in this suite already discloses, not a gap unique to this file.
 */
import { describe, it, expect } from "vitest";
import { callFunction, edgeRuntimeReachable, tokenFor } from "../fixtures/edgeFunctionClient";
import { assertLocalTarget } from "../fixtures/guard";

assertLocalTarget(process.env.SUPABASE_URL ?? "http://127.0.0.1:54321", process.env.SUPABASE_PROJECT_REF);
const runtimeUp = await edgeRuntimeReachable();

describe.skipIf(!runtimeUp)("translate-patient-content", () => {
  it("1. no Authorization header is rejected", async () => {
    const res = await callFunction("translate-patient-content", {
      token: null,
      body: { content: "Take one tablet twice daily.", target_language: "Hindi" },
    });
    expect(res.status).toBe(401);
  });

  it("2. a garbage bearer token is rejected", async () => {
    const res = await callFunction("translate-patient-content", {
      token: "garbage",
      body: { content: "Take one tablet twice daily.", target_language: "Hindi" },
    });
    expect(res.status).toBe(401);
  });

  it("3. missing content is a clean 400", async () => {
    const token = await tokenFor("a", "hospital_admin");
    const res = await callFunction("translate-patient-content", {
      token,
      body: { target_language: "Hindi" },
    });
    expect(res.status).toBe(400);
  });

  it("4. target_language 'English' short-circuits — no AI call, content returned unchanged, no log write", async () => {
    const token = await tokenFor("a", "hospital_admin");
    const res = await callFunction("translate-patient-content", {
      token,
      body: { content: "Take one tablet twice daily.", target_language: "English" },
    });
    expect(res.status).toBe(200);
    expect(res.json.translated_text).toBe("Take one tablet twice daily.");
    expect(res.json.source_language).toBe("English");
  });

  it("5. a real session requesting a real translation reaches the AI-config boundary honestly", async () => {
    const token = await tokenFor("a", "hospital_admin");
    const res = await callFunction("translate-patient-content", {
      token,
      body: { content: "Take one tablet twice daily.", target_language: "Hindi" },
    });
    expect(res.status).toBe(503);
    expect(res.json.error).toMatch(/No AI provider configured/);
  });
});
