-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Erasure as a SUPPRESSION STATE, not a delete
--
-- THE PROBLEM SECURITY POD IDENTIFIED, restated so the fix is checkable against it.
-- patient_ai_context is a derived projection. Its only writer is
-- supabase/functions/update-patient-ai-context/index.ts, whose write is an UPSERT on
-- (hospital_id, patient_id) at lines 188-201. So:
--
--   * DELETE FROM patient_ai_context WHERE patient_id = X satisfies an erasure request at the
--     moment it runs, and is undone the next time anyone opens that patient's summary page —
--     src/pages/patients/PatientSummaryPage.tsx:146 invokes the refresh on view, and
--     src/hooks/usePatientAIContext.ts:31 invokes it again. Erasure by deletion is not erasure
--     here; it is a pause of unknown duration ending at the next page load.
--   * Worse, the upsert at :194-195 hardcodes `past_surgeries: []` and `risk_flags: []`. So
--     ANY value in those two columns, from any source, is zeroed on every refresh. A populated
--     risk_flags today would survive exactly until the next patient-summary view.
--
-- So erasure has to stop the DERIVER, not clear the DERIVATION. The deletion is still required
-- — it just cannot be the whole mechanism, and it has to be the second step, not the first.
--
-- WHY A TABLE AND NOT A COLUMN ON patients. The suppression needs its own provenance: who
-- requested it, under which erasure request, when, and the ground (DPDP §12 erasure vs a
-- clinician-initiated AI opt-out vs a legal hold — different rights with different reversal
-- rules). A boolean on patients records none of that, and patients is a heavily-read PHI table
-- where adding a column has a wider blast radius than adding a table.
--
-- WHAT DOES NOT EXIST TODAY, stated plainly: data_erasure_requests (20261008000104) has NO
-- patient_id column — it is hospital-scoped only (id, hospital_id, requested_by, reason,
-- status, requested_at, reviewed_by, reviewed_at, admin_notes). There is therefore no
-- per-patient erasure request in the schema at all. §4 adds the linkage; the workflow UI to
-- file one is not in this migration and is not this pod's to build.
-- ═════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. The suppression state
--
-- One row per suppressed patient. The row's EXISTENCE with lifted_at IS NULL is the state —
-- not a boolean column — so the natural index is a partial unique index on the active ones and
-- a lift is recorded rather than destroyed. A suppression that can be deleted without trace is
-- a suppression a future audit cannot verify was ever honoured.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.patient_derivation_suppression (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id       uuid        NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  patient_id        uuid        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,

  -- WHICH derivations are suppressed. 'all' is the erasure case. The narrower scopes exist
  -- because a patient may object to AI processing without exercising erasure, and conflating
  -- the two forces an over-broad response to a narrow request.
  scope             text        NOT NULL DEFAULT 'all'
                                CHECK (scope IN (
                                  'all',              -- every AI/derived projection
                                  'ai_context',       -- patient_ai_context only
                                  'risk_scoring',     -- risk_flags / predictive scores only
                                  'ai_suggestions'    -- no new AI suggestions for this patient
                                )),

  -- WHY. Determines whether it can be lifted and by whom.
  ground            text        NOT NULL
                                CHECK (ground IN (
                                  'dpdp_erasure',     -- DPDP §12 — lift requires a new consent
                                  'consent_withdrawn',-- lift requires re-consent
                                  'patient_optout',   -- patient may re-opt-in
                                  'clinician_hold',   -- clinical judgement; clinician may lift
                                  'legal_hold'        -- lift requires legal sign-off
                                )),

  erasure_request_id uuid       REFERENCES public.data_erasure_requests(id) ON DELETE SET NULL,
  note              text,

  -- public.users(id) per CLAUDE.md — written from the app with useHospitalContext's users.id,
  -- NOT auth.getUser().id. Both of these are staff attribution.
  suppressed_by     uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  suppressed_at     timestamptz NOT NULL DEFAULT now(),

  lifted_by         uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  lifted_at         timestamptz,
  lift_reason       text,

  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT patient_derivation_suppression_lift_coherent
    CHECK (
      (lifted_at IS NULL  AND lifted_by IS NULL AND lift_reason IS NULL)
      OR (lifted_at IS NOT NULL AND lifted_by IS NOT NULL)
    ),

  -- A lift cannot predate the suppression.
  CONSTRAINT patient_derivation_suppression_lift_after
    CHECK (lifted_at IS NULL OR lifted_at >= suppressed_at)
);

