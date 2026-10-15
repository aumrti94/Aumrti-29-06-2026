-- Correction: Day Care's financial-clearance override roles were unreachable strings.
--
-- `DEFAULT_DAY_CARE_POLICY.overrideRoles` in src/lib/dayCareGate.ts used to be
-- `["admin", "billing"]` — neither string matches any real app_role in this codebase
-- (hospital_admin, super_admin, billing_executive, etc.). That default has been corrected in
-- application code, but `SettingsDayCareProceduresPage.tsx`'s `savePolicy` mutation always
-- spreads the CURRENT policy object (including whatever `overrideRoles` resolved to) when a
-- hospital saves ANY change to this screen — toggling "Require Clearance" or editing the
-- deposit percent both trigger a full upsert of `hospital_settings.value`, including the
-- broken `override_roles` array, verbatim.
--
-- So any hospital that touched this settings screen before the application-code fix landed
-- now has the broken array permanently baked into their own `hospital_settings` row —
-- `parseDayCarePolicy()` prefers a persisted value over the default once a row exists, so the
-- code-level fix alone does not help them. This migration corrects those rows directly.
--
-- Idempotent: the WHERE clause only matches rows still carrying the exact broken 2-element
-- array; once corrected, re-running this migration matches nothing and is a no-op.

BEGIN;

UPDATE public.hospital_settings
SET value = jsonb_set(value, '{override_roles}', '["hospital_admin", "super_admin", "billing_executive"]'::jsonb),
    updated_at = now()
WHERE key = 'daycare_payment'
  AND value -> 'override_roles' @> '["admin"]'::jsonb
  AND value -> 'override_roles' @> '["billing"]'::jsonb
  AND jsonb_array_length(value -> 'override_roles') = 2;

COMMIT;
