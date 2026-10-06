/**
 * Phase 9, Part 6 (docs/testing/PHASED_TEST_PLAN.md) — oncology day care, the regression test for
 * KNOWN-BUG-250 (Part 1). Before that fix, `handleCompleteInfusion` inserted a fresh `bills` row
 * unconditionally, then checked for an existing line item scoped to THAT row's own just-minted
 * id — which by definition could never find a prior match — so the only real protection was the
 * order-level `billing_status !== "billed"` check, racy under a genuine double-click.
 *
 * `chemo_protocols` and `daycare_chairs` have their own bundled seed INSERT in the oncology
 * module's migration (20260328054628) — but it is a one-time `WHERE NOT EXISTS` fired against
 * whatever hospitals existed at migration-apply time, before the Tier-0 e2e fixture's HOSPITAL_A/
 * HOSPITAL_B rows exist (confirmed live: both tables are genuinely empty for both tenants in this
 * environment). This spec seeds its own protocol and chair rather than assuming either exists.
 *
 * The "attempt completion again" fork does not force a genuine double-click race (Playwright's
 * click is a single deterministic action; forcing two near-simultaneous calls would be flaky,
 * not meaningful). Instead it reproduces the exact precondition the fix's inner guard exists
 * for: `chemo_orders.billing_status` reset to something other than "billed" (simulating that
 * OUTER flag having reverted or never committed) while the real `bill_line_items` row from the
 * first pass is left untouched, then completion is re-driven through the real UI a second time.
 * If the inner `source_dedupe_key` check were the dead code it used to be, this would create a
 * second bill; the fix means it does not.
 */
import { test, expect } from "@playwright/test";
import { OncologyPage } from "../pages/OncologyPage";
import { HOSPITAL_A, HOSPITAL_B, tenantOf, type TenantKey } from "../fixtures/constants";
import { serviceClient } from "../fixtures/serviceClient";

function patientName(tenant: TenantKey): string {
  return `Test Patient OncoDaycare${tenant.toUpperCase()}1`;
}

test.describe.configure({ mode: "serial" });

