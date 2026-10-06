-- Per-user "Quick Access" sidebar personalization.
-- One row per user (any role, not just doctors). items = jsonb array of
-- { route: string, moduleKey?: string } referencing entries in ALL_MODULES
-- (src/lib/modules.ts) or the legacy hardcoded quick-access paths.
-- Absence of a row = user has not customized; the sidebar falls back to the
-- default 9-item list. This is a UI preference, not PHI — no audit trigger.
--
-- NOTE: this migration is already applied to the live project as-is (with
-- items NOT NULL, no default_route column). It is intentionally left
-- matching what actually ran — see 20261107000005_user_quick_access_prefs.sql
-- for the follow-up ALTERs. Do not re-edit this file; add a new migration.

CREATE TABLE IF NOT EXISTS public.user_quick_access (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid        NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  items       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_quick_access_user
  ON public.user_quick_access (user_id);
CREATE INDEX IF NOT EXISTS idx_user_quick_access_hospital
  ON public.user_quick_access (hospital_id);

ALTER TABLE public.user_quick_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "uqa_select" ON public.user_quick_access;
DROP POLICY IF EXISTS "uqa_insert" ON public.user_quick_access;
DROP POLICY IF EXISTS "uqa_update" ON public.user_quick_access;
DROP POLICY IF EXISTS "uqa_delete" ON public.user_quick_access;

CREATE POLICY "uqa_select" ON public.user_quick_access
  FOR SELECT TO authenticated
  USING (
    user_id     = (SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1)
    AND hospital_id = public.get_user_hospital_id()
  );

CREATE POLICY "uqa_insert" ON public.user_quick_access
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id     = (SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1)
    AND hospital_id = public.get_user_hospital_id()
  );

CREATE POLICY "uqa_update" ON public.user_quick_access
  FOR UPDATE TO authenticated
  USING (
    user_id     = (SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1)
    AND hospital_id = public.get_user_hospital_id()
  )
  WITH CHECK (
    user_id     = (SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1)
    AND hospital_id = public.get_user_hospital_id()
  );

CREATE POLICY "uqa_delete" ON public.user_quick_access
  FOR DELETE TO authenticated
  USING (
    user_id     = (SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1)
    AND hospital_id = public.get_user_hospital_id()
  );
