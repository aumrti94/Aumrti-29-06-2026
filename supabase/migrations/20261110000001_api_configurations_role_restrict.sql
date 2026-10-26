-- ─────────────────────────────────────────────────────────────────────────────
-- api_configurations: restrict credential access to administrators
-- ─────────────────────────────────────────────────────────────────────────────
-- THE DEFECT
--
-- The original policy (20260327062736) was:
--
--   CREATE POLICY "api_configurations_select" ON public.api_configurations
--     FOR SELECT TO authenticated
--     USING (hospital_id = public.get_user_hospital_id());
--
-- Tenant-scoped, and nothing else. This table's `config` jsonb holds LIVE
-- third-party credentials — the Razorpay key_secret, the WATI token, ABDM and
-- PMJAY gateway credentials — so every authenticated user at a hospital, down to
-- a receptionist or ward clerk, could read them in plaintext straight off
-- PostgREST. src/pages/settings/APIConfigHubPage.tsx compounds it with
-- `.select("*")`: the secrets reach the browser, where maskKey() then "masks"
-- a value already sitting in the network tab.
--
-- The pattern for getting this right was already in the codebase — the
-- phi_access_audit policy in 20261009000185 scopes by hospital AND role, in the
-- same file that re-created the equally-unscoped prompt_registry policy. It was
-- simply never applied here.
--
-- WHAT THIS CHANGES
--
-- Credential rows become administrator-only (hospital_admin / super_admin, plus
-- Aumrti admins). Edge functions are unaffected — they run on the service role,
-- which bypasses RLS.
--
-- WHAT WOULD HAVE BROKEN, AND WHY IT DOESN'T
--
-- Two legitimate NON-admin readers exist, and a blunt admin-only lock would have
-- silently broken both — a cashier is not a hospital_admin:
--
--   1. src/lib/hospitalUpi.ts → the hospital's UPI VPA, printed as a QR on
--      receipts and invoices. That address is a PAYEE IDENTIFIER, not a secret;
--      it is on every slip handed to a patient.
--   2. src/pages/billing/PaymentsPage.tsx → `select("id")` purely to learn
--      whether Razorpay is configured, so it can show or hide a button.
--
-- Neither needs the credential. Both are served below by SECURITY DEFINER
-- functions that return ONLY the non-secret field, scoped to the caller's own
-- hospital from the session — never from a caller-supplied argument.
--
-- Idempotent — safe to re-run against the live DB.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Policies: administrators only ────────────────────────────────────────────
DROP POLICY IF EXISTS "api_configurations_select" ON public.api_configurations;
DROP POLICY IF EXISTS "api_configurations_insert" ON public.api_configurations;
DROP POLICY IF EXISTS "api_configurations_update" ON public.api_configurations;
DROP POLICY IF EXISTS "api_configurations_delete" ON public.api_configurations;
DROP POLICY IF EXISTS "api_configurations_service" ON public.api_configurations;

-- Tenant scope AND role, both. Dropping either reopens the hole: hospital alone
-- is what shipped, and role alone would let one hospital's admin read another's.
CREATE POLICY "api_configurations_select" ON public.api_configurations
  FOR SELECT TO authenticated
  USING (
    public.is_aumrti_admin()
    OR (
      hospital_id = public.get_user_hospital_id()
      AND (public.has_role(auth.uid(), 'hospital_admin'::public.app_role)
           OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
    )
  );

CREATE POLICY "api_configurations_insert" ON public.api_configurations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_aumrti_admin()
    OR (
      hospital_id = public.get_user_hospital_id()
      AND (public.has_role(auth.uid(), 'hospital_admin'::public.app_role)
           OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
    )
  );

CREATE POLICY "api_configurations_update" ON public.api_configurations
  FOR UPDATE TO authenticated
  USING (
    public.is_aumrti_admin()
    OR (
      hospital_id = public.get_user_hospital_id()
      AND (public.has_role(auth.uid(), 'hospital_admin'::public.app_role)
           OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
    )
  )
  WITH CHECK (
    public.is_aumrti_admin()
    OR (
      hospital_id = public.get_user_hospital_id()
      AND (public.has_role(auth.uid(), 'hospital_admin'::public.app_role)
           OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
    )
  );

CREATE POLICY "api_configurations_delete" ON public.api_configurations
  FOR DELETE TO authenticated
  USING (
    public.is_aumrti_admin()
    OR (
      hospital_id = public.get_user_hospital_id()
      AND (public.has_role(auth.uid(), 'hospital_admin'::public.app_role)
           OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
    )
  );

-- Edge functions already bypass RLS on the service role; stated explicitly so a
-- future tightening of the authenticated policies cannot accidentally catch them.
CREATE POLICY "api_configurations_service" ON public.api_configurations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── Non-secret reads for the billing flow ────────────────────────────────────
-- SECURITY DEFINER so a cashier can call them without any SELECT grant on the
-- table itself. Both derive the hospital from the SESSION rather than taking it
-- as an argument: a parameter would be spoofable by anyone who can call an RPC,
-- which would turn a fix into a cross-tenant read.

-- The hospital's own UPI VPA. Printed on receipts and invoice QR codes, so it is
-- public by construction — it is the address patients are asked to pay.
CREATE OR REPLACE FUNCTION public.get_hospital_upi_id()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT NULLIF(TRIM(ac.config ->> 'upi_id'), '')
  FROM public.api_configurations ac
  WHERE ac.hospital_id = public.get_user_hospital_id()
    AND ac.service_key = 'razorpay'
    AND ac.is_active = true
  LIMIT 1;
$$;

-- Whether a given integration is configured — a boolean for showing or hiding a
-- button. Deliberately returns ONLY existence, never any part of the config.
--
-- service_key is constrained to an allow-list rather than passed through: a free
-- parameter would let a caller probe which integrations a hospital runs, and
-- there is no UI need beyond these.
CREATE OR REPLACE FUNCTION public.is_hospital_service_configured(p_service_key text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_service_key NOT IN ('razorpay', 'wati') THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.api_configurations ac
      WHERE ac.hospital_id = public.get_user_hospital_id()
        AND ac.service_key = p_service_key
        AND ac.is_active = true
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.get_hospital_upi_id()                    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_hospital_service_configured(text)     FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_hospital_upi_id()                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_hospital_service_configured(text)  TO authenticated;
