-- Adds the personal "default landing page after sign-in" preference on top
-- of the existing Quick Access row, and decouples the two preferences so
-- resetting/clearing one never disturbs the other:
--   items          — NULL = not customized (fall back to the default 9);
--                    an array (including []) = explicitly customized.
--   default_route  — NULL = use the role default (src/lib/postAuthRoute.ts);
--                    a route string = personal override.
-- Same table, same RLS — these are row-level policies, so both columns are
-- already covered by the 4 existing uqa_* policies with no changes needed.
ALTER TABLE public.user_quick_access
  ADD COLUMN IF NOT EXISTS default_route text;

ALTER TABLE public.user_quick_access
  ALTER COLUMN items DROP NOT NULL,
  ALTER COLUMN items DROP DEFAULT;
