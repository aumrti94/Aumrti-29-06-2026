/**
 * quickScribePrint is the renderer for a document a patient carries to a chemist. The thing
 * worth asserting here is not layout — it is that the document cannot be produced in a state
 * that is unlawful to dispense against.
 *
 * Background: the first iteration of Quick Scribe printed a medicine list with no patient
 * identity and a disclaimer reading "not an institutional prescription". Under the Drugs &
 * Cosmetics Rules 1945, a printed list of drugs and doses IS a prescription whatever the page
 * is titled, and Rule 65(10) requires the patient's name and address, the total quantity to be
 * supplied, and the prescriber's signature; MCI Code of Ethics 2002 reg. 1.4.1 adds the
 * registration number. A no-name printout does not get refused at the counter in practice — the
 * chemist dispenses and invents a name for the statutory Schedule H1 register. So the failure
 * mode these tests guard is silent and downstream, which is exactly the kind that needs a test.
 *
 * `validateForPrint` and `renderQuickScribeHtml` are pure, DOM-free string/array functions —
 * plain Vitest, no browser needed. `printQuickScribeDoc` is not tested here: it opens a print
 * window and needs the brand fetch.
 */
import { describe, it, expect } from "vitest";
import {
  validateForPrint,
  renderQuickScribeHtml,
  type QuickScribeNoteInput,
  type QuickScribeMedicine,
} from "./quickScribePrint";

const med = (over: Partial<QuickScribeMedicine> = {}): QuickScribeMedicine => ({
  drug_name: "Amoxicillin 500mg",
  dose: "1 tab",
  frequency: "TDS",
  duration: "5",
  quantity: "15",
  ...over,
});

const base = (over: Partial<QuickScribeNoteInput> = {}): QuickScribeNoteInput => ({
  doctorName: "A Sharma",
  doctorRegistrationNumber: "TSMC/12345",
  patientName: "Ramesh Kumar",
  patientAge: "42",
  patientSex: "Male",
  patientAddress: "12 MG Road, Hyderabad",
  createdAt: "2026-09-26T09:30:00.000Z",
  summary: "• Fever × 3 days\n• No red flags",
  medicines: [med()],
  labTests: ["CBC"],
  radiologyTests: [],
  screeningNote: "screening ran",
  ...over,
});

describe("validateForPrint — Rule 65(10) fields", () => {
  it("passes a fully-specified prescription", () => {
    expect(validateForPrint(base())).toEqual([]);
  });

  it.each([
    ["doctor registration number", { doctorRegistrationNumber: "" }, "doctor registration number"],
    ["patient name", { patientName: "" }, "patient name"],
    ["patient age", { patientAge: "" }, "patient age"],
    ["patient sex", { patientSex: "" }, "patient sex"],
  ])("does not block printing when %s is missing", (_label, over, expected) => {
    const missing = validateForPrint(base(over as Partial<QuickScribeNoteInput>));
    expect(missing).not.toContain(expected);
  });

  it("requires a quantity per drug and names the offending drug", () => {
    const missing = validateForPrint(base({ medicines: [med({ quantity: "" })] }));
    expect(missing.some(m => m.includes("quantity") && m.includes("Amoxicillin 500mg"))).toBe(true);
  });

  it("names every unquantified drug, not just the first", () => {
    const missing = validateForPrint(base({
      medicines: [med({ drug_name: "Drug A", quantity: "" }), med({ drug_name: "Drug B", quantity: "" })],
    }));
    const line = missing.find(m => m.startsWith("quantity for")) ?? "";
    expect(line).toContain("Drug A");
    expect(line).toContain("Drug B");
  });

  it("exempts a note with NO medicines — advice alone is not a prescription", () => {
    // A summary/tests-only note carries no drugs, so Rule 65(10) does not bite and the doctor
    // should not be forced to collect an address to print test advice.
    const missing = validateForPrint(base({
      medicines: [], patientName: "", patientAge: "", patientSex: "", doctorRegistrationNumber: "",
    }));
    expect(missing).toEqual([]);
  });

  it("ignores blank medicine rows when deciding whether this is a prescription", () => {
    // The screen's "Add medicine" button appends an empty row; an untouched one must not
    // turn an advice note into a prescription.
    const missing = validateForPrint(base({
      medicines: [{ drug_name: "  ", quantity: "" }],
      patientName: "", patientAge: "", patientSex: "", doctorRegistrationNumber: "",
    }));
    expect(missing).toEqual([]);
  });
});

