-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: product_modes let hospital staff write their own row
-- ------------------------------------------------------------------------------
-- 20260524000005_product_modes.sql created product_modes_hospital_policy as
-- `FOR ALL USING (...)` with no WITH CHECK. Postgres applies a FOR ALL/USING-only
-- policy to every command — SELECT, INSERT, UPDATE, DELETE alike — so any
-- authenticated staff member of a hospital had direct database write access to
-- their own hospital's product_modes row, including the `mode` column
-- (clinic | hospital | diagnostic | pharmacy | institute), via a raw
-- .insert()/.update()/.delete() call, browser dev tools, or a future bug.
--
-- Nothing in the UI exploits this today (grepped: the only write anywhere in
-- src/ is the one-time provisioning insert in
-- src/pages/setup/steps/Step7bModules.tsx), but an upcoming hospital-facing
-- Product Mode / SKU badge is explicitly read-only, and it cannot be read-only
-- while the database still lets the viewer write the row it displays.
--
-- Replaced with three narrower policies:
--   - product_modes_hospital_read   — SELECT only, own hospital. Keeps the
--     read-only badge and ProductModeContext.tsx (which already only SELECTs
--     `mode`) working unchanged.
--   - product_modes_hospital_insert — INSERT only, own hospital. Keeps the
--     hospital-side provisioning write in Step7bModules.tsx working — it
--     creates the hospital's initial product_modes row at onboarding. The
--     table's own `hospital_id UUID ... UNIQUE` constraint (already in
--     20260524000005_product_modes.sql) caps this to exactly one row per
--     hospital: a second INSERT for the same hospital_id fails on that
--     constraint, not on RLS, so no extra "already provisioned" guard is
--     needed here. Deliberately no UPDATE/DELETE grant for hospital staff —
--     once the row exists, `mode` and `enabled_modules` are admin-only, same
--     as the SKU catalogue in 20261008000166_addon_skus.sql.
--   - product_modes_admin_write     — FOR ALL for aumrti_admins, same
--     USING + WITH CHECK shape as addon_skus_admin_write in
--     20261008000166_addon_skus.sql (the existing convention for
--     platform-catalogue tables admins write and hospitals only read).
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS product_modes_hospital_policy ON public.product_modes;

DROP POLICY IF EXISTS product_modes_hospital_read ON public.product_modes;
CREATE POLICY product_modes_hospital_read
  ON public.product_modes
  FOR SELECT
  TO authenticated
  USING (
    hospital_id IN (
      SELECT hospital_id FROM public.users WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS product_modes_hospital_insert ON public.product_modes;
CREATE POLICY product_modes_hospital_insert
  ON public.product_modes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    hospital_id IN (
      SELECT hospital_id FROM public.users WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS product_modes_admin_write ON public.product_modes;
CREATE POLICY product_modes_admin_write
  ON public.product_modes
  FOR ALL
  TO authenticated
  USING (public.is_aumrti_admin())
  WITH CHECK (public.is_aumrti_admin());
