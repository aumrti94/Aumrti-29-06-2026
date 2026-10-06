-- Quick Scribe: a standalone, doctor-only voice-note tool with deliberately NO patient
-- linkage (no patient_id, no FK to patients/encounters/OPD/pharmacy/lab/radiology). A doctor
-- records a conversation, gets a structured note (summary/medicines/labs/radiology), prints it,
-- and moves to the next patient — this is an informal printout, not the institutional medical
-- record, so it carries its own short retention window instead of living forever like a chart.
CREATE TABLE IF NOT EXISTS public.quick_scribe_notes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id           UUID NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  doctor_id             UUID NOT NULL REFERENCES public.users(id),
  patient_label         TEXT,
  transcript_text       TEXT NOT NULL,
  structured_note_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  printed_at            TIMESTAMPTZ,
  is_deleted            BOOLEAN NOT NULL DEFAULT false,
  purge_after           TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.quick_scribe_notes ENABLE ROW LEVEL SECURITY;

-- Hospital-wide, not doctor-only: any doctor on shift can pick a note back up, and there is no
-- patient identity in this table for a doctor-scoped policy to protect against leaking.
DROP POLICY IF EXISTS "hospital_isolation" ON public.quick_scribe_notes;
CREATE POLICY "hospital_isolation" ON public.quick_scribe_notes
  USING (hospital_id = public.get_user_hospital_id())
  WITH CHECK (hospital_id = public.get_user_hospital_id());

CREATE INDEX IF NOT EXISTS idx_quick_scribe_notes_hospital ON public.quick_scribe_notes(hospital_id);
CREATE INDEX IF NOT EXISTS idx_quick_scribe_notes_purge ON public.quick_scribe_notes(purge_after) WHERE is_deleted = false;

-- No patient_id column exists, but the transcript can still carry an incidentally spoken name —
-- treat it as clinical data, not exempted from the same audit trail every other PHI-adjacent
-- table gets.
DROP TRIGGER IF EXISTS log_phi_quick_scribe_notes ON public.quick_scribe_notes;
CREATE TRIGGER log_phi_quick_scribe_notes
  AFTER INSERT OR UPDATE OR DELETE ON public.quick_scribe_notes
  FOR EACH ROW EXECUTE FUNCTION public.log_phi_change();
