/**
 * Phase 9, Part 6 (docs/testing/PHASED_TEST_PLAN.md) — dialysis recurring sessions, the
 * regression test for KNOWN-BUG-249 (Part 1). Before that fix, a session's start AND end each
 * posted an independent charge under two dedupe keys that never collided — every session that
 * ran its normal lifecycle was billed twice. A SECOND session for the same patient on the same
 * machine on the same calendar day made it worse: the second start-charge was silently
 * absorbed by `postCharge`'s own idempotency check (its key matched the FIRST session's,
 * being date+patient+machine rather than per-session), while its end-charge still posted once —
 * so this exact scenario (same patient, same machine, same day, two real sessions) is the one
 * this spec drives, twice, through the real UI.
 *
 * No admission is seeded — `createDialysisBill`'s standalone branch is exercised (each session
 * mints its own `bills` row), which is the simpler, more common real-world case for an
 * outpatient dialysis unit and does not need J06's own admission/ward/bed machinery.
 */
import { test, expect } from "@playwright/test";
import { DialysisPage } from "../pages/DialysisPage";
import { HOSPITAL_A, HOSPITAL_B, tenantOf, type TenantKey } from "../fixtures/constants";
import { serviceClient } from "../fixtures/serviceClient";

function patientName(tenant: TenantKey): string {
  return `Test Patient DialysisRecurring${tenant.toUpperCase()}1`;
}
function machineName(tenant: TenantKey): string {
  return `TEST-HD-${tenant.toUpperCase()}1`;
}

test.describe.configure({ mode: "serial" });

test.describe("Dialysis recurring sessions — bills exactly once per session, twice for two", () => {
  test.afterAll(async () => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const svc = serviceClient();

    const { data: patient } = await svc.from("patients").select("id").eq("hospital_id", hospital.id).eq("full_name", patientName(tenant)).maybeSingle();
    if (patient) {
      const { data: dp } = await svc.from("dialysis_patients").select("id").eq("hospital_id", hospital.id).eq("patient_id", patient.id).maybeSingle();
      if (dp) {
        await svc.from("dialysis_sessions").delete().eq("dialysis_patient_id", dp.id);
        await svc.from("dialysis_patients").delete().eq("id", dp.id);
      }
      const { data: bills } = await svc.from("bills").select("id").eq("hospital_id", hospital.id).eq("patient_id", patient.id).eq("bill_type", "dialysis");
      if (bills?.length) await svc.from("bill_line_items").delete().in("bill_id", bills.map((b) => b.id));
      await svc.from("bills").delete().eq("hospital_id", hospital.id).eq("patient_id", patient.id).eq("bill_type", "dialysis");
      await svc.from("patients").delete().eq("id", patient.id);
    }
    await svc.from("dialysis_machines").delete().eq("hospital_id", hospital.id).eq("machine_name", machineName(tenant));
  });

  test("two real sessions, same patient, same machine, same day — each bills exactly once", async ({ page }) => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const patient = patientName(tenant);
    const machine = machineName(tenant);
    const svc = serviceClient();
    const dialysis = new DialysisPage(page);

    let patientId = "";

    await test.step("seed the patient, a dialysis_patients record, and one machine", async () => {
      const { error: pErr } = await svc.from("patients").insert({
        hospital_id: hospital.id, full_name: patient,
        uhid: `${hospital.uhidPrefix}DIALREC${tenant.toUpperCase()}1`,
        phone: tenant === "a" ? "9000000095" : "9000000096", is_active: true,
      } as never);
      expect(pErr).toBeNull();
      const { data: p } = await svc.from("patients").select("id").eq("hospital_id", hospital.id).eq("full_name", patient).maybeSingle();
      expect(p).not.toBeNull();
      patientId = p!.id;

      const { error: dpErr } = await svc.from("dialysis_patients").insert({
        hospital_id: hospital.id, patient_id: patientId, dry_weight_kg: 68,
      } as never);
      expect(dpErr).toBeNull();

      const { error: mErr } = await svc.from("dialysis_machines").insert({
        hospital_id: hospital.id, machine_name: machine, machine_type: "clean", status: "available", is_active: true,
      } as never);
      expect(mErr).toBeNull();
    });

    let session1Id = "";

    await test.step("Session 1 — start and complete via the real UI", async () => {
      await dialysis.open();
      await dialysis.startSessionOn(machine, patient, patient);
      await dialysis.completeSessionOn(machine);
    });

    await test.step("assert exactly one bill, one line item, for Session 1", async () => {
      const { data: sessions } = await svc.from("dialysis_sessions").select("id").eq("hospital_id", hospital.id);
      expect(sessions).toHaveLength(1);
      session1Id = sessions![0].id;

      const { data: bills, error: billErr } = await svc
        .from("bills").select("id, total_amount").eq("hospital_id", hospital.id).eq("patient_id", patientId).eq("bill_type", "dialysis");
      expect(billErr).toBeNull();
      expect(bills).toHaveLength(1);

      const { data: lineItems, error: liErr } = await svc
        .from("bill_line_items").select("id, source_dedupe_key, total_amount").eq("bill_id", bills![0].id);
      expect(liErr).toBeNull();
      expect(lineItems).toHaveLength(1);
      expect(lineItems![0].source_dedupe_key).toBe(`dialysis:session:${session1Id}`);
      expect(Number(lineItems![0].total_amount)).toBeGreaterThan(0);
      expect(Number(lineItems![0].total_amount)).toBe(Number(bills![0].total_amount));
    });

    await test.step("free the machine (disinfection cycle complete) for a second real session", async () => {
      await svc.from("dialysis_machines").update({ status: "available" }).eq("hospital_id", hospital.id).eq("machine_name", machine);
    });

    await test.step("Session 2 — same patient, same machine, same calendar day — the exact scenario KNOWN-BUG-249's old key silently skipped", async () => {
      await dialysis.open();
      await dialysis.startSessionOn(machine, patient, patient);
      await dialysis.completeSessionOn(machine);
    });

    await test.step("assert Session 2 ALSO billed — a second real, distinct bill and line item, not silently absorbed", async () => {
      const { data: sessions } = await svc.from("dialysis_sessions").select("id").eq("hospital_id", hospital.id).order("created_at", { ascending: true });
      expect(sessions).toHaveLength(2);
      const session2Id = sessions!.find((s) => s.id !== session1Id)!.id;

      const { data: bills, error: billErr } = await svc
        .from("bills").select("id, total_amount").eq("hospital_id", hospital.id).eq("patient_id", patientId).eq("bill_type", "dialysis");
      expect(billErr).toBeNull();
      // Two sessions, two independent standalone bills — not merged, not deduped against
      // each other (each carries its own real dedupe key, one per session).
      expect(bills).toHaveLength(2);

      const allBillIds = bills!.map((b) => b.id);
      const { data: allLineItems, error: liErr } = await svc
        .from("bill_line_items").select("id, bill_id, source_dedupe_key").in("bill_id", allBillIds);
      expect(liErr).toBeNull();
      // The real assertion: exactly TWO line items total across both sessions — never three
      // (the old double-charge) and never one (the old same-day-collision silent skip).
      expect(allLineItems).toHaveLength(2);
      const keys = allLineItems!.map((li) => li.source_dedupe_key).sort();
      expect(keys).toEqual([`dialysis:session:${session1Id}`, `dialysis:session:${session2Id}`].sort());
    });
  });
});
