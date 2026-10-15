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

  it("carries the screening statement it was given", () => {
    const html = renderQuickScribeHtml(base({ screeningNote: "duplicate check ran; no allergy history" }));
    expect(html).toContain("duplicate check ran; no allergy history");
  });

  it("warns that the document is not valid for Schedule X / NDPS drugs", () => {
    expect(renderQuickScribeHtml(base())).toContain("NDPS");
  });

  it("omits the Schedule X and generic-substitution notices when there are no medicines", () => {
    const html = renderQuickScribeHtml(base({ medicines: [] }));
    expect(html).not.toContain("NDPS");
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
