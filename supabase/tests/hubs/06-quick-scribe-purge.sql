-- purge_quick_scribe_notes() / sweep_quick_scribe_retention()
-- (see 20261111000003_quick_scribe_retention_executor.sql).
--
-- The claims that matter here are all boundary claims. A retention executor that deletes slightly
-- too much is a data-loss incident and one that deletes slightly too little is a compliance gap,
-- so every assertion below pairs an "expired, must go" row with a "not yet expired, must stay" row
-- one step on the safe side of the same boundary.
--
--   (1) Transcripts blank at 90 days — and the tombstone is set, so redaction stays
--       distinguishable from "this note was never dictated".
--   (2) A transcript inside 90 days is untouched.
--   (3) Notes past purge_after are deleted; notes inside it survive.
--   (4) The opportunistic sweep is tenant-scoped — it must not reach another hospital's expired
--       rows even though it runs SECURITY DEFINER.
--
-- Self-contained, rolled back. No PHI.

BEGIN;
SELECT plan(10);

INSERT INTO public.hospitals (id, name)
VALUES
  ('99999999-9999-4999-8999-000000000001', 'QS Purge Hospital X'),
  ('99999999-9999-4999-8999-000000000002', 'QS Purge Hospital Y');

INSERT INTO public.role_permissions (hospital_id, role_name, role_label)
VALUES
  ('99999999-9999-4999-8999-000000000001', 'doctor', 'Doctor'),
  ('99999999-9999-4999-8999-000000000002', 'doctor', 'Doctor');

INSERT INTO auth.users (id)
VALUES ('99999999-9999-4999-8999-000000000010'), ('99999999-9999-4999-8999-000000000011');

INSERT INTO public.users (id, hospital_id, full_name, email, role, auth_user_id)
VALUES
  ('99999999-9999-4999-8999-000000000020', '99999999-9999-4999-8999-000000000001',
   'QS Purge Doctor X', 'qs-purge-x@example.test', 'doctor', '99999999-9999-4999-8999-000000000010'),
  ('99999999-9999-4999-8999-000000000021', '99999999-9999-4999-8999-000000000002',
   'QS Purge Doctor Y', 'qs-purge-y@example.test', 'doctor', '99999999-9999-4999-8999-000000000011');

-- ── Fixture rows, straddling each boundary ──
--
-- purge_after is computed by the trigger from created_at, so the "expired note" fixture is made
-- expired by backdating created_at past the full 3-year tests-only window rather than by writing
-- purge_after directly — which the trigger would overwrite anyway. That is deliberate: it exercises
-- the real trigger-plus-executor pair rather than a hand-placed boundary the trigger disagrees with.

INSERT INTO public.quick_scribe_notes
  (id, hospital_id, doctor_id, patient_name, patient_age, transcript_text, structured_note_json, created_at)
VALUES
  -- 91 days old: transcript must be blanked, note must survive (3-year window).
  ('99999999-9999-4999-8999-000000000030', '99999999-9999-4999-8999-000000000001',
   '99999999-9999-4999-8999-000000000020', 'Purge Fixture Old Transcript', '40',
   'spoken words that are now past ninety days',
   '{"summary":"x","medicines":[],"labTests":["CBC"],"radiologyTests":[]}'::jsonb,
   now() - interval '91 days'),

  -- 10 days old: everything must survive untouched.
  ('99999999-9999-4999-8999-000000000031', '99999999-9999-4999-8999-000000000001',
   '99999999-9999-4999-8999-000000000020', 'Purge Fixture Recent', '40',
   'spoken words from last week',
   '{"summary":"x","medicines":[],"labTests":["CBC"],"radiologyTests":[]}'::jsonb,
   now() - interval '10 days'),

  -- 4 years old, no medicines → 3-year window elapsed → the row itself must go.
  ('99999999-9999-4999-8999-000000000032', '99999999-9999-4999-8999-000000000001',
   '99999999-9999-4999-8999-000000000020', 'Purge Fixture Expired', '40',
   'long past its window',
   '{"summary":"x","medicines":[],"labTests":["CBC"],"radiologyTests":[]}'::jsonb,
   now() - interval '4 years'),

  -- 4 years old WITH medicines → 8-year window → must survive. This is the pairing that proves
  -- the executor honours the per-note period rather than one flat age cutoff.
  ('99999999-9999-4999-8999-000000000033', '99999999-9999-4999-8999-000000000001',
   '99999999-9999-4999-8999-000000000020', 'Purge Fixture Prescription', '40',
   'long past three years but it is a prescription',
   '{"summary":"x","medicines":[{"drug_name":"Metformin 500mg"}],"labTests":[],"radiologyTests":[]}'::jsonb,
   now() - interval '4 years'),

  -- Hospital Y, expired — the tenant-scoping control for assertion (4).
  ('99999999-9999-4999-8999-000000000040', '99999999-9999-4999-8999-000000000002',
   '99999999-9999-4999-8999-000000000021', 'Purge Fixture Hospital Y', '40',
   'hospital Y, also expired',
   '{"summary":"y","medicines":[],"labTests":[],"radiologyTests":[]}'::jsonb,
   now() - interval '4 years');

-- ── 4. Tenant scoping of the opportunistic sweep, checked BEFORE the full purge runs ──

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '99999999-9999-4999-8999-000000000010', 'role', 'authenticated')::text,
  true);

SELECT ok(
  public.sweep_quick_scribe_retention() > 0,
  'the opportunistic sweep reports work done for its own hospital'
);

RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM public.quick_scribe_notes
    WHERE id = '99999999-9999-4999-8999-000000000040'),
  1,
  'hospital X''s sweep did not touch hospital Y''s expired note, despite running SECURITY DEFINER'
);

SELECT is(
  (SELECT count(*)::int FROM public.quick_scribe_notes
    WHERE id = '99999999-9999-4999-8999-000000000032'),
  0,
  'hospital X''s own expired note was deleted by its sweep'
);

-- ── 1-3. The full sweep, over what remains ──

SELECT lives_ok(
  $$ SELECT * FROM public.purge_quick_scribe_notes() $$,
  'the full purge runs without error'
);

SELECT is(
  (SELECT transcript_text FROM public.quick_scribe_notes
    WHERE id = '99999999-9999-4999-8999-000000000030'),
  '',
  'a transcript older than 90 days is blanked'
);

SELECT ok(
  (SELECT transcript_purged_at IS NOT NULL FROM public.quick_scribe_notes
    WHERE id = '99999999-9999-4999-8999-000000000030'),
  'the blanked transcript carries a tombstone, so redaction stays distinguishable from absence'
);

SELECT is(
  (SELECT count(*)::int FROM public.quick_scribe_notes
    WHERE id = '99999999-9999-4999-8999-000000000030'),
  1,
  'blanking the transcript does not delete the note — only the transcript has a 90-day window'
);

SELECT is(
  (SELECT transcript_text FROM public.quick_scribe_notes
    WHERE id = '99999999-9999-4999-8999-000000000031'),
  'spoken words from last week',
  'a transcript inside 90 days is untouched'
);

SELECT is(
  (SELECT count(*)::int FROM public.quick_scribe_notes
    WHERE id = '99999999-9999-4999-8999-000000000033'),
  1,
  'a four-year-old PRESCRIPTION survives — it carries the 8-year window, not the 3-year one'
);

SELECT is(
  (SELECT count(*)::int FROM public.quick_scribe_notes
    WHERE id = '99999999-9999-4999-8999-000000000040'),
  0,
  'the full service-role purge reaches every tenant, including hospital Y'
);

SELECT * FROM finish();
ROLLBACK;
