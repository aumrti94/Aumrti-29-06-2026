-- Phase 8.5 pentest-prep self-review (cross-tenant access surface) — completing the audit
-- KNOWN-BUG-232 left at "13 more files, not audited" and 20261106000040 took to 3-of-13.
--
-- WHY. Same defect, same root cause as partograph_entries/pmjay_preauth_requests/
-- package_station_logs/cghs_echs_beneficiaries: each policy hand-rolls
-- `hospital_id = (SELECT hospital_id FROM users WHERE id = auth.uid())` instead of calling
-- `public.get_user_hospital_id()`, wrong for every account created after the auth_user_id
-- decoupling migration (20260322111223).
--
-- These five are NOT dead weight — confirmed by grepping every other migration for a second
-- policy on each table and finding none. Every one of these five has had exactly one policy,
-- the broken one, since 20260501145300_v9_emr_procurement_foundation.sql — silently zero rows
-- for any post-decoupling account, on any hospital, since each table was created.
-- `patient_encounter_templates`/`patient_template_responses` hold clinical documentation
-- content keyed to a real patient, not just admin configuration.
--
-- None had a WITH CHECK clause either (USING only) — a write naming another hospital's id was
-- never blocked even before the auth.uid() divergence. Added here, matching every other
-- isolation policy in this codebase.

DROP POLICY IF EXISTS "Isolation policy for emr_template_definitions" ON public.emr_template_definitions;
CREATE POLICY "Isolation policy for emr_template_definitions" ON public.emr_template_definitions
  FOR ALL
  USING (hospital_id = public.get_user_hospital_id())
  WITH CHECK (hospital_id = public.get_user_hospital_id());

DROP POLICY IF EXISTS "Isolation policy for patient_encounter_templates" ON public.patient_encounter_templates;
CREATE POLICY "Isolation policy for patient_encounter_templates" ON public.patient_encounter_templates
  FOR ALL
  USING (hospital_id = public.get_user_hospital_id())
  WITH CHECK (hospital_id = public.get_user_hospital_id());

DROP POLICY IF EXISTS "Isolation policy for patient_template_responses" ON public.patient_template_responses;
CREATE POLICY "Isolation policy for patient_template_responses" ON public.patient_template_responses
  FOR ALL
  USING (hospital_id = public.get_user_hospital_id())
  WITH CHECK (hospital_id = public.get_user_hospital_id());

DROP POLICY IF EXISTS "Isolation policy for demand_forecasts" ON public.demand_forecasts;
CREATE POLICY "Isolation policy for demand_forecasts" ON public.demand_forecasts
  FOR ALL
  USING (hospital_id = public.get_user_hospital_id())
  WITH CHECK (hospital_id = public.get_user_hospital_id());

DROP POLICY IF EXISTS "Isolation policy for procurement_recommendations" ON public.procurement_recommendations;
CREATE POLICY "Isolation policy for procurement_recommendations" ON public.procurement_recommendations
  FOR ALL
  USING (hospital_id = public.get_user_hospital_id())
  WITH CHECK (hospital_id = public.get_user_hospital_id());
