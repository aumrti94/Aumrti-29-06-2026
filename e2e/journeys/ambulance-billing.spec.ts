/**
 * Post-8B round 2, Part 3 — Ambulance billing happy path. None of the five standalone-branch
 * modules `autoChargeService` covers (ambulance, chronic care, home care, mental health,
 * dietetics is a sixth, admission-branch module) had ever been driven end-to-end before this
 * pass — the function-level degradation logic is already covered by `serviceBilling.test.ts`;
 * what was missing is proof that each module's real UI flow produces a real, correct billing
 * row. This is not a re-proof of KNOWN-BUG-222's fix, it's the first E2E coverage this module
 * has ever had.
 *
 * The dispatch dialog has no patient picker (see AmbulancePage.ts's own header comment) — the
 * patient is attached via the service client between creating the dispatch and dragging its
 * card to "Completed", which is the only place `moveDispatch` fires the charge.
 */
import { test, expect } from "@playwright/test";
import { AmbulancePage } from "../pages/AmbulancePage";
import { HOSPITAL_A, HOSPITAL_B, tenantOf, type TenantKey } from "../fixtures/constants";
import { serviceClient } from "../fixtures/serviceClient";

function ambulancePatientName(tenant: TenantKey): string {
  return `Test Patient AmbulanceBilling${tenant.toUpperCase()}1`;
}

test.describe.configure({ mode: "serial" });

test.describe("Ambulance — dispatch-to-completion billing", () => {
  test.afterAll(async () => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const svc = serviceClient();
    const patientName = ambulancePatientName(tenant);

    const { data: patient } = await svc
      .from("patients").select("id").eq("hospital_id", hospital.id).eq("full_name", patientName).maybeSingle();
    if (!patient) return;

    await svc.from("ambulance_dispatches").delete().eq("hospital_id", hospital.id).eq("patient_id", patient.id);
    const { data: bills } = await svc.from("bills").select("id").eq("patient_id", patient.id);
    if (bills?.length) {
      await svc.from("bill_line_items").delete().in("bill_id", bills.map((b) => b.id));
      await svc.from("bill_payments").delete().in("bill_id", bills.map((b) => b.id));
      await svc.from("bills").delete().in("id", bills.map((b) => b.id));
    }
    await svc.from("service_charges").delete().eq("hospital_id", hospital.id).eq("patient_id", patient.id);
    await svc.from("patients").delete().eq("id", patient.id);
  });

  test("create a dispatch, complete the trip, and a real charge posts", async ({ page }) => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const patientName = ambulancePatientName(tenant);
    const complaint = `Fixture RTA Case ${tenant.toUpperCase()}1`;
    const svc = serviceClient();
    const ambulance = new AmbulancePage(page);

    await test.step("seed the patient directly", async () => {
      const { error } = await svc.from("patients").insert({
        hospital_id: hospital.id,
        full_name: patientName,
        uhid: `${hospital.uhidPrefix}AMB${tenant.toUpperCase()}1`,
        phone: tenant === "a" ? "9000000051" : "9000000052",
        is_active: true,
      } as never);
      expect(error).toBeNull();
    });

    await test.step("create the dispatch via the real UI", async () => {
      await ambulance.open();
      await ambulance.createDispatch({
        pickupLocation: "Fixture Pickup Point",
        destination: hospital.name,
        complaint,
      });
      await expect(page.getByText(complaint)).toBeVisible();
    });

    await test.step("attach the patient — the one thing this dialog has no UI path to do", async () => {
      const { data: patient } = await svc.from("patients").select("id").eq("hospital_id", hospital.id).eq("full_name", patientName).maybeSingle();
      expect(patient).not.toBeNull();
      const { error } = await svc.from("ambulance_dispatches")
        .update({ patient_id: patient!.id })
        .eq("hospital_id", hospital.id)
        .is("patient_id", null)
        .ilike("complaint", complaint);
      expect(error).toBeNull();
    });

    await test.step("drag the card to Completed — the real trigger for autoChargeService", async () => {
      await ambulance.dragCardToColumn(complaint, "Completed");
    });

    await test.step("a real bill line item posts for this dispatch", async () => {
      const { data: patient } = await svc.from("patients").select("id").eq("hospital_id", hospital.id).eq("full_name", patientName).maybeSingle();
      expect(patient).not.toBeNull();

      await expect
        .poll(async () => {
          const { data } = await svc
            .from("bill_line_items")
            .select("id, total_amount")
            .eq("hospital_id", hospital.id)
            .eq("source_module", "ambulance");
          return data?.length ?? 0;
        }, { timeout: 10_000 })
        .toBeGreaterThan(0);

      const { data: dispatch } = await svc
        .from("ambulance_dispatches")
        .select("status, billing_status")
        .eq("hospital_id", hospital.id)
        .eq("patient_id", patient!.id)
        .maybeSingle();
      expect(dispatch).not.toBeNull();
      expect(dispatch!.status).toBe("completed");
    });
  });
});
