-- quick_scribe_search_by_name and quick_scribe_note_amendments
-- (see 20261111000009_quick_scribe_name_prefix_index.sql and
-- 20261111000010_quick_scribe_search_and_amendments.sql).
--
-- Name search is the lost-paper fallback and the highest patient-safety risk in the whole
-- retrieval feature — pulling up the wrong "Lakshmi" and carrying her medicines onto someone
-- else's prescription is a real way to hurt a patient. So what is asserted here is narrower and
-- stricter than a normal search feature's test would be:
--
--   (1) The three input guards: minimum length, no wildcard characters, and the rate limit —
--       each is a defence against a DIFFERENT kind of misuse (an accidental too-broad search, a
--       deliberately crafted pattern, and a scraping loop), so each gets its own assertion.
--   (2) Scope defaults to the caller's OWN notes and only widens with an explicit opt-in — this
--       is the control that keeps routine name-typing from being a hospital-wide PHI scan by
--       default.
--   (3) Cross-tenant isolation holds even with the widest scope (p_all_doctors=true) and even
--       though the RPC runs SECURITY DEFINER and bypasses RLS entirely.
--   (4) An expired note is unreachable through search, same as through the exact-code lookup.
--   (5) Amendments are append-only: insertable and readable within the tenant by an authorized
--       role, but never editable or deletable, and amended_by targets public.users(id).
--
-- Self-contained, rolled back. No PHI — "Lakshmi" fixtures here are recognisably synthetic.

BEGIN;
SELECT plan(14);

INSERT INTO public.hospitals (id, name)
VALUES
  ('cccccccc-cccc-4ccc-8ccc-000000000001', 'QS Search Hospital X'),
  ('cccccccc-cccc-4ccc-8ccc-000000000002', 'QS Search Hospital Y');

INSERT INTO public.role_permissions (hospital_id, role_name, role_label)
VALUES
  ('cccccccc-cccc-4ccc-8ccc-000000000001', 'doctor', 'Doctor'),
  ('cccccccc-cccc-4ccc-8ccc-000000000001', 'receptionist', 'Receptionist'),
  ('cccccccc-cccc-4ccc-8ccc-000000000002', 'doctor', 'Doctor');

INSERT INTO auth.users (id)
VALUES
  ('cccccccc-cccc-4ccc-8ccc-000000000010'),  -- Dr A, hospital X
  ('cccccccc-cccc-4ccc-8ccc-000000000011'),  -- Dr B, hospital X
  ('cccccccc-cccc-4ccc-8ccc-000000000012'),  -- Receptionist, hospital X
  ('cccccccc-cccc-4ccc-8ccc-000000000013');  -- Dr Y, hospital Y

INSERT INTO public.users (id, hospital_id, full_name, email, role, auth_user_id)
VALUES
  ('cccccccc-cccc-4ccc-8ccc-000000000020', 'cccccccc-cccc-4ccc-8ccc-000000000001',
   'QS Search Doctor A', 'qs-search-a@example.test', 'doctor', 'cccccccc-cccc-4ccc-8ccc-000000000010'),
  ('cccccccc-cccc-4ccc-8ccc-000000000021', 'cccccccc-cccc-4ccc-8ccc-000000000001',
   'QS Search Doctor B', 'qs-search-b@example.test', 'doctor', 'cccccccc-cccc-4ccc-8ccc-000000000011'),
  ('cccccccc-cccc-4ccc-8ccc-000000000022', 'cccccccc-cccc-4ccc-8ccc-000000000001',
   'QS Search Reception', 'qs-search-recep@example.test', 'receptionist', 'cccccccc-cccc-4ccc-8ccc-000000000012'),
  ('cccccccc-cccc-4ccc-8ccc-000000000023', 'cccccccc-cccc-4ccc-8ccc-000000000002',
   'QS Search Doctor Y', 'qs-search-y@example.test', 'doctor', 'cccccccc-cccc-4ccc-8ccc-000000000013');

-- Dr A's own note, hospital X.
INSERT INTO public.quick_scribe_notes
  (id, hospital_id, doctor_id, patient_name, transcript_text, structured_note_json)
VALUES (
  'cccccccc-cccc-4ccc-8ccc-000000000030',
  'cccccccc-cccc-4ccc-8ccc-000000000001',
  'cccccccc-cccc-4ccc-8ccc-000000000020',
  'Lakshmi Rao', 'fixture',
  '{"summary":"x","medicines":[],"labTests":[],"radiologyTests":[]}'::jsonb
);

