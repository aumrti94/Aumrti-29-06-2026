/**
 * Phase 9, Part 8 (docs/testing/PHASED_TEST_PLAN.md) — transfer-out discharge, full build.
 * Genuinely new feature, not a bug fix: `discharge_type` already allowed 'transfer' but nothing
 * about the actual transfer (receiving facility, accepting doctor, reason, billing waiver) had
 * ever been captured anywhere before this pass. Reuses the exact billing-waiver mechanism Part 7
 * built for LAMA (`BILLING_WAIVED_DISCHARGE_TYPES`, generalized this same pass) rather than a
 * parallel one.
 *
 * Two forks: a plain transfer (receiving-facility fields captured, billing genuinely waived and
 * acknowledged, columns stamped) and an MLC transfer (the same flow, asserting the transfer
 * summary's on-screen preview carries the MLC banner an ordinary transfer never shows) — proving
 * the banner is conditional on the admission's own `is_mlc` flag, not always-on or always-off.
 */
import { test, expect } from "@playwright/test";
import { IPDWorkspacePage } from "../pages/IPDWorkspacePage";
import { HOSPITAL_A, HOSPITAL_B, tenantOf, staffUserId, type TenantKey } from "../fixtures/constants";
import { serviceClient } from "../fixtures/serviceClient";

function patientName(tenant: TenantKey, suffix: string): string {
  return `Test Patient Transfer${suffix}${tenant.toUpperCase()}1`;
}
function wardId(tenant: TenantKey): string {
  return `${tenant}0000000-0000-4000-8000-f00000000003`;
}
function bedId(tenant: TenantKey, suffix: string): string {
  return `${tenant}0000000-0000-4000-8000-f0000000010${suffix}`;
}

test.describe.configure({ mode: "serial" });

