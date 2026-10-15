-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Correction: MLC police intimation clock is 6 hours, not 24
--
-- 20261106000036 built the server-enforced "notify police within N hours of MLC designation"
-- clock, but hardcoded N = 24h. That number was copy-pasted from an unrelated precedent —
-- `insurance_intimation_trigger` (20260518000004), a 24h IRDAI/TPA intimation clock, a different
-- statutory obligation to a different party — and was never re-derived for the police-intimation
-- obligation it was actually being used for.
--
-- Saroja (security-pod, MRD/MLC governance) has ruled definitively: the statutory window for
-- notifying police of an MLC designation is 6 HOURS, not 24. This migration corrects the default,
-- the alert wording, and backfills every currently-open case so none of them silently continue
-- running on the wrong clock.
--
-- Per this repo's idempotent-migration rule, 20261106000036 is never edited or dropped — this is
-- a new migration that corrects it going forward via ALTER COLUMN / CREATE OR REPLACE, plus a
-- one-time, safely-rerunnable backfill of rows still in flight.
--
-- NOT DONE HERE, per Saroja's ruling: no new column on mlc_cases. mlc_flagged_at is native to
-- mlc_police_notifications itself, populated identically at insert time regardless of which of
-- the three source tables (admissions, ed_visits, mortuary_admissions) triggered the row — no
-- join required. It is already the canonical MLC-designation timestamp; duplicating it onto
-- mlc_cases would reintroduce exactly the kind of redundant, driftable data this consolidation
-- effort exists to kill.
-- ═════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Default for new rows: 6h from mlc_flagged_at (both DEFAULT now()), not 24h.
--    ALTER COLUMN ... SET DEFAULT is inherently idempotent/safe to rerun.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.mlc_police_notifications
  ALTER COLUMN notification_deadline SET DEFAULT (now() + interval '6 hours');

COMMENT ON COLUMN public.mlc_police_notifications.notification_deadline IS
  'Statutory deadline for confirming police have been informed of an MLC designation: 6 hours '
  'from mlc_flagged_at, per Saroja''s (security-pod, MRD/MLC governance) ruling. Corrected by '
  '20261108000006 from an erroneous 24h default that 20261106000036 copy-pasted from the '
  'unrelated insurance_intimation_trigger (IRDAI/TPA, 24h, a different obligation to a different '
  'party) without re-deriving the number for this one.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. The overdue-alert message text said "24h deadline passed" — wrong SLA in the alert itself,
--    independent of what the deadline column actually enforced. CREATE OR REPLACE FUNCTION with
--    the message corrected; nothing else in the function body changes.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_mlc_deadlines()
RETURNS void LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM public.mlc_police_notifications
    WHERE status = 'pending' AND notification_deadline < now() AND NOT deadline_alert_fired
  LOOP
    INSERT INTO public.clinical_alerts (hospital_id, patient_id, alert_type, severity, alert_message, dedupe_key)
    VALUES (
      r.hospital_id, r.patient_id, 'mlc_police_notification_overdue', 'critical',
      format('MLC police notification overdue — flagged %s, 6h deadline passed, police not yet confirmed informed.', r.mlc_flagged_at),
      r.id::text
    )
    ON CONFLICT (hospital_id, alert_type, dedupe_key) DO NOTHING;

    UPDATE public.mlc_police_notifications SET deadline_alert_fired = true WHERE id = r.id;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. Backfill, urgent: every row still 'pending' was inserted under the old 24h default and
--    carries a notification_deadline 18 hours later than it should be. Recomputed deterministically
--    from mlc_flagged_at (the canonical designation timestamp), so this is safe to rerun — running
--    it twice is a no-op the second time. deadline_alert_fired is left untouched: it only ever
--    reflects whether the overdue alert has already been raised for that row, which stays true
--    regardless of which deadline value made it overdue, and the next pg_cron sweep (every 30
--    min, per check_mlc_deadlines above) picks up any row whose recomputed deadline has now
--    newly passed and deadline_alert_fired is still false.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

UPDATE public.mlc_police_notifications
SET notification_deadline = mlc_flagged_at + interval '6 hours'
WHERE status = 'pending';

COMMIT;
