/**
 * MCI / Disaster Response — activation, triage logging, deactivation (Phase 10, docs/testing/
 * PHASED_TEST_PLAN.md), deepening the last of the five smoke-only modules named in this pass.
 * Never driven end-to-end before this — confirmed by grep, zero test files reference
 * MCIActivationPage anywhere.
 *
 * FOUND WHILE SCOPING, NOT FIXED — documented, not silently dropped (matching this codebase's
 * own established precedent for MLC's identical fragmentation, Phase 8B): this page's
 * `mci_events`/`mci_triage_patients` tables are a COMPLETELY SEPARATE mechanism from the one
 * `EmergencyPage.tsx`'s own "🚨 Declare MCI" header button already uses
 * (`disaster-mode.ts`'s `declareMassCasualty()`, which toggles `epidemic_protocols.triage_mode`
 * — confirmed by reading `disaster-mode.ts` directly, `mci_events` is never referenced there at
 * all). Activating one does not activate the other. A hospital could have this page's own
 * `mci_events.status = 'active'` while `EmergencyPage`'s START-triage-tag banner (driven by
 * `epidemic_protocols.triage_mode`) stays dark, or vice versa. Real architectural fragmentation,
 * not attempted to unify here — same scope boundary already established for MLC's own 10
 * independent write paths.
 *
 * Irreversibility: each triage-log entry represents a real casualty being tracked during an
 * actual mass-casualty event — correctness and attribution matter for post-incident review and
 * statutory accountability, not just data entry.
 *
 * No fixture entitlement change needed: `/emergency/mci` gates on the same `moduleKey="emergency"`
 * already confirmed fully-permissive for the Tier-0 fixture (Part 9's Emergency spec). Role list
 * (`routeRoles.ts`) explicitly includes `hospital_admin` here too, on top of the usual
 * `BYPASS_ROLES` exemption.
 */
import { test, expect } from "@playwright/test";
import { HOSPITAL_A, HOSPITAL_B, tenantOf, staffUserId } from "../fixtures/constants";
import { serviceClient } from "../fixtures/serviceClient";

test.describe("MCI Activation", () => {
  test("activating logs a real event, triage entries are correctly attributed, deactivating stands it down", async ({ page }) => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const eventName = `Test Fixture Incident ${tenant.toUpperCase()}1`;
    const casualtyName = `Test Casualty MCIFixture${tenant.toUpperCase()}1`;
    const svc = serviceClient();

    const cleanup = async () => {
      const { data: events } = await svc.from("mci_events").select("id").eq("hospital_id", hospital.id).eq("event_name", eventName);
      const ids = (events ?? []).map((e) => e.id);
      if (ids.length) {
        await svc.from("mci_triage_patients").delete().in("mci_event_id", ids);
        await svc.from("mci_events").delete().in("id", ids);
      }
    };
    await cleanup();

    try {
      await page.goto("/emergency/mci");
      await page.getByRole("button", { name: "Activate MCI" }).click();
      await page.getByPlaceholder(/Building collapse/).fill(eventName);
      await page.getByRole("button", { name: "Activate Now" }).click();

      await expect(page.getByText(eventName)).toBeVisible();
      await expect(page.getByText("ACTIVE")).toBeVisible();

      const { data: event, error: eventErr } = await svc
        .from("mci_events")
        .select("id, status, activated_by, incident_type")
        .eq("hospital_id", hospital.id)
        .eq("event_name", eventName)
        .maybeSingle();
      expect(eventErr).toBeNull();
      expect(event?.status).toBe("active");
      expect(event?.incident_type).toBe("mass_casualty");
      const expectedUserId = staffUserId(tenant, "hospital_admin");
      expect(event?.activated_by).toBe(expectedUserId);

      await page.getByRole("button", { name: "Add Patient" }).click();
      await page.getByPlaceholder(/Unknown Male/).fill(casualtyName);
      await page.getByPlaceholder("Crush injury L lower limb, head trauma…").fill("Multiple fractures, stable");
      await page.getByRole("button", { name: "Add to Triage Log" }).click();

      await expect(page.getByText(casualtyName)).toBeVisible();

      const { data: casualty, error: casErr } = await svc
        .from("mci_triage_patients")
        .select("triage_tag, triaged_by")
        .eq("hospital_id", hospital.id)
        .eq("mci_event_id", event!.id)
        .eq("patient_name", casualtyName)
        .maybeSingle();
      expect(casErr).toBeNull();
      expect(casualty?.triage_tag).toBe("P1_immediate");
      // The actual regression assertion: attribution is the real caller, not an arbitrary row.
      expect(casualty?.triaged_by).toBe(expectedUserId);

      await page.getByRole("button", { name: "Deactivate MCI" }).click();
      await expect(page.getByText("No active MCI event")).toBeVisible();

      const { data: deactivated } = await svc.from("mci_events").select("status, deactivated_by").eq("id", event!.id).maybeSingle();
      expect(deactivated?.status).toBe("deactivated");
      expect(deactivated?.deactivated_by).toBe(expectedUserId);
    } finally {
      await cleanup();
    }
  });
});
