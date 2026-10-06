/**
 * Phase 9, D2 (PHASED_TEST_PLAN.md) — reconcile-bill-claim-balance.
 *
 * Internal-only, same "exact service-role secret required" shape as abdm-gateway-token/
 * razorpay-settlement-reconcile — this is a cron/manual platform trigger, never called from
 * src/. Three real scenarios, not just auth: figures agree (no flag), figures diverge (a flag
 * raised with the correct discrepancy_amount, matching the actual - expected direction the
 * schema's own GENERATED column defines), and a still-open flag on a later run updates rather
 * than duplicates (one open flag per bill, matching settlement_reconciliation_flags' own
 * precedent) — plus the flag auto-resolving once the bill's own balance_due is corrected.
 */
import { describe, it, expect, afterAll } from "vitest";
import { localSupabaseUrl, serviceClient, LOCAL_SERVICE_ROLE_KEY } from "../fixtures/serviceClient";
import { HOSPITAL_A, PATIENTS_A } from "../fixtures/constants";
import { assertLocalTarget } from "../fixtures/guard";
import { edgeRuntimeReachable, tokenFor } from "../fixtures/edgeFunctionClient";

assertLocalTarget(process.env.SUPABASE_URL ?? "http://127.0.0.1:54321", process.env.SUPABASE_PROJECT_REF);
const runtimeUp = await edgeRuntimeReachable();

const BILL_MATCHED = "a0000000-0000-4000-8000-b00000000101";
const BILL_DIVERGED = "a0000000-0000-4000-8000-b00000000102";
const CLAIM_MATCHED = "a0000000-0000-4000-8000-b00000000201";
const CLAIM_DIVERGED = "a0000000-0000-4000-8000-b00000000202";

async function callReconcile(auth: string | null) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth !== null) headers["Authorization"] = auth;
  const res = await fetch(`${localSupabaseUrl()}/functions/v1/reconcile-bill-claim-balance`, { method: "POST", headers });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text };
}

if (runtimeUp) {
  const svc = serviceClient();

  // Matched bill: claim fully reconciled, patient has paid the rest — balance_due already
  // agrees with expected, so this bill should never be flagged across any test below.
  await svc.from("bills").insert({
    id: BILL_MATCHED, hospital_id: HOSPITAL_A.id, patient_id: PATIENTS_A[0].id,
    bill_number: "TEST-D2-MATCHED-A1", bill_type: "ipd", bill_date: "2026-09-01",
    bill_status: "final", payment_status: "partial",
    subtotal: 50000, gst_amount: 0, total_amount: 50000, patient_payable: 50000,
    balance_due: 40000,
  } as never);
  await svc.from("insurance_claims").insert({
    id: CLAIM_MATCHED, hospital_id: HOSPITAL_A.id, bill_id: BILL_MATCHED, patient_id: PATIENTS_A[0].id,
    tpa_name: "Phase9 Fixture TPA", claimed_amount: 40000, status: "submitted",
  } as never);
  await svc.from("insurance_payment_reconciliation").insert({
    hospital_id: HOSPITAL_A.id, claim_id: CLAIM_MATCHED,
    tpa_paid_amount: 40000, hospital_claimed_amount: 40000, reconciled: true,
  } as never);
  await svc.from("bill_payments").insert({
    hospital_id: HOSPITAL_A.id, bill_id: BILL_MATCHED, payment_mode: "cash", amount: 10000,
  } as never);

  // Diverged bill: claim only partly reconciled (₹15,000 still outstanding from the insurer),
  // but balance_due was never updated to reflect that — expected 55000, actual 40000.
  await svc.from("bills").insert({
    id: BILL_DIVERGED, hospital_id: HOSPITAL_A.id, patient_id: PATIENTS_A[0].id,
    bill_number: "TEST-D2-DIVERGED-A1", bill_type: "ipd", bill_date: "2026-09-01",
    bill_status: "final", payment_status: "partial",
    subtotal: 50000, gst_amount: 0, total_amount: 50000, patient_payable: 50000,
    balance_due: 40000,
  } as never);
  await svc.from("insurance_claims").insert({
    id: CLAIM_DIVERGED, hospital_id: HOSPITAL_A.id, bill_id: BILL_DIVERGED, patient_id: PATIENTS_A[0].id,
    tpa_name: "Phase9 Fixture TPA", claimed_amount: 40000, status: "submitted",
  } as never);
  await svc.from("insurance_payment_reconciliation").insert({
    hospital_id: HOSPITAL_A.id, claim_id: CLAIM_DIVERGED,
    tpa_paid_amount: 25000, hospital_claimed_amount: 40000, reconciled: true,
  } as never);
  await svc.from("bill_payments").insert({
    hospital_id: HOSPITAL_A.id, bill_id: BILL_DIVERGED, payment_mode: "cash", amount: 10000,
  } as never);
}

