/**
 * Blood Bank — cross-match to issue (Phase 10, docs/testing/PHASED_TEST_PLAN.md), deepening a
 * smoke-only module. Previously covered only at the pure-function level
 * (`src/lib/bloodCompatibility.test.ts`'s full 64-pair ABO/Rh matrix, `bloodBagLabel.test.ts`) —
 * the actual cross-match → issue workflow had never been driven end-to-end. Ranked among the
 * higher-irreversibility smoke-only modules per this project's own doctrine (risk-rank by
 * irreversibility, not patient volume): issuing a unit commits a physical, perishable resource to
 * a patient — a wrong issue is a transfusion, not a data error.
 *
 * Found and fixed while building this spec: `CrossMatchTab.tsx`, `RequestsTab.tsx` (two call
 * sites), and `DonorsTab.tsx` all resolved the acting staff member via
 * `.from("users").select("id, hospital_id").limit(1).maybeSingle()` — an ARBITRARY row, not the
 * actual logged-in caller. On a blood-safety record this misattributes who actually performed a
 * cross-match or issued a unit; on the issue path it also fed the auto-generated bill's
 * `hospital_id`. Fixed by threading `hospitalId`/`userId` down from `HospitalContext` (via
 * `BloodBankPage.tsx`, which already had `hospitalId` in scope) — see KNOWN_BUGS.md. This spec is
 * the regression test: it asserts `performed_by`/`issued_by` is the REAL signed-in staff member's
 * own `public.users.id`, not just "some id".
 *
 * `blood_bank` added to `ENABLED_MODULE_KEYS` (`e2e/fixtures/constants.ts`) — every tab here is
 * wrapped in `GatedTabsTrigger`, confirmed by reading it, unlike Partograph/Anaesthesia EMR which
 * have no such gate.
 */
import { test, expect } from "@playwright/test";
import { HOSPITAL_A, HOSPITAL_B, tenantOf, staffUserId } from "../fixtures/constants";
import { serviceClient } from "../fixtures/serviceClient";

