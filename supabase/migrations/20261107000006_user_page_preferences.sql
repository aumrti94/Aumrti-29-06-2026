-- Generic per-user, per-page preference store — for cases like "which OPD
-- Queue status tab should open by default for me" that don't fit the
-- navigation-scoped user_quick_access table. One row per (user, page_key);
-- `preferences` is a small free-form jsonb blob whose shape is owned by
-- whichever page reads it (e.g. opd_queue -> { default_status: "queue" }).
-- This is a UI preference, not PHI — no audit trigger.

CREATE TABLE IF NOT EXISTS public.user_page_preferences (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid        NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  page_key    text        NOT NULL,
  preferences jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, page_key)
);

CREATE INDEX IF NOT EXISTS idx_user_page_preferences_user
  ON public.user_page_preferences (user_id, page_key);
CREATE INDEX IF NOT EXISTS idx_user_page_preferences_hospital
  ON public.user_page_preferences (hospital_id);

ALTER TABLE public.user_page_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "upp_select" ON public.user_page_preferences;
DROP POLICY IF EXISTS "upp_insert" ON public.user_page_preferences;
DROP POLICY IF EXISTS "upp_update" ON public.user_page_preferences;
DROP POLICY IF EXISTS "upp_delete" ON public.user_page_preferences;

CREATE POLICY "upp_select" ON public.user_page_preferences
  FOR SELECT TO authenticated
  USING (
    user_id     = (SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1)
    AND hospital_id = public.get_user_hospital_id()
  );

CREATE POLICY "upp_insert" ON public.user_page_preferences
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id     = (SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1)
    AND hospital_id = public.get_user_hospital_id()
  );

CREATE POLICY "upp_update" ON public.user_page_preferences
  FOR UPDATE TO authenticated
  USING (
    user_id     = (SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1)
    AND hospital_id = public.get_user_hospital_id()
  )
  WITH CHECK (
    user_id     = (SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1)
    AND hospital_id = public.get_user_hospital_id()
  );

CREATE POLICY "upp_delete" ON public.user_page_preferences
  FOR DELETE TO authenticated
  USING (
    user_id     = (SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1)
    AND hospital_id = public.get_user_hospital_id()
  );
