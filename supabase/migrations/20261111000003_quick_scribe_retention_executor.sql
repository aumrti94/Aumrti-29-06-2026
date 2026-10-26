-- Quick Scribe, round 3 (c): make the retention window a behaviour instead of a comment.
--
-- REQUIRES 20261111000001 TO HAVE BEEN APPLIED FIRST. That migration backfills every existing row
-- off the legacy 30-day default. Running this one against un-backfilled rows would delete every
-- note older than a month.
--
-- ── Why three paths ───────────────────────────────────────────────────────────────────────
--
-- pg_cron is the obvious home for a purge, and on this project it is the one thing that must not
-- be relied on alone. 20261008000097_schedule_pod_cron_jobs.sql carries a note from 2026-07-10
-- recording that pg_cron was NOT enabled, that the DB settings its cron bodies referenced were
-- never set, and that daily-leakage-scan, insurance-automation, depreciation_run and
-- budget_actuals "were very likely never running either". Nineteen migrations call cron.schedule.
-- purge_old_phi_audit() has existed since June 2026 with zero callers.
--
-- So this follows the three-trigger design 20261013000012:29-38 documents for itself:
--
--   1. sweep_quick_scribe_retention() — opportunistic, tenant-scoped, bounded, called from the
--      Quick Scribe screen on mount. An active clinic stays clean with no scheduler at all.
--   2. supabase/functions/quick-scribe-retention — a service-role endpoint, so an external
--      scheduler or a manual curl can run a full sweep. This is the path that actually works today.
--   3. The guarded cron block at the end — the safety net for a hospital that stops using the
--      feature, which paths 1 and 2 cannot cover.
--
-- Note the Vault guard is deliberately absent. Per the house rule stated at 20261108000004:388-391,
-- credential-free SQL RPCs belong in the SQL-RPC cron group rather than behind the Vault gate
-- "that silently skips ten other scheduling migrations". This schedules a plain SELECT, not an
-- authenticated HTTP call, so it needs no secret.
--
-- ── Why DELETE and not a soft delete ──────────────────────────────────────────────────────
--
-- The repo rule against dropping things protects schema and clinical history. This is the opposite
-- case: DPDP storage limitation means the data must actually be gone, and a row flagged is_deleted
-- while still holding the patient's name, address and consultation summary is not erasure. So past
-- the retention boundary the row is deleted outright, exactly as purge_old_ai_phi() does.
--
-- `is_deleted` survives for a future manual-suppression path and keeps the partial indexes valid;
-- nothing sets it today.

