/**
 * Phase 10 (docs/testing/PHASED_TEST_PLAN.md) — admin-set-staff-password.
 *
 * Correctly built, zero prior coverage — found while scoping Phase 10. Real account-takeover-
 * adjacent surface: gates on caller role (hospital_admin/super_admin), then verifies the target
 * staff member belongs to the caller's own hospital before touching their auth credentials.
 * Confirmed correct by direct read; this file is the first coverage it has ever had.
 *
 * Uses a dedicated throwaway staff fixture (own auth account, own public.users row) rather than
 * a shared SEEDED_ROLES account — this test genuinely changes a login password, and reusing a
 * shared fixture account would break every other test in this suite that signs in as that role.
 */
import { describe, it, expect, afterAll } from "vitest";
import { callFunction, edgeRuntimeReachable, tokenFor } from "../fixtures/edgeFunctionClient";
import { serviceClient, tenantClient } from "../fixtures/serviceClient";
import { HOSPITAL_A, HOSPITAL_B } from "../fixtures/constants";
import { assertLocalTarget } from "../fixtures/guard";

assertLocalTarget(process.env.SUPABASE_URL ?? "http://127.0.0.1:54321", process.env.SUPABASE_PROJECT_REF);
const runtimeUp = await edgeRuntimeReachable();

const TARGET_ID = "a0000000-0000-4000-8000-e00000000501";
const TARGET_EMAIL = "admin-set-password-fixture@example.test";
const ORIGINAL_PASSWORD = "aumrti-e2e-local-only-original";
const NEW_PASSWORD = "aumrti-e2e-local-only-changed";

let targetAuthUserId = "";

if (runtimeUp) {
  const svc = serviceClient();
  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email: TARGET_EMAIL, password: ORIGINAL_PASSWORD, email_confirm: true,
  });
  if (createErr) throw new Error(`Could not create fixture staff auth user: ${createErr.message}`);
  targetAuthUserId = created.user!.id;

  await svc.from("users").insert({
    id: TARGET_ID, hospital_id: HOSPITAL_A.id, auth_user_id: targetAuthUserId,
    full_name: "Test Staff AdminSetPasswordFixture", email: TARGET_EMAIL, role: "nurse", is_active: true,
  } as never);
}

afterAll(async () => {
  if (!runtimeUp) return;
  const svc = serviceClient();
  await svc.from("users").delete().eq("id", TARGET_ID);
  if (targetAuthUserId) await svc.auth.admin.deleteUser(targetAuthUserId);
});

describe.skipIf(!runtimeUp)("admin-set-staff-password", () => {
  it("1. no Authorization header is rejected", async () => {
    const res = await callFunction("admin-set-staff-password", {
      token: null,
      body: { user_id: TARGET_ID, new_password: NEW_PASSWORD },
    });
    expect(res.status).toBe(401);
  });

  it("2. a non-admin caller (e.g. nurse) is rejected", async () => {
    const token = await tokenFor("a", "nurse");
    const res = await callFunction("admin-set-staff-password", {
      token,
      body: { user_id: TARGET_ID, new_password: NEW_PASSWORD },
    });
    expect(res.status).toBe(403);
  });

  it("3. missing user_id and both new_password/new_email is a clean 400", async () => {
    const token = await tokenFor("a", "hospital_admin");
    const res = await callFunction("admin-set-staff-password", { token, body: { user_id: TARGET_ID } });
    expect(res.status).toBe(400);
  });

  it("4. an admin from a DIFFERENT hospital cannot touch this staff member's credentials", async () => {
    const token = await tokenFor("b", "hospital_admin");
    const res = await callFunction("admin-set-staff-password", {
      token,
      body: { user_id: TARGET_ID, new_password: NEW_PASSWORD },
    });
    expect(res.status).toBe(403);
  });

  it("5. a genuine same-hospital admin action actually changes the login password", async () => {
    const token = await tokenFor("a", "hospital_admin");
    const res = await callFunction("admin-set-staff-password", {
      token,
      body: { user_id: TARGET_ID, new_password: NEW_PASSWORD },
    });
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);

    // Real verification, not just a 200: the old password no longer works, the new one does.
    await expect(tenantClient(TARGET_EMAIL, ORIGINAL_PASSWORD)).rejects.toThrow();
    const client = await tenantClient(TARGET_EMAIL, NEW_PASSWORD);
    const { data } = await client.auth.getSession();
    expect(data.session).not.toBeNull();
  });
});
