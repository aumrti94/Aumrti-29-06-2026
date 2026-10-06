/**
 * Partograph — Phase 10 (docs/testing/PHASED_TEST_PLAN.md), deepening a smoke-only module.
 *
 * Previously covered only indirectly: `anc-delivery-flow.spec.ts` inserts a `partograph_entries`
 * row via the service-role client purely as setup fixture, to prove `DeliveryRecordPage`'s
 * read-only panel displays it. The Partograph UI itself — data entry, and the alert/action-line
 * classification that is its entire clinical purpose — had never been driven. Ranked ahead of
 * higher-volume modules (Blood Bank, Emergency) per this project's own doctrine: risk-rank by
 * irreversibility, not patient volume — a labour-progress reading becomes part of the permanent
 * delivery record with no undo, and a missed action-line crossing is exactly the silent failure
 * this WHO chart exists to prevent.
 *
 * Reaches the standalone `/specialty/partograph` route directly (`PartographPage.tsx`) — no OT/
 * IPD admission setup required, confirmed by reading the page: `admissionId` is optional and the
 * only precondition is a FEMALE patient in the dropdown (`.eq("gender", "female")`). The shared
 * Tier-0 fixture patients carry no `gender` value at all (confirmed: no `gender` field anywhere
 * in `e2e/fixtures/constants.ts`), so this spec seeds one dedicated, disposable patient rather
 * than mutating shared fixture data other specs may depend on. Role gating borrows `/ipd`'s list;
 * the default Playwright storageState (`hospital_admin`) hits `BYPASS_ROLES` in `routeRoles.ts`
 * and reaches the route regardless — no new fixture entitlement needed.
 */
import { test, expect } from "@playwright/test";
import { HOSPITAL_A, HOSPITAL_B, tenantOf } from "../fixtures/constants";
import { serviceClient } from "../fixtures/serviceClient";

test.describe("Partograph", () => {
  test("a labour-progress reading past the action line raises the alert; a normal reading does not", async ({ page }) => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const svc = serviceClient();

    const patientId = `${tenant}0000000-0000-4000-8000-e00000000701`;
    await svc.from("patients").insert({
      id: patientId, hospital_id: hospital.id, full_name: "Test Patient PartographFixture",
      uhid: `${hospital.uhidPrefix}PARTOGRAPH1`, gender: "female", phone: "9000000701", is_active: true,
    } as never);

    try {
      await page.goto("/specialty/partograph");
      await page.getByRole("combobox").first().selectOption(patientId);

      const field = (label: string) => page.getByText(label, { exact: true }).locator("..").locator("input, select");

      await test.step("a normal-range reading (before the action line window even opens) raises no alert", async () => {
        await field("Hour").fill("1");
        await field("Dilation (cm)").fill("5");
        await page.getByRole("button", { name: /Add Entry/ }).click();
        await expect(page.getByText(/5cm/)).toBeVisible();
        await expect(page.getByText(/ACTION LINE/)).not.toBeVisible();
      });

      await test.step("a reading at or past the action line raises the real alert, not just a cosmetic one", async () => {
        // actionLine(8) = 4 + (8-4) = 8 — a dilation of 9cm at hour 8 is past it.
        await field("Hour").fill("8");
        await field("Dilation (cm)").fill("9");
        await page.getByRole("button", { name: /Add Entry/ }).click();
        await expect(page.getByText(/at or past ACTION LINE at hour 8/)).toBeVisible();
      });

      await test.step("both readings are real, findable rows — not just UI state", async () => {
        const { data, error } = await svc
          .from("partograph_entries")
          .select("time_hour, cervical_dilation")
          .eq("hospital_id", hospital.id)
          .eq("patient_id", patientId)
          .order("time_hour");
        expect(error).toBeNull();
        expect(data).toHaveLength(2);
        expect(data![0]).toMatchObject({ time_hour: 1, cervical_dilation: 5 });
        expect(data![1]).toMatchObject({ time_hour: 8, cervical_dilation: 9 });
      });
    } finally {
      await svc.from("partograph_entries").delete().eq("hospital_id", hospital.id).eq("patient_id", patientId);
      await svc.from("patients").delete().eq("id", patientId);
    }
  });
});
