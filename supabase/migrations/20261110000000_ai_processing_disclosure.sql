-- ─────────────────────────────────────────────────────────────────────────────
-- AI processing disclosure — the sub-processor / residency / retention statement
-- a hospital's DPDP officer and procurement team can actually read.
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THIS EXISTS
--
-- Hospitals asking to "manage their own API configuration" are, in most cases,
-- asking a different question: *where does our patient data go, under whose
-- contract, and for how long is it kept*. Today Aumrti has no answer to that on
-- any hospital-facing screen, so the only mechanism a hospital can picture is
-- taking custody of the keys. This table is the cheap, honest answer.
--
-- IT IS A CURATED STATEMENT, NOT A LIVE CONFIG READ. Deliberately NOT derived
-- from platform_ai_provider_config:
--   • A resolved model string ("gemini-2.0-flash") is an operational detail that
--     changes without notice. A hospital's DPDP officer who sees it on a screen
--     will — reasonably — treat it as a contractual commitment, and we would be
--     bound by an implementation detail.
--   • A disclosure is a governance artefact. It is versioned, authored, dated
--     and published deliberately, which is exactly what a DPIA needs to cite.
-- Note that provider IS already readable per-feature by hospital users via
-- ai_cost_daily.provider (and model via ai_usage_logs.model_name), so this is
-- not about concealment — it is about giving the hospital something stable and
-- quotable rather than a live string that moves under them.
--
-- NO hospital_id, BY DESIGN. One deployment, one set of sub-processors, one
-- statement — the same artefact every tenant reads, like subscription_plans and
-- prompt_registry. Tenant-scoping it would mean 100 copies of one legal fact
-- drifting apart. RLS is still enabled: read is open to authenticated users
-- (it is a disclosure; that is its entire purpose), writes are platform-only.
--
-- VERSIONED AND APPEND-ONLY IN SPIRIT. Never UPDATE a published row to change
-- what was disclosed — insert a new version. A hospital must be able to answer
-- "what was I told in March" eighteen months later during an incident review;
-- overwriting destroys exactly that. Enforced by the trigger below.
--
-- Idempotent — safe to re-run against the live DB.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_processing_disclosure (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Monotonic, human-quotable. "Disclosure v3, effective 01/11/2026".
  version           integer NOT NULL,
  effective_from    date    NOT NULL,

  -- The sub-processor list. Array of objects; shape is documented rather than
  -- constrained because the fields a given provider needs vary (an Indian ASR
  -- vendor has no cross-border clause; a US LLM vendor has little else):
  --   { "name", "purpose", "region", "retention", "trains_on_input" (boolean),
  --     "dpa_in_place" (boolean) }
  sub_processors    jsonb   NOT NULL DEFAULT '[]'::jsonb,

  -- Plain-English answers to the three questions procurement actually asks.
  -- Prose, not enums — a DPDP officer needs a sentence they can paste into a
  -- DPIA, and an enum would force us to lie by rounding.
  data_region       text    NOT NULL,
  retention_stance  text    NOT NULL,
  training_stance   text    NOT NULL,

  -- Reference to the signed DPA covering the above. Free text (a document
  -- reference, a clause number, a URL) — not a link we must keep alive.
  dpa_reference     text,

  -- Anything the three stances above cannot carry. Rendered verbatim.
  notes             text,

  -- Unpublished rows are drafts: authored, reviewable, invisible to hospitals.
  is_published      boolean NOT NULL DEFAULT false,

  created_at        timestamptz NOT NULL DEFAULT now(),
  -- *_by columns FK public.users, NEVER auth.users — the two diverge for every
  -- account created after 20260322111223 (npm run check:user-fk).
  created_by        uuid REFERENCES public.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_processing_disclosure_version_idx
  ON public.ai_processing_disclosure (version);

-- The hospital-facing read is always "the newest published row", so index the
-- exact shape of that query rather than making every settings page sort the table.
CREATE INDEX IF NOT EXISTS ai_processing_disclosure_published_idx
  ON public.ai_processing_disclosure (is_published, effective_from DESC)
  WHERE is_published = true;

-- ── Published disclosures are immutable ──────────────────────────────────────
-- A disclosure is evidence of what a hospital was told, on a date. Editing a
-- published row rewrites history and destroys the only thing the artefact is
-- for. Drafts stay fully editable; publishing is the one-way door.
--
-- Toggling is_published true→false is also blocked: a hospital may have cited
-- the version in its own DPIA, and silently unpublishing it leaves that citation
-- pointing at nothing. Supersede with a new version instead.
CREATE OR REPLACE FUNCTION public.enforce_disclosure_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.is_published = true THEN
    RAISE EXCEPTION
      'Disclosure v% is published and cannot be edited. Insert a new version instead.',
      OLD.version;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_disclosure_immutable ON public.ai_processing_disclosure;
CREATE TRIGGER trg_disclosure_immutable
  BEFORE UPDATE ON public.ai_processing_disclosure
  FOR EACH ROW EXECUTE FUNCTION public.enforce_disclosure_immutable();

-- Deleting a published disclosure has the same effect as editing it.
CREATE OR REPLACE FUNCTION public.enforce_disclosure_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_published = true THEN
    RAISE EXCEPTION
      'Disclosure v% is published and cannot be deleted. Supersede it with a new version.',
      OLD.version;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_disclosure_no_delete ON public.ai_processing_disclosure;
CREATE TRIGGER trg_disclosure_no_delete
  BEFORE DELETE ON public.ai_processing_disclosure
  FOR EACH ROW EXECUTE FUNCTION public.enforce_disclosure_no_delete();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.ai_processing_disclosure ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_processing_disclosure_select_published" ON public.ai_processing_disclosure;
DROP POLICY IF EXISTS "ai_processing_disclosure_admin_all"        ON public.ai_processing_disclosure;
DROP POLICY IF EXISTS "ai_processing_disclosure_service"          ON public.ai_processing_disclosure;

-- Every authenticated user may read PUBLISHED disclosures. Deliberately not
-- restricted to admins: a disclosure exists to be disclosed, and a nurse asked
-- by a patient "where do my records go" should be able to find the answer.
-- Drafts are invisible here — they are not yet anybody's statement.
CREATE POLICY "ai_processing_disclosure_select_published"
  ON public.ai_processing_disclosure FOR SELECT TO authenticated
  USING (is_published = true OR public.is_aumrti_admin());

-- Authoring is an Aumrti act. A hospital cannot write its own disclosure, and
-- hospital_admin is NOT sufficient — this is a platform legal artefact.
CREATE POLICY "ai_processing_disclosure_admin_all"
  ON public.ai_processing_disclosure FOR ALL TO authenticated
  USING (public.is_aumrti_admin())
  WITH CHECK (public.is_aumrti_admin());

CREATE POLICY "ai_processing_disclosure_service"
  ON public.ai_processing_disclosure FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON public.ai_processing_disclosure TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ai_processing_disclosure TO authenticated;

-- ── Seed: an explicitly UNPUBLISHED v1 skeleton ──────────────────────────────
-- Seeded as a draft on purpose. The content below is a template, not a legal
-- statement — the real sub-processor list, region and retention terms must be
-- confirmed against the signed provider contracts before anyone publishes it.
-- Publishing is a deliberate act by a human who has checked. Shipping this
-- pre-published would make Aumrti assert contractual facts nobody verified.
INSERT INTO public.ai_processing_disclosure (
  version, effective_from, sub_processors,
  data_region, retention_stance, training_stance, dpa_reference, notes, is_published
) VALUES (
  1,
  CURRENT_DATE,
  '[]'::jsonb,
  'TEMPLATE — confirm against signed provider contracts before publishing.',
  'TEMPLATE — confirm the retention term each provider contract actually grants.',
  'TEMPLATE — confirm whether each provider is contractually barred from training on input.',
  NULL,
  'Draft skeleton created by migration 20261110000000. Complete every field from the signed contracts, have it reviewed, then publish. Hospitals see nothing until is_published = true.',
  false
)
ON CONFLICT (version) DO NOTHING;
