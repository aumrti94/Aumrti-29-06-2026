-- Quick Scribe, round 3 (f): five more fields, and why each is a real column.
--
-- Four of these are AI-fillable (chief_complaint, advice) or app-computed (follow_up_date) and one
-- is deliberately NOT (diagnosis). All five are promoted to real columns rather than living only
-- inside structured_note_json, for two different reasons:
--
--   follow_up_date needs to be a real DATE because "which patients are due back" is a query this
--   product will eventually want to ask, and a value buried in JSONB cannot be indexed or queried
--   cheaply.
--
--   diagnosis gets its own column so it is easy to read, index and reason about independently of
--   the JSONB blob — but the guarantee that the AI never writes it does NOT come from this column.
--   QuickScribePage.tsx's INSERT sets `structured_note_json: note`, the whole client-side note
--   object, so diagnosis ends up inside that JSONB blob too, same as every other field. The real
--   guarantee is upstream of storage, in two places: ai-clinical-voice/index.ts's quick_scribe
--   schema has no "diagnosis" key for the model to populate, and QuickScribePage.tsx's fillFn
--   hard-codes `diagnosis: ""` on every AI fill rather than reading `data.diagnosis` — so whatever
--   value ends up in either the column or the blob came only from the doctor typing into the
--   Diagnosis box, never from the model's response. Nalini's ruling (see the product review)
--   permits a typed-only diagnosis field and refuses an AI-suggested one outright; this column,
--   the schema's missing key, and fillFn's hard-coded empty string are the three places that
--   together make "typed-only" true, not any one of them alone.
--
-- chief_complaint and advice stay as plain TEXT, matching summary/patient_name's shape — free text
-- a doctor dictates or edits, not a structured value anything downstream parses.
--
-- reports_reviewed is follow-up-only by product design (QUICK_SCRIBE_REVIEW.md) and is typed only,
-- never AI-filled — the AI confidently inventing a lab value it never saw is the single scenario
-- Nalini's review flagged as hardest to defend, because it would print on letterhead under the
-- doctor's signature with no source behind it.

ALTER TABLE public.quick_scribe_notes
  ADD COLUMN IF NOT EXISTS chief_complaint  TEXT,
  ADD COLUMN IF NOT EXISTS advice           TEXT,
  -- Typed only. See the migration header for the three places that make this true together —
  -- this column by itself is not the guarantee.
  ADD COLUMN IF NOT EXISTS diagnosis        TEXT,
  -- Typed only, follow-up visits only. Rendered on the printout only when non-empty.
  ADD COLUMN IF NOT EXISTS reports_reviewed TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_date   DATE;

COMMENT ON COLUMN public.quick_scribe_notes.diagnosis IS
  'Typed by the clinician only. The AI schema has no diagnosis key and fillFn in '
  'QuickScribePage.tsx hard-codes this empty on every AI fill — see the migration header for why '
  'this column alone is not the guarantee (the value also lands inside structured_note_json).';

COMMENT ON COLUMN public.quick_scribe_notes.follow_up_date IS
  'A real DATE, not a JSONB value, so "which patients are due back" is an indexable query.';

CREATE INDEX IF NOT EXISTS idx_quick_scribe_notes_follow_up
  ON public.quick_scribe_notes (hospital_id, follow_up_date)
  WHERE follow_up_date IS NOT NULL AND is_deleted = false;
