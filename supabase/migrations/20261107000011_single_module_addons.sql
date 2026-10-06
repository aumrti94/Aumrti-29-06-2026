-- ============================================================
-- Pricing v3 — Phase 2b: buy ONE module, not a bundle
-- ------------------------------------------------------------
-- 20261008000166_addon_skus.sql gave Aumrti four CURATED bundle SKUs
-- (Insurance & Claims Desk, Accounts & Compliance, Analytics & HMIS,
-- AI Suite Pro). That solved "sell an upgrade" but not the original
-- complaint: a Clinic-plan hospital that wants Lab alone has no SKU that
-- is just Lab — every SKU bundles several modules and/or AI features.
--
-- SCHEMA DECISION (documented per the phase-2 brief): option (a), one
-- addon_skus ROW PER MODULE, not a new table. The grant/billing machinery
-- (resolveEnabledModules, resolveEffectivePrice, splitGstInclusive,
-- addon_entitlement_drift) already treats addon_skus generically — none of
-- it cares how many module_keys a row carries, so a single-element array is
-- a fully valid, zero-migration-risk row in the existing shape.
--
-- The ONE place that could not stay a plain data row: every surface that
-- lists addon_skus today (PricingPage, SettingsPlanPage's catalogue,
-- PlansManagerPage's "Add-ons" admin tab, HospitalDetailPage's Billing tab)
-- does a flat `SELECT * WHERE is_active` and renders every row as a
-- marketing/bundle card. Seeding 58 single-module rows into that same flat
-- list would flood the public /pricing page and the curated bundle pickers
-- with 58 cards instead of 4 — a UX regression serious enough that it tips
-- this into option (b): one minimal, additive, backward-compatible column
-- so every existing query can keep filtering to the curated bundles it
-- already shows, and the Modules-tab grid can filter to exactly the
-- single-module rows it needs.
--
-- sku_type defaults to 'bundle' so EVERY existing row (the 4 seeded in
-- 166, and any admin has since added) classifies itself correctly with no
-- backfill required.
-- ============================================================

BEGIN;

ALTER TABLE public.addon_skus
  ADD COLUMN IF NOT EXISTS sku_type text NOT NULL DEFAULT 'bundle';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'addon_skus_sku_type_check'
    AND   conrelid = 'public.addon_skus'::regclass
  ) THEN
    ALTER TABLE public.addon_skus
      ADD CONSTRAINT addon_skus_sku_type_check
      CHECK (sku_type IN ('bundle', 'single_module'));
  END IF;
END $$;

COMMENT ON COLUMN public.addon_skus.sku_type IS
  'bundle = curated multi-module/AI package, shown on /pricing and the Settings → Plan and platform catalogue pickers. single_module = priced standalone module for the Modules-tab grid (HospitalDetailPage), deliberately excluded from those catalogue lists so they are not flooded with one card per module.';

-- A single-module row IS the module: exactly one module key, no AI features
-- (AI features are sold via ai_suite_pro or a future per-feature SKU, never
-- silently riding along on a single-module purchase where the price shown
-- is for the module alone).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'addon_skus_single_module_shape'
    AND   conrelid = 'public.addon_skus'::regclass
  ) THEN
    ALTER TABLE public.addon_skus
      ADD CONSTRAINT addon_skus_single_module_shape
      CHECK (
        sku_type <> 'single_module'
        OR (
          array_length(module_keys, 1) = 1
          AND COALESCE(array_length(ai_feature_keys, 1), 0) = 0
        )
      );
  END IF;
END $$;

-- At most one ACTIVE single-module SKU per module — otherwise the
-- Modules-tab grid would have two candidate prices for the same Grey tile
-- with no rule for which one wins.
CREATE UNIQUE INDEX IF NOT EXISTS addon_skus_single_module_key_uniq
  ON public.addon_skus ((module_keys[1]))
  WHERE sku_type = 'single_module' AND is_active;

COMMIT;

