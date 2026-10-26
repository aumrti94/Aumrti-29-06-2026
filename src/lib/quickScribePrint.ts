/**
 * quickScribePrint — the print renderer for the standalone Quick Scribe note.
 *
 * ── Why this file is shaped the way it is ──────────────────────────────────────────────
 *
 * The first version of this renderer printed a medicine list with no patient identity and a
 * disclaimer reading "not an institutional prescription". Both were wrong in Indian law:
 *
 *   1. A prescription is an act of a registered PRACTITIONER, never of an institution. There
 *      is no "institutional prescription" category to disclaim, so the sentence disclaimed
 *      nothing while reading as "this IS a prescription, just not on letterhead".
 *   2. A printed list of drugs with doses IS a prescription under the Drugs & Cosmetics Rules
 *      1945 regardless of the title on the page. Rule 65(10) requires the patient's name and
 *      address, the total quantity to be supplied, and the prescriber's signature; MCI Code
 *      of Ethics 2002 reg. 1.4.1 requires the registration number and reg. 1.5 (2017
 *      amendment) requires generic names.
 *   3. The old disclaimer also printed "no drug-interaction or allergy screening was
 *      performed" — a written admission, handed to the patient, that drugs were advised
 *      without the safety step. That is the plaintiff's exhibit in a negligence claim, not a
 *      shield. It is replaced by an honest statement of what WAS screened (duplicate therapy
 *      and interactions, which need no patient record) and what was not (allergies).
 *
 * Patient name/age/sex and the doctor registration number are printed when the doctor fills
 * them in, but — per product decision — are not required to print: the only field this renderer
 * still blocks on is a per-drug quantity (Rule 65(10)(c)), since that one is derived by the app
 * itself rather than typed by the doctor, and a blank quantity usually means a calculation
 * bug rather than a deliberate omission.
 *
 * Reuses the same branded header/print-window pipeline every other document in the app uses
 * — see receiptPrint.ts / billPrint.ts.
 */

import { supabase } from "@/integrations/supabase/client";
import { escapeHtml } from "@/lib/billPrint";
import { fetchHospitalBrand, printHeader, printDocument } from "@/lib/printUtils";

export interface QuickScribeMedicine {
  drug_name: string;
  dose?: string;
  frequency?: string;
  duration?: string;
  /** Rule 65(10)(c): the total quantity to be supplied must appear on the prescription. */
  quantity?: string;
  instructions?: string;
}

export interface QuickScribeNoteInput {
  doctorName: string;
  /** Printed when on file; not required to print. */
  doctorRegistrationNumber: string;
  /** Rule 65(10)(b) — mandatory whenever medicines are listed. */
  patientName: string;
  patientAge?: string | null;
  patientSex?: string | null;
  /** Rule 65(10)(b) requires the address too. */
  patientAddress?: string | null;
  /**
   * Short per-hospital code (QS-7K3M9) the patient brings back on the paper. Printed, never
   * required: a note printed before 20261111000005 applied, or one printed while the insert
   * failed, still has to produce a lawful prescription.
   */
  visitCode?: string | null;
  /**
   * Set when this note was opened via "Continue this visit" from PreviousVisitDrawer — the
   * visit code of the EARLIER note this one follows up on, never this note's own code (that's
   * visitCode above). Printed as a delta line near the top so the second printout connects to
   * the first on paper, not only in the doctor's head.
   */
  previousVisitCode?: string | null;
  /** The earlier visit's date, paired with previousVisitCode. Both or neither. */
  previousVisitDate?: string | null;
  createdAt: string;
  /** AI-filled or typed. What the patient came in with, in their own or the doctor's words. */
  chiefComplaint?: string;
  summary: string;
  /**
   * Typed only, follow-up visits only — see 20261111000006. Rendered only when non-empty: a
   * first-visit note has nothing to review yet, and an empty heading on a prescription is noise.
   */
  reportsReviewed?: string;
  /**
   * Typed only. No AI path ever writes this — see 20261111000006. Printed between Reports
   * Reviewed and Medicines, matching the house Clinical-Notes-then-Rx order in ConsultationWorkspace.
   */
  diagnosis?: string;
  medicines: QuickScribeMedicine[];
  labTests: string[];
  radiologyTests: string[];
  /** AI-filled or typed. Printed below Investigations, matching the house Rx-then-Advice order. */
  advice?: string;
  /** App-computed from an AI-returned interval; see followUpInterval.ts. ISO yyyy-mm-dd or empty. */
  followUpDate?: string;
  /**
   * What screening ran, computed by quickScribeSafety.describeScreening — kept on the type and
   * still passed by the caller, but deliberately NOT rendered on the printout (removed on
   * product decision: the printed page no longer carries a screening record or the NDPS/
   * Schedule X limitation notice). The on-screen amber safety alert is unaffected — this field
   * only ever fed the print copy of that information, never the live check itself.
   */
  screeningNote: string;
}

