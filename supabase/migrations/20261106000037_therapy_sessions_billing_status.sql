-- Found while escalating KNOWN-BUG-222 (docs/testing/KNOWN_BUGS.md) to revenue-pod for a
-- go-live revenue-exposure assessment (2026-09-18).
--
-- WHY. `MHTherapyTab.tsx` passes sourceTable: "therapy_sessions" to autoChargeService, exactly
-- like MortuaryPage.tsx does for mortuary_admissions (KNOWN-BUG-223). Before this phase's
-- bills_bill_type_check fix (20261106000030), it didn't matter — every mental-health charge
-- attempt failed at the CHECK constraint regardless, so the missing idempotency guard was
-- invisible. Now that the constraint allows "mentalhealth" as a bill_type, mental-health
-- billing can actually succeed — with autoChargeService's own idempotency guard reading
-- `billing_status` off a column that doesn't exist, so it can never see anything but "not yet
-- billed." A retried or duplicated therapy-session save can now double-charge a patient, a risk
-- that did not exist before this same phase's own fix unblocked the CHECK constraint.
--
-- Same pattern as 20261106000031_mortuary_admissions_billing_status.sql and the original
-- lab_orders/radiology_orders convention (20260516000001).

ALTER TABLE public.therapy_sessions
  ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'unbilled'
    CHECK (billing_status IN ('unbilled', 'billed', 'waived')),
  ADD COLUMN IF NOT EXISTS bill_id uuid REFERENCES public.bills(id),
  ADD COLUMN IF NOT EXISTS billed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_therapy_sessions_billing_status
  ON public.therapy_sessions(hospital_id, billing_status);
