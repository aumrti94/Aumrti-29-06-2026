-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: patient_credit_grants
-- Purpose  : "Pay Later" for OPD Laboratory and Radiology. A patient who cannot
--            pay at the counter can still have the test/scan ordered today; the
--            amount is recorded as owing against the patient and collected later
--            through the existing Pending Collections screen.
--
-- Design constraints (see docs/product/PATIENT_PAY_LATER_DESIGN.md for the full
-- brainstorm this v1 deliberately narrows down from):
--   * One row per bill (bill_id UNIQUE) — v1 does not support multiple grants
--     against the same bill. A second top-up requires a new bill.
--   * Append-only in practice: the application never UPDATEs or DELETEs a row
--     here. "Recovered" is not tracked as a second row — it is simply this
--     bill's balance_due reaching 0 through the ordinary bill_payments path.
--   * granted_by / approved_by reference public.users(id), never auth.users(id)
--     — the two diverge for every account created after migration
--     20260322111223 (see CLAUDE.md). Enforced by npm run check:user-fk.
--   * RLS uses public.get_user_hospital_id() — the current idiom (see
--     20261106000034 and siblings). The older
--     "hospital_id = (SELECT hospital_id FROM users WHERE id = auth.uid())"
--     pattern used by earlier tables (e.g. ipd_advances, 20260902000001) broke
--     silently once public.users.id and auth.uid() diverged; do not copy it.
--
-- Second half of this migration: extends the two day-closure lock triggers
-- from 20261008000152_draft_admission_bill_locked_day_exemption.sql. Without
-- this, a Pay-Later bill issued today becomes permanently uncollectable
-- ("Day is locked") the moment tonight's cash closure runs — a Pay-Later bill
-- has no admission_id, so the existing admission-only exemption never applies
-- to it, and unlike the admission case a Pay-Later bill IS bill_status='final'
-- from the moment it is created (there is no running/draft phase to keep it
-- in), so the exemption here is intentionally NOT conditioned on bill_status.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE, DROP TRIGGER IF EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.patient_credit_grants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id   uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  patient_id    uuid NOT NULL REFERENCES public.patients(id),
  bill_id       uuid NOT NULL UNIQUE REFERENCES public.bills(id) ON DELETE CASCADE,
  amount        numeric(12,2) NOT NULL CHECK (amount > 0),
  reason        text NOT NULL CHECK (length(trim(reason)) > 0),
  granted_by    uuid NOT NULL REFERENCES public.users(id),
  approved_by   uuid REFERENCES public.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_credit_grants_patient
  ON public.patient_credit_grants (patient_id, hospital_id);

CREATE INDEX IF NOT EXISTS idx_patient_credit_grants_bill
  ON public.patient_credit_grants (bill_id);

CREATE INDEX IF NOT EXISTS idx_patient_credit_grants_hospital_created
  ON public.patient_credit_grants (hospital_id, created_at);

ALTER TABLE public.patient_credit_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hospital_isolation_patient_credit_grants" ON public.patient_credit_grants;
CREATE POLICY "hospital_isolation_patient_credit_grants" ON public.patient_credit_grants
  FOR ALL
  USING (hospital_id = public.get_user_hospital_id())
  WITH CHECK (hospital_id = public.get_user_hospital_id());


-- ── lockedDay exemption: extend prevent_bill_on_locked_day ──
-- Adds a second, independent exemption branch alongside the existing
-- admission-running-bill one. A Pay-Later bill is identified purely by having
-- a row in patient_credit_grants — not by bill_status, since it is 'final'
-- from creation.

CREATE OR REPLACE FUNCTION public.prevent_bill_on_locked_day()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_bill_date  date;
  v_hosp_id    uuid;
  v_override   text;
