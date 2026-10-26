-- Quick Scribe, round 3 (i): index patient_name for the prefix search the next migration adds.
--
-- ── Why a generated normalised column + a plain btree, not tsvector/GIN and not pg_trgm ──────
--
-- The real query is a doctor typing the first few letters of a name they half-remember — a
-- PREFIX match, not a substring or full-text match. Three candidates, in the order considered:
--
--   1. to_tsvector + GIN — the house precedent for text search (20261017000001, icd10_codes).
--      Wrong fit here: tsvector matches whole LEXEMES. Serving "rav" would need
--      to_tsquery('rav:*'), which means string-building a tsquery from user input — injection-
--      shaped, and it throws outright on a bare apostrophe or hyphen, both common in Indian
--      names ("D'Souza", "Sai-Kumar"). English stemming is also actively wrong for proper nouns.
--
--   2. pg_trgm — the correct tool for true substring/fuzzy matching, and NOT used anywhere in
--      this repo (verified: zero matches for pg_trgm/gin_trgm_ops/similarity() under supabase/).
--      Enabling a new extension here would pass CI, because the e2e job's `supabase start`
--      applies migrations against a fresh local Postgres where CREATE EXTENSION just succeeds —
--      and then need an explicit platform-level enable in production that nothing here forces.
--      Green CI, silently broken prod is the worst failure mode available, so this is deferred
--      rather than chosen by default.
--
--   3. A generated lower(btrim(...)) column + a text_pattern_ops btree — what this migration
--      does. Serves `LIKE 'prefix%'` directly (a plain btree on a non-C collation CANNOT serve
--      that operator at all — text_pattern_ops is what makes it work, not decoration). Limitation
--      accepted deliberately: this only ever matches from the START of the name, so a doctor who
--      remembers the surname but not the given name will not find it this way. That is why the
--      recent-notes list (20261111000008), not this search, is the PRIMARY retrieval path — this
--      is the "lost the paper" fallback, and most patients are found by surname-first typing.
--
-- The idx_patients_name_search lesson (a to_tsvector GIN index on `patients` that no `ILIKE`
-- caller has ever been able to use, because the expression never matched the callers') is the
-- reason this column is generated rather than hoped-for: the ONLY caller of this index is the
-- RPC in the next migration, which applies the identical lower(btrim()) to its own input before
-- comparing. No browser can issue a differently-shaped predicate against this index.

ALTER TABLE public.quick_scribe_notes
  ADD COLUMN IF NOT EXISTS patient_name_norm text
  GENERATED ALWAYS AS (lower(btrim(coalesce(patient_name, '')))) STORED;

CREATE INDEX IF NOT EXISTS idx_qs_notes_name_prefix
  ON public.quick_scribe_notes (hospital_id, patient_name_norm text_pattern_ops, created_at DESC)
  WHERE is_deleted = false;

COMMENT ON COLUMN public.quick_scribe_notes.patient_name_norm IS
  'lower(btrim(patient_name)), generated and stored so the prefix search index expression is '
  'guaranteed identical to what quick_scribe_search_by_name() queries against — see the '
  'idx_patients_name_search lesson in the migration header.';
