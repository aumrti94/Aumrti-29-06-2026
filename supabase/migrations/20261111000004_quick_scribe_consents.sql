-- Quick Scribe, round 3 (d): record the consent we have been taking without asking for.
--
-- Today Quick Scribe opens a microphone in a consulting room, ships the audio to a third-party
-- ASR and LLM, persists the raw transcript (QuickScribePage.tsx:201), and tells the patient
-- nothing. Under the DPDP Act 2023 that is three gaps at once: the s.5 notice is absent, the s.6
-- consent is absent, and the s.6(4) right to withdraw is unimplementable because there is no
-- consent record to withdraw. 20261111000001 made these notes an eight-year record, which raises
-- the stakes rather than lowering them.
--
-- ── Why a new table instead of patient_consents ───────────────────────────────────────────
--
-- public.patient_consents has `patient_id uuid REFERENCES patients(id) NOT NULL`
-- (20260327060326:18-40). Quick Scribe deliberately has no patient row — that is the entire
-- premise of the module — so the existing table cannot hold this. Rather than weaken a NOT NULL
-- that every other consent in the product depends on, this is its own table.
--
-- ── Shape ─────────────────────────────────────────────────────────────────────────────────
--
-- Column vocabulary is borrowed from hospital_signup_consents (20260911000002:7-19), the only
-- other consent record in the repo that is versioned: terms_version / purpose / consent_ip. The
-- content snapshot and signature hash come from the patient_consents side. What is new here is
-- disclosure_version, which pins the consent to the specific published
-- ai_processing_disclosure row (20261110000000) that was in force — so "what was this patient
-- told about where their audio went" is answerable years later without reconstructing it.
--
-- consent_text is a SNAPSHOT, not a reference. The wording must survive a later edit to the
-- builder in src/lib/quickScribeConsent.ts; that is the whole point of storing it.
--
-- ── The direction of the link ─────────────────────────────────────────────────────────────
--
-- The consent is the PARENT and quick_scribe_notes.consent_id points at it, because consent is
-- taken before the recording starts and therefore before a note exists. A consent row with no
-- note attached is a normal outcome — the doctor consented the patient and the consultation ended
-- without a printout — and it is still the record that consent was obtained. Modelling it the
-- other way round would make the consent un-storable until after the processing it authorises.
--
-- No patient identity is stored here (no name, age or address), so no PHI audit trigger: the row
-- says only that a consent of a given version was taken at a hospital by a doctor at a time. The
-- note it protects carries its own audit trigger already.

CREATE TABLE IF NOT EXISTS public.quick_scribe_consents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id        UUID NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,

  -- Which wording was shown. Moves with QS_CONSENT_VERSION in src/lib/quickScribeConsent.ts.
  terms_version      TEXT NOT NULL,
  -- DPDP s.5 requires the purpose to be stated, not merely implied.
  purpose            TEXT NOT NULL,
  -- Verbatim snapshot of what the doctor read out / the screen displayed.
  consent_text       TEXT NOT NULL,
  -- The ai_processing_disclosure version in force when consent was taken. Nullable because a
  -- hospital may be running before any disclosure row is published; the consent is still valid.
  disclosure_version INTEGER,

  language           TEXT NOT NULL DEFAULT 'English',
  consent_ip         TEXT,
  -- Tamper evidence over version + hospital + doctor + timestamp, same construction as
  -- ConsentSignatureModal.tsx:92-95.
  signature_hash     TEXT NOT NULL,

  -- The attesting clinician. public.users(id), never auth.users(id) — the two diverge for every
  -- account created after 20260322111223 and check:user-fk enforces this.
  obtained_by        UUID NOT NULL REFERENCES public.users(id),
  obtained_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.quick_scribe_consents ENABLE ROW LEVEL SECURITY;

-- SELECT and INSERT only, matching patient_consents' no_update / no_delete stance
-- (20260327060326:36-40). A consent record that can be edited afterwards is not evidence of
-- anything. UPDATE and DELETE are denied by omission.
DROP POLICY IF EXISTS "hospital_isolation" ON public.quick_scribe_consents;
DROP POLICY IF EXISTS "quick_scribe_consents_select" ON public.quick_scribe_consents;
DROP POLICY IF EXISTS "quick_scribe_consents_insert" ON public.quick_scribe_consents;

CREATE POLICY "quick_scribe_consents_select" ON public.quick_scribe_consents
  FOR SELECT
  USING (hospital_id = public.get_user_hospital_id());

CREATE POLICY "quick_scribe_consents_insert" ON public.quick_scribe_consents
  FOR INSERT
  WITH CHECK (hospital_id = public.get_user_hospital_id());

CREATE INDEX IF NOT EXISTS idx_quick_scribe_consents_hospital
  ON public.quick_scribe_consents(hospital_id, obtained_at DESC);

-- ── Link the note to the consent that authorised it ───────────────────────────────────────
-- Nullable, and ON DELETE SET NULL rather than CASCADE: the retention periods differ (a consent
-- is evidence about a processing event and may outlive or predecease the note), and losing the
-- prescription because the consent row went first would be a far worse outcome than a note with
-- a dangling consent reference.
ALTER TABLE public.quick_scribe_notes
  ADD COLUMN IF NOT EXISTS consent_id UUID REFERENCES public.quick_scribe_consents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quick_scribe_notes_consent
  ON public.quick_scribe_notes(consent_id) WHERE consent_id IS NOT NULL;

COMMENT ON TABLE public.quick_scribe_consents IS
  'DPDP s.5/s.6 consent for recording a Quick Scribe consultation and sending the audio to a '
  'third-party AI. Taken before the microphone opens, so it is the parent of quick_scribe_notes. '
  'Append-only: SELECT and INSERT, never UPDATE or DELETE.';
