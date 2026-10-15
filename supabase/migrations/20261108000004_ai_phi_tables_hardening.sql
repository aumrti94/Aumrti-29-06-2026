-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Harden the three AI PHI tables: audit, role predicates, retention, immutability
--
-- WHAT IS WRONG TODAY. All three were created in the same batch with the same four-line RLS
-- block and none has been revisited since:
--
--   ai_safety_flags       20260521000007:18-24
--   ai_suggestions_audit  20260521000001:25-33
--   patient_ai_context    20260521000008:21-27
--
-- Each policy is `USING (hospital_id = (SELECT hospital_id FROM users WHERE auth_user_id =
-- auth.uid())) WITH CHECK (same)`. No FOR clause, which in Postgres means FOR ALL. No role
-- predicate. Consequences, all four of them real:
--
--   * Any authenticated user in the tenant can SELECT every AI clinical assertion about every
--     patient. A receptionist can read the AI's differential diagnosis for a colleague's
--     relative. There is no role gate of any kind.
--   * Any authenticated user can UPDATE and DELETE those rows. ai_suggestions_audit is the
--     NABH E9 governance trail and it is editable by the staff it exists to hold accountable.
--   * No audit trigger. phi_access_audit (20260628000003) is the correct pattern and its
--     `source` CHECK already includes 'ai_feature' — a value no code path has ever written. The
--     slot was designed for this and left empty.
--   * No retention period. purge_old_phi_audit() exists for phi_access_audit; nothing
--     equivalent exists for AI-derived PHI, so it accumulates indefinitely against DPDP §8(7)
--     storage limitation.
--
-- THE ONE DISTINCTION THAT DRIVES THIS WHOLE MIGRATION. These three tables are not the same
-- kind of thing and must not get the same treatment:
--
--   ai_suggestions_audit  — an EVENT RECORD. What the AI said at a moment in time. Must be
--                           immutable. Re-deriving it is meaningless.
--   ai_safety_flags       — an EVENT RECORD, with one mutable field: was_overridden /
--                           overridden_by / override_reason are filled in AFTER the flag is
--                           raised. So "immutable" here means column-scoped, not absolute.
--   patient_ai_context    — a STATE PROJECTION. Rewritten on every refresh by an UPSERT
--                           (supabase/functions/update-patient-ai-context/index.ts:188-201).
--                           Making it immutable would break the feature outright. It gets
--                           audit + role predicate + retention and stays mutable, and the
--                           erasure problem it creates is handled in 20261108000005.
--
-- Treating all three identically is the obvious mistake available here and it would either
-- break the context refresh or leave the governance trail editable.
-- ═════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. A role predicate helper
--
-- Inlining a users-table EXISTS into nine policies would mean nine places to fix when the role
-- vocabulary changes, and the existing policies' `(SELECT hospital_id FROM users WHERE
-- auth_user_id = auth.uid())` form has a second defect worth not repeating: it is a scalar
-- subquery, so a user row duplicated across hospitals raises 21000 (more than one row returned)
-- at query time rather than failing closed.
--
-- STABLE + SECURITY DEFINER so the planner caches it per statement and it can read users
-- regardless of the caller's own policy on that table — the same shape as the existing
-- public.is_aumrti_admin() and public.get_user_hospital_id().
-- ─────────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.has_ai_clinical_read(p_hospital_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
     WHERE u.auth_user_id = auth.uid()
       AND u.hospital_id  = p_hospital_id
       AND u.role IN (
         -- Roles with a clinical or governance reason to read an AI assertion about a patient.
         -- Chosen against src/lib/appRoles.ts APP_ROLES. Deliberately EXCLUDED and why:
         --   receptionist, accountant, billing_executive, billing_staff, hr_manager, cfo
         --     — no clinical reason to see a differential diagnosis or a risk flag;
         --   lab_tech / lab_technician / radiologist / pharmacist
         --     — included, because AI suggestions in their own modules (critical-finding
         --       detection, ADR flags, dispense checks) are theirs to act on. If a hospital
         --       disagrees this is the one list to narrow.
         'hospital_admin', 'super_admin', 'doctor', 'nurse',
         'pharmacist', 'lab_tech', 'lab_technician', 'radiologist'
       )
  );
$$;

COMMENT ON FUNCTION public.has_ai_clinical_read IS
  'True when the caller is staff at p_hospital_id in a role with a clinical or governance '
  'reason to read AI-derived PHI. Single source of truth for the role predicate on '
  'ai_suggestions_audit / ai_safety_flags / patient_ai_context. Excludes receptionist and all '
  'finance/HR roles.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. ai_suggestions_audit — read-gated, append-only
--
-- The original FOR ALL policy is replaced, not supplemented. Postgres ORs permissive policies
-- together, so leaving `ai_audit_hospital_isolation` in place would make everything below
-- cosmetic — a receptionist would still match the old policy and read and write freely. This is
-- the one place in this migration where an existing policy must be DROPPED rather than added
-- alongside, and it is why this file is a behaviour change and not purely additive.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "ai_audit_hospital_isolation" ON public.ai_suggestions_audit;

DROP POLICY IF EXISTS ai_audit_clinical_read ON public.ai_suggestions_audit;
CREATE POLICY ai_audit_clinical_read
  ON public.ai_suggestions_audit
  FOR SELECT TO authenticated
  USING (public.has_ai_clinical_read(hospital_id));

-- INSERT stays open to the same clinical roles, because the write path is the browser:
-- src/hooks/useAIAudit.ts:22 inserts from the authenticated session, not from an Edge Function.
-- Narrowing INSERT to service_role (the phi_access_audit shape) would silence the entire
-- governance trail — and silently, because useAIAudit.ts:33-34 swallows the error in a
-- `catch { console.warn(...) }`. Flagged under separate cover; not changed here.
DROP POLICY IF EXISTS ai_audit_clinical_insert ON public.ai_suggestions_audit;
CREATE POLICY ai_audit_clinical_insert
  ON public.ai_suggestions_audit
  FOR INSERT TO authenticated
  WITH CHECK (public.has_ai_clinical_read(hospital_id));

DROP POLICY IF EXISTS ai_audit_deny_update ON public.ai_suggestions_audit;
CREATE POLICY ai_audit_deny_update
  ON public.ai_suggestions_audit
  FOR UPDATE TO authenticated, anon
  USING (FALSE);

DROP POLICY IF EXISTS ai_audit_deny_delete ON public.ai_suggestions_audit;
CREATE POLICY ai_audit_deny_delete
  ON public.ai_suggestions_audit
  FOR DELETE TO authenticated, anon
  USING (FALSE);

-- ai_audit_service_role (20260521000001:32) is left in place: Edge Functions legitimately need
-- full access, and service_role bypasses RLS regardless, so removing it would change nothing
-- except the clarity of the intent.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. ai_safety_flags — read-gated, append-only EXCEPT the override fields
--
-- A clinician overriding a safety flag must be able to record that they did so, with a reason.
-- That is a legitimate UPDATE and a blanket deny would block it. So the deny is a trigger that
-- inspects WHICH columns changed rather than an RLS policy that cannot.
--
-- One-way only: was_overridden false->true is allowed, true->false is not. An override cannot
-- be un-recorded, which is the whole point of recording it.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "ai_safety_isolation" ON public.ai_safety_flags;

DROP POLICY IF EXISTS ai_safety_clinical_read ON public.ai_safety_flags;
CREATE POLICY ai_safety_clinical_read
  ON public.ai_safety_flags
  FOR SELECT TO authenticated
  USING (public.has_ai_clinical_read(hospital_id));

DROP POLICY IF EXISTS ai_safety_clinical_insert ON public.ai_safety_flags;
CREATE POLICY ai_safety_clinical_insert
  ON public.ai_safety_flags
  FOR INSERT TO authenticated
  WITH CHECK (public.has_ai_clinical_read(hospital_id));

-- UPDATE is permitted at the policy level and constrained at the column level by the trigger.
DROP POLICY IF EXISTS ai_safety_override_update ON public.ai_safety_flags;
CREATE POLICY ai_safety_override_update
  ON public.ai_safety_flags
  FOR UPDATE TO authenticated
  USING (public.has_ai_clinical_read(hospital_id))
  WITH CHECK (public.has_ai_clinical_read(hospital_id));

DROP POLICY IF EXISTS ai_safety_deny_delete ON public.ai_safety_flags;
CREATE POLICY ai_safety_deny_delete
  ON public.ai_safety_flags
  FOR DELETE TO authenticated, anon
  USING (FALSE);

CREATE OR REPLACE FUNCTION public.guard_ai_safety_flag_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- The assertion itself is history and cannot be rewritten.
  IF NEW.hospital_id IS DISTINCT FROM OLD.hospital_id
     OR NEW.patient_id  IS DISTINCT FROM OLD.patient_id
     OR NEW.feature_key IS DISTINCT FROM OLD.feature_key
     OR NEW.flags       IS DISTINCT FROM OLD.flags
     OR NEW.created_at  IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION
      'ai_safety_flags row % is append-only; only was_overridden / overridden_by / '
      'override_reason may be updated', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.was_overridden IS TRUE AND NEW.was_overridden IS NOT TRUE THEN
    RAISE EXCEPTION 'ai_safety_flags row %: an override cannot be withdrawn', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- An override with no attributed clinician is not evidence of anything.
  IF NEW.was_overridden IS TRUE AND NEW.overridden_by IS NULL THEN
    RAISE EXCEPTION 'ai_safety_flags row %: overridden_by is required when was_overridden is true', OLD.id
      USING ERRCODE = 'not_null_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_ai_safety_flag_update ON public.ai_safety_flags;
CREATE TRIGGER trg_guard_ai_safety_flag_update
  BEFORE UPDATE ON public.ai_safety_flags
  FOR EACH ROW EXECUTE FUNCTION public.guard_ai_safety_flag_update();

-- ai_safety_flags.overridden_by (20260521000007:10) is a bare `uuid` with NO foreign key at
-- all. It is not a `*_by`-to-auth.users mistake; it is an unconstrained column, so
-- check:user-fk — which looks for wrong FK TARGETS — has nothing to flag. Point it at
-- public.users(id) per CLAUDE.md. NOT VALID because existing rows may already hold auth uids
-- written by whatever populated them, and failing this deploy over historical data is the wrong
-- trade (same reasoning as 20261106000017).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_safety_flags_overridden_by_fkey'
  ) THEN
    ALTER TABLE public.ai_safety_flags
      ADD CONSTRAINT ai_safety_flags_overridden_by_fkey
      FOREIGN KEY (overridden_by) REFERENCES public.users(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_safety_flags_overridden_by
  ON public.ai_safety_flags (overridden_by)
  WHERE overridden_by IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4. patient_ai_context — read-gated, STAYS MUTABLE
--
-- Writes are restricted to service_role because the only writer is an Edge Function
-- (update-patient-ai-context). This is the one of the three where narrowing the write path is
-- safe, and it is worth doing: it means a tenant user cannot hand-edit the AI's view of a
-- patient, which is otherwise possible today.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "patient_ai_context_isolation" ON public.patient_ai_context;

DROP POLICY IF EXISTS patient_ai_context_clinical_read ON public.patient_ai_context;
CREATE POLICY patient_ai_context_clinical_read
  ON public.patient_ai_context
  FOR SELECT TO authenticated
  USING (public.has_ai_clinical_read(hospital_id));

DROP POLICY IF EXISTS patient_ai_context_deny_auth_write ON public.patient_ai_context;
CREATE POLICY patient_ai_context_deny_auth_write
  ON public.patient_ai_context
  FOR INSERT TO authenticated, anon
  WITH CHECK (FALSE);

DROP POLICY IF EXISTS patient_ai_context_deny_auth_update ON public.patient_ai_context;
CREATE POLICY patient_ai_context_deny_auth_update
  ON public.patient_ai_context
  FOR UPDATE TO authenticated, anon
  USING (FALSE);

DROP POLICY IF EXISTS patient_ai_context_deny_auth_delete ON public.patient_ai_context;
CREATE POLICY patient_ai_context_deny_auth_delete
  ON public.patient_ai_context
  FOR DELETE TO authenticated, anon
  USING (FALSE);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 5. Audit triggers — into phi_access_audit, source 'ai_feature'
--
-- Uses the slot 20260628000003 already defined and never filled. Writes only metadata:
-- table_name, row_id, which FIELDS were touched, and who. Never a value. Putting the diff in
-- the audit row would duplicate the PHI into a second table and make the audit log itself a
-- disclosure surface.
--
-- LIMIT, STATED PLAINLY: this records WRITES, not READS. A trigger cannot observe a SELECT. So
-- "who read this patient's AI risk flags" is NOT answered by this migration and cannot be
-- answered by a trigger — it requires routing reads through an Edge Function that logs them,
-- which is how phi_access_audit's existing 'read' rows are produced. The role predicate in
-- §§2-4 is what reduces read exposure; this trigger covers the write side only. Anyone
-- claiming full DPDP §10 access accountability on these tables after this migration would be
-- overstating it.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.audit_ai_phi_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     uuid;
  v_hospital_id uuid;
  v_row_id      text;
  v_fields      text[];
  v_access      text;
BEGIN
  BEGIN
    IF TG_OP = 'DELETE' THEN
      v_hospital_id := OLD.hospital_id;
      v_row_id      := OLD.id::text;
      v_access      := 'write';
      v_fields      := ARRAY['*deleted*'];
    ELSE
      v_hospital_id := NEW.hospital_id;
      v_row_id      := NEW.id::text;
      v_access      := 'write';

      IF TG_OP = 'UPDATE' THEN
        -- Column names only, never values.
        SELECT array_agg(key ORDER BY key) INTO v_fields
          FROM jsonb_each(to_jsonb(NEW)) n
         WHERE n.value IS DISTINCT FROM (to_jsonb(OLD) -> n.key);
      ELSE
        v_fields := ARRAY['*insert*'];
      END IF;
    END IF;

    -- public.users(id), resolved from the auth uid. NULL for a service_role write, which is
    -- correct and matches phi_access_audit's documented "null = system/edge fn".
    SELECT u.id INTO v_user_id
      FROM public.users u
     WHERE u.auth_user_id = auth.uid()
     LIMIT 1;

    INSERT INTO public.phi_access_audit (
      hospital_id, user_id, table_name, row_id, field_names, access_type, source
    ) VALUES (
      v_hospital_id, v_user_id, TG_TABLE_NAME, v_row_id,
      COALESCE(v_fields, ARRAY[]::text[]), v_access, 'ai_feature'
    );

  EXCEPTION WHEN OTHERS THEN
    -- Same trade emit_api_event() documents and for the same reason: if the audit insert fails,
    -- the alternatives are to lose the audit row or to abort the clinical write that caused it.
    -- Losing an audit row is recoverable; blocking a drug-safety flag from being raised because
    -- an audit table is unavailable is not. The warning is the signal that it happened.
    RAISE WARNING 'audit_ai_phi_write failed for %.%: %', TG_TABLE_NAME, v_row_id, SQLERRM;
  END;

  RETURN NULL;  -- AFTER trigger; return value is ignored
END;
$$;

COMMENT ON FUNCTION public.audit_ai_phi_write IS
  'AFTER-trigger audit for AI PHI tables. Writes metadata only (table, row, changed field '
  'NAMES, actor) to phi_access_audit with source=''ai_feature'' — the value 20260628000003 '
  'defined and nothing had ever written. Covers WRITES only: a trigger cannot observe a SELECT, '
  'so read accountability on these tables is not provided by this and must not be claimed.';

DROP TRIGGER IF EXISTS trg_audit_ai_suggestions_audit ON public.ai_suggestions_audit;
CREATE TRIGGER trg_audit_ai_suggestions_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.ai_suggestions_audit
  FOR EACH ROW EXECUTE FUNCTION public.audit_ai_phi_write();

DROP TRIGGER IF EXISTS trg_audit_ai_safety_flags ON public.ai_safety_flags;
CREATE TRIGGER trg_audit_ai_safety_flags
  AFTER INSERT OR UPDATE OR DELETE ON public.ai_safety_flags
  FOR EACH ROW EXECUTE FUNCTION public.audit_ai_phi_write();

DROP TRIGGER IF EXISTS trg_audit_patient_ai_context ON public.patient_ai_context;
CREATE TRIGGER trg_audit_patient_ai_context
  AFTER INSERT OR UPDATE OR DELETE ON public.patient_ai_context
  FOR EACH ROW EXECUTE FUNCTION public.audit_ai_phi_write();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 6. Retention
--
-- Three different periods because the tables hold three different kinds of thing, and a single
-- number would be wrong for at least two of them:
--
--   ai_suggestions_audit  5 years — NABH E9 governance evidence and SaMD post-market
--                                   surveillance. Same as ai_suggestion_outcomes so a
--                                   suggestion and its outcome expire together; purging the
--                                   suggestion first would orphan the outcome (FK is ON DELETE
--                                   CASCADE, so it would silently take the outcome with it).
--   ai_safety_flags       5 years — a drug-safety override is medico-legal evidence.
--   patient_ai_context   18 months on last_updated — it is a DERIVED projection, regenerable
--                                   from source records at any time, so retaining a stale copy
--                                   past clinical usefulness is pure DPDP §8(7) exposure with
--                                   no offsetting value. This is the one place a SHORT period
--                                   is the safer choice.
--
-- NOT SCHEDULED HERE, same reasoning as 20261108000001 §6: these are credential-free SQL and
-- belong in the SQL-RPC cron group, not behind the Vault gate that silently skips ten other
-- scheduling migrations.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.purge_old_ai_phi()
RETURNS TABLE (table_name text, deleted_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  DELETE FROM public.ai_safety_flags WHERE created_at < now() - INTERVAL '5 years';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN QUERY SELECT 'ai_safety_flags'::text, v_n;

  -- Deliberately last among the audit tables: ai_suggestion_outcomes FKs this table ON DELETE
  -- CASCADE, so this delete also removes outcomes at the same age. Both are 5 years, so that is
  -- intended rather than incidental — but if the outcome retention is ever lengthened, this
  -- CASCADE becomes a silent data-loss path and must be revisited here.
  DELETE FROM public.ai_suggestions_audit WHERE created_at < now() - INTERVAL '5 years';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN QUERY SELECT 'ai_suggestions_audit'::text, v_n;

  DELETE FROM public.patient_ai_context WHERE last_updated < now() - INTERVAL '18 months';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN QUERY SELECT 'patient_ai_context'::text, v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_ai_phi() FROM PUBLIC, authenticated, anon;

COMMENT ON FUNCTION public.purge_old_ai_phi IS
  'DPDP §8(7) storage-limitation purge for AI PHI tables. 5 years for the two event records '
  '(NABH E9 / medico-legal), 18 months for patient_ai_context because it is a regenerable '
  'projection. REVOKEd from all app roles — mirrors purge_old_phi_audit() (20260628000003 §4).';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THE ROLE PREDICATE BREAKS IN EXISTING UI — checked against call sites, not guessed
--
-- This is the part to read before approving. §§2-4 replace FOR ALL policies, so this migration
-- REMOVES access that exists today. Four consumers:
--
--  1. src/components/ai/AIAuditLogDrawer.tsx:53 — reads ai_suggestions_audit scoped to
--     hospitalId (+ patientId). Opened from clinical workspaces. UNAFFECTED for doctor, nurse,
--     pharmacist, lab_tech, radiologist, hospital_admin, super_admin. BREAKS (renders its
--     existing "No AI decisions recorded yet" empty state) for receptionist, accountant,
--     billing_executive, billing_staff, hr_manager, cfo. Note the failure mode: the component
--     destructures only `{ data }` and has no error branch, so a denied read is
--     indistinguishable from no data. If any of those roles can currently reach a screen that
--     mounts this drawer, they will see a plausible empty log rather than a permission message.
--     Worth a RoleGuard on the drawer's entry point rather than relying on RLS to be invisible.
--
--  2. src/components/analytics/AIPerformanceDashboard.tsx:77 — reads ai_suggestions_audit for
--     the tenant's own AI governance tab. Same role split. This one is more likely to matter in
--     practice: an accountant or CFO looking at the analytics module would previously have seen
--     AI acceptance stats and will now see zeros. Line 303 labels it "NABH E9 — AI Governance
--     Standard. Data sourced from ai_suggestions_audit table", so a silently-zero version of
--     this panel is actively misleading. Needs an explicit "not available for your role" state.
--
--  3. src/hooks/useAIAudit.ts:22 — the INSERT. Preserved for all clinical roles by
--     ai_audit_clinical_insert. BUT: if an excluded role ever triggers an AI suggestion, the
--     insert now fails, and lines 33-34 catch it into console.warn. The governance trail would
--     go quiet for that path with no visible symptom. Audit which roles can reach
--     AISuggestionCard before release — src/components/ai/AISuggestionCard.tsx:73 is the one
--     shared call site.
--
--  4. src/hooks/usePatientAIContext.ts:31 and src/pages/patients/PatientSummaryPage.tsx:146 —
--     both invoke the Edge Function, which writes as service_role and is unaffected by §4's
--     write denial. Any component that reads patient_ai_context directly from the browser
--     must be confirmed to be in a clinical role; the read policy now gates it.
--
-- REVERSIBILITY. Re-applying 20260521000001:27-29, 20260521000007:20-22 and 20260521000008:23-25
-- restores the previous behaviour exactly. Because Postgres ORs permissive policies, re-adding
-- any one of those three FOR ALL policies silently re-opens that table — so a partial rollback
-- is worse than none and must be all-or-nothing.
-- ═════════════════════════════════════════════════════════════════════════════════════════════