-- Dr B's note, SAME hospital, SAME name prefix — the control for the own-notes-by-default rule.
INSERT INTO public.quick_scribe_notes
  (id, hospital_id, doctor_id, patient_name, transcript_text, structured_note_json)
VALUES (
  'cccccccc-cccc-4ccc-8ccc-000000000031',
  'cccccccc-cccc-4ccc-8ccc-000000000001',
  'cccccccc-cccc-4ccc-8ccc-000000000021',
  'Lakshmi Devi', 'fixture',
  '{"summary":"x","medicines":[],"labTests":[],"radiologyTests":[]}'::jsonb
);

-- Dr A's own note but EXPIRED — must be unreachable regardless of scope. Backdating created_at
-- rather than setting purge_after directly: the BEFORE INSERT trigger recomputes purge_after
-- from created_at unconditionally (20261111000001), so a directly-supplied value here would be
-- silently overwritten with a fresh 3-year-out one — same as what the real app's insert produces.
INSERT INTO public.quick_scribe_notes
  (id, hospital_id, doctor_id, patient_name, transcript_text, structured_note_json, created_at)
VALUES (
  'cccccccc-cccc-4ccc-8ccc-000000000032',
  'cccccccc-cccc-4ccc-8ccc-000000000001',
  'cccccccc-cccc-4ccc-8ccc-000000000020',
  'Lakshmi Expired', 'fixture',
  '{"summary":"x","medicines":[],"labTests":[],"radiologyTests":[]}'::jsonb,
  now() - interval '4 years'
);

-- Hospital Y — the cross-tenant control, same name prefix, widest scope.
INSERT INTO public.quick_scribe_notes
  (id, hospital_id, doctor_id, patient_name, transcript_text, structured_note_json)
VALUES (
  'cccccccc-cccc-4ccc-8ccc-000000000033',
  'cccccccc-cccc-4ccc-8ccc-000000000002',
  'cccccccc-cccc-4ccc-8ccc-000000000023',
  'Lakshmi Yonder', 'fixture',
  '{"summary":"y","medicines":[],"labTests":[],"radiologyTests":[]}'::jsonb
);

CREATE FUNCTION pg_temp.capture_sqlstate(p_sql text) RETURNS text AS $$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;
END;
$$ LANGUAGE plpgsql;

-- ── 1. Input guards ──

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'cccccccc-cccc-4ccc-8ccc-000000000010', 'role', 'authenticated')::text,
  true);

SELECT throws_ok(
  $$ SELECT * FROM public.quick_scribe_search_by_name('la') $$,
  'P0001', 'Search term must be at least 3 characters.',
  'a 2-character term is refused'
);

-- The RPC's RAISE EXCEPTION source reads '...contain %% or _.' — %% is RAISE's own escape for a
-- literal %, so the message actually raised (and what must be asserted here) carries a single %.
SELECT throws_ok(
  $$ SELECT * FROM public.quick_scribe_search_by_name('lak%') $$,
  'P0001', 'Search term may not contain % or _.',
  'a wildcard character in the term is refused'
);

-- ── 2. Scope: own notes by default, hospital-wide only with explicit opt-in ──

SELECT is(
  (SELECT count(*)::int FROM public.quick_scribe_search_by_name('lak')),
  1,
  'with no p_all_doctors argument, Dr A sees only her own matching note'
);

SELECT is(
  (SELECT count(*)::int FROM public.quick_scribe_search_by_name('lak', true)),
  2,
  'with p_all_doctors=true, Dr A sees both her own and Dr B''s matching notes at the same hospital'
);

SELECT is(
  (SELECT count(*)::int FROM public.quick_scribe_search_by_name('lak', true)
    WHERE id = 'cccccccc-cccc-4ccc-8ccc-000000000032'),
  0,
  'the expired note is excluded even at the widest scope'
);

-- ── 3. Cross-tenant isolation, even at the widest scope ──

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'cccccccc-cccc-4ccc-8ccc-000000000013', 'role', 'authenticated')::text,
  true);

SELECT is(
  (SELECT count(*)::int FROM public.quick_scribe_search_by_name('lak', true)),
  1,
  'hospital Y''s doctor, searching with p_all_doctors=true, sees only hospital Y''s own match'
);

