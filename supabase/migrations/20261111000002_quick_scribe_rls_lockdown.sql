-- Quick Scribe, round 3 (b): stop the whole clinic being able to silently rewrite a printed note.
--
-- 20261107000003:62-80 narrowed read access from "every authenticated user in the tenant" to
-- doctor / mrd_officer / hospital_admin / super_admin, which was the right call. But it was written
-- as a single policy with NO `FOR` clause, which in Postgres means `FOR ALL`, and with a `WITH CHECK`
-- that mirrors the `USING` clause. Two consequences nobody intended:
--
--   1. All four roles can UPDATE any note in the tenant, and DELETE it. A Quick Scribe note is a
--      point-in-time record of a document that was PRINTED AND HANDED TO A PATIENT. If the stored
--      row can be edited afterwards, the paper in the patient's hand and our record of it can
--      disagree, with only the audit trigger to notice. Nothing in the app has ever needed this —
--      there is exactly one write path in the entire repo and it is an INSERT
--      (QuickScribePage.tsx:191).
--
--   2. Nothing was ever going to notice, because until now the table had no SELECT path either.
--      The feature that makes old notes findable is also what makes this reachable, so it is
--      closed here, before the retrieval UI lands.
--
-- Separately: the role EXISTS subquery did not constrain u.hospital_id. get_user_hospital_id()
-- is `SELECT hospital_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1` — unordered. A person
-- holding rows at two hospitals (receptionist at A, doctor at B) could satisfy the role test from
-- the B row while the tenant resolver returned A. Not a cross-tenant leak, since both predicates
-- still have to hold, but a real privilege gap: it grants A-scoped access on the strength of a
-- role held only at B. Tying the role row to the SAME hospital as the note closes it.
--
-- UPDATE and DELETE are denied by omission: Postgres permits only what a policy allows. The
-- retention executor (20261111000003) runs SECURITY DEFINER and bypasses RLS entirely, which is
-- the intended and only remaining path by which these rows change.
--
-- Corrections to a printed note belong in the append-only amendment table, not here.

DROP POLICY IF EXISTS "hospital_isolation" ON public.quick_scribe_notes;
DROP POLICY IF EXISTS "quick_scribe_clinical_access" ON public.quick_scribe_notes;
DROP POLICY IF EXISTS "quick_scribe_notes_select" ON public.quick_scribe_notes;
DROP POLICY IF EXISTS "quick_scribe_notes_insert" ON public.quick_scribe_notes;

CREATE POLICY "quick_scribe_notes_select" ON public.quick_scribe_notes
  FOR SELECT
  USING (
    hospital_id = public.get_user_hospital_id()
    -- Expiry enforced in the policy, not only by the executor. The executor is a scheduled job on
    -- a project where pg_cron has historically not run; if it is late, an expired note must still
    -- be unreachable rather than merely scheduled for deletion. Otherwise the retrieval UI becomes
    -- a way to read data we told the patient had been deleted.
    AND is_deleted = false
    AND purge_after > now()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        -- The predicate that was missing. Role must be held AT THIS HOSPITAL.
        AND u.hospital_id = quick_scribe_notes.hospital_id
        -- Compared as text, not cast to app_role: the role column carries custom roles that are
        -- not enum members (see 20261009000185), and a cast would error on those.
        AND u.role::text IN ('doctor', 'mrd_officer', 'hospital_admin', 'super_admin')
    )
  );

CREATE POLICY "quick_scribe_notes_insert" ON public.quick_scribe_notes
  FOR INSERT
  WITH CHECK (
    hospital_id = public.get_user_hospital_id()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.hospital_id = quick_scribe_notes.hospital_id
        AND u.role::text IN ('doctor', 'mrd_officer', 'hospital_admin', 'super_admin')
    )
  );

COMMENT ON TABLE public.quick_scribe_notes IS
  'Standalone Quick Scribe consultation notes. SELECT and INSERT only — a printed note is never '
  'edited or deleted through the API. Retention is enforced by purge_quick_scribe_notes(), which '
  'runs SECURITY DEFINER and is the sole remaining writer of UPDATE/DELETE.';
