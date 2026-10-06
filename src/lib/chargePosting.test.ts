import { describe, it, expect, vi, beforeEach } from "vitest";

// Same mocking convention as serviceBilling.test.ts — mocked at the import boundary since these
// do their own unrelated Supabase round trips this test isn't exercising.
vi.mock("@/hooks/useBillNumber", () => ({
  generateBillNumber: vi.fn().mockResolvedValue("OPD-TEST-0001"),
}));
vi.mock("@/lib/billTotals", () => ({
  recalculateBillTotalsSafe: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/serviceBilling", () => ({
  recordServiceCharge: vi.fn().mockResolvedValue(undefined),
}));

const fromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

import { postCharge } from "@/lib/chargePosting";

describe("postCharge — idempotency guard (Phase 9, Part 4: duplicate charge-post blocked)", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("posting the exact same charge twice inserts exactly one bill_line_items row, not two", async () => {
    // Models the real table's state across both calls: nothing exists yet when the first
    // postCharge call runs its idempotency SELECT; the insert that follows makes it exist,
    // so the second call's SELECT finds it and returns early instead of inserting again —
    // the exact mechanism a retried request or a double-click relies on.
    let existingRow: { id: string; bill_id: string; total_amount: number } | null = null;

    const lineItemInsert = vi.fn().mockReturnValue({
      select: () => ({
        maybeSingle: () => {
          existingRow = { id: "li-1", bill_id: "bill-1", total_amount: 500 };
          return Promise.resolve({ data: { id: "li-1" }, error: null });
        },
      }),
    });
    const billsInsert = vi.fn().mockReturnValue({
      select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "bill-1" }, error: null }) }),
    });

    fromMock.mockImplementation((table: string) => {
      if (table === "bill_line_items") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: existingRow, error: null }),
              }),
            }),
          }),
          insert: lineItemInsert,
        };
      }
      if (table === "bills") {
        return { insert: billsInsert };
      }
      throw new Error(`chargePosting.test.ts: unexpected table "${table}" — extend the mock`);
    });

    // unitPrice/gstPercent passed explicitly so the service_master rate lookup is never
    // reached — this test is scoped to the idempotency guard only. No admissionId ->
    // standalone/OPD branch, matching a real radiology-order charge posted at order time.
    const opts = {
      hospitalId: "hosp-1",
      patientId: "patient-1",
      description: "Radiology: Chest X-ray",
      itemType: "radiology",
      unitPrice: 500,
      gstPercent: 0,
      sourceModule: "radiology" as const,
      sourceId: "order-1",
    };

    const first = await postCharge(opts);
    const second = await postCharge(opts);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    // The real defect class this guards against — KNOWN-BUG-249 (dialysis) and KNOWN-BUG-250
    // (oncology) both shipped because a SECOND, non-matching dedupe key let a duplicate charge
    // through; this asserts the shared guard itself holds when the same key really is reused.
    expect(lineItemInsert).toHaveBeenCalledTimes(1);
    expect(second.billItemId).toBe(first.billItemId);
    expect(second.billId).toBe(first.billId);
  });

  it("two DIFFERENT dedupe keys for the same order are never treated as duplicates", async () => {
    const seen = new Set<string>();
    const lineItemInsert = vi.fn().mockImplementation((row: { source_dedupe_key: string }) => {
      seen.add(row.source_dedupe_key);
      return {
        select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: `li-${seen.size}` }, error: null }) }),
      };
    });
    const billsInsert = vi.fn().mockReturnValue({
      select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "bill-1" }, error: null }) }),
    });

    fromMock.mockImplementation((table: string) => {
      if (table === "bill_line_items") {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
          }),
          insert: lineItemInsert,
        };
      }
      if (table === "bills") return { insert: billsInsert };
      throw new Error(`chargePosting.test.ts: unexpected table "${table}" — extend the mock`);
    });

    const base = {
      hospitalId: "hosp-1",
      patientId: "patient-1",
      description: "Dialysis session",
      itemType: "dialysis",
      unitPrice: 2000,
      gstPercent: 0,
      sourceModule: "dialysis" as const,
      sourceId: "session-1",
    };

    // This is deliberately the shape of KNOWN-BUG-249's bug, not its fix: a start-side key
    // and an end-side key for the SAME session that never collide. The guard cannot and should
    // not catch this — different keys are, by definition, different charges to postCharge. The
    // fix was making the two call sites agree on one key, not something this function can enforce.
    await postCharge({ ...base, dedupeKey: "dialysis:session:2026-09-19:patient-1:machine-1" });
    await postCharge({ ...base, dedupeKey: "dialysis:session:session-1" });

    expect(lineItemInsert).toHaveBeenCalledTimes(2);
  });
});
