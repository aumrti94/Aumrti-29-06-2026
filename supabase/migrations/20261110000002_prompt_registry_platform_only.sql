-- ─────────────────────────────────────────────────────────────────────────────
-- prompt_registry: writes become platform-only
-- ─────────────────────────────────────────────────────────────────────────────
-- THE DEFECT
--
-- prompt_registry holds the clinical system prompts for voice scribe, discharge
-- summaries, ICD coding, differential diagnosis and the rest. It has NO
-- hospital_id column — it is global, one row per feature_key, shared by every
-- tenant on the deployment. That is the correct design for a platform-governed
-- artefact.
--
-- The policy shipped with it (20260622000009, re-created unchanged in
-- 20261009000185) was:
--
--   CREATE POLICY "Admins can manage prompts"
--     ON public.prompt_registry FOR ALL TO authenticated
--     USING (public.is_aumrti_admin() OR EXISTS (
--       SELECT 1 FROM public.users
--       WHERE auth_user_id = auth.uid()
--         AND role IN ('super_admin', 'hospital_admin')));
--
-- `FOR ALL`, no hospital predicate — because there is no hospital column to
-- predicate on. So ANY hospital_admin, at ANY tenant, could INSERT, UPDATE or
-- DELETE the clinical prompts used by EVERY hospital on the platform. One
-- customer's administrator could rewrite the instruction that generates another
-- customer's discharge summaries, or flip is_active on a safety prompt.
--
-- The table's own header says "Dr. Nalini must approve all clinical prompts
-- before activation" and seeds every row is_active = false for that reason. The
-- policy made that governance unenforceable.
--
-- Note the adjacent policy in 20261009000185 (phi_access_audit) DOES scope by
-- both hospital and role, in the same file — the correct pattern was in hand.
--
-- WHAT THIS CHANGES
--
-- Authoring and activating a clinical prompt becomes an Aumrti platform act.
-- hospital_admin and super_admin lose write access entirely; they keep the
-- read of active prompts, which is what the application actually needs.
--
-- This is a genuine capability removal, and deliberately so: there is no
-- per-hospital prompt customisation today (no hospital_id to scope it by), so
-- nothing a hospital could legitimately have been doing here is lost. If
-- per-tenant prompts are wanted later, that needs a hospital_id column and its
-- own isolation policy — not a global table anyone may write.
--
-- Idempotent — safe to re-run against the live DB.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can manage prompts"                   ON public.prompt_registry;
DROP POLICY IF EXISTS "Authenticated users can read active prompts" ON public.prompt_registry;
DROP POLICY IF EXISTS "prompt_registry_read_active"                 ON public.prompt_registry;
DROP POLICY IF EXISTS "prompt_registry_platform_manage"             ON public.prompt_registry;
DROP POLICY IF EXISTS "prompt_registry_service"                     ON public.prompt_registry;

-- Read stays open to authenticated users, limited to ACTIVE prompts. Inactive
-- rows are drafts awaiting clinical approval and must not be readable as though
-- they were in force. Aumrti admins see drafts too, so the approval screen works.
CREATE POLICY "prompt_registry_read_active"
  ON public.prompt_registry FOR SELECT TO authenticated
  USING (is_active = true OR public.is_aumrti_admin());

-- Writes: Aumrti platform administrators only. Not hospital_admin, not
-- super_admin — a tenant role must never be able to edit a global clinical
-- artefact.
CREATE POLICY "prompt_registry_platform_manage"
  ON public.prompt_registry FOR ALL TO authenticated
  USING (public.is_aumrti_admin())
  WITH CHECK (public.is_aumrti_admin());

-- Edge functions resolve prompts on the service role; stated explicitly rather
-- than relying on the implicit RLS bypass, so this table reads like the others.
CREATE POLICY "prompt_registry_service"
  ON public.prompt_registry FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Table privileges stay broad; the POLICY above is the single decision point for
-- who may write, exactly as on platform_ai_keys, hospital_ai_provider_config and
-- ai_processing_disclosure.
--
-- Revoking INSERT/UPDATE/DELETE from `authenticated` was considered as defence in
-- depth and rejected: Aumrti platform admins are themselves `authenticated`, so a
-- blanket revoke would also block the prompt-approval screen this table's own
-- header anticipates ("Dr. Nalini must approve all clinical prompts before
-- activation"), and it would fail as a bare `permission denied for table
-- prompt_registry` that reads like an outage rather than a policy decision.
-- Keeping one gate that is easy to read beats two that disagree.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prompt_registry TO authenticated;
