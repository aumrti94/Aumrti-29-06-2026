/**
 * Phase 9, Part 4 (docs/testing/PHASED_TEST_PLAN.md) — J06 negative forks. J06 itself
 * (j06-ipd-tpa-surgical.spec.ts) proves the happy path; this file proves the real infrastructure
 * that same journey CAN diverge into actually holds. Two forks, both driven against a dedicated
 * fixture rather than reusing J06's own patient/admission — that file's serial run consumes and
 * fully cleans up its own state, and running concurrently against the same rows would race.
 *
 * The third fork the plan named ("duplicate charge-post blocked") is covered instead as a
 * vitest unit test of the actual shared guard — src/lib/chargePosting.test.ts — not here: it is
 * a pure idempotency check on `postCharge()`, with no UI step of its own to drive, and Part 6's
 * dialysis/oncology specs already regression-test the two real double-charge bugs Part 1 fixed
 * end-to-end. Forcing a UI double-click race here would test Playwright's timing, not the guard.
 */
import { test, expect } from "@playwright/test";
import { InsurancePage } from "../pages/InsurancePage";
import { BillingPage } from "../pages/BillingPage";
import { HOSPITAL_A, HOSPITAL_B, tenantOf, wards, beds, radiologyStudy, staffUserId, type TenantKey } from "../fixtures/constants";
import { serviceClient } from "../fixtures/serviceClient";

function forkPatientName(tenant: TenantKey, suffix: string): string {
  return `Test Patient NegFork${suffix}${tenant.toUpperCase()}1`;
}

test.describe.configure({ mode: "serial" });

