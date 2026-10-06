/**
 * Phase 10 (docs/testing/PHASED_TEST_PLAN.md) — scan-invoice.
 *
 * KNOWN-BUG-129 (shared entry with scan-drug-list/scan-lab-tests) — originally logged in the
 * Phase 4 isolation audit as a lower-severity "burns AI budget" finding and deferred to Phase 9,
 * where it was never picked up. Re-read while scoping Phase 10: the deferral undersold it — there
 * was no caller verification of any kind, not even a session requirement, so `hospital_id` from
 * the request body was trusted purely to select whose AI vision quota/budget to spend. Any caller
 * naming a real hospital_id could burn that hospital's configured OCR budget indefinitely. Fixed
 * this pass on all three identically-shaped siblings: require a real session, and if a
 * hospital_id is named, verify the caller actually belongs to it.
 *
 * No real AI vision credentials (OpenAI/Claude/Gemini/Perplexity keys, or a hospital's own
 * platform_ai_keys config) exist in this local environment, so a genuinely authorized request
 * correctly terminates at "No AI provider configured" — the real, correct local behaviour,
 * matching every other AI-backed function in this suite, not a coverage gap.
 */
import { describe, it, expect } from "vitest";
import { callFunction, edgeRuntimeReachable, tokenFor } from "../fixtures/edgeFunctionClient";
import { HOSPITAL_A, HOSPITAL_B } from "../fixtures/constants";
import { assertLocalTarget } from "../fixtures/guard";

assertLocalTarget(process.env.SUPABASE_URL ?? "http://127.0.0.1:54321", process.env.SUPABASE_PROJECT_REF);
const runtimeUp = await edgeRuntimeReachable();

const TINY_IMAGE = "aGVsbG8="; // base64 "hello" — not a real image, just needs to be non-empty

describe.skipIf(!runtimeUp)("scan-invoice", () => {
  it("1. no Authorization header is rejected", async () => {
    const res = await callFunction("scan-invoice", {
      token: null,
      body: { base64Image: TINY_IMAGE, hospital_id: HOSPITAL_A.id },
    });
    expect(res.status).toBe(401);
  });

  it("2. a garbage bearer token is rejected", async () => {
    const res = await callFunction("scan-invoice", {
      token: "garbage",
      body: { base64Image: TINY_IMAGE, hospital_id: HOSPITAL_A.id },
    });
    expect(res.status).toBe(401);
  });

  it("3. a real session naming a hospital it does not belong to is rejected — the actual fix under test", async () => {
    const token = await tokenFor("b", "hospital_admin");
    const res = await callFunction("scan-invoice", {
      token,
      body: { base64Image: TINY_IMAGE, hospital_id: HOSPITAL_A.id },
    });
    expect(res.status).toBe(403);
  });

  it("4. a real session naming its own hospital reaches the AI-config boundary honestly", async () => {
    const token = await tokenFor("a", "hospital_admin");
    const res = await callFunction("scan-invoice", {
      token,
      body: { base64Image: TINY_IMAGE, hospital_id: HOSPITAL_A.id },
    });
    expect(res.status).toBe(503);
    expect(res.json.error).toMatch(/No AI provider configured/);
  });

  it("5. a real session with no hospital_id named still requires auth, then reaches the same boundary", async () => {
    const token = await tokenFor("a", "hospital_admin");
    const res = await callFunction("scan-invoice", { token, body: { base64Image: TINY_IMAGE } });
    expect(res.status).toBe(503);
  });

  it("6. missing base64Image is a clean error, not a raw stack trace", async () => {
    const token = await tokenFor("a", "hospital_admin");
    const res = await callFunction("scan-invoice", { token, body: { hospital_id: HOSPITAL_A.id } });
    expect(res.status).not.toBe(200);
    expect(res.text).not.toMatch(/at\s+\S+\s+\(.*:\d+:\d+\)/);
  });
});
