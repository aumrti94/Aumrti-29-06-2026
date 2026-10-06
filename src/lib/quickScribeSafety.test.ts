/**
 * `describeScreening` produces the one sentence on the printed Consultation Advice that states
 * what was and was not checked. It replaced the original disclaimer, which printed "No
 * drug-interaction or allergy screening was performed" — a written admission, handed to the
 * patient, that drugs were advised without the safety step.
 *
 * So the property under test is narrow and medico-legal: the sentence must never claim a check
 * that did not happen, and must never go quiet about allergy screening being absent. It is a
 * pure function over the result object; `screenQuickScribeMedicines` itself hits Supabase
 * through drugSafetyCheck and is covered by integration tests, not here.
 */
import { describe, it, expect } from "vitest";
import { describeScreening, type QuickScribeSafetyResult } from "./quickScribeSafety";

const clean = (over: Partial<QuickScribeSafetyResult> = {}): QuickScribeSafetyResult => ({
  hasIssues: false,
  duplicatePairs: [],
  interactions: [],
  worstSeverity: "none",
  checkUnavailable: false,
  unavailableReasons: [],
  allergyCheckSkipped: true,
  ...over,
});

describe("describeScreening", () => {
  it("always discloses that allergy screening did not run", () => {
    // True in every branch: there is no patient history behind a Quick Scribe note, so an
    // allergy check is impossible and the paper must not imply otherwise.
    for (const r of [null, clean(), clean({ checkUnavailable: true, hasIssues: true })]) {
      expect(describeScreening(r).toLowerCase()).toContain("allergy");
    }
  });

  it("states that interaction and duplicate screening ran when it did", () => {
    const s = describeScreening(clean());
    expect(s).toMatch(/duplicate/i);
    expect(s).toMatch(/interaction/i);
    expect(s).toMatch(/no interaction or duplicate found/i);
  });

  it("reports a degraded lookup as INCOMPLETE rather than clean", () => {
    // drugSafetyCheck's fail-loud contract (KNOWN-BUG-108): a timed-out reference query must
    // never be indistinguishable from a clean bill of health on a patient-safety surface.
    const s = describeScreening(clean({ checkUnavailable: true, hasIssues: true }));
    expect(s).toMatch(/INCOMPLETE/);
    expect(s).not.toMatch(/no interaction or duplicate found/i);
  });

  it("does not claim screening ran when no result exists at all", () => {
    const s = describeScreening(null);
    expect(s).toMatch(/not run/i);
    expect(s).not.toMatch(/no interaction or duplicate found/i);
  });

  it("counts the findings it raised", () => {
    const s = describeScreening(clean({
      hasIssues: true,
      duplicatePairs: [{ a: "Dolo 650", b: "Crocin" }],
      interactions: [{
        id: "1", drug_a: "Warfarin", drug_b: "Aspirin", severity: "major",
        mechanism: null, clinical_effect: null, recommendation: null,
      }],
      worstSeverity: "major",
    }));
    expect(s).toContain("1 duplicate-molecule warning(s)");
    expect(s).toContain("1 interaction warning(s)");
    expect(s).toMatch(/reviewed by the doctor/i);
  });
});
