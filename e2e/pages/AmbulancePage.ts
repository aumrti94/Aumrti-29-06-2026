/**
 * Post-8B round 2, Part 3 — Ambulance billing (docs/testing/KNOWN_BUGS.md KNOWN-BUG-241/242's
 * "not covered by a dedicated e2e journey" caveat). Drives `src/pages/ambulance/AmbulancePage.tsx`
 * → `src/components/ambulance/DispatchTab.tsx`.
 *
 * The one genuine wrinkle in this module: the "New Dispatch" dialog has no patient picker at
 * all (confirmed by reading DispatchTab.tsx directly — `patient_id` is not a field anywhere in
 * `form`). Billing only fires in `moveDispatch` when a card is dragged to the "Completed" column
 * AND the row already has a `patient_id`. There is no UI path to set it — a genuine gap in the
 * feature, not a test shortcut — so the spec patches it onto the row via the service client
 * between creating the dispatch and dragging its card.
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { recoverFromModuleLoadError } from "./moduleRecovery";

export class AmbulancePage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto("/ambulance");
    await recoverFromModuleLoadError(this.page);
    await expect(this.page.getByRole("button", { name: "New Dispatch" })).toBeVisible();
  }

  async createDispatch(opts: { pickupLocation: string; complaint: string; destination?: string }): Promise<void> {
    const { page } = this;
    await page.getByRole("button", { name: "New Dispatch" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "New Dispatch" })).toBeVisible();

    await dialog.getByPlaceholder("Patient address / location").fill(opts.pickupLocation);
    if (opts.destination) {
      await dialog.getByPlaceholder("Hospital / Destination").fill(opts.destination);
    }
    await dialog.getByPlaceholder("RTA, chest pain, etc.").fill(opts.complaint);

    await dialog.getByRole("button", { name: "Dispatch" }).click();
    await expect(dialog).not.toBeVisible();
  }

  /**
   * HTML5 native drag-and-drop (DispatchTab's cards use plain `draggable`/`onDragStart`/
   * `onDrop`, not a library) — `locator.dragTo` dispatches real drag events under Chromium,
   * which is what this component's handlers actually listen for.
   */
  async dragCardToColumn(complaintText: string, columnLabel: string): Promise<void> {
    const card = this.page.locator('div[draggable="true"]', { hasText: complaintText });
    const column = this.page.locator("div.min-w-40", { hasText: columnLabel });
    await card.dragTo(column);
  }
}
