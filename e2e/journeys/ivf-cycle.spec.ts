/**
 * IVF & ART — couple registration, cycle start with real billing, stimulation monitoring
 * (Phase 10, docs/testing/PHASED_TEST_PLAN.md), deepening the last of the five smoke-only
 * modules named in this pass. Never driven end-to-end before this — confirmed by grep, zero test
 * files reference IVFPage/CouplesTab/CyclesTab/StimulationTab anywhere.
 *
 * MAJOR FINDING, DOCUMENTED NOT FIXED (KNOWN-BUG-269): `EmbryologyTab.tsx` — the "Embryology" tab
 * on this same page — is entirely non-functional. Confirmed by direct read: it is pure local
 * React state seeded with 3 hardcoded mock embryo records, has no `supabase` import anywhere in
 * the file, and its "Save Records" button has no `onClick` handler at all. This breaks the
 * embryo-freezing pipeline at its very first step — `EmbryoBankTab.tsx`'s "frozen embryo
 * inventory" (the single highest-irreversibility table in this module — a physical
 * cryopreserved specimen, ICMR ART Act 2021 Section 25 registry data) can never actually receive
 * a row through the real UI. This is genuine, scoped feature-build work (wiring real embryo
 * development tracking to the `embryology_records` table `EmbryoBankTab.tsx` already joins
 * against), not a same-pass mechanical fix — same treatment already given to the ANC-page and
 * transfer-out feature gaps found earlier this session.
 *
 * Found and fixed while building this spec:
 *  - `CyclesTab.tsx` (2 sites) and `StimulationTab.tsx` (1 site) had the identical arbitrary-
 *    user-row pattern already found and fixed in Blood Bank/CSSD this same pass — here
 *    misattributing real IVF billing (₹15,000+ per milestone) and
 *    `stimulation_monitoring.recorded_by` (who read the follicle scan driving the trigger-shot
 *    decision).
 *  - `CyclesTab.tsx`'s own `couples` list was fetched once at mount and never refreshed, so a
 *    couple registered via the separate Couples tab (Radix Tabs keeps every TabsContent mounted,
 *    not just the active one) never appeared in the "Start Cycle" picker until a full page
 *    reload — a real, plausible workflow (register a couple, immediately start their cycle)
 *    silently broken. Fixed by refetching whenever the Start Cycle dialog opens.
 *
 * `ivf` added to `ENABLED_MODULE_KEYS` — same `GatedTabsTrigger` shape as Blood Bank/CSSD/
 * Vaccination. Two Radix `<Label>` elements in this module (the couple-registration consent
 * Switch, the Stimulation tab's "Stim Day" input) have no `htmlFor` association with their
 * control — clicking the label text does nothing; the control itself must be targeted directly.
 */
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HOSPITAL_A, HOSPITAL_B, tenantOf, staffUserId } from "../fixtures/constants";
import { serviceClient } from "../fixtures/serviceClient";

async function cleanup(svc: SupabaseClient, hospitalId: string, patientId: string) {
  const { data: couples } = await svc.from("art_couples").select("id").eq("hospital_id", hospitalId).eq("female_patient_id", patientId);
  const coupleIds = (couples ?? []).map((c) => c.id);
  if (coupleIds.length) {
    const { data: cycles } = await svc.from("ivf_cycles").select("id").in("couple_id", coupleIds);
    const cycleIds = (cycles ?? []).map((c) => c.id);
    if (cycleIds.length) {
      await svc.from("stimulation_monitoring").delete().in("cycle_id", cycleIds);
      await svc.from("ivf_cycles").delete().in("id", cycleIds);
    }
    await svc.from("art_couples").delete().in("id", coupleIds);
  }
  await svc.from("bills").delete().eq("hospital_id", hospitalId).eq("patient_id", patientId);
  await svc.from("patients").delete().eq("id", patientId);
}

