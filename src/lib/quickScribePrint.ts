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
 * Without a dispensable document the predictable real-world outcome is that the chemist
 * dispenses anyway and invents a patient name for the statutory Schedule H1 register — i.e.
 * the product's normal operating mode would produce fabricated entries in a government
 * register. Hence: patient name/age/sex are mandatory upstream, and this renderer refuses to
 * produce a medicines page without them.
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
  /** MCI reg. 1.4.1 — mandatory. Printing is blocked upstream when this is absent. */
  doctorRegistrationNumber: string;
  /** Rule 65(10)(b) — mandatory whenever medicines are listed. */
  patientName: string;
  patientAge?: string | null;
  patientSex?: string | null;
  /** Rule 65(10)(b) requires the address too. */
  patientAddress?: string | null;
  createdAt: string;
  summary: string;
  medicines: QuickScribeMedicine[];
  labTests: string[];
  radiologyTests: string[];
  /** Honest one-line record of what screening ran. See quickScribeSafety.describeScreening. */
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
 * Rule 65(10) validation. Only enforced when medicines are present — a note carrying nothing
 * but a summary and test advice is not a prescription and does not need the drug fields.
 */
export function validateForPrint(input: QuickScribeNoteInput): string[] {
  const missing: string[] = [];
  const hasMedicines = (input.medicines || []).some(m => (m.drug_name || "").trim());
  if (!hasMedicines) return missing;

  if (!(input.patientName || "").trim()) missing.push("patient name");
  if (!(input.patientAge || "").toString().trim()) missing.push("patient age");
  if (!(input.patientSex || "").toString().trim()) missing.push("patient sex");
  if (!(input.doctorRegistrationNumber || "").trim()) missing.push("doctor registration number");

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
  return `<table>
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
  .qs-section { margin-bottom: 14px; }
  .qs-section h4 { font-size: 14px; text-transform: uppercase; color: #475569; margin: 0 0 6px; letter-spacing: 0.04em; }
  .qs-bullet { font-size: 14px; margin-bottom: 2px; }
  .qs-empty { font-size: 14px; color: #64748b; }
  .qs-generic { font-size: 14px; color: #475569; margin-top: 4px; font-style: italic; }
  .qs-screening { border: 1px solid #94a3b8; background: #f8fafc; color: #334155;
    padding: 8px 10px; margin: 12px 0; font-size: 14px; border-radius: 4px; }
  .qs-scheduled { border: 2px solid #b45309; background: #fffbeb; color: #78350f;
    padding: 8px 10px; margin: 12px 0; font-size: 14px; font-weight: 600; border-radius: 4px; }
  .qs-sign { margin-top: 28px; text-align: right; font-size: 14px; }
  .qs-signline { display: inline-block; border-top: 1px solid #334155; padding-top: 4px;
    min-width: 200px; margin-top: 34px; }
</style>

<div class="qs-title">Consultation Advice</div>

<div class="qs-patient">
  <div><label>Patient:</label><strong>${escapeHtml(input.patientName || "")}</strong></div>
  <div><label>Age / Sex:</label>${escapeHtml(ageSex || "—")}</div>
  <div class="full"><label>Address:</label>${escapeHtml(input.patientAddress || "—")}</div>
</div>

<div class="qs-meta">
  <span>Date: ${dateStr}</span>
</div>

<div class="qs-section">
  <h4>Summary</h4>
  ${bulletsToHtml(input.summary)}
</div>

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

${hasMedicines ? `<div class="qs-scheduled">
  Not valid for Schedule X or NDPS (narcotic / psychotropic) drugs. Those require a separate
  prescription in the statutory format, issued in duplicate.
</div>` : ""}

<div class="qs-screening">${escapeHtml(input.screeningNote)}</div>

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
