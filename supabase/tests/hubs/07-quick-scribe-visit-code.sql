-- quick_scribe_notes.visit_code (see 20261111000005_quick_scribe_visit_code.sql).
--
-- The visit code is the primary key a patient carries between visits on a piece of paper, so the
-- claims worth asserting are about the two ways it could quietly betray that:
--
--   (1) The alphabet. Every character a human mis-transcribes under clinic lighting — 0/O, 1/I/L —
--       must be absent. This is asserted over many generated codes, not one, because a single
--       sample proves nothing about a random generator.
--   (2) Uniqueness scope. Unique WITHIN a hospital (or a code resolves to two patients), and
--       deliberately NOT unique across hospitals (or we have bought a global collision rate for
--       nothing, since every lookup is already tenant-scoped).
--
-- Plus: the trigger fires on insert, and an existing code is never regenerated — the paper in the
-- patient's hand cannot be updated.
--
-- Self-contained, rolled back. No PHI.

BEGIN;
SELECT plan(8);

INSERT INTO public.hospitals (id, name)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-000000000001', 'QS Code Hospital X'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-000000000002', 'QS Code Hospital Y');

INSERT INTO public.role_permissions (hospital_id, role_name, role_label)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-000000000001', 'doctor', 'Doctor'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-000000000002', 'doctor', 'Doctor');

INSERT INTO auth.users (id)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-000000000010'), ('aaaaaaaa-aaaa-4aaa-8aaa-000000000011');

INSERT INTO public.users (id, hospital_id, full_name, email, role, auth_user_id)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-000000000020', 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
   'QS Code Doctor X', 'qs-code-x@example.test', 'doctor', 'aaaaaaaa-aaaa-4aaa-8aaa-000000000010'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-000000000021', 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
   'QS Code Doctor Y', 'qs-code-y@example.test', 'doctor', 'aaaaaaaa-aaaa-4aaa-8aaa-000000000011');

-- ── 1. Format and alphabet, over 500 generated codes ──

SELECT is(
  (SELECT count(*)::int FROM generate_series(1, 500) g
    WHERE public.generate_quick_scribe_code() !~ '^QS-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$'),
  0,
  'every generated code matches QS-XXXXX over the ambiguity-safe alphabet'
);

SELECT is(
  (SELECT count(*)::int FROM generate_series(1, 500) g
    WHERE public.generate_quick_scribe_code() ~ '[O0I1L]'),
  0,
  'no generated code contains O, 0, I, 1 or L — the characters a patient transcribes wrong'
);

-- A generator that returned a constant would pass both assertions above. This one would not.
SELECT ok(
  (SELECT count(DISTINCT public.generate_quick_scribe_code())::int
     FROM generate_series(1, 200) g) > 150,
  'the generator actually varies rather than returning a constant'
);

-- ── 2. The trigger allocates on insert ──

INSERT INTO public.quick_scribe_notes
  (id, hospital_id, doctor_id, patient_name, transcript_text, structured_note_json)
VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-000000000030',
  'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-000000000020',
  'Code Fixture One', 'fixture',
  '{"summary":"x","medicines":[],"labTests":[],"radiologyTests":[]}'::jsonb
);

SELECT matches(
  (SELECT visit_code FROM public.quick_scribe_notes WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000030'),
  '^QS-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$',
  'the BEFORE INSERT trigger allocates a well-formed code'
);

-- ── 3. An explicitly supplied code is preserved, not overwritten ──
-- This is what lets the same code survive a future restore/import, and is why the trigger guards
-- on NEW.visit_code rather than unconditionally assigning.

INSERT INTO public.quick_scribe_notes
  (id, hospital_id, doctor_id, patient_name, transcript_text, structured_note_json, visit_code)
VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-000000000031',
  'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-000000000020',
  'Code Fixture Two', 'fixture',
  '{"summary":"x","medicines":[],"labTests":[],"radiologyTests":[]}'::jsonb,
  'QS-ABCDE'
);

SELECT is(
  (SELECT visit_code FROM public.quick_scribe_notes WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000031'),
  'QS-ABCDE',
  'a code supplied explicitly is preserved — a printed code must never be reassigned'
);

-- ── 4. Uniqueness scope ──

CREATE FUNCTION pg_temp.capture_sqlstate(p_sql text) RETURNS text AS $$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;
END;
$$ LANGUAGE plpgsql;

-- 23505 = unique_violation. Same code, same hospital → refused, because it would resolve to two
-- different patients at the same desk.
SELECT is(
  pg_temp.capture_sqlstate($$
    INSERT INTO public.quick_scribe_notes
      (hospital_id, doctor_id, patient_name, transcript_text, structured_note_json, visit_code)
    VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-000000000020',
            'Code Fixture Clash', 'fixture',
            '{"summary":"x","medicines":[],"labTests":[],"radiologyTests":[]}'::jsonb,
            'QS-ABCDE')
  $$),
  '23505',
  'the same code twice in one hospital is refused'
);

-- Same code, different hospital → allowed. Every lookup RPC is tenant-scoped, so global
-- uniqueness would multiply the collision rate platform-wide and buy nothing.
SELECT is(
  pg_temp.capture_sqlstate($$
    INSERT INTO public.quick_scribe_notes
      (hospital_id, doctor_id, patient_name, transcript_text, structured_note_json, visit_code)
    VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-000000000021',
            'Code Fixture Other Tenant', 'fixture',
            '{"summary":"y","medicines":[],"labTests":[],"radiologyTests":[]}'::jsonb,
            'QS-ABCDE')
  $$),
  NULL,
  'the same code in a DIFFERENT hospital is allowed — uniqueness is deliberately per-tenant'
);

SELECT is(
  (SELECT count(*)::int FROM public.quick_scribe_notes WHERE visit_code = 'QS-ABCDE'),
  2,
  'both tenants hold their own QS-ABCDE, one row each'
);

SELECT * FROM finish();
ROLLBACK;
