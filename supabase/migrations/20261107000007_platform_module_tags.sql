-- Platform-managed module tags: a platform admin can stamp any module with a label
-- ("Beta", "Most Popular", etc.), shown identically to every hospital regardless of plan or
-- entitlement. Deliberately global (no hospital_id) — unlike every other module-related
-- gating table in this codebase, this one grants no access, it is a display label only.
CREATE TABLE IF NOT EXISTS public.platform_module_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key  TEXT NOT NULL,
  label       TEXT NOT NULL,
  -- Fixed style set rather than a free color, so a mistyped hex never renders unreadably.
  tone        TEXT NOT NULL DEFAULT 'info' CHECK (tone IN ('new', 'beta', 'popular', 'info')),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES public.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_module_tags_module_key_idx
  ON public.platform_module_tags (module_key);

ALTER TABLE public.platform_module_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_module_tags_read" ON public.platform_module_tags;
CREATE POLICY "platform_module_tags_read" ON public.platform_module_tags
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "platform_module_tags_write" ON public.platform_module_tags;
CREATE POLICY "platform_module_tags_write" ON public.platform_module_tags
  FOR ALL TO authenticated
  USING (public.is_aumrti_admin())
  WITH CHECK (public.is_aumrti_admin());
