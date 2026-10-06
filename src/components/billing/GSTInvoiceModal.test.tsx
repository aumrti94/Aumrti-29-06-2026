/**
 * GSTInvoiceModal is the actual GST-compliant "Tax Invoice" document — GSTIN, per-line HSN/SAC,
 * and CGST/SGST shown as two separate columns, never a combined "GST" figure. Never unit-tested
 * before this (Phase 10, docs/testing/PHASED_TEST_PLAN.md). Not a pure function like
 * billPrint.ts/receiptPrint.ts — it's a live component with `useState`/`supabase` — so this
 * mounts it with React Testing Library rather than asserting on a returned string. `supabase` is
 * imported but only ever called inside event handlers (IRN generation, WhatsApp send), never
 * during render, so a minimal mock is enough for a render-and-assert test — no handler is
 * exercised here.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import GSTInvoiceModal from "./GSTInvoiceModal";
import type { LineItem } from "./BillEditor";
import type { BillRecord } from "@/pages/billing/BillingPage";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    from: vi.fn(() => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn() })),
  },
}));
vi.mock("@/lib/whatsapp-send", () => ({ sendWhatsApp: vi.fn() }));

function lineItem(overrides: Partial<LineItem> = {}): LineItem {
  return {
    id: "li-1",
    description: "Consultation Fee",
    item_type: "consultation",
    quantity: 1,
    unit_rate: 500,
    discount_percent: 0,
    gst_percent: 18,
    taxable_amount: 500,
    gst_amount: 90,
    total_amount: 590,
    source_module: null,
    service_id: null,
    hsn_code: null,
    ...overrides,
  };
}

function bill(overrides: Partial<BillRecord> = {}): BillRecord {
  return {
    id: "bill-1",
    bill_number: "BILL-2026-0001",
    patient_id: "patient-1",
    patient_name: "Test Patient",
    uhid: "ASH0001",
    encounter_id: null,
    admission_id: null,
    bill_type: "opd",
    bill_date: "2026-09-21",
    bill_status: "final",
    subtotal: 500,
    discount_percent: 0,
    discount_amount: 0,
    gst_amount: 90,
    total_amount: 590,
    advance_received: 0,
    insurance_amount: 0,
    patient_payable: 590,
    paid_amount: 590,
    balance_due: 0,
    payment_status: "paid",
    notes: null,
    irn: null,
    irn_generated_at: null,
    created_at: "2026-09-21T00:00:00Z",
    ...overrides,
  } as BillRecord;
}

describe("GSTInvoiceModal", () => {
  it("renders the seller's real GSTIN, not a placeholder, when configured", () => {
    render(
      <GSTInvoiceModal
        bill={bill()}
        lineItems={[lineItem()]}
        hospitalName="Ashwini General Hospital"
        hospitalGstin="29ABCDE1234F1Z5"
        hospitalAddress="123 MG Road, Bengaluru"
        irn=""
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/GSTIN: 29ABCDE1234F1Z5/)).toBeInTheDocument();
  });

  it("says 'Not configured' rather than silently omitting the GSTIN line when the hospital has none set", () => {
    render(
      <GSTInvoiceModal
        bill={bill()}
        lineItems={[lineItem()]}
        hospitalName="Ashwini General Hospital"
        hospitalGstin=""
        hospitalAddress="123 MG Road, Bengaluru"
        irn=""
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/GSTIN: Not configured/)).toBeInTheDocument();
  });

  it("a line item with its own HSN code shows that code, not the fallback", () => {
    render(
      <GSTInvoiceModal
        bill={bill()}
        lineItems={[lineItem({ hsn_code: "998311" })]}
        hospitalName="Ashwini General Hospital"
        hospitalGstin="29ABCDE1234F1Z5"
        hospitalAddress="123 MG Road, Bengaluru"
        irn=""
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("998311")).toBeInTheDocument();
    expect(screen.queryByText("999311")).not.toBeInTheDocument();
  });

  it("a line item with NO HSN code falls back to 999311 — confirmed this only fires on a genuine gap, not always", () => {
    render(
      <GSTInvoiceModal
        bill={bill()}
        lineItems={[lineItem({ hsn_code: null })]}
        hospitalName="Ashwini General Hospital"
        hospitalGstin="29ABCDE1234F1Z5"
        hospitalAddress="123 MG Road, Bengaluru"
        irn=""
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("999311")).toBeInTheDocument();
  });

  it("CGST and SGST are split as two separate, equal halves of the total GST — never one combined figure", () => {
    // taxable 500 @ 18% = 90 GST total → 45 CGST + 45 SGST.
    render(
      <GSTInvoiceModal
        bill={bill()}
        lineItems={[lineItem({ quantity: 1, unit_rate: 500, discount_percent: 0, gst_percent: 18 })]}
        hospitalName="Ashwini General Hospital"
        hospitalGstin="29ABCDE1234F1Z5"
        hospitalAddress="123 MG Road, Bengaluru"
        irn=""
        onClose={() => {}}
      />,
    );
    // Two separate 9% columns (half of 18%) on the one line, never a combined 18% figure. The
    // ₹45.00 figure appears twice for the line (CGST amount, SGST amount) and twice again in
    // the footer total row (with one line item, the column totals equal the line's own split).
    expect(screen.getAllByText("9%")).toHaveLength(2);
    expect(screen.getAllByText("45.00")).toHaveLength(4);
  });

  it("an item with gst_percent 0 is excluded from the taxable table entirely — an exempt service is not taxed", () => {
    render(
      <GSTInvoiceModal
        bill={bill()}
        lineItems={[lineItem({ description: "Exempt Consultation", gst_percent: 0 })]}
        hospitalName="Ashwini General Hospital"
        hospitalGstin="29ABCDE1234F1Z5"
        hospitalAddress="123 MG Road, Bengaluru"
        irn=""
        onClose={() => {}}
      />,
    );
    expect(screen.queryByText("Exempt Consultation")).not.toBeInTheDocument();
  });
});
