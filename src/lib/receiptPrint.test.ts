/**
 * receiptPrint.ts's `renderReceiptHtml` is billPrint.ts's sibling — the ONE money-receipt
 * renderer, pure and DOM-free, never unit-tested before this (Phase 10, docs/testing/
 * PHASED_TEST_PLAN.md). A receipt acknowledges money received, not an itemised charge — no
 * GST/HSN fields belong here at all (confirmed by direct read; none exist in this file).
 */
import { describe, it, expect } from "vitest";
import { renderReceiptHtml, type ReceiptPrintInput } from "./receiptPrint";

function baseInput(overrides: Partial<ReceiptPrintInput> = {}): ReceiptPrintInput {
  return {
    receiptNumber: "RCT-2026-0001",
    date: "2026-09-21",
    patientName: "Test Patient",
    uhid: "ASH0001",
    amountReceived: 5000,
    ...overrides,
  };
}

describe("renderReceiptHtml", () => {
  it("defaults to the generic RECEIPT title when none is given", () => {
    const html = renderReceiptHtml(baseInput());
    expect(html).toContain("RECEIPT");
  });

  it("uses a specific title (e.g. advance receipt) when given, not the generic default", () => {
    const html = renderReceiptHtml(baseInput({ title: "ADVANCE RECEIPT" }));
    expect(html).toContain("ADVANCE RECEIPT");
  });

  it("the amount-received figure and its amount-in-words line both reflect the real amount, not a stale total", () => {
    const html = renderReceiptHtml(baseInput({ amountReceived: 123456 }));
    expect(html).toContain("₹1,23,456.00");
    expect(html).toContain("One Lakh Twenty Three Thousand Four Hundred Fifty Six");
  });

  it("a real outstanding balance renders in the red balance row — never silently dropped", () => {
    const html = renderReceiptHtml(baseInput({ balance: 1500 }));
    expect(html).toContain("rc-balance");
    expect(html).toContain("₹1,500.00");
  });

  it("zero balance renders no balance row at all — a settled receipt does not imply money is still owed", () => {
    const html = renderReceiptHtml(baseInput({ balance: 0 }));
    expect(html).not.toContain('class="rc-row rc-balance"');
  });

  it("receivedFrom overrides patientName when both are given — the actual payer may not be the patient", () => {
    const html = renderReceiptHtml(baseInput({ patientName: "Test Patient", receivedFrom: "Test Patient's Guardian" }));
    expect(html).toContain("Test Patient's Guardian");
  });

  it("setting amountInWordsPrefix to null hides the words line entirely, as documented", () => {
    const html = renderReceiptHtml(baseInput({ amountInWordsPrefix: null }));
    expect(html).not.toContain('class="rc-words"');
  });

  it("a priced breakup renders its own line items and total, not just the receipt total", () => {
    const html = renderReceiptHtml(baseInput({
      lineItems: [{ description: "Room Charges", rate: 2000, quantity: 2, amount: 4000 }],
      totalCharges: 4000,
    }));
    expect(html).toContain("Room Charges");
    expect(html).toContain("Total Charges");
  });
});