-- ── Seed: one single-module SKU per module reachable from the Modules-tab
-- grid (CANONICAL_MODULE_KEYS ∩ has a MODULE_CATEGORY, i.e. every key that
-- can actually render as a tile — this excludes the ai_suite pseudo-module,
-- which has no tile and is already sold via ai_suite_pro, and the
-- always-on settings/inbox modules, which can never be Grey).
--
-- PRICING IS A PLACEHOLDER. Kavitha/finance has not signed off on
-- per-module numbers. Banded lightly by category only so the Modules-tab
-- confirm step shows SOMETHING rather than a fabricated single number
-- dressed up as precision:
--   ₹999/mo — Diagnostics, Surgical, Pharmacy, Finance, Analytics
--             (LIS/RIS/pharmacy/billing-grade systems and the
--              intelligence/reporting modules — heavier build, more
--              tables, closer to revenue)
--   ₹499/mo — Clinical, Operations, Specialized, Patient
--             (narrower-scope modules)
-- 'accounts' deliberately has NO new row here even though it is Finance:
-- accounts_erp (166) already prices the accounts module alone (its
-- module_keys is exactly ['accounts']) — adding a second SKU for the same
-- module would create two conflicting prices for one tile. Everywhere else,
-- a module that also appears inside a bundle (insurance, pmjay, analytics,
-- hmis) still gets its OWN single-module row here, because the founder
-- decision is standalone pricing for every module, not reuse of a bundle's
-- price for the one case where the bundle happens to be the same size.
BEGIN;

INSERT INTO public.addon_skus
  (slug, name, price_monthly, module_keys, ai_feature_keys, sku_type, is_active, sort_order)
