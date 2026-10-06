/**
 * Post-8B round 2, Part 3 — Chronic care billing (docs/testing/KNOWN_BUGS.md KNOWN-BUG-241/242's
 * "not covered by a dedicated e2e journey" caveat). Drives
 * `src/pages/chronic-disease/ChronicDiseasePage.tsx`.
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { recoverFromModuleLoadError } from "./moduleRecovery";

export class ChronicCarePage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto("/chronic-disease");
    await recoverFromModuleLoadError(this.page);
    await expect(this.page.getByRole("tab", { name: "New Care Plan" })).toBeVisible();
  }

  async createPlan(opts: { patientQuery: string; expectedFullName: string; condition: string }): Promise<void> {
    const { page } = this;
    await page.getByRole("tab", { name: "New Care Plan" }).click();

    await page.getByPlaceholder("Name or UHID...").fill(opts.patientQuery);
    await page.getByPlaceholder("Name or UHID...").press("Enter");
    await page.getByRole("button", { name: new RegExp(opts.expectedFullName) }).first().click();
    await expect(page.getByText(new RegExp(`Selected:\\s*${opts.expectedFullName}`))).toBeVisible();

    await page.getByRole("button", { name: opts.condition, exact: true }).click();

    await page.getByRole("button", { name: "Create Care Plan" }).click();
    // On success the page auto-switches to the Care Plans tab with the new plan selected.
    await expect(page.getByRole("button", { name: "Complete Review" })).toBeVisible({ timeout: 10_000 });
  }

  async completeReview(): Promise<void> {
    await this.page.getByRole("button", { name: "Complete Review" }).click();
  }
}
