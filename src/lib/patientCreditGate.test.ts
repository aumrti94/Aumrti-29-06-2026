/**
 * patientCreditGate — pure-function tests.
 *
 * The most important case here is parsePatientCreditPolicy falling back to the default
 * approver set when a configured role doesn't exist — the direct regression test for the
 * "billing_supervisor" incident appRoles.ts's own header documents: a role offered as an
 * approver that no user can actually hold means an above-cap grant becomes permanently
 * unapprovable, with no visible error at the point it was misconfigured.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_PATIENT_CREDIT_POLICY,
  parsePatientCreditPolicy,
  serialisePatientCreditPolicy,
  isAboveCap,
  canApproveCreditGrant,
} from "@/lib/patientCreditGate";

describe("parsePatientCreditPolicy", () => {
  it("returns the default (disabled) when the settings row is absent", () => {
    expect(parsePatientCreditPolicy(null)).toEqual(DEFAULT_PATIENT_CREDIT_POLICY);
    expect(parsePatientCreditPolicy(undefined)).toEqual(DEFAULT_PATIENT_CREDIT_POLICY);
  });

  it("never throws on malformed input", () => {
    expect(() => parsePatientCreditPolicy("not an object")).not.toThrow();
    expect(() => parsePatientCreditPolicy(42)).not.toThrow();
    expect(() => parsePatientCreditPolicy([1, 2, 3])).not.toThrow();
    expect(parsePatientCreditPolicy("garbage")).toEqual(DEFAULT_PATIENT_CREDIT_POLICY);
  });

  it("reads a well-formed stored policy", () => {
    const parsed = parsePatientCreditPolicy({
      enabled: true,
      per_transaction_cap: 5000,
      approver_roles: ["cfo", "hospital_admin"],
    });
    expect(parsed).toEqual({
      enabled: true,
      perTransactionCap: 5000,
      approverRoles: ["cfo", "hospital_admin"],
    });
  });

  it("falls back to the default approver set when a role doesn't exist in APP_ROLES — the billing_supervisor regression", () => {
    const parsed = parsePatientCreditPolicy({
      enabled: true,
      per_transaction_cap: 2000,
      approver_roles: ["billing_supervisor"],
    });
    // Must NOT silently keep an unsatisfiable approver set — falls back wholesale.
    expect(parsed.approverRoles).toEqual(DEFAULT_PATIENT_CREDIT_POLICY.approverRoles);
    expect(parsed.approverRoles).not.toContain("billing_supervisor");
  });

  it("falls back to the default when approver_roles mixes a valid and an invalid role", () => {
    // Partial validity is still treated as untrustworthy — a role editor updated after the
    // fact could otherwise leave one dead entry silently reducing the approver pool.
    const parsed = parsePatientCreditPolicy({
      approver_roles: ["cfo", "billing_supervisor"],
    });
    expect(parsed.approverRoles).toEqual(DEFAULT_PATIENT_CREDIT_POLICY.approverRoles);
  });

  it("falls back to the default cap when per_transaction_cap is missing or negative", () => {
    expect(parsePatientCreditPolicy({ enabled: true }).perTransactionCap).toBe(
      DEFAULT_PATIENT_CREDIT_POLICY.perTransactionCap
    );
    expect(parsePatientCreditPolicy({ per_transaction_cap: -100 }).perTransactionCap).toBe(
      DEFAULT_PATIENT_CREDIT_POLICY.perTransactionCap
    );
  });

  it("accepts a zero cap (everything requires approval) rather than treating it as missing", () => {
    expect(parsePatientCreditPolicy({ per_transaction_cap: 0 }).perTransactionCap).toBe(0);
  });
});

describe("serialisePatientCreditPolicy", () => {
  it("round-trips through parse", () => {
    const policy = { enabled: true, perTransactionCap: 3000, approverRoles: ["super_admin"] };
    expect(parsePatientCreditPolicy(serialisePatientCreditPolicy(policy))).toEqual(policy);
  });
});

describe("isAboveCap", () => {
  const policy = { ...DEFAULT_PATIENT_CREDIT_POLICY, perTransactionCap: 2000 };
  it("is false at or below the cap", () => {
    expect(isAboveCap(2000, policy)).toBe(false);
    expect(isAboveCap(1999, policy)).toBe(false);
  });
  it("is true above the cap", () => {
    expect(isAboveCap(2001, policy)).toBe(true);
  });
});

describe("canApproveCreditGrant", () => {
  const policy = { ...DEFAULT_PATIENT_CREDIT_POLICY, approverRoles: ["cfo", "hospital_admin"] };
  it("allows a configured role", () => {
    expect(canApproveCreditGrant("cfo", policy)).toBe(true);
  });
  it("rejects a role not on the list", () => {
    expect(canApproveCreditGrant("billing_staff", policy)).toBe(false);
  });
  it("rejects a null/undefined role", () => {
    expect(canApproveCreditGrant(null, policy)).toBe(false);
    expect(canApproveCreditGrant(undefined, policy)).toBe(false);
  });
});
