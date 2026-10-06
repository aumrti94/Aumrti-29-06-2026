-- Platform-admin equivalent of user_quick_access (20261107000004): pinnable sidebar
-- shortcuts, but keyed to an aumrti_admins row instead of a hospital user — a platform
-- admin has no hospital_id, so the hospital table's RLS (hospital_id = current tenant)
-- cannot be reused as-is. Same reasoning as user_quick_access: a UI preference, not PHI,
-- no audit trigger.
CREATE TABLE IF NOT EXISTS public.platform_admin_quick_access (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID NOT NULL REFERENCES public.aumrti_admins(id) ON DELETE CASCADE,
  -- NULL = not customized (fall back to DEFAULT_PLATFORM_QUICK_ACCESS); an array
  -- (including []) = explicitly customized, same NULL-vs-[] convention as user_quick_access.
  items       JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (admin_id)
);

ALTER TABLE public.platform_admin_quick_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "paqa_select" ON public.platform_admin_quick_access;
CREATE POLICY "paqa_select" ON public.platform_admin_quick_access
  FOR SELECT TO authenticated
  USING (admin_id = (SELECT id FROM public.aumrti_admins WHERE auth_user_id = auth.uid() AND is_active = true LIMIT 1));

DROP POLICY IF EXISTS "paqa_insert" ON public.platform_admin_quick_access;
CREATE POLICY "paqa_insert" ON public.platform_admin_quick_access
  FOR INSERT TO authenticated
  WITH CHECK (admin_id = (SELECT id FROM public.aumrti_admins WHERE auth_user_id = auth.uid() AND is_active = true LIMIT 1));

DROP POLICY IF EXISTS "paqa_update" ON public.platform_admin_quick_access;
CREATE POLICY "paqa_update" ON public.platform_admin_quick_access
  FOR UPDATE TO authenticated
  USING (admin_id = (SELECT id FROM public.aumrti_admins WHERE auth_user_id = auth.uid() AND is_active = true LIMIT 1))
  WITH CHECK (admin_id = (SELECT id FROM public.aumrti_admins WHERE auth_user_id = auth.uid() AND is_active = true LIMIT 1));