describe("renderQuickScribeHtml — statutory content", () => {
  it("prints the patient identity block", () => {
    const html = renderQuickScribeHtml(base());
    expect(html).toContain("Ramesh Kumar");
    expect(html).toContain("42 / Male");
    expect(html).toContain("12 MG Road, Hyderabad");
  });

  it("prints the doctor's registration number and a signature line", () => {
    const html = renderQuickScribeHtml(base());
    expect(html).toContain("TSMC/12345");
    expect(html).toContain("Signature");
  });

  it("carries a quantity column", () => {
    const html = renderQuickScribeHtml(base());
    expect(html).toContain("<th>Qty</th>");
  });

  it("does NOT print the old self-incriminating disclaimer", () => {
    // The original text printed "No drug-interaction or allergy screening was performed" and
    // "not an institutional prescription" — the first is a written admission handed to the
    // patient, the second disclaims a category that does not exist in Indian drug law.
    const html = renderQuickScribeHtml(base());
    expect(html).not.toContain("institutional prescription");
    expect(html).not.toContain("No drug-interaction or allergy screening was performed");
  });

  it("does NOT print the screening statement, even when one is given — product decision", () => {
    // screeningNote is still computed and passed by the caller (QuickScribePage still needs it
    // for nothing in particular yet, but removing the field was a larger change than asked for
    // — see the field's own comment in quickScribePrint.ts) — it is just never rendered here.
    const html = renderQuickScribeHtml(base({ screeningNote: "duplicate check ran; no allergy history" }));
    expect(html).not.toContain("duplicate check ran; no allergy history");
  });

  it("does NOT print the Schedule X / NDPS limitation notice — product decision", () => {
    expect(renderQuickScribeHtml(base())).not.toContain("NDPS");
  });

  it("omits the generic-substitution notice when there are no medicines", () => {
    const html = renderQuickScribeHtml(base({ medicines: [] }));
    expect(html).not.toContain("equivalent generic");
  });

  it("escapes patient-supplied text rather than interpolating it as markup", () => {
    const html = renderQuickScribeHtml(base({ patientName: `<script>alert(1)</script>` }));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders the date in en-IN (DD/MM/YYYY), never the US order", () => {
    const html = renderQuickScribeHtml(base({ createdAt: "2026-09-26T09:30:00.000Z" }));
    expect(html).toMatch(/26\/09\/2026/);
  });
});

describe("renderQuickScribeHtml — visit code", () => {
  it("prints the visit code when one was allocated", () => {
    // This is the whole return-visit mechanism: the patient brings this string back on paper.
    const html = renderQuickScribeHtml(base({ visitCode: "QS-7K3M9" }));
    expect(html).toContain("Visit Code:");
    expect(html).toContain("QS-7K3M9");
  });

  it("omits the visit-code label entirely when no code was allocated", () => {
    // A note printed while the insert failed has no code. Printing an empty "Visit Code:" label
    // would invite the patient to read back a value that resolves to nothing.
    for (const code of [null, undefined, ""]) {
      const html = renderQuickScribeHtml(base({ visitCode: code }));
      expect(html).not.toContain("Visit Code:");
    }
  });

  it("escapes the visit code rather than interpolating it as markup", () => {
    const html = renderQuickScribeHtml(base({ visitCode: `<b>QS</b>` }));
    expect(html).not.toContain("<b>QS</b>");
    expect(html).toContain("&lt;b&gt;");
  });

  it("still renders a lawful prescription without a code", () => {
    // The code is a convenience. Its absence must never degrade the statutory content.
    const html = renderQuickScribeHtml(base({ visitCode: null }));
    expect(html).toContain("<th>Qty</th>");
    expect(html).toContain("Signature");
  });
});

describe("renderQuickScribeHtml — the follow-up delta line", () => {
  // This is the whole point of a return visit: without this line, nothing on the second printout
  // ever referenced the first, which is exactly the gap a real run of the feature surfaced.
  it("prints 'Follow-up of visit dated ...' when both the previous code and date are present", () => {
    const html = renderQuickScribeHtml(base({
      previousVisitCode: "QS-PT92E",
      previousVisitDate: "2026-10-25T05:51:00.000Z",
    }));
    expect(html).toContain("Follow-up of visit dated");
    expect(html).toContain("25/10/2026");
    expect(html).toContain("QS-PT92E");
  });

  it("omits the line entirely when there is no linked previous visit", () => {
    const html = renderQuickScribeHtml(base({ previousVisitCode: null, previousVisitDate: null }));
    expect(html).not.toContain("Follow-up of visit dated");
  });

  it("omits the line when only one of the pair is present — both or neither, never a dangling reference", () => {
    for (const partial of [
      { previousVisitCode: "QS-PT92E", previousVisitDate: null },
      { previousVisitCode: null, previousVisitDate: "2026-10-25T05:51:00.000Z" },
    ]) {
      const html = renderQuickScribeHtml(base(partial));
      expect(html).not.toContain("Follow-up of visit dated");
    }
  });

  it("escapes the previous visit code rather than interpolating it as markup", () => {
    const html = renderQuickScribeHtml(base({
      previousVisitCode: `<b>QS</b>`,
      previousVisitDate: "2026-10-25T05:51:00.000Z",
    }));
    expect(html).not.toContain("<b>QS</b>");
    expect(html).toContain("&lt;b&gt;");
  });

  it("prints above the patient identity block, matching the plan's 'one delta line at the top'", () => {
    const html = renderQuickScribeHtml(base({
      previousVisitCode: "QS-PT92E",
      previousVisitDate: "2026-10-25T05:51:00.000Z",
    }));
    const deltaIdx = html.indexOf("Follow-up of visit dated");
    const patientBlockIdx = html.indexOf('class="qs-patient"');
    expect(deltaIdx).toBeGreaterThan(-1);
    expect(patientBlockIdx).toBeGreaterThan(deltaIdx);
  });
});

