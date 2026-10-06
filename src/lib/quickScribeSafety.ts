/**
 * quickScribeSafety — drug screening for a Quick Scribe note.
 *
 * Quick Scribe has no patient record, and the original implementation concluded from that
 * that no safety check was possible and reported `safetyCheck = "not_applicable"`. That
 * conflated two different checks:
 *
 *   - ALLERGY checking genuinely needs a patient history. Without one it cannot run, and
 *     saying so is honest.
 *   - DRUG-DRUG and DUPLICATE-THERAPY checking needs only the list of drugs in front of you.
 *     `checkDrugSafety(newDrug, currentDrugs, patientAllergies, hospitalId)` accepts an empty
 *     allergy array and never reads a patient_id — see drugSafetyCheck.ts CHECK 1 / CHECK 2.
 *
 * The highest-yield error in an Indian OPD is the same molecule prescribed twice under two
 * brands ("Dolo 650" + "Crocin" are both paracetamol — a real overdose, not a theoretical
 * one). That is catchable here with zero patient identity, so it is checked.
 *
 * This module runs the dictated list against ITSELF, pairwise: drug[i] is screened against
 * drugs[0..i-1], which covers every unordered pair exactly once.
 */

import { checkDrugSafety, type DrugInteraction, type DrugSafetyResult } from "@/lib/drugSafetyCheck";
import type { QuickScribeMedicine } from "@/lib/quickScribePrint";

export interface QuickScribeSafetyResult {
  /** True when anything at all needs the doctor's eyes before printing. */
  hasIssues: boolean;
  /** Pairs of dictated drugs that resolve to the same molecule. */
  duplicatePairs: Array<{ a: string; b: string }>;
  /** Drug-drug interactions between two dictated drugs. */
  interactions: DrugInteraction[];
  worstSeverity: DrugSafetyResult["worstSeverity"];
  /**
   * True when a reference lookup failed, so this screen is INCOMPLETE rather than clean.
   * Mirrors drugSafetyCheck's fail-loud contract (KNOWN-BUG-108): a timed-out formulary
   * query must never be indistinguishable from a clean result on a patient-safety surface.
   */
  checkUnavailable: boolean;
  unavailableReasons: string[];
  /**
   * Always true for Quick Scribe. Allergy screening cannot run without a patient history,
   * and the printed note states this explicitly rather than implying drugs were cleared.
   */
  allergyCheckSkipped: true;
}

const SEVERITY_RANK: Record<string, number> = {
  contraindicated: 4, major: 3, high: 3, moderate: 2, minor: 1, low: 1, none: 0,
};

/** Drop blank/whitespace-only names so an empty textarea line never becomes a "drug". */
function namesOf(medicines: QuickScribeMedicine[]): string[] {
  return medicines.map(m => (m.drug_name || "").trim()).filter(Boolean);
}

/**
 * Screen a dictated medicine list against itself.
 *
 * Returns a clean result for 0 or 1 drugs — there is no pair to compare — but note that
 * `checkUnavailable` can still be true for a single drug if the formulary lookup fails,
 * because a caller that gates on "clean" must not treat a degraded lookup as safe.
 */
export async function screenQuickScribeMedicines(
  medicines: QuickScribeMedicine[],
  hospitalId: string,
): Promise<QuickScribeSafetyResult> {
  const names = namesOf(medicines);

  const result: QuickScribeSafetyResult = {
    hasIssues: false,
    duplicatePairs: [],
    interactions: [],
    worstSeverity: "none",
    checkUnavailable: false,
    unavailableReasons: [],
    allergyCheckSkipped: true,
  };

  if (names.length === 0) return result;

  const noteWorst = (sev: string) => {
    if ((SEVERITY_RANK[sev] ?? 0) > (SEVERITY_RANK[result.worstSeverity] ?? 0)) {
      result.worstSeverity = sev as QuickScribeSafetyResult["worstSeverity"];
    }
  };

  for (let i = 0; i < names.length; i++) {
    const prior = names.slice(0, i);
    // Deliberately empty allergy list: there is no patient history to supply one, and
    // checkDrugSafety treats [] as "no allergies known", not "allergies cleared".
    const r = await checkDrugSafety(names[i], prior, [], hospitalId);

    for (const dup of r.duplicates) {
      const pair = { a: dup, b: names[i] };
      const seen = result.duplicatePairs.some(
        p => (p.a === pair.a && p.b === pair.b) || (p.a === pair.b && p.b === pair.a),
      );
      if (!seen) result.duplicatePairs.push(pair);
    }

    for (const interaction of r.interactions) {
      const dup = result.interactions.some(x => x.id === interaction.id);
      if (!dup) result.interactions.push(interaction);
      noteWorst(interaction.severity);
    }

    if (r.checkUnavailable) {
      result.checkUnavailable = true;
      for (const reason of r.unavailableReasons) {
        if (!result.unavailableReasons.includes(reason)) result.unavailableReasons.push(reason);
      }
    }
  }

  // A duplicate molecule is at minimum a moderate finding — two brands of the same drug is a
  // dosing error even when no interaction row exists for the pair.
  if (result.duplicatePairs.length > 0) noteWorst("moderate");

  result.hasIssues =
    result.duplicatePairs.length > 0 || result.interactions.length > 0 || result.checkUnavailable;

  return result;
}

/** One-line summary for the print footer, so the paper records what was and was not screened. */
export function describeScreening(result: QuickScribeSafetyResult | null): string {
  if (!result) {
    return "Drug screening was not run for this note. No allergy history was available.";
  }
  if (result.checkUnavailable) {
    return "Drug screening was INCOMPLETE — a reference lookup failed. No allergy history was available.";
  }
  const parts: string[] = [];
  if (result.duplicatePairs.length > 0) {
    parts.push(`${result.duplicatePairs.length} duplicate-molecule warning(s)`);
  }
  if (result.interactions.length > 0) {
    parts.push(`${result.interactions.length} interaction warning(s)`);
  }
  const found = parts.length > 0 ? parts.join(" and ") + " raised and reviewed by the doctor" : "no interaction or duplicate found";
  return `Duplicate-therapy and drug-interaction screening run on the listed medicines — ${found}. Allergy screening not performed (no patient history available).`;
}
