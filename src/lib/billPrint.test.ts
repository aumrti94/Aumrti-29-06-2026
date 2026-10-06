/**
 * billPrint.ts is the ONE itemised bill renderer — every print surface in the app goes through
 * it. No test has ever asserted on its output before this (Phase 10, docs/testing/
 * PHASED_TEST_PLAN.md). Confirmed by direct read: `renderBillHtml`/`renderBillDetailTable`/
 * `amountInWords`/`billPrintTitle` are all pure, DOM-free string functions — testable with plain
 * Vitest, no browser or PDF engine needed, despite never having been unit-tested.
 *
 * Note on scope: this file's own statutory surface is HSN/SAC per line (`showHsn`), the bill
 * title (PROVISIONAL vs FINAL), and the amount-in-words figure — confirmed by direct read that
 * `renderBillHtml` carries NO GSTIN and NO separate CGST/SGST split at all (those live on the
 * dedicated `GSTInvoiceModal.tsx` "Tax Invoice" document, tested separately). This is a
 * patient-facing payment summary, not the GST-compliant tax invoice.
 */
import { describe, it, expect } from "vitest";
import {
  amountInWords,
  billPrintTitle,
  groupLineItems,
  renderBillDetailTable,
  renderBillHtml,
  type BillPrintLineItem,
  type BillPrintInput,
} from "./billPrint";
import type { BillMoney } from "./billMoney";

function money(overrides: Partial<BillMoney> = {}): BillMoney {
  return {
    subtotal: 1000,
    gst: 0,
    grossCharges: 1000,
    discount: 0,
    netCharges: 1000,
    insuranceCovered: 0,
    patientPayable: 1000,
    netAdvance: 0,
    directPaid: 1000,
    totalCredits: 1000,
    balanceDue: 0,
    refundDue: 0,
    settlement: "settled",
    paymentStatus: "paid",
    ...overrides,
  };
}

describe("amountInWords", () => {
  it("renders zero as the word Zero", () => {
    expect(amountInWords(0)).toBe("Zero");
  });

  it("crosses the hundred/thousand/lakh/crore boundaries correctly", () => {
    expect(amountInWords(100)).toBe("One Hundred");
    expect(amountInWords(1000)).toBe("One Thousand");
    expect(amountInWords(100000)).toBe("One Lakh");
    expect(amountInWords(10000000)).toBe("One Crore");
  });

  it("renders a real mixed bill total correctly, not just round numbers", () => {
    expect(amountInWords(123456)).toBe("One Lakh Twenty Three Thousand Four Hundred Fifty Six");
  });

  it("truncates paise — this is a whole-rupee statement, the caller wraps it in 'Rupees ... Only'", () => {
    expect(amountInWords(1500.75)).toBe("One Thousand Five Hundred");
  });
});

describe("billPrintTitle", () => {
  it("is PROVISIONAL BILL for any status short of final — a bill mid-stay must never claim to be final", () => {
    expect(billPrintTitle(null)).toBe("PROVISIONAL BILL");
    expect(billPrintTitle("draft")).toBe("PROVISIONAL BILL");
    expect(billPrintTitle("partially_paid")).toBe("PROVISIONAL BILL");
  });

  it("is FINAL BILL only once genuinely finalised or IRN-locked", () => {
    expect(billPrintTitle("final")).toBe("FINAL BILL");
    expect(billPrintTitle("irn_locked")).toBe("FINAL BILL");
  });
});

describe("groupLineItems", () => {
  it("buckets an unrecognised item_type into Other Charges rather than dropping it — a missing charge is money asked for with no explanation", () => {
    const items: BillPrintLineItem[] = [{ item_type: "some_future_module", total_amount: 250 }];
    const groups = groupLineItems(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: "other", label: "Other Charges", subtotal: 250 });
  });

  it("orders categories fixed (room before pharmacy) regardless of insertion order — two prints of the same bill must be identical", () => {
    const items: BillPrintLineItem[] = [
      { item_type: "pharmacy", total_amount: 100 },
      { item_type: "room_charge", total_amount: 500 },
    ];
    const groups = groupLineItems(items);
    expect(groups.map((g) => g.key)).toEqual(["room", "pharmacy"]);
  });

  it("rounds each category subtotal to the paisa, not left drifting from float addition", () => {
    const items: BillPrintLineItem[] = [
      { item_type: "lab", total_amount: 100.1 },
      { item_type: "lab", total_amount: 200.2 },
    ];
    const groups = groupLineItems(items);
    expect(groups[0].subtotal).toBe(300.3);
  });
});

describe("renderBillDetailTable — HSN/SAC column", () => {
  it("shows the HSN column when at least one line carries a code", () => {
    const groups = groupLineItems([
      { item_type: "pharmacy", description: "Paracetamol", total_amount: 100, hsn_code: "30049099" },
    ]);
    const html = renderBillDetailTable(groups);
    expect(html).toContain("HSN");
    expect(html).toContain("30049099");
  });

  it("omits the HSN column entirely when no line has one — never an empty/misleading column", () => {
    const groups = groupLineItems([
      { item_type: "consultation", description: "OPD Consultation", total_amount: 500 },
    ]);
    const html = renderBillDetailTable(groups);
    expect(html).not.toContain("<th style=\"width:10%\">HSN</th>");
  });
});

describe("renderBillHtml — the full document", () => {
  function baseInput(overrides: Partial<BillPrintInput> = {}): BillPrintInput {
    return {
      billNumber: "BILL-2026-0001",
      billDate: "2026-09-21",
      billStatus: "final",
      patient: { name: "Test Patient", uhid: "ASH0001" },
      lineItems: [{ item_type: "pharmacy", description: "Paracetamol 500mg", total_amount: 112, hsn_code: "30049099" }],
      money: money({ grossCharges: 112, patientPayable: 112, directPaid: 112, totalCredits: 112 }),
      ...overrides,
    };
  }

  it("carries the bill number, patient identity, and the correct FINAL/PROVISIONAL title", () => {
    const html = renderBillHtml(baseInput());
    expect(html).toContain("BILL-2026-0001");
    expect(html).toContain("Test Patient");
    expect(html).toContain("ASH0001");
    expect(html).toContain("FINAL BILL");
  });

  it("a provisional (non-final) bill never claims to be final", () => {
    const html = renderBillHtml(baseInput({ billStatus: "partially_paid" }));
    expect(html).toContain("PROVISIONAL BILL");
    expect(html).not.toContain("FINAL BILL");
  });

  it("the amount-in-words line matches the actual patient payable total, not a stale or rounded figure", () => {
    const html = renderBillHtml(baseInput({ money: money({ patientPayable: 123456, directPaid: 123456, totalCredits: 123456 }) }));
    expect(html).toContain("One Lakh Twenty Three Thousand Four Hundred Fifty Six");
  });

  it("a positive balance due renders in the statutory-adjacent red 'Balance Due' row, never silently dropped", () => {
    const html = renderBillHtml(baseInput({
      money: money({ grossCharges: 1000, patientPayable: 1000, directPaid: 400, totalCredits: 400, balanceDue: 600 }),
    }));
    expect(html).toContain("Balance Due");
    expect(html).toContain("₹600.00");
  });
});
