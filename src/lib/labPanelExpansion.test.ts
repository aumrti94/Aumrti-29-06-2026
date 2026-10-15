import { describe, it, expect } from "vitest";
import { buildOrderCatalogue, type CatalogueEntry } from "@/lib/orderCatalogue";
import { expandLabPanels, type LabPanel } from "@/lib/labPanelExpansion";
import type { LabOrder } from "@/components/opd/ConsultationWorkspace";

const THYROID_MEMBERS = ["TSH", "T3 (Total)", "T4 (Total)"];

const entries: CatalogueEntry[] = [
  { id: "panel-thyroid", name: "Thyroid Profile", kind: "lab_group" },
  { id: "panel-empty", name: "Pre-Operative Screening", kind: "lab_group" },
  ...THYROID_MEMBERS.map((name) => ({ id: `t:${name}`, name, kind: "lab" as const })),
  { id: "t:CRP", name: "CRP (C-Reactive Protein)", kind: "lab" },
];

const catalogue = buildOrderCatalogue(entries);

const panels = new Map<string, LabPanel>([
  ["panel-thyroid", { id: "panel-thyroid", group_name: "Thyroid Profile", testNames: THYROID_MEMBERS }],
  ["panel-empty", { id: "panel-empty", group_name: "Pre-Operative Screening", testNames: [] }],
]);

const order = (test_name: string, extra: Partial<LabOrder> = {}): LabOrder => ({
  test_name, urgency: "routine", clinical_indication: "", ...extra,
});

const run = (orders: LabOrder[]) => expandLabPanels(orders, catalogue, panels);
const names = (orders: readonly LabOrder[]) => orders.map((l) => l.test_name);

describe("expandLabPanels", () => {
  it("replaces a prescribed panel with its member tests", () => {
    const { labOrders } = run([order("Thyroid Profile")]);
    expect(names(labOrders)).toEqual(THYROID_MEMBERS);
    expect(labOrders.every((l) => l.expanded_from === "Thyroid Profile")).toBe(true);
    expect(labOrders.map((l) => l.catalogue_id)).toEqual(THYROID_MEMBERS.map((n) => `t:${n}`));
  });

  it("expands a panel named with a noise word, recording the doctor's wording", () => {
    const { labOrders } = run([order("thyroid profile test")]);
    expect(names(labOrders)).toEqual(THYROID_MEMBERS);
    expect(labOrders[0].matched_from).toBe("thyroid profile test");
  });

  it("is idempotent — a second pass changes nothing and returns the same reference", () => {
    // This runs in an effect that re-fires on every change to the list. If f(f(x)) !== f(x)
    // the consultation screen loops.
    const once = run([order("Thyroid Profile"), order("CRP (C-Reactive Protein)")]).labOrders;
    const twice = run(once).labOrders;
    expect(twice).toBe(once);
  });

  it("leaves a list with no panels untouched, by reference", () => {
    const input = [order("CRP (C-Reactive Protein)")];
    expect(run(input).labOrders).toBe(input);
  });

  it("carries urgency and clinical indication onto every member", () => {
    const { labOrders } = run([order("Thyroid Profile", { urgency: "stat", clinical_indication: "hypothyroid" })]);
    expect(labOrders.every((l) => l.urgency === "stat")).toBe(true);
    expect(labOrders.every((l) => l.clinical_indication === "hypothyroid")).toBe(true);
  });

  it("expands a panel named twice only once", () => {
    const { labOrders } = run([order("Thyroid Profile"), order("TFT")]);
    expect(names(labOrders)).toEqual(THYROID_MEMBERS);
  });

  it("does not duplicate a member already prescribed standalone, and leaves that line alone", () => {
    const { labOrders } = run([order("TSH"), order("Thyroid Profile")]);
    expect(names(labOrders)).toEqual(["TSH", "T3 (Total)", "T4 (Total)"]);
    // The standalone line keeps no panel tag, so undoing the panel cannot remove it — the
    // doctor asked for it separately.
    expect(labOrders[0].expanded_from).toBeUndefined();
  });

  it("leaves a panel with no member rows as a single line", () => {
    // Expanding it to nothing would silently delete an investigation the doctor asked for.
    const input = [order("Pre-Operative Screening")];
    expect(run(input).labOrders).toBe(input);
  });

  it("omits a member this hospital no longer offers, and reports it", () => {
    const partial = new Map<string, LabPanel>([
      ["panel-thyroid", { id: "panel-thyroid", group_name: "Thyroid Profile", testNames: [...THYROID_MEMBERS, "Free T4"] }],
    ]);
    const { labOrders, omittedByPanel } = expandLabPanels([order("Thyroid Profile")], catalogue, partial);
    expect(names(labOrders)).toEqual(THYROID_MEMBERS);
    expect(omittedByPanel.get("Thyroid Profile")).toEqual(["Free T4"]);
  });

  it("keeps the panel line when every member is unavailable", () => {
    const dead = new Map<string, LabPanel>([
      ["panel-thyroid", { id: "panel-thyroid", group_name: "Thyroid Profile", testNames: ["Free T3", "Free T4"] }],
    ]);
    const input = [order("Thyroid Profile")];
    expect(expandLabPanels(input, catalogue, dead).labOrders).toBe(input);
  });

  it("never touches a line the doctor pinned with keep_as_typed", () => {
    const input = [order("Thyroid Profile", { keep_as_typed: true })];
    expect(run(input).labOrders).toBe(input);
  });

  it("never re-expands a line that is already a member", () => {
    const input = [order("Thyroid Profile", { expanded_from: "Something Else" })];
    expect(run(input).labOrders).toBe(input);
  });

  it("returns the input untouched when the catalogue has not loaded", () => {
    const input = [order("Thyroid Profile")];
    expect(expandLabPanels(input, buildOrderCatalogue([]), panels).labOrders).toBe(input);
  });
});
