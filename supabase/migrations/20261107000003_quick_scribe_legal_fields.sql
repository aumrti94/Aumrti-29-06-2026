-- Quick Scribe, round 2: make the printed note a lawful document and stop over-sharing it.
--
-- Forward migration rather than an edit to 20261107000002, which may already be applied.
-- Idempotent throughout; nothing is dropped.
--
-- Three problems being fixed:
--
--   1. Rule 65(10) of the Drugs & Cosmetics Rules 1945 requires the patient's name and address
--      on any prescription, and a prescription is whatever lists drugs and doses — the title on
--      the page is irrelevant. The original table deliberately had no patient identity at all,
--      which made every printed medicines page undispensable. The realistic outcome is not that
--      the chemist refuses; it is that the chemist dispenses and invents a name for the
--      statutory Schedule H1 register. These columns are still NOT a patient record: no MRN, no
--      FK to public.patients, no encounter. They are labels on a printout.
--
--   2. The original RLS policy granted read to every authenticated user in the hospital, with a
--      comment justifying it as "any doctor on shift can pick a note back up". That capability
--      did not exist (the table had no SELECT path at all), so the grant bought nothing and cost
--      a receptionist/billing clerk full read access to every consultation summary in the clinic.
--
--   3. structured_note_json recorded what the doctor prescribed but not what was screened. The
--      medico-legal question eight months later is "was anything checked", and the answer has to
--      be on the record, not inferred.

ALTER TABLE public.quick_scribe_notes
  ADD COLUMN IF NOT EXISTS patient_name    TEXT,
  ADD COLUMN IF NOT EXISTS patient_age     TEXT,
  ADD COLUMN IF NOT EXISTS patient_sex     TEXT,
  ADD COLUMN IF NOT EXISTS patient_address TEXT,
  -- What the duplicate-therapy / interaction screen returned at print time. Allergy screening
  -- is never run here (no patient history exists), and that fact is part of the record.
  ADD COLUMN IF NOT EXISTS screening_json  JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Defence in depth behind the app-side validator in quickScribePrint.validateForPrint():
-- a note carrying medicines must carry a patient name. A summary-only or tests-only note is
-- not a prescription and is exempt. Written as NOT VALID so an existing row (from the first
-- iteration, which had no name column) does not block the migration; new and updated rows are
-- checked from here on.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quick_scribe_notes_named_when_prescribing'
      AND conrelid = 'public.quick_scribe_notes'::regclass
  ) THEN
    ALTER TABLE public.quick_scribe_notes
      ADD CONSTRAINT quick_scribe_notes_named_when_prescribing
      CHECK (
        jsonb_typeof(structured_note_json -> 'medicines') IS DISTINCT FROM 'array'
        OR jsonb_array_length(structured_note_json -> 'medicines') = 0
        OR (patient_name IS NOT NULL AND length(btrim(patient_name)) > 0)
      )
      NOT VALID;
  END IF;
END $$;

-- Narrow the read/write grant. Doctors write and re-read their clinic's notes; MRD officers
-- need them for a medico-legal request; hospital/super admins retain access for support.
-- Everyone else in the tenant loses a grant they never had a use for.
DROP POLICY IF EXISTS "hospital_isolation" ON public.quick_scribe_notes;
DROP POLICY IF EXISTS "quick_scribe_clinical_access" ON public.quick_scribe_notes;
CREATE POLICY "quick_scribe_clinical_access" ON public.quick_scribe_notes
  USING (
    hospital_id = public.get_user_hospital_id()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        -- Compared as text, not cast to app_role: the role column carries custom roles that
        -- are not enum members (see 20261009000185), and a cast would error on those.
        AND u.role::text IN ('doctor', 'mrd_officer', 'hospital_admin', 'super_admin')
    )
  )
  WITH CHECK (
    hospital_id = public.get_user_hospital_id()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role::text IN ('doctor', 'mrd_officer', 'hospital_admin', 'super_admin')
    )
  );

-- Repeat visits are the doctor's stated workflow: the patient returns with a lab report and
-- the doctor needs what was said last time. That is a name lookup within one hospital.
CREATE INDEX IF NOT EXISTS idx_quick_scribe_notes_lookup
  ON public.quick_scribe_notes (hospital_id, patient_name, created_at DESC)
  WHERE is_deleted = false;

-- ── Close the server-side billing bypass ──────────────────────────────────────────────
--
-- checkAIAllowed() resolves a per-feature toggle as:
--   hospital_module_entitlements.actions[key] ?? plan_features.actions[key] ?? ALLOWED
-- i.e. it denies only on an explicit `false`. quick_scribe was added to the UI defaulted
-- off, but nothing ever wrote a `false` into plan_features — so the key was absent, which
-- resolves to ALLOWED. The tile was hidden while a direct
-- `functions.invoke("ai-clinical-voice", { context_type: "quick_scribe" })` ran and spent
-- the hospital's AI budget. That is the exact bypass class ai-entitlement.ts exists to close.
--
-- Seed an explicit false on every existing ai_suite plan row. A hospital that genuinely wants
-- Quick Scribe turns it on per-hospital via hospital_module_entitlements, which wins over this.
UPDATE public.plan_features
SET actions = COALESCE(actions, '{}'::jsonb) || jsonb_build_object('quick_scribe', false)
WHERE module_key = 'ai_suite'
  AND NOT (COALESCE(actions, '{}'::jsonb) ? 'quick_scribe');
