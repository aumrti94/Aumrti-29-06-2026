/**
 * Phase 10 (docs/testing/PHASED_TEST_PLAN.md) — invite-doctors.
 *
 * KNOWN-BUG-195's own writeup flagged this exact conflation here as a separate follow-up, never
 * done until this pass: `id: invited.user.id` set `public.users.id` to the auth uid and never
 * set `auth_user_id` at all. Since every RLS policy and `get_user_hospital_id()` resolve a
 * caller via `auth_user_id`, not `id` (migration 20260322111223), every doctor invited through
 * this path was permanently unresolvable anywhere else in the app — invited but functionally
 * locked out immediately, identical to the failure shape KNOWN-BUG-195/-196 already fixed on
 * `register-hospital`/`setup-hospital`. Also fixed in the same pass: the `users` insert's own
 * `error` was never checked at all, so a failed profile creation still reported "invited".
 */
import { describe, it, expect, afterAll } from "vitest";
import { callFunction, edgeRuntimeReachable, tokenFor } from "../fixtures/edgeFunctionClient";
import { serviceClient } from "../fixtures/serviceClient";
import { HOSPITAL_A } from "../fixtures/constants";
import { assertLocalTarget } from "../fixtures/guard";

assertLocalTarget(process.env.SUPABASE_URL ?? "http://127.0.0.1:54321", process.env.SUPABASE_PROJECT_REF);
const runtimeUp = await edgeRuntimeReachable();

const INVITED_EMAIL = "phase10-fixture-invited-doctor@example.test";

let adminToken = "";
if (runtimeUp) {
  adminToken = await tokenFor("a", "hospital_admin");
}

afterAll(async () => {
  if (!runtimeUp) return;
  const svc = serviceClient();
  const { data: userRow } = await svc.from("users").select("auth_user_id").eq("email", INVITED_EMAIL).maybeSingle();
  await svc.from("users").delete().eq("email", INVITED_EMAIL);
  if (userRow?.auth_user_id) await svc.auth.admin.deleteUser(userRow.auth_user_id as string);
});

describe.skipIf(!runtimeUp)("invite-doctors", () => {
  it("1. no Authorization header is rejected", async () => {
    const res = await callFunction("invite-doctors", { token: null, body: { emails: [INVITED_EMAIL] } });
    expect(res.status).toBe(401);
  });

  it("2. no emails provided is a clean 400", async () => {
    const res = await callFunction("invite-doctors", { token: adminToken, body: { emails: [] } });
    expect(res.status).toBe(400);
  });

  it("3. a genuine invite creates a public.users row with id DIFFERENT from auth_user_id — the exact invariant the bug violated, matching KNOWN-BUG-195/-196's own regression shape", async () => {
    const res = await callFunction("invite-doctors", {
      token: adminToken,
      body: { emails: [INVITED_EMAIL], hospital_id: HOSPITAL_A.id },
    });
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.results).toHaveLength(1);
    expect(res.json.results[0].status).toBe("invited");

    const svc = serviceClient();
    const { data: userRow, error } = await svc
      .from("users")
      .select("id, auth_user_id, hospital_id, role, is_active")
      .eq("email", INVITED_EMAIL)
      .maybeSingle();
    expect(error).toBeNull();
    expect(userRow).not.toBeNull();
    expect(userRow!.id).toBeTruthy();
    expect(userRow!.auth_user_id).toBeTruthy();
    // The actual regression assertion.
    expect(userRow!.id).not.toBe(userRow!.auth_user_id);
    expect(userRow!.hospital_id).toBe(HOSPITAL_A.id);
    expect(userRow!.role).toBe("doctor");
    expect(userRow!.is_active).toBe(true);

    // The real, load-bearing consequence of the fix: this invited doctor is now genuinely
    // resolvable the same way every RLS policy and get_user_hospital_id() resolve a caller.
    const { data: resolved } = await svc
      .from("users")
      .select("hospital_id")
      .eq("auth_user_id", userRow!.auth_user_id)
      .maybeSingle();
    expect(resolved?.hospital_id).toBe(HOSPITAL_A.id);
  });

  it("4. re-inviting the SAME email a second time reports an error rather than silently claiming success — whether Supabase Auth's own duplicate-invite check catches it first or the users-insert error-check added this pass does, this must never report 'invited' twice for one email", async () => {
    const res = await callFunction("invite-doctors", {
      token: adminToken,
      body: { emails: [INVITED_EMAIL], hospital_id: HOSPITAL_A.id },
    });
    expect(res.status).toBe(200);
    expect(res.json.results).toHaveLength(1);
    expect(res.json.results[0].status).toBe("error");
  });
});
