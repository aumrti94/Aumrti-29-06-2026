-- Quick Scribe, round 3 (j): the lost-paper fallback, and the sanctioned way to correct a note.
--
-- ── Name search: the fallback, not the primary path ───────────────────────────────────────
--
-- Pulling up the wrong Lakshmi and carrying her Metformin onto a non-diabetic patient's
-- prescription is a real way to hurt someone — there is no chart, no allergy list and no second
-- check standing in the way once a note is retrieved. The visit code (20261111000005) is the
-- primary retrieval path specifically because it carries no risk of mistaken identity. This RPC
-- exists for when the patient has lost the paper, and it is guarded accordingly:
--
--   * minimum 3 characters — "ra" matches a meaningful fraction of any hospital's patients;
--   * no SQL wildcard characters accepted from the caller — % and _ are rejected outright rather
--     than escaped, since there is no legitimate reason a patient's name search needs them;
--   * capped at 10 results;
--   * rate-limited against phi_access_audit itself (20 searches/minute) rather than a new state
--     table — the audit trail already records every call with its own source value, so counting
--     recent rows IS the rate limit, with no additional table to keep consistent;
--   * returns the same narrow summary shape as the PR 7 RPCs — name, age, sex, visit date,
--     authoring doctor. Never the address, never any note content.
--
-- Scoped by p_all_doctors, defaulting to false: a hospital-wide fallback that defaults to "every
-- doctor's patients" would make routine name-typing into a broad PHI scan. Defaulting to the
-- caller's own notes, with an explicit opt-in to search across the whole hospital, matches the
-- product review's ruling on this and gives MRD officers (who have no notes of their own) a
-- working reason to pass true.
--
-- ── Amendments: corrections without ever rewriting a printed note ────────────────────────────
--
-- 20261111000002 removed UPDATE and DELETE from quick_scribe_notes entirely — a note is a
-- point-in-time record of a document already handed to a patient, and editing the stored row
-- would let it silently diverge from the paper. A genuine correction (a transcription error
-- caught later, a drug name misheard) still needs SOMEWHERE to go. This table is that path:
-- append-only, always carrying a reason, with the original note row untouched and still readable
-- underneath every amendment made against it.