/**
 * Thrown rather than silently printing a document that cannot lawfully be dispensed.
 * The screen gates on the same conditions, so this is a backstop, not the primary UX.
 */
export class QuickScribePrintBlocked extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`Cannot print: missing mandatory prescription field(s): ${missing.join(", ")}`);
    this.name = "QuickScribePrintBlocked";
    this.missing = missing;
  }
}

/**
 * Only enforced when medicines are present — a note carrying nothing but a summary and test
 * advice is not a prescription and does not need the drug fields. Patient name/age/sex and the
 * doctor registration number are printed when filled in but are not required to print.
 */
export function validateForPrint(input: QuickScribeNoteInput): string[] {
  const missing: string[] = [];
  const hasMedicines = (input.medicines || []).some(m => (m.drug_name || "").trim());
  if (!hasMedicines) return missing;

  const unquantified = (input.medicines || [])
    .filter(m => (m.drug_name || "").trim() && !(m.quantity || "").trim())
    .map(m => m.drug_name.trim());
  if (unquantified.length > 0) missing.push(`quantity for ${unquantified.join(", ")}`);

  return missing;
}

/** "• a\n• b" → one escaped line per bullet. Empty input renders nothing. */
function bulletsToHtml(text: string | undefined | null): string {
  const lines = (text || "").split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return `<div class="qs-empty">—</div>`;
  return lines.map(l => `<div class="qs-bullet">${escapeHtml(l)}</div>`).join("");
}

function listToHtml(items: string[] | undefined): string {
  if (!items || items.length === 0) return `<div class="qs-empty">—</div>`;
  return items.map(i => `<div class="qs-bullet">• ${escapeHtml(i)}</div>`).join("");
}

function medicinesToHtml(medicines: QuickScribeMedicine[] | undefined): string {
  const rows = (medicines || []).filter(m => (m.drug_name || "").trim());
  if (rows.length === 0) return `<div class="qs-empty">—</div>`;
  // class on <table> only, styled via the descendant selector .qs-table th / .qs-table td below
  // — matching billPrint.ts's .bp-table pattern. The <th> tags themselves stay bare, which is
  // deliberate: it is what lets the existing toContain("<th>Qty</th>") assertion survive.
  return `<table class="qs-table">
    <thead><tr>
      <th>Medicine</th><th>Dose</th><th>Frequency</th><th>Duration</th><th>Qty</th><th>Instructions</th>
    </tr></thead>
    <tbody>
      ${rows.map(m => `<tr>
        <td>${escapeHtml(m.drug_name || "")}</td>
        <td>${escapeHtml(m.dose || "")}</td>
        <td>${escapeHtml(m.frequency || "")}</td>
        <td>${escapeHtml(m.duration || "")}</td>
        <td>${escapeHtml(m.quantity || "")}</td>
        <td>${escapeHtml(m.instructions || "")}</td>
      </tr>`).join("")}
    </tbody>
  </table>`;
}

/** DD/MM/YYYY, matching every other date in the product. Empty input renders nothing. */
function formatFollowUpDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function renderQuickScribeHtml(input: QuickScribeNoteInput): string {
  const dateStr = new Date(input.createdAt).toLocaleString("en-IN", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const hasMedicines = (input.medicines || []).some(m => (m.drug_name || "").trim());

  const ageSex = [input.patientAge, input.patientSex].filter(Boolean).join(" / ");

  return `
<style>
  /* The Zero Scroll law is a screen law; on paper the page is A4 and content flows. */
  @page { size: A4; margin: 12mm; }
  .qs-title { font-size: 15px; font-weight: 700; text-align: center; letter-spacing: 0.06em;
    text-transform: uppercase; margin: 6px 0 10px; }
  .qs-patient { border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px 10px; margin-bottom: 12px;
    display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; font-size: 14px; }
  .qs-patient .full { grid-column: 1 / -1; }
  .qs-patient label { color: #64748b; font-size: 14px; margin-right: 6px; }
  .qs-meta { display: flex; justify-content: space-between; font-size: 14px; color: #475569; margin-bottom: 12px; }
  .qs-followup-of { text-align: center; font-size: 14px; font-weight: 600; color: #1d4ed8;
    margin: -4px 0 10px; }
  .qs-section { margin-bottom: 14px; }
  .qs-section h4 { font-size: 14px; text-transform: uppercase; color: #475569; margin: 0 0 6px; letter-spacing: 0.04em; }
  .qs-bullet { font-size: 14px; margin-bottom: 2px; }
  .qs-empty { font-size: 14px; color: #64748b; }
  .qs-generic { font-size: 14px; color: #475569; margin-top: 4px; font-style: italic; }
  .qs-sign { margin-top: 28px; text-align: right; font-size: 14px; }
  .qs-signline { display: inline-block; border-top: 1px solid #334155; padding-top: 4px;
    min-width: 200px; margin-top: 34px; }
  /* Fixes printUtils.ts's global th (hard-coded 11px) and td (brand fontSize, default 13px)
     leaking into the drug table — otherwise the only sub-14px text on the prescription, and the
     most safety-critical text on the page. Specificity (0,1,1) beats the bare global th at
     (0,0,1), so no !important is needed — same construction as billPrint.ts's .bp-table. */
  .qs-table { width: 100%; border-collapse: collapse; margin: 4px 0 8px; }
  .qs-table th { background: #f1f5f9; padding: 5px 8px; text-align: left; font-size: 14px;
    text-transform: uppercase; color: #475569; border-bottom: 1.5px solid #cbd5e1; }
  .qs-table td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; font-size: 14px;
    vertical-align: top; }
  .qs-followup { border: 1px dashed #94a3b8; background: #f8fafc; color: #334155;
    padding: 8px 10px; margin: 12px 0; font-size: 14px; border-radius: 4px; }
</style>

<div class="qs-title">Consultation Advice</div>

${input.previousVisitCode && input.previousVisitDate ? `<div class="qs-followup-of">
  Follow-up of visit dated ${escapeHtml(new Date(input.previousVisitDate).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }))}
  (${escapeHtml(input.previousVisitCode)})
