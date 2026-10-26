/**
 * quickScribeConsent — the DPDP notice and consent wording for Quick Scribe.
 *
 * ── Why this is its own file ───────────────────────────────────────────────────────────────
 *
 * getDPDPConsentText() in compliance-checks.ts covers patient registration: one sentence about
 * collecting health data for treatment. It is the right text for a registration desk and the
 * wrong text here, because Quick Scribe does three things that registration does not:
 *
 *   1. It records audio of a consulting room, which captures whoever else is speaking.
 *   2. It sends that audio outside the hospital to a third-party speech and language model.
 *   3. It keeps the result for years, because a page listing drugs is a prescription.
 *
 * DPDP s.5 requires the notice to state the purpose; stating a purpose that omits the part a
 * patient would actually object to is not a notice. So the wording is specific about all three,
 * and the retention numbers quoted here are the ones 20261111000001 actually enforces — if that
 * migration's periods change, this text is wrong and the test below is what fails.
 *
 * ── Versioning ─────────────────────────────────────────────────────────────────────────────
 *
 * QS_CONSENT_VERSION is stored on every consent row as terms_version, and the rendered text is
 * snapshotted alongside it. The version exists so that "what was this patient told" is answerable
 * from the row alone; the snapshot exists because a version string is only useful if the wording
 * it names can still be produced. Both, deliberately — the snapshot survives a lost changelog and
 * the version survives a snapshot that someone later decides to normalise away.
 *
 * Bump the version whenever the text changes in substance. A typo fix is not a new version; a
 * changed retention period or a new sub-processor is.
 */

/** Stored as `terms_version`. Bump on any substantive wording change. */
export const QS_CONSENT_VERSION = "qs-consent-v1";

/** Stored as `purpose`. DPDP s.5 requires the purpose to be stated explicitly. */
export const QS_CONSENT_PURPOSE =
  "Voice recording of this consultation, automated transcription and summarisation by a " +
  "third-party AI service, and printing of a consultation advice note.";

export interface QuickScribeConsentInput {
  hospitalName: string;
  /**
   * Version of the published ai_processing_disclosure in force, when one exists. Cited rather
   * than restated: the disclosure is the governance artefact that names the sub-processors and
   * where the data goes, and duplicating it here would create a second copy to drift.
   */
  disclosureVersion?: number | null;
}

/**
 * The notice read to (or shown to) the patient before recording starts.
 *
 * Written as plain sentences a doctor can read aloud in a two-minute consultation, not as a
 * clause list. A notice nobody reads out is not a notice.
 */
export function buildQuickScribeConsentText(input: QuickScribeConsentInput): string {
  const hospital = (input.hospitalName || "").trim() || "this hospital";

  const lines = [
    `${hospital} would like to audio-record this consultation.`,
    "The recording is converted to text and summarised automatically by an artificial-intelligence " +
      "service outside this hospital, so that your doctor can give you a printed note of the advice " +
      "and any medicines before you leave.",
    "Anything said in the room during the consultation may be captured in the recording.",
    "The recording itself is deleted after 90 days. The printed note and your name, age and address " +
      "are kept for 8 years where medicines are advised, and 3 years otherwise, as required for a " +
      "prescription. For a patient under 18, the note is kept until the age of 21.",
    "You may refuse. If you refuse, your doctor will write the note by hand and your care is " +
      "unaffected. You may also ask us later to delete what was recorded.",
  ];

  if (input.disclosureVersion != null) {
    lines.push(
      `Full details of which services process this data and where it is stored are published in ` +
        `${hospital}'s AI processing disclosure, version ${input.disclosureVersion}.`,
    );
  }

  return lines.join("\n\n");
}

/**
 * The one line printed on the consultation advice note.
 *
 * Short on purpose: it is a footnote on a prescription, not a reproduction of the notice. Its job
 * is to put on the paper handed to the patient that consent was taken and under which version, so
 * the patient holds the evidence too rather than only the hospital holding it.
 */
export function buildQuickScribeConsentPrintLine(version: string, obtainedAt: string): string {
  const when = new Date(obtainedAt).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return (
    `Recorded and transcribed with the patient's consent (${version}, obtained ${when}). ` +
    `The audio recording is deleted after 90 days.`
  );
}

/**
 * Input to the tamper-evidence hash, matching the construction at ConsentSignatureModal.tsx:92-95.
 *
 * Separated from the hashing itself so it can be asserted without a WebCrypto environment, and so
 * the field order — which is what makes the hash reproducible years later — is stated in one place.
 */
export function buildQuickScribeConsentHashInput(params: {
  version: string;
  hospitalId: string;
  doctorId: string;
  obtainedAt: string;
}): string {
  return [params.version, params.hospitalId, params.doctorId, params.obtainedAt].join("|");
}