-- ── Name search RPC ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.quick_scribe_search_by_name(
  p_prefix      text,
  p_all_doctors boolean DEFAULT false
)
RETURNS TABLE (
  id           uuid,
  visit_code   text,
  patient_name text,
  patient_age  text,
  patient_sex  text,
  created_at   timestamptz,
  doctor_name  text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hospital_id   uuid := public.get_user_hospital_id();
  v_user_id       uuid;
  v_normalized    text;
  v_recent_count  integer;
BEGIN
  IF v_hospital_id IS NULL THEN
    RAISE EXCEPTION 'No hospital context for the current user.';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'doctor')
    OR public.has_role(auth.uid(), 'mrd_officer')
    OR public.has_role(auth.uid(), 'hospital_admin')
    OR public.has_role(auth.uid(), 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized to search Quick Scribe notes.';
  END IF;

  SELECT u.id INTO v_user_id FROM public.users u WHERE u.auth_user_id = auth.uid() LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No staff record for the current user.';
  END IF;

  v_normalized := lower(btrim(p_prefix));

  IF length(v_normalized) < 3 THEN
    RAISE EXCEPTION 'Search term must be at least 3 characters.';
  END IF;

  -- No wildcard characters from the caller. This is not about escaping them for safety — a
  -- parameterised LIKE is already injection-safe — it is that a caller-supplied % or _ changes
  -- what the pattern MATCHES, letting "a%" silently become a broader search than a 3-character
  -- minimum was meant to allow.
  IF v_normalized ~ '[%_]' THEN
    RAISE EXCEPTION 'Search term may not contain %% or _.';
  END IF;

  -- Rate limit, read from the audit trail itself rather than a new table: count this user's own
  -- quick_scribe_search rows in the last 60 seconds. The row this call is about to write is not
  -- counted yet, so the limit is "already made 20 searches", not "about to make the 21st".
  SELECT count(*) INTO v_recent_count
    FROM public.phi_access_audit
   WHERE user_id = v_user_id
     AND source = 'quick_scribe_search'
     AND accessed_at > now() - interval '60 seconds';

  IF v_recent_count >= 20 THEN
    RAISE EXCEPTION 'Too many searches in the last minute — please wait before searching again.';
  END IF;

  BEGIN
    INSERT INTO public.phi_access_audit (
      hospital_id, user_id, table_name, row_id, field_names, access_type, source, search_term
    ) VALUES (
      v_hospital_id, v_user_id, 'quick_scribe_notes', '*list*',
      ARRAY['visit_code', 'patient_name', 'patient_age', 'patient_sex', 'created_at'],
      'read', 'quick_scribe_search', v_normalized
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'quick_scribe_search_by_name: audit insert failed: %', SQLERRM;
  END;

  RETURN QUERY
    SELECT qsn.id, qsn.visit_code, qsn.patient_name, qsn.patient_age, qsn.patient_sex,
           qsn.created_at, u.full_name
      FROM public.quick_scribe_notes qsn
      LEFT JOIN public.users u ON u.id = qsn.doctor_id
     WHERE qsn.hospital_id = v_hospital_id
       AND qsn.is_deleted = false
       AND qsn.purge_after > now()
       -- text_pattern_ops index on patient_name_norm (20261111000009) serves this directly —
       -- the LIKE pattern here is built from the SAME lower(btrim()) expression the generated
       -- column uses, so the index expression and the query expression are guaranteed identical.
       AND qsn.patient_name_norm LIKE (v_normalized || '%')
       AND (p_all_doctors OR qsn.doctor_id = v_user_id)
     ORDER BY qsn.created_at DESC
     LIMIT 10;
END;
$$;

COMMENT ON FUNCTION public.quick_scribe_search_by_name(text, boolean) IS
  'The lost-paper fallback: prefix search over patient_name, minimum 3 characters, capped at 10 '
  'results, rate-limited to 20 calls/minute per user via phi_access_audit. Defaults to the '
  'caller''s own notes; pass p_all_doctors=true to search the whole hospital. Same narrow summary '
  'shape as the visit-code lookup — never note content.';

REVOKE ALL ON FUNCTION public.quick_scribe_search_by_name(text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.quick_scribe_search_by_name(text, boolean) TO authenticated;

-- ── Amendments ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.quick_scribe_note_amendments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id     UUID NOT NULL REFERENCES public.quick_scribe_notes(id) ON DELETE CASCADE,
  hospital_id UUID NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  -- public.users(id), never auth.users(id) — check:user-fk.
  amended_by  UUID NOT NULL REFERENCES public.users(id),
  amended_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NOT NULL, deliberately: an amendment with no stated reason is indistinguishable from the
  -- silent rewrite this table exists to replace.
  reason      TEXT NOT NULL,
  -- What changed, as a small JSON patch (e.g. {"diagnosis": "corrected text"}) — a diff against
  -- the note at the time of amendment, not a second full copy of it.
  patch       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.quick_scribe_note_amendments ENABLE ROW LEVEL SECURITY;

-- SELECT and INSERT only — the same append-only stance as quick_scribe_notes itself. An
-- amendment that could itself be edited or deleted would defeat the entire point of this table.
DROP POLICY IF EXISTS "quick_scribe_note_amendments_select" ON public.quick_scribe_note_amendments;
CREATE POLICY "quick_scribe_note_amendments_select" ON public.quick_scribe_note_amendments
  FOR SELECT
  USING (
    hospital_id = public.get_user_hospital_id()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.hospital_id = quick_scribe_note_amendments.hospital_id
        AND u.role::text IN ('doctor', 'mrd_officer', 'hospital_admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "quick_scribe_note_amendments_insert" ON public.quick_scribe_note_amendments;
CREATE POLICY "quick_scribe_note_amendments_insert" ON public.quick_scribe_note_amendments
  FOR INSERT
  WITH CHECK (
    hospital_id = public.get_user_hospital_id()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.hospital_id = quick_scribe_note_amendments.hospital_id
        AND u.role::text IN ('doctor', 'mrd_officer', 'hospital_admin', 'super_admin')
    )
  );

CREATE INDEX IF NOT EXISTS idx_qs_note_amendments_note
  ON public.quick_scribe_note_amendments (note_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_qs_note_amendments_hospital
  ON public.quick_scribe_note_amendments (hospital_id);

-- patch can carry corrected clinical text (a fixed diagnosis, a corrected drug name), so this
-- gets the same PHI audit trigger every clinical table carries.
DROP TRIGGER IF EXISTS log_phi_quick_scribe_note_amendments ON public.quick_scribe_note_amendments;
CREATE TRIGGER log_phi_quick_scribe_note_amendments
  AFTER INSERT OR UPDATE OR DELETE ON public.quick_scribe_note_amendments
  FOR EACH ROW EXECUTE FUNCTION public.log_phi_change();

COMMENT ON TABLE public.quick_scribe_note_amendments IS
  'Append-only corrections against a Quick Scribe note. quick_scribe_notes itself has no UPDATE '
  'or DELETE policy (20261111000002) — this table is the sanctioned way to record "this was '
  'wrong, here is the correction and why", without ever rewriting the printed original.';
