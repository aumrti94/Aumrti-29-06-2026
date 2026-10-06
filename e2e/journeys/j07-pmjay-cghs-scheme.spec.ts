/**
 * Phase 9, Part 5 (docs/testing/PHASED_TEST_PLAN.md) — J07: PMJAY/CGHS nursing-bundling, proven
 * end-to-end. The rule itself (`src/lib/payerTypes.ts`'s `bundlesNursingIntoRoom()`) is correct
 * and already unit-tested (`payerTypes.test.ts`) — this spec drives the REAL IPD billing sweep
 * (`autoPullAdmissionCharges`, `src/lib/ipdBilling.ts`) for two admissions on two different
 * payer types and asserts the resulting `bill_line_items` rows, not the pure function in
 * isolation.
 *
 * IMPORTANT CORRECTION TO THE ORIGINAL PLAN TEXT: the plan called for "a cash/TPA patient" as
 * the NOT-bundled fork. Reading `BUNDLED_NURSING_PAYER_TYPES` directly shows `"tpa"` is itself
 * IN the bundled set (CGHS/ESI/IRDAI's non-payable-nursing rule applies to any insurer/TPA
 * claim, not just government schemes) — so a TPA patient would ALSO bundle, and using one as
 * the "bills separately" example would have been asserting the wrong thing. `cash` (self-pay,
 * not in the set) is the correct not-bundled fork.
 *
 * Uses a DEDICATED ward with a non-zero `nursing_rate_per_day`, not the shared Tier-0 "Surgical
 * Ward" fixture — that fixture's own nursing rate is unset (0 = "included in room rate" by the
 * column's own default), so neither payer type would ever produce a nursing line at all,
 * proving nothing either way. A fresh ward avoids any risk of mutating shared fixture state
 * other specs (J06, MLC clock) depend on.
 */
import { test, expect } from "@playwright/test";
import { BillingPage } from "../pages/BillingPage";
import { HOSPITAL_A, HOSPITAL_B, tenantOf, staffUserId, type TenantKey } from "../fixtures/constants";
import { serviceClient } from "../fixtures/serviceClient";

function j07WardId(tenant: TenantKey): string {
  return `${tenant}0000000-0000-4000-8000-f00000000001`;
}
function j07BedId(tenant: TenantKey, suffix: string): string {
  return `${tenant}0000000-0000-4000-8000-f0000000010${suffix}`;
}
function j07PatientName(tenant: TenantKey, suffix: string): string {
  return `Test Patient J07${suffix}${tenant.toUpperCase()}1`;
}

const NURSING_RATE_PER_DAY = 200;

test.describe.configure({ mode: "serial" });