test.describe("Transfer-out discharge — receiving facility captured, billing genuinely waived, MLC banner conditional", () => {
  test.afterAll(async () => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const svc = serviceClient();

    for (const suffix of ["Plain", "Mlc"]) {
      const pName = patientName(tenant, suffix);
      const { data: patient } = await svc.from("patients").select("id").eq("hospital_id", hospital.id).eq("full_name", pName).maybeSingle();
      if (!patient) continue;
      const { data: bills } = await svc.from("bills").select("id").eq("hospital_id", hospital.id).eq("patient_id", patient.id);
      if (bills?.length) await svc.from("bill_line_items").delete().in("bill_id", bills.map((b) => b.id));
      await svc.from("bills").delete().eq("hospital_id", hospital.id).eq("patient_id", patient.id);
      const { data: admissions } = await svc.from("admissions").select("id").eq("hospital_id", hospital.id).eq("patient_id", patient.id);
      const admissionIds = (admissions ?? []).map((a) => a.id);
      if (admissionIds.length) {
        await svc.from("mlc_police_notifications").delete().eq("source_table", "admissions").in("source_id", admissionIds);
        await svc.from("mlc_cases").delete().in("admission_id", admissionIds);
      }
      await svc.from("admissions").delete().eq("hospital_id", hospital.id).eq("patient_id", patient.id);
      await svc.from("patients").delete().eq("id", patient.id);
    }
    await svc.from("beds").delete().eq("ward_id", wardId(tenant));
    await svc.from("wards").delete().eq("id", wardId(tenant));
  });

  test("setup — a dedicated ward/beds for this spec", async () => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const svc = serviceClient();

    const { error: wErr } = await svc.from("wards").insert({
      id: wardId(tenant), hospital_id: hospital.id, name: "Transfer Fixture Ward", type: "general", rate_per_day: 1500,
    } as never);
    expect(wErr).toBeNull();
    for (const suffix of ["1", "2"]) {
      const { error: bErr } = await svc.from("beds").insert({
        id: bedId(tenant, suffix), hospital_id: hospital.id, ward_id: wardId(tenant), bed_number: `TRF-0${suffix}`,
      } as never);
      expect(bErr).toBeNull();
    }
  });

  test("Fork 1 — plain transfer: receiving facility captured, billing waived and acknowledged, no MLC banner", async ({ page }) => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const patName = patientName(tenant, "Plain");
    const svc = serviceClient();
    const workspace = new IPDWorkspacePage(page);
    const unsignedReason = `Transferred for higher-level ICU care (${tenant})`;

    let admissionId = "";

    await test.step("seed the patient and a real active admission, not MLC", async () => {
      const { error: pErr } = await svc.from("patients").insert({
        hospital_id: hospital.id, full_name: patName,
        uhid: `${hospital.uhidPrefix}TRFPLAIN${tenant.toUpperCase()}1`,
        phone: tenant === "a" ? "9000000101" : "9000000102", is_active: true,
      } as never);
      expect(pErr).toBeNull();
      const { data: patient } = await svc.from("patients").select("id").eq("hospital_id", hospital.id).eq("full_name", patName).maybeSingle();
      expect(patient).not.toBeNull();

      const { data: admission, error: aErr } = await svc.from("admissions").insert({
        hospital_id: hospital.id, patient_id: patient!.id,
        admitting_doctor_id: staffUserId(tenant, "doctor"),
        ward_id: wardId(tenant), bed_id: bedId(tenant, "1"), status: "active", is_mlc: false,
      } as never).select("id").maybeSingle();
      expect(aErr).toBeNull();
      expect(admission).not.toBeNull();
      admissionId = admission!.id;
      await svc.from("beds").update({ status: "occupied" }).eq("id", bedId(tenant, "1"));
    });

    await test.step("open the encounter, initiate discharge, clear medical, select Transfer and fill the receiving-facility form", async () => {
      await workspace.open();
      await workspace.openEncounter("TRF-01", patName);
      await workspace.initiateDischarge();
      await workspace.markMedicalClearance();
      await workspace.selectDischargeType("transfer");
      await workspace.fillTransferDetails({
        facilityName: "St. Xavier Multispecialty Hospital",
        facilityAddress: "12 MG Road, Bengaluru",
        facilityContact: "080-40001234",
        acceptingDoctor: "Dr. Kavya Rao",
        reason: "Requires ICU-level ventilator support unavailable at this facility",
      });
    });

    await test.step("assert the transfer fields genuinely persisted", async () => {
      const { data } = await svc
        .from("admissions")
        .select("transfer_receiving_facility_name, transfer_receiving_facility_address, transfer_receiving_facility_contact, transfer_accepting_doctor_name, transfer_reason")
        .eq("id", admissionId)
        .maybeSingle();
      expect(data?.transfer_receiving_facility_name).toBe("St. Xavier Multispecialty Hospital");
      expect(data?.transfer_accepting_doctor_name).toBe("Dr. Kavya Rao");
      expect(data?.transfer_reason).toContain("ICU-level");
    });

    await test.step("Pharmacist step is reachable — billing was waived by selecting Transfer", async () => {
      await workspace.clearPharmacy();
    });

    await test.step("Summary step: transfer details preview visible, no MLC banner, acknowledge the waiver and discharge without signature", async () => {
      await expect(page.getByText("St. Xavier Multispecialty Hospital")).toBeVisible();
      await expect(page.getByText("MEDICO-LEGAL CASE")).not.toBeVisible();
      await workspace.acknowledgeBillingWaiver();
      await workspace.writeDischargeSummary(
        `Patient stable for transfer. Vitals within normal limits at time of transfer. — ${tenant}.`,
      );
      await workspace.dischargeWithoutSignature(unsignedReason);
    });

    await test.step("assert the real admissions row: discharged, transfer, billing ack stamped, billing never silently cleared", async () => {
      const { data, error } = await svc
        .from("admissions")
        .select("status, discharge_type, billing_cleared, transfer_billing_ack_by, transfer_billing_ack_at, discharge_unsigned_reason")
        .eq("id", admissionId)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data!.status).toBe("discharged");
      expect(data!.discharge_type).toBe("transfer");
      expect(data!.billing_cleared).toBe(false);
      expect(data!.transfer_billing_ack_by).not.toBeNull();
      expect(data!.transfer_billing_ack_at).not.toBeNull();
      expect(data!.discharge_unsigned_reason).toBe(unsignedReason);
    });
  });

  test("Fork 2 — MLC transfer: the same flow, but the transfer summary preview carries the MLC banner", async ({ page }) => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const patName = patientName(tenant, "Mlc");
    const svc = serviceClient();
    const workspace = new IPDWorkspacePage(page);

    let admissionId = "";

    await test.step("seed the patient and a real active MLC admission", async () => {
      const { error: pErr } = await svc.from("patients").insert({
        hospital_id: hospital.id, full_name: patName,
        uhid: `${hospital.uhidPrefix}TRFMLC${tenant.toUpperCase()}1`,
        phone: tenant === "a" ? "9000000103" : "9000000104", is_active: true,
      } as never);
      expect(pErr).toBeNull();
      const { data: patient } = await svc.from("patients").select("id").eq("hospital_id", hospital.id).eq("full_name", patName).maybeSingle();
      expect(patient).not.toBeNull();

      const { data: admission, error: aErr } = await svc.from("admissions").insert({
        hospital_id: hospital.id, patient_id: patient!.id,
        admitting_doctor_id: staffUserId(tenant, "doctor"),
        ward_id: wardId(tenant), bed_id: bedId(tenant, "2"), status: "active",
        is_mlc: true, police_informed_at: new Date().toISOString(),
      } as never).select("id").maybeSingle();
      expect(aErr).toBeNull();
      expect(admission).not.toBeNull();
      admissionId = admission!.id;
      await svc.from("beds").update({ status: "occupied" }).eq("id", bedId(tenant, "2"));

      // IPDWorkspace.tsx blocks discharge entirely on an undocumented MLC case (a real,
      // separate gate this spec is not testing) — confirmed live, not assumed: it checks for
      // an mlc_cases row linked by admission_id, independent of the is_mlc flag alone.
      const { error: mlcErr } = await svc.from("mlc_cases").insert({
        hospital_id: hospital.id, patient_id: patient!.id, admission_id: admissionId,
        mlc_number: `MLC-TRF-TEST-${tenant.toUpperCase()}-1`, case_type: "road_accident",
      } as never);
      expect(mlcErr).toBeNull();
    });

    await test.step("run the same transfer flow up to the summary step", async () => {
      await workspace.open();
      await workspace.openEncounter("TRF-02", patName);
      await workspace.initiateDischarge();
      await workspace.markMedicalClearance();
      await workspace.selectDischargeType("transfer");
      await workspace.fillTransferDetails({
        facilityName: "City Trauma Centre",
        reason: "Requires neurosurgical intervention",
      });
      await workspace.clearPharmacy();
    });

    await test.step("negative fork: the MLC banner IS visible here, unlike Fork 1's non-MLC admission", async () => {
      await expect(page.getByText("MEDICO-LEGAL CASE")).toBeVisible();
      await expect(page.getByText("City Trauma Centre")).toBeVisible();
    });

    await test.step("cleanup: acknowledge and discharge so the bed frees for afterAll's own cleanup", async () => {
      await workspace.acknowledgeBillingWaiver();
      await workspace.writeDischargeSummary(`MLC patient transferred for specialist care — ${tenant}.`);
      await workspace.dischargeWithoutSignature(`MLC transfer — ${tenant}`);

      const { data } = await svc.from("admissions").select("status, is_mlc, discharge_type").eq("id", admissionId).maybeSingle();
      expect(data?.status).toBe("discharged");
      expect(data?.is_mlc).toBe(true);
      expect(data?.discharge_type).toBe("transfer");
    });
  });
});
