-- Phase 9, Part 8 (docs/testing/PHASED_TEST_PLAN.md) — transfer-out discharge, full build.
-- discharge_type already allows 'transfer' (20260904000021) but nothing about the actual
-- transfer — receiving facility, accepting doctor, reason, billing waiver — has ever been
-- captured anywhere. Same billing-waiver mechanism as LAMA (20261008000050's
-- lama_billing_ack_by/at): a patient being moved to a higher-care facility should not be
-- blocked by an outstanding balance, but the waiver itself is a documented, audited action,
-- never a silent bypass.
--
-- Plain columns on admissions, matching the LAMA precedent's own shape, rather than a new
-- table — a fixed, modest field set for one discharge type, not a growing record.

ALTER TABLE public.admissions
  ADD COLUMN IF NOT EXISTS transfer_receiving_facility_name text,
  ADD COLUMN IF NOT EXISTS transfer_receiving_facility_address text,
  ADD COLUMN IF NOT EXISTS transfer_receiving_facility_contact text,
  ADD COLUMN IF NOT EXISTS transfer_accepting_doctor_name text,
  ADD COLUMN IF NOT EXISTS transfer_reason text,
  ADD COLUMN IF NOT EXISTS transfer_billing_ack_by uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS transfer_billing_ack_at timestamptz;

COMMENT ON COLUMN public.admissions.transfer_billing_ack_by IS
  'Set only when discharge_type = ''transfer'' and billing was not cleared — the same documented-waiver pattern as lama_billing_ack_by/at, never set silently.';
