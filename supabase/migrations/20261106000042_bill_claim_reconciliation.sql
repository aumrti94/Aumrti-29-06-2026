-- Phase 9, D2 (PHASED_TEST_PLAN.md — "bill.balance_due <-> claim outstanding is an enforced
-- invariant", ratified revenue-pod + Kavitha/CFO): bill.balance_due today is total-minus-payments
-- with no awareness of insurance_claims at all (confirmed directly in src/lib/billTotals.ts /
-- billMoney.ts before writing this migration), while the insurance desk computes its own
-- outstanding figure from the claims table. Two uncross-checked "how much are we owed" numbers
-- for the same admission is the condition under which a hospital dusts a patient for money the
-- insurer owes, or writes off money it is still owed.
--
-- Modeled directly on settlement_reconciliation_flags (20261008000118) — same flag-table shape,
-- new domain: that one reconciles Aumrti's own MRR against real Razorpay settlements; this one
-- reconciles a HOSPITAL's own bill against its real linked insurance claim, so RLS here is
-- hospital-scoped (get_user_hospital_id()), not aumrti_admin-scoped.
--
-- This is a monitoring/alerting check, not an auto-corrector — flags a divergence for a human to
-- resolve, never silently rewrites balance_due itself. A DB CHECK constraint was deliberately
-- not used (per the plan's own text): the two figures update on different cadences (a payment
-- posts immediately, a TPA reconciliation lands whenever the bank confirms it), so a hard
-- constraint would deadlock normal operation.

ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS claim_outstanding numeric(12,2);

COMMENT ON COLUMN public.bills.claim_outstanding IS
  'Populated by the nightly reconcile-bill-claim-balance job: claimed_amount - reconciled TPA payments, for a bill with a linked insurance_claims row. NULL/0 = no linked claim or nothing outstanding. Read via src/lib/billStatus.ts''s derivedBillStatus() for display — never hand-set by any UI action.';

CREATE TABLE IF NOT EXISTS public.bill_claim_reconciliation_flags (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id               uuid NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  claim_id              uuid NOT NULL REFERENCES public.insurance_claims(id) ON DELETE CASCADE,
  hospital_id           uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  expected_balance_due  numeric(12,2) NOT NULL,
  actual_balance_due    numeric(12,2) NOT NULL,
  discrepancy_amount    numeric(12,2) GENERATED ALWAYS AS (actual_balance_due - expected_balance_due) STORED,
  flagged_at            timestamptz NOT NULL DEFAULT now(),
  resolved_at           timestamptz,
  resolved_by           uuid REFERENCES public.users(id),
  resolution_note       text
);

CREATE INDEX IF NOT EXISTS idx_bill_claim_recon_unresolved
  ON public.bill_claim_reconciliation_flags (flagged_at DESC)
  WHERE resolved_at IS NULL;

-- One open flag per bill at a time — re-running the nightly job updates the existing open flag
-- (new expected/actual/discrepancy figures) rather than accumulating a fresh row every night the
-- divergence remains unresolved. Matches settlement_reconciliation_flags' own precedent exactly.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bill_claim_recon_bill_open
  ON public.bill_claim_reconciliation_flags (bill_id)
  WHERE resolved_at IS NULL;

ALTER TABLE public.bill_claim_reconciliation_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hospital_isolation_bill_claim_recon" ON public.bill_claim_reconciliation_flags;
CREATE POLICY "hospital_isolation_bill_claim_recon" ON public.bill_claim_reconciliation_flags
  FOR ALL TO authenticated
  USING (hospital_id = public.get_user_hospital_id())
  WITH CHECK (hospital_id = public.get_user_hospital_id());

-- Financial record, not PHI (no patient identifier or clinical content on this row — bill_id/
-- claim_id are opaque FKs) — no PHI audit trigger needed, same as settlement_reconciliation_flags.
