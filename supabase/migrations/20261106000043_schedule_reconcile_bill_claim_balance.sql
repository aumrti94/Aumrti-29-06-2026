-- ============================================================
-- Schedule reconcile-bill-claim-balance (nightly) — Phase 9, D2
-- ============================================================
-- Same Vault-lookup pattern as every other HTTP-triggered cron job in this project
-- (20261008000100_cron_jobs_use_vault.sql) — no literal credentials in this committed file.
-- Requires the aumrti_service_role_key Vault secret to already exist.
-- Runs nightly at 01:00 UTC — before daily-leakage-scan (00:30 UTC) finishes but staggered
-- from insurance-deadline-check (every 4h) and the weekly settlement reconcile (Wed 03:00 UTC).
-- ============================================================

DO $$
DECLARE
  fn_url text := 'https://pdxvisvmnzjhsgmvygku.supabase.co';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not enabled — skipping reconcile-bill-claim-balance schedule.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'aumrti_service_role_key') THEN
    RAISE NOTICE 'aumrti_service_role_key not found in Vault — run vault.create_secret(...) first, then re-run this migration.';
    RETURN;
  END IF;

  BEGIN
    PERFORM cron.unschedule('reconcile-bill-claim-balance');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- job didn't exist yet, nothing to unschedule
  END;

  PERFORM cron.schedule(
    'reconcile-bill-claim-balance',
    '0 1 * * *', -- nightly, 01:00 UTC
    format(
      $sql$SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'aumrti_service_role_key')),
        body := '{}'::jsonb
      );$sql$,
      fn_url || '/functions/v1/reconcile-bill-claim-balance'
    )
  );

  RAISE NOTICE 'Scheduled reconcile-bill-claim-balance (nightly, 01:00 UTC).';
END;
$$;
