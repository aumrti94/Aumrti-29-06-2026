-- Quick Scribe, round 3 (h): the door. Three SECURITY DEFINER RPCs that let a doctor retrieve a
-- stored note — audited, tenant-scoped, and deliberately narrow about what a LIST result shows.
--
-- Everything these RPCs read has existed since 20261107000002/3: hospital_id, doctor_id,
-- patient_name, the visit code, the structured note. There are zero SELECTs on this table
-- anywhere in the repo before this migration. The capability was fully provisioned and had no
-- entry point; this is the entry point.
--
-- ── Why a browser SELECT could never have done this ───────────────────────────────────────
--
-- phi_access_audit denies INSERT to `authenticated` outright (20260628000003:54-58,
-- `WITH CHECK (FALSE)`), so a client-side `.from("quick_scribe_notes").select()` is PHYSICALLY
-- incapable of writing the audit row this read requires. The retrieval path has to be a function
-- that runs as the table owner and writes its own audit row inside the same transaction as the
-- read it is accounting for.
--
-- ── The skeleton, copied from replay_webhook_delivery (20261019000004) ───────────────────
--
-- SECURITY DEFINER + SET search_path = public; tenant from get_user_hospital_id(), null-checked,
-- then repeated as an explicit predicate on every query (SECURITY DEFINER bypasses RLS, so a
-- guessed id without that predicate would cross a tenant boundary); role via has_role(); REVOKE
-- ALL + GRANT EXECUTE TO authenticated at the end. 'doctor', 'mrd_officer', 'hospital_admin' and
-- 'super_admin' are all confirmed app_role enum members (20260321162749 base set +
-- 20260517000003's ADD VALUE for mrd_officer), so has_role() is safe to call with each literal —
-- unlike the EXISTS-based role check 20261107000003/20261111000002 use for quick_scribe_notes'
-- RLS policies, which compares as text specifically because a hospital's CUSTOM role names are
-- not enum members. These four fixed system roles never have that problem.
--
-- ── Auditing, copied from audit_ai_phi_write (20261108000004) ─────────────────────────────
--
-- Same user resolution (public.users via auth_user_id, NULL for a service-role caller — doesn't
-- apply here since these are `authenticated`-only, but the pattern is kept for consistency with
-- the rest of the audit surface) and the same EXCEPTION WHEN OTHERS THEN RAISE WARNING swallow:
-- an audit-insert failure degrades to a warning rather than refusing a doctor mid-consult the
-- note they need for the patient in front of them.
--
-- ── The two-step split is a privacy boundary, not a convenience ───────────────────────────
--
-- quick_scribe_lookup_by_code and quick_scribe_recent_notes are LIST results and return ONLY
-- name, age, sex, visit date and the authoring doctor's name — never the address, never any
-- field from structured_note_json, never the transcript. A doctor scanning ten rows to recognise
-- the right patient sees enough to recognise them and nothing more. quick_scribe_get_note is the
-- separate, deliberate second call that returns the clinical content, made only once a specific
-- note has been chosen — and it writes its OWN audit row, distinct from the list call's.
--
-- Transcript is withheld even from quick_scribe_get_note: it is not part of what gets carried
-- forward (medicines, summary, advice), it may carry bystander speech, and nothing in the
-- retrieval UI has a use for it.

-- ── 1. Exact lookup by the code printed on the patient's paper — the primary path ─────────

CREATE OR REPLACE FUNCTION public.quick_scribe_lookup_by_code(p_code text)
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
  v_hospital_id uuid := public.get_user_hospital_id();
  v_user_id     uuid;
  v_normalized  text;
  v_match_id    uuid;
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
    RAISE EXCEPTION 'Not authorized to look up Quick Scribe notes.';
  END IF;

  -- "QS-" is optional on input: a doctor typing what is printed on the paper may or may not
  -- include it. upper(btrim()) first, then add the prefix back only if it is missing, so
  -- "7k3m9", "7K3M9" and "QS-7K3M9" all resolve to the same stored code.
  v_normalized := upper(btrim(p_code));
  IF v_normalized !~ '^QS-' THEN
    v_normalized := 'QS-' || v_normalized;
  END IF;

  SELECT u.id INTO v_user_id FROM public.users u WHERE u.auth_user_id = auth.uid() LIMIT 1;

  SELECT qsn.id INTO v_match_id
    FROM public.quick_scribe_notes qsn
   WHERE qsn.hospital_id = v_hospital_id
     AND qsn.visit_code = v_normalized
     -- Defence in depth alongside the RLS policy's own predicate (20261111000002): a note
     -- past its retention boundary must be unreachable here too, not merely scheduled for
     -- deletion, so a late purge run can never turn this into a way to read data already
     -- past the window we told the patient it would be kept for.
     AND qsn.is_deleted = false
     AND qsn.purge_after > now();

  -- Audited whether or not a match was found — a failed lookup attempt is still an access
  -- attempt worth a record, and it is the only way an anomalous run of misses would ever surface.
  BEGIN
    INSERT INTO public.phi_access_audit (
      hospital_id, user_id, table_name, row_id, field_names, access_type, source, search_term
    ) VALUES (
      v_hospital_id, v_user_id, 'quick_scribe_notes', COALESCE(v_match_id::text, ''),
      ARRAY['visit_code', 'patient_name', 'patient_age', 'patient_sex', 'created_at', 'doctor_name'],
      'read', 'quick_scribe_lookup', v_normalized
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'quick_scribe_lookup_by_code: audit insert failed: %', SQLERRM;
  END;

  IF v_match_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT qsn.id, qsn.visit_code, qsn.patient_name, qsn.patient_age, qsn.patient_sex,
           qsn.created_at, u.full_name
      FROM public.quick_scribe_notes qsn
      LEFT JOIN public.users u ON u.id = qsn.doctor_id
     WHERE qsn.id = v_match_id;
END;
$$;

COMMENT ON FUNCTION public.quick_scribe_lookup_by_code(text) IS
  'Exact lookup by the visit code printed on a Quick Scribe note. Returns a summary row only — '
  'name, age, sex, visit date, authoring doctor — never note content. Call '
  'quick_scribe_get_note() with the returned id for the full record. Audited: writes exactly one '
  'phi_access_audit row per call, whether or not a match was found.';

REVOKE ALL ON FUNCTION public.quick_scribe_lookup_by_code(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.quick_scribe_lookup_by_code(text) TO authenticated;

-- ── 2. This doctor's own last 10 notes — the "patient came back this week" convenience ────

CREATE OR REPLACE FUNCTION public.quick_scribe_recent_notes()
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
  v_hospital_id uuid := public.get_user_hospital_id();
  v_user_id     uuid;
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
    RAISE EXCEPTION 'Not authorized to look up Quick Scribe notes.';
  END IF;

  SELECT u.id INTO v_user_id FROM public.users u WHERE u.auth_user_id = auth.uid() LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No staff record for the current user.';
  END IF;

  -- Scoped to the CALLER's own notes, not every doctor's — this is the convenience list for "I
  -- saw this patient myself recently", not the broader hospital-wide search. Served by
  -- idx_qs_notes_doctor_recent, so the common case (a handful of notes today) is one index scan.
  BEGIN
    INSERT INTO public.phi_access_audit (
      hospital_id, user_id, table_name, row_id, field_names, access_type, source, search_term
    ) VALUES (
      v_hospital_id, v_user_id, 'quick_scribe_notes', '*list*',
      ARRAY['visit_code', 'patient_name', 'patient_age', 'patient_sex', 'created_at'],
      'read', 'quick_scribe_lookup', NULL
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'quick_scribe_recent_notes: audit insert failed: %', SQLERRM;
  END;

  RETURN QUERY
    SELECT qsn.id, qsn.visit_code, qsn.patient_name, qsn.patient_age, qsn.patient_sex,
           qsn.created_at, u.full_name
      FROM public.quick_scribe_notes qsn
      LEFT JOIN public.users u ON u.id = qsn.doctor_id
     WHERE qsn.hospital_id = v_hospital_id
       AND qsn.doctor_id = v_user_id
       AND qsn.is_deleted = false
       AND qsn.purge_after > now()
     ORDER BY qsn.created_at DESC
     LIMIT 10;
END;
$$;

COMMENT ON FUNCTION public.quick_scribe_recent_notes() IS
  'The calling doctor''s own last 10 Quick Scribe notes at their hospital. Summary rows only, '
  'same shape and same privacy limits as quick_scribe_lookup_by_code(). Audited once per call.';

REVOKE ALL ON FUNCTION public.quick_scribe_recent_notes() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.quick_scribe_recent_notes() TO authenticated;

-- Serves quick_scribe_recent_notes() above.
CREATE INDEX IF NOT EXISTS idx_qs_notes_doctor_recent
  ON public.quick_scribe_notes (hospital_id, doctor_id, created_at DESC)
  WHERE is_deleted = false;

-- ── 3. The full note — a deliberate second call, once a specific note has been chosen ─────

CREATE OR REPLACE FUNCTION public.quick_scribe_get_note(p_note_id uuid)
RETURNS TABLE (
  id               uuid,
  visit_code       text,
  patient_name     text,
  patient_age      text,
  patient_sex      text,
  created_at       timestamptz,
  doctor_name      text,
  chief_complaint  text,
  advice           text,
  diagnosis        text,
  reports_reviewed text,
  follow_up_date   date,
  structured_note_json jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hospital_id uuid := public.get_user_hospital_id();
  v_user_id     uuid;
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
    RAISE EXCEPTION 'Not authorized to read Quick Scribe notes.';
  END IF;

  SELECT u.id INTO v_user_id FROM public.users u WHERE u.auth_user_id = auth.uid() LIMIT 1;

  -- No transcript_text in the SELECT list below, by design — see the migration header. The
  -- retrieval UI carries forward medicines and clinical content, never the raw recording.
  RETURN QUERY
    SELECT qsn.id, qsn.visit_code, qsn.patient_name, qsn.patient_age, qsn.patient_sex,
           qsn.created_at, u.full_name,
           qsn.chief_complaint, qsn.advice, qsn.diagnosis, qsn.reports_reviewed,
           qsn.follow_up_date, qsn.structured_note_json
      FROM public.quick_scribe_notes qsn
      LEFT JOIN public.users u ON u.id = qsn.doctor_id
     WHERE qsn.id = p_note_id
       -- Tenant predicate inside the function, same reasoning as replay_webhook_delivery: a
       -- guessed uuid must not cross a tenant boundary just because SECURITY DEFINER bypasses RLS.
       AND qsn.hospital_id = v_hospital_id
       AND qsn.is_deleted = false
       AND qsn.purge_after > now();

  -- Audited as its own distinct read, separate from whichever list call (by code or recent)
  -- led the doctor here — the medico-legal question "was this patient's full clinical content
  -- actually opened" is answered by this row, not by the earlier summary-list row.
  BEGIN
    INSERT INTO public.phi_access_audit (
      hospital_id, user_id, table_name, row_id, field_names, access_type, source
    ) VALUES (
      v_hospital_id, v_user_id, 'quick_scribe_notes', p_note_id::text,
      ARRAY['chief_complaint', 'advice', 'diagnosis', 'reports_reviewed', 'follow_up_date',
            'structured_note_json'],
      'read', 'quick_scribe_lookup'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'quick_scribe_get_note: audit insert failed: %', SQLERRM;
  END;
END;
$$;

COMMENT ON FUNCTION public.quick_scribe_get_note(uuid) IS
  'The full content of one Quick Scribe note, for the read-only prior-visit panel and carry-'
  'forward. Never returns transcript_text. A deliberate second call after a list RPC has '
  'identified which note — writes its own phi_access_audit row, distinct from the list call''s.';

REVOKE ALL ON FUNCTION public.quick_scribe_get_note(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.quick_scribe_get_note(uuid) TO authenticated;
