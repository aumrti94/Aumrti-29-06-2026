/**
 * Phase 8.5 — local approximation of the "40 simultaneous users on one tenant, zero lost
 * writes, zero cross-tenant reads under load" concurrency gate.
 *
 * NOT the real Phase 8.5 gate. The plan (docs/testing/PHASED_TEST_PLAN.md §8.5) scopes this
 * against cloud staging; this runs against local Supabase instead — same Postgres/PostgREST/RLS
 * engine, not the same environment. What it DOES prove for real: whether the atomic-numbering
 * and dedupe mechanisms this codebase already built for exactly this problem (opd_token_sequence,
 * the bills numbering trigger, clinical_alerts' dedupe constraint) actually hold when hit by real
 * concurrent requests — not just sequentially, which is all any existing test in this repo does.
 * A race condition is, definitionally, a bug that only shows up under real concurrency.
 *
 * Fires real writes through `tenantClient()` — authenticated, RLS-scoped sessions, the same path
 * the app itself uses — rather than the service-role client, so RLS is genuinely exercised under
 * contention, not bypassed.
 *
 * Both hospitals are loaded SIMULTANEOUSLY and interleaved on purpose: isolation proven at rest
 * (Phase 4) is not the same claim as isolation holding while both tenants are writing at once.
 */
import { describe, it, expect, afterAll } from "vitest";
import {
  HOSPITAL_A, HOSPITAL_B, TEST_PASSWORD, staffEmail, staffUserId, tenantOf, type TenantKey,
} from "../fixtures/constants";
import { serviceClient, tenantClient } from "../fixtures/serviceClient";
import { assertLocalTarget } from "../fixtures/guard";

assertLocalTarget(process.env.SUPABASE_URL ?? "http://127.0.0.1:54321", process.env.SUPABASE_PROJECT_REF);

const RUN_TAG = `LoadTest${Date.now()}`;
const WRITES_PER_HOSPITAL = 20; // 20 + 20 = 40, matching the plan's own "40 simultaneous users"

function fixturePatientName(tenant: TenantKey, i: number): string {
  return `${RUN_TAG} Patient ${tenant.toUpperCase()}${i}`;
}

const svc = serviceClient();
let clientA: Awaited<ReturnType<typeof tenantClient>>;
let clientB: Awaited<ReturnType<typeof tenantClient>>;

async function getClients() {
  if (!clientA) clientA = await tenantClient(staffEmail("a", "hospital_admin"), TEST_PASSWORD);
  if (!clientB) clientB = await tenantClient(staffEmail("b", "hospital_admin"), TEST_PASSWORD);
  return { clientA, clientB };
}

afterAll(async () => {
  // Best-effort cleanup, scoped tightly to this run's own tag — never touches the shared
  // Tier-0 fixture rows every other spec in this suite depends on.
  for (const hospital of [HOSPITAL_A, HOSPITAL_B]) {
    const { data: patients } = await svc
      .from("patients").select("id").eq("hospital_id", hospital.id).ilike("full_name", `${RUN_TAG}%`);
    const ids = (patients ?? []).map((p) => p.id);
    if (ids.length === 0) continue;
    await svc.from("opd_tokens").delete().in("patient_id", ids);
    const { data: bills } = await svc.from("bills").select("id").in("patient_id", ids);
    if (bills?.length) await svc.from("bills").delete().in("id", bills.map((b) => b.id));
    await svc.from("patients").delete().in("id", ids);
  }
  await svc.from("clinical_alerts").delete().eq("dedupe_key", `${RUN_TAG}:race`);
});

