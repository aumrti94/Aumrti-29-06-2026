/**
 * Phase 9, Part 6 — drives `src/pages/oncology/OncologyPage.tsx` → `DaycareBoardTab.tsx`, the
 * regression subject for KNOWN-BUG-250 (Part 1: the dead dedupe check that could double-bill a
 * chemo cycle under a double-click race).
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { recoverFromModuleLoadError } from "./moduleRecovery";

export class OncologyPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto("/oncology");
    await recoverFromModuleLoadError(this.page);
    await expect(this.page.getByRole("button", { name: "+ New Chemo Order" })).toBeVisible({ timeout: 10_000 });
  }

  /** New Chemo Order dialog — selects the named oncology patient and creates the order. */
  async createChemoOrder(expectedPatientName: string): Promise<void> {
    const { page } = this;
    await page.getByRole("button", { name: "+ New Chemo Order" }).click();
    // The dialog heading shares its text with the trigger button that opened it — role-scoped
    // to disambiguate.
    await expect(page.getByRole("heading", { name: "New Chemo Order" })).toBeVisible();
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: new RegExp(expectedPatientName) }).click();
    await page.getByRole("button", { name: "Create Chemo Order" }).click();
    await expect(page.getByText("Chemo order created successfully", { exact: true })).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Confirms all 5 verification steps in order, scoped to the card for the named patient — the
   * board can show more than one pending order. Each confirm re-renders the card (the step
   * becomes "done" and its own button disappears), so steps are re-queried fresh each time
   * rather than collected once up front.
   *
   * Step 5's own update (`handleVerifyStep`, DaycareBoardTab.tsx) sets `status: "verified"`
   * directly — the card is a DIFFERENT render branch the instant that lands (order.status is no
   * longer "pending_verification"), so the "All Verified — Dispense" button in THIS branch never
   * actually becomes reachable in practice; confirmed live, not assumed. There is no separate
   * manual dispense step to drive — waiting for the "✅ Verified & Dispensed" card is the real
   * completion signal.
   */
  async verifyAllSteps(patientName: string): Promise<void> {
    const { page } = this;
    const card = page.locator(".border-l-amber-500, .border-l-4", { hasText: patientName }).first();
    for (let step = 1; step <= 5; step++) {
      await card.getByRole("button", { name: "✓ Confirm" }).first().click();
      // Each confirm is its own async round trip (update + a full loadData() refetch) before
      // the just-clicked button disappears — waiting on its own toast avoids racing ahead and
      // hitting the SAME (not-yet-updated) button a second time instead of the next step's.
      await expect(page.getByText(`Step ${step} verified`, { exact: true })).toBeVisible({ timeout: 10_000 });
    }
    await expect(page.getByText("✅ Verified & Dispensed")).toBeVisible({ timeout: 10_000 });
  }

  /** Assigns the first available chair and starts the infusion for the named patient's order. */
  async assignChairAndStart(patientName: string): Promise<void> {
    const { page } = this;
    const card = page.locator(".border-l-4", { hasText: patientName }).first();
    await card.getByRole("button", { name: /Assign Chair & Start/ }).click();
    await expect(page.getByText("Assign Chair & Start Infusion")).toBeVisible();
    await page.getByRole("combobox").click();
    await page.getByRole("option").first().click();
    await page.getByRole("button", { name: "▶ Start Infusion" }).click();
    await expect(page.getByText("Infusion started", { exact: true })).toBeVisible({ timeout: 10_000 });
  }

  /** Completes the infusion on whichever chair currently shows the named patient occupying it. */
  async completeInfusionFor(patientName: string): Promise<void> {
    const { page } = this;
    const chairCard = page.locator(".border-blue-400", { hasText: patientName }).first();
    await chairCard.getByRole("button", { name: "✓ Complete" }).click();
    await expect(page.getByText("Infusion completed", { exact: true })).toBeVisible({ timeout: 10_000 });
  }
}
