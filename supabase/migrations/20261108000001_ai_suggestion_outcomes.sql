-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- AI governance: outcome capture for ai_suggestions_audit
--
-- THE GAP. 20260521000001_ai_governance.sql records what the AI said (ai_output, confidence,
-- reasoning) and what the clinician DID about it (user_action in accepted/overridden/rejected/
-- flagged). It records nothing about what then HAPPENED. There is no outcome column on
-- ai_suggestions_audit and no later migration adds one. Acceptance rate is therefore the only
-- quality signal the product has, and acceptance rate is a measure of clinician trust, not of
-- model correctness — a confidently wrong suggestion that is accepted scores identically to a
-- correct one.
--
-- WHY A CHILD TABLE RATHER THAN COLUMNS ON THE PARENT. Two reasons, and the first is the one
-- that decides it:
--
--   1. An outcome is not one value. A sepsis early-warning suggestion has a 6-hour outcome, a
--      24-hour outcome and a discharge outcome, and they can disagree. A dose suggestion has an
--      immediate administration outcome and a later ADR outcome. Columns on the parent force
--      the schema to pick one horizon and throw the rest away, which is exactly the mistake
--      no_show_predictions made with its single `outcome` column (20261014000003 had to add
--      triggers to fill it and could only ever record the first settlement).
--
--   2. It lets the parent become genuinely immutable. See §3 and the block comment there.
--
-- PRECEDENTS FOLLOWED
--   * phi_access_audit (20260628000003) — deny-UPDATE / deny-DELETE policies plus a retention
--     purge function, which is this repo's established append-only pattern.
--   * no_show_outcome_capture (20261014000003) — settle outcomes from a trigger on the table
--     that actually knows how things ended, and guard with `outcome IS NULL` so a later status
--     change cannot rewrite history.
--
-- Additive: no existing column, constraint, trigger or policy on ai_suggestions_audit is
-- modified by this migration. Immutability of the parent is added in
-- 20261108000004_ai_phi_tables_hardening.sql so that this migration can be applied and
-- reverted independently of the RLS change.
-- ═════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Link the suggestion to the clinical action it produced
--
-- Without this the chain breaks at its first link: we know a clinician accepted a dose
-- suggestion, but not which prescriptions row that acceptance became, so there is nothing to
-- measure an outcome against. Polymorphic (type + id) rather than a FK per target, because the
-- target is a different table per feature_key and ~14 nullable FK columns on a high-volume
-- audit table is worse than an unenforced pair. resource_type is constrained to a vocabulary so
-- it cannot drift into free text.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ai_suggestions_audit
  ADD COLUMN IF NOT EXISTS acted_resource_type text,
  ADD COLUMN IF NOT EXISTS acted_resource_id   uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ai_suggestions_audit_acted_resource_type_check'
  ) THEN
    ALTER TABLE public.ai_suggestions_audit
      ADD CONSTRAINT ai_suggestions_audit_acted_resource_type_check
      CHECK (acted_resource_type IS NULL OR acted_resource_type IN (
        'prescriptions', 'prescription_items', 'ipd_medications', 'mar_records',
        'lab_orders', 'lab_order_items', 'radiology_orders', 'radiology_reports',
        'opd_encounters', 'admissions', 'discharge_summaries',
        'bills', 'bill_items', 'insurance_claims',
        'nursing_vitals', 'ipd_vitals', 'clinical_notes', 'icd_codings'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_audit_acted_resource
  ON public.ai_suggestions_audit (acted_resource_type, acted_resource_id)
  WHERE acted_resource_id IS NOT NULL;

COMMENT ON COLUMN public.ai_suggestions_audit.acted_resource_type IS
  'Table name of the clinical/financial row this suggestion was turned into, when the clinician '
  'acted on it. NULL for rejected suggestions and for advisory features that produce no row.';

COMMENT ON COLUMN public.ai_suggestions_audit.acted_resource_id IS
  'Primary key in acted_resource_type. Deliberately not a foreign key: the target table varies '
  'by feature_key. Orphan risk is accepted — an audit row must survive the deletion of whatever '
  'it describes, which is the same reason phi_access_audit.row_id is text and unconstrained.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. ai_suggestion_outcomes — the measured result, append-only
--
-- One row per (suggestion, horizon). The UNIQUE constraint is what makes this append-only
-- rather than merely insert-mostly: a second observation at the same horizon is rejected by the
-- constraint instead of silently overwriting the first.
--
-- hospital_id is carried rather than joined through to the parent. It is required by the repo's
-- RLS rule, and a policy that has to join to ai_suggestions_audit to find the tenant would make
-- every read of this table depend on the parent's policy evaluating first.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_suggestion_outcomes (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id    uuid        NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  suggestion_id  uuid        NOT NULL REFERENCES public.ai_suggestions_audit(id) ON DELETE CASCADE,
  patient_id     uuid        REFERENCES public.patients(id) ON DELETE SET NULL,
  feature_key    text        NOT NULL,

  -- WHEN the outcome was assessed, relative to the suggestion. Fixed vocabulary so a feature
  -- cannot invent a horizon that no dashboard knows how to bucket.
  horizon        text        NOT NULL
                             CHECK (horizon IN (
                               'immediate',   -- settled at the moment of action
                               'h6', 'h24', 'h48', 'd7', 'd30',
                               'episode',     -- settled at discharge / encounter close
                               'final'        -- adjudicated, no further revision expected
                             )),

  -- WHETHER the AI was right. Distinct from ai_suggestions_audit.user_action, which records
  -- clinician behaviour. A suggestion can be rejected and still have been correct; that pair
  -- (user_action='rejected', verdict='correct') is the single most valuable row in this table
  -- and is unrepresentable in the current schema.
  verdict        text        NOT NULL
                             CHECK (verdict IN (
                               'correct',
                               'incorrect',
                               'partially_correct',
                               'harm_averted',       -- clinician overrode and that was right
                               'harm_occurred',      -- suggestion followed, patient harmed
                               'not_assessable'      -- confounded; counted in neither numerator
                             )),

  -- WHAT was measured, and its value. measure_key names the metric ('news2_at_h6',
  -- 'readmitted_within_30d', 'icd_code_accepted_by_coder'); measure_value carries the reading.
  -- jsonb rather than numeric because outcomes are not all numbers — a code-suggestion outcome
  -- is a string comparison, an adherence outcome is a ratio, a sepsis outcome is a score.
  measure_key    text        NOT NULL,
  measure_value  jsonb       NOT NULL DEFAULT '{}'::jsonb,

  -- Provenance. Without this a dashboard cannot separate an outcome a trigger derived
  -- mechanically from one a clinician typed in, and those have very different trust levels.
  source         text        NOT NULL DEFAULT 'trigger'
                             CHECK (source IN ('trigger', 'cron', 'edge_function', 'manual', 'backfill')),

  -- public.users(id), NOT auth.users(id) — CLAUDE.md's staff-attribution rule. Any UI that
  -- records a manual verdict must pass useHospitalContext's users.id, not auth.getUser().id.
  -- NULL for every non-'manual' source.
  assessed_by    uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  assessment_note text,

  observed_at    timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ai_suggestion_outcomes_one_per_horizon
    UNIQUE (suggestion_id, horizon, measure_key),

  -- A manual verdict with no assessor is unattributable and therefore useless as NABH evidence.
  CONSTRAINT ai_suggestion_outcomes_manual_needs_assessor
    CHECK (source <> 'manual' OR assessed_by IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_ai_suggestion_outcomes_suggestion
  ON public.ai_suggestion_outcomes (suggestion_id);

-- The query every quality dashboard will run: accuracy by feature over a window.
CREATE INDEX IF NOT EXISTS idx_ai_suggestion_outcomes_feature_verdict
  ON public.ai_suggestion_outcomes (hospital_id, feature_key, verdict, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_suggestion_outcomes_patient
  ON public.ai_suggestion_outcomes (patient_id, observed_at DESC)
  WHERE patient_id IS NOT NULL;

COMMENT ON TABLE public.ai_suggestion_outcomes IS
  'Append-only measured outcomes for AI suggestions recorded in ai_suggestions_audit. One row '
  'per (suggestion, horizon, measure). Closes the loop ai_suggestions_audit cannot: it records '
  'whether the AI was RIGHT, as opposed to whether the clinician agreed. '
  'Immutable by policy — see §4. Retention 5 years (NABH E9 / SaMD post-market surveillance), '
  'longer than phi_access_audit''s 3 years because model-performance evidence outlives an '
  'access log.';

COMMENT ON COLUMN public.ai_suggestion_outcomes.verdict IS
  'Whether the AI was correct. Orthogonal to ai_suggestions_audit.user_action: the pair '
  '(user_action=rejected, verdict=correct) is a missed-benefit event and '
  '(user_action=accepted, verdict=harm_occurred) is a patient-safety event. Neither is '
  'expressible without this table.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. RLS — role-gated, not merely tenant-gated
--
-- ai_suggestions_audit's own policy (20260521000001) is `USING (hospital_id = ...)` with no FOR
-- clause and no role predicate, which means FOR ALL for any authenticated user in the tenant:
-- a receptionist can read and WRITE every AI clinical assertion about every patient. This table
-- does not repeat that. Read is restricted to roles with a clinical or governance reason to see
-- model performance; write is service_role only, plus a narrow authenticated INSERT for the
-- manual-adjudication path.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ai_suggestion_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_suggestion_outcomes_clinical_read ON public.ai_suggestion_outcomes;
CREATE POLICY ai_suggestion_outcomes_clinical_read
  ON public.ai_suggestion_outcomes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.auth_user_id = auth.uid()
         AND u.hospital_id  = ai_suggestion_outcomes.hospital_id
         AND u.role IN ('hospital_admin', 'super_admin', 'doctor', 'nurse')
    )
  );

-- Manual adjudication. Scoped to the roles that can clinically judge a suggestion, and the
-- WITH CHECK forces the row to be attributed to the inserting user's own staff id so one
-- clinician cannot file a verdict under another's name.
DROP POLICY IF EXISTS ai_suggestion_outcomes_manual_insert ON public.ai_suggestion_outcomes;
CREATE POLICY ai_suggestion_outcomes_manual_insert
  ON public.ai_suggestion_outcomes
  FOR INSERT TO authenticated
  WITH CHECK (
    source = 'manual'
    AND EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.auth_user_id = auth.uid()
         AND u.hospital_id  = ai_suggestion_outcomes.hospital_id
         AND u.role IN ('hospital_admin', 'super_admin', 'doctor', 'nurse')
         AND u.id           = ai_suggestion_outcomes.assessed_by
    )
  );

DROP POLICY IF EXISTS ai_suggestion_outcomes_service_all ON public.ai_suggestion_outcomes;
CREATE POLICY ai_suggestion_outcomes_service_all
  ON public.ai_suggestion_outcomes
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4. Immutability — the phi_access_audit pattern
--
-- Deny UPDATE and DELETE to authenticated and anon outright. Note what this does NOT do:
-- service_role still bypasses RLS entirely, so these policies are a guard against the
-- application and its users, not against a compromised service key. That is the same guarantee
-- phi_access_audit provides and it is worth stating rather than overclaiming.
--
-- The retention purge in §6 is SECURITY DEFINER specifically so it can delete past these
-- policies without granting anyone else that ability.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS ai_suggestion_outcomes_deny_update ON public.ai_suggestion_outcomes;
CREATE POLICY ai_suggestion_outcomes_deny_update
  ON public.ai_suggestion_outcomes
  FOR UPDATE TO authenticated, anon
  USING (FALSE);

DROP POLICY IF EXISTS ai_suggestion_outcomes_deny_delete ON public.ai_suggestion_outcomes;
CREATE POLICY ai_suggestion_outcomes_deny_delete
  ON public.ai_suggestion_outcomes
  FOR DELETE TO authenticated, anon
  USING (FALSE);

-- Belt and braces against service_role too: a trigger raises on any UPDATE, which RLS cannot
-- do for a role that bypasses it. DELETE is deliberately NOT blocked by trigger — the retention
-- purge needs it, and a trigger cannot distinguish the purge from an ad-hoc delete.
CREATE OR REPLACE FUNCTION public.reject_ai_outcome_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION
    'ai_suggestion_outcomes is append-only; record a new row at a later horizon instead of '
    'updating outcome % (suggestion %)', OLD.id, OLD.suggestion_id
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_ai_outcome_update ON public.ai_suggestion_outcomes;
CREATE TRIGGER trg_reject_ai_outcome_update
  BEFORE UPDATE ON public.ai_suggestion_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.reject_ai_outcome_update();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 5. Denormalisation guard
--
-- hospital_id, patient_id and feature_key are copied from the parent so this table can be
-- queried and RLS-checked without a join. Copies drift. This trigger makes the parent the
-- source of truth on INSERT rather than trusting the caller, so a mis-scoped outcome row cannot
-- be written against another tenant's suggestion.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_ai_outcome_from_suggestion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hospital_id uuid;
  v_patient_id  uuid;
  v_feature_key text;
BEGIN
  SELECT a.hospital_id, a.patient_id, a.feature_key
    INTO v_hospital_id, v_patient_id, v_feature_key
    FROM public.ai_suggestions_audit a
   WHERE a.id = NEW.suggestion_id;

  IF v_hospital_id IS NULL THEN
    RAISE EXCEPTION 'ai_suggestion_outcomes.suggestion_id % does not exist', NEW.suggestion_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Authoritative, not advisory: silently correcting a mismatched hospital_id would let a
  -- caller write across tenants and never find out.
  IF NEW.hospital_id IS DISTINCT FROM v_hospital_id THEN
    RAISE EXCEPTION
      'ai_suggestion_outcomes.hospital_id % does not match suggestion %''s tenant %',
      NEW.hospital_id, NEW.suggestion_id, v_hospital_id
      USING ERRCODE = 'raise_exception';
  END IF;

  NEW.patient_id  := v_patient_id;
  NEW.feature_key := v_feature_key;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_ai_outcome_from_suggestion ON public.ai_suggestion_outcomes;
CREATE TRIGGER trg_sync_ai_outcome_from_suggestion
  BEFORE INSERT ON public.ai_suggestion_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.sync_ai_outcome_from_suggestion();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 6. Retention
--
-- Mirrors purge_old_phi_audit() (20260628000003 §4) including the REVOKE, which is the part
-- that makes it a controlled operation rather than a function any authenticated user can call
-- to erase model-performance evidence. 5 years, not 3: SaMD post-market surveillance expects
-- the performance record to outlive the access log.
--
-- NOT SCHEDULED HERE. Every HTTP-triggered cron job in this repo is gated on the Vault secret
-- `aumrti_service_role_key` and silently returns if it is absent (see
-- 20261008000100_cron_jobs_use_vault.sql and nine other scheduling migrations). This purge is
-- pure SQL and needs no credential, so it belongs in the credential-free SQL-RPC cron group
-- alongside daily-leakage-scan — scheduled deliberately, in one place, not here.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.purge_old_ai_suggestion_outcomes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.ai_suggestion_outcomes
   WHERE observed_at < now() - INTERVAL '5 years';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_ai_suggestion_outcomes() FROM PUBLIC, authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 7. ai_feature_accuracy — the honest read model
--
-- Owner-rights view (the 20261009000175 precedent), so a quality dashboard gets accuracy
-- without being granted raw row access. Two separations matter here and both are the point of
-- the view existing:
--
--   * 'not_assessable' outcomes are excluded from the denominator rather than counted as
--     failures. Counting confounded cases as wrong understates a model; counting them as right
--     overstates it; the only defensible move is to report them separately, which
--     not_assessable_count does.
--
--   * assessed_count vs suggestion_count. A feature with 5 000 suggestions and 12 outcomes has
--     an accuracy number that means nothing, and coverage_pct is what stops anyone quoting it.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.ai_feature_accuracy;
CREATE VIEW public.ai_feature_accuracy AS
WITH suggestions AS (
  SELECT a.hospital_id, a.feature_key,
         count(*)                                                   AS suggestion_count,
         count(*) FILTER (WHERE a.user_action = 'accepted')          AS accepted_count,
         count(*) FILTER (WHERE a.user_action = 'overridden')        AS overridden_count,
         count(*) FILTER (WHERE a.user_action = 'rejected')          AS rejected_count
    FROM public.ai_suggestions_audit a
   GROUP BY a.hospital_id, a.feature_key
),
outcomes AS (
  SELECT o.hospital_id, o.feature_key,
         count(*)                                                    AS assessed_count,
         count(*) FILTER (WHERE o.verdict = 'not_assessable')         AS not_assessable_count,
         count(*) FILTER (WHERE o.verdict = 'correct')                AS correct_count,
         count(*) FILTER (WHERE o.verdict = 'partially_correct')      AS partial_count,
         count(*) FILTER (WHERE o.verdict = 'incorrect')              AS incorrect_count,
         count(*) FILTER (WHERE o.verdict = 'harm_averted')           AS harm_averted_count,
         count(*) FILTER (WHERE o.verdict = 'harm_occurred')          AS harm_occurred_count
    FROM public.ai_suggestion_outcomes o
   GROUP BY o.hospital_id, o.feature_key
)
SELECT
  s.hospital_id,
  s.feature_key,
  s.suggestion_count,
  s.accepted_count,
  s.overridden_count,
  s.rejected_count,
  COALESCE(o.assessed_count, 0)         AS assessed_count,
  COALESCE(o.not_assessable_count, 0)   AS not_assessable_count,
  COALESCE(o.correct_count, 0)          AS correct_count,
  COALESCE(o.partial_count, 0)          AS partial_count,
  COALESCE(o.incorrect_count, 0)        AS incorrect_count,
  COALESCE(o.harm_averted_count, 0)     AS harm_averted_count,
  COALESCE(o.harm_occurred_count, 0)    AS harm_occurred_count,
  -- What fraction of suggestions has any outcome at all. Read this BEFORE accuracy_pct.
  CASE WHEN s.suggestion_count > 0
       THEN round((COALESCE(o.assessed_count, 0)::numeric / s.suggestion_count) * 100, 2)
       ELSE NULL END                    AS coverage_pct,
  -- NULL, not 0, when nothing assessable has been assessed. A dashboard that renders ₹0 / 0%
  -- for "no data" is the AIPerformancePage failure mode (it discards its query error and shows
  -- Rs 0); NULL forces the UI to distinguish "no data" from "zero accuracy".
  CASE WHEN COALESCE(o.assessed_count, 0) - COALESCE(o.not_assessable_count, 0) > 0
       THEN round(
              ((COALESCE(o.correct_count, 0) + COALESCE(o.partial_count, 0) * 0.5)
               / (o.assessed_count - o.not_assessable_count)::numeric) * 100, 2)
       ELSE NULL END                    AS accuracy_pct
FROM suggestions s
LEFT JOIN outcomes o
       ON o.hospital_id = s.hospital_id AND o.feature_key = s.feature_key
WHERE s.hospital_id = public.get_user_hospital_id() OR public.is_aumrti_admin();

REVOKE ALL ON public.ai_feature_accuracy FROM anon;
GRANT SELECT ON public.ai_feature_accuracy TO authenticated;

COMMENT ON VIEW public.ai_feature_accuracy IS
  'Per-feature AI accuracy with outcome coverage. Owner-rights view (same access pattern as '
  'hospital_ai_budget_status, 20261009000175): the WHERE clause is the access control, scoping '
  'to the caller''s hospital or all rows for an Aumrti admin. PHI-free — counts only, no '
  'patient_id. accuracy_pct is NULL rather than 0 when nothing has been assessed.';

COMMIT;
