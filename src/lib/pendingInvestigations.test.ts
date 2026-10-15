import { describe, it, expect } from "vitest";
import { estimateLabRevenue, type LabPanelPricing } from "@/lib/pendingInvestigations";

// The two panels from the reported case, with their real member tests and fees.
const PREOP: LabPanelPricing = {
  groupName: "Pre-Operative Screening",
  fee: 1400,
  testNames: ["Anti-HCV", "HIV I & II", "VDRL / RPR", "HBsAg"],
};
const ELECTROLYTES: LabPanelPricing = {
  groupName: "Serum Electrolytes",
  fee: 400,
  testNames: ["Serum Chloride", "Serum Potassium", "Serum Bicarbonate", "Serum Sodium"],
};
const PANELS = [PREOP, ELECTROLYTES];

// What each analyte costs on its own — summing these is what produced the wrong figure.
const FEES: Record<string, number> = {
  "anti-hcv": 600,
  "hiv i & ii": 600,
  "vdrl / rpr": 400,
  "hbsag": 400,
  "serum chloride": 200,
  "serum potassium": 200,
  "serum bicarbonate": 150,
  "serum sodium": 200,
  "crp (c-reactive protein)": 450,
};

const estimate = (names: string[]) => estimateLabRevenue(names, FEES, PANELS);
const allMembers = [...PREOP.testNames, ...ELECTROLYTES.testNames];

describe("estimateLabRevenue", () => {
  it("prices two fully-prescribed panels at their panel fees, not the sum of their parts", () => {
    // The reported bug: the worklist showed ₹2,750 against a counter that collected ₹1,800.
    expect(allMembers.reduce((s, n) => s + FEES[n.toLowerCase()], 0)).toBe(2750);
    expect(estimate(allMembers)).toBe(1800);
  });

  it("prices one panel at its fee and loose tests individually alongside it", () => {
    expect(estimate([...ELECTROLYTES.testNames, "CRP (C-Reactive Protein)"])).toBe(400 + 450);
  });

  it("prices a PARTIAL panel as individual tests, with no panel fee", () => {
    // Three of four electrolytes is not the bundle, and the counter will not collapse it.
    expect(estimate(["Serum Chloride", "Serum Potassium", "Serum Sodium"])).toBe(600);
  });

  it("prices a bare panel name at the panel fee", () => {
    // Prescriptions saved before panels were expanded still carry the bundle name.
    expect(estimate(["Serum Electrolytes"])).toBe(400);
  });

  it("does not double-charge a panel named alongside its own members", () => {
    expect(estimate(["Serum Electrolytes", ...ELECTROLYTES.testNames])).toBe(400);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(estimate(allMembers.map((n) => `  ${n.toUpperCase()}  `))).toBe(1800);
  });

  it("ignores a panel whose members are all deactivated", () => {
    // An empty member list satisfies every() vacuously — it must not bill its fee on nothing.
    const empty: LabPanelPricing = { groupName: "Ghost Panel", fee: 999, testNames: [] };
    expect(estimateLabRevenue(["Serum Chloride"], FEES, [empty])).toBe(200);
  });

  it("counts an unconfigured test as zero rather than failing", () => {
    expect(estimate(["Some Test Nobody Priced"])).toBe(0);
  });

  it("returns zero for nothing pending", () => {
    expect(estimate([])).toBe(0);
  });
});
