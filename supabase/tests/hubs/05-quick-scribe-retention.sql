-- quick_scribe_notes — retention periods and the SELECT/INSERT-only lockdown
-- (see 20261111000001_quick_scribe_retention_periods.sql and 20261111000002_quick_scribe_rls_lockdown.sql).
--
-- Four claims asserted, matching the load-bearing ones those migrations make:
--
--   (1) The retention rule. A note carrying medicines gets 8 years, a tests-only note gets 3, and
--       a minor's note is extended to age 21. Asserted through the trigger on a real INSERT, not
--       by calling the function directly — the trigger being wired is half the claim.
--
--   (2) The backfill rescued the old 30-day rows. A row written with the legacy default must not
--       still be sitting at ~30 days once the migration has applied.
--
--   (3) UPDATE and DELETE are denied by omission. A doctor in the owning hospital — the most
--       privileged ordinary caller this table has — must be refused both. This is the regression
--       that matters: the previous policy had no FOR clause and allowed both.
--
--   (4) Cross-tenant isolation, two hospitals, plus the role gate. Hospital X's doctor sees only
--       X's note; a receptionist at X sees nothing at all.
--
-- Self-contained: throwaway hospitals/users/notes, rolled back at the end. No PHI — the patient
-- names here are obvious fixtures and no transcript carries clinical content.

BEGIN;
SELECT plan(12);

-- ── Fixture: two hospitals, a doctor + a receptionist in X, a doctor in Y ──

INSERT INTO public.hospitals (id, name)
VALUES
  ('88888888-8888-4888-8888-000000000001', 'Quick Scribe Test Hospital X'),
  ('88888888-8888-4888-8888-000000000002', 'Quick Scribe Test Hospital Y');

INSERT INTO public.role_permissions (hospital_id, role_name, role_label)
VALUES
  ('88888888-8888-4888-8888-000000000001', 'doctor', 'Doctor'),
  ('88888888-8888-4888-8888-000000000001', 'receptionist', 'Receptionist'),
  ('88888888-8888-4888-8888-000000000002', 'doctor', 'Doctor');

INSERT INTO auth.users (id)
VALUES
  ('88888888-8888-4888-8888-000000000010'),   -- doctor X
  ('88888888-8888-4888-8888-000000000011'),   -- receptionist X
  ('88888888-8888-4888-8888-000000000012');   -- doctor Y

INSERT INTO public.users (id, hospital_id, full_name, email, role, auth_user_id)
VALUES
  ('88888888-8888-4888-8888-000000000020', '88888888-8888-4888-8888-000000000001',
   'QS Test Doctor X', 'qs-doctor-x@example.test', 'doctor', '88888888-8888-4888-8888-000000000010'),
  ('88888888-8888-4888-8888-000000000021', '88888888-8888-4888-8888-000000000001',
   'QS Test Reception X', 'qs-recep-x@example.test', 'receptionist', '88888888-8888-4888-8888-000000000011'),
  ('88888888-8888-4888-8888-000000000022', '88888888-8888-4888-8888-000000000002',
   'QS Test Doctor Y', 'qs-doctor-y@example.test', 'doctor', '88888888-8888-4888-8888-000000000012');

-- ── 1. Retention periods, computed by the trigger on insert ──

-- A prescription: medicines present. Patient name is mandatory here — the CHECK constraint
-- quick_scribe_notes_named_when_prescribing (20261107000003:46-53) enforces it.
INSERT INTO public.quick_scribe_notes
  (id, hospital_id, doctor_id, patient_name, patient_age, transcript_text, structured_note_json, created_at)
VALUES (
  '88888888-8888-4888-8888-000000000030',
  '88888888-8888-4888-8888-000000000001',
  '88888888-8888-4888-8888-000000000020',
  'Fixture Adult', '45',
  'fixture transcript',
  '{"summary":"x","medicines":[{"drug_name":"Paracetamol 500mg"}],"labTests":[],"radiologyTests":[]}'::jsonb,
  '2026-01-15 10:00:00+05:30'
);

SELECT is(
  (SELECT purge_after FROM public.quick_scribe_notes WHERE id = '88888888-8888-4888-8888-000000000030'),
  '2026-01-15 10:00:00+05:30'::timestamptz + interval '8 years',
  'a note carrying medicines is kept 8 years'
);

-- No medicines: advice and tests only. Not a prescription, so the shorter period applies.
INSERT INTO public.quick_scribe_notes
  (id, hospital_id, doctor_id, patient_name, patient_age, transcript_text, structured_note_json, created_at)
VALUES (
  '88888888-8888-4888-8888-000000000031',
  '88888888-8888-4888-8888-000000000001',
  '88888888-8888-4888-8888-000000000020',
  'Fixture Tests Only', '30',
  'fixture transcript',
  '{"summary":"x","medicines":[],"labTests":["CBC"],"radiologyTests":[]}'::jsonb,
  '2026-01-15 10:00:00+05:30'
);

SELECT is(
  (SELECT purge_after FROM public.quick_scribe_notes WHERE id = '88888888-8888-4888-8888-000000000031'),
  '2026-01-15 10:00:00+05:30'::timestamptz + interval '3 years',
  'a tests-only note is kept 3 years, not 8 — it is not a prescription'
);

