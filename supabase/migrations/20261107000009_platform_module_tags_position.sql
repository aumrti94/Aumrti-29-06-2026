-- Lets a platform admin choose where a module tag renders on the card — bottom (inline,
-- alongside the existing "NEW" badge, the original/default look) or a top corner ribbon.
ALTER TABLE public.platform_module_tags
  ADD COLUMN IF NOT EXISTS position TEXT NOT NULL DEFAULT 'bottom'
    CHECK (position IN ('bottom', 'top-left', 'top-right'));
