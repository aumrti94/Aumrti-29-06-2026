/**
 * Phase 9, Part 7 (docs/testing/PHASED_TEST_PLAN.md) — LAMA/DAMA discharge.
 *
 * Driving this live surfaced a real, previously-undiscovered gap, not just a missing test: the
 * discharge stepper's `getStepDone` (IPDOverviewTab.tsx) had no LAMA awareness at all — the
 * "Billing Executive" step was `done` purely on `billingCleared`, so an unbilled LAMA discharge
 * got stuck forever on "Finalise Billing →", never reaching the summary step where the LAMA
 * waiver checkbox lives. The Discharge Type selector itself only rendered INSIDE that
 * unreachable summary step — a genuine catch-22, since LAMA's whole purpose is to unblock
 * billing. Fixed this pass: `getStepDone` now treats `dischargeType === "lama"` as satisfying
 * the Billing step, and the Discharge Type selector moved to render for the whole discharge
 * (so staff can declare LAMA WHILE still stuck on Billing, which is what actually unblocks it).
 * This spec is the regression test for both halves of that fix.
 */
import { test, expect } from "@playwright/test";
import { IPDWorkspacePage } from "../pages/IPDWorkspacePage";
import { HOSPITAL_A, HOSPITAL_B, tenantOf, staffUserId, type TenantKey } from "../fixtures/constants";
import { serviceClient } from "../fixtures/serviceClient";

function patientName(tenant: TenantKey): string {
  return `Test Patient LamaDischarge${tenant.toUpperCase()}1`;
}
function wardId(tenant: TenantKey): string {
  return `${tenant}0000000-0000-4000-8000-f00000000002`;
}
function bedId(tenant: TenantKey): string {
  return `${tenant}0000000-0000-4000-8000-f00000000102`;
}

test.describe.configure({ mode: "serial" });

