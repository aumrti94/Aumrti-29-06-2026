/**
 * Post-8B round 2, Part 3 — Mental health billing (docs/testing/KNOWN_BUGS.md KNOWN-BUG-241/242's
 * "not covered by a dedicated e2e journey" caveat). Drives
 * `src/pages/mental-health/MentalHealthPage.tsx` → `MHTherapyTab.tsx`.
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { recoverFromModuleLoadError } from "./moduleRecovery";

export class MentalHealthPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto("/mental-health");
    await recoverFromModuleLoadError(this.page);
    await expect(this.page.getByPlaceholder("Search patient...")).toBeVisible();
  }

  async selectPatient(query: string, expectedFullName: string): Promise<void> {
    const { page } = this;
    await page.getByPlaceholder("Search patient...").fill(query);
    await page.getByPlaceholder("Search patient...").press("Enter");
    await page.getByRole("button", { name: new RegExp(expectedFullName) }).first().click();
    await page.getByRole("tab", { name: "Therapy Plans" }).click();
  }

  async createTherapyPlan(therapyType: string): Promise<void> {
    const { page } = this;
    await page.getByRole("button", { name: "Create Plan" }).click();
    await page.getByRole("button", { name: therapyType, exact: true }).click();
    // Start Date and Planned Sessions keep their defaults (today, 10).
    await page.getByRole("button", { name: "Create Plan" }).click();
    await expect(page.getByRole("button", { name: "+ Add Session" })).toBeVisible({ timeout: 10_000 });
  }

  /**
   * MHTherapyTab's `<Label>`s have no `htmlFor` pairing with their inputs (confirmed by reading
   * the source directly) — "Session Notes" is the first textarea in the session form, so that's
   * what this keys off, matching this suite's established fallback for unpaired labels.
   */
  async addSession(notes: string): Promise<void> {
    const { page } = this;
    await page.getByRole("button", { name: "+ Add Session" }).click();
    await page.locator("textarea").first().fill(notes);
    await page.getByRole("button", { name: "Save Session" }).click();
    await expect(page.getByText("Session recorded")).toBeVisible({ timeout: 10_000 });
  }
}
