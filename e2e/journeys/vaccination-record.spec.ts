/**
 * Vaccination — recording a real dose (Phase 10, docs/testing/PHASED_TEST_PLAN.md), deepening a
 * smoke-only module. Never driven end-to-end before this — confirmed by grep, zero test files
 * reference VaccinationPage/RecordVaccineTab anywhere.
 *
 * Irreversibility: an `administered_at` timestamp on a real dose given cannot be un-administered
 * — the physical vaccine is gone. Unlike Blood Bank/CSSD, this module was found CLEAN while
 * scoping it: `RecordVaccineTab.tsx` already resolves the acting staff member correctly
 * (`auth.getUser()` → `.eq("auth_user_id", ...)`, not the arbitrary-row pattern fixed elsewhere
 * this pass), and `vaccine_master`'s missing `.eq("hospital_id", ...)` filter on the vaccine
 * picker query is RLS-covered — confirmed by reading `20260611000003_fix_vaccine_master_rls_and_
 * schema.sql` directly, which deliberately removed the old global/NULL-hospital_id seed data and
 * enforces `hospital_id = get_user_hospital_id()`. `VaccinationModulePage.tsx` (a second,
 * differently-shaped page under the same directory) is confirmed dead code — never imported by
 * `App.tsx` or anywhere else — the real routed page is `VaccinationPage.tsx`.
 *
 * `vaccination` added to `ENABLED_MODULE_KEYS` (`e2e/fixtures/constants.ts`) — same
 * `GatedTabsTrigger` shape as Blood Bank/CSSD.
 */
import { test, expect } from "@playwright/test";
import { HOSPITAL_A, HOSPITAL_B, tenantOf, staffUserId } from "../fixtures/constants";
import { serviceClient } from "../fixtures/serviceClient";

test.describe("Vaccination — record a dose", () => {
  test("recording a dose writes a correctly-attributed record, clears the due entry, and posts a bill", async ({ page }) => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const patientName = `Test Patient VaccFixture${tenant.toUpperCase()}1`;
    const vaccineCode = `VFX${tenant.toUpperCase()}1`;
    const svc = serviceClient();

    const patientId = `${tenant}0000000-0000-4000-8000-e00000000901`;
    const vaccineId = `${tenant}0000000-0000-4000-8000-e00000000902`;

    const cleanup = async () => {
      await svc.from("bills").delete().eq("hospital_id", hospital.id).eq("patient_id", patientId);
      await svc.from("vaccination_due").delete().eq("hospital_id", hospital.id).eq("patient_id", patientId);
      await svc.from("vaccination_records").delete().eq("hospital_id", hospital.id).eq("patient_id", patientId);
      await svc.from("vaccine_master").delete().eq("id", vaccineId);
      await svc.from("patients").delete().eq("id", patientId);
    };
    await cleanup();

    try {
      await svc.from("patients").insert({
        id: patientId, hospital_id: hospital.id, full_name: patientName,
        uhid: `${hospital.uhidPrefix}VACCFIX1`, phone: "9000000901", is_active: true,
      } as never);
      await svc.from("vaccine_master").insert({
        id: vaccineId, hospital_id: hospital.id, vaccine_code: vaccineCode, vaccine_name: "Test Fixture Vaccine",
        doses: 2, is_active: true,
      } as never);
      await svc.from("vaccination_due").insert({
        hospital_id: hospital.id, patient_id: patientId, vaccine_id: vaccineId,
        dose_number: 1, due_date: new Date().toISOString().split("T")[0], status: "due",
      } as never);

      await page.goto("/vaccination");
      await page.getByRole("tab", { name: /Record Vaccine/ }).click();

      await page.getByPlaceholder(/Search by name or UHID/).fill(patientName.slice(0, 20));
      await page.getByText(new RegExp(patientName)).click();

      await page.getByRole("button", { name: /Select vaccines/ }).click();
      await page.getByPlaceholder("Search vaccines...").fill(vaccineCode);
      await page.getByText("Test Fixture Vaccine").click();
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: /Record 1 Vaccination/ }).click();
      await expect(page.getByText(/1 vaccination recorded/)).toBeVisible();

      await test.step("a real, correctly-attributed vaccination_records row exists", async () => {
        const { data, error } = await svc
          .from("vaccination_records")
          .select("dose_number, administered_by, administered_at")
          .eq("hospital_id", hospital.id)
          .eq("patient_id", patientId)
          .eq("vaccine_id", vaccineId)
          .maybeSingle();
        expect(error).toBeNull();
        expect(data?.dose_number).toBe(1);
        expect(data?.administered_by).toBe(staffUserId(tenant, "hospital_admin"));
        expect(data?.administered_at).toBeTruthy();
      });

      await test.step("the matching vaccination_due entry flips to given — the queue reflects reality", async () => {
        const { data, error } = await svc
          .from("vaccination_due")
          .select("status")
          .eq("hospital_id", hospital.id)
          .eq("patient_id", patientId)
          .eq("vaccine_id", vaccineId)
          .eq("dose_number", 1)
          .maybeSingle();
        expect(error).toBeNull();
        expect(data?.status).toBe("given");
      });

      await test.step("a real bill posts for the vaccination — never a phantom charge", async () => {
        const { data, error } = await svc
          .from("bills")
          .select("balance_due, total_amount")
          .eq("hospital_id", hospital.id)
          .eq("patient_id", patientId)
          .maybeSingle();
        expect(error).toBeNull();
        expect(Number(data?.total_amount)).toBeGreaterThan(0);
      });
    } finally {
      await cleanup();
    }
  });
});