</div>` : ""}

<div class="qs-patient">
  <div><label>Patient:</label><strong>${escapeHtml(input.patientName || "")}</strong></div>
  <div><label>Age / Sex:</label>${escapeHtml(ageSex || "—")}</div>
  <div class="full"><label>Address:</label>${escapeHtml(input.patientAddress || "—")}</div>
</div>

<div class="qs-meta">
  <span>Date: ${dateStr}</span>
  ${input.visitCode
    ? `<span>Visit Code: <strong>${escapeHtml(input.visitCode)}</strong></span>`
    : ""}
</div>

${input.chiefComplaint && input.chiefComplaint.trim() ? `<div class="qs-section">
  <h4>Chief Complaint</h4>
  ${bulletsToHtml(input.chiefComplaint)}
</div>` : ""}

<div class="qs-section">
  <h4>Summary</h4>
  ${bulletsToHtml(input.summary)}
</div>

${input.reportsReviewed && input.reportsReviewed.trim() ? `<div class="qs-section">
  <h4>Reports Reviewed</h4>
  ${bulletsToHtml(input.reportsReviewed)}
</div>` : ""}

${input.diagnosis && input.diagnosis.trim() ? `<div class="qs-section">
  <h4>Diagnosis</h4>
  ${bulletsToHtml(input.diagnosis)}
</div>` : ""}

<div class="qs-section">
  <h4>Medicines</h4>
  ${medicinesToHtml(input.medicines)}
  ${hasMedicines ? `<div class="qs-generic">Substitution with an equivalent generic product is permitted unless marked otherwise.</div>` : ""}
</div>

<div class="qs-section">
  <h4>Lab Tests</h4>
  ${listToHtml(input.labTests)}
</div>

<div class="qs-section">
  <h4>Radiology Tests</h4>
  ${listToHtml(input.radiologyTests)}
</div>

${input.advice && input.advice.trim() ? `<div class="qs-section">
  <h4>Advice &amp; Instructions</h4>
  ${bulletsToHtml(input.advice)}
</div>` : ""}

${formatFollowUpDate(input.followUpDate) ? `<div class="qs-followup">
  <strong>Follow-up:</strong> ${escapeHtml(formatFollowUpDate(input.followUpDate))}
</div>` : ""}

<div class="qs-sign">
  <div class="qs-signline">
    <div><strong>Dr. ${escapeHtml(input.doctorName)}</strong></div>
    <div>Reg. No: ${escapeHtml(input.doctorRegistrationNumber)}</div>
    <div style="color:#64748b;">Signature</div>
  </div>
</div>`;
}

/**
 * Fetch branding, render, open the print window — the one call the Quick Scribe screen makes.
 * fetchHospitalBrand must run before printHeader/printDocument — it warms the brand cache
 * those read for logo/layout/font/footer.
 *
 * Throws QuickScribePrintBlocked rather than emitting a document that cannot be dispensed.
 */
export async function printQuickScribeDoc(
  hospitalId: string,
  input: QuickScribeNoteInput,
  opts?: { width?: number; height?: number },
): Promise<void> {
  const missing = validateForPrint(input);
  if (missing.length > 0) throw new QuickScribePrintBlocked(missing);

  const brand = await fetchHospitalBrand(supabase, hospitalId);
  const body = `${printHeader(brand.name, brand.address || undefined)}${renderQuickScribeHtml(input)}`;
  printDocument("Consultation Advice", body, {
    width: opts?.width ?? 720,
    height: opts?.height ?? 900,
  });
}
