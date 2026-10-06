import { describe, it, expect, vi, beforeEach } from "vitest";

const fromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import { findOrCreateAdmissionBill } from "@/lib/admissionBill";

describe("findOrCreateAdmissionBill — insert failure", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("throws a readable Error instead of a raw TypeError when the bill insert fails", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "bills") {
        // No existing admission bill (findAdmissionBill's own lookup), then a failed insert.
        const noExisting: any = {
          select: () => noExisting,
          eq: () => noExisting,
          in: () => noExisting,
          or: () => noExisting,
          order: () => noExisting,
          limit: () => noExisting,
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        };
        return {
          select: () => noExisting,
          insert: () => ({
            select: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: null, error: { message: "simulated admission bill insert failure" } }),
            }),
          }),
        };
      }
      if (table === "admissions") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { admission_type: "ipd" }, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table "${table}"`);
    });

    await expect(
      findOrCreateAdmissionBill("hosp-1", "patient-1", "admission-1"),
    ).rejects.toThrow(/Could not create the admission bill for admission admission-1/);
  });
});
