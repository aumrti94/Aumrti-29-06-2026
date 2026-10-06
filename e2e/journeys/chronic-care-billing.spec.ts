/**
 * Post-8B round 2, Part 3 — Chronic care billing happy path. See ambulance-billing.spec.ts's
 * header for why this exists: proving the real UI flow for each standalone-branch module
 * produces a real, correct billing row, not re-proving KNOWN-BUG-222's degradation logic (that's
 * `serviceBilling.test.ts`'s job).
 *
 * `completeReview` is the billable event here (not plan creation itself) — see
 * ChronicDiseasePage.tsx's own `completeReview`, which posts to `care_plan_reviews` and charges
 * off that row's id.
 */
import { test, expect } from "@playwright/test";
import { ChronicCarePage } from "../pages/ChronicCarePage";
import { HOSPITAL_A, HOSPITAL_B, tenantOf, type TenantKey } from "../fixtures/constants";
import { serviceClient } from "../fixtures/serviceClient";

function chronicPatientName(tenant: TenantKey): string {
  return `Test Patient ChronicBilling${tenant.toUpperCase()}1`;
}

test.describe.configure({ mode: "serial" });

test.describe("Chronic Care — care plan review billing", () => {
  test.afterAll(async () => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const svc = serviceClient();
    const patientName = chronicPatientName(tenant);

    const { data: patient } = await svc
      .from("patients").select("id").eq("hospital_id", hospital.id).eq("full_name", patientName).maybeSingle();
    if (!patient) return;

    const { data: plans } = await svc.from("care_plans").select("id").eq("patient_id", patient.id);
    if (plans?.length) {
      const planIds = plans.map((p) => p.id);
      await svc.from("care_plan_reviews").delete().in("care_plan_id", planIds);
      await svc.from("care_plan_tasks").delete().in("care_plan_id", planIds);
      await svc.from("care_plans").delete().in("id", planIds);
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

  test("create a care plan, complete its review, and a real charge posts", async ({ page }) => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const patientName = chronicPatientName(tenant);
    const svc = serviceClient();
    const chronic = new ChronicCarePage(page);

    await test.step("seed the patient directly", async () => {
      const { error } = await svc.from("patients").insert({
        hospital_id: hospital.id,
        full_name: patientName,
        uhid: `${hospital.uhidPrefix}CHR${tenant.toUpperCase()}1`,
        phone: tenant === "a" ? "9000000053" : "9000000054",
        is_active: true,
      } as never);
      expect(error).toBeNull();
    });

    await test.step("create the care plan via the real UI", async () => {
      await chronic.open();
      await chronic.createPlan({
        patientQuery: patientName,
        expectedFullName: patientName,
        condition: "Type 2 Diabetes",
      });
    });

    await test.step("complete the review — the real billable event", async () => {
      await chronic.completeReview();
    });

    await test.step("a real bill line item posts for this review", async () => {
      const { data: patient } = await svc.from("patients").select("id").eq("hospital_id", hospital.id).eq("full_name", patientName).maybeSingle();
      expect(patient).not.toBeNull();

      await expect
        .poll(async () => {
          const { data } = await svc
            .from("bill_line_items")
            .select("id")
            .eq("hospital_id", hospital.id)
            .eq("source_module", "chronic_care");
          return data?.length ?? 0;
        }, { timeout: 10_000 })
        .toBeGreaterThan(0);

      const { data: review, error } = await svc
        .from("care_plan_reviews")
        .select("id")
        .eq("hospital_id", hospital.id)
        .eq("patient_id", patient!.id);
      expect(error).toBeNull();
      expect(review).toHaveLength(1);
    });
  });
});
