-- ─────────────────────────────────────────────────────────────────────────────
-- BYOK — hospital-owned AI provider keys, Aumrti-operated
-- ─────────────────────────────────────────────────────────────────────────────
-- Replaces the earlier untracked draft (20261109000000_hospital_byok_ai_config.sql),
-- which must NOT be applied. Four things are different, each for a reason:
--
--  1. ONE BOOLEAN, NOT TWO. The draft carried `byok_allowed` (platform grant) on
--     the same row as hospital-editable settings, which RLS cannot protect at
--     column level — so it needed a 30-line SECURITY DEFINER trigger whose only
--     job was to defend a column that should not have been there. The grant is
--     an ENTITLEMENT: the `api_hub` module key, resolved through the same
--     plan → add-on → override path as every other module, carrying
--     platform-admin-only writes, a `reason`, and an audit trail for free.
--     The trigger and its implicit `auth.uid() IS NULL` self-grant exemption
--     both disappear with it.
--
--  2. NO SILENT FALLBACK. The draft's header stated: "Own-keys is ACTIVE for a
--     call only when allowed AND enabled AND a key row exists. Anything less
--     falls back to the platform global config." That last sentence IS the
--     silent fallback this feature exists to forbid — a hospital whose key
--     expired would keep working, on Aumrti's key, believing otherwise.
--     Enforcement now lives in _shared/byokPolicy.ts and is exhaustively tested
--     (src/lib/byokPolicy.test.ts walks all 27 states).
--
--  3. THE SAFETY CARVE-OUT IS REAL THIS TIME. The draft asserted it was
--     "Enforced in _shared/ai-config.ts" when resolveAiConfig had no BYOK fork
--     at all. It is now enforced in byokPolicy.decideKeySource, which decides
--     safety-class BEFORE consulting BYOK state — so safety AI is structurally
--     out of scope rather than exempted at call time, and survives both an
--     expired hospital key and an unreadable BYOK state.
--
--  4. METERING IS OBSERVED, NOT RESTATED. `key_owner` records which credential
--     actually served the call, read back from the resolved config. A flag
--     derived from `byok_enabled` would make the alert meant to catch a leak
--     structurally incapable of firing.
--
-- Idempotent — safe to re-run against the live DB.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── hospital_ai_provider_config (non-secret: provider / model / switch) ──────
CREATE TABLE IF NOT EXISTS public.hospital_ai_provider_config (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id    uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,

  -- The hospital's own switch. The GRANT is the `api_hub` entitlement, not a
  -- column here — see note 1 above.
  byok_enabled   boolean NOT NULL DEFAULT false,

  provider       text,
  model_name     text,
  temperature    numeric DEFAULT 0.3,
  max_tokens     integer,

  -- Non-secret key metadata, so the hospital can confirm a key is set without
  -- being able to read it back.
  key_last4      text,
  key_set_at     timestamptz,
  last_tested_at timestamptz,
  test_status    text,
  -- Scrubbed before storage. Provider error bodies routinely echo the API key,
  -- an organisation id, or request content — and this column is readable by the
  -- hospital's own admins.
  test_message   text,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- *_by columns FK public.users, NEVER auth.users (npm run check:user-fk).
  updated_by     uuid REFERENCES public.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS hospital_ai_provider_config_hospital_idx
  ON public.hospital_ai_provider_config (hospital_id);

-- ── hospital_ai_keys (SECRET) ────────────────────────────────────────────────
-- No hospital-facing policy of ANY kind, mirroring platform_ai_keys. Written
-- only by the `hospital-ai-key` edge function on the service role; read only by
-- edge functions resolving a call. A hospital admin may set and replace a key;
-- they can never read one back, and neither can an Aumrti admin — see the
-- policy note below.
CREATE TABLE IF NOT EXISTS public.hospital_ai_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  service_key text NOT NULL,
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES public.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS hospital_ai_keys_hospital_service_idx
  ON public.hospital_ai_keys (hospital_id, service_key);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.hospital_ai_provider_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_ai_keys            ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hospital_ai_provider_config_select"  ON public.hospital_ai_provider_config;
DROP POLICY IF EXISTS "hospital_ai_provider_config_write"   ON public.hospital_ai_provider_config;
DROP POLICY IF EXISTS "hospital_ai_provider_config_service" ON public.hospital_ai_provider_config;

-- Read: the hospital's own administrators. NOT every authenticated user — this
-- row names the hospital's AI vendor and carries key metadata, and the lesson of
-- api_configurations (20261110000001) is that tenant scope alone is not enough.
CREATE POLICY "hospital_ai_provider_config_select"
  ON public.hospital_ai_provider_config FOR SELECT TO authenticated
  USING (
    public.is_aumrti_admin()
    OR (hospital_id = public.get_user_hospital_id()
        AND (public.has_role(auth.uid(), 'hospital_admin'::public.app_role)
             OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))
  );

CREATE POLICY "hospital_ai_provider_config_write"
  ON public.hospital_ai_provider_config FOR ALL TO authenticated
  USING (
    public.is_aumrti_admin()
    OR (hospital_id = public.get_user_hospital_id()
        AND (public.has_role(auth.uid(), 'hospital_admin'::public.app_role)
             OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))
  )
  WITH CHECK (
    public.is_aumrti_admin()
    OR (hospital_id = public.get_user_hospital_id()
        AND (public.has_role(auth.uid(), 'hospital_admin'::public.app_role)
             OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))
  );

CREATE POLICY "hospital_ai_provider_config_service"
  ON public.hospital_ai_provider_config FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "hospital_ai_keys_admin_all" ON public.hospital_ai_keys;
DROP POLICY IF EXISTS "hospital_ai_keys_service"   ON public.hospital_ai_keys;

-- hospital_ai_keys: SERVICE ROLE ONLY. Note this is stricter than the draft,
-- which granted Aumrti admins `FOR ALL ... USING (is_aumrti_admin())` and
-- therefore SELECT on a third party's live credential. If Aumrti can read the
-- key out, the hospital has not gained custody — it has a WORSE position than
-- before, now liable for a credential it does not solely control, which
-- contradicts the entire reason it asked for BYOK. Platform admins manage keys
-- through the edge function, which can write and rotate but never return one.
CREATE POLICY "hospital_ai_keys_service"
  ON public.hospital_ai_keys FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hospital_ai_provider_config TO authenticated;
-- Deliberately NO grant to `authenticated` on hospital_ai_keys.
REVOKE ALL ON public.hospital_ai_keys FROM authenticated;

-- ── Metering provenance ──────────────────────────────────────────────────────
-- Which credential actually served the call. TEXT with a CHECK rather than a
-- boolean: a boolean conflates three distinct incident findings — BYOK never
-- enabled, BYOK enabled but this is a safety-class carve-out, and BYOK enabled
-- but currently degraded — and those have completely different remedies.
ALTER TABLE public.ai_usage_logs
  ADD COLUMN IF NOT EXISTS key_owner text NOT NULL DEFAULT 'platform';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_usage_logs_key_owner_check'
  ) THEN
    ALTER TABLE public.ai_usage_logs
      ADD CONSTRAINT ai_usage_logs_key_owner_check
      CHECK (key_owner IN ('platform', 'hospital'));
  END IF;
