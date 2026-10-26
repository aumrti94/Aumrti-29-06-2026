-- Quick Scribe, round 3 (g): give phi_access_audit somewhere to put what was searched for.
--
-- The three Quick Scribe lookup RPCs in the next migration are the first SQL-side READERS this
-- table has ever had — every existing writer (upsert-patient-phi's Edge Function, the two AI-PHI
-- triggers) logs a decrypt-by-id or a column-level write, none of which has a search term at all.
-- A lookup audit without the term answers "someone looked something up" and nothing else; the
-- medico-legal question eight months later is "what were they looking FOR", and that has to be
-- on the row, not inferred from context that will not exist by then.

ALTER TABLE public.phi_access_audit
  ADD COLUMN IF NOT EXISTS search_term TEXT;

COMMENT ON COLUMN public.phi_access_audit.search_term IS
  'What was searched for, when this row records a lookup rather than a decrypt-by-id — the Quick '
  'Scribe visit code or name prefix typed, for example. NULL for every pre-existing writer and '
  'for a lookup that fetches a specific row by id rather than searching (e.g. the get-full-note '
  'RPC, which already named the row via its argument).';
