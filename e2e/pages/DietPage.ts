/**
 * Post-8B round 2, Part 3 — Dietetics billing. Unlike the other four modules in this round,
 * this one exercises a genuinely different fix (KNOWN-BUG-242, `sourceTable`/`sourceId` on the
 * admission branch), not the standalone-branch degradation logic. Drives
 * `src/pages/dietetics/DietPage.tsx`'s Screening tab.
 *
 * Requires an active admission — `nutritional_screenings.admission_id` is NOT NULL — so the
 * spec admits the patient via the already-generic `IPDAdmissionPage` first.
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { recoverFromModuleLoadError } from "./moduleRecovery";

export class DietPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto("/dietetics");
    await recoverFromModuleLoadError(this.page);
    await expect(this.page.getByText("Patients Needing Screening")).toBeVisible();
  }

  /**
   * Selects the patient from the "Patients Needing Screening" list and saves the NRS-2002 form
   * at its default (0/0 — low risk) score, which is all this happy path needs: the billable
   * event is the screening being SAVED, not any particular risk level.
   */
  async completeScreening(patientName: string): Promise<void> {
    const { page } = this;
    await page.getByRole("button", { name: new RegExp(patientName) }).first().click();
    await expect(page.getByRole("heading", { name: "NRS-2002 Screening" })).toBeVisible();
    await page.getByRole("button", { name: "Save Screening" }).click();
    await expect(page.getByText(/Screening saved/)).toBeVisible({ timeout: 10_000 });
  }
}
