/**
 * Phase 10 (docs/testing/PHASED_TEST_PLAN.md) — trial-lifecycle-cron.
 *
 * KNOWN-BUG-258. Found while scoping Phase 10: this function's own header comment claimed
 * "service role key in header" enforcement, but nothing ever checked the bearer — the platform's
 * generic JWT verification (no override in config.toml) only proves the caller holds a
 * validly-signed project JWT, true of ANY authenticated user of any hospital, any role. Anyone
 * logged in could trigger a platform-wide sweep: suspend every expired-trial/past-due hospital,
 * send mass admin emails, expire discounts. Same defect class already closed on
 * `dunning-processor` (see dunning-processor.test.ts) — same fix, same regression shape.
 *
 * This sweeps ALL hospitals' `hospital_subscriptions` rows in one call, so — unlike a
 * per-hospital function — a genuine "does it suspend an expired trial" behavioural assertion
 * would race against every other subscription-lifecycle test file in this suite (dunning-
 * processor, razorpay-subscription-webhook, create-razorpay-subscription, change-subscription-
 * plan all mutate the same table concurrently). This file proves the actual fix under test — the
 * auth gate — and confirms the real secret still reaches a genuine, successful sweep, without
 * asserting on counts that depend on concurrent files' fixture state.
 */
import { describe, it, expect } from "vitest";
import { localSupabaseUrl, LOCAL_SERVICE_ROLE_KEY } from "../fixtures/serviceClient";
import { assertLocalTarget } from "../fixtures/guard";
import { edgeRuntimeReachable, tokenFor } from "../fixtures/edgeFunctionClient";

assertLocalTarget(process.env.SUPABASE_URL ?? "http://127.0.0.1:54321", process.env.SUPABASE_PROJECT_REF);
const runtimeUp = await edgeRuntimeReachable();

async function callTrialCron(auth: string | null) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth !== null) headers["Authorization"] = auth;
  const res = await fetch(`${localSupabaseUrl()}/functions/v1/trial-lifecycle-cron`, { method: "POST", headers });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, text, json };
}

describe.skipIf(!runtimeUp)("trial-lifecycle-cron", () => {
  it("1. no Authorization header is rejected — this is meant to be cron/service-role only", async () => {
    const res = await callTrialCron(null);
    expect(res.status).toBe(401);
  });

  it("2. an ordinary logged-in user's session JWT is rejected too — the regression test for the fix (platform JWT verification alone accepted any authenticated session)", async () => {
    const token = await tokenFor("a", "hospital_admin");
    const res = await callTrialCron(`Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("3. a forged/garbage bearer is rejected", async () => {
    const res = await callTrialCron("Bearer garbage-not-a-real-key");
    expect(res.status).toBe(401);
  });

  it("4. the real service-role secret is accepted and completes a genuine sweep", async () => {
    const res = await callTrialCron(`Bearer ${LOCAL_SERVICE_ROLE_KEY}`);
    expect(res.status).toBe(200);
    expect(res.json.status).toBe("done");
    expect(res.json.results).toHaveProperty("expired_suspended");
    expect(res.json.results).toHaveProperty("past_due_suspended");
  });
});