test.describe("Blood Bank — cross-match to issue", () => {
  test("an ABO-incompatible unit is blocked from cross-match; a compatible one is cross-matched, reserved, requested and issued, correctly attributed", async ({ page }) => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const svc = serviceClient();

    const patientId = `${tenant}0000000-0000-4000-8000-e00000000801`;
    const compatUnitId = `${tenant}0000000-0000-4000-8000-e00000000802`;
    const incompatUnitId = `${tenant}0000000-0000-4000-8000-e00000000803`;
    const compatUnitNumber = `BU-${tenant.toUpperCase()}-TESTCOMPAT-001`;
    const incompatUnitNumber = `BU-${tenant.toUpperCase()}-TESTINCOMPAT-001`;
    const nowISO = new Date().toISOString();
    const expiryISO = new Date(Date.now() + 20 * 86400000).toISOString();

    await svc.from("patients").insert({
      id: patientId, hospital_id: hospital.id, full_name: "Test Patient BloodBankFixture",
      uhid: `${hospital.uhidPrefix}BLOODBANK1`, phone: "9000000801", blood_group: "O+", is_active: true,
    } as never);

    await svc.from("blood_units").insert([
      {
        id: compatUnitId, hospital_id: hospital.id, unit_number: compatUnitNumber,
        component: "rbc", blood_group: "O", rh_factor: "positive",
        collected_at: nowISO, expiry_at: expiryISO, status: "available", volume_ml: 350,
      },
      {
        id: incompatUnitId, hospital_id: hospital.id, unit_number: incompatUnitNumber,
        component: "rbc", blood_group: "AB", rh_factor: "positive",
        collected_at: nowISO, expiry_at: expiryISO, status: "available", volume_ml: 350,
      },
    ] as never);

    try {
      await page.goto("/blood-bank");
      await page.getByRole("tab", { name: "Cross-Match" }).click();

      await test.step("an ABO-incompatible unit is flagged and blocked — no way to record a result at all", async () => {
        await page.locator("button[role=combobox]").first().click();
        await page.getByRole("option", { name: /Test Patient BloodBankFixture/ }).click();
        await page.getByPlaceholder("BU-xxxx-001").fill(incompatUnitNumber);
        await page.getByRole("button", { name: "Lookup" }).click();

        await expect(page.getByText("ABO INCOMPATIBILITY DETECTED")).toBeVisible();
        await expect(page.getByRole("button", { name: "Save Cross-Match Result" })).not.toBeVisible();
      });

      await test.step("a compatible unit passes ABO/Rh check, records a compatible result, and reserves the unit", async () => {
        await page.getByPlaceholder("BU-xxxx-001").fill(compatUnitNumber);
        await page.getByRole("button", { name: "Lookup" }).click();

        await expect(page.getByText("ABO & Rh compatible")).toBeVisible();
        await page.getByRole("button", { name: "✓ Compatible" }).click();
        await page.getByRole("button", { name: "Save Cross-Match Result" }).click();

        // Wait for the UI's own round trip (fetchRecent()) to confirm the save landed, rather
        // than racing the DB assertion below against saveCrossMatch()'s still-in-flight awaits.
        await expect(page.getByText(compatUnitNumber)).toBeVisible();

        const { data, error } = await svc
          .from("cross_match_records")
          .select("result, performed_by")
          .eq("hospital_id", hospital.id)
          .eq("unit_id", compatUnitId)
          .maybeSingle();
        expect(error).toBeNull();
        expect(data?.result).toBe("compatible");
        // The actual regression assertion for the arbitrary-row fix.
        expect(data?.performed_by).toBe(staffUserId(tenant, "hospital_admin"));

        const { data: unit } = await svc.from("blood_units").select("status, reserved_for").eq("id", compatUnitId).maybeSingle();
        expect(unit?.status).toBe("reserved");
        expect(unit?.reserved_for).toBe(patientId);
      });

      await test.step("submitting a blood request and issuing the reserved unit produces a real, correctly-attributed blood_issues row", async () => {
        await page.getByRole("button", { name: "Blood Request" }).click();
        await page.locator("button[role=combobox]").filter({ hasText: /Search patient|Select patient/ }).first().click();
        await page.getByRole("option", { name: /Test Patient BloodBankFixture/ }).click();
        await page.getByPlaceholder(/indication/i).fill("Elective surgery — anticipated blood loss");
        await page.getByRole("button", { name: /Submit Request/i }).click();

        await page.getByText(/Test Patient BloodBankFixture/).first().click();
        // The unit row's own accessible button text is just "✓ Issue" — the unit_number is a
        // sibling <span>, not part of the button's name — so scope to that row first.
        await page.getByText(compatUnitNumber, { exact: true }).locator("..").getByRole("button", { name: "✓ Issue" }).click();

        // issueUnit() awaits the insert, the NABH evidence log AND the auto-bill before this
        // toast renders — by the time it's visible, the blood_issues row is already committed.
        await expect(page.getByText("Blood unit issued").first()).toBeVisible();

        const { data, error } = await svc
          .from("blood_issues")
          .select("hospital_id, issued_by, unit_id")
          .eq("hospital_id", hospital.id)
          .eq("unit_id", compatUnitId)
          .maybeSingle();
        expect(error).toBeNull();
        expect(data?.hospital_id).toBe(hospital.id);
        // The other half of the same regression: issued_by is the real caller, not an arbitrary row.
        expect(data?.issued_by).toBe(staffUserId(tenant, "hospital_admin"));

        // The irreversible step: the physical unit is now committed, not merely reserved.
        const { data: unit } = await svc.from("blood_units").select("status, issued_to").eq("id", compatUnitId).maybeSingle();
        expect(unit?.status).toBe("issued");
        expect(unit?.issued_to).toBe(patientId);
      });
    } finally {
      await svc.from("blood_issues").delete().eq("hospital_id", hospital.id).in("unit_id", [compatUnitId, incompatUnitId]);
      await svc.from("cross_match_records").delete().eq("hospital_id", hospital.id).in("unit_id", [compatUnitId, incompatUnitId]);
      await svc.from("blood_requests").delete().eq("hospital_id", hospital.id).eq("patient_id", patientId);
      await svc.from("blood_units").delete().in("id", [compatUnitId, incompatUnitId]);
      await svc.from("patients").delete().eq("id", patientId);
    }
  });
});