VALUES
  -- Clinical — ₹499/mo
  ('module_opd',               'OPD Queue',                    499.00, ARRAY['opd'],               '{}', 'single_module', true, 1001),
  ('module_ipd',                'IPD / Wards',                  499.00, ARRAY['ipd'],               '{}', 'single_module', true, 1002),
  ('module_day_care',           'Day Care Unit',                499.00, ARRAY['day_care'],          '{}', 'single_module', true, 1003),
  ('module_emergency',          'Emergency',                    499.00, ARRAY['emergency'],         '{}', 'single_module', true, 1004),
  ('module_ot',                 'Operation Theatre',            499.00, ARRAY['ot'],                '{}', 'single_module', true, 1005),
  ('module_nursing',            'Nursing',                      499.00, ARRAY['nursing'],           '{}', 'single_module', true, 1006),
  ('module_telemedicine',       'Telemedicine',                 499.00, ARRAY['telemedicine'],      '{}', 'single_module', true, 1007),
  ('module_health_packages',    'Health Packages',              499.00, ARRAY['health_packages'],   '{}', 'single_module', true, 1008),
  ('module_quick_scribe',       'Quick Scribe',                  499.00, ARRAY['quick_scribe'],      '{}', 'single_module', true, 1009),
  ('module_vaccination',        'Vaccination',                  499.00, ARRAY['vaccination'],       '{}', 'single_module', true, 1010),
  ('module_ambulance',          'Ambulance Service',            499.00, ARRAY['ambulance'],         '{}', 'single_module', true, 1011),
  ('module_home_care',          'Home Care',                    499.00, ARRAY['home_care'],         '{}', 'single_module', true, 1012),
  ('module_chronic_disease',    'Chronic Disease Management',   499.00, ARRAY['chronic_disease'],   '{}', 'single_module', true, 1013),
  ('module_dietetics',          'Dietetics & Nutrition',        499.00, ARRAY['dietetics'],         '{}', 'single_module', true, 1014),

  -- Diagnostics — ₹999/mo
  ('module_lab',                'Laboratory (LIS)',             999.00, ARRAY['lab'],               '{}', 'single_module', true, 1015),
  ('module_radiology',          'Radiology (RIS)',              999.00, ARRAY['radiology'],         '{}', 'single_module', true, 1016),

  -- Surgical — ₹999/mo
  ('module_blood_bank',         'Blood Bank',                   999.00, ARRAY['blood_bank'],        '{}', 'single_module', true, 1017),
  ('module_cssd',               'CSSD',                         999.00, ARRAY['cssd'],              '{}', 'single_module', true, 1018),

  -- Pharmacy — ₹999/mo
  ('module_pharmacy',           'Pharmacy (IP)',                999.00, ARRAY['pharmacy'],          '{}', 'single_module', true, 1019),
  ('module_pharmacy_retail',    'Pharmacy Retail',              999.00, ARRAY['pharmacy_retail'],   '{}', 'single_module', true, 1020),

  -- Finance — ₹999/mo (accounts excluded — see header note)
  ('module_billing',            'Billing',                      999.00, ARRAY['billing'],           '{}', 'single_module', true, 1021),
  ('module_day_closure',        'Day Closure',                  999.00, ARRAY['day_closure'],       '{}', 'single_module', true, 1022),
  ('module_insurance',          'Insurance / TPA',              999.00, ARRAY['insurance'],         '{}', 'single_module', true, 1023),
  ('module_payments',           'Payments',                     999.00, ARRAY['payments'],          '{}', 'single_module', true, 1024),
  ('module_pmjay',              'Govt Schemes / PMJAY',         999.00, ARRAY['pmjay'],             '{}', 'single_module', true, 1025),

  -- Operations — ₹499/mo
  ('module_hr',                 'HR & Payroll',                  499.00, ARRAY['hr'],                '{}', 'single_module', true, 1026),
  ('module_inventory',          'Inventory & Stores',           499.00, ARRAY['inventory'],         '{}', 'single_module', true, 1027),
  ('module_quality',            'Quality & NABH',                499.00, ARRAY['quality'],           '{}', 'single_module', true, 1028),
  ('module_ipc',                'IPC Dashboard',                 499.00, ARRAY['ipc'],               '{}', 'single_module', true, 1029),
  ('module_biomedical',         'Biomedical Engineering',       499.00, ARRAY['biomedical'],        '{}', 'single_module', true, 1030),
  ('module_housekeeping',       'Housekeeping',                  499.00, ARRAY['housekeeping'],      '{}', 'single_module', true, 1031),
  ('module_hmis',               'Govt HMIS Reporting',           499.00, ARRAY['hmis'],              '{}', 'single_module', true, 1032),
  ('module_lms',                'Staff Training / LMS',          499.00, ARRAY['lms'],               '{}', 'single_module', true, 1033),
  ('module_crm',                'CRM & Marketing',               499.00, ARRAY['crm'],               '{}', 'single_module', true, 1034),
  ('module_abdm',                'ABDM / ABHA',                   499.00, ARRAY['abdm'],              '{}', 'single_module', true, 1035),
  ('module_mrd',                 'Medical Records',               499.00, ARRAY['mrd'],               '{}', 'single_module', true, 1036),
  ('module_fms',                 'FMS / Safety',                  499.00, ARRAY['fms'],               '{}', 'single_module', true, 1037),

  -- Specialized — ₹499/mo
  ('module_dialysis',            'Dialysis Unit',                 499.00, ARRAY['dialysis'],          '{}', 'single_module', true, 1038),
  ('module_oncology',            'Oncology',                      499.00, ARRAY['oncology'],          '{}', 'single_module', true, 1039),
  ('module_physio',              'Physiotherapy',                 499.00, ARRAY['physio'],            '{}', 'single_module', true, 1040),
  ('module_mortuary',            'Mortuary & Medico-Legal',       499.00, ARRAY['mortuary'],          '{}', 'single_module', true, 1041),
  ('module_dental',               'Dental',                        499.00, ARRAY['dental'],            '{}', 'single_module', true, 1042),
  ('module_ayush',                'AYUSH',                         499.00, ARRAY['ayush'],             '{}', 'single_module', true, 1043),
  ('module_ivf',                  'IVF & ART',                     499.00, ARRAY['ivf'],               '{}', 'single_module', true, 1044),
  ('module_obstetric_anc',        'Obstetric ANC',                 499.00, ARRAY['obstetric_anc'],     '{}', 'single_module', true, 1045),
  ('module_neonatal',             'Neonatal EMR',                  499.00, ARRAY['neonatal'],          '{}', 'single_module', true, 1046),
  ('module_anaesthesia',          'Anaesthesia EMR',               499.00, ARRAY['anaesthesia'],       '{}', 'single_module', true, 1047),
  ('module_ophthalmology',        'Ophthalmology EMR',             499.00, ARRAY['ophthalmology'],     '{}', 'single_module', true, 1048),
  ('module_partograph',           'Partograph',                    499.00, ARRAY['partograph'],        '{}', 'single_module', true, 1049),
  ('module_obstetric_delivery',   'Delivery Record',               499.00, ARRAY['obstetric_delivery'],'{}', 'single_module', true, 1050),
  ('module_mental_health',        'Mental Health / Psychiatry',    499.00, ARRAY['mental_health'],     '{}', 'single_module', true, 1051),

  -- Patient — ₹499/mo
  ('module_patient_portal',       'Patient Portal',                499.00, ARRAY['patient_portal'],    '{}', 'single_module', true, 1052),
  ('module_patient_relations',    'Patient Relations',             499.00, ARRAY['patient_relations'], '{}', 'single_module', true, 1053),

  -- Analytics — ₹999/mo
  ('module_ai_clinical',          'AI Clinical Intelligence',      999.00, ARRAY['ai_clinical'],       '{}', 'single_module', true, 1054),
  ('module_research',             'Research Platform',             999.00, ARRAY['research'],          '{}', 'single_module', true, 1055),
  ('module_analytics',            'Analytics & BI',                999.00, ARRAY['analytics'],         '{}', 'single_module', true, 1056),
  ('module_hod_dashboard',        'HOD Dashboard',                 999.00, ARRAY['hod_dashboard'],     '{}', 'single_module', true, 1057),
  ('module_tv_display',           'TV Display',                    999.00, ARRAY['tv_display'],        '{}', 'single_module', true, 1058)
