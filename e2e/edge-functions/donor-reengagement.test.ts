/**
 * Phase 10 (docs/testing/PHASED_TEST_PLAN.md) — donor-reengagement.
 *
 * Pure regression coverage, no fix in this pass. Named in KNOWN-BUG-126's original Phase 4
 * cross-tenant audit (category (c)) and fixed there (2026-09-12): the caller's own
 * `users.hospital_id` is checked against the request's `hospital_id` before reading blood
 * inventory or triggering a real WhatsApp/SMS campaign. Re-read directly this pass, confirmed
 * still intact — this file exists so a future edit can't silently reopen it.
 *
 * Unlike razorpay-lookup, this function runs to genuine completion even with nothing configured
 * — it just sends zero messages when the hospital has no WhatsApp provider set up, which is the
 * real local fixture state. Every successful call inserts a `donor_campaigns` row, cleaned up in
 * afterAll.
 */
import { describe, it, expect, afterAll } from "vitest";
import { callFunction, edgeRuntimeReachable, tokenFor } from "../fixtures/edgeFunctionClient";
import { serviceClient } from "../fixtures/serviceClient";
import { HOSPITAL_A, HOSPITAL_B } from "../fixtures/constants";
import { assertLocalTarget } from "../fixtures/guard";

assertLocalTarget(process.env.SUPABASE_URL ?? "http://127.0.0.1:54321", process.env.SUPABASE_PROJECT_REF);
const runtimeUp = await edgeRuntimeReachable();

afterAll(async () => {
  if (!runtimeUp) return;
  const svc = serviceClient();
  await svc.from("donor_campaigns").delete().eq("hospital_id", HOSPITAL_A.id).eq("campaign_type", "low_inventory");
});

describe.skipIf(!runtimeUp)("donor-reengagement", () => {
  it("1. no Authorization header is rejected", async () => {
    const res = await callFunction("donor-reengagement", {
      token: null,
      body: { hospital_id: HOSPITAL_A.id },
    });
    expect(res.status).toBe(401);
  });

  it("2. missing hospital_id is a clean 400", async () => {
    const token = await tokenFor("a", "hospital_admin");
    const res = await callFunction("donor-reengagement", { token, body: {} });
    expect(res.status).toBe(400);
  });

  it("3. a real session naming a hospital it does not belong to is rejected — the KNOWN-BUG-126 regression", async () => {
    const token = await tokenFor("b", "hospital_admin");
    const res = await callFunction("donor-reengagement", {
      token,
      body: { hospital_id: HOSPITAL_A.id },
    });
    expect(res.status).toBe(403);
  });

  it("4. a real session naming its own hospital reaches genuine completion, sending zero messages with no WhatsApp provider configured", async () => {
    const token = await tokenFor("a", "hospital_admin");
    const res = await callFunction("donor-reengagement", {
      token,
      body: { hospital_id: HOSPITAL_A.id },
    });
    expect(res.status).toBe(200);
    expect(["completed", "no_action"]).toContain(res.json.status);
    expect(res.json.messages_sent ?? 0).toBe(0);
    if (res.json.status === "completed") {
      expect(res.json.hospital_whatsapp_configured).toBe(false);
    }
  });
});
