/**
 * Post-8B round 2, Part 3 — Dietetics billing happy path. See ambulance-billing.spec.ts's
 * header for the round's general intent; this module is the exception in that round, since it
 * exercises a genuinely different fix (KNOWN-BUG-242, migration 20261106000039) rather than the
 * standalone-branch degradation logic: `nutritional_screenings.billing_status` flipping to
 * `"billed"` with a real `bill_id` populated is the specific thing that fix made possible for
 * the first time — this is the regression test for it, driven through the real UI end to end.
 *
 * Requires an active admission (`nutritional_screenings.admission_id` is NOT NULL), so this
 * admits via the already-generic `IPDAdmissionPage` (confirmed reusable — not tied to J06's
 * fixture) before ever touching Dietetics.
 */
import { test, expect } from "@playwright/test";
import { IPDAdmissionPage } from "../pages/IPDAdmissionPage";
import { DietPage } from "../pages/DietPage";
import { HOSPITAL_A, HOSPITAL_B, tenantOf, type TenantKey } from "../fixtures/constants";
import { serviceClient } from "../fixtures/serviceClient";

function dieteticsPatientName(tenant: TenantKey): string {
  return `Test Patient DietBilling${tenant.toUpperCase()}1`;
}

test.describe.configure({ mode: "serial" });

test.describe("Dietetics — NRS-2002 screening billing", () => {
  test.afterAll(async () => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const svc = serviceClient();
    const patientName = dieteticsPatientName(tenant);

    const { data: patient } = await svc
      .from("patients").select("id").eq("hospital_id", hospital.id).eq("full_name", patientName).maybeSingle();
    if (!patient) return;

    await svc.from("nutritional_screenings").delete().eq("hospital_id", hospital.id).eq("patient_id", patient.id);
    const { data: bills } = await svc.from("bills").select("id").eq("patient_id", patient.id);
    if (bills?.length) {
      await svc.from("bill_line_items").delete().in("bill_id", bills.map((b) => b.id));
      await svc.from("bill_payments").delete().in("bill_id", bills.map((b) => b.id));
      await svc.from("bills").delete().in("id", bills.map((b) => b.id));
    }
    await svc.from("service_charges").delete().eq("hospital_id", hospital.id).eq("patient_id", patient.id);
    await svc.from("admissions").delete().eq("hospital_id", hospital.id).eq("patient_id", patient.id);
    await svc.from("beds").update({ status: "available" }).eq("hospital_id", hospital.id).eq("bed_number", "SW-02");
    await svc.from("patients").delete().eq("id", patient.id);
  });

  test("admit, complete NRS-2002 screening, and a real charge posts", async ({ page }) => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const patientName = dieteticsPatientName(tenant);
    const uhid = `${hospital.uhidPrefix}DIET${tenant.toUpperCase()}1`;
    const svc = serviceClient();
    const admission = new IPDAdmissionPage(page);
    const diet = new DietPage(page);

    await test.step("seed the patient directly", async () => {
      const { error } = await svc.from("patients").insert({
        hospital_id: hospital.id,
        full_name: patientName,
        uhid,
        phone: tenant === "a" ? "9000000059" : "9000000060",
        is_active: true,
      } as never);
      expect(error).toBeNull();
    });

    await test.step("admit the patient via the real UI (SW-02, unoccupied by any other spec's long-lived fixture)", async () => {
      await admission.open();
      await admission.clickAvailableBed("SW-02");
      await admission.searchAndSelectPatient(uhid, patientName);
      await admission.goToStep2();
      await admission.fillAdmissionDetails({
        doctor: `doctor ${tenant.toUpperCase()}`,
        diagnosis: "Dietetics billing fixture — malnutrition workup",
        insuranceType: "Other",
        payerType: "cash",
        bedAlreadyPreselected: true,
      });
      await admission.goToStep3();
      await admission.goToStep4();
      await admission.confirmAdmission(patientName);
      await admission.closeSuccessDialog();
    });

    await test.step("complete the NRS-2002 screening via the real UI", async () => {
      await diet.open();
      await diet.completeScreening(patientName);
    });

    await test.step("the screening flips to billed with a real bill_id, and a bill line item posts", async () => {
      const { data: patient } = await svc.from("patients").select("id").eq("hospital_id", hospital.id).eq("full_name", patientName).maybeSingle();
      expect(patient).not.toBeNull();

      await expect
        .poll(async () => {
          const { data } = await svc
            .from("nutritional_screenings")
            .select("billing_status, bill_id")
            .eq("hospital_id", hospital.id)
            .eq("patient_id", patient!.id)
            .maybeSingle();
          return data?.billing_status ?? null;
        }, { timeout: 10_000 })
        .toBe("billed");

      const { data: screening, error } = await svc
        .from("nutritional_screenings")
        .select("bill_id")
        .eq("hospital_id", hospital.id)
        .eq("patient_id", patient!.id)
        .maybeSingle();
      expect(error).toBeNull();
      expect(screening?.bill_id).toBeTruthy();

      const { data: lineItems } = await svc
        .from("bill_line_items")
        .select("id")
        .eq("hospital_id", hospital.id)
        .eq("source_module", "dietetics");
      expect(lineItems?.length ?? 0).toBeGreaterThan(0);
    });
  });
});
