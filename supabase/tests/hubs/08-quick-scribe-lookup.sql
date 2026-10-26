-- quick_scribe_lookup_by_code / quick_scribe_recent_notes / quick_scribe_get_note
-- (see 20261111000007_phi_access_audit_search_term.sql and
-- 20261111000008_quick_scribe_lookup_rpcs.sql).
--
-- This is the repo's first SQL-side PHI read-logger, so the claims worth asserting are the ones
-- that make it trustworthy as an audit trail rather than just a working feature:
--
--   (1) Cross-tenant isolation. A code or id from hospital Y must return nothing to hospital X's
--       doctor, even though every RPC runs SECURITY DEFINER and bypasses RLS entirely — the
--       tenant predicate inside each function is the only thing standing between a guessed id
--       and another hospital's patient.
--   (2) Role gate. A receptionist at the OWNING hospital — correct tenant, wrong role — must
--       still be refused.
--   (3) Exactly one phi_access_audit row per call, carrying the search term, whether or not the
--       lookup found anything. A lookup that found nothing is still an access attempt.
--   (4) The list/get split actually holds: quick_scribe_lookup_by_code and
--       quick_scribe_recent_notes never return a note's clinical content; only
--       quick_scribe_get_note does, and it writes its OWN separate audit row.
--   (5) The retention predicate: an expired note is unreachable through every one of these RPCs,
--       not merely scheduled for deletion — the same defence-in-depth the RLS policies apply.
--
-- Self-contained, rolled back. No PHI — the fixture content is recognisably synthetic.

BEGIN;
SELECT plan(13);

INSERT INTO public.hospitals (id, name)
VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 'QS Lookup Hospital X'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-000000000002', 'QS Lookup Hospital Y');

INSERT INTO public.role_permissions (hospital_id, role_name, role_label)
VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 'doctor', 'Doctor'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 'receptionist', 'Receptionist'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-000000000002', 'doctor', 'Doctor');

INSERT INTO auth.users (id)
VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-000000000010'),  -- doctor X
  ('bbbbbbbb-bbbb-4bbb-8bbb-000000000011'),  -- receptionist X
  ('bbbbbbbb-bbbb-4bbb-8bbb-000000000012');  -- doctor Y

INSERT INTO public.users (id, hospital_id, full_name, email, role, auth_user_id)
VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-000000000020', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
   'QS Lookup Doctor X', 'qs-lookup-doc-x@example.test', 'doctor', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000010'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-000000000021', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
   'QS Lookup Reception X', 'qs-lookup-recep-x@example.test', 'receptionist', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000011'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-000000000022', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002',
   'QS Lookup Doctor Y', 'qs-lookup-doc-y@example.test', 'doctor', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000012');

-- One note at hospital X, authored by the X doctor, with a known code and some clinical content.
INSERT INTO public.quick_scribe_notes
  (id, hospital_id, doctor_id, patient_name, patient_age, transcript_text, structured_note_json,
   visit_code, diagnosis, advice)
VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-000000000030',
  'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
  'bbbbbbbb-bbbb-4bbb-8bbb-000000000020',
  'Lookup Fixture Patient', '34',
  'fixture transcript with bystander chatter',
  '{"summary":"x","medicines":[{"drug_name":"Metformin 500mg"}],"labTests":[],"radiologyTests":[]}'::jsonb,
  'QS-TEST1',
  'Type 2 diabetes mellitus',
  'Continue metformin, review in 2 weeks'
);

-- An expired note at the SAME hospital, simulating one the retention executor has not yet swept.
-- It must be unreachable through every RPC regardless. Backdating created_at rather than setting
-- purge_after directly: the BEFORE INSERT trigger set_quick_scribe_retention (20261111000001)
-- unconditionally RECOMPUTES purge_after from created_at on every insert — correctly, since the
-- real app never supplies purge_after itself, and a writer that could set it directly would be
-- a way to bypass retention. A directly-supplied purge_after here would be silently overwritten
-- with a fresh 3-year-out value, same as the production insert path produces.
INSERT INTO public.quick_scribe_notes
  (id, hospital_id, doctor_id, patient_name, transcript_text, structured_note_json, visit_code, created_at)
VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-000000000031',
  'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
  'bbbbbbbb-bbbb-4bbb-8bbb-000000000020',
  'Lookup Fixture Expired', 'fixture',
  '{"summary":"x","medicines":[],"labTests":[],"radiologyTests":[]}'::jsonb,
  'QS-OLD01', now() - interval '4 years'
);

-- ── 1 & 2. Lookup by code: the owning doctor succeeds, the wrong role and the wrong tenant don't ──

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000010', 'role', 'authenticated')::text,
  true);

SELECT is(
  (SELECT count(*)::int FROM public.quick_scribe_lookup_by_code('QS-TEST1')),
  1,
  'the owning hospital''s doctor finds the note by its exact code'
);