-- At most one ACTIVE suppression per (patient, scope). Historical lifted rows are unconstrained
-- so the full history of suppress/lift cycles is retained.
CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_derivation_suppression_active
  ON public.patient_derivation_suppression (hospital_id, patient_id, scope)
  WHERE lifted_at IS NULL;

-- The hot path: the guard trigger in §3 runs this lookup on every projection write.
CREATE INDEX IF NOT EXISTS idx_patient_derivation_suppression_active
  ON public.patient_derivation_suppression (patient_id, scope)
  WHERE lifted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_patient_derivation_suppression_request
  ON public.patient_derivation_suppression (erasure_request_id)
  WHERE erasure_request_id IS NOT NULL;

COMMENT ON TABLE public.patient_derivation_suppression IS
  'Per-patient suppression of AI/derived projections. The SUPPRESSION is the erasure mechanism; '
  'deleting the derived rows is only its consequence. A DELETE alone is undone by the next '
  'refresh — update-patient-ai-context UPSERTs on (hospital_id, patient_id) and is invoked on '
  'patient-summary view. Row existence with lifted_at IS NULL is the active state.';

COMMENT ON COLUMN public.patient_derivation_suppression.ground IS
  'Legal/clinical basis. Governs who may lift: dpdp_erasure and consent_withdrawn require fresh '
  'consent, legal_hold requires legal sign-off, patient_optout and clinician_hold are '
  'operationally reversible. Enforced in workflow, not by this constraint.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. RLS
--
-- Read is gated to the same clinical roles as the AI PHI tables (20261108000004 §1) plus the
-- practical requirement that a clinician can see WHY a patient has no AI context — otherwise
-- the feature appears broken rather than suppressed, and someone files a bug or, worse, works
-- around it.
--
-- Write is admin-only. A suppression is a rights decision, not a clinical one, and lifting one
-- must not be available to whoever finds it inconvenient.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.patient_derivation_suppression ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_derivation_suppression_read ON public.patient_derivation_suppression;
CREATE POLICY patient_derivation_suppression_read
  ON public.patient_derivation_suppression
  FOR SELECT TO authenticated
  USING (public.has_ai_clinical_read(hospital_id));

DROP POLICY IF EXISTS patient_derivation_suppression_admin_insert ON public.patient_derivation_suppression;
CREATE POLICY patient_derivation_suppression_admin_insert
  ON public.patient_derivation_suppression
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.auth_user_id = auth.uid()
         AND u.hospital_id  = patient_derivation_suppression.hospital_id
         AND u.role IN ('hospital_admin', 'super_admin')
    )
  );

-- UPDATE exists only to record a lift. The §3 trigger restricts which columns may change.
DROP POLICY IF EXISTS patient_derivation_suppression_admin_lift ON public.patient_derivation_suppression;
CREATE POLICY patient_derivation_suppression_admin_lift
  ON public.patient_derivation_suppression
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.auth_user_id = auth.uid()
         AND u.hospital_id  = patient_derivation_suppression.hospital_id
         AND u.role IN ('hospital_admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.auth_user_id = auth.uid()
         AND u.hospital_id  = patient_derivation_suppression.hospital_id
         AND u.role IN ('hospital_admin', 'super_admin')
    )
  );

-- No DELETE for anyone. A suppression history that can be erased defeats the audit it exists
-- to support, and a deleted suppression row would let derivation silently resume.
DROP POLICY IF EXISTS patient_derivation_suppression_deny_delete ON public.patient_derivation_suppression;
CREATE POLICY patient_derivation_suppression_deny_delete
  ON public.patient_derivation_suppression
  FOR DELETE TO authenticated, anon
  USING (FALSE);

