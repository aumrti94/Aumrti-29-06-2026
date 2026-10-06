/**
 * CSSD — sterilization cycle, BI result, quarantine on failure (Phase 10, docs/testing/
 * PHASED_TEST_PLAN.md), deepening a smoke-only module. Never driven end-to-end before this —
 * confirmed by grep, zero test files reference CSSDPage/SterilizeTab anywhere.
 *
 * Found and fixed while building this spec: `SterilizeTab.tsx`, `IssueReturnTab.tsx` and
 * `SetsInstrumentsTab.tsx` all resolved the acting staff member via the identical arbitrary
 * `.from("users").select(...).limit(1).maybeSingle()` pattern already found and fixed in the
 * Blood Bank module this same Phase 10 pass (KNOWN-BUG-263) — confirmed to be a far more
 * widespread, copy-pasted defect spanning ~15 files across the codebase (dialysis, IVF, HR
 * payroll, dietetics, inventory, several Settings screens). Here it misattributed
 * `operator_id` (who ran the cycle) and `bi_read_by` (who read the biological-indicator safety
 * result) — a real infection-control accountability gap on the exact record NABH audits.
 *
 * Irreversibility: a set marked "sterile" that was never actually verified sterile is a direct
 * infection-control failure with no data-level undo — the set gets used on a patient. This is
 * why the negative fork (BI fail → quarantine, never silently released) is the actual point of
 * this spec, not the happy path.
 *
 * `cssd` added to `ENABLED_MODULE_KEYS` (`e2e/fixtures/constants.ts`) — every tab here is
 * wrapped in `GatedTabsTrigger`, same shape as Blood Bank.
 */
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HOSPITAL_A, HOSPITAL_B, tenantOf, staffUserId } from "../fixtures/constants";
import { serviceClient } from "../fixtures/serviceClient";

async function cleanupSet(svc: SupabaseClient, hospitalId: string, setName: string) {
  const { data: sets } = await svc.from("instrument_sets").select("id").eq("hospital_id", hospitalId).eq("set_name", setName);
  const setIds = (sets ?? []).map((s) => s.id);
  if (setIds.length === 0) return;

  const { data: cycleLinks } = await svc.from("cycle_instruments").select("cycle_id").in("set_id", setIds);
  const cycleIds = [...new Set((cycleLinks ?? []).map((c) => c.cycle_id))];

  await svc.from("clinical_alerts").delete().eq("hospital_id", hospitalId).eq("alert_type", "sterility_failure");
  await svc.from("cycle_instruments").delete().in("set_id", setIds);
  if (cycleIds.length) await svc.from("sterilization_cycles").delete().in("id", cycleIds);
  await svc.from("instrument_sets").delete().in("id", setIds);
}

test.describe("CSSD — sterilization", () => {
  test("a passed BI releases the set as sterile with correct operator/reader attribution", async ({ page }) => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const setName = `Test Set CSSDPassFixture${tenant.toUpperCase()}1`;
    const svc = serviceClient();
    await cleanupSet(svc, hospital.id, setName);

    try {
      await svc.from("instrument_sets").insert({
        hospital_id: hospital.id, set_name: setName, set_code: `CSSD-PASS-${tenant.toUpperCase()}`, status: "dirty",
      } as never);

      await page.goto("/cssd");
      await page.getByText(setName).click();
      await page.getByRole("button", { name: /Start Cycle/ }).click();

      await expect(page.getByRole("button", { name: "✓ BI Pass" })).toBeVisible();
      await page.getByRole("button", { name: "✓ BI Pass" }).click();
      await expect(page.getByText("✓ BI Passed").first()).toBeVisible();

      const { data: set } = await svc.from("instrument_sets").select("id, status").eq("hospital_id", hospital.id).eq("set_name", setName).maybeSingle();
      expect(set?.status).toBe("sterile");

      const { data: cycle, error } = await svc
        .from("sterilization_cycles")
        .select("operator_id, bi_read_by, bi_result")
        .eq("hospital_id", hospital.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      expect(error).toBeNull();
      expect(cycle?.bi_result).toBe("pass");
      // The actual regression assertion for the arbitrary-user-row fix.
      const expectedUserId = staffUserId(tenant, "hospital_admin");
      expect(cycle?.operator_id).toBe(expectedUserId);
      expect(cycle?.bi_read_by).toBe(expectedUserId);
    } finally {
      await cleanupSet(svc, hospital.id, setName);
    }
  });

  test("a failed BI quarantines the set and raises a critical clinical alert — never silently released", async ({ page }) => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const setName = `Test Set CSSDFailFixture${tenant.toUpperCase()}1`;
    const svc = serviceClient();
    await cleanupSet(svc, hospital.id, setName);

    try {
      await svc.from("instrument_sets").insert({
        hospital_id: hospital.id, set_name: setName, set_code: `CSSD-FAIL-${tenant.toUpperCase()}`, status: "dirty",
      } as never);

      await page.goto("/cssd");
      await page.getByText(setName).click();
      await page.getByRole("button", { name: /Start Cycle/ }).click();

      await expect(page.getByRole("button", { name: "✗ BI Fail" })).toBeVisible();
      await page.getByRole("button", { name: "✗ BI Fail" }).click();
      await expect(page.getByText("STERILITY FAILURE").first()).toBeVisible();

      const { data: set } = await svc.from("instrument_sets").select("status").eq("hospital_id", hospital.id).eq("set_name", setName).maybeSingle();
      expect(set?.status).toBe("quarantine");

      const { data: alert, error } = await svc
        .from("clinical_alerts")
        .select("severity, alert_message")
        .eq("hospital_id", hospital.id)
        .eq("alert_type", "sterility_failure")
        .maybeSingle();
      expect(error).toBeNull();
      expect(alert?.severity).toBe("critical");
      expect(alert?.alert_message).toContain("Do NOT use");
    } finally {
      await cleanupSet(svc, hospital.id, setName);
    }
  });
});
