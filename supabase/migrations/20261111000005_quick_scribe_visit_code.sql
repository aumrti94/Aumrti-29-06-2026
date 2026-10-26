-- Quick Scribe, round 3 (e): a short code on the printout, so the second visit has a key.
--
-- The retrieval problem this solves is not "find the row" — the row has been there all along, with
-- an index built for it (20261107000003:84-86). It is "identify WHICH patient" in a clinic where
-- forty people are called Lakshmi and no MRN exists.
--
-- Searching by name is the obvious answer and the dangerous one. Pull up the wrong Lakshmi, carry
-- her Metformin onto a non-diabetic patient's prescription, and there is no chart, no allergy list
-- and no second check standing in the way — the retrieved note IS the only source. So name search
-- is kept as the lost-paper fallback (20261111000010) and the PRIMARY path is this: a five-character
-- code printed on the page the patient is already carrying, typed back exactly.
--
-- It also removes most of the privacy problem. The search term carries no patient data, there is
-- nothing to enumerate, and no other patient's record is ever displayed on the way to the right one.
--
-- ── Alphabet ──────────────────────────────────────────────────────────────────────────────
-- 31 characters: 0, O, 1, I and L are excluded. The code is read off paper, under fluorescent
-- light, by someone who did not print it — every excluded character is one a patient or a
-- receptionist would otherwise transcribe wrong.
--
-- ── Why a trigger, not a DEFAULT and not the app ──────────────────────────────────────────
-- A column DEFAULT cannot see NEW.hospital_id, and per-hospital uniqueness is the entire point.
-- App-side generation needs a round trip to check uniqueness (a TOCTOU race under concurrent
-- inserts) and puts a forgeable value under client control.
--
-- ── Why per-hospital and not global ───────────────────────────────────────────────────────
-- Every lookup RPC is already tenant-scoped by get_user_hospital_id(), so a code only ever has to
-- be unique within one hospital. Global uniqueness would buy nothing and multiply the collision
-- rate across the whole platform.
--
-- ── Why a retry loop and not just the constraint ──────────────────────────────────────────
-- 31^5 is about 28.6 million. A busy hospital at 10k notes/year against an 8-year retention window
-- holds ~80k live codes, where the birthday maths predicts roughly a hundred collisions over the
-- window — rare enough to never see in testing, common enough to hit a real doctor mid-clinic. The
-- UNIQUE index is the actual guarantee; the loop is what keeps the common case silent instead of
-- surfacing as a failed print.

CREATE OR REPLACE FUNCTION public.generate_quick_scribe_code()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  -- No 0/O/1/I/L — see the header.
  v_alphabet CONSTANT TEXT := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_len      CONSTANT INT  := 31;
  v_out      TEXT := '';
  i          INT;
BEGIN
  FOR i IN 1..5 LOOP
    v_out := v_out || substr(v_alphabet, floor(random() * v_len)::int + 1, 1);
  END LOOP;
  RETURN 'QS-' || v_out;
END;
$$;

ALTER TABLE public.quick_scribe_notes
  ADD COLUMN IF NOT EXISTS visit_code TEXT;

COMMENT ON COLUMN public.quick_scribe_notes.visit_code IS
  'Short human-transcribable code printed on the note (QS-7K3M9). Unique per hospital. The primary '
  'lookup key for a return visit — carries no patient data, so searching by it discloses nothing.';

-- Partial, so the backfill below cannot fail the migration on a row it somehow misses, and so a
-- future row written around the trigger does not collide with NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_quick_scribe_notes_visit_code
  ON public.quick_scribe_notes (hospital_id, visit_code)
  WHERE visit_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_quick_scribe_visit_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_candidate TEXT;
  v_attempt   INT := 0;
BEGIN
  -- Never regenerate an existing code: it is printed on paper a patient is holding.
  IF NEW.visit_code IS NOT NULL AND btrim(NEW.visit_code) <> '' THEN
    RETURN NEW;
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_candidate := public.generate_quick_scribe_code();

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.quick_scribe_notes
      WHERE hospital_id = NEW.hospital_id
        AND visit_code = v_candidate
    );

    IF v_attempt >= 10 THEN
      -- Ten consecutive collisions is not bad luck, it is a saturated keyspace. Fail loudly
      -- rather than printing a duplicate code that would resolve to the wrong patient.
      RAISE EXCEPTION
        'Could not allocate a unique Quick Scribe visit code after % attempts for hospital %',
        v_attempt, NEW.hospital_id;
    END IF;
  END LOOP;

  NEW.visit_code := v_candidate;
  RETURN NEW;
END;
$$;

-- BEFORE INSERT only. On UPDATE the code must never move — see the guard above, which also covers
-- the case where a future UPDATE trigger ordering change brings this onto the update path.
DROP TRIGGER IF EXISTS set_visit_code_quick_scribe_notes ON public.quick_scribe_notes;
CREATE TRIGGER set_visit_code_quick_scribe_notes
  BEFORE INSERT ON public.quick_scribe_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_quick_scribe_visit_code();

-- ── Backfill ──────────────────────────────────────────────────────────────────────────────
-- Existing notes have no code. They cannot be re-printed with one, so this is mostly for the
-- recent-notes list rather than for code entry — but a NULL would make those rows unaddressable
-- by the lookup RPCs, so every row gets one.
--
-- Row-at-a-time rather than a set-based UPDATE because the uniqueness check has to see the codes
-- allocated earlier in the same backfill. A single statement would evaluate every candidate against
-- the pre-UPDATE snapshot and could emit duplicates that the partial unique index then rejects,
-- failing the migration.
--
-- Re-running is safe: rows that already carry a code are not selected.
DO $$
DECLARE
  r           RECORD;
  v_candidate TEXT;
  v_attempt   INT;
BEGIN
  FOR r IN SELECT id, hospital_id FROM public.quick_scribe_notes WHERE visit_code IS NULL LOOP
    v_attempt := 0;
    LOOP
      v_attempt := v_attempt + 1;
      v_candidate := public.generate_quick_scribe_code();

      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.quick_scribe_notes
        WHERE hospital_id = r.hospital_id AND visit_code = v_candidate
      );

      IF v_attempt >= 10 THEN
        RAISE EXCEPTION
          'Quick Scribe visit-code backfill could not allocate a unique code for note % after % attempts',
          r.id, v_attempt;
      END IF;
    END LOOP;

    UPDATE public.quick_scribe_notes SET visit_code = v_candidate WHERE id = r.id;
  END LOOP;
END;
$$;
