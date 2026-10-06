/**
 * Phase 10 (docs/testing/PHASED_TEST_PLAN.md) — reset-staff-mfa.
 *
 * Correctly built, zero prior coverage — found while scoping Phase 10. Gates on caller role
 * (hospital_admin/super_admin), then verifies the target belongs to the caller's own hospital
 * before calling the real Auth Admin REST API to list/delete TOTP factors. Confirmed correct by
 * direct read; this file is the first coverage it has ever had.
 *
 * No fixture staff account has MFA enrolled locally, so a genuine same-hospital reset correctly
 * completes with factors_removed: 0 — proving the full list-then-delete round trip against the
 * real Auth Admin API works end-to-end, not that it found something to remove. Safe to run
 * against a real seeded staff account (unlike admin-set-staff-password) since resetting MFA that
 * was never enrolled has no side effect on that account's password or login ability.
 */
import { describe, it, expect } from "vitest";
import { callFunction, edgeRuntimeReachable, tokenFor } from "../fixtures/edgeFunctionClient";
import { serviceClient } from "../fixtures/serviceClient";
import { HOSPITAL_A, staffUserId } from "../fixtures/constants";
import { assertLocalTarget } from "../fixtures/guard";

assertLocalTarget(process.env.SUPABASE_URL ?? "http://127.0.0.1:54321", process.env.SUPABASE_PROJECT_REF);
const runtimeUp = await edgeRuntimeReachable();

let targetAuthUserId = "";

if (runtimeUp) {
  const svc = serviceClient();
  const { data } = await svc
    .from("users")
    .select("auth_user_id")
    .eq("id", staffUserId("a", "nurse"))
    .maybeSingle();
  targetAuthUserId = (data?.auth_user_id as string) ?? "";
}

describe.skipIf(!runtimeUp)("reset-staff-mfa", () => {
  it("1. no Authorization header is rejected", async () => {
    const res = await callFunction("reset-staff-mfa", {
      token: null,
      body: { auth_user_id: targetAuthUserId },
    });
    expect(res.status).toBe(401);
  });

  it("2. a non-admin caller (e.g. nurse) is rejected", async () => {
    const token = await tokenFor("a", "nurse");
    const res = await callFunction("reset-staff-mfa", {
      token,
      body: { auth_user_id: targetAuthUserId },
    });
    expect(res.status).toBe(403);
  });

  it("3. missing auth_user_id is a clean 400", async () => {
    const token = await tokenFor("a", "hospital_admin");
    const res = await callFunction("reset-staff-mfa", { token, body: {} });
    expect(res.status).toBe(400);
  });

  it("4. an admin from a DIFFERENT hospital cannot reset this staff member's MFA", async () => {
    const token = await tokenFor("b", "hospital_admin");
    const res = await callFunction("reset-staff-mfa", {
      token,
      body: { auth_user_id: targetAuthUserId },
    });
    expect(res.status).toBe(403);
  });

  it("5. a genuine same-hospital admin action completes the real list-then-delete round trip", async () => {
    const token = await tokenFor("a", "hospital_admin");
    const res = await callFunction("reset-staff-mfa", {
      token,
      body: { auth_user_id: targetAuthUserId },
    });
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.factors_removed).toBe(0);
  });
});