test.describe("Oncology day care — one infusion bills exactly once, twice does not double it", () => {
  test.afterAll(async () => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const svc = serviceClient();

    const { data: patient } = await svc.from("patients").select("id").eq("hospital_id", hospital.id).eq("full_name", patientName(tenant)).maybeSingle();
    if (patient) {
      const { data: onc } = await svc.from("oncology_patients").select("id").eq("hospital_id", hospital.id).eq("patient_id", patient.id).maybeSingle();
      if (onc) {
        const { data: orders } = await svc.from("chemo_orders").select("id").eq("oncology_patient_id", onc.id);
        if (orders?.length) {
          await svc.from("chemo_order_drugs").delete().in("order_id", orders.map((o) => o.id));
          await svc.from("chemo_orders").delete().in("id", orders.map((o) => o.id));
        }
        await svc.from("oncology_patients").delete().eq("id", onc.id);
      }
      const { data: bills } = await svc.from("bills").select("id").eq("hospital_id", hospital.id).eq("patient_id", patient.id).eq("bill_type", "daycare");
      if (bills?.length) await svc.from("bill_line_items").delete().in("bill_id", bills.map((b) => b.id));
      await svc.from("bills").delete().eq("hospital_id", hospital.id).eq("patient_id", patient.id).eq("bill_type", "daycare");
      await svc.from("patients").delete().eq("id", patient.id);
    }
    await svc.from("daycare_chairs").delete().eq("hospital_id", hospital.id).eq("chair_name", "TEST-Chair-1");
    await svc.from("chemo_protocols").delete().eq("hospital_id", hospital.id).eq("protocol_code", `TEST-AC-${tenant.toUpperCase()}`);
  });

  test("one infusion completes and bills exactly once; a second completion attempt does not double it", async ({ page }) => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const patName = patientName(tenant);
    const svc = serviceClient();
    const onc = new OncologyPage(page);

    let patientId = "";
    let orderId = "";
    let dedupeKey = "";

    await test.step("seed the patient, a chemo protocol, a chair, and an oncology_patients record", async () => {
      const { error: pErr } = await svc.from("patients").insert({
        hospital_id: hospital.id, full_name: patName,
        uhid: `${hospital.uhidPrefix}ONCDC${tenant.toUpperCase()}1`,
        phone: tenant === "a" ? "9000000097" : "9000000098", is_active: true,
      } as never);
      expect(pErr).toBeNull();
      const { data: p } = await svc.from("patients").select("id").eq("hospital_id", hospital.id).eq("full_name", patName).maybeSingle();
      expect(p).not.toBeNull();
      patientId = p!.id;

      // Same shape as the real "AC" protocol the oncology module's own migration seeds for
      // hospitals that existed at migration-apply time — not true of the Tier-0 fixture's
      // hospitals, so a fixture-local equivalent is seeded here instead.
      const { data: protocol, error: protoErr } = await svc.from("chemo_protocols").insert({
        hospital_id: hospital.id, protocol_name: "AC", protocol_code: `TEST-AC-${tenant.toUpperCase()}`,
        cancer_type: "Breast Ca (Adjuvant)", total_cycles: 4, cycle_duration_days: 21,
        drugs: [
          { drug_name: "Doxorubicin", dose_mg_m2: 60, route: "IV", day_of_cycle: 1, infusion_time_min: 15 },
          { drug_name: "Cyclophosphamide", dose_mg_m2: 600, route: "IV", day_of_cycle: 1, infusion_time_min: 60 },
        ],
      } as never).select("id").maybeSingle();
      expect(protoErr).toBeNull();
      expect(protocol).not.toBeNull();

      const { error: chairErr } = await svc.from("daycare_chairs").insert({
        hospital_id: hospital.id, chair_name: "TEST-Chair-1", chair_type: "recliner", status: "available",
      } as never);
      expect(chairErr).toBeNull();

      const { error: opErr } = await svc.from("oncology_patients").insert({
        hospital_id: hospital.id, patient_id: patientId, primary_diagnosis: "Breast Ca (Adjuvant) — fixture",
        protocol_id: protocol!.id, bsa_m2: 1.7, weight_kg: 62,
      } as never);
      expect(opErr).toBeNull();
    });

    await test.step("Create Chemo Order → verify all 5 steps → assign chair & start → complete infusion, all via the real UI", async () => {
      await onc.open();
      await onc.createChemoOrder(patName);
      await onc.verifyAllSteps(patName);
      await onc.assignChairAndStart(patName);
      await onc.completeInfusionFor(patName);
    });

    await test.step("assert exactly one real bill and one line item for this chemo cycle", async () => {
      const { data: order } = await svc.from("chemo_orders").select("id, billing_status, bill_id").eq("hospital_id", hospital.id).eq("patient_id", patientId).maybeSingle();
      expect(order).not.toBeNull();
      expect(order!.billing_status).toBe("billed");
      orderId = order!.id;
      dedupeKey = `oncology:chemo:${orderId}`;

      const { data: bills, error: billErr } = await svc
        .from("bills").select("id, total_amount").eq("hospital_id", hospital.id).eq("patient_id", patientId).eq("bill_type", "daycare");
      expect(billErr).toBeNull();
      expect(bills).toHaveLength(1);
      expect(bills![0].id).toBe(order!.bill_id);

      const { data: lineItems, error: liErr } = await svc
        .from("bill_line_items").select("id, source_dedupe_key, total_amount").eq("bill_id", bills![0].id);
      expect(liErr).toBeNull();
      expect(lineItems).toHaveLength(1);
      expect(lineItems![0].source_dedupe_key).toBe(dedupeKey);
      expect(Number(lineItems![0].total_amount)).toBeGreaterThan(0);
    });

    await test.step("reproduce the fix's real precondition: billing_status reverts, the real bill_line_items row does not", async () => {
      // billing_status is NOT NULL (CHECK'd to unbilled/billed/waived/included) — 'unbilled' is
      // the value that actually models "the outer flag never committed", not a bare null.
      const { error: revertErr } = await svc.from("chemo_orders").update({ status: "administered", billing_status: "unbilled" }).eq("id", orderId);
      expect(revertErr).toBeNull();
      // completeInfusionFor's own update already cleared current_patient (handleCompleteInfusion
      // sets it null on completion) — the chair is looked up by its own fixture name, not by a
      // patient link that no longer exists.
      const { data: chair } = await svc.from("daycare_chairs").select("id").eq("hospital_id", hospital.id).eq("chair_name", "TEST-Chair-1").maybeSingle();
      expect(chair).not.toBeNull();
      const { error: chairErr } = await svc.from("daycare_chairs").update({ status: "occupied", current_patient: patientId }).eq("id", chair!.id);
      expect(chairErr).toBeNull();
    });

    await test.step("attempt completion again through the real UI", async () => {
      await onc.open();
      await onc.completeInfusionFor(patName);
    });

    await test.step("assert STILL exactly one bill_line_items row for this order — the inner source_dedupe_key guard held", async () => {
      const { data: bills, error: billErr } = await svc
        .from("bills").select("id").eq("hospital_id", hospital.id).eq("patient_id", patientId).eq("bill_type", "daycare");
      expect(billErr).toBeNull();
      expect(bills).toHaveLength(1);

      const { data: lineItems, error: liErr } = await svc
        .from("bill_line_items").select("id").eq("bill_id", bills![0].id).eq("source_dedupe_key", dedupeKey);
      expect(liErr).toBeNull();
      expect(lineItems).toHaveLength(1);
    });
  });
});
