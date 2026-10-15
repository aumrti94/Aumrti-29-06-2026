-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Vitals: separate OBSERVATION time from RECORDING time
--
-- THE DEFECT. Both vitals tables have exactly one timestamp and it is the write time:
--
--   nursing_vitals.recorded_at  timestamptz NOT NULL DEFAULT now()   (20260908000003:8)
--   ipd_vitals.recorded_at      timestamptz DEFAULT now()            (20260322100400:61)
--
-- No client writes it. Verified against every insert path:
--   src/components/ipd/tabs/IPDVitalsTab.tsx:106-120     — no recorded_at in the payload
--   src/components/nursing/NursingVitalsTask.tsx:98-114  — no recorded_at in the payload
--   src/components/ipd/tabs/NursingKardexTab.tsx:~440    — no recorded_at in the payload
--   public.mirror_nursing_vitals_to_ipd_vitals()         — passes NEW.recorded_at through
--
-- So recorded_at is the instant the nurse pressed Save, which on a ward is routinely 20-90
-- minutes after the observation and, for late charting at shift handover, can be hours. Every
-- trend, every NEWS2 delta and every deterioration slope in the product is therefore computed
-- against the wrong x-axis. That is why clinical pod calls it fatal: a NEWS2 that rose over 40
-- minutes and one that rose over 6 hours are different patients, and today they are
-- indistinguishable.
--
-- WHY NOT JUST START WRITING recorded_at FROM THE CLIENT. Because it would corrupt the audit
-- meaning of the existing column. recorded_at is currently a trustworthy server-stamped
-- write-time — that is what makes it usable as NABH evidence of WHEN charting happened. Letting
-- a client set it makes it attacker- and clock-skew-controlled and destroys that property. The
-- two facts are genuinely different and need two columns.
--
-- Additive and reversible: two new nullable columns per table, one CHECK, two indexes, and an
-- extension to the existing mirror trigger. No existing column, policy or reader changes
-- behaviour until the application starts writing observed_at.
-- ═════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. The columns
--
-- Deliberately NOT `NOT NULL DEFAULT now()`. A default of now() would reproduce the exact bug
-- this migration exists to fix: every row would silently acquire a plausible-looking
-- observation time equal to its write time, and nothing downstream could tell a real
-- observation from a defaulted one. Nullable + an explicit provenance column is the honest
-- shape. COALESCE(observed_at, recorded_at) is the read-side contract and §4 provides it as a
-- generated column so no caller has to remember.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.nursing_vitals
  ADD COLUMN IF NOT EXISTS observed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS observed_at_source text;