-- ── Full sweep. Service-role only. ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purge_quick_scribe_notes()
RETURNS TABLE (bucket text, affected_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  -- 1. Transcripts at 90 days. Blanked rather than nulled because transcript_text is NOT NULL
  --    (20261107000002:11); transcript_purged_at is what distinguishes redaction from absence.
  --    This runs FIRST so that a note which is also past its own boundary has its transcript
  --    cleared even if the row delete below were to fail partway.
  UPDATE public.quick_scribe_notes
  SET transcript_text      = '',
      transcript_purged_at = now()
  WHERE transcript_purged_at IS NULL
    AND transcript_text <> ''
    AND created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN QUERY SELECT 'transcripts_blanked'::text, v_n;

  -- 2. Notes past their own computed boundary — 8 years with medicines, 3 without, longer for
  --    a minor. See quick_scribe_purge_after() in 20261111000001.
  DELETE FROM public.quick_scribe_notes WHERE purge_after <= now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN QUERY SELECT 'notes_deleted'::text, v_n;

  -- 3. purge_old_phi_audit() has been defined and unscheduled since 20260628000003. The Quick
  --    Scribe lookup RPCs start writing search terms into phi_access_audit, so this feature is
  --    about to make that four-month-old gap materially worse. Wiring it in here costs nothing
  --    and is the only scheduled caller it has ever had.
  BEGIN
    SELECT public.purge_old_phi_audit() INTO v_n;
    RETURN QUERY SELECT 'phi_access_audit_deleted'::text, COALESCE(v_n, 0);
  EXCEPTION WHEN OTHERS THEN
    -- Never let the shared audit purge take the Quick Scribe purge down with it.
    RAISE WARNING 'purge_quick_scribe_notes: purge_old_phi_audit failed: %', SQLERRM;
    RETURN QUERY SELECT 'phi_access_audit_deleted'::text, -1;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_quick_scribe_notes() FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.purge_quick_scribe_notes() TO service_role;

COMMENT ON FUNCTION public.purge_quick_scribe_notes IS
  'Full Quick Scribe retention sweep: blanks transcripts at 90 days, deletes notes past '
  'purge_after, and runs the shared phi_access_audit purge. Service-role only — called by the '
  'quick-scribe-retention Edge Function and by pg_cron where it is enabled.';

-- ── Opportunistic sweep. Tenant-scoped, bounded, safe to grant. ───────────────────────────
-- SECURITY DEFINER because 20261111000002 removed UPDATE and DELETE from every ordinary role —
-- which is the point; this function is the controlled exception, and it can only ever touch rows
-- in the caller's own hospital that are already past their retention boundary.
--
-- LIMIT 500 so a hospital returning after a long gap cannot stall a doctor's page load behind a
-- six-figure delete. The remainder is caught on the next mount, or by path 2 or 3.
CREATE OR REPLACE FUNCTION public.sweep_quick_scribe_retention()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hospital_id uuid := public.get_user_hospital_id();
  v_n           integer;
  v_total       integer := 0;
BEGIN
  IF v_hospital_id IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.quick_scribe_notes
  SET transcript_text      = '',
      transcript_purged_at = now()
  WHERE id IN (
    SELECT id FROM public.quick_scribe_notes
    WHERE hospital_id = v_hospital_id
      AND transcript_purged_at IS NULL
      AND transcript_text <> ''
      AND created_at < now() - interval '90 days'
    LIMIT 500
  );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  DELETE FROM public.quick_scribe_notes
  WHERE id IN (
    -- Served by idx_quick_scribe_notes_purge (20261107000002:29), so the common case — nothing
    -- to do — is a single index scan.
    SELECT id FROM public.quick_scribe_notes
    WHERE hospital_id = v_hospital_id
      AND purge_after <= now()
    LIMIT 500
  );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_quick_scribe_retention() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sweep_quick_scribe_retention() TO authenticated;

COMMENT ON FUNCTION public.sweep_quick_scribe_retention IS
  'Bounded, tenant-scoped Quick Scribe retention sweep, called opportunistically from the Quick '
  'Scribe screen so an active clinic stays clean without any scheduler. Touches only the caller''s '
  'own hospital and only rows already past their retention boundary.';

-- ── Path 3: the safety net. ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE
      'pg_cron is not enabled — the scheduled Quick Scribe purge was NOT installed. Retention is '
      'still enforced on the opportunistic path (sweep_quick_scribe_retention, fired when a doctor '
      'opens the Quick Scribe screen) and via the quick-scribe-retention Edge Function, so an '
      'active hospital stays clean. What is missing is the safety net for a hospital that stops '
      'using the feature entirely. Enable pg_cron and re-run this migration, or point an external '
      'scheduler at the Edge Function.';
    RETURN;
  END IF;

  BEGIN PERFORM cron.unschedule('aumrti-quick-scribe-purge'); EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Daily rather than hourly: these boundaries are measured in years and months, so "within a
  -- day" is a defensible answer to a DPDP query and an hourly delete would buy nothing.
  PERFORM cron.schedule(
    'aumrti-quick-scribe-purge',
    '35 3 * * *',
    'SELECT public.purge_quick_scribe_notes();'
  );

  RAISE NOTICE 'Scheduled aumrti-quick-scribe-purge (daily, 03:35).';
END;
$$;