SELECT is(
  (SELECT count(*)::int FROM public.quick_scribe_lookup_by_code('test1')),
  1,
  'the code match is case-insensitive and tolerates a missing QS- prefix'
);

SELECT is(
  (SELECT count(*)::int FROM public.quick_scribe_lookup_by_code('QS-OLD01')),
  0,
  'an expired note (purge_after in the past) is unreachable, even by its exact code'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000012', 'role', 'authenticated')::text,
  true);

SELECT is(
  (SELECT count(*)::int FROM public.quick_scribe_lookup_by_code('QS-TEST1')),
  0,
  'hospital Y''s doctor gets nothing for hospital X''s code, despite SECURITY DEFINER bypassing RLS'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000011', 'role', 'authenticated')::text,
  true);

SELECT throws_ok(
  $$ SELECT * FROM public.quick_scribe_lookup_by_code('QS-TEST1') $$,
  'P0001',
  'Not authorized to look up Quick Scribe notes.',
  'a receptionist at the OWNING hospital is still refused — correct tenant, wrong role'
);

RESET ROLE;

-- ── 3. Exactly one audit row per call, carrying the search term ──

-- Scoped to hospital X: hospital Y's doctor also searched 'QS-TEST1' at line ~113 (and got
-- nothing), which wrote its own audit row under hospital Y's id — an unscoped count here would
-- be 3, not 2. Scoping to the hospital is also the more meaningful claim: it is hospital X's
-- audit trail that has to show exactly its own two lookups.
SELECT is(
  (SELECT count(*)::int FROM public.phi_access_audit
    WHERE table_name = 'quick_scribe_notes' AND search_term = 'QS-TEST1'
      AND hospital_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'),
  2,
  'the two successful QS-TEST1 lookups above (exact and lowercase-no-prefix) each wrote one audit row'
);

SELECT is(
  (SELECT count(*)::int FROM public.phi_access_audit
    WHERE table_name = 'quick_scribe_notes' AND search_term = 'QS-OLD01'),
  1,
  'the lookup for the EXPIRED note still wrote an audit row — a failed/blocked attempt is still an access attempt'
);

SELECT is(
  (SELECT row_id FROM public.phi_access_audit
    WHERE table_name = 'quick_scribe_notes' AND search_term = 'QS-OLD01'),
  '',
  'the audit row for a lookup that found nothing records an empty row_id, not a fabricated match'
);

-- ── 4. The list/get split: lookup_by_code never carries clinical content ──

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000010', 'role', 'authenticated')::text,
  true);

-- quick_scribe_lookup_by_code's return type has no diagnosis/advice/structured_note_json columns
-- at all — this is a compile-time guarantee, not a runtime filter, so there is no column to
-- assert is null. What IS assertable is that the row it returns carries only the summary shape.
SELECT is(
  (SELECT patient_name FROM public.quick_scribe_lookup_by_code('QS-TEST1')),
  'Lookup Fixture Patient',
  'the list result carries the patient name, as documented'
);

-- quick_scribe_get_note, by contrast, DOES carry the clinical content.
SELECT is(
  (SELECT diagnosis FROM public.quick_scribe_get_note('bbbbbbbb-bbbb-4bbb-8bbb-000000000030')),
  'Type 2 diabetes mellitus',
  'quick_scribe_get_note returns the typed diagnosis — the deliberate second call'
);

SELECT is(
  (SELECT advice FROM public.quick_scribe_get_note('bbbbbbbb-bbbb-4bbb-8bbb-000000000030')),
  'Continue metformin, review in 2 weeks',
  'quick_scribe_get_note returns advice'
);

-- quick_scribe_get_note's own audit rows are separate from the lookup's, with no search_term
-- (it was reached by id, not by searching) — 2, not 1, because the two assertions just above
-- each called get_note independently, and every call writes its own row with no dedup.
--
-- phi_access_audit's own SELECT policy is admin-only (hospital_admin/super_admin), so this
-- count has to run outside Dr A's session — reading it AS Dr A would be filtered to zero by
-- that policy regardless of what was actually written, which is a false negative, not a true one.
RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM public.phi_access_audit
    WHERE table_name = 'quick_scribe_notes'
      AND row_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000030'
      AND search_term IS NULL),
  2,
  'quick_scribe_get_note writes its own audit row per call, separate from the lookup call, with no search_term'
);

-- ── 5. Recent notes: scoped to the calling doctor's own notes, expired ones excluded ──

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000010', 'role', 'authenticated')::text,
  true);

SELECT is(
  (SELECT count(*)::int FROM public.quick_scribe_recent_notes()),
  1,
  'recent_notes returns exactly the one live note this doctor authored — the expired one is excluded'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