test.describe("IVF & ART — couple to cycle to monitoring", () => {
  test("registering a couple, starting a cycle, and recording a scan are all correctly attributed and billed", async ({ page }) => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const patientName = `Test Patient IVFFixture${tenant.toUpperCase()}1`;
    const svc = serviceClient();
    const patientId = `${tenant}0000000-0000-4000-8000-e00000001001`;
    await cleanup(svc, hospital.id, patientId);

    try {
      await svc.from("patients").insert({
        id: patientId, hospital_id: hospital.id, full_name: patientName,
        uhid: `${hospital.uhidPrefix}IVFFIX1`, phone: "9000001001", gender: "female", is_active: true,
      } as never);

      await page.goto("/ivf");
      await page.getByRole("button", { name: "+ Register Couple" }).click();

      await page.locator("input[placeholder='Search by name or UHID…']").first().fill(patientName.slice(0, 20));
      await page.getByText(new RegExp(patientName)).first().click();
      // The "Consent obtained from couple" <Label> has no htmlFor association with the Switch
      // next to it — clicking the text does nothing; the switch itself must be targeted.
      await page.getByRole("switch").click();
      await page.getByRole("button", { name: "Register Couple" }).click();

      // Wait for the UI's own round trip (loadCouples()) to confirm the insert landed, rather
      // than racing the DB assertion below against handleRegister()'s still-in-flight awaits.
      await expect(page.getByText(/ART-\d{4}-\d{3}/)).toBeVisible();

      const expectedUserId = staffUserId(tenant, "hospital_admin");

      await test.step("a real, correctly-attributed art_couples row exists", async () => {
        const { data, error } = await svc
          .from("art_couples")
          .select("id, consent_obtained, treating_doctor")
          .eq("hospital_id", hospital.id)
          .eq("female_patient_id", patientId)
          .maybeSingle();
        expect(error).toBeNull();
        expect(data?.consent_obtained).toBe(true);
        expect(data?.treating_doctor).toBe(expectedUserId);
      });

      await page.getByRole("button", { name: "+ Start Cycle" }).click();
      await page.locator("button[role=combobox]").filter({ hasText: "Select couple" }).click();
      await page.getByRole("option", { name: /ART-/ }).click();
      await page.locator("button[role=combobox]").filter({ hasText: "Select type" }).click();
      await page.getByRole("option", { name: "IVF" }).click();
      await page.getByRole("button", { name: "Begin Cycle" }).click();

      // Wait for the UI's own round trip (loadData()) to confirm the insert landed before
      // querying the DB directly — same timing discipline as the couple registration above.
      await expect(page.getByRole("button", { name: "+ Start Cycle" })).toBeVisible();

      let cycleId = "";
      await test.step("a real ivf_cycles row exists and the stimulation milestone is billed to this hospital", async () => {
        const { data: couple } = await svc.from("art_couples").select("id").eq("hospital_id", hospital.id).eq("female_patient_id", patientId).maybeSingle();
        const { data: cycle, error } = await svc
          .from("ivf_cycles")
          .select("id, cycle_number, hospital_id")
          .eq("couple_id", couple!.id)
          .maybeSingle();
        expect(error).toBeNull();
        expect(cycle?.hospital_id).toBe(hospital.id);
        cycleId = cycle!.id;

        const { data: bill, error: billErr } = await svc
          .from("bills")
          .select("hospital_id, total_amount, created_by")
          .eq("hospital_id", hospital.id)
          .eq("patient_id", patientId)
          .maybeSingle();
        expect(billErr).toBeNull();
        expect(Number(bill?.total_amount)).toBeGreaterThan(0);
        expect(bill?.created_by).toBe(expectedUserId);
      });

      await page.getByRole("tab", { name: /Stimulation/ }).click();
      await page.locator("button[role=combobox]").filter({ hasText: "Choose cycle" }).click();
      await page.getByRole("option", { name: /IVF/ }).click();
      // "Stim Day" <Label> has no htmlFor association either — targeted by its own placeholder.
      await page.getByPlaceholder("e.g. 8").fill("5");
      await page.getByRole("button", { name: "Save Scan Record" }).click();
      await expect(page.getByText(/Scan (saved|recorded)/i)).toBeVisible();

      await test.step("the stimulation scan is correctly attributed to the real caller", async () => {
        const { data, error } = await svc
          .from("stimulation_monitoring")
          .select("recorded_by, scan_day")
          .eq("cycle_id", cycleId)
          .maybeSingle();
        expect(error).toBeNull();
        expect(data?.scan_day).toBe(5);
        expect(data?.recorded_by).toBe(expectedUserId);
      });
    } finally {
      await cleanup(svc, hospital.id, patientId);
    }
  });
});
