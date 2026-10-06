-- Found while escalating KNOWN-BUG-222 to Kavitha/revenue-pod for a go-live revenue-exposure
-- assessment (2026-09-18).
--
-- WHY. DietPage.tsx's autoChargeService call never passed sourceTable/sourceId at all — not
-- because of a missing-columns gap like mortuary_admissions (KNOWN-BUG-223) or therapy_sessions
-- (KNOWN-BUG-240), but because the nutritional_screenings insert immediately above it never
-- captured its own row id in the first place (fixed alongside this migration). Once that's fixed
-- and sourceTable/sourceId are actually passed, autoChargeService's idempotency guard needs
-- somewhere to read/write billing_status — nutritional_screenings never had it, same pattern as
-- the two prior fixes.
--
-- Not `nutrition_screenings` (no "al") — a different, unrelated table used by
-- NutritionDieteticsTab.tsx that never calls autoChargeService at all. Confirmed by reading both
-- schemas directly before writing this migration.

ALTER TABLE public.nutritional_screenings
  ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'unbilled'
    CHECK (billing_status IN ('unbilled', 'billed', 'waived')),
  ADD COLUMN IF NOT EXISTS bill_id uuid REFERENCES public.bills(id),
  ADD COLUMN IF NOT EXISTS billed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_nutritional_screenings_billing_status
  ON public.nutritional_screenings(hospital_id, billing_status);