-- A 5-year-old with medicines: 8 years would expire at 13, well inside minority. Extended to 21.
INSERT INTO public.quick_scribe_notes
  (id, hospital_id, doctor_id, patient_name, patient_age, transcript_text, structured_note_json, created_at)
VALUES (
  '88888888-8888-4888-8888-000000000032',
  '88888888-8888-4888-8888-000000000001',
  '88888888-8888-4888-8888-000000000020',
  'Fixture Child', '5',
  'fixture transcript',
  '{"summary":"x","medicines":[{"drug_name":"Syrup"}],"labTests":[],"radiologyTests":[]}'::jsonb,
  '2026-01-15 10:00:00+05:30'
);

SELECT is(
  (SELECT purge_after FROM public.quick_scribe_notes WHERE id = '88888888-8888-4888-8888-000000000032'),
  '2026-01-15 10:00:00+05:30'::timestamptz + interval '16 years',
  'a 5-year-old''s prescription is kept until 21, not 8 years'
);

-- An infant: "6 months" must not parse as 6 YEARS. It resolves to age 0 and the full 21 years.
INSERT INTO public.quick_scribe_notes
  (id, hospital_id, doctor_id, patient_name, patient_age, transcript_text, structured_note_json, created_at)
VALUES (
  '88888888-8888-4888-8888-000000000033',
  '88888888-8888-4888-8888-000000000001',
  '88888888-8888-4888-8888-000000000020',
  'Fixture Infant', '6 months',
  'fixture transcript',
  '{"summary":"x","medicines":[{"drug_name":"Drops"}],"labTests":[],"radiologyTests":[]}'::jsonb,
  '2026-01-15 10:00:00+05:30'
);

SELECT is(
  (SELECT purge_after FROM public.quick_scribe_notes WHERE id = '88888888-8888-4888-8888-000000000033'),
  '2026-01-15 10:00:00+05:30'::timestamptz + interval '21 years',
  '"6 months" is read as an infant, not as a 6-year-old'
);

-- A blank age must not silently extend retention on every note where the box was left empty.
SELECT ok(
  public.quick_scribe_age_years('') IS NULL AND public.quick_scribe_age_years(NULL) IS NULL,
  'a blank age yields NULL, so the minor rule does not fire by default'
);

-- ── 2. The backfill rescued rows carrying the legacy 30-day default ──

SELECT is(
  (SELECT count(*)::int FROM public.quick_scribe_notes
    WHERE purge_after < created_at + interval '1 year'),
  0,
  'no note is left sitting on the old 30-day window'
);

-- ── 3. UPDATE and DELETE denied by omission, for the owning hospital''s own doctor ──

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '88888888-8888-4888-8888-000000000010', 'role', 'authenticated')::text,
  true);

-- RLS refuses the row rather than raising, so an UPDATE that matches nothing affects 0 rows.
-- Asserting the row is UNCHANGED is the claim that matters: a silent no-op and a silent
-- rewrite look identical from the client, and only one of them is acceptable.
WITH attempted AS (
  UPDATE public.quick_scribe_notes
  SET patient_name = 'Rewritten By Doctor'
  WHERE id = '88888888-8888-4888-8888-000000000030'
  RETURNING 1
)
SELECT is((SELECT count(*)::int FROM attempted), 0,
  'a doctor at the owning hospital cannot UPDATE a printed note');

SELECT is(
  (SELECT patient_name FROM public.quick_scribe_notes WHERE id = '88888888-8888-4888-8888-000000000030'),
  'Fixture Adult',
  'the note''s stored identity is unchanged after the attempted rewrite'
);

WITH attempted AS (
  DELETE FROM public.quick_scribe_notes
  WHERE id = '88888888-8888-4888-8888-000000000030'
  RETURNING 1
)
SELECT is((SELECT count(*)::int FROM attempted), 0,
  'a doctor at the owning hospital cannot DELETE a printed note');

-- ── 4. Cross-tenant isolation and the role gate ──

RESET ROLE;

INSERT INTO public.quick_scribe_notes
  (id, hospital_id, doctor_id, patient_name, patient_age, transcript_text, structured_note_json)
VALUES (
  '88888888-8888-4888-8888-000000000040',
  '88888888-8888-4888-8888-000000000002',
  '88888888-8888-4888-8888-000000000022',
  'Fixture Hospital Y Patient', '50',
  'fixture transcript',
  '{"summary":"y","medicines":[],"labTests":[],"radiologyTests":[]}'::jsonb
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '88888888-8888-4888-8888-000000000010', 'role', 'authenticated')::text,
  true);

SELECT is(
  (SELECT count(*)::int FROM public.quick_scribe_notes),
  4,
  'an unfiltered SELECT as hospital X''s doctor returns only X''s four notes — RLS does the filtering'
);

SELECT is(
  (SELECT count(*)::int FROM public.quick_scribe_notes
    WHERE id = '88888888-8888-4888-8888-000000000040'),
  0,
  'hospital X''s doctor cannot read hospital Y''s note even when naming its id'
);

-- The receptionist is in the right hospital and fails only the role test. This is the grant
-- 20261107000003 removed and this migration must not have reintroduced.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '88888888-8888-4888-8888-000000000011', 'role', 'authenticated')::text,
  true);

SELECT is(
  (SELECT count(*)::int FROM public.quick_scribe_notes),
  0,
  'a receptionist at the owning hospital reads no consultation notes at all'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
