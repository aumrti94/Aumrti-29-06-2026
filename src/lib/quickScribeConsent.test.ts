/**
 * quickScribeConsent — the DPDP notice wording for Quick Scribe.
 *
 * These are pure string builders, so plain Vitest with no DOM and no Supabase stub.
 *
 * The assertions are deliberately about CONTENT, not formatting. A consent notice is only worth
 * storing if it actually discloses the things a patient would object to, and the failure mode
 * being guarded against is someone shortening the text into something that reads well and
 * discloses less. Each test below names one disclosure that must survive editing.
 */
import { describe, it, expect } from "vitest";
import {
  QS_CONSENT_VERSION,
  QS_CONSENT_PURPOSE,
  buildQuickScribeConsentText,
  buildQuickScribeConsentPrintLine,
  buildQuickScribeConsentHashInput,
} from "./quickScribeConsent";

describe("buildQuickScribeConsentText — DPDP s.5 disclosures", () => {
  const base = { hospitalName: "Sunrise Multispeciality Hospital" };

  it("names the hospital doing the recording", () => {
    expect(buildQuickScribeConsentText(base)).toContain("Sunrise Multispeciality Hospital");
  });

  it("falls back to a neutral phrase rather than printing an empty hospital name", () => {
    for (const name of ["", "   "]) {
      const text = buildQuickScribeConsentText({ hospitalName: name });
      expect(text).toContain("this hospital");
      expect(text).not.toMatch(/^\s+would like/);
    }
  });

  it("discloses that the audio leaves the hospital to a third party", () => {
    const text = buildQuickScribeConsentText(base).toLowerCase();
    // The single most objectionable fact, and the one most likely to be trimmed for brevity.
    expect(text).toContain("outside this hospital");
    expect(text).toContain("artificial-intelligence");
  });

  it("warns that bystander speech may be captured", () => {
    // An Indian consulting room routinely holds the patient, an attendant and a nurse. A notice
    // that only mentions the patient's own words understates what is collected.
    expect(buildQuickScribeConsentText(base)).toContain("Anything said in the room");
  });

  it("states every retention period the database actually enforces", () => {
    // These numbers must match quick_scribe_purge_after() in 20261111000001. If that migration's
    // periods change and this text does not, the patient was told something untrue — this is the
    // assertion that catches it.
    const text = buildQuickScribeConsentText(base);
    expect(text).toContain("90 days");   // transcript
    expect(text).toContain("8 years");   // note carrying medicines
    expect(text).toContain("3 years");   // summary / tests-only note
    expect(text).toContain("21");        // minors
  });

  it("states that refusal is possible and does not affect care", () => {
    // DPDP consent is not consent if refusing carries a penalty, so the notice has to say so.
    const text = buildQuickScribeConsentText(base);
    expect(text).toContain("You may refuse");
    expect(text).toContain("care is unaffected");
  });

  it("states the right to ask for deletion (s.6(4) withdrawal)", () => {
    expect(buildQuickScribeConsentText(base)).toContain("delete what was recorded");
  });

  it("cites the AI processing disclosure version when one is published", () => {
    const text = buildQuickScribeConsentText({ ...base, disclosureVersion: 3 });
    expect(text).toContain("AI processing disclosure, version 3");
  });

  it("omits the disclosure sentence entirely when no version is published", () => {
    // Citing a disclosure that does not exist is worse than not citing one.
    for (const v of [null, undefined]) {
      const text = buildQuickScribeConsentText({ ...base, disclosureVersion: v });
      expect(text).not.toContain("AI processing disclosure");
    }
  });

  it("names the purpose in terms a patient would recognise", () => {
    expect(QS_CONSENT_PURPOSE).toContain("Voice recording");
    expect(QS_CONSENT_PURPOSE).toContain("third-party AI");
  });

  it("carries a version string that is stored alongside the snapshot", () => {
    expect(QS_CONSENT_VERSION).toMatch(/^qs-consent-v\d+$/);
  });
});

describe("buildQuickScribeConsentPrintLine", () => {
  it("renders the date in en-IN order, matching every other date in the product", () => {
    const line = buildQuickScribeConsentPrintLine("qs-consent-v1", "2026-10-23T09:15:00+05:30");
    expect(line).toMatch(/23\/10\/2026/);
  });

  it("names the version so the paper in the patient's hand identifies what they agreed to", () => {
    expect(buildQuickScribeConsentPrintLine("qs-consent-v1", "2026-10-23T09:15:00+05:30"))
      .toContain("qs-consent-v1");
  });

  it("repeats the 90-day audio deletion on the printout", () => {
    expect(buildQuickScribeConsentPrintLine("qs-consent-v1", "2026-10-23T09:15:00+05:30"))
      .toContain("90 days");
  });
});

describe("buildQuickScribeConsentHashInput", () => {
  const params = {
    version: "qs-consent-v1",
    hospitalId: "11111111-1111-4111-8111-000000000001",
    doctorId: "22222222-2222-4222-8222-000000000002",
    obtainedAt: "2026-10-23T09:15:00.000Z",
  };

  it("is pipe-joined in a fixed field order", () => {
    // The order is what makes the hash reproducible during a dispute years later. Changing it
    // silently invalidates every previously stored signature_hash.
    expect(buildQuickScribeConsentHashInput(params)).toBe(
      "qs-consent-v1|11111111-1111-4111-8111-000000000001|22222222-2222-4222-8222-000000000002|2026-10-23T09:15:00.000Z",
    );
  });

  it("differs when any single field differs", () => {
    const baseline = buildQuickScribeConsentHashInput(params);
    expect(buildQuickScribeConsentHashInput({ ...params, version: "qs-consent-v2" })).not.toBe(baseline);
    expect(buildQuickScribeConsentHashInput({ ...params, doctorId: "33333333-3333-4333-8333-000000000003" })).not.toBe(baseline);
    expect(buildQuickScribeConsentHashInput({ ...params, obtainedAt: "2026-10-23T09:15:01.000Z" })).not.toBe(baseline);
  });
});
