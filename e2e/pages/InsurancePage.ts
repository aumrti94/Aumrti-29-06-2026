/**
 * Phase 7 segment 7/9 — Claim, built for J06. Drives `src/pages/insurance/InsurancePage.tsx`,
 * a SINGLE-PAGE nav app (clicking a left-nav item changes internal state, not the URL — no
 * `page.goto()` between sub-flows) covering all three of this journey's claim sub-flows:
 * Pre-Auth submission, Claim submission, Reconciliation.
 *
 * Pre-Auth turned out to be the deepest screen in the app: a policy-verification checklist
 * modal (5 items), an 8-document upload checklist (`docsReady` requires ALL required items,
 * confirmed by reading `isItemReady()`/`onReadinessChange` directly — a bare checkbox does NOT
 * count without an uploaded file), and a final quality-gate modal that hard-blocks on 4
 * specific missing fields (TPA, policy number, estimated amount, at least one ICD-10 code) and
 * only soft-warns (overridable) on the rest, including "intimation not sent" — confirmed by
 * reading `PreAuthQualityGate.tsx`'s own check list line by line rather than guessing.
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import path from "path";
import { recoverFromModuleLoadError } from "./moduleRecovery";

const DUMMY_DOC_PATH = path.resolve(
  "C:/Users/yeswa/AppData/Local/Temp/claude/d--Aumrti-06-06-2026/591916ac-5416-4f53-bdc8-7dd6fabac60a/scratchpad/j06-dummy-doc.txt",
);

export class InsurancePage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto("/insurance");
    await recoverFromModuleLoadError(this.page);
  }

  async goToNav(label: string): Promise<void> {
    await this.page.getByRole("button", { name: label, exact: true }).click();
  }

  async startNewPreAuth(patientQuery: string, expectedPatientName: string): Promise<void> {
    const { page } = this;
    await page.getByRole("button", { name: "New Pre-Auth" }).click();
    await page.getByPlaceholder("Search by name or UHID…").fill(patientQuery);
    await page.getByRole("button", { name: new RegExp(expectedPatientName) }).first().click();
    await expect(page.getByText(`New Pre-Auth — ${expectedPatientName}`)).toBeVisible();
  }

  async selectTpa(tpaName: string): Promise<void> {
    const { page } = this;
    // Radix Select, not a native <select> — click the trigger (scoped by the preceding label,
    // since there is no id/htmlFor pairing), then click the option by its text.
    await page.locator('div:has(> label:text-is("TPA / Insurer"))').getByRole("combobox").click();
    await page.getByRole("option", { name: tpaName, exact: true }).click();
  }

  async fillPolicyNumber(policyNumber: string): Promise<void> {
    // Two real, independent fields on this page share the exact label "Policy Number" —
    // confirmed live: `PolicyVerificationPanel` (rendered above, its own separate
    // fields/state) has its own "Policy Number" field, distinct from the outer form's
    // `formState.policy_number` this method means to fill. `.last()` is the outer form's,
    // since PolicyVerificationPanel renders first in the JSX.
    await this.page.locator('label:text-is("Policy Number") + input').last().fill(policyNumber);
  }

  /** Policy Verification gate — 5-item checklist modal. All must be ticked to proceed. */
  async verifyPolicy(): Promise<void> {
    const { page } = this;
    await page.getByRole("button", { name: "Verify Policy" }).click();
    await expect(page.getByText("Policy Verification Checklist")).toBeVisible();
    const items = [
      "Policy is active (not lapsed)",
      "Patient is covered (self / spouse / child / parent)",
      "Waiting period completed",
      "Procedure not in exclusion list",
      "Sum insured available (not exhausted)",
    ];
    for (const label of items) {
      await page.getByText(label, { exact: true }).click();
    }
    await page.getByRole("button", { name: "Confirm Verification" }).click();
    await expect(page.getByText("Policy Verification Checklist")).not.toBeVisible();
  }

  async addDiagnosisCode(query: string, expectedCode: string): Promise<void> {
    const { page } = this;
    await page.getByPlaceholder("Search ICD-10 code or diagnosis…").fill(query);
    await page.getByRole("button", { name: new RegExp(expectedCode) }).first().click();
  }

  async fillEstimatedAmount(amount: number): Promise<void> {
    await this.page.locator('div:has(> label:text-is("Estimated Amount (₹)"))').locator("input").fill(String(amount));
  }

  async fillClinicalNotes(notes: string): Promise<void> {
    // The real JSX nests the label inside its OWN inner flex row (next to a "Generate
    // Summary" button), with the Textarea as a sibling of that inner row, not of the label
    // directly — `div:has(> label:...)` matched the label's immediate parent (the inner row),
    // which does not contain the textarea, and timed out finding nothing. XPath climbs two
    // levels (label → inner row → outer wrapper) to reach the wrapper that actually holds it.
    await this.page.locator('xpath=//label[text()="Clinical Notes / Justification"]/../../textarea').fill(notes);
  }

  /**
   * Uploads the same dummy file to EVERY file input on the page, required or not — simpler and
   * more robust than targeting the 8 required `DocumentChecklist` rows individually by DOM
   * position. This also happens to include the unrelated `PatientDocuments` widget's own
   * single upload slot (confirmed live) and the 2 optional `DocumentChecklist` rows (OT Notes,
   * Implant Sticker) — all harmless, since `docsReady` only cares that the 8 REQUIRED rows end
   * up ready, and uploading a few extra documents nobody asked for doesn't change that.
   */
  async uploadAllChecklistDocuments(): Promise<void> {
    const { page } = this;
    const inputs = page.locator('input[type="file"]');
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      await inputs.nth(i).setInputFiles(DUMMY_DOC_PATH);
    }
    // Each upload is an async round trip to Storage; wait for the LAST one's own visible
    // confirmation rather than a fixed sleep — "Uploaded" badges replace the upload buttons.
    await expect(page.getByText("Uploaded ✓").first()).toBeVisible({ timeout: 15_000 });

    // Every one of the (8+) uploads above fires its own toast, and they stack in the
    // bottom-right notification region long enough to physically overlap submitPreAuth()'s
    // button underneath — Playwright's actionability check then retries a click for the full
    // default window against an element that's genuinely covered, not merely slow to render.
    // Wait for the pile to actually clear rather than fighting the overlay with force:true.
    await expect(page.getByRole("region", { name: /Notifications/ }).getByRole("status")).toHaveCount(0, { timeout: 15_000 });
  }

  /**
   * Submits the pre-auth. `planTier` gates which button renders (manual/ai_assisted/automated)
   * — the Tier-0 fixture sets no explicit plan config, so this hospital runs the "manual" plan,
   * confirmed live. All three variants open the same PreAuthQualityGate modal first.
   */
  async submitPreAuth(): Promise<void> {
    const { page } = this;
    await page.getByRole("button", { name: /Mark as Submitted Manually|Generate & Submit|Auto-Submit to TPA/ }).click();
    await expect(page.getByText(/ALL CHECKS PASSED|WARNINGS — REVIEW REQUIRED|SUBMISSION BLOCKED/)).toBeVisible();

    // Only ever a WARNING for this journey (never a hard "SUBMISSION BLOCKED" — TPA/policy/
    // amount/diagnosis are all filled before this point specifically to guarantee that); "TPA
    // intimation sent" is the one check this journey deliberately leaves as a warning rather
    // than building yet another sub-flow to send a real intimation. The label text is
    // associated (htmlFor) with the checkbox, so clicking it toggles the real input.
    const overrideLabel = page.getByText("I have reviewed the warnings above");
    if (await overrideLabel.isVisible().catch(() => false)) {
      await overrideLabel.click();
    }
    await page.getByRole("button", { name: /Submit Pre-Auth|Submit with Warnings/ }).click();
    // exact: true — a live toast notification region also reads "Notification Pre-auth
    // submitted ✓", a strict-mode collision with the real success div confirmed live.
    await expect(page.getByText("Pre-auth submitted ✓", { exact: true })).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Claim sub-flow (Claims to Submit). Runs the AI review, and — since no AI credentials are
   * configured in this environment, confirmed live — falls through to the "Continue without AI
   * review" skip path fixed for KNOWN-BUG-208 (previously a permanent hard block: `callAI()`
   * failing left `aiScores[bill_id]` `undefined` forever with no way to proceed on any plan
   * tier). Scoped to the row for `billNumber` since the queue can carry other bills.
   */
  async runAiReviewThenSubmit(billNumber: string): Promise<void> {
    const { page } = this;
    const row = page.getByRole("row", { name: new RegExp(billNumber) });
    await row.getByRole("button", { name: "AI Review" }).click();

    await page.getByRole("button", { name: "Run AI Assessment" }).click();
    // The AI call fails immediately in this environment (no credentials) — the panel's own
    // failure branch surfaces "Continue without AI review" rather than staying on
    // "Analysing...", so this wait is for that failure branch to render, not a fixed delay
    // masking a race.
    const skipButton = page.getByRole("button", { name: "Continue without AI review" });
    await expect(skipButton).toBeVisible({ timeout: 10_000 });
    await skipButton.click();

    await expect(row.getByText("AI: Skipped")).toBeVisible();
    await row.getByRole("button", { name: "✓ Submit" }).click();
    // submitClaim is async (a sequence RPC then an insert); the toast is the real completion
    // signal, not the click itself. A screen-reader live-region announcement ALSO renders this
    // text, prefixed "Notification " and suffixed with the description — a strict-mode collision
    // confirmed live (same class of issue as submitPreAuth's own toast, above) — exact:true on
    // just the toast's own title text avoids matching that longer announcement string.
    await expect(page.getByText(/^Claim CLM-\d{4}-\d{5} recorded ✓$/)).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Reconciliation sub-flow, part 1 — `ClaimsStatus.tsx`. A freshly-submitted claim starts life
   * as `status: "submitted"`; `PaymentReconciliation`'s pending list only ever shows claims with
   * `status = "approved"` (confirmed by reading its query directly) — there is no path from one
   * to the other except this screen's own "Record TPA Decision" modal, which is the real,
   * intentional stand-in for "the TPA responded" (no live TPA integration exists to actually
   * wait on). Defaults to the "Approved" decision, which is already the modal's own default for
   * a non-rejected claim.
   */
  async recordTpaApproval(patientFullName: string, approvedAmount: number): Promise<void> {
    const { page } = this;
    await page.getByRole("row", { name: new RegExp(patientFullName) })
      .getByRole("button", { name: "📋 Record Decision" }).click();
    await expect(page.getByText("Record TPA Decision")).toBeVisible();
    await page.getByPlaceholder("0").fill(String(approvedAmount));
    await page.getByRole("button", { name: "Save TPA Decision" }).click();
    // exact: true — the same live-region duplicate pattern as every other toast assertion above.
    await expect(page.getByText("Claim updated: approved ✓", { exact: true })).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Reconciliation sub-flow, part 2 — `PaymentReconciliation.tsx`. Records a full TPA payment
   * (paidAmount equal to the claimed amount) so the claim settles in one step with no
   * underpayment fork — the underpayment/dispute path is a real, separate journey fork, not part
   * of this happy-path admission's claim lifecycle.
   */
  async recordFullReconciliation(patientFullName: string, paidAmount: number): Promise<void> {
    const { page } = this;
    await page.getByRole("button", { name: new RegExp(patientFullName) }).click();
    await page.getByPlaceholder("0.00").fill(String(paidAmount));
    await page.getByRole("button", { name: "Record Payment" }).click();
    await expect(page.getByText("Claim fully reconciled ✓", { exact: true })).toBeVisible({ timeout: 10_000 });
  }

  /**
   * The underpayment fork of the same reconciliation screen — `paidAmount` less than the
   * claim's own claimed amount. `submitPayment()` (PaymentReconciliation.tsx) reacts to a
   * genuine shortfall two ways: the toast reads "Payment recorded — ₹X underpayment" rather
   * than "fully reconciled", and it auto-opens the dispute form on the same claim
   * (`if (diff > 0) setShowDispute(true)`) — so no separate click is needed to reach it.
   */
  async recordPartialReconciliation(patientFullName: string, paidAmount: number): Promise<void> {
    const { page } = this;
    await page.getByRole("button", { name: new RegExp(patientFullName) }).click();
    await page.getByPlaceholder("0.00").fill(String(paidAmount));
    await page.getByRole("button", { name: "Record Payment" }).click();
    await expect(page.getByText(/^Payment recorded — ₹[\d,]+ underpayment$/)).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Raises a dispute on the currently-selected, already-underpaid claim — the dispute form
   * `recordPartialReconciliation` already auto-opened. Deliberately the "Raise Dispute" button
   * scoped to the underpayment-actions row (PaymentReconciliation.tsx), NOT TpaDisputePanel's
   * own "Raise Dispute" — that panel is a separate, disconnected `tpa_disputes` register with
   * no link back to `insurance_claims.underpayment_amount` (confirmed by reading it directly),
   * so it cannot be what proves the underpayment figure survives a dispute.
   */
  async raiseDisputeOnUnderpayment(): Promise<void> {
    const { page } = this;
    // Two buttons share the exact accessible name "Raise Dispute" once the form is open — the
    // toggle button above it (already clicked open by recordPartialReconciliation) and this
    // form's own submit button. Scoped to the form's own container (the nearest ancestor of its
    // "Raise Dispute with {tpa}" heading) to click the submit button specifically.
    const form = page.locator('xpath=//h3[contains(text(),"Raise Dispute with")]/..');
    await expect(form).toBeVisible();
    // recordPartialReconciliation's own toast can still be on screen and physically overlap
    // this button. Its auto-dismiss timer (this app's TOAST_REMOVE_DELAY is 1,000,000ms —
    // effectively "never" — and Radix's own duration timer is unreliable in a headless,
    // focus-less browser) is not a safe thing to wait on, unlike the OTHER overlapping-toast
    // spot in this file where a LATER toast naturally evicts the earlier one (TOAST_LIMIT: 1).
    // Dismissing it via its own close button is immediate and deterministic.
    const toastClose = page.locator("[toast-close]");
    if (await toastClose.isVisible().catch(() => false)) {
      await toastClose.click();
    }
    await form.getByRole("button", { name: "Raise Dispute" }).click();
    await expect(page.getByText("Dispute raised ✓", { exact: true })).toBeVisible({ timeout: 10_000 });
  }
}
