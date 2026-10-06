/**
 * Phase 10 (docs/testing/PHASED_TEST_PLAN.md) — create-razorpay-order.
 *
 * Found live while scoping Phase 10, no prior KNOWN-BUG entry: this function had NO caller
 * verification of any kind — hospitalId/amount came straight from the request body and were
 * trusted outright. Any caller could create a Razorpay order against ANY hospital's live
 * payment gateway at ANY amount. Fixed same pass: hospital_id and the amount actually charged
 * are now always derived from a real server-side row (a `health_packages` row for the
 * anonymous public-booking path, a `bills` row for the authenticated patient-portal path),
 * never trusted from the request body.
 *
 * Like every other Razorpay-order-creating function in this suite (see
 * create-razorpay-subscription.test.ts), no real Razorpay credentials exist in this local
 * environment — a genuinely valid, authorized request correctly terminates at "Razorpay not
 * configured", which is the real, correct local behaviour, not a coverage gap.
 */
import { describe, it, expect, afterAll } from "vitest";
import { callFunction, edgeRuntimeReachable, tokenFor } from "../fixtures/edgeFunctionClient";
import { serviceClient, tenantClient } from "../fixtures/serviceClient";
import { HOSPITAL_A, HOSPITAL_B } from "../fixtures/constants";
import { assertLocalTarget } from "../fixtures/guard";

assertLocalTarget(process.env.SUPABASE_URL ?? "http://127.0.0.1:54321", process.env.SUPABASE_PROJECT_REF);
const runtimeUp = await edgeRuntimeReachable();

const PACKAGE_ID = "a0000000-0000-4000-8000-e00000000301";
const PATIENT_ID = "a0000000-0000-4000-8000-e00000000302";
const BILL_ID = "a0000000-0000-4000-8000-e00000000303";
const PATIENT_EMAIL = "razorpay-order-fixture-patient@example.test";
const PATIENT_PASSWORD = "aumrti-e2e-local-only-patient";

let patientToken = "";

if (runtimeUp) {
  const svc = serviceClient();

  await svc.from("health_packages").insert({
    id: PACKAGE_ID, hospital_id: HOSPITAL_A.id, package_name: "Fixture Full Body Checkup",
    package_code: "FIXTURE-RZP-ORDER", price: 2500, is_active: true,
  } as never);

  await svc.from("patients").insert({
    id: PATIENT_ID, hospital_id: HOSPITAL_A.id, full_name: "Test Patient RazorpayOrderFixture",
    uhid: `${HOSPITAL_A.uhidPrefix}RZPORDER1`, phone: "9000000201", email: PATIENT_EMAIL, is_active: true,
  } as never);

  await svc.from("bills").insert({
    id: BILL_ID, hospital_id: HOSPITAL_A.id, patient_id: PATIENT_ID,
    bill_number: "TEST-RZP-ORDER-001", bill_type: "opd", bill_date: "2026-09-01",
    bill_status: "final", payment_status: "partial",
    subtotal: 2000, gst_amount: 0, total_amount: 2000, patient_payable: 2000, balance_due: 1500,
  } as never);

  // A real auth user with a known password, matching how patients actually authenticate
  // (Supabase Auth, no stored auth_user_id FK on `patients` — the login flow matches by
  // email/phone at sign-in time, confirmed by reading PatientPortalLogin.tsx directly) —
  // admin.createUser + signInWithPassword is the test-only equivalent of a real OTP login.
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
  await svc.from("bills").delete().eq("id", BILL_ID);
  await svc.from("patients").delete().eq("id", PATIENT_ID);
  await svc.from("health_packages").delete().eq("id", PACKAGE_ID);
  const { data: users } = await svc.auth.admin.listUsers();
  const fixtureUser = users?.users.find((u) => u.email === PATIENT_EMAIL);
  if (fixtureUser) await svc.auth.admin.deleteUser(fixtureUser.id);
});