END $$;

-- Cost columns become nullable: on a BYOK call Aumrti does not know the
-- hospital's negotiated rate, and a 0 would be indistinguishable from a free
-- safety-class call while deflating Aumrti's own cost reporting.
ALTER TABLE public.ai_usage_logs ALTER COLUMN estimated_cost_usd DROP NOT NULL;
ALTER TABLE public.ai_usage_logs ALTER COLUMN estimated_cost_inr DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_hospital_key_owner
  ON public.ai_usage_logs (hospital_id, key_owner, created_at DESC);

-- ── The standing leak alert ──────────────────────────────────────────────────
-- Answers one question: did a hospital with BYOK switched on have any non-safety
-- call served by a platform key? Under the no-fallback rule this must always
-- return zero rows. It reads key_owner (observed) joined against byok_enabled
-- (intent) — comparing the two is the entire point, which is why key_owner must
-- never be derived from byok_enabled.
CREATE OR REPLACE VIEW public.byok_leak_watch AS
SELECT
  l.hospital_id,
  l.feature_key,
  l.key_owner,
  count(*)          AS calls,
  max(l.created_at) AS last_seen
FROM public.ai_usage_logs l
JOIN public.hospital_ai_provider_config c ON c.hospital_id = l.hospital_id
WHERE c.byok_enabled = true
  AND l.key_owner = 'platform'
  AND l.feature_key NOT IN (
    'drug_interaction_analysis', 'adr_detector',
    'sepsis_early_warning', 'critical_incidental_finder'
  )
GROUP BY l.hospital_id, l.feature_key, l.key_owner;