describe("renderQuickScribeHtml — the five additional fields", () => {
  it("renders Chief Complaint, Reports Reviewed, Diagnosis and Advice only when non-empty", () => {
    // "Advice" anchored as ">Advice " — the page title "Consultation Advice" also contains the
    // bare word, so a plain substring check would pass even if the section never rendered.
    const empty = renderQuickScribeHtml(base());
    expect(empty).not.toContain("Chief Complaint");
    expect(empty).not.toContain("Reports Reviewed");
    expect(empty).not.toContain(">Diagnosis<");
    expect(empty).not.toContain(">Advice &amp; Instructions<");

    const filled = renderQuickScribeHtml(base({
      chiefComplaint: "Fever since 3 days",
      reportsReviewed: "CBC — WBC 11,200",
      diagnosis: "Viral fever",
      advice: "Plenty of fluids, review if fever persists beyond 5 days",
    }));
    expect(filled).toContain("Chief Complaint");
    expect(filled).toContain("Fever since 3 days");
    expect(filled).toContain("Reports Reviewed");
    expect(filled).toContain("CBC — WBC 11,200");
    expect(filled).toContain(">Diagnosis<");
    expect(filled).toContain("Viral fever");
    expect(filled).toContain(">Advice &amp; Instructions<");
    expect(filled).toContain("Plenty of fluids");
  });

  it("omits Reports Reviewed and Diagnosis when the string is present but blank", () => {
    // A field that is "" or whitespace-only must render exactly as absent, not as an empty
    // heading — a printed "Diagnosis" label with nothing under it reads as an omission, not
    // as a field that was never filled.
    const html = renderQuickScribeHtml(base({ reportsReviewed: "   ", diagnosis: "" }));
    expect(html).not.toContain("Reports Reviewed");
    expect(html).not.toContain("Diagnosis");
  });

  it("prints Diagnosis after Reports Reviewed and before Medicines — the house Clinical-Notes-then-Rx order", () => {
    const html = renderQuickScribeHtml(base({
      reportsReviewed: "CBC reviewed",
      diagnosis: "Viral fever",
    }));
    const reportsIdx = html.indexOf("Reports Reviewed");
    const diagnosisIdx = html.indexOf(">Diagnosis<");
    const medicinesIdx = html.indexOf(">Medicines<");
    expect(reportsIdx).toBeGreaterThan(-1);
    expect(diagnosisIdx).toBeGreaterThan(reportsIdx);
    expect(medicinesIdx).toBeGreaterThan(diagnosisIdx);
  });

  it("prints Advice after Investigations and before the follow-up box", () => {
    const html = renderQuickScribeHtml(base({
      advice: "Review in a week",
      followUpDate: "2026-11-02",
    }));
    const radiologyIdx = html.indexOf("Radiology Tests");
    const adviceIdx = html.indexOf(">Advice &amp; Instructions<");
    const followUpIdx = html.indexOf("Follow-up:");
    expect(adviceIdx).toBeGreaterThan(radiologyIdx);
    expect(followUpIdx).toBeGreaterThan(adviceIdx);
  });

  it("renders the follow-up date in en-IN order and omits the box when there is none", () => {
    const withDate = renderQuickScribeHtml(base({ followUpDate: "2026-11-02" }));
    expect(withDate).toMatch(/Follow-up:.*02\/11\/2026/);

    for (const d of [undefined, "", "not-a-date"]) {
      const without = renderQuickScribeHtml(base({ followUpDate: d }));
      expect(without).not.toContain("Follow-up:");
    }
  });

  it("escapes all five new fields rather than interpolating them as markup", () => {
    const html = renderQuickScribeHtml(base({
      chiefComplaint: `<i>x</i>`,
      reportsReviewed: `<i>y</i>`,
      diagnosis: `<i>z</i>`,
      advice: `<i>w</i>`,
    }));
    expect(html).not.toContain("<i>x</i>");
    expect(html).not.toContain("<i>y</i>");
    expect(html).not.toContain("<i>z</i>");
    expect(html).not.toContain("<i>w</i>");
  });
});

describe("renderQuickScribeHtml — the .qs-table fix", () => {
  it("puts the qs-table class on <table>, not on individual cells", () => {
    // The class must sit on <table> so the <th>Qty</th> assertion above keeps matching bare —
    // per-cell classes would be the regression that breaks it.
    const html = renderQuickScribeHtml(base());
    expect(html).toContain('<table class="qs-table">');
    expect(html).not.toMatch(/<th class=/);
    expect(html).not.toMatch(/<td class=/);
  });

  it("declares the drug table at 14px via the descendant selector, not the bare element", () => {
    const html = renderQuickScribeHtml(base());
    expect(html).toContain(".qs-table th");
    expect(html).toContain(".qs-table td");
  });
});
