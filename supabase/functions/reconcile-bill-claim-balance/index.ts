/**
 * reconcile-bill-claim-balance
 *
 * Phase 9, D2 (PHASED_TEST_PLAN.md) — nightly check that
 * `bill.balance_due == patient_outstanding + claim_outstanding` for every bill with a linked,
 * still-active insurance claim. A monitoring check, not an auto-corrector: a divergence is
 * flagged into `bill_claim_reconciliation_flags` for a human to resolve, never used to silently
 * rewrite `balance_due` itself — the two figures update on different cadences (a payment posts
 * immediately, a TPA reconciliation lands whenever the bank confirms it), so a hard DB constraint
 * would deadlock normal operation, which is exactly why the plan calls for this instead of one.
 *
 * claim_outstanding = claimed_amount - SUM(insurance_payment_reconciliation.tpa_paid_amount
 *                                          WHERE reconciled = true)
 * patient_outstanding = patient_payable - SUM(bill_payments.amount
 *                                              WHERE payment_mode is patient-side, not insurer-side)
 * expected_balance_due = patient_outstanding + claim_outstanding
 *
 * "Active" claim statuses match insurance_claims_one_active_per_bill's own definition
 * (20261106000015) minus 'draft' — a draft claim was never submitted to the insurer, so there is
 * no real expected payment to reconcile against yet.
 *
 * Auth: service-role only, matching razorpay-settlement-reconcile's own precedent exactly — this
 * is a cron/manual platform-trigger function, never called from src/.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const ACTIVE_CLAIM_STATUSES = ["submitted", "under_review", "approved", "partially_approved"];
const INSURER_PAYMENT_MODES = ["insurance", "pmjay", "cghs", "echs"];

/** Divergences smaller than this are rounding noise (paisa-level), not a real discrepancy. */
const TOLERANCE = 1;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (req.headers.get("Authorization") !== `Bearer ${serviceKey}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    const { data: claims, error: claimsErr } = await sb
      .from("insurance_claims")
      .select("id, bill_id, hospital_id, claimed_amount, status")
      .in("status", ACTIVE_CLAIM_STATUSES);
    if (claimsErr) return json({ error: `Could not load active claims: ${claimsErr.message}` }, 500);

    let checked = 0;
    let flagged = 0;
    let resolved = 0;
    const errors: string[] = [];

    for (const claim of claims ?? []) {
      try {
        const [{ data: bill, error: billErr }, { data: reconciled, error: reconErr }, { data: payments, error: payErr }] =
          await Promise.all([
            sb.from("bills").select("id, hospital_id, patient_payable, balance_due").eq("id", claim.bill_id).maybeSingle(),
            sb.from("insurance_payment_reconciliation").select("tpa_paid_amount").eq("claim_id", claim.id).eq("reconciled", true),
            sb.from("bill_payments").select("amount, payment_mode").eq("bill_id", claim.bill_id),
          ]);
        if (billErr || !bill) { errors.push(`claim ${claim.id}: bill not found (${billErr?.message ?? "no row"})`); continue; }
        if (reconErr) { errors.push(`claim ${claim.id}: reconciliation lookup failed: ${reconErr.message}`); continue; }
        if (payErr) { errors.push(`claim ${claim.id}: payment lookup failed: ${payErr.message}`); continue; }

        const reconciledPaid = (reconciled ?? []).reduce((s, r) => s + (Number(r.tpa_paid_amount) || 0), 0);
        const claimOutstanding = Math.max(0, Number(claim.claimed_amount) - reconciledPaid);

        const patientPaid = (payments ?? [])
          .filter((p) => !INSURER_PAYMENT_MODES.includes(p.payment_mode))
          .reduce((s, p) => s + (Number(p.amount) || 0), 0);
        const patientOutstanding = Math.max(0, Number(bill.patient_payable) - patientPaid);

        const expectedBalanceDue = patientOutstanding + claimOutstanding;
        const actualBalanceDue = Number(bill.balance_due) || 0;

        // claim_outstanding is what derivedBillStatus() (src/lib/billStatus.ts) reads — written
        // regardless of whether this specific bill also gets flagged below.
        const { error: writeErr } = await sb.from("bills").update({ claim_outstanding: claimOutstanding }).eq("id", bill.id);
        if (writeErr) { errors.push(`claim ${claim.id}: could not write claim_outstanding: ${writeErr.message}`); continue; }

        checked++;

        const { data: openFlag } = await sb
          .from("bill_claim_reconciliation_flags")
          .select("id")
          .eq("bill_id", bill.id)
          .is("resolved_at", null)
          .maybeSingle();

        if (Math.abs(actualBalanceDue - expectedBalanceDue) > TOLERANCE) {
          const row = {
            bill_id: bill.id,
            claim_id: claim.id,
            hospital_id: claim.hospital_id ?? bill.hospital_id,
            expected_balance_due: expectedBalanceDue,
            actual_balance_due: actualBalanceDue,
          };
          if (openFlag) {
            const { error: updErr } = await sb.from("bill_claim_reconciliation_flags").update(row).eq("id", openFlag.id);
            if (updErr) errors.push(`claim ${claim.id}: could not update existing flag: ${updErr.message}`);
          } else {
            const { error: insErr } = await sb.from("bill_claim_reconciliation_flags").insert(row);
            if (insErr) errors.push(`claim ${claim.id}: could not insert flag: ${insErr.message}`);
          }
          flagged++;
        } else if (openFlag) {
          // The divergence that raised this flag has since resolved itself (a payment posted,
          // a reconciliation landed) — close it rather than leaving a stale flag for a
          // discrepancy that no longer exists.
          const { error: resolveErr } = await sb
            .from("bill_claim_reconciliation_flags")
            .update({ resolved_at: new Date().toISOString(), resolution_note: "Auto-resolved: figures now agree on a later run." })
            .eq("id", openFlag.id);
          if (resolveErr) errors.push(`claim ${claim.id}: could not auto-resolve flag: ${resolveErr.message}`);
          else resolved++;
        }
      } catch (perClaimErr) {
        errors.push(`claim ${claim.id}: ${perClaimErr instanceof Error ? perClaimErr.message : String(perClaimErr)}`);
      }
    }

    return json({ checked, flagged, resolved, errorCount: errors.length, errors: errors.slice(0, 20) });
  } catch (err) {
    console.error("reconcile-bill-claim-balance error:", err instanceof Error ? err.message : String(err));
    return json({ error: "Internal error" }, 500);
  }
});
