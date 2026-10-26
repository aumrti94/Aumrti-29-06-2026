-- Quick Scribe, round 3 (a): give the notes a real clinical retention period.
--
-- 20261107000002 created quick_scribe_notes with `purge_after DEFAULT (now() + interval '30 days')`
-- and a comment describing "its own short retention window". Two things were wrong with that:
--
--   1. Nothing has ever enforced it. There is no executor, nothing sets is_deleted, and the
--      partial index's `WHERE is_deleted = false` is therefore a no-op. The 30 days is a comment,
--      not a behaviour. (The executor lands in the NEXT migration — see the ordering note below.)
--
--   2. Thirty days is the wrong number in both directions. A printed page listing drugs and doses
--      IS a prescription under the Drugs & Cosmetics Rules 1945 regardless of its title, and NMC
--      (ex-MCI) Regulation 1.3.1's three years is a floor, not a defence posture — a negligence
--      claim surfaces years later. Meanwhile a six-week follow-up, which is the entire workflow
--      this feature exists to serve, would find nothing and read to the doctor as "new patient".
--
-- Periods, split by column rather than applied uniformly, because they protect different things:
--
--   * A note carrying medicines, plus its patient identity  → 8 years.
--   * A summary-only or tests-only note (not a prescription) → 3 years.
--   * A minor's note                                         → until age 21, when longer.
--   * transcript_text                                        → 90 days (executor, next migration).
--
-- The transcript is deliberately the shortest. It is not part of the prescription, it is raw
-- audio converted to text, and it carries whatever a bystander happened to say in the room. Purging
-- it early is the data-minimisation step that makes keeping everything else for 8 years defensible.
--
-- Deliberately NOT modelled: the 10-year medicolegal-case window. There is no MLC flag on this
-- table and adding one would invite doctors to document medicolegal cases in a tool that is
-- explicitly not the institutional medical record. An MLC case belongs in the OPD/Emergency chart.
--
-- ── ORDERING, load-bearing ────────────────────────────────────────────────────────────────
-- This migration must be APPLIED before the executor in 20261111000003. The backfill below is
-- what rescues every existing row from its 30-day default; if the executor ran first it would
-- delete every note older than 30 days. Separate files, applied in timestamp order, give that a
-- deploy boundary — ordering within one file would not.

ALTER TABLE public.quick_scribe_notes
  -- transcript_text is NOT NULL (20261107000002:11), so a purged transcript is blanked to ''
  -- rather than nulled. Without this tombstone, "redacted after 90 days" and "the note was typed,
  -- never dictated" are the same empty string on the record.
  ADD COLUMN IF NOT EXISTS transcript_purged_at TIMESTAMPTZ;

COMMENT ON COLUMN public.quick_scribe_notes.transcript_purged_at IS
  'Set when transcript_text was blanked by the retention executor. NULL means the transcript is '
  'still held (or there never was one). Distinguishes redaction from absence.';