test.describe("LAMA discharge — billing genuinely waived, not silently cleared", () => {
  test.afterAll(async () => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const svc = serviceClient();

    const { data: patient } = await svc.from("patients").select("id").eq("hospital_id", hospital.id).eq("full_name", patientName(tenant)).maybeSingle();
    if (patient) {
      const { data: bills } = await svc.from("bills").select("id").eq("hospital_id", hospital.id).eq("patient_id", patient.id);
      if (bills?.length) await svc.from("bill_line_items").delete().in("bill_id", bills.map((b) => b.id));
      await svc.from("bills").delete().eq("hospital_id", hospital.id).eq("patient_id", patient.id);
      await svc.from("admissions").delete().eq("hospital_id", hospital.id).eq("patient_id", patient.id);
      await svc.from("patients").delete().eq("id", patient.id);
    }
    await svc.from("beds").delete().eq("id", bedId(tenant));
    await svc.from("wards").delete().eq("id", wardId(tenant));
  });

  test("LAMA discharge with billing not cleared: gate waived, acknowledgement required and stamped, bill stays genuinely unpaid", async ({ page }) => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const patName = patientName(tenant);
    const svc = serviceClient();
    const workspace = new IPDWorkspacePage(page);
    const unsignedReason = `LAMA discharge — patient refused further treatment (${tenant})`;

    let admissionId = "";

    await test.step("seed a dedicated ward/bed, the patient, and a real active admission — billing untouched, genuinely uncleared", async () => {
      const { error: wErr } = await svc.from("wards").insert({
        id: wardId(tenant), hospital_id: hospital.id, name: "LAMA Fixture Ward", type: "general", rate_per_day: 1500,
      } as never);
      expect(wErr).toBeNull();
      const { error: bErr } = await svc.from("beds").insert({
        id: bedId(tenant), hospital_id: hospital.id, ward_id: wardId(tenant), bed_number: "LAMA-01",
      } as never);
      expect(bErr).toBeNull();

      const { error: pErr } = await svc.from("patients").insert({
        hospital_id: hospital.id, full_name: patName,
        uhid: `${hospital.uhidPrefix}LAMADIS${tenant.toUpperCase()}1`,
        phone: tenant === "a" ? "9000000099" : "9000000100", is_active: true,
      } as never);
      expect(pErr).toBeNull();
      const { data: patient } = await svc.from("patients").select("id").eq("hospital_id", hospital.id).eq("full_name", patName).maybeSingle();
      expect(patient).not.toBeNull();

      const { data: admission, error: aErr } = await svc.from("admissions").insert({
        hospital_id: hospital.id, patient_id: patient!.id,
        admitting_doctor_id: staffUserId(tenant, "doctor"),
        ward_id: wardId(tenant), bed_id: bedId(tenant), status: "active",
      } as never).select("id").maybeSingle();
      expect(aErr).toBeNull();
      expect(admission).not.toBeNull();
      admissionId = admission!.id;
      await svc.from("beds").update({ status: "occupied" }).eq("id", bedId(tenant));
    });

    await test.step("open the encounter, initiate discharge, clear medical — billing is stuck on 'Finalise Billing →' until LAMA is selected", async () => {
      await workspace.open();
      await workspace.openEncounter("LAMA-01", patName);
      await workspace.initiateDischarge();
      await workspace.markMedicalClearance();
    });

    await test.step("select LAMA — this is what actually unblocks the Billing step (the fix under test)", async () => {
      await workspace.selectDischargeType("lama");
      // The selector's onChange is now genuinely awaited (a separate fix this pass — it was
      // previously a bare, un-awaited Supabase call that silently never sent the request at
      // all, confirmed live via a network listener showing zero requests fired) — still polled
      // rather than read once immediately, since there is no visible UI signal the write landed.
      await expect
        .poll(async () => {
          const { data } = await svc.from("admissions").select("discharge_type").eq("id", admissionId).maybeSingle();
          return data?.discharge_type ?? null;
        }, { timeout: 5_000 })
        .toBe("lama");
    });

    await test.step("Pharmacist step is now reachable — clear it", async () => {
      await workspace.clearPharmacy();
    });

    await test.step("Summary step: no 'billing not cleared' block for LAMA; acknowledge the waiver and discharge without signature", async () => {
      await expect(page.getByText("Billing not cleared. Clear billing before discharge summary.")).not.toBeVisible();
      await workspace.acknowledgeBillingWaiver();
      await workspace.writeDischargeSummary(
        `Patient discharged Against Medical Advice. Family counselled on risks; refused further inpatient treatment. — ${tenant}.`,
      );
      await workspace.dischargeWithoutSignature(unsignedReason);
    });

    await test.step("assert the real admissions row: discharged, LAMA, acknowledgement genuinely stamped, billing NEVER silently marked cleared", async () => {
      const { data, error } = await svc
        .from("admissions")
        .select("status, discharged_at, discharge_type, discharge_unsigned_reason, billing_cleared, medical_cleared, pharmacy_cleared, lama_billing_ack_by, lama_billing_ack_at")
        .eq("id", admissionId)
        .maybeSingle();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.status).toBe("discharged");
      expect(data!.discharged_at).not.toBeNull();
      expect(data!.discharge_type).toBe("lama");
      expect(data!.discharge_unsigned_reason).toBe(unsignedReason);
      expect(data!.medical_cleared).toBe(true);
      expect(data!.pharmacy_cleared).toBe(true);
      // The real assertion this whole spec exists for: the gate was WAIVED, not silently
      // satisfied. A discharge that quietly flips billing_cleared to true for a LAMA patient
      // would be a different, worse bug — the money still owed would vanish from every report
      // that filters on this flag.
      expect(data!.billing_cleared).toBe(false);
      expect(data!.lama_billing_ack_by).not.toBeNull();
      expect(data!.lama_billing_ack_at).not.toBeNull();
    });
  });
});
