/**
 * Accessibility — bounded first pass (Phase 10, docs/testing/PHASED_TEST_PLAN.md). Nothing in
 * this repo has ever run an automated accessibility check before this — confirmed by grepping
 * `e2e/`/`src/` for any real `axe-core` usage (only false-positive substring matches like
 * "MaxE..." existed). `@axe-core/playwright` added as a devDependency this pass.
 *
 * Deliberately a SEPARATE, small spec rather than interleaved into the existing serial journey
 * specs (`j12-opd-cash-walkin.spec.ts`, `j06-ipd-tpa-surgical.spec.ts`) — those are long,
 * multi-segment `mode: "serial"` suites already carrying real assertions; inserting an axe scan
 * mid-flow risks destabilising a verified journey for a check that only needs a stable,
 * authenticated screen to already be open. This file reaches the same two representative
 * screens (OPD — highest-traffic; IPD — most complex) independently, via the same authenticated
 * storageState every spec in this suite already uses.
 *
 * Bounded to 2 screens and to critical/serious violations only — a first pass proving the
 * mechanism works, not a full-suite accessibility audit in one PR. It already found and this
 * pass fixed three real, previously-unknown defects: two icon-only date-nav buttons and a
 * hidden native date input with no accessible name (`TokenQueue.tsx`), two Select filter
 * triggers with no accessible name (`TokenQueue.tsx`), and a native ward-filter `<select>` with
 * no accessible name (`BedMap.tsx`).
 *
 * `color-contrast` is excluded from the blocking set here — KNOWN-BUG-264. Every instance found
 * (9-13 nodes per screen) traces to shared, app-wide design tokens (`text-muted-foreground`,
 * `text-sidebar-foreground/40`, the amber/success badge backgrounds) used on every screen in the
 * app, not a page-specific defect — fixing it means auditing the Tailwind color palette itself,
 * disproportionate scope for this pass and genuinely a design-system decision, not a same-PR
 * fix. Per this suite's own R2 rule ("a test for an unfixed bug is skipped, never left red"),
 * excluded explicitly here rather than left red or silently dropped.
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// KNOWN-BUG-264 — see file header. Remove once the design-system color-contrast audit lands.
const DEFERRED_RULE_IDS = ["color-contrast"];

function describeViolations(violations: { id: string; impact?: string | null; help: string; nodes: unknown[] }[]): string {
  return violations
    .map((v) => `[${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} node(s))`)
    .join("\n");
}

async function assertNoBlockingViolations(page: import("@playwright/test").Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const blocking = results.violations.filter(
    (v) => (v.impact === "critical" || v.impact === "serious") && !DEFERRED_RULE_IDS.includes(v.id),
  );
  expect(blocking, describeViolations(blocking)).toHaveLength(0);
}

test.describe("Accessibility — bounded smoke", () => {
  test("OPD dashboard has no critical/serious violations (color-contrast deferred, KNOWN-BUG-264)", async ({ page }) => {
    await page.goto("/opd");
    await expect(page.getByRole("button", { name: "+ Register Walk-in" })).toBeVisible();
    await assertNoBlockingViolations(page);
  });

  test("IPD workspace has no critical/serious violations (color-contrast deferred, KNOWN-BUG-264)", async ({ page }) => {
    await page.goto("/ipd");
    await page.waitForLoadState("networkidle");
    await assertNoBlockingViolations(page);
  });
});