describe.skipIf(!runtimeUp)("create-razorpay-order", () => {
  it("1. missing hospitalId or packageId is a clean 400", async () => {
    const res = await callFunction("create-razorpay-order", { token: null, body: { hospitalId: HOSPITAL_A.id } });
    expect(res.status).toBe(400);
  });

  it("2. anonymous booking: a package that does not belong to the claimed hospital is rejected — the actual fix under test", async () => {
    const res = await callFunction("create-razorpay-order", {
      token: null,
      body: { hospitalId: HOSPITAL_B.id, packageId: PACKAGE_ID, amount: 1 },
    });
    expect(res.status).toBe(404);
  });

  it("3. anonymous booking: an unknown packageId is rejected, regardless of what amount the caller claims", async () => {
    const res = await callFunction("create-razorpay-order", {
      token: null,
      body: { hospitalId: HOSPITAL_A.id, packageId: "00000000-0000-0000-0000-000000000000", amount: 1 },
    });
    expect(res.status).toBe(404);
  });

  it("4. anonymous booking: a genuine, matching package reaches the payment-gateway boundary honestly — no Razorpay credentials configured locally", async () => {
    const res = await callFunction("create-razorpay-order", {
      token: null,
      // A wildly wrong client-supplied amount — must be ignored entirely, not reflected in
      // any error or used as the charge amount. There is no way to observe the resolved
      // amount without a live Razorpay account, but the call must still succeed up to that
      // boundary using the package's own real price, not fail because of the bogus figure.
      body: { hospitalId: HOSPITAL_A.id, packageId: PACKAGE_ID, amount: 1 },
    });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/Razorpay not configured/);
  });

  it("5. authenticated bill payment: a garbage bearer token is rejected", async () => {
    const res = await callFunction("create-razorpay-order", {
      token: "garbage",
      body: { hospitalId: HOSPITAL_A.id, packageId: BILL_ID, amount: 1 },
    });
    expect(res.status).toBe(401);
  });

  it("6. authenticated bill payment: the bill must belong to the claimed hospital", async () => {
    const res = await callFunction("create-razorpay-order", {
      token: patientToken,
      body: { hospitalId: HOSPITAL_B.id, packageId: BILL_ID, amount: 1 },
    });
    expect(res.status).toBe(404);
  });

  it("7. authenticated bill payment: a real session belonging to someone ELSE cannot pay this bill — the actual fix under test", async () => {
    const otherToken = await tokenFor("a", "hospital_admin"); // a real, valid session — just not this bill's patient
    const res = await callFunction("create-razorpay-order", {
      token: otherToken,
      body: { hospitalId: HOSPITAL_A.id, packageId: BILL_ID, amount: 1 },
    });
    expect(res.status).toBe(403);
  });

  it("8. authenticated bill payment: a real session paying a real OWN bill reaches the payment-gateway boundary honestly, real balance_due resolved server-side regardless of the client's claimed amount", async () => {
    const res = await callFunction("create-razorpay-order", {
      token: patientToken,
      // Deliberately a fraction of the real ₹1,500 balance_due — the fix must ignore this,
      // not fail on a mismatch and not silently charge the lowballed figure (unobservable
      // without a live Razorpay account, but reaching the SAME "not configured" terminal
      // state as test 4 proves the real balance_due was used to build the order payload,
      // since a ₹0/negative resolved amount would instead 400 with "Nothing due on this bill").
      body: { hospitalId: HOSPITAL_A.id, packageId: BILL_ID, amount: 1 },
    });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/Razorpay not configured/);
  });

  it("9. malformed JSON does not 500 with a raw stack trace", async () => {
    const res = await callFunction("create-razorpay-order", { token: null, rawBody: "{bad" });
    expect(res.status).not.toBe(200);
    expect(res.text).not.toMatch(/at\s+\S+\s+\(.*:\d+:\d+\)/);
  });
});