DROP POLICY IF EXISTS patient_derivation_suppression_service ON public.patient_derivation_suppression;
CREATE POLICY patient_derivation_suppression_service
  ON public.patient_derivation_suppression
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. The predicate, and the enforcement that does not depend on application code
--
-- is_derivation_suppressed() is the function every writer should call. The trigger in this
-- section is what makes it not matter whether they remember to. That distinction is the whole
-- design: the Edge Function will be updated to check the predicate and return early (so the
-- refresh is a no-op rather than an error), but the DB blocks the write regardless, so a future
-- code path — a cron job, a backfill script, a second Edge Function — cannot resurrect a
-- suppressed patient's projection by not knowing about this table.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_derivation_suppressed(
  p_patient_id uuid,
  p_scope      text DEFAULT 'ai_context'
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.patient_derivation_suppression s
     WHERE s.patient_id = p_patient_id
       AND s.lifted_at IS NULL
       AND (s.scope = 'all' OR s.scope = p_scope)
  );
$$;

COMMENT ON FUNCTION public.is_derivation_suppressed IS
  'True when AI/derived processing is suppressed for this patient at the given scope. '
  'scope=''all'' matches every scope. Call before deriving anything about a patient; the '
  'trigger trg_block_suppressed_patient_ai_context enforces it for patient_ai_context whether '
  'the caller checks or not.';

CREATE OR REPLACE FUNCTION public.block_suppressed_patient_ai_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_derivation_suppressed(NEW.patient_id, 'ai_context') THEN
    -- RAISE, not silent skip. The two options were considered and raising is correct here:
    -- a silent skip would make the Edge Function believe it had refreshed the context, and it
    -- returns the summary it generated to the caller (index.ts:208-214) — so the AI-generated
    -- text would still reach the UI for a patient whose derivation is suppressed, which is the
    -- disclosure the suppression exists to prevent. The Edge Function must check the predicate
    -- FIRST and return early; this exception is the backstop for when it does not.
    RAISE EXCEPTION
      'AI derivation is suppressed for patient % — refusing to write patient_ai_context. '
      'Check public.is_derivation_suppressed() before deriving.', NEW.patient_id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_suppressed_patient_ai_context ON public.patient_ai_context;
CREATE TRIGGER trg_block_suppressed_patient_ai_context
  BEFORE INSERT OR UPDATE ON public.patient_ai_context
  FOR EACH ROW EXECUTE FUNCTION public.block_suppressed_patient_ai_context();

-- Lift guard: only the lift columns may change, and a lift is one-way.
CREATE OR REPLACE FUNCTION public.guard_suppression_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.hospital_id   IS DISTINCT FROM OLD.hospital_id
     OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
     OR NEW.scope      IS DISTINCT FROM OLD.scope
     OR NEW.ground     IS DISTINCT FROM OLD.ground
     OR NEW.suppressed_by IS DISTINCT FROM OLD.suppressed_by
     OR NEW.suppressed_at IS DISTINCT FROM OLD.suppressed_at
     OR NEW.erasure_request_id IS DISTINCT FROM OLD.erasure_request_id
  THEN
    RAISE EXCEPTION
      'patient_derivation_suppression %: only lifted_by / lifted_at / lift_reason / note may '
      'be updated. To change scope or ground, lift this row and insert a new one.', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.lifted_at IS NOT NULL AND NEW.lifted_at IS DISTINCT FROM OLD.lifted_at THEN
    RAISE EXCEPTION 'patient_derivation_suppression %: already lifted; a lift cannot be revised', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_suppression_update ON public.patient_derivation_suppression;
CREATE TRIGGER trg_guard_suppression_update
  BEFORE UPDATE ON public.patient_derivation_suppression
  FOR EACH ROW EXECUTE FUNCTION public.guard_suppression_update();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4. Suppress-then-scrub, in that order
--
-- Ordering is the entire point and is why this is a trigger rather than a script. On INSERT of
-- an active suppression, the derived rows are cleared in the SAME TRANSACTION as the
-- suppression becoming active. There is no window in which the rows are gone but derivation is
-- still permitted — which is exactly the window a scrub-first approach leaves open, and the one
-- the next page load drives a truck through.
--
-- patient_ai_context rows are DELETEd, not nulled: the row's existence is itself a derived
-- assertion about the patient. ai_suggestions_audit and ai_safety_flags are deliberately NOT
-- touched — they are immutable governance/medico-legal records under 20261108000004 and their
-- retention is a legal-basis question (NABH E9, medico-legal defence) distinct from the
-- projection. Erasing them is a separate decision for Ananya and Dr. Nalini, not a side effect
-- of suppressing derivation.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