ON CONFLICT (slug) DO UPDATE SET
  name          = EXCLUDED.name,
  price_monthly = EXCLUDED.price_monthly,
  module_keys   = EXCLUDED.module_keys,
  ai_feature_keys = EXCLUDED.ai_feature_keys,
  sku_type      = EXCLUDED.sku_type,
  sort_order    = EXCLUDED.sort_order,
  updated_at    = now();

-- One shared description template rather than 58 repeats of the same
-- sentence; only fills rows that don't already have one, so a later manual
-- edit from /platform is never overwritten by a re-run of this migration.
UPDATE public.addon_skus
   SET description = format(
         'Adds %s alone, independent of any bundle. Access starts immediately; billed from the next renewal.',
         name
       )
 WHERE sku_type = 'single_module'
   AND description IS NULL;

COMMIT;

-- ============================================================
-- Atomic grant+bill / revoke+cancel for ONE module (HospitalDetailPage,
-- Modules-tab grid).
--
-- Why an RPC and not two client-side writes: the Modules-tab grid's own
-- "effective" calculation reads ONLY hospital_feature_overrides ∪
-- plan_features — it does not consult hospital_addons at all. If the admin
-- action wrote the addon row and the override row as two separate
-- `.from(...).insert()` calls from the client, a failure (or a user
-- closing the tab) between them would leave the hospital either billed
-- with the tile still rendering Grey, or granted access with the grid
-- believing it never changed anything. That split-write hazard is the
-- EXACT class of bug addon_entitlement_drift was built to catch for the
-- bundle flow — this function exists so a THIRD instance of it is never
-- created. Both writes happen in one transaction, administered by Postgres,
-- not by two round trips a browser can get halfway through.
--
-- Turning OFF is symmetric and safe to call twice (idempotent): it cancels
-- whatever active hospital_addons row exists for this module's SKU and
-- deletes the override this same function created, regardless of whether
-- either is still present.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.set_hospital_module_addon(
  p_hospital_id uuid,
  p_module_key  text,
  p_enabled     boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_sku_id uuid;
  v_existing uuid;
  v_other_addon record;
BEGIN
  IF NOT public.is_aumrti_admin() THEN
    RAISE EXCEPTION 'only platform administrators may buy or cancel a single-module add-on'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id INTO v_sku_id
    FROM public.addon_skus
   WHERE sku_type = 'single_module'
     AND is_active
     AND module_keys = ARRAY[p_module_key]
   LIMIT 1;

  IF v_sku_id IS NULL THEN
    RAISE EXCEPTION 'no single-module add-on price is defined for module "%"', p_module_key
      USING ERRCODE = 'no_data_found';
  END IF;

  IF p_enabled THEN
    -- Billing-integrity guard (flagged in revenue-pod review of this migration):
    -- refuse to sell this module again if a DIFFERENT active add-on already
    -- grants it — e.g. the hospital already has the "Insurance & Claims Desk"
    -- bundle (grants insurance+pmjay) and this call is for module_insurance.
    -- Without this check two active hospital_addons rows would both grant the
    -- same module and both bill for it; addon_entitlement_drift's "unsellable"
    -- check does not catch this because it only compares a SKU against the
    -- PLAN, never against another already-purchased SKU.
    SELECT ha.id, s.name INTO v_other_addon
      FROM public.hospital_addons ha
      JOIN public.addon_skus s ON s.id = ha.addon_sku_id
     WHERE ha.hospital_id = p_hospital_id
       AND ha.status = 'active'
       AND ha.addon_sku_id <> v_sku_id
       AND p_module_key = ANY (s.module_keys)
     LIMIT 1;

    IF v_other_addon.id IS NOT NULL THEN
      RAISE EXCEPTION 'module "%" is already granted by the active add-on "%" — buying it again would double-bill',
        p_module_key, v_other_addon.name
        USING ERRCODE = 'unique_violation';
    END IF;

    -- (a) grant — admin-override surface, so the grid renders Amber
    -- immediately instead of looking unchanged while billing silently works.
    INSERT INTO public.hospital_feature_overrides (hospital_id, module_key, is_enabled, reason, created_by)
    VALUES (p_hospital_id, p_module_key, true, 'Single-module add-on purchase', auth.uid())
    ON CONFLICT (hospital_id, module_key) DO UPDATE
      SET is_enabled = true,
          reason     = 'Single-module add-on purchase',
          created_by = auth.uid();

    -- (b) bill — only if not already active (idempotent re-click/retry).
    SELECT id INTO v_existing FROM public.hospital_addons
     WHERE hospital_id = p_hospital_id AND addon_sku_id = v_sku_id AND status = 'active';

    IF v_existing IS NULL THEN
      INSERT INTO public.hospital_addons (hospital_id, addon_sku_id, status, source, purchased_by, billing_starts_at)
      VALUES (
        p_hospital_id, v_sku_id, 'active', 'admin', auth.uid(),
        (SELECT current_period_end FROM public.hospital_subscriptions WHERE hospital_id = p_hospital_id)
      );
    END IF;
  ELSE
    -- Symmetric undo — cancel the bill, drop the override, both or neither
    -- ever applies half, and safe to call on a module that was never
    -- bought (both statements then simply affect zero rows).
    UPDATE public.hospital_addons
       SET status = 'cancelled', cancelled_at = now()
     WHERE hospital_id = p_hospital_id AND addon_sku_id = v_sku_id AND status = 'active';

    DELETE FROM public.hospital_feature_overrides
     WHERE hospital_id = p_hospital_id AND module_key = p_module_key;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_hospital_module_addon(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_hospital_module_addon(uuid, text, boolean) TO authenticated;

COMMIT;

-- ============================================================
-- Drift monitor: catch a double-billed module even when it did NOT go
-- through set_hospital_module_addon above (admin attachAddon on the
-- Billing tab, or a hospital's self-service bundle purchase in
-- SettingsPlanPage — neither of those paths carries the guard this
-- migration just added to the RPC). Flagged in the revenue-pod billing
-- review of this migration: two ACTIVE hospital_addons rows that both
-- grant the same module both bill for it, and the existing "unsellable"
-- branch below does not catch it — it only ever compares a SKU against
-- the PLAN, never against another SKU the hospital already bought.
-- ============================================================

BEGIN;

CREATE OR REPLACE VIEW public.addon_entitlement_drift AS
-- SKU sells a module the plan already includes for free
SELECT
  'unsellable'::text  AS drift_type,
  s.slug              AS addon_slug,
  s.name              AS addon_name,
  sp.slug             AS plan_slug,
  NULL::uuid          AS hospital_id,
  NULL::text          AS hospital_name,
  m.module_key,
  format('Plan "%s" already includes "%s", so the "%s" add-on cannot be sold to it.',
         sp.slug, m.module_key, s.name) AS detail
FROM public.addon_skus s
CROSS JOIN LATERAL unnest(s.module_keys) AS m(module_key)
JOIN public.plan_features pf ON pf.module_key = m.module_key AND pf.is_enabled
JOIN public.subscription_plans sp ON sp.id = pf.plan_id
WHERE s.is_active AND sp.is_active AND sp.slug <> 'professional'

UNION ALL

-- Hospital pays for an add-on whose module an admin override has disabled
SELECT
  'paid_but_gated'::text,
  s.slug,
  s.name,
  NULL::text,
  h.id,
  h.name,
  m.module_key,
  format('%s pays for "%s" but module "%s" is disabled by an admin override.',
         h.name, s.name, m.module_key)
FROM public.hospital_addons ha
JOIN public.addon_skus s ON s.id = ha.addon_sku_id
JOIN public.hospitals  h ON h.id = ha.hospital_id
CROSS JOIN LATERAL unnest(s.module_keys) AS m(module_key)
JOIN public.hospital_feature_overrides o
  ON o.hospital_id = ha.hospital_id
 AND o.module_key  = m.module_key
 AND o.is_enabled = false
WHERE ha.status = 'active'

UNION ALL

-- Two ACTIVE add-ons both grant the same module — a real double-charge for
-- zero incremental access, not just a display inconsistency. s1.id < s2.id
-- reports each overlapping pair once (join is otherwise symmetric).
SELECT
  'double_billed'::text,
  s1.slug,
  s1.name,
  NULL::text,
  h.id,
  h.name,
  m.module_key,
  format('%s is billed for both "%s" and "%s", which both grant module "%s".',
         h.name, s1.name, s2.name, m.module_key)
FROM public.hospital_addons ha1
JOIN public.addon_skus s1 ON s1.id = ha1.addon_sku_id
JOIN public.hospital_addons ha2
  ON ha2.hospital_id = ha1.hospital_id
 AND ha2.status = 'active'
 AND ha2.addon_sku_id <> ha1.addon_sku_id
JOIN public.addon_skus s2 ON s2.id = ha2.addon_sku_id AND s2.id > s1.id
JOIN public.hospitals h ON h.id = ha1.hospital_id
CROSS JOIN LATERAL unnest(s1.module_keys) AS m(module_key)
WHERE ha1.status = 'active'
  AND m.module_key = ANY (s2.module_keys);

COMMENT ON VIEW public.addon_entitlement_drift IS
  'Inconsistencies between the add-on catalogue and the plan/override matrix, or between two purchases. "unsellable" = plan already grants it free; "paid_but_gated" = hospital is charged for a module an override has switched off; "double_billed" = two active add-ons both grant (and both bill for) the same module.';

COMMIT;
