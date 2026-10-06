/**
 * Phase 10 (docs/testing/PHASED_TEST_PLAN.md) — scan-lab-tests.
 *
 * KNOWN-BUG-129 (shared entry with scan-invoice/scan-drug-list) — see scan-invoice.test.ts for
 * the full writeup. Same defect, same fix, same identically-shaped sibling.
 */
import { describe, it, expect } from "vitest";
import { callFunction, edgeRuntimeReachable, tokenFor } from "../fixtures/edgeFunctionClient";
import { HOSPITAL_A, HOSPITAL_B } from "../fixtures/constants";
import { assertLocalTarget } from "../fixtures/guard";

assertLocalTarget(process.env.SUPABASE_URL ?? "http://127.0.0.1:54321", process.env.SUPABASE_PROJECT_REF);
const runtimeUp = await edgeRuntimeReachable();

const TINY_IMAGE = "aGVsbG8=";

describe.skipIf(!runtimeUp)("scan-lab-tests", () => {
  it("1. no Authorization header is rejected", async () => {
    const res = await callFunction("scan-lab-tests", {
      token: null,
      body: { base64Image: TINY_IMAGE, hospital_id: HOSPITAL_A.id },
    });
    expect(res.status).toBe(401);
  });

  it("2. a garbage bearer token is rejected", async () => {
    const res = await callFunction("scan-lab-tests", {
      token: "garbage",
      body: { base64Image: TINY_IMAGE, hospital_id: HOSPITAL_A.id },
    });
    expect(res.status).toBe(401);
  });

  it("3. a real session naming a hospital it does not belong to is rejected — the actual fix under test", async () => {
    const token = await tokenFor("b", "hospital_admin");
    const res = await callFunction("scan-lab-tests", {
      token,
      body: { base64Image: TINY_IMAGE, hospital_id: HOSPITAL_A.id },
    });
    expect(res.status).toBe(403);
  });

  it("4. a real session naming its own hospital reaches the AI-config boundary honestly", async () => {
    const token = await tokenFor("a", "hospital_admin");
    const res = await callFunction("scan-lab-tests", {
      token,
      body: { base64Image: TINY_IMAGE, hospital_id: HOSPITAL_A.id },
    });
    expect(res.status).toBe(503);
    expect(res.json.error).toMatch(/No AI provider configured/);
  });

  it("5. missing base64Image is a clean error, not a raw stack trace", async () => {
    const token = await tokenFor("a", "hospital_admin");
    const res = await callFunction("scan-lab-tests", { token, body: { hospital_id: HOSPITAL_A.id } });
    expect(res.status).not.toBe(200);
    expect(res.text).not.toMatch(/at\s+\S+\s+\(.*:\d+:\d+\)/);
  });
});