test.describe("J07 — PMJAY/CGHS nursing-bundling, proven both ways", () => {
  test.afterAll(async () => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const svc = serviceClient();

    for (const suffix of ["Scheme", "Cash"]) {
      const patientName = j07PatientName(tenant, suffix);
      const { data: patient } = await svc.from("patients").select("id").eq("hospital_id", hospital.id).eq("full_name", patientName).maybeSingle();
      if (!patient) continue;
      const { data: bills } = await svc.from("bills").select("id").eq("hospital_id", hospital.id).eq("patient_id", patient.id);
      if (bills?.length) {
        await svc.from("bill_line_items").delete().in("bill_id", bills.map((b) => b.id));
      }
      await svc.from("bills").delete().eq("hospital_id", hospital.id).eq("patient_id", patient.id);
      await svc.from("admissions").delete().eq("hospital_id", hospital.id).eq("patient_id", patient.id);
      await svc.from("patients").delete().eq("id", patient.id);
    }
    await svc.from("beds").delete().eq("hospital_id", hospital.id).eq("ward_id", j07WardId(tenant));
    await svc.from("wards").delete().eq("id", j07WardId(tenant));
  });

  test("setup — a dedicated ward with a real, non-zero nursing rate", async () => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const svc = serviceClient();

    const { error: wErr } = await svc.from("wards").insert({
      id: j07WardId(tenant), hospital_id: hospital.id, name: "J07 Fixture Ward", type: "general",
      total_beds: 2, rate_per_day: 1500, nursing_rate_per_day: NURSING_RATE_PER_DAY,
    } as never);
    expect(wErr).toBeNull();

    const { error: b1Err } = await svc.from("beds").insert({
      id: j07BedId(tenant, "1"), hospital_id: hospital.id, ward_id: j07WardId(tenant), bed_number: "J07-01",
    } as never);
    expect(b1Err).toBeNull();
    const { error: b2Err } = await svc.from("beds").insert({
      id: j07BedId(tenant, "2"), hospital_id: hospital.id, ward_id: j07WardId(tenant), bed_number: "J07-02",
    } as never);
    expect(b2Err).toBeNull();
  });

  test("Fork 1 — a PMJAY admission bundles nursing into the room charge (no separate line)", async ({ page }) => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const patientName = j07PatientName(tenant, "Scheme");
    const svc = serviceClient();
    const billing = new BillingPage(page);

    let admissionId = "";

    await test.step("seed the patient and a PMJAY-payer admission directly", async () => {
      const { error: pErr } = await svc.from("patients").insert({
        hospital_id: hospital.id, full_name: patientName,
        uhid: `${hospital.uhidPrefix}J07SCHEME${tenant.toUpperCase()}1`,
        phone: tenant === "a" ? "9000000091" : "9000000092", is_active: true,
      } as never);
      expect(pErr).toBeNull();
      const { data: patient } = await svc.from("patients").select("id").eq("hospital_id", hospital.id).eq("full_name", patientName).maybeSingle();
      expect(patient).not.toBeNull();

      const { data: admission, error: aErr } = await svc.from("admissions").insert({
        hospital_id: hospital.id, patient_id: patient!.id,
        admitting_doctor_id: staffUserId(tenant, "doctor"),
        ward_id: j07WardId(tenant), bed_id: j07BedId(tenant, "1"), status: "active",
        payer_type: "pmjay", insurance_type: "government_scheme",
      } as never).select("id").maybeSingle();
      expect(aErr).toBeNull();
      expect(admission).not.toBeNull();
      admissionId = admission!.id;
      await svc.from("beds").update({ status: "occupied" }).eq("id", j07BedId(tenant, "1"));
    });

    await test.step("open the IPD bill and let the automatic room/nursing sweep run", async () => {
      await billing.openIpdBillFor(admissionId);
    });

    await test.step("assert a room charge exists, but NO separate nursing line — bundled per the payer rule", async () => {
      const { data: bill } = await svc.from("bills").select("id").eq("hospital_id", hospital.id).eq("admission_id", admissionId).eq("bill_type", "ipd").maybeSingle();
      expect(bill).not.toBeNull();

      const { data: roomLines, error: roomErr } = await svc
        .from("bill_line_items").select("id, total_amount").eq("bill_id", bill!.id).eq("item_type", "room_charge");
      expect(roomErr).toBeNull();
      expect(roomLines!.length).toBeGreaterThan(0);
      expect(Number(roomLines![0].total_amount)).toBeGreaterThan(0);

      const { data: nursingLines, error: nursingErr } = await svc
        .from("bill_line_items").select("id").eq("bill_id", bill!.id).eq("source_module", "ipd_nursing");
      expect(nursingErr).toBeNull();
      expect(nursingLines ?? []).toHaveLength(0);
    });
  });

  test("Fork 2 — a cash (self-pay) admission on the SAME ward bills nursing separately", async ({ page }) => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const patientName = j07PatientName(tenant, "Cash");
    const svc = serviceClient();
    const billing = new BillingPage(page);

    let admissionId = "";

    await test.step("seed the patient and a cash-payer admission directly, same ward/nursing rate as Fork 1", async () => {
      const { error: pErr } = await svc.from("patients").insert({
        hospital_id: hospital.id, full_name: patientName,
        uhid: `${hospital.uhidPrefix}J07CASH${tenant.toUpperCase()}1`,
        phone: tenant === "a" ? "9000000093" : "9000000094", is_active: true,
      } as never);
      expect(pErr).toBeNull();
      const { data: patient } = await svc.from("patients").select("id").eq("hospital_id", hospital.id).eq("full_name", patientName).maybeSingle();
      expect(patient).not.toBeNull();

      const { data: admission, error: aErr } = await svc.from("admissions").insert({
        hospital_id: hospital.id, patient_id: patient!.id,
        admitting_doctor_id: staffUserId(tenant, "doctor"),
        ward_id: j07WardId(tenant), bed_id: j07BedId(tenant, "2"), status: "active",
        payer_type: "cash", insurance_type: "self_pay",
      } as never).select("id").maybeSingle();
      expect(aErr).toBeNull();
      expect(admission).not.toBeNull();
      admissionId = admission!.id;
      await svc.from("beds").update({ status: "occupied" }).eq("id", j07BedId(tenant, "2"));
    });

    await test.step("open the IPD bill and let the automatic room/nursing sweep run", async () => {
      await billing.openIpdBillFor(admissionId);
    });

    await test.step("assert BOTH a room charge AND a separate nursing line exist — not bundled, same ward/rate as Fork 1", async () => {
      const { data: bill } = await svc.from("bills").select("id").eq("hospital_id", hospital.id).eq("admission_id", admissionId).eq("bill_type", "ipd").maybeSingle();
      expect(bill).not.toBeNull();

      const { data: roomLines } = await svc
        .from("bill_line_items").select("id").eq("bill_id", bill!.id).eq("item_type", "room_charge");
      expect(roomLines!.length).toBeGreaterThan(0);

      const { data: nursingLines, error } = await svc
        .from("bill_line_items").select("id, total_amount, payment_status").eq("bill_id", bill!.id).eq("source_module", "ipd_nursing");
      expect(error).toBeNull();
      expect(nursingLines).toHaveLength(1);
      expect(Number(nursingLines![0].total_amount)).toBe(NURSING_RATE_PER_DAY);
      expect(nursingLines![0].payment_status).toBe("advance_covered");
    });
  });
});
