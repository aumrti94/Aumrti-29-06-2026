/**
 * Phase 9, Part 6 — drives `src/components/dialysis/MachineBoardTab.tsx`. No id/htmlFor pairing
 * on any field in this screen (confirmed by reading the JSX directly) — every fill locates via
 * the label-and-sibling-input pattern already established in InsurancePage.ts, not getByLabel.
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { recoverFromModuleLoadError } from "./moduleRecovery";

export class DialysisPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto("/dialysis");
    await recoverFromModuleLoadError(this.page);
  }

  /**
   * Full session-start flow for one machine: search+select the patient, fill the four
   * required vitals, and submit. `startSession` (MachineBoardTab.tsx) creates the
   * `dialysis_sessions` row and flips the machine to `in_use` — billing does not happen here
   * (Part 1's fix), only at completion.
   */
  async startSessionOn(machineName: string, patientQuery: string, expectedPatientName: string): Promise<void> {
    const { page } = this;
    // Machine card — the plain div grid MachineBoardTab renders each machine into, filtered by
    // its own visible name so this scales past one machine on the board.
    const card = page.locator(".border-border.rounded-lg", { hasText: machineName });
    await card.getByRole("button", { name: "Start Session" }).click();
    await expect(page.getByText(`Start Session — ${machineName}`)).toBeVisible();

    await page.getByPlaceholder("Search by name or UHID...").fill(patientQuery);
    await page.getByRole("button", { name: new RegExp(expectedPatientName) }).first().click();

    await page.locator('div:has(> label:text-is("Weight (kg) *"))').locator("input").fill("70");
    await page.locator('div:has(> label:text-is("BP Sys *"))').locator("input").fill("130");
    await page.locator('div:has(> label:text-is("BP Dia *"))').locator("input").fill("85");
    await page.locator('div:has(> label:text-is("Pulse *"))').locator("input").fill("78");

    await page.getByRole("button", { name: "Start Session" }).click();
    // exact: true — a screen-reader live-region announcement duplicates this text prefixed
    // "Notification ", the same strict-mode collision every other toast assertion in this
    // suite already works around.
    await expect(page.getByText(`Session started on ${machineName}`, { exact: true })).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Full session-end flow: opens "End Session" for the named machine and completes it with no
   * post-vitals filled — every field in this dialog is optional (confirmed live: "Complete
   * Session" carries no `disabled` condition at all), and this is what actually triggers
   * `createDialysisBill`.
   */
  async completeSessionOn(machineName: string): Promise<void> {
    const { page } = this;
    const card = page.locator(".border-border.rounded-lg", { hasText: machineName });
    await card.getByRole("button", { name: "End Session" }).click();
    await expect(page.getByText(`End Session — ${machineName}`)).toBeVisible();
    await page.getByRole("button", { name: "Complete Session" }).click();
    // Two distinct success toasts depending on Kt/V (never computable here — no urea values
    // entered) — "Session completed" with no Kt/V suffix is the one that actually fires.
    await expect(page.getByText("Session completed", { exact: true })).toBeVisible({ timeout: 10_000 });
  }
}