-- data_erasure_requests is hospital-scoped only (20261008000104:13-23). Add the patient
-- linkage so a suppression can cite the request that caused it.
ALTER TABLE public.data_erasure_requests
  ADD COLUMN IF NOT EXISTS patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_data_erasure_requests_patient
  ON public.data_erasure_requests (patient_id)
  WHERE patient_id IS NOT NULL;

COMMENT ON COLUMN public.data_erasure_requests.patient_id IS
  'The data principal this erasure request concerns. NULL for the pre-existing hospital-scoped '
  'requests — 20261008000104 had no patient_id at all, so every row created before this '
  'migration is unattributed and must not be assumed to be hospital-wide.';

CREATE OR REPLACE FUNCTION public.scrub_derived_on_suppression()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  IF NEW.lifted_at IS NOT NULL THEN
    RETURN NULL;  -- inserted already-lifted (a historical import); nothing to scrub
  END IF;

  IF NEW.scope IN ('all', 'ai_context') THEN
    -- Runs as definer, so it deletes past patient_ai_context's deny-delete policy
    -- (20261108000004 §4). The BEFORE trigger from §3 does not fire on DELETE.
    DELETE FROM public.patient_ai_context
     WHERE patient_id = NEW.patient_id
       AND hospital_id = NEW.hospital_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;

  -- Audit the scrub itself, into the same trail as every other AI PHI write.
  BEGIN
    INSERT INTO public.phi_access_audit (
      hospital_id, user_id, table_name, row_id, field_names, access_type, source
    ) VALUES (
      NEW.hospital_id, NEW.suppressed_by, 'patient_ai_context', NEW.patient_id::text,
      ARRAY['*suppression_scrub*'], 'write', 'ai_feature'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'scrub_derived_on_suppression: audit insert failed for patient %: %',
      NEW.patient_id, SQLERRM;
  END;

  RAISE NOTICE 'Suppression % active for patient %: % patient_ai_context row(s) scrubbed.',
    NEW.id, NEW.patient_id, v_deleted;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_scrub_derived_on_suppression ON public.patient_derivation_suppression;
CREATE TRIGGER trg_scrub_derived_on_suppression
  AFTER INSERT ON public.patient_derivation_suppression
  FOR EACH ROW EXECUTE FUNCTION public.scrub_derived_on_suppression();

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- REQUIRED APPLICATION CHANGE — without it the backstop raises instead of degrading
--
-- supabase/functions/update-patient-ai-context/index.ts must check the predicate BEFORE it
-- calls the model, and return early. Two reasons, and the second is the expensive one:
--
--   * the §3 trigger raises on the upsert at :188, and index.ts:206 does `if (error) throw
--     error`, which the catch at :217 turns into a 500. A suppressed patient's summary page
--     would show a failed AI panel rather than a clean "AI context not available" state.
--   * the model call at :180 (callAiChat) happens BEFORE the upsert. So without an early
--     return, every refresh of a suppressed patient still sends that patient's chronic
--     conditions, allergies, medications and diagnoses to the model provider — and then fails
--     to store the result. The disclosure the suppression exists to prevent would still occur,
--     on every page view, billed each time. The trigger protects the database; only the early
--     return protects the patient.
--
-- Shape: immediately after hospital_id/patient_id are resolved, `select
-- is_derivation_suppressed(patient_id, 'ai_context')` and if true return 200 with
-- `{ suppressed: true }` and no context_summary. src/hooks/usePatientAIContext.ts:31 and
-- src/pages/patients/PatientSummaryPage.tsx:146 then render a suppression notice.
--
-- NOT DONE HERE. That Edge Function change is Meera's to review and is a one-hop frontend state
-- for the notice. Routing, not writing.
--
-- STILL OPEN, and not solvable in schema: the derivation inputs are unchanged. A suppressed
-- patient's chronic_conditions can be re-derived by anyone reading diagnoses, prescriptions and
-- encounters directly, because that is where the projection came from. This migration stops the
-- PROJECTION being rebuilt and stored; it does not and cannot make the underlying clinical
-- record un-derivable. Anyone describing this as "DPDP erasure complete" is overstating it —
-- it is erasure of the derived layer, which is the layer that had no legal basis to persist.
-- ═════════════════════════════════════════════════════════════════════════════════════════════