afterAll(async () => {
  if (!runtimeUp) return;
  const svc = serviceClient();
  await svc.from("bill_claim_reconciliation_flags").delete().in("bill_id", [BILL_MATCHED, BILL_DIVERGED]);
  await svc.from("bill_payments").delete().in("bill_id", [BILL_MATCHED, BILL_DIVERGED]);
  await svc.from("insurance_payment_reconciliation").delete().in("claim_id", [CLAIM_MATCHED, CLAIM_DIVERGED]);
  await svc.from("insurance_claims").delete().in("id", [CLAIM_MATCHED, CLAIM_DIVERGED]);
  await svc.from("bills").delete().in("id", [BILL_MATCHED, BILL_DIVERGED]);
});

describe.skipIf(!runtimeUp)("reconcile-bill-claim-balance", () => {
  it("1. no Authorization header is rejected — this is internal-only", async () => {
    const res = await callReconcile(null);
    expect(res.status).toBe(401);
  });

  it("2. an ordinary logged-in user's own session JWT is rejected too — not just any authenticated caller", async () => {
    const token = await tokenFor("a", "hospital_admin");
    const res = await callReconcile(`Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("3. figures that already agree are never flagged, and claim_outstanding is still written", async () => {
    const res = await callReconcile(`Bearer ${LOCAL_SERVICE_ROLE_KEY}`);
    expect(res.status).toBe(200);
    expect(res.json.checked).toBeGreaterThan(0);

    const svc = serviceClient();
    const { data: bill } = await svc.from("bills").select("claim_outstanding").eq("id", BILL_MATCHED).maybeSingle();
    expect(Number(bill?.claim_outstanding)).toBe(0);

    const { data: flags } = await svc.from("bill_claim_reconciliation_flags").select("id").eq("bill_id", BILL_MATCHED);
    expect(flags ?? []).toHaveLength(0);
  });

  it("4. a genuine divergence is flagged with the correct expected/actual/discrepancy figures", async () => {
    const res = await callReconcile(`Bearer ${LOCAL_SERVICE_ROLE_KEY}`);
    expect(res.status).toBe(200);
    expect(res.json.flagged).toBeGreaterThan(0);

    const svc = serviceClient();
    const { data: bill } = await svc.from("bills").select("claim_outstanding").eq("id", BILL_DIVERGED).maybeSingle();
    expect(Number(bill?.claim_outstanding)).toBe(15000); // 40000 claimed - 25000 reconciled

    const { data: flags, error } = await svc
      .from("bill_claim_reconciliation_flags")
      .select("expected_balance_due, actual_balance_due, discrepancy_amount, resolved_at")
      .eq("bill_id", BILL_DIVERGED);
    expect(error).toBeNull();
    expect(flags).toHaveLength(1);
    expect(Number(flags![0].expected_balance_due)).toBe(55000); // 40000 patient_outstanding + 15000 claim_outstanding
    expect(Number(flags![0].actual_balance_due)).toBe(40000);
    expect(Number(flags![0].discrepancy_amount)).toBe(-15000); // actual - expected
    expect(flags![0].resolved_at).toBeNull();
  });

  it("5. running again while still diverged updates the existing open flag rather than duplicating it", async () => {
    await callReconcile(`Bearer ${LOCAL_SERVICE_ROLE_KEY}`);
    await callReconcile(`Bearer ${LOCAL_SERVICE_ROLE_KEY}`);

    const svc = serviceClient();
    const { data: flags } = await svc.from("bill_claim_reconciliation_flags").select("id").eq("bill_id", BILL_DIVERGED);
    expect(flags).toHaveLength(1); // still one, not three
  });

  it("6. correcting the bill's own balance_due auto-resolves the flag on the next run", async () => {
    const svc = serviceClient();
    // Simulate a biller correcting the bill by hand to the figure the reconciliation itself
    // expects — the divergence this flag exists for no longer holds.
    await svc.from("bills").update({ balance_due: 55000 }).eq("id", BILL_DIVERGED);

    const res = await callReconcile(`Bearer ${LOCAL_SERVICE_ROLE_KEY}`);
    expect(res.status).toBe(200);
    expect(res.json.resolved).toBeGreaterThan(0);

    const { data: flags } = await svc.from("bill_claim_reconciliation_flags").select("resolved_at").eq("bill_id", BILL_DIVERGED);
    expect(flags).toHaveLength(1);
    expect(flags![0].resolved_at).not.toBeNull();
  });
});
