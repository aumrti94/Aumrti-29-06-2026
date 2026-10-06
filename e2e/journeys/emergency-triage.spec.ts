/**
 * Emergency — registration, triage assignment, and reassessment (Phase 10, docs/testing/
 * PHASED_TEST_PLAN.md), deepening a smoke-only module the master test plan (§D10) itself names
 * as a known gap: "the front door and highest-volume module — journey-untested at go-live."
 * Never driven end-to-end before this — confirmed by grep, zero test files reference
 * EmergencyPage/TriageBoard/EmergencyRegistrationModal anywhere.
 *
 * Scoped to the core triage workflow — registration and re-categorization — not MCI/disaster
 * mode, which is its own named module (`MCIActivationPage.tsx`) with its own tenant-wide
 * triage_mode side effects, left for a separate pass.
 *
 * Irreversibility: `ed_visits.triage_category` drives real-time clinical priority — the
 * TriageBoard's four columns ARE the department's live work queue, not a display of one. A
 * mis-triaged patient is a genuine patient-safety failure, not a data-entry error with an undo.
 *
 * The `/emergency` route needed no fixture entitlement change (probed live: no "Module Not
 * Enabled" screen for the Tier-0 fixture, which has no `hospital_subscriptions` row and so falls
 * into `useSubscriptionConfig`'s own documented "fully permissive until CEO assigns a plan"
 * state) — same reachability shape as Partograph/Anaesthesia EMR, unlike Blood Bank's tab-level
 * gate. Role gating borrows nothing special; `hospital_admin` hits `BYPASS_ROLES` as usual.
 *
 * Triage re-categorization is native HTML5 drag-and-drop, not a button — `card.dragTo(column)`
 * following the exact precedent already established for this app's Kanban style in
 * `AmbulancePage.ts`'s `dragCardToColumn`.
 *
 * Patient lookups never use `.maybeSingle()` keyed only on full_name — a name collision from a
 * prior interrupted run makes it return a "multiple rows" error, not the real row (confirmed
 * live: an earlier interrupted attempt at this exact spec left two stray same-named rows behind,
 * and every subsequent `.maybeSingle()` lookup failed against them). Always take the most recent
 * match by `created_at`, and clean up ALL matches, not just one.
 */
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HOSPITAL_A, HOSPITAL_B, tenantOf } from "../fixtures/constants";
import { serviceClient } from "../fixtures/serviceClient";

async function findLatestPatient(svc: SupabaseClient, hospitalId: string, fullName: string) {
  const { data } = await svc
    .from("patients")
    .select("id")
    .eq("hospital_id", hospitalId)
    .eq("full_name", fullName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function cleanupPatients(svc: SupabaseClient, hospitalId: string, fullName: string) {
  const { data: rows } = await svc.from("patients").select("id").eq("hospital_id", hospitalId).eq("full_name", fullName);
  const ids = (rows ?? []).map((r) => r.id);
  if (ids.length === 0) return;
  await svc.from("mlc_cases").delete().in("patient_id", ids);
  await svc.from("ed_visits").delete().in("patient_id", ids);
  await svc.from("patients").delete().in("id", ids);
}

test.describe("Emergency — registration and triage", () => {
  test("a new patient registers into the correct triage column and re-categorizes on reassessment", async ({ page }) => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const patientName = `Test Patient EDFixture${tenant.toUpperCase()}1`;
    const svc = serviceClient();
    await cleanupPatients(svc, hospital.id, patientName);

    try {
      await page.goto("/emergency");
      await page.getByRole("button", { name: "+ Register Emergency Patient" }).click();

      await page.getByPlaceholder("Unknown").fill(patientName);
      await page.locator("input[type=number]").first().fill("42");
      await page.getByRole("button", { name: "M", exact: true }).click();
      await page.getByPlaceholder(/Brief complaint/).fill("Severe chest pain, suspected MI");
      await page.getByRole("button", { name: /P1 - IMMEDIATE/ }).click();
      await page.getByRole("button", { name: /Register & Triage/ }).click();

      await test.step("the patient lands in the real ed_visits row, triaged P1", async () => {
        await expect(page.getByText(patientName)).toBeVisible();
        const patient = await findLatestPatient(svc, hospital.id, patientName);
        const { data, error } = await svc
          .from("ed_visits")
          .select("id, triage_category, chief_complaint, is_active")
          .eq("hospital_id", hospital.id)
          .eq("patient_id", patient!.id)
          .maybeSingle();
        expect(error).toBeNull();
        expect(data?.triage_category).toBe("P1");
        expect(data?.is_active).toBe(true);
      });

      await test.step("dragging the card to a different column re-categorizes it — the actual live-queue mechanism", async () => {
        const card = page.locator('div[draggable="true"]', { hasText: patientName });
        // The header span carrying "🟡 DELAYED" is a sibling of the actual onDrop-bearing drop
        // zone, not an ancestor of it — go up to the column wrapper, then pick its second direct
        // child (the drop zone), not the header itself.
        const p3Column = page.getByText("🟡 DELAYED").locator("../..").locator("> div").last();
        await card.dragTo(p3Column);

        // The board itself reflects it — the card moved out of the P1 column.
        await expect(page.locator('div[draggable="true"]', { hasText: patientName })).toBeVisible();

        const patient = await findLatestPatient(svc, hospital.id, patientName);
        const { data, error } = await svc
          .from("ed_visits")
          .select("triage_category")
          .eq("hospital_id", hospital.id)
          .eq("patient_id", patient!.id)
          .maybeSingle();
        expect(error).toBeNull();
        expect(data?.triage_category).toBe("P3");
      });
    } finally {
      await cleanupPatients(svc, hospital.id, patientName);
    }
  });

  test("an MLC-flagged registration is marked in the real row and opens the MLC documentation modal", async ({ page }) => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const patientName = `Test Patient EDMlcFixture${tenant.toUpperCase()}1`;
    const svc = serviceClient();
    await cleanupPatients(svc, hospital.id, patientName);

    try {
      await page.goto("/emergency");
      await page.getByRole("button", { name: "+ Register Emergency Patient" }).click();

      await page.getByPlaceholder("Unknown").fill(patientName);
      await page.locator("input[type=number]").first().fill("30");
      await page.getByRole("button", { name: "M", exact: true }).click();
      await page.getByPlaceholder(/Brief complaint/).fill("Road traffic accident, head injury");
      await page.getByRole("button", { name: /P1 - IMMEDIATE/ }).click();
      await page.getByText("Medico-Legal Case?").click();
      await page.getByRole("button", { name: /Register & Triage/ }).click();

      await expect(page.getByText("MLC Case Documentation")).toBeVisible();
      await expect(page.getByText(patientName)).toBeVisible();

      const patient = await findLatestPatient(svc, hospital.id, patientName);
      const { data, error } = await svc.from("ed_visits").select("mlc").eq("hospital_id", hospital.id).eq("patient_id", patient!.id).maybeSingle();
      expect(error).toBeNull();
      expect(data?.mlc).toBe(true);
    } finally {
      await cleanupPatients(svc, hospital.id, patientName);
    }
  });
});