BEGIN
  v_override := current_setting('app.cfo_override', true);
  IF v_override = 'true' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- Exemption 1: an admission's RUNNING bill, up until it is finalised.
  IF TG_OP = 'UPDATE'
     AND NEW.admission_id IS NOT NULL
     AND NEW.bill_status  NOT IN ('final', 'irn_locked', 'cancelled', 'refunded')
     AND NEW.bill_date    IS NOT DISTINCT FROM OLD.bill_date
     AND NEW.hospital_id  IS NOT DISTINCT FROM OLD.hospital_id
  THEN
    RETURN NEW;
  END IF;

  -- Exemption 2: a Pay-Later (patient credit) bill. Not conditioned on
  -- bill_status — the bill is 'final' from the moment it's created, and this
  -- exemption is what lets the eventual collect-payment UPDATE (paid_amount,
  -- balance_due, payment_status) through once the patient returns, however
  -- long after the issue day's closure that is. bill_date/hospital_id must
  -- still not be changing, same discipline as exemption 1.
  IF TG_OP = 'UPDATE'
     AND NEW.bill_date    IS NOT DISTINCT FROM OLD.bill_date
     AND NEW.hospital_id  IS NOT DISTINCT FROM OLD.hospital_id
     AND EXISTS (
       SELECT 1 FROM public.patient_credit_grants g WHERE g.bill_id = NEW.id
     )
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_bill_date := OLD.bill_date;
    v_hosp_id   := OLD.hospital_id;
  ELSE
    v_bill_date := NEW.bill_date;
    v_hosp_id   := NEW.hospital_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.daily_cash_closure
    WHERE hospital_id  = v_hosp_id
      AND closure_date = v_bill_date
      AND status       = 'locked'
  ) THEN
    RAISE EXCEPTION
      'Day % is locked (cash closure). Reopen it first: '
      'Billing → Day Closure → Reopen Day.',
      v_bill_date;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;$$;

DROP TRIGGER IF EXISTS trg_prevent_bill_on_locked_day ON public.bills;
CREATE TRIGGER trg_prevent_bill_on_locked_day
  BEFORE INSERT OR UPDATE OR DELETE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.prevent_bill_on_locked_day();


-- ── lockedDay exemption: extend prevent_payment_on_locked_bill_day ──
-- This is the trigger that actually fires when the patient returns to pay —
-- on the bill_payments INSERT recordBillPayment performs.

CREATE OR REPLACE FUNCTION public.prevent_payment_on_locked_bill_day()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_override     text;
  v_bill_date    date;
  v_hosp_id      uuid;
  v_bill_status  text;
  v_admission_id uuid;
BEGIN
  v_override := current_setting('app.cfo_override', true);
  IF v_override = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT bill_date, hospital_id, bill_status, admission_id
    INTO v_bill_date, v_hosp_id, v_bill_status, v_admission_id
  FROM public.bills
  WHERE id = NEW.bill_id;

  IF v_bill_date IS NULL THEN
    RETURN NEW;
  END IF;

  -- Exemption 1: collecting against an admission's running (un-finalised) bill.
  IF v_admission_id IS NOT NULL
     AND v_bill_status NOT IN ('final', 'irn_locked', 'cancelled', 'refunded')
  THEN
    RETURN NEW;
  END IF;

  -- Exemption 2: collecting against a Pay-Later (patient credit) bill. This is
  -- the fix — without it, a patient who took Pay-Later today cannot pay once
  -- tonight's closure locks, on any later date.
  IF EXISTS (
    SELECT 1 FROM public.patient_credit_grants g WHERE g.bill_id = NEW.bill_id
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.daily_cash_closure
    WHERE hospital_id  = COALESCE(NEW.hospital_id, v_hosp_id)
      AND closure_date = v_bill_date
      AND status       = 'locked'
  ) THEN
    RAISE EXCEPTION
      'Day % is locked (cash closure). Reopen the day before collecting a payment '
      'against this bill.', v_bill_date
      USING ERRCODE = 'raise_exception';
  END IF;

  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_prevent_payment_on_locked_bill_day ON public.bill_payments;
CREATE TRIGGER trg_prevent_payment_on_locked_bill_day
  BEFORE INSERT ON public.bill_payments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_payment_on_locked_bill_day();
