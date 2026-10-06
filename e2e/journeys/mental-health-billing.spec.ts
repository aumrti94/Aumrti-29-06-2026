/**
 * Post-8B round 2, Part 3 — Mental health billing happy path. See ambulance-billing.spec.ts's
 * header for why this exists.
 *
 * Saving a therapy session (`MHTherapyTab.tsx`'s `addSession`) is the real billable event, not
 * plan creation.
 */
import { test, expect } from "@playwright/test";
import { MentalHealthPage } from "../pages/MentalHealthPage";
import { HOSPITAL_A, HOSPITAL_B, tenantOf, type TenantKey } from "../fixtures/constants";
import { serviceClient } from "../fixtures/serviceClient";

function mentalHealthPatientName(tenant: TenantKey): string {
  return `Test Patient MHBilling${tenant.toUpperCase()}1`;
}

test.describe.configure({ mode: "serial" });

test.describe("Mental Health — therapy session billing", () => {
  test.afterAll(async () => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const svc = serviceClient();
    const patientName = mentalHealthPatientName(tenant);

    const { data: patient } = await svc
      .from("patients").select("id").eq("hospital_id", hospital.id).eq("full_name", patientName).maybeSingle();
    if (!patient) return;

    const { data: plans } = await svc.from("therapy_plans").select("id").eq("patient_id", patient.id);
    if (plans?.length) {
      const planIds = plans.map((p) => p.id);
      await svc.from("therapy_sessions").delete().in("plan_id", planIds);
      await svc.from("therapy_plans").delete().in("id", planIds);
    }
    const { data: bills } = await svc.from("bills").select("id").eq("patient_id", patient.id);
    if (bills?.length) {
      await svc.from("bill_line_items").delete().in("bill_id", bills.map((b) => b.id));
      await svc.from("bill_payments").delete().in("bill_id", bills.map((b) => b.id));
      await svc.from("bills").delete().in("id", bills.map((b) => b.id));
    }
    await svc.from("service_charges").delete().eq("hospital_id", hospital.id).eq("patient_id", patient.id);
    await svc.from("patients").delete().eq("id", patient.id);
  });

  test("create a therapy plan, save a session, and a real charge posts", async ({ page }) => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const patientName = mentalHealthPatientName(tenant);
    const svc = serviceClient();
    const mh = new MentalHealthPage(page);

    await test.step("seed the patient directly", async () => {
      const { error } = await svc.from("patients").insert({
        hospital_id: hospital.id,
        full_name: patientName,
        uhid: `${hospital.uhidPrefix}MH${tenant.toUpperCase()}1`,
        phone: tenant === "a" ? "9000000057" : "9000000058",
        is_active: true,
      } as never);
      expect(error).toBeNull();
    });

    await test.step("select the patient and create a therapy plan via the real UI", async () => {
      await mh.open();
      await mh.selectPatient(patientName, patientName);
      await mh.createTherapyPlan("CBT");
    });

    await test.step("save a session — the real billable event", async () => {
      await mh.addSession("Fixture session notes — Post-8B round 2");
    });

    await test.step("a real bill line item posts for this session", async () => {
      const { data: patient } = await svc.from("patients").select("id").eq("hospital_id", hospital.id).eq("full_name", patientName).maybeSingle();
      expect(patient).not.toBeNull();

      await expect
        .poll(async () => {
          const { data } = await svc
            .from("bill_line_items")
            .select("id")
            .eq("hospital_id", hospital.id)
            .eq("source_module", "mental_health");
          return data?.length ?? 0;
        }, { timeout: 10_000 })
        .toBeGreaterThan(0);

      const { data: sessions, error } = await svc
        .from("therapy_sessions")
        .select("id")
        .eq("hospital_id", hospital.id)
        .eq("patient_id", patient!.id);
      expect(error).toBeNull();
      expect(sessions).toHaveLength(1);
    });
  });
});
