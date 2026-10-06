/**
 * patientCreditGate — per-hospital policy for "Pay Later" (patient credit) on
 * OPD Laboratory and Radiology orders.
 *
 * Mirrors ipdAncillaryGate.ts's shape deliberately: a hospital_settings JSONB
 * key, a typed policy, a never-throws parser, and a default that means
 * "nothing changed" when the key is absent — the same "absence = no new
 * behaviour" convention ipdAncillaryGate uses (not dayCareGate's "absence =
 * gate on"), because this touches the busiest OPD path in the product. A
 * hospital that has never configured this must see the exact same modal it
 * saw yesterday.
 *
 * There is no clearance-gate function here (unlike ipdAncillaryGate's
 * evaluateAncillaryGate) because OPD credit has no separate "delivery" step
 * to block — the grant decision happens once, at order-creation time, inside
 * the Collect Payment modal itself.
 */

import { supabase } from "@/integrations/supabase/client";
import { APP_ROLES } from "@/lib/appRoles";

export interface PatientCreditPolicy {
  /** Master switch. Default false — absence of the settings row means "off". */
  enabled: boolean;
  /** Above this amount, a supervisor must re-authenticate before granting. */
  perTransactionCap: number;
  /** Roles permitted to re-authenticate an above-cap grant. */
  approverRoles: string[];
}

/**
 * "hospital_admin" / "super_admin" / "cfo" is the existing precedent for a
 * finance-authority action in this codebase — see DailyCashClosurePage's
 * canReopen. There is no "billing_supervisor" role; see appRoles.ts's own
 * header for why inventing one here would be the same mistake again.
 */
export const DEFAULT_PATIENT_CREDIT_POLICY: PatientCreditPolicy = {
  enabled: false,
  perTransactionCap: 2000,
  approverRoles: ["super_admin", "hospital_admin", "cfo"],
};

/** hospital_settings key holding the policy. */
export const PATIENT_CREDIT_POLICY_KEY = "patient_credit_payment";

const VALID_ROLE_VALUES = new Set(APP_ROLES.map((r) => r.value));

/**
 * PURE. Never throws — a malformed settings row must not block the counter.
 *
 * An approverRoles list containing a value that isn't a real app_role (the
 * "billing_supervisor" shape of mistake) falls back to the default set
 * wholesale, rather than silently producing an approver set nobody can ever
 * satisfy — which would make every above-cap grant permanently unapprovable
 * with no visible error.
 */
export function parsePatientCreditPolicy(value: unknown): PatientCreditPolicy {
  const d = DEFAULT_PATIENT_CREDIT_POLICY;
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...d };
  const v = value as Record<string, unknown>;

  const enabled = typeof v.enabled === "boolean" ? v.enabled : d.enabled;

  const capRaw = Number(v.per_transaction_cap);
  const perTransactionCap = Number.isFinite(capRaw) && capRaw >= 0 ? capRaw : d.perTransactionCap;

  const rolesRaw = Array.isArray(v.approver_roles)
    ? v.approver_roles.filter((r): r is string => typeof r === "string")
    : null;
  const rolesValid = rolesRaw && rolesRaw.length > 0 && rolesRaw.every((r) => VALID_ROLE_VALUES.has(r));

  return {
    enabled,
    perTransactionCap,
    approverRoles: rolesValid ? rolesRaw! : [...d.approverRoles],
  };
}

/** PURE. TS camelCase → the snake_case JSONB actually stored. */
export function serialisePatientCreditPolicy(p: PatientCreditPolicy): Record<string, unknown> {
  return {
    enabled: p.enabled,
    per_transaction_cap: p.perTransactionCap,
    approver_roles: p.approverRoles,
  };
}

export async function fetchPatientCreditPolicy(hospitalId: string): Promise<PatientCreditPolicy> {
  const { data } = await (supabase as any)
    .from("hospital_settings")
    .select("value")
    .eq("hospital_id", hospitalId)
    .eq("key", PATIENT_CREDIT_POLICY_KEY)
    .maybeSingle();
  return parsePatientCreditPolicy(data?.value);
}

/** PURE. Whether this amount needs supervisor re-authentication before granting. */
export function isAboveCap(amount: number, policy: PatientCreditPolicy): boolean {
  return amount > policy.perTransactionCap;
}

/** PURE. Role check for the above-cap re-authentication. */
export function canApproveCreditGrant(
  role: string | null | undefined,
  policy: PatientCreditPolicy
): boolean {
  if (!role) return false;
  return policy.approverRoles.includes(role);
}
