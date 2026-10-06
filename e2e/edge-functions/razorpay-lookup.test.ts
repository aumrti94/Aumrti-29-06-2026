/**
 * Phase 10 (docs/testing/PHASED_TEST_PLAN.md) — razorpay-lookup.
 *
 * Pure regression coverage, no fix in this pass. Named in KNOWN-BUG-126's original Phase 4
 * cross-tenant audit (category (c) — "real user verified but never checked against the request's
 * hospital_id") and fixed there (2026-09-12): the caller's own `users.hospital_id` is checked
 * against the request's `hospital_id` before any Razorpay credential is loaded. Re-read directly
 * this pass, confirmed still intact — this file exists so a future edit can't silently reopen it.
 *
 * No real Razorpay credentials exist locally, so a genuine same-hospital lookup correctly
 * terminates at "Razorpay not configured for this hospital" — the real, correct local behaviour.
 */
import { describe, it, expect } from "vitest";
import { callFunction, edgeRuntimeReachable, tokenFor } from "../fixtures/edgeFunctionClient";
import { HOSPITAL_A, HOSPITAL_B } from "../fixtures/constants";
import { assertLocalTarget } from "../fixtures/guard";

assertLocalTarget(process.env.SUPABASE_URL ?? "http://127.0.0.1:54321", process.env.SUPABASE_PROJECT_REF);
const runtimeUp = await edgeRuntimeReachable();

describe.skipIf(!runtimeUp)("razorpay-lookup", () => {
  it("1. no Authorization header is rejected", async () => {
    const res = await callFunction("razorpay-lookup", {
      token: null,
      body: { payment_id: "pay_fixture123", hospital_id: HOSPITAL_A.id },
    });
    expect(res.status).toBe(401);
  });

  it("2. missing payment_id or hospital_id is a clean 400", async () => {
    const token = await tokenFor("a", "hospital_admin");
    const res = await callFunction("razorpay-lookup", { token, body: { hospital_id: HOSPITAL_A.id } });
    expect(res.status).toBe(400);
  });

  it("3. a real session naming a hospital it does not belong to is rejected — the KNOWN-BUG-126 regression", async () => {
    const token = await tokenFor("b", "hospital_admin");
    const res = await callFunction("razorpay-lookup", {
      token,
      body: { payment_id: "pay_fixture123", hospital_id: HOSPITAL_A.id },
    });
    expect(res.status).toBe(403);
  });

  it("4. a real session naming its own hospital reaches the Razorpay-config boundary honestly", async () => {
    const token = await tokenFor("a", "hospital_admin");
    const res = await callFunction("razorpay-lookup", {
      token,
      body: { payment_id: "pay_fixture123", hospital_id: HOSPITAL_A.id },
    });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/Razorpay not configured/);
  });
});
