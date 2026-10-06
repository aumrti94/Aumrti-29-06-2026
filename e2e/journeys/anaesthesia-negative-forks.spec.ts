/**
 * Anaesthesia EMR — negative forks (Phase 10, docs/testing/PHASED_TEST_PLAN.md).
 *
 * `AnaesthesiaSheet.tsx`'s intraoperative Drug Log had ZERO drug-safety/allergy checking before
 * this pass — confirmed by direct read: `addDrug()` pushed straight to local state with no call
 * to `checkDrugSafety` at all, unlike its two real siblings (`RxOrdersTab`, `IPDMedicationsTab`).
 * A direct CLAUDE.md violation ("drug interaction and allergy checks must be real ... never
 * skipped, including in demos") on arguably the single most drug-safety-critical administration
 * point in the hospital — anaesthesia agents go straight into the patient. Fixed this pass: the
 * same `checkDrugSafety` + `DrugSafetyAlertModal` pattern already used by prescribing/IPD
 * medications, reading `patients.allergies` for the selected patient. This is the regression test.
 *
 * Reaches the standalone `/specialty/anaesthesia` route directly (`AnaesthesiaPage.tsx`) rather
 * than driving a full OT case — confirmed by reading the page that `admissionId` is optional and
 * the only precondition is picking a patient from a plain dropdown, no OT/IPD setup needed. Role
 * gating on this route borrows `/ot`'s list (`doctor`/`nurse`/`super_admin`), and the default
 * Playwright storageState session (`hospital_admin`) hits `BYPASS_ROLES` in `routeRoles.ts` and
 * reaches every route regardless — no separate sign-in or new fixture entitlement needed.
 *
 * Hospital A's and hospital B's allergy patients carry DIFFERENT documented allergies
 * (Penicillin vs Sulphonamides — confirmed live, matching `pharmacy-spine.spec.ts`'s own
 * established per-tenant drug mapping, reused here rather than re-deriving it): a first version
 * of this spec hardcoded "Penicillin V 250mg" for both tenants and hospital B's patient added it
 * with no conflict at all, since Sulphonamides is a different allergen entirely.
 */
import { test, expect } from "@playwright/test";
import { HOSPITAL_A, HOSPITAL_B, tenantOf, allergyPatient, type TenantKey } from "../fixtures/constants";
import { serviceClient } from "../fixtures/serviceClient";

function contraindicatedDrugFor(tenant: TenantKey): string {
  const allergy = allergyPatient(tenant).allergy;
  if (allergy === "Penicillin") return "Penicillin V 250mg";
  if (allergy === "Sulphonamides") return "Sulphonamide 500mg";
  throw new Error(`anaesthesia-negative-forks.spec.ts has no contraindicated drug mapped for allergy "${allergy}" (tenant ${tenant})`);
}

test.describe("Anaesthesia EMR — negative forks", () => {
  test.afterAll(async () => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const patient = allergyPatient(tenant);
    const svc = serviceClient();
    await svc.from("anaesthesia_records").delete().eq("hospital_id", hospital.id).eq("patient_id", patient.id);
    await svc.from("clinical_alerts").delete().eq("hospital_id", hospital.id).eq("alert_type", "drug_override");
  });

  test("a documented allergy conflict blocks the drug from the intraoperative log unless explicitly overridden", async ({ page }) => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const patient = allergyPatient(tenant);
    const drugName = contraindicatedDrugFor(tenant);

    await page.goto("/specialty/anaesthesia");
    await page.getByRole("combobox").first().selectOption(patient.id);

    await test.step("adding a directly-contraindicated drug is blocked by default", async () => {
      const drugRow = page.getByPlaceholder("Drug name").locator("../..");
      await page.getByPlaceholder("Drug name").fill(drugName);
      await page.getByPlaceholder("Dose (mg)").fill("250");
      await drugRow.getByRole("button", { name: /\+ Add|Checking/ }).click();

      await expect(page.getByText("CONTRAINDICATION DETECTED")).toBeVisible();
      await page.getByRole("button", { name: new RegExp(`Remove ${drugName} — Do Not Add`) }).click();

      // The actual regression assertion: the drug never reached the log.
      await expect(page.getByText(new RegExp(`${drugName} — 250 — IV`))).not.toBeVisible();
    });

    await test.step("a documented, acknowledged override adds the drug AND logs a critical clinical alert", async () => {
      const drugRow = page.getByPlaceholder("Drug name").locator("../..");
      await page.getByPlaceholder("Drug name").fill(drugName);
      await page.getByPlaceholder("Dose (mg)").fill("250");
      await drugRow.getByRole("button", { name: /\+ Add|Checking/ }).click();
      await expect(page.getByText("CONTRAINDICATION DETECTED")).toBeVisible();

      await page.getByRole("button", { name: "Override with clinical justification..." }).click();
      await page.getByPlaceholder("Clinical justification for overriding this alert...").fill(
        "Prior tolerance confirmed with allergist — proceeding under direct consultant supervision."
      );
      await page.getByLabel(/I confirm I am aware of the risk/).check();
      await page.getByRole("button", { name: "Override and Add Drug" }).click();

      // The drug now reaches the real intraoperative log.
      await expect(page.getByText(new RegExp(`${drugName} — 250 — IV`))).toBeVisible();
    });

    await test.step("the override is a real, findable clinical_alerts row — not just a UI dismissal", async () => {
      const svc = serviceClient();
      const { data, error } = await svc
        .from("clinical_alerts")
        .select("severity, alert_message")
        .eq("hospital_id", hospital.id)
        .eq("alert_type", "drug_override");
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].severity).toBe("critical");
      expect(data![0].alert_message).toContain(drugName);
    });
  });
});