describe("Phase 8.5 (local approximation) — concurrent writes across both hospitals", () => {
  it(
    `${WRITES_PER_HOSPITAL * 2} concurrent OPD token issuances (both hospitals, one doctor each): no lost writes, no duplicate numbers, no cross-tenant bleed`,
    { timeout: 60_000 },
    async () => {
      const { clientA, clientB } = await getClients();
      const doctorA = staffUserId("a", "doctor");
      const doctorB = staffUserId("b", "doctor");

      // One shared doctor per hospital — the worst case for the atomic sequence generator,
      // since every concurrent insert within a hospital contends on the SAME
      // opd_token_sequences row (hospital_id, doctor_key, prefix='A').
      const issueToken = async (client: typeof clientA, hospital: typeof HOSPITAL_A, tenant: TenantKey, doctorId: string, i: number) => {
        const { data: patient, error: pErr } = await client
          .from("patients")
          .insert({
            hospital_id: hospital.id,
            full_name: fixturePatientName(tenant, i),
            uhid: `${hospital.uhidPrefix}${RUN_TAG}${i}`,
            phone: "9000000001",
            is_active: true,
          } as never)
          .select("id")
          .maybeSingle();
        if (pErr || !patient) throw new Error(`patient insert failed (${tenant}#${i}): ${pErr?.message}`);

        const { data: token, error: tErr } = await client
          .from("opd_tokens")
          .insert({
            hospital_id: hospital.id,
            patient_id: patient.id,
            doctor_id: doctorId,
            status: "waiting",
          } as never)
          .select("token_number")
          .maybeSingle();
        if (tErr || !token) throw new Error(`token insert failed (${tenant}#${i}): ${tErr?.message}`);
        return token.token_number as string;
      };

      // Interleaved Promise.all across BOTH hospitals — genuinely concurrent, not
      // sequential-per-hospital, so hospital A and B's writes race against each other too.
      const jobs: Promise<{ tenant: TenantKey; tokenNumber: string }>[] = [];
      for (let i = 1; i <= WRITES_PER_HOSPITAL; i++) {
        jobs.push(issueToken(clientA, HOSPITAL_A, "a", doctorA, i).then((tokenNumber) => ({ tenant: "a" as TenantKey, tokenNumber })));
        jobs.push(issueToken(clientB, HOSPITAL_B, "b", doctorB, i).then((tokenNumber) => ({ tenant: "b" as TenantKey, tokenNumber })));
      }
      const results = await Promise.all(jobs);

      const tokensA = results.filter((r) => r.tenant === "a").map((r) => r.tokenNumber);
      const tokensB = results.filter((r) => r.tenant === "b").map((r) => r.tokenNumber);

      // No lost writes: every one of the WRITES_PER_HOSPITAL concurrent calls produced a row.
      expect(tokensA).toHaveLength(WRITES_PER_HOSPITAL);
      expect(tokensB).toHaveLength(WRITES_PER_HOSPITAL);

      // No duplicate numbers within a hospital, despite every write racing on the same
      // sequence row — this is the actual atomicity claim under test.
      expect(new Set(tokensA).size).toBe(WRITES_PER_HOSPITAL);
      expect(new Set(tokensB).size).toBe(WRITES_PER_HOSPITAL);

      // Isolation under load, not just at rest: hospital A's own RLS-scoped read of today's
      // tokens must contain none of hospital B's patients from this run, and vice versa —
      // asked DURING the same load's aftermath, through the real RLS-scoped client, not the
      // service-role ground-truth client.
      const { data: aVisible } = await clientA
        .from("patients").select("full_name").ilike("full_name", `${RUN_TAG} Patient B%`);
      expect(aVisible ?? []).toHaveLength(0);

      const { data: bVisible } = await clientB
        .from("patients").select("full_name").ilike("full_name", `${RUN_TAG} Patient A%`);
      expect(bVisible ?? []).toHaveLength(0);

      // Ground truth (service-role, bypasses RLS): confirm the "invisible" rows genuinely
      // exist rather than the negative assertions above passing vacuously because nothing
      // was ever written for the other tenant.
      const { data: bGroundTruth } = await svc
        .from("patients").select("id").eq("hospital_id", HOSPITAL_B.id).ilike("full_name", `${RUN_TAG}%`);
      expect(bGroundTruth?.length ?? 0).toBe(WRITES_PER_HOSPITAL);
    },
  );

  it(
    `${WRITES_PER_HOSPITAL * 2} concurrent standalone bill creations (both hospitals): no lost writes, no duplicate bill_number`,
    { timeout: 60_000 },
    async () => {
      const { clientA, clientB } = await getClients();

      const createBill = async (client: typeof clientA, hospital: typeof HOSPITAL_A, tenant: TenantKey, i: number) => {
        const { data: patient, error: pErr } = await client
          .from("patients")
          .insert({
            hospital_id: hospital.id,
            full_name: `${fixturePatientName(tenant, i)} Bill`,
            uhid: `${hospital.uhidPrefix}${RUN_TAG}BILL${i}`,
            phone: "9000000002",
            is_active: true,
          } as never)
          .select("id")
          .maybeSingle();
        if (pErr || !patient) throw new Error(`patient insert failed (${tenant}#${i}): ${pErr?.message}`);

        // bill_number omitted deliberately — the BEFORE INSERT trigger mints it inside this
        // same transaction (20261008000161), the exact mechanism under test here.
        const { data: bill, error: bErr } = await client
          .from("bills")
          .insert({
            hospital_id: hospital.id,
            patient_id: patient.id,
            bill_type: "opd",
            bill_date: new Date().toISOString().split("T")[0],
            bill_status: "final",
            payment_status: "unpaid",
            subtotal: 0,
            gst_amount: 0,
            total_amount: 0,
            patient_payable: 0,
            balance_due: 0,
          } as never)
          .select("bill_number")
          .maybeSingle();
        if (bErr || !bill) throw new Error(`bill insert failed (${tenant}#${i}): ${bErr?.message}`);
        return bill.bill_number as string;
      };

      const jobs: Promise<{ tenant: TenantKey; billNumber: string }>[] = [];
      for (let i = 1; i <= WRITES_PER_HOSPITAL; i++) {
        jobs.push(createBill(clientA, HOSPITAL_A, "a", i).then((billNumber) => ({ tenant: "a" as TenantKey, billNumber })));
        jobs.push(createBill(clientB, HOSPITAL_B, "b", i).then((billNumber) => ({ tenant: "b" as TenantKey, billNumber })));
      }
      const results = await Promise.all(jobs);

      const billsA = results.filter((r) => r.tenant === "a").map((r) => r.billNumber);
      const billsB = results.filter((r) => r.tenant === "b").map((r) => r.billNumber);

      expect(billsA).toHaveLength(WRITES_PER_HOSPITAL);
      expect(billsB).toHaveLength(WRITES_PER_HOSPITAL);
      expect(new Set(billsA).size).toBe(WRITES_PER_HOSPITAL);
      expect(new Set(billsB).size).toBe(WRITES_PER_HOSPITAL);
    },
  );

  it(
    "15 concurrent inserts sharing one dedupe_key collapse to exactly 1 row — clinical_alerts' dedupe guarantee under a real race, not a sequential retry",
    { timeout: 30_000 },
    async () => {
      const { clientA } = await getClients();
      const dedupeKey = `${RUN_TAG}:race`;

      const raiseAlert = () =>
        clientA
          .from("clinical_alerts")
          .upsert(
            {
              hospital_id: HOSPITAL_A.id,
              alert_type: "lab_tat_overdue",
              severity: "medium",
              alert_message: `${RUN_TAG} concurrent-race fixture alert`,
              dedupe_key: dedupeKey,
            } as never,
            { onConflict: "hospital_id,alert_type,dedupe_key", ignoreDuplicates: true },
          );

      // All 15 fired in the same tick — genuinely concurrent, unlike every existing dedupe
      // test in this repo ("save it, then save it again"), which can never catch a race where
      // two callers both pass the "does it exist yet" check before either has committed.
      const outcomes = await Promise.all(Array.from({ length: 15 }, () => raiseAlert()));
      const errors = outcomes.map((o) => o.error).filter(Boolean);
      expect(errors).toEqual([]);

      const { data: rows, error } = await svc
        .from("clinical_alerts")
        .select("id")
        .eq("hospital_id", HOSPITAL_A.id)
        .eq("dedupe_key", dedupeKey);
      expect(error).toBeNull();
      expect(rows).toHaveLength(1);
    },
  );
});