-- ── Age parsing ───────────────────────────────────────────────────────────────────────────
-- patient_age is free text typed by a doctor in a hurry: "45", "45 years", "6 months", "2y".
-- Returns NULL when nothing numeric is present, which the caller treats as "assume adult" —
-- the alternative (assume minor, keep 21 years) would silently extend retention on every note
-- where the age box was left blank, which is most of them.
CREATE OR REPLACE FUNCTION public.quick_scribe_age_years(p_age TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_txt TEXT := lower(btrim(coalesce(p_age, '')));
  v_num NUMERIC;
BEGIN
  -- Non-capturing group, deliberately: substring(text FROM pattern) returns the text matched by
  -- the FIRST PARENTHESIZED SUBEXPRESSION when the pattern has one — and when that group is
  -- optional and does not participate (any integer age with no decimal point, e.g. "45"), it
  -- returns NULL instead of the match. A capturing (\.[0-9]+)? here silently broke every
  -- whole-number age, which is nearly all of them: quick_scribe_age_years('5') returned NULL,
  -- so the minor-retention extension below never fired for a single integer age during review.
  -- (?:...) opts out of capturing, so substring falls back to returning the whole match instead.
  v_num := NULLIF(substring(v_txt FROM '[0-9]+(?:\.[0-9]+)?'), '')::NUMERIC;
  IF v_num IS NULL THEN
    RETURN NULL;
  END IF;

  -- A unit smaller than a year means an infant. The exact fraction is irrelevant: the rule below
  -- keys off "under 18", and 0 makes "until 21" resolve to the full 21 years, which is correct.
  IF v_txt ~ '(month|week|day|mth|wk|/12)' THEN
    RETURN 0;
  END IF;

  RETURN v_num;
END;
$$;

-- ── The retention rule itself ─────────────────────────────────────────────────────────────
-- Extracted as a function rather than inlined in the trigger so the executor, the pgTAP suite
-- and any future backfill all compute the identical boundary. A retention period implemented
-- twice is a retention period implemented once and contradicted once.
CREATE OR REPLACE FUNCTION public.quick_scribe_purge_after(
  p_created TIMESTAMPTZ,
  p_note    JSONB,
  p_age     TEXT
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_created       TIMESTAMPTZ := COALESCE(p_created, now());
  v_has_medicines BOOLEAN;
  v_age           NUMERIC;
  v_until         TIMESTAMPTZ;
BEGIN
  -- Reads `medicines` because that is the key the existing CHECK constraint
  -- quick_scribe_notes_named_when_prescribing (20261107000003:48-52) also depends on. Renaming
  -- it would silently break both at once.
  v_has_medicines := jsonb_typeof(p_note -> 'medicines') = 'array'
                     AND jsonb_array_length(p_note -> 'medicines') > 0;

  v_until := v_created + (CASE WHEN v_has_medicines THEN interval '8 years'
                                                     ELSE interval '3 years' END);

  v_age := public.quick_scribe_age_years(p_age);
  IF v_age IS NOT NULL AND v_age < 18 THEN
    -- Limitation runs from majority, so a minor's record is kept until 21 whenever that is
    -- further out than the ordinary period. ceil() so a 17.5-year-old is not rounded down
    -- into a shorter window than a 17-year-old.
    v_until := GREATEST(v_until, v_created + make_interval(years => ceil(21 - v_age)::int));
  END IF;

  RETURN v_until;
END;
$$;

COMMENT ON FUNCTION public.quick_scribe_purge_after(TIMESTAMPTZ, JSONB, TEXT) IS
  'Retention boundary for one Quick Scribe note: 8 years with medicines, 3 without, extended to '
  'age 21 for a minor. Single source of truth for the trigger, the executor and the tests.';

-- ── Trigger ───────────────────────────────────────────────────────────────────────────────
-- BEFORE INSERT OR UPDATE. The UPDATE arm matters because the executor blanks transcripts via
-- UPDATE; recomputing there is harmless (the result is deterministic from created_at) and it
-- stops a future writer from hand-setting a shorter window.
CREATE OR REPLACE FUNCTION public.set_quick_scribe_retention()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.purge_after := public.quick_scribe_purge_after(
    COALESCE(NEW.created_at, now()),
    NEW.structured_note_json,
    NEW.patient_age
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_retention_quick_scribe_notes ON public.quick_scribe_notes;
CREATE TRIGGER set_retention_quick_scribe_notes
  BEFORE INSERT OR UPDATE ON public.quick_scribe_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_quick_scribe_retention();

-- Floor, in case a future path ever writes around the trigger. The trigger is the real rule.
ALTER TABLE public.quick_scribe_notes
  ALTER COLUMN purge_after SET DEFAULT (now() + interval '8 years');

-- ── Backfill ──────────────────────────────────────────────────────────────────────────────
-- Every row written before this migration carries the 30-day default and is at or past its
-- nominal expiry. Rescue them before anything starts honouring purge_after.
--
-- The `< created_at + 1 year` predicate targets the old 30-day default without needing to match
-- it exactly, and is idempotent: a row already carrying a correct 3-or-8-year boundary is far
-- outside it and is skipped on a re-run.
--
-- This fires the AFTER trigger log_phi_quick_scribe_notes (20261107000002:34-37), so the backfill
-- is itself recorded in audit_log. That is correct — a retention change on clinical records is
-- exactly the sort of thing the audit trail should carry.
UPDATE public.quick_scribe_notes
SET purge_after = public.quick_scribe_purge_after(created_at, structured_note_json, patient_age)
WHERE purge_after < created_at + interval '1 year';
