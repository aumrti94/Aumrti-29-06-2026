/**
 * Post-8B round 2, Part 3 — Home care billing happy path. See ambulance-billing.spec.ts's header
 * for why this exists.
 *
 * A daily-frequency plan starting today auto-schedules today's visit (`generateVisits`) — no
 * separate scheduling step. Completing that visit via the "Complete Visit" sheet is the real
 * billable event (`HomeCareVisitTab.tsx`'s `saveRecord`).
 */
import { test, expect } from "@playwright/test";
import { HomeCarePage } from "../pages/HomeCarePage";
import { HOSPITAL_A, HOSPITAL_B, tenantOf, type TenantKey } from "../fixtures/constants";
import { serviceClient } from "../fixtures/serviceClient";

function homeCarePatientName(tenant: TenantKey): string {
  return `Test Patient HomeCareBilling${tenant.toUpperCase()}1`;
}

test.describe.configure({ mode: "serial" });

test.describe("Home Care — visit-completion billing", () => {
  test.afterAll(async () => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const svc = serviceClient();
    const patientName = homeCarePatientName(tenant);

    const { data: patient } = await svc
      .from("patients").select("id").eq("hospital_id", hospital.id).eq("full_name", patientName).maybeSingle();
    if (!patient) return;

    const { data: plans } = await svc.from("home_care_plans").select("id").eq("patient_id", patient.id);
    if (plans?.length) {
      const planIds = plans.map((p) => p.id);
      await svc.from("home_care_visits").delete().in("plan_id", planIds);
      await svc.from("home_care_plans").delete().in("id", planIds);
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

  test("create a plan, complete today's visit, and a real charge posts", async ({ page }) => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const patientName = homeCarePatientName(tenant);
    const svc = serviceClient();
    const homeCare = new HomeCarePage(page);

    await test.step("seed the patient directly", async () => {
      const { error } = await svc.from("patients").insert({
        hospital_id: hospital.id,
        full_name: patientName,
        uhid: `${hospital.uhidPrefix}HMC${tenant.toUpperCase()}1`,
        phone: tenant === "a" ? "9000000055" : "9000000056",
        is_active: true,
      } as never);
      expect(error).toBeNull();
    });

    await test.step("create the plan via the real UI", async () => {
      await homeCare.open();
      await homeCare.createPlan({ patientQuery: patientName, expectedFullName: patientName });
    });

    await test.step("complete today's auto-scheduled visit", async () => {
      await homeCare.goToTab("Visit Schedule");
      await homeCare.recordTodaysVisit(patientName);
    });

    await test.step("a real bill line item posts for this visit", async () => {
      const { data: patient } = await svc.from("patients").select("id").eq("hospital_id", hospital.id).eq("full_name", patientName).maybeSingle();
      expect(patient).not.toBeNull();

      await expect
        .poll(async () => {
          const { data } = await svc
            .from("bill_line_items")
            .select("id")
            .eq("hospital_id", hospital.id)
            .eq("source_module", "home_care");
          return data?.length ?? 0;
        }, { timeout: 10_000 })
        .toBeGreaterThan(0);

      const { data: visits, error } = await svc
        .from("home_care_visits")
        .select("id, status")
        .eq("hospital_id", hospital.id)
        .eq("patient_id", patient!.id)
        .eq("status", "completed");
      expect(error).toBeNull();
      expect(visits).toHaveLength(1);
    });
  });
});