SELECT is(
  (SELECT patient_name FROM public.quick_scribe_search_by_name('lak', true) LIMIT 1),
  'Lakshmi Yonder',
  'and it is specifically hospital Y''s patient, not one leaked from hospital X'
);

RESET ROLE;

-- ── 4. Role gate: a receptionist at the owning hospital is still refused ──

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'cccccccc-cccc-4ccc-8ccc-000000000012', 'role', 'authenticated')::text,
  true);

SELECT throws_ok(
  $$ SELECT * FROM public.quick_scribe_search_by_name('lak') $$,
  'P0001', 'Not authorized to search Quick Scribe notes.',
  'a receptionist at the owning hospital is refused'
);

RESET ROLE;

-- ── 5. Audit: one row per successful call ──

-- 3, not 2: Dr A called quick_scribe_search_by_name('lak', ...) three times above — the default-
-- scope assertion, the all_doctors assertion, and the all_doctors call made again inside the
-- "expired note excluded" assertion's own subquery — and every successful call writes its own
-- audit row with no dedup.
SELECT is(
  (SELECT count(*)::int FROM public.phi_access_audit
    WHERE source = 'quick_scribe_search' AND search_term = 'lak'
      AND hospital_id = 'cccccccc-cccc-4ccc-8ccc-000000000001'),
  3,
  'each of Dr A''s three successful ''lak'' searches wrote its own audit row'
);

-- ── 6. Rate limit ──

-- Pre-fill 20 rows in the last 60 seconds for Dr A, simulating a scraping loop. Inserted
-- directly (not via the RPC) — this is about proving the COUNTING works, independent of
-- whichever path produced the rows.
INSERT INTO public.phi_access_audit (hospital_id, user_id, table_name, row_id, access_type, source, search_term, accessed_at)
SELECT
  'cccccccc-cccc-4ccc-8ccc-000000000001',
  'cccccccc-cccc-4ccc-8ccc-000000000020',
  'quick_scribe_notes', '*list*', 'read', 'quick_scribe_search', 'ratelimit' || g,
  now() - (g || ' seconds')::interval
FROM generate_series(1, 20) g;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'cccccccc-cccc-4ccc-8ccc-000000000010', 'role', 'authenticated')::text,
  true);

SELECT throws_ok(
  $$ SELECT * FROM public.quick_scribe_search_by_name('lak') $$,
  'P0001', 'Too many searches in the last minute — please wait before searching again.',
  'a 21st search within 60 seconds is refused'
);

RESET ROLE;

-- ── 7. Amendments: FK target, append-only, tenant-isolated ──

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    JOIN pg_class rt ON rt.oid = c.confrelid
    JOIN pg_namespace rn ON rn.oid = rt.relnamespace
    WHERE t.relname = 'quick_scribe_note_amendments' AND a.attname = 'amended_by'
      AND rt.relname = 'users' AND rn.nspname = 'public'
  ),
  'amended_by FKs to public.users, not auth.users'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'cccccccc-cccc-4ccc-8ccc-000000000010', 'role', 'authenticated')::text,
  true);

INSERT INTO public.quick_scribe_note_amendments (note_id, hospital_id, amended_by, reason, patch)
VALUES (
  'cccccccc-cccc-4ccc-8ccc-000000000030', 'cccccccc-cccc-4ccc-8ccc-000000000001',
  'cccccccc-cccc-4ccc-8ccc-000000000020', 'Diagnosis transcribed incorrectly',
  '{"diagnosis": "Corrected diagnosis"}'::jsonb
);

SELECT is(
  (SELECT count(*)::int FROM public.quick_scribe_note_amendments
    WHERE note_id = 'cccccccc-cccc-4ccc-8ccc-000000000030'),
  1,
  'the owning hospital''s doctor can insert and then read back an amendment'
);

WITH attempted AS (
  UPDATE public.quick_scribe_note_amendments
  SET reason = 'rewritten'
  WHERE note_id = 'cccccccc-cccc-4ccc-8ccc-000000000030'
  RETURNING 1
)
SELECT is((SELECT count(*)::int FROM attempted), 0,
  'an amendment cannot be UPDATEd — append-only means append-only');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'cccccccc-cccc-4ccc-8ccc-000000000013', 'role', 'authenticated')::text,
  true);

SELECT is(
  (SELECT count(*)::int FROM public.quick_scribe_note_amendments
    WHERE note_id = 'cccccccc-cccc-4ccc-8ccc-000000000030'),
  0,
  'hospital Y''s doctor cannot read hospital X''s amendment'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
