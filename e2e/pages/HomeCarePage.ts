/**
 * Post-8B round 2, Part 3 — Home care billing (docs/testing/KNOWN_BUGS.md KNOWN-BUG-241/242's
 * "not covered by a dedicated e2e journey" caveat). Drives `src/pages/home-care/HomeCarePage.tsx`
 * → `HomeCareActivePlansTab.tsx` / `HomeCareVisitTab.tsx`.
 *
 * Creating a plan with `frequency: "daily"` and `start_date` = today auto-generates today's
 * visit via `generateVisits()` — no separate "schedule a visit" step exists or is needed.
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { recoverFromModuleLoadError } from "./moduleRecovery";

export class HomeCarePage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto("/home-care");
    await recoverFromModuleLoadError(this.page);
    await expect(this.page.getByRole("button", { name: "Active Plans" })).toBeVisible();
  }

  async goToTab(label: "Active Plans" | "Visit Schedule" | "Tele-Monitoring"): Promise<void> {
    await this.page.getByRole("button", { name: label }).click();
  }

  async createPlan(opts: { patientQuery: string; expectedFullName: string }): Promise<void> {
    const { page } = this;
    await page.getByRole("button", { name: "New Plan" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "New Home Care Plan" })).toBeVisible();

    await dialog.getByPlaceholder("Search patient name…").fill(opts.patientQuery);
    await dialog.getByRole("button", { name: new RegExp(opts.expectedFullName) }).first().click();

    // Plan Type (post_discharge), Frequency (daily) and Start Date (today) are all already
    // correct defaults — daily + today is what makes generateVisits() schedule today's visit.
    await dialog.getByRole("button", { name: "Create Plan" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  }

  /**
   * Opens the "Record Visit" sheet for today's visit row matching `patientName`. Scoped to the
   * visit card's own class combination (`p-3 border rounded-lg bg-card`) — a bare `div` filtered
   * by text matches ancestor containers all the way up to the page layout, which also holds the
   * sidebar's "Medical Records" nav button (a `{ name: "Record" }` substring match on it too).
   */
  async recordTodaysVisit(patientName: string): Promise<void> {
    const { page } = this;
    const row = page.locator("div.p-3.border.rounded-lg.bg-card", { hasText: patientName }).first();
    await row.getByRole("button", { name: "Record", exact: true }).click();
    await expect(page.getByRole("heading", { name: new RegExp(`Record Visit.*${patientName}`) })).toBeVisible();
    await page.getByRole("button", { name: "Complete Visit" }).click();
    await expect(page.getByText("Visit recorded").first()).toBeVisible({ timeout: 10_000 });
  }
}
