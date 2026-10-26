-- Drops an untracked draft that was applied directly to the live database and never committed
-- to this repo, discovered as drift while pushing the Quick Scribe migrations behind it in the
-- queue — unrelated to Quick Scribe itself.
--
-- `20261110000003_byok_hospital_ai_keys.sql`'s own header says it outright: "Replaces the
-- earlier untracked draft (20261109000000_hospital_byok_ai_config.sql), which must NOT be
-- applied." That draft survives locally only as
-- `supabase/migrations/20261109000000_hospital_byok_ai_config.sql.superseded` — the `.superseded`
-- extension is what makes every migration tool ignore it (filenames must match
-- `<timestamp>_name.sql`) — but its CREATE TABLE / CREATE TRIGGER / RLS statements were run
-- against the live database at some point under a different, now-orphaned version number
-- (20261108000008 in supabase_migrations.schema_migrations), with no corresponding local file.
--
-- Why this has to be dropped rather than left alongside the replacement: the replacement
-- migration creates the same two table names with `CREATE TABLE IF NOT EXISTS`. Against a
-- database where the draft's versions already exist, that is a silent no-op — the REJECTED
-- design stays live, including the self-grant-vulnerable trigger the replacement's own header
-- names as the first thing wrong with the draft ("needed a 30-line SECURITY DEFINER trigger
-- whose only job was to defend a column that should not have been there").
--
-- Verified before writing this: `hospital_ai_keys` (the secrets table) has zero rows — no real
-- provider key was ever stored under the draft. `hospital_ai_provider_config` has exactly one
-- row (a platform grant with no provider configured, created 2026-10-20) — plainly test data,
-- not a live BYOK hospital. Both are safe to drop.
--
-- `ai_usage_logs.byok` and its index are the draft's metering column — the replacement uses a
-- richer `key_owner` column instead (see that migration's point 4: "METERING IS OBSERVED, NOT
-- RESTATED"). Nothing in the current codebase reads `ai_usage_logs.byok` (verified by grep), so
-- it is dead weight from the same abandoned design, not a column anything depends on.

DROP TABLE IF EXISTS public.hospital_ai_keys;
DROP TABLE IF EXISTS public.hospital_ai_provider_config;

-- CASCADE from the table drops above already removes the trigger that referenced this function,
-- but the function itself is a separate catalog object and survives a table drop on its own.
DROP FUNCTION IF EXISTS public.enforce_byok_allowed_platform_only();

DROP INDEX IF EXISTS public.idx_ai_usage_logs_hospital_byok;
ALTER TABLE public.ai_usage_logs DROP COLUMN IF EXISTS byok;
