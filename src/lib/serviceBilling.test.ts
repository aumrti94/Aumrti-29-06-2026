import { describe, it, expect, vi, beforeEach } from "vitest";

// generateBillNumber does its own Supabase round trip unrelated to what this test exercises —
// mocked at the import boundary rather than modelled through the shared supabase mock below.
vi.mock("@/hooks/useBillNumber", () => ({
  generateBillNumber: vi.fn().mockResolvedValue("BILL-TEST-0001"),
}));

const fromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    // @/lib/currentUser (an autoChargeService import) registers this at module-load time.
    auth: { onAuthStateChange: vi.fn() },
  },
}));

import { autoChargeService, MODULE_AMBULANCE, MODULE_ED, MODULE_DIALYSIS } from "@/lib/serviceBilling";

/** A `bills` mock covering both query shapes `findOrCreateOpdBill`/`findOrCreateEdBill` issue:
 * the "existing bill" lookup (chained .select/.eq/.in/.order/.limit.maybeSingle, always "not
 * found" here) and the "create new bill" insert (.insert().select().maybeSingle(), the result
 * under test). */
function billsTableMock(insertResult: { data: unknown; error: unknown }) {
  const existingLookup: any = {
    select: () => existingLookup,
    eq: () => existingLookup,
    in: () => existingLookup,
    order: () => existingLookup,
    limit: () => existingLookup,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  return {
    select: () => existingLookup,
    insert: () => ({ select: () => ({ maybeSingle: () => Promise.resolve(insertResult) }) }),
  };
}

describe("autoChargeService — standalone branch bill-insert failure", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("degrades to an unbilled service_charges row instead of throwing (KNOWN-BUG-222's real root cause)", async () => {
    const serviceChargesInsert = vi.fn().mockReturnValue({
      then: (onFulfilled: () => void) => Promise.resolve().then(onFulfilled),
    });

    fromMock.mockImplementation((table: string) => {
      if (table === "bills") {
        return {
          insert: () => ({
            select: () => ({
              // The exact failure this fix targets: the bills insert itself is rejected
              // (a bad bill_type, a constraint violation, anything) — data is null, error is set.
              maybeSingle: () => Promise.resolve({ data: null, error: { message: "simulated bill insert failure" } }),
            }),
          }),
        };
      }
      if (table === "service_charges") {
        return { insert: serviceChargesInsert };
      }
      throw new Error(`serviceBilling.test.ts: unexpected table "${table}" — extend the mock`);
    });

    // unitRate/gstPercent passed explicitly so the rate-lookup helpers (which hit
    // service_master/service_rates) are never reached — this test is scoped to the standalone
    // bill-insert failure path only. No admissionId/encounterId -> standalone branch. No
    // sourceTable/sourceId -> the idempotency guard is skipped, matching every real caller that
    // doesn't pre-check before calling.
    const result = await autoChargeService({
      hospitalId: "hosp-1",
      patientId: "patient-1",
      serviceName: "Ambulance Transfer",
      serviceModule: MODULE_AMBULANCE,
      unitRate: 500,
      gstPercent: 0,
    });

    // The old behaviour: `nb!.id` on a null row threw a TypeError, which every real call site's
    // `.catch(() => {})` swallowed — resolving to undefined from the caller's perspective with
    // zero trace anywhere. The fix: a clean null return, and a real, findable record.
    expect(result).toBeNull();

    expect(serviceChargesInsert).toHaveBeenCalledTimes(1);
    const posted = serviceChargesInsert.mock.calls[0][0];
    expect(posted.billing_status).toBe("unbilled");
    expect(posted.service_module).toBe(MODULE_AMBULANCE);
    expect(posted.total_amount).toBe(500); // the real computed amount, not zeroed out
  });
});

describe("autoChargeService — encounter branch (findOrCreateOpdBill / findOrCreateEdBill)", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  // Unlike the standalone branch, a failed OPD/ED bill has nowhere sensible to degrade to —
  // these functions' only caller (autoChargeService itself) still needs a real billId to
  // attach a line item to. The fix here is a readable thrown Error instead of a raw
  // "Cannot read properties of null" TypeError, not a null-and-degrade.

  it("findOrCreateOpdBill throws a readable error instead of a raw TypeError", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "bills") return billsTableMock({ data: null, error: { message: "simulated OPD bill insert failure" } });
      throw new Error(`unexpected table "${table}"`);
    });

    await expect(
      autoChargeService({
        hospitalId: "hosp-1",
        patientId: "patient-1",
        encounterId: "enc-1",
        serviceName: "Lab Test",
        serviceModule: MODULE_DIALYSIS, // anything but MODULE_ED routes to findOrCreateOpdBill
        unitRate: 200,
        gstPercent: 0,
      }),
    ).rejects.toThrow(/Could not create the OPD bill for encounter enc-1/);
  });

  it("findOrCreateEdBill throws a readable error instead of a raw TypeError", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "bills") return billsTableMock({ data: null, error: { message: "simulated ED bill insert failure" } });
      throw new Error(`unexpected table "${table}"`);
    });

    await expect(
      autoChargeService({
        hospitalId: "hosp-1",
        patientId: "patient-1",
        encounterId: "ed-visit-1",
        serviceName: "ED Charge",
        serviceModule: MODULE_ED,
        unitRate: 300,
        gstPercent: 0,
      }),
    ).rejects.toThrow(/Could not create the ED bill for visit ed-visit-1/);
  });
});