ALTER TABLE public.ipd_vitals
  ADD COLUMN IF NOT EXISTS observed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS observed_at_source text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nursing_vitals_observed_at_source_check') THEN
    ALTER TABLE public.nursing_vitals
      ADD CONSTRAINT nursing_vitals_observed_at_source_check
      CHECK (observed_at_source IS NULL OR observed_at_source IN (
        'client',              -- the charting UI sent an explicit observation time
        'device',              -- monitor / IoT integration supplied it
        'mirror',              -- propagated from nursing_vitals by the mirror trigger
        'backfill_recorded_at' -- §3: we do not know; this is recorded_at standing in
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipd_vitals_observed_at_source_check') THEN
    ALTER TABLE public.ipd_vitals
      ADD CONSTRAINT ipd_vitals_observed_at_source_check
      CHECK (observed_at_source IS NULL OR observed_at_source IN (
        'client', 'device', 'mirror', 'backfill_recorded_at'
      ));
  END IF;
END $$;

-- A future observation is always an error — a clock-skewed tablet or a timezone bug, never a
-- real reading. 5 minutes of tolerance for honest device/browser skew. Deliberately one-sided:
-- observed_at far BEFORE recorded_at is legitimate late charting and must not be rejected.
--
-- NOT VALID, following 20261106000017's precedent: the constraint binds every future write
-- immediately without a full-table scan or the risk of a failed deploy against whatever the
-- live cloud database already holds. VALIDATE CONSTRAINT is follow-up work for a maintenance
-- window; until then these cover new rows only, which is where the value is.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nursing_vitals_observed_not_future') THEN
    ALTER TABLE public.nursing_vitals
      ADD CONSTRAINT nursing_vitals_observed_not_future
      CHECK (observed_at IS NULL OR observed_at <= recorded_at + INTERVAL '5 minutes') NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipd_vitals_observed_not_future') THEN
    ALTER TABLE public.ipd_vitals
      ADD CONSTRAINT ipd_vitals_observed_not_future
      CHECK (observed_at IS NULL OR observed_at <= recorded_at + INTERVAL '5 minutes') NOT VALID;
  END IF;
END $$;

COMMENT ON COLUMN public.nursing_vitals.observed_at IS
  'When the observation was actually taken on the patient. NULL means unknown — read via '
  'observed_or_recorded_at, never by COALESCE at each call site. Distinct from recorded_at, '
  'which is the server write time and remains the NABH charting-time evidence.';

COMMENT ON COLUMN public.nursing_vitals.observed_at_source IS
  'Provenance of observed_at. ''backfill_recorded_at'' means the value is recorded_at standing '
  'in and carries no independent information — exclude these rows from any analysis of '
  'charting lag, or the lag will compute as exactly zero.';

COMMENT ON COLUMN public.ipd_vitals.observed_at IS
  'When the observation was actually taken. For rows written by '
  'mirror_nursing_vitals_to_ipd_vitals() this is propagated from nursing_vitals, which is the '
  'canonical table (20261008000028).';

COMMENT ON COLUMN public.ipd_vitals.observed_at_source IS
  'Provenance of observed_at. ''mirror'' is the overwhelming majority: nursing_vitals is the '
  'canonical write path and ipd_vitals is populated from it by trigger.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. Trending indexes
--
-- The existing indexes are on recorded_at (idx_nursing_vitals_recorded_at,
-- idx_nursing_vitals_news2). Every trending query must move to observed_at ordering, so it
-- needs its own index or the move is a performance regression on the busiest read in IPD.
--
-- Not CONCURRENTLY: this migration runs inside a transaction (the CHECK constraints above must
-- be atomic with the columns). These tables are small enough per tenant that a brief ACCESS
-- EXCLUSIVE is acceptable; if that is not true for the largest live tenant, split §2 into its
-- own non-transactional migration and use CREATE INDEX CONCURRENTLY, as 20261016000012 does.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_nursing_vitals_admission_observed
  ON public.nursing_vitals (admission_id, observed_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_nursing_vitals_patient_observed
  ON public.nursing_vitals (patient_id, observed_at DESC NULLS LAST)
  WHERE patient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ipd_vitals_admission_observed
  ON public.ipd_vitals (admission_id, observed_at DESC NULLS LAST);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. Backfill
--
-- The only defensible value for a historical row is recorded_at, because that is the only
-- timestamp that exists. What matters is that the backfill is LABELLED, so no later analysis
-- mistakes it for a real observation time. Guarded on observed_at IS NULL so the migration is
-- idempotent and re-running it cannot overwrite a genuine client-supplied value.
--
-- Unbatched. These tables hold shift-wise vitals, so even a multi-year tenant is in the tens of
-- thousands of rows, not millions. If the live row count says otherwise, run this §3 block
-- separately in `WHERE observed_at IS NULL ... LIMIT n` batches outside the transaction — the
-- guard makes that safe to do incrementally.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

UPDATE public.nursing_vitals
   SET observed_at        = recorded_at,
       observed_at_source = 'backfill_recorded_at'
 WHERE observed_at IS NULL;

UPDATE public.ipd_vitals
   SET observed_at        = recorded_at,
       observed_at_source = 'backfill_recorded_at'
 WHERE observed_at IS NULL
   AND recorded_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4. observed_or_recorded_at — one place for the fallback
--
-- Every reader needs "the best available observation time". Without this, ~15 call sites each
-- write their own COALESCE and one of them eventually forgets, which is how the original defect
-- spread. A STORED generated column means ORDER BY and index use work on it directly.
--
-- STORED rather than VIRTUAL: virtual generated columns are PG18+, and this project targets
-- Supabase's Postgres 15/17.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'nursing_vitals'
       AND column_name = 'observed_or_recorded_at'
  ) THEN
    ALTER TABLE public.nursing_vitals
      ADD COLUMN observed_or_recorded_at timestamptz
      GENERATED ALWAYS AS (COALESCE(observed_at, recorded_at)) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'ipd_vitals'
       AND column_name = 'observed_or_recorded_at'
  ) THEN
    ALTER TABLE public.ipd_vitals
      ADD COLUMN observed_or_recorded_at timestamptz
      GENERATED ALWAYS AS (COALESCE(observed_at, recorded_at)) STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_nursing_vitals_admission_best_time
  ON public.nursing_vitals (admission_id, observed_or_recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_ipd_vitals_admission_best_time
  ON public.ipd_vitals (admission_id, observed_or_recorded_at DESC);

COMMENT ON COLUMN public.nursing_vitals.observed_or_recorded_at IS
  'Best available observation time: observed_at when known, else recorded_at. ORDER BY this for '
  'all clinical trending. Generated — never written directly.';

COMMENT ON COLUMN public.ipd_vitals.observed_or_recorded_at IS
  'Best available observation time: observed_at when known, else recorded_at. ORDER BY this for '
  'all clinical trending. Generated — never written directly.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 5. Extend the mirror trigger
--
-- THIS IS THE STEP THAT IS EASY TO MISS AND BREAKS EVERYTHING IF MISSED.
-- 20261008000028_vitals_consolidation.sql made nursing_vitals canonical and mirrors every
-- insert into ipd_vitals for its ~8 readers (IPDOverviewTab, IPDWorkspace print-summary,
-- ADRDetectorPanel, IOChartTab, WardNursingBoard, NursingPage stats, acuityStaffing.ts). Its
-- INSERT lists columns explicitly, so without this replacement ipd_vitals.observed_at stays
-- NULL forever for the 100% of rows that arrive via the mirror — the new column would appear to
-- work in nursing_vitals and be permanently empty in ipd_vitals.
--
-- Function body is otherwise byte-equivalent to 20261008000028's, including the skip-don't-raise
-- guard. That guard's reasoning holds unchanged: a mirror failure must never block a nurse from
-- charting vitals.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mirror_nursing_vitals_to_ipd_vitals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.hospital_id IS NULL OR NEW.admission_id IS NULL OR NEW.recorded_by IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.ipd_vitals (
    hospital_id, admission_id, recorded_by,
    bp_systolic, bp_diastolic, pulse, temperature, spo2, respiratory_rate,
    grbs, urine_output_ml, pain_score, news2_score, recorded_at,
    observed_at, observed_at_source
  ) VALUES (
    NEW.hospital_id, NEW.admission_id, NEW.recorded_by,
    NEW.bp_systolic, NEW.bp_diastolic, NEW.pulse, NEW.temperature, NEW.spo2, NEW.respiratory_rate,
    NEW.grbs, NEW.urine_output_ml, NEW.pain_score,
    CASE WHEN NEW.news2_score IS NULL THEN NULL ELSE round(NEW.news2_score)::integer END,
    NEW.recorded_at,
    NEW.observed_at,
    -- 'mirror' records that this value was propagated, not independently observed. If the
    -- source row had no observed_at there is nothing to propagate, so the provenance is NULL
    -- too rather than a label asserting a mirror of nothing.
    CASE WHEN NEW.observed_at IS NULL THEN NULL ELSE 'mirror' END
  );

  RETURN NEW;
END;
$$;

-- Trigger itself is unchanged; re-declared idempotently so the migration is self-contained.
DROP TRIGGER IF EXISTS trg_mirror_nursing_vitals_to_ipd_vitals ON public.nursing_vitals;
CREATE TRIGGER trg_mirror_nursing_vitals_to_ipd_vitals
  AFTER INSERT ON public.nursing_vitals
  FOR EACH ROW EXECUTE FUNCTION public.mirror_nursing_vitals_to_ipd_vitals();

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- DOWNSTREAM: what must change, and what breaks if it does not
--
-- Nothing breaks on apply — every new column is nullable or generated and every existing query
-- keeps returning what it returned. The breakage is of the silent kind: trending stays wrong
-- until each reader moves to observed_or_recorded_at. Ordered by clinical risk:
--
--  1. src/components/ipd/tabs/IPDVitalsTab.tsx
--       :106  insert — must send observed_at + observed_at_source:'client' from a new
--             date/time field in the form, defaulting to now but editable for late charting.
--             This is the only screen where a nurse can state the real observation time, so
--             until it ships every row is observed_at_source:'backfill_recorded_at' in effect.
--       :51   select / ordering — move to observed_or_recorded_at.
--       :197  `latestNEWS2 = vitals[0]?.news2_score` — "latest" is currently the most recently
--             SAVED row. With late charting that is not the most recently OBSERVED row, so this
--             can display a stale NEWS2 as current. Highest-risk line in the set.
--  2. src/components/nursing/NursingVitalsTask.tsx:98   — same insert change.
--  3. src/components/ipd/tabs/NursingKardexTab.tsx:~440 — same insert change; the kardex grid is
--       the shift-wise view where observation-vs-charting divergence is most visible.
--  4. NEWS2 history / deterioration slope — src/components/ipd/SepsisWarningBanner.tsx:239 and
--       src/components/ipd/ReadmissionRiskPanel.tsx:72 feed vitals series into AI prompts. These
--       are the trend consumers; they must order by observed_or_recorded_at AND state the
--       interval explicitly in the prompt, because a model given an unlabelled series will
--       assume regular spacing.
--  5. src/components/ipd/ADRDetectorPanel.tsx:54-55 — selects recorded_at, prompts on vitals[0]
--       as "current". Same staleness exposure as (1).
--  6. MAR adherence — src/components/nursing/MARAdherenceMonitor.tsx. Worth stating precisely:
--       this reads mar_records, NOT the vitals tables, so it is NOT broken by this migration.
--       It has the IDENTICAL class of defect on its own schedule columns and needs its own
--       scheduled-vs-administered split. Out of scope here; do not bundle it in.
--  7. Analytics aggregates — src/lib/acuityStaffing.ts, src/pages/tv/WardNursingBoard.tsx:84,
--       src/pages/nursing/NursingPage.tsx:666. These bucket vitals by day/shift. Switching them
--       to observed_at MOVES rows between buckets: a 23:40 observation charted at 00:10 leaves
--       yesterday's night shift and enters today's. Expect historical counts to shift and brief
--       it before release, or a ward manager will report it as data loss.
--  8. supabase/functions/export-nursing-notes/index.ts and ai-discharge-summary/index.ts —
--       exported records should show BOTH times. An export that shows only one, whichever it is,
--       loses the charting-lag evidence NABH asks for.
--
-- Rollback: DROP the two generated columns, the four new indexes, the four constraints and the
-- two observed_* columns per table, then re-apply 20261008000028's function body verbatim.
--
-- ── Operational note for the production migration plan (Lakshmi) ─────────────────────────────
-- This migration takes ACCESS EXCLUSIVE on both vitals tables for its whole duration, and makes
-- TWO full passes over each:
--
--   pass 1  §3's backfill UPDATE  — rewrites every row
--   pass 2  §4's ADD COLUMN ... GENERATED ... STORED — unconditionally rewrites the table again
--
-- plus three non-CONCURRENT index builds per table. Everything is inside one transaction, so
-- the lock is held from BEGIN to COMMIT and nurses cannot chart vitals for that window. On
-- shift-wise vitals volumes that is seconds; it is NOT safe to assume that without checking
-- max(row count) across live tenants first:
--
--   SELECT 'nursing_vitals' t, count(*) FROM nursing_vitals
--   UNION ALL SELECT 'ipd_vitals', count(*) FROM ipd_vitals;
--
-- If either exceeds ~500k rows, split into three migrations before deploying: (a) columns +
-- constraints, (b) batched backfill outside a transaction, (c) generated column + CONCURRENT
-- indexes. The §3 `WHERE observed_at IS NULL` guard is what makes (b) safe to run incrementally.
--
-- The NOT VALID CHECK constraints are unaffected by the §4 rewrite — they stay unvalidated, and
-- in any case no row can violate them (the backfill sets observed_at = recorded_at exactly).
-- Deploy during the lowest-census window; this is the one migration in the 20261108 set that
-- touches a table on the active nursing write path.
-- ═════════════════════════════════════════════════════════════════════════════════════════════