test.describe("J06 negative forks — underpayment survives a dispute; unbilled service reaches the bill", () => {
  test.afterAll(async () => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const svc = serviceClient();

    for (const suffix of ["Under", "Unbilled"]) {
      const patientName = forkPatientName(tenant, suffix);
      const { data: patient } = await svc.from("patients").select("id").eq("hospital_id", hospital.id).eq("full_name", patientName).maybeSingle();
      if (!patient) continue;

      const { data: claims } = await svc.from("insurance_claims").select("id").eq("hospital_id", hospital.id).eq("patient_id", patient.id);
      if (claims?.length) {
        await svc.from("insurance_payment_reconciliation").delete().in("claim_id", claims.map((c) => c.id));
      }
      await svc.from("insurance_claims").delete().eq("hospital_id", hospital.id).eq("patient_id", patient.id);
      await svc.from("radiology_orders").delete().eq("hospital_id", hospital.id).eq("patient_id", patient.id);
      await svc.from("bill_line_items").delete().in(
        "bill_id",
        (await svc.from("bills").select("id").eq("hospital_id", hospital.id).eq("patient_id", patient.id)).data?.map((b) => b.id) ?? [],
      );
      await svc.from("bills").delete().eq("hospital_id", hospital.id).eq("patient_id", patient.id);
      await svc.from("admissions").delete().eq("hospital_id", hospital.id).eq("patient_id", patient.id);
      await svc.from("patients").delete().eq("id", patient.id);
    }

    // Freed unconditionally — the "Unbilled" fork's admission is the only one of the two that
    // occupies a bed, but re-running this after a failure partway through must not leave SW-02
    // stuck occupied for the next spec that needs it.
    await svc.from("beds").update({ status: "available" }).eq("hospital_id", hospital.id).eq("bed_number", "SW-02");
  });

  test("Fork 1 — a TPA underpayment survives raising a dispute; it is never zeroed", async ({ page }) => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const patientName = forkPatientName(tenant, "Under");
    const svc = serviceClient();
    const insurance = new InsurancePage(page);

    const claimedAmount = 40000;
    const paidAmount = 25000; // a genuine, deliberate shortfall — the fork under test

    let patientId = "";
    let billId = "";

    await test.step("seed the patient, an IPD bill and an approved-but-unreconciled claim directly", async () => {
      const { error: pErr } = await svc.from("patients").insert({
        hospital_id: hospital.id, full_name: patientName,
        uhid: `${hospital.uhidPrefix}NEGFORKU${tenant.toUpperCase()}1`,
        phone: tenant === "a" ? "9000000081" : "9000000082", is_active: true,
      } as never);
      expect(pErr).toBeNull();
      const { data: patient } = await svc.from("patients").select("id").eq("hospital_id", hospital.id).eq("full_name", patientName).maybeSingle();
      expect(patient).not.toBeNull();
      patientId = patient!.id;

      const { data: bill, error: bErr } = await svc.from("bills").insert({
        hospital_id: hospital.id, patient_id: patientId,
        bill_number: `TEST-NEGFORK-U-${tenant.toUpperCase()}`, bill_type: "ipd", bill_date: "2026-09-01",
        bill_status: "final", payment_status: "partial",
        subtotal: claimedAmount, gst_amount: 0, total_amount: claimedAmount, patient_payable: claimedAmount,
        balance_due: claimedAmount,
      } as never).select("id").maybeSingle();
      expect(bErr).toBeNull();
      expect(bill).not.toBeNull();
      billId = bill!.id;

      const { error: cErr } = await svc.from("insurance_claims").insert({
        hospital_id: hospital.id, bill_id: billId, patient_id: patientId,
        tpa_name: "Star Health TPA", claimed_amount: claimedAmount, status: "approved", reconciled: false,
      } as never);
      expect(cErr).toBeNull();
    });

    await test.step("Reconciliation: record a partial TPA payment — a real, deliberate underpayment", async () => {
      await insurance.open();
      await insurance.goToNav("Reconciliation");
      await insurance.recordPartialReconciliation(patientName, paidAmount);
    });

    await test.step("assert the real underpayment_amount, before any dispute is raised", async () => {
      const { data: claim, error } = await svc
        .from("insurance_claims")
        .select("underpayment_amount, reconciled, settled_amount")
        .eq("hospital_id", hospital.id).eq("patient_id", patientId).maybeSingle();
      expect(error).toBeNull();
      expect(claim).not.toBeNull();
      expect(Number(claim!.underpayment_amount)).toBe(claimedAmount - paidAmount);
      expect(Number(claim!.settled_amount)).toBe(paidAmount);
      // A genuine shortfall must never auto-reconcile — reconciled means "nothing more owed".
      expect(claim!.reconciled).toBe(false);
    });

    await test.step("raise the dispute — the form recordPartialReconciliation already opened", async () => {
      await insurance.raiseDisputeOnUnderpayment();
    });

    await test.step("assert the underpayment figure is STILL there — raising a dispute must not zero it", async () => {
      const { data: claim, error } = await svc
        .from("insurance_claims")
        .select("underpayment_amount")
        .eq("hospital_id", hospital.id).eq("patient_id", patientId).maybeSingle();
      expect(error).toBeNull();
      expect(Number(claim!.underpayment_amount)).toBe(claimedAmount - paidAmount);

      const { data: recon, error: reconErr } = await svc
        .from("insurance_payment_reconciliation")
        .select("dispute_raised, dispute_reason, reconciled")
        .eq("hospital_id", hospital.id).eq("claim_id", (await svc.from("insurance_claims").select("id").eq("hospital_id", hospital.id).eq("patient_id", patientId).maybeSingle()).data!.id)
        .maybeSingle();
      expect(reconErr).toBeNull();
      expect(recon).not.toBeNull();
      expect(recon!.dispute_raised).toBe(true);
      expect(recon!.dispute_reason).toBeTruthy();
      // A disputed shortfall is not a resolved one — still owed, still tracked.
      expect(recon!.reconciled).toBe(false);
    });
  });

  test("Fork 2 — a genuinely unbilled radiology order reaches the bill on first open", async ({ page }) => {
    const tenant = tenantOf(test.info().project.name);
    const hospital = tenant === "a" ? HOSPITAL_A : HOSPITAL_B;
    const patientName = forkPatientName(tenant, "Unbilled");
    const svc = serviceClient();
    const billing = new BillingPage(page);
    const ward = wards(tenant)[0];
    const bed = beds(tenant)[1]; // SW-02 — matches mlc-statutory-clock.spec.ts's own choice, freed by this file's own afterAll
    const study = radiologyStudy(tenant);

    let admissionId = "";

    await test.step("seed the patient, a real active admission, and a genuinely unbilled radiology order", async () => {
      const { error: pErr } = await svc.from("patients").insert({
        hospital_id: hospital.id, full_name: patientName,
        uhid: `${hospital.uhidPrefix}NEGFORKB${tenant.toUpperCase()}1`,
        phone: tenant === "a" ? "9000000083" : "9000000084", is_active: true,
      } as never);
      expect(pErr).toBeNull();
      const { data: patient } = await svc.from("patients").select("id").eq("hospital_id", hospital.id).eq("full_name", patientName).maybeSingle();
      expect(patient).not.toBeNull();

      const { data: admission, error: aErr } = await svc.from("admissions").insert({
        hospital_id: hospital.id, patient_id: patient!.id,
        admitting_doctor_id: staffUserId(tenant, "doctor"),
        ward_id: ward.id, bed_id: bed.id, status: "active",
      } as never).select("id").maybeSingle();
      expect(aErr).toBeNull();
      expect(admission).not.toBeNull();
      admissionId = admission!.id;
      await svc.from("beds").update({ status: "occupied" }).eq("id", bed.id);

      // No bill exists yet for this admission at all — openIpdBillFor's deep link is what
      // creates one (findOrCreateAdmissionBill), matching a real discharge-time first visit
      // to the bill editor, not a pre-existing one this test seeded itself.
      const { error: rErr } = await svc.from("radiology_orders").insert({
        hospital_id: hospital.id, patient_id: patient!.id, admission_id: admissionId,
        modality_id: study.modalityId, modality_type: "other", study_name: study.studyName,
        ordered_by: staffUserId(tenant, "doctor"), status: "reported", billed: false,
      } as never);
      expect(rErr).toBeNull();
    });

    // openIpdBillFor's deep link creates a fresh draft bill for this admission
    // (findOrCreateAdmissionBill) and BillEditor.tsx auto-fires autoPullAdmissionCharges once on
    // mount for any draft admission bill — this pulls EVERY unbilled lab/radiology/pharmacy
    // order tied to the admission automatically, no manual "Scan Unbilled" click needed. This is
    // also the exact code path (ipdBilling.ts's addUniqueAncillaryItem, batched alongside the
    // room/nursing/consultation items that omit payment_status) Part 4's own research uncovered
    // as broken: PostgREST silently NULLs a column missing from only SOME rows of one bulk
    // insert rather than applying the table default, so this whole pull previously failed
    // outright — including this radiology charge — whenever a room/nursing charge was ALSO due
    // in the same cycle (fixed in src/lib/ipdBilling.ts and src/lib/serviceBilling.ts, this pass).
    await test.step("open the IPD bill (creates it fresh) and let the automatic sweep run", async () => {
      await billing.openIpdBillFor(admissionId);
    });

    await test.step("assert the real bill_line_items row — not just that the tab loaded", async () => {
      const { data: bill } = await svc.from("bills").select("id").eq("hospital_id", hospital.id).eq("admission_id", admissionId).eq("bill_type", "ipd").maybeSingle();
      expect(bill).not.toBeNull();

      const { data: lineItems, error } = await svc
        .from("bill_line_items")
        .select("id, source_module, total_amount, description, payment_status")
        .eq("bill_id", bill!.id)
        .eq("source_module", "radiology");

      expect(error).toBeNull();
      expect(lineItems).toHaveLength(1);
      expect(lineItems![0].description).toBe(`Radiology: ${study.studyName}`);
      expect(Number(lineItems![0].total_amount)).toBeGreaterThan(0);
      // The actual regression assertion: a NULL here is exactly what the NOT NULL constraint
      // used to reject, taking the whole batch (this row included) down with it.
      expect(lineItems![0].payment_status).toBe("advance_covered");
    });
  });
});
