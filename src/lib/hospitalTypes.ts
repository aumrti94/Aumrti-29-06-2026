// Granular hospital-type taxonomy used by the registration wizard (two-step broad-category →
// specific-type picker) and by post-registration module defaulting (Step7bModules). This is the
// single source of truth for "what modules does a hospital of type X typically need" — do not
// re-introduce a second, smaller preset list elsewhere (see Step7bModules.tsx history).
//
// Module names in `core` / `conditional` / `optional` / `usuallyNotRequired` below MUST match the
// `name` field of an entry in `ALL_MODULES` (src/lib/modules.ts) exactly — validated at the bottom
// of this file with a dev-only console warning (never thrown — a typo here must never break
// registration).
//
// `coarseType` is what actually gets written to the `hospitals.type` Postgres ENUM
// (general | specialty | clinic | nursing_home) by supabase/functions/register-hospital — the
// granular `key` itself is preserved verbatim in the free-text `hospitals.hospital_category`
// column (migration 20260911000001_register_hospital_fields.sql already added it; no new
// migration needed for this taxonomy).
import { ALL_MODULES } from "./modules";

export type BroadHospitalCategory =
  | "general_multispecialty"
  | "specialty_hospitals"
  | "diagnostic_procedure"
  | "traditional_preventive";

export const BROAD_CATEGORIES: { key: BroadHospitalCategory; label: string }[] = [
  { key: "general_multispecialty", label: "General & Multi-specialty" },
  { key: "specialty_hospitals", label: "Specialty Hospitals" },
  { key: "diagnostic_procedure", label: "Diagnostic & Procedure Centres" },
  { key: "traditional_preventive", label: "Traditional & Preventive" },
];

/** Coarse Postgres ENUM stored on hospitals.type. */
export type CoarseHospitalType = "general" | "specialty" | "clinic" | "nursing_home";

export interface HospitalTypeDefinition {
  key: string;
  label: string;
  broadCategory: BroadHospitalCategory;
  coarseType: CoarseHospitalType;
  /** Always-needed modules distinguishing this type (Billing & Medical Records are implied for
   *  every type via BASELINE_CORE_MODULES below and intentionally omitted from each entry). */
  core: string[];
  /** Needed depending on bed count / sub-model — surfaced as "ask about this" in later UI. */
  conditional: string[];
  /** Nice-to-have, commonly added later. */
  optional: string[];
  /** Actively mismatched with this type of facility — hidden/de-prioritised by default. */
  usuallyNotRequired: string[];
  /** AYUSH only — secondary multi-select ("which system(s) do you practice") in the registration UI. */
  subSystems?: string[];
  /** True for the three base types the "Teaching Institution" checkbox overlay applies to. */
  teachingOverlayEligible?: boolean;
  /** True when this entry's bucket assignment was extrapolated from the OPD/IPD/bed-count
   *  pattern rather than sourced from the founder-reviewed matrix (see registration taxonomy
   *  build report). Kept so a later pass can re-review these specifically. */
  inferred?: boolean;
  /** Best-guess `subscription_plans.slug` to highlight/pre-select on the registration wizard's
   *  Choose Plan step (Step4ChoosePlan.tsx) once this type has been picked in Step 1. This is a
   *  SUGGESTION, never a filter — every plan stays pickable regardless of this value; the founder
   *  was explicit that over-filtering risks losing an edge-case hospital that doesn't fit the mould.
   *
   *  Slugs and their actual plan_features (checked against supabase/migrations — not guessed):
   *    "clinic"       — Clinic & Day Care (₹2,499/mo, ≤15 beds). plan_features enables only opd,
   *                     day_care, billing, payments, day_closure, pharmacy_retail, lab,
   *                     patient_portal, inbox, settings, ai_suite. No IPD/OT, no named specialty
   *                     EMR, no Insurance/TPA, no Radiology.
   *    "starter"      — Starter (₹8,999/mo + ₹750/10 extra beds). Adds ipd, emergency, nursing,
   *                     radiology, pharmacy (IP), hr, inventory. Still no insurance, quality/NABH,
   *                     blood_bank, or any named specialty EMR (oncology, dialysis, ivf, ayush,
   *                     dental, mental_health, physio, dietetics, home_care, vaccination,
   *                     health_packages, neonatal, obstetric_anc, ophthalmology...).
   *    "professional" — Professional (₹17,999/mo + ₹950/10 extra beds). Every module ON,
   *                     including every named specialty EMR above, Insurance/TPA, Quality & NABH,
   *                     OT, Govt Schemes/PMJAY, Govt HMIS, ABDM, AI.
   *    "enterprise"   — Enterprise (custom pricing). Identical plan_features to Professional;
   *                     sold on multi-branch/white-label/SLA for chains and 250+-bed hospitals —
   *                     used here only for the explicitly large-scale / government-&-PSU-network
   *                     / tertiary-referral types, where Aumrti's negotiated-contract motion fits
   *                     the real procurement process better than self-serve (flagged per entry).
   *
   *  Rule applied: the cheapest plan whose plan_features cover every module in this type's `core`
   *  list, so the suggestion never leaves a hospital unable to chart its own specialty — with the
   *  enterprise override above layered on top for scale/procurement reasons, not module fit.
   *
   *  Net effect, surfaced here rather than papered over: because Clinic and Starter carry almost
   *  no named specialty modules, any type whose core includes one (Oncology, Dialysis, IVF,
   *  AYUSH, Dental, Physiotherapy, Mental Health, Chronic Disease, Home Care, Dietetics, Health
   *  Packages, Vaccination, Neonatal EMR, Obstetric ANC, Ophthalmology EMR...) lands on
   *  "professional" regardless of how small the facility physically is — see the "PLAN FIT GAP"
   *  comments on the entries below where that produces a genuine price/size mismatch worth the
   *  founder's attention, not something this mapping should force a fit for. */
  defaultPlanSlug: "clinic" | "starter" | "professional" | "enterprise";
}

/** Implied Core for every single hospital type — not repeated per entry. */
export const BASELINE_CORE_MODULES = ["Billing", "Medical Records"];

export const HOSPITAL_TYPES: HospitalTypeDefinition[] = [
  // ───────────────────────── GENERAL & MULTI-SPECIALTY ─────────────────────────
  {
    key: "clinic_polyclinic",
    label: "Clinic / Polyclinic",
    broadCategory: "general_multispecialty",
    coarseType: "clinic",
    core: ["OPD Queue", "Pharmacy Retail", "Patient Portal"],
    conditional: ["Laboratory (LIS)", "Radiology (RIS)", "Day Care Unit", "Insurance / TPA"],
    optional: ["Telemedicine", "Health Packages", "Quick Scribe", "CRM & Marketing", "Communication Inbox", "ABDM / ABHA", "Notifications", "HR & Payroll", "Inventory & Stores"],
    usuallyNotRequired: ["IPD / Wards", "Operation Theatre", "Emergency", "Blood Bank", "CSSD", "Dialysis Unit", "Oncology", "Mortuary & Medico-Legal", "Biomedical Engineering", "FMS / Safety", "Accounts / ERP", "Financial Statements", "Budget Management", "Fixed Assets Register", "Research Platform", "JCI Accreditation", "MCI / Disaster Response", "Govt HMIS Reporting"],
    inferred: true,
    defaultPlanSlug: "clinic",
  },
  {
    key: "nursing_home_small_hospital",
    label: "Nursing Home / Small Hospital",
    broadCategory: "general_multispecialty",
    coarseType: "nursing_home",
    core: ["OPD Queue", "IPD / Wards", "Pharmacy Retail", "Pharmacy (IP)", "Patient Portal"],
    conditional: ["Operation Theatre", "Day Care Unit", "Laboratory (LIS)", "Radiology (RIS)", "Insurance / TPA", "Emergency", "HR & Payroll", "Inventory & Stores"],
    optional: ["Telemedicine", "Ambulance Service", "Quality & NABH", "CRM & Marketing", "Communication Inbox", "ABDM / ABHA", "Notifications"],
    usuallyNotRequired: ["Blood Bank", "CSSD", "Dialysis Unit", "Oncology", "Mortuary & Medico-Legal", "Research Platform", "JCI Accreditation", "Govt HMIS Reporting", "Population Health", "Revenue Intelligence", "AI Clinical Intelligence"],
    inferred: true,
    // No OT/Insurance/Blood Bank/Quality in core — Starter's opd+ipd+day_care+radiology+lab+
    // pharmacy(+retail)+hr+inventory+patient_portal set already covers this type's full core list.
    defaultPlanSlug: "starter",
  },
  {
    key: "phc_chc",
    label: "PHC / CHC (Govt Primary / Community Health Centre)",
    broadCategory: "general_multispecialty",
    coarseType: "general",
    core: ["OPD Queue", "Laboratory (LIS)", "Pharmacy Retail", "Vaccination", "Obstetric ANC"],
    conditional: ["IPD / Wards", "Govt HMIS Reporting", "Ambulance Service", "Govt Schemes / PMJAY", "Insurance / TPA"],
    optional: ["Telemedicine", "Dietetics & Nutrition", "HR & Payroll", "Notifications"],
    usuallyNotRequired: ["Operation Theatre", "Emergency", "Blood Bank", "CSSD", "Dialysis Unit", "Oncology", "Day Care Unit", "Research Platform", "JCI Accreditation", "Accounts / ERP", "Financial Statements", "Budget Management", "Fixed Assets Register", "Revenue Intelligence", "CRM & Marketing"],
    inferred: true,
    // PLAN FIT GAP: Vaccination + Obstetric ANC are core here but both are Professional-only
    // modules (off on Clinic/Starter) — a govt primary-care centre is pushed to ₹17,999/mo just
    // to unlock two charting modules it cannot do without. Flag for founder: either of those two
    // modules on a cheaper tier, or a dedicated low-cost govt/PHC tier, would close this gap.
    defaultPlanSlug: "professional",
  },
  {
    key: "general_hospital",
    label: "General Hospital (50–200 beds)",
    broadCategory: "general_multispecialty",
    coarseType: "general",
    core: ["OPD Queue", "IPD / Wards", "Emergency", "Operation Theatre", "Laboratory (LIS)", "Radiology (RIS)", "Pharmacy (IP)", "Pharmacy Retail", "HR & Payroll", "Inventory & Stores"],
    conditional: ["Day Care Unit", "Blood Bank", "CSSD", "Insurance / TPA", "Ambulance Service", "Quality & NABH", "Accounts / ERP", "Govt Schemes / PMJAY"],
    optional: ["Telemedicine", "Health Packages", "Patient Portal", "CRM & Marketing", "Communication Inbox", "ABDM / ABHA", "Notifications", "Research Platform", "Staff Training / LMS", "Population Health", "Revenue Intelligence"],
    usuallyNotRequired: ["Dialysis Unit", "Oncology", "IVF & ART", "Mortuary & Medico-Legal", "JCI Accreditation"],
    teachingOverlayEligible: true,
    inferred: true,
    defaultPlanSlug: "professional", // Operation Theatre in core — needs the OT module (Professional+).
  },
  {
    key: "multispecialty_hospital",
    label: "Multispecialty Hospital",
    broadCategory: "general_multispecialty",
    coarseType: "general",
    core: ["OPD Queue", "IPD / Wards", "Emergency", "Operation Theatre", "Day Care Unit", "Laboratory (LIS)", "Radiology (RIS)", "Pharmacy (IP)", "Pharmacy Retail", "Insurance / TPA", "HR & Payroll", "Inventory & Stores", "Quality & NABH"],
    conditional: ["Blood Bank", "CSSD", "Dialysis Unit", "Oncology", "Accounts / ERP", "Ambulance Service", "Govt Schemes / PMJAY", "Mortuary & Medico-Legal"],
    optional: ["Telemedicine", "Health Packages", "Patient Portal", "CRM & Marketing", "Communication Inbox", "ABDM / ABHA", "Notifications", "Research Platform", "Staff Training / LMS", "Population Health", "Revenue Intelligence", "AI Clinical Intelligence", "JCI Accreditation"],
    usuallyNotRequired: ["IVF & ART", "MCI / Disaster Response"],
    teachingOverlayEligible: true,
    inferred: true,
    defaultPlanSlug: "professional", // OT + Insurance/TPA + Quality & NABH all core — needs the full module set.
  },
  {
    key: "super_specialty_hospital",
    label: "Super-Specialty Hospital",
    broadCategory: "general_multispecialty",
    coarseType: "specialty",
    core: ["OPD Queue", "IPD / Wards", "Emergency", "Operation Theatre", "Laboratory (LIS)", "Radiology (RIS)", "Blood Bank", "CSSD", "Pharmacy (IP)", "Insurance / TPA", "Accounts / ERP", "Quality & NABH", "HR & Payroll", "Inventory & Stores"],
    conditional: ["Oncology", "Dialysis Unit", "IVF & ART", "Day Care Unit", "Anaesthesia EMR", "Research Platform", "JCI Accreditation"],
    optional: ["Telemedicine", "Health Packages", "Patient Portal", "CRM & Marketing", "Population Health", "Revenue Intelligence", "AI Clinical Intelligence", "Staff Training / LMS", "ABDM / ABHA"],
    usuallyNotRequired: ["Vaccination", "Govt Schemes / PMJAY", "Obstetric ANC"],
    teachingOverlayEligible: true,
    inferred: true,
    // Tertiary-referral scale (Blood Bank + CSSD + Insurance + Accounts/ERP + Quality&NABH all
    // core) — Enterprise's SLA/dedicated-CSM motion fits better than self-serve Professional.
    defaultPlanSlug: "enterprise",
  },
  {
    key: "district_hospital",
    label: "District Hospital",
    broadCategory: "general_multispecialty",
    coarseType: "general",
    core: ["OPD Queue", "IPD / Wards", "Emergency", "Operation Theatre", "Laboratory (LIS)", "Radiology (RIS)", "Pharmacy (IP)", "Pharmacy Retail", "Blood Bank", "Govt Schemes / PMJAY", "Govt HMIS Reporting", "HR & Payroll", "Inventory & Stores"],
    conditional: ["CSSD", "Ambulance Service", "Vaccination", "Obstetric ANC", "Mortuary & Medico-Legal", "MCI / Disaster Response"],
    optional: ["Telemedicine", "Quality & NABH", "Notifications", "Dietetics & Nutrition"],
    usuallyNotRequired: ["Insurance / TPA", "CRM & Marketing", "Research Platform", "AI Clinical Intelligence", "Revenue Intelligence", "JCI Accreditation"],
    inferred: true,
    // Govt-network mega-facility (Blood Bank, PMJAY, HMIS all core) — negotiated/institutional
    // procurement, not self-serve; Enterprise's custom-pricing motion matches that process.
    defaultPlanSlug: "enterprise",
  },
  {
    key: "government_hospital",
    label: "Government Hospital",
    broadCategory: "general_multispecialty",
    coarseType: "general",
    core: ["OPD Queue", "IPD / Wards", "Emergency", "Laboratory (LIS)", "Pharmacy (IP)", "Govt Schemes / PMJAY", "Govt HMIS Reporting", "HR & Payroll"],
    conditional: ["Operation Theatre", "Radiology (RIS)", "Blood Bank", "CSSD", "Ambulance Service", "Vaccination", "Obstetric ANC", "Inventory & Stores", "MCI / Disaster Response"],
    optional: ["Quality & NABH", "Notifications", "Telemedicine"],
    usuallyNotRequired: ["Insurance / TPA", "CRM & Marketing", "Research Platform", "AI Clinical Intelligence", "Revenue Intelligence", "JCI Accreditation", "Patient Portal"],
    inferred: true,
    // Govt-network facility (PMJAY + HMIS core) — same institutional-procurement reasoning as
    // district_hospital; Enterprise's negotiated pricing fits better than a self-serve tier.
    defaultPlanSlug: "enterprise",
  },
  {
    key: "trust_charitable_hospital",
    label: "Trust / Charitable Hospital",
    broadCategory: "general_multispecialty",
    coarseType: "general",
    core: ["OPD Queue", "IPD / Wards", "Emergency", "Operation Theatre", "Laboratory (LIS)", "Pharmacy (IP)", "Pharmacy Retail", "HR & Payroll", "Inventory & Stores"],
    conditional: ["Radiology (RIS)", "Blood Bank", "CSSD", "Insurance / TPA", "Govt Schemes / PMJAY", "Health Packages", "CRM & Marketing", "Quality & NABH"],
    optional: ["Telemedicine", "Patient Portal", "Communication Inbox", "ABDM / ABHA", "Notifications", "Accounts / ERP", "Staff Training / LMS"],
    usuallyNotRequired: ["Research Platform", "AI Clinical Intelligence", "Revenue Intelligence", "JCI Accreditation", "IVF & ART"],
    inferred: true,
    defaultPlanSlug: "professional", // OT in core; mid-size single-site charitable hospital, no govt/chain override.
  },
  {
    key: "esi_hospital",
    label: "ESI Hospital",
    broadCategory: "general_multispecialty",
    coarseType: "general",
    core: ["OPD Queue", "IPD / Wards", "Emergency", "Laboratory (LIS)", "Radiology (RIS)", "Pharmacy (IP)", "Govt Schemes / PMJAY", "HR & Payroll", "Inventory & Stores"],
    conditional: ["Operation Theatre", "Blood Bank", "CSSD", "Ambulance Service", "Govt HMIS Reporting", "Quality & NABH"],
    optional: ["Insurance / TPA", "Telemedicine", "Notifications"],
    usuallyNotRequired: ["CRM & Marketing", "Research Platform", "AI Clinical Intelligence", "Revenue Intelligence", "JCI Accreditation", "Patient Portal"],
    inferred: true,
    // PSU hospital network (Govt Schemes/PMJAY core) — institutional procurement; Enterprise fits
    // the negotiated-contract model this sector actually buys on.
    defaultPlanSlug: "enterprise",
  },
  {
    key: "railway_hospital",
    label: "Railway Hospital",
    broadCategory: "general_multispecialty",
    coarseType: "general",
    core: ["OPD Queue", "IPD / Wards", "Emergency", "Laboratory (LIS)", "Pharmacy (IP)", "HR & Payroll", "Inventory & Stores"],
    conditional: ["Operation Theatre", "Radiology (RIS)", "Blood Bank", "CSSD", "Ambulance Service", "Govt HMIS Reporting", "Quality & NABH"],
    optional: ["Insurance / TPA", "Telemedicine", "Notifications"],
    usuallyNotRequired: ["CRM & Marketing", "Research Platform", "AI Clinical Intelligence", "Revenue Intelligence", "JCI Accreditation"],
    inferred: true,
    // PLAN FIT GAP / judgment call: core alone (no OT, no Insurance/Quality) would rule-map to
    // Starter, but a railway-zone hospital is one node in a PSU network bought on negotiated
    // institutional contracts, not self-serve — overriding to Enterprise on that basis, not
    // module fit. Founder may decide Starter/Professional is the better self-serve default.
    defaultPlanSlug: "enterprise",
  },
  {
    key: "defence_military_hospital",
    label: "Defence / Military Hospital",
    broadCategory: "general_multispecialty",
    coarseType: "general",
    core: ["OPD Queue", "IPD / Wards", "Emergency", "Operation Theatre", "Laboratory (LIS)", "Radiology (RIS)", "Pharmacy (IP)", "Blood Bank", "CSSD", "HR & Payroll", "Inventory & Stores"],
    conditional: ["Ambulance Service", "MCI / Disaster Response", "Quality & NABH", "Mortuary & Medico-Legal", "Anaesthesia EMR"],
    optional: ["Telemedicine", "Research Platform", "Staff Training / LMS"],
    usuallyNotRequired: ["Insurance / TPA", "CRM & Marketing", "Patient Portal", "Govt Schemes / PMJAY", "Revenue Intelligence"],
    inferred: true,
    // Defence/PSU network hospital, multi-department tertiary scale (OT + Blood Bank + CSSD
    // core) — institutional procurement; Enterprise's negotiated motion fits best.
    defaultPlanSlug: "enterprise",
  },

  // ───────────────────────── SPECIALTY HOSPITALS ─────────────────────────
  {
    key: "cancer_oncology_hospital",
    label: "Cancer / Oncology Hospital",
    broadCategory: "specialty_hospitals",
    coarseType: "specialty",
    core: ["OPD Queue", "IPD / Wards", "Day Care Unit", "Operation Theatre", "Oncology", "Laboratory (LIS)", "Radiology (RIS)", "Pharmacy (IP)", "Insurance / TPA"],
    conditional: ["Blood Bank", "CSSD", "Anaesthesia EMR", "Home Care", "Accounts / ERP", "Quality & NABH"],
    optional: ["Telemedicine", "Patient Portal", "CRM & Marketing", "Research Platform", "AI Clinical Intelligence", "Dietetics & Nutrition", "Staff Training / LMS"],
    usuallyNotRequired: ["Obstetric ANC", "Neonatal EMR", "Vaccination", "Govt Schemes / PMJAY"],
    inferred: true,
    defaultPlanSlug: "professional", // Oncology + OT + Insurance/TPA all core — needs the Oncology module (Professional+).
  },
  {
    key: "dialysis_renal_hospital",
    label: "Dialysis Centre / Renal Hospital",
    broadCategory: "specialty_hospitals",
    coarseType: "specialty",
    core: ["OPD Queue", "Dialysis Unit", "Pharmacy Retail", "Insurance / TPA"],
    conditional: ["IPD / Wards", "Laboratory (LIS)", "Day Care Unit", "Blood Bank", "Inventory & Stores", "Govt Schemes / PMJAY"],
    optional: ["Telemedicine", "Patient Portal", "Communication Inbox", "Notifications", "Dietetics & Nutrition", "Quality & NABH"],
    usuallyNotRequired: ["Operation Theatre", "Emergency", "CSSD", "Oncology", "Obstetric ANC", "Neonatal EMR", "Mortuary & Medico-Legal", "Research Platform"],
    inferred: true,
    defaultPlanSlug: "professional", // Dialysis Unit module is Professional-only; Insurance/TPA also core here.
  },
  {
    key: "maternity_womens_hospital",
    label: "Maternity / Women's Hospital",
    broadCategory: "specialty_hospitals",
    coarseType: "specialty",
    core: ["OPD Queue", "IPD / Wards", "Operation Theatre", "Obstetric ANC", "Partograph", "Delivery Record", "Laboratory (LIS)", "Radiology (RIS)", "Pharmacy (IP)"],
    conditional: ["Neonatal EMR", "Day Care Unit", "Blood Bank", "Anaesthesia EMR", "Insurance / TPA", "IVF & ART"],
    optional: ["Telemedicine", "Patient Portal", "Health Packages", "CRM & Marketing", "Vaccination", "Dietetics & Nutrition"],
    usuallyNotRequired: ["Dialysis Unit", "Oncology", "Mortuary & Medico-Legal", "Chronic Disease Management"],
    inferred: true,
    defaultPlanSlug: "professional", // OT + Obstetric ANC + Partograph all core — those modules are Professional-only.
  },
  {
    key: "neonatal_nicu_hospital",
    label: "Neonatal / NICU-focused Hospital",
    broadCategory: "specialty_hospitals",
    coarseType: "specialty",
    core: ["OPD Queue", "IPD / Wards", "Neonatal EMR", "Laboratory (LIS)", "Radiology (RIS)", "Pharmacy (IP)"],
    conditional: ["Operation Theatre", "Obstetric ANC", "Delivery Record", "Anaesthesia EMR", "Insurance / TPA", "Blood Bank"],
    optional: ["Telemedicine", "Patient Portal", "Dietetics & Nutrition", "Quality & NABH"],
    usuallyNotRequired: ["Dialysis Unit", "Oncology", "Mortuary & Medico-Legal", "Vaccination", "Govt Schemes / PMJAY"],
    inferred: true,
    defaultPlanSlug: "professional", // Neonatal EMR module is Professional-only.
  },
  {
    key: "ivf_fertility_centre",
    label: "IVF / Fertility Centre",
    broadCategory: "specialty_hospitals",
    coarseType: "specialty",
    core: ["OPD Queue", "IVF & ART", "Day Care Unit", "Laboratory (LIS)", "Pharmacy Retail"],
    conditional: ["Operation Theatre", "Obstetric ANC", "Insurance / TPA", "Radiology (RIS)"],
    optional: ["Telemedicine", "Patient Portal", "CRM & Marketing", "Communication Inbox"],
    usuallyNotRequired: ["IPD / Wards", "Emergency", "Blood Bank", "CSSD", "Dialysis Unit", "Oncology", "Govt Schemes / PMJAY", "Mortuary & Medico-Legal"],
    inferred: true,
    // PLAN FIT GAP: physically a small day-care footprint (no IPD/OT in core) but IVF & ART is a
    // Professional-only module, so the suggestion has to jump straight past Clinic/Starter.
    defaultPlanSlug: "professional",
  },
  {
    key: "eye_hospital",
    label: "Eye Hospital",
    broadCategory: "specialty_hospitals",
    coarseType: "specialty",
    core: ["OPD Queue", "Day Care Unit", "Operation Theatre", "Ophthalmology EMR", "Pharmacy Retail"],
    conditional: ["IPD / Wards", "Radiology (RIS)", "Insurance / TPA", "Health Packages", "Anaesthesia EMR"],
    optional: ["Telemedicine", "Patient Portal", "CRM & Marketing", "Inventory & Stores"],
    usuallyNotRequired: ["Emergency", "Blood Bank", "CSSD", "Dialysis Unit", "Oncology", "Obstetric ANC", "Neonatal EMR", "Govt Schemes / PMJAY"],
    inferred: true,
    defaultPlanSlug: "professional", // OT + Ophthalmology EMR both core — Ophthalmology EMR is Professional-only.
  },
  {
    key: "dental_hospital",
    label: "Dental Hospital",
    broadCategory: "specialty_hospitals",
    coarseType: "specialty",
    core: ["OPD Queue", "Dental", "Pharmacy Retail"],
    conditional: ["Day Care Unit", "Operation Theatre", "Radiology (RIS)", "Insurance / TPA", "Inventory & Stores"],
    optional: ["Telemedicine", "Patient Portal", "CRM & Marketing", "Communication Inbox"],
    usuallyNotRequired: ["IPD / Wards", "Emergency", "Blood Bank", "CSSD", "Dialysis Unit", "Oncology", "Obstetric ANC", "Neonatal EMR", "Govt Schemes / PMJAY"],
    inferred: true,
    // PLAN FIT GAP: this is a small walk-in dental practice (no IPD/OT core) but the Dental
    // module itself is Professional-only, so a Dental Hospital gets pushed past Clinic/Starter
    // just to chart its own specialty. Flag for founder: Dental on Clinic would fit this segment
    // far better than ₹17,999/mo Professional.
    defaultPlanSlug: "professional",
  },
  {
    // Worked example from the registration-taxonomy build brief — Core list sourced verbatim;
    // Conditional/Optional/UsuallyNotRequired are this pod's extrapolation.
    key: "ent_hospital",
    label: "ENT Hospital",
    broadCategory: "specialty_hospitals",
    coarseType: "specialty",
    core: ["OPD Queue", "Day Care Unit", "Operation Theatre", "Radiology (RIS)", "Pharmacy Retail"],
    conditional: ["IPD / Wards", "Laboratory (LIS)", "Insurance / TPA", "Anaesthesia EMR"],
    optional: ["Telemedicine", "Patient Portal", "CRM & Marketing", "HR & Payroll"],
    usuallyNotRequired: ["Emergency", "Blood Bank", "CSSD", "Dialysis Unit", "Oncology", "Obstetric ANC", "Neonatal EMR", "Govt Schemes / PMJAY"],
    inferred: false,
    defaultPlanSlug: "professional", // Operation Theatre in core — OT module is Professional-only.
  },
  {
    key: "orthopaedic_hospital",
    label: "Orthopaedic Hospital",
    broadCategory: "specialty_hospitals",
    coarseType: "specialty",
    core: ["OPD Queue", "IPD / Wards", "Operation Theatre", "Day Care Unit", "Physiotherapy", "Radiology (RIS)", "Inventory & Stores"],
    conditional: ["Laboratory (LIS)", "Blood Bank", "CSSD", "Anaesthesia EMR", "Insurance / TPA"],
    optional: ["Telemedicine", "Patient Portal", "CRM & Marketing", "Health Packages"],
    usuallyNotRequired: ["Emergency", "Dialysis Unit", "Oncology", "Obstetric ANC", "Neonatal EMR", "Govt Schemes / PMJAY"],
    inferred: false,
    defaultPlanSlug: "professional", // OT + Physiotherapy both core — Physiotherapy module is Professional-only.
  },
  {
    key: "cardiac_cardiology_hospital",
    label: "Cardiac / Cardiology Hospital",
    broadCategory: "specialty_hospitals",
    coarseType: "specialty",
    core: ["OPD Queue", "IPD / Wards", "Operation Theatre", "Emergency", "Laboratory (LIS)", "Radiology (RIS)", "Pharmacy (IP)", "Insurance / TPA"],
    conditional: ["Day Care Unit", "Blood Bank", "CSSD", "Anaesthesia EMR", "Accounts / ERP"],
    optional: ["Telemedicine", "Patient Portal", "CRM & Marketing", "Research Platform", "AI Clinical Intelligence"],
    usuallyNotRequired: ["Obstetric ANC", "Neonatal EMR", "Dental", "Vaccination", "Govt Schemes / PMJAY"],
    inferred: false,
    defaultPlanSlug: "professional", // OT + Insurance/TPA both core.
  },
  {
    key: "urology_hospital",
    label: "Urology Hospital",
    broadCategory: "specialty_hospitals",
    coarseType: "specialty",
    core: ["OPD Queue", "Day Care Unit", "Operation Theatre", "Laboratory (LIS)", "Radiology (RIS)", "Pharmacy Retail"],
    conditional: ["IPD / Wards", "Dialysis Unit", "Insurance / TPA", "Anaesthesia EMR"],
    optional: ["Telemedicine", "Patient Portal", "CRM & Marketing"],
    usuallyNotRequired: ["Emergency", "Blood Bank", "CSSD", "Oncology", "Obstetric ANC", "Neonatal EMR", "Govt Schemes / PMJAY"],
    inferred: true,
    defaultPlanSlug: "professional", // Operation Theatre in core — OT module is Professional-only.
  },
  {
    key: "gastroenterology_hospital",
    label: "Gastroenterology Hospital",
    broadCategory: "specialty_hospitals",
    coarseType: "specialty",
    core: ["OPD Queue", "Day Care Unit", "Operation Theatre", "Laboratory (LIS)", "Radiology (RIS)", "Pharmacy Retail"],
    conditional: ["IPD / Wards", "Dietetics & Nutrition", "Insurance / TPA", "Anaesthesia EMR"],
    optional: ["Telemedicine", "Patient Portal", "CRM & Marketing"],
    usuallyNotRequired: ["Emergency", "Blood Bank", "CSSD", "Dialysis Unit", "Oncology", "Obstetric ANC", "Neonatal EMR", "Govt Schemes / PMJAY"],
    inferred: true,
    defaultPlanSlug: "professional", // Operation Theatre in core — OT module is Professional-only.
  },
  {
    key: "dermatology_skin_clinic",
    label: "Dermatology / Skin Clinic",
    broadCategory: "specialty_hospitals",
    coarseType: "clinic",
    core: ["OPD Queue", "Pharmacy Retail", "Health Packages"],
    conditional: ["Day Care Unit", "Insurance / TPA", "CRM & Marketing"],
    optional: ["Telemedicine", "Patient Portal", "Communication Inbox"],
    usuallyNotRequired: ["IPD / Wards", "Operation Theatre", "Emergency", "Laboratory (LIS)", "Radiology (RIS)", "Blood Bank", "CSSD", "Dialysis Unit", "Oncology", "Govt Schemes / PMJAY"],
    inferred: true,
    // PLAN FIT GAP: a solo-practitioner skin clinic (no IPD/OT core) is pushed to ₹17,999/mo
    // Professional purely because Health Packages — its core revenue line — is a Professional-
    // only module. Flag for founder: Health Packages on Clinic would fit this segment better.
    defaultPlanSlug: "professional",
  },
  {
    key: "psychiatric_mental_health_hospital",
    label: "Psychiatric / Mental Health Hospital",
    broadCategory: "specialty_hospitals",
    coarseType: "specialty",
    core: ["OPD Queue", "IPD / Wards", "Mental Health / Psychiatry", "Pharmacy (IP)"],
    conditional: ["Day Care Unit", "Insurance / TPA", "Physiotherapy", "Dietetics & Nutrition"],
    optional: ["Telemedicine", "Patient Portal", "CRM & Marketing", "Staff Training / LMS"],
    usuallyNotRequired: ["Operation Theatre", "Emergency", "Blood Bank", "CSSD", "Dialysis Unit", "Oncology", "Obstetric ANC", "Neonatal EMR", "Govt Schemes / PMJAY"],
    inferred: true,
    defaultPlanSlug: "professional", // Mental Health / Psychiatry module is Professional-only.
  },
  {
    key: "rehabilitation_physiotherapy_hospital",
    label: "Rehabilitation / Physiotherapy Hospital",
    broadCategory: "specialty_hospitals",
    coarseType: "specialty",
    core: ["OPD Queue", "Day Care Unit", "Physiotherapy"],
    conditional: ["IPD / Wards", "Chronic Disease Management", "Insurance / TPA", "Dietetics & Nutrition"],
    optional: ["Telemedicine", "Home Care", "Patient Portal", "CRM & Marketing"],
    usuallyNotRequired: ["Operation Theatre", "Emergency", "Blood Bank", "CSSD", "Dialysis Unit", "Oncology", "Obstetric ANC", "Neonatal EMR", "Govt Schemes / PMJAY"],
    inferred: true,
    // PLAN FIT GAP: small OPD+day-care rehab centre (no IPD/OT) pushed to Professional purely
    // because Physiotherapy — its whole business — is a Professional-only module.
    defaultPlanSlug: "professional",
  },
  {
    // Sibling of Homecare/Palliative Provider — same clinical family; this one owns beds (IPD
    // is Core), the sibling below does not (IPD is UsuallyNotRequired). Per taxonomy brief.
    key: "palliative_long_term_care",
    label: "Palliative / Long-Term Care",
    broadCategory: "specialty_hospitals",
    coarseType: "nursing_home",
    core: ["OPD Queue", "IPD / Wards", "Chronic Disease Management", "Dietetics & Nutrition"],
    conditional: ["Physiotherapy", "Home Care", "Insurance / TPA", "Mortuary & Medico-Legal"],
    optional: ["Telemedicine", "Patient Portal", "CRM & Marketing", "Notifications"],
    usuallyNotRequired: ["Operation Theatre", "Emergency", "Blood Bank", "CSSD", "Dialysis Unit", "Oncology", "Obstetric ANC", "Neonatal EMR", "Govt Schemes / PMJAY"],
    inferred: true,
    defaultPlanSlug: "professional", // Chronic Disease Management + Dietetics & Nutrition both core — both Professional-only.
  },
  {
    key: "homecare_palliative_provider",
    label: "Homecare / Palliative Provider",
    broadCategory: "specialty_hospitals",
    coarseType: "clinic",
    core: ["Home Care", "Chronic Disease Management", "Dietetics & Nutrition"],
    conditional: ["OPD Queue", "Telemedicine", "Insurance / TPA"],
    optional: ["Patient Portal", "Communication Inbox", "CRM & Marketing", "Notifications"],
    usuallyNotRequired: ["IPD / Wards", "Operation Theatre", "Emergency", "Laboratory (LIS)", "Radiology (RIS)", "Blood Bank", "CSSD", "Dialysis Unit", "Oncology", "Govt Schemes / PMJAY"],
    inferred: true,
    // PLAN FIT GAP: this provider has zero beds and no OT — the opposite of what the plan tiers'
    // bed-based pricing assumes — yet Home Care + Chronic Disease Management + Dietetics &
    // Nutrition are all Professional-only, so it still lands on the ₹17,999/mo tier priced for
    // 40 included beds it will never use. Strongest signal in this taxonomy for a dedicated
    // low-cost "community / home-care" plan.
    defaultPlanSlug: "professional",
  },
  {
    // Worked example — Core list sourced verbatim from the taxonomy build brief.
    key: "geriatric_care_centre",
    label: "Geriatric Care Centre",
    broadCategory: "specialty_hospitals",
    coarseType: "specialty",
    core: ["OPD Queue", "IPD / Wards", "Chronic Disease Management", "Home Care", "Dietetics & Nutrition", "Physiotherapy"],
    conditional: ["Laboratory (LIS)", "Radiology (RIS)", "Insurance / TPA", "Mental Health / Psychiatry"],
    optional: ["Telemedicine", "Patient Portal", "CRM & Marketing"],
    usuallyNotRequired: ["Operation Theatre", "Emergency", "Blood Bank", "CSSD", "Dialysis Unit", "Oncology", "Obstetric ANC", "Neonatal EMR", "IVF & ART"],
    inferred: false,
    defaultPlanSlug: "professional", // Chronic Disease Management + Home Care + Dietetics + Physiotherapy all core — all Professional-only.
  },
  {
    // Worked example — Core list sourced verbatim; Neonatal EMR Conditional unless NICU attached
    // (then Core — captured as a note, not a separate flag, until the setup wizard asks).
    key: "paediatric_only_hospital",
    label: "Paediatric-only Hospital",
    broadCategory: "specialty_hospitals",
    coarseType: "specialty",
    core: ["OPD Queue", "IPD / Wards", "Emergency", "Vaccination", "Dietetics & Nutrition", "Laboratory (LIS)", "Radiology (RIS)"],
    conditional: ["Neonatal EMR", "Operation Theatre", "Day Care Unit", "Insurance / TPA", "Pharmacy (IP)"],
    optional: ["Telemedicine", "Patient Portal", "Health Packages", "CRM & Marketing"],
    usuallyNotRequired: ["Dialysis Unit", "Oncology", "Obstetric ANC", "Mortuary & Medico-Legal", "Govt Schemes / PMJAY"],
    inferred: false,
    defaultPlanSlug: "professional", // Vaccination + Dietetics & Nutrition both core — both Professional-only.
  },

  // ───────────────────────── DIAGNOSTIC & PROCEDURE ─────────────────────────
  {
    key: "daycare_procedure_centre",
    label: "Day-Care / Procedure Centre",
    broadCategory: "diagnostic_procedure",
    coarseType: "clinic",
    core: ["OPD Queue", "Day Care Unit", "Pharmacy Retail"],
    conditional: ["Operation Theatre", "Laboratory (LIS)", "Radiology (RIS)", "Insurance / TPA", "Anaesthesia EMR"],
    optional: ["Telemedicine", "Patient Portal", "CRM & Marketing"],
    usuallyNotRequired: ["IPD / Wards", "Emergency", "Blood Bank", "CSSD", "Dialysis Unit", "Oncology", "Obstetric ANC", "Neonatal EMR", "Govt Schemes / PMJAY"],
    inferred: true,
    defaultPlanSlug: "clinic", // OPD + Day Care + Pharmacy Retail — exactly the Clinic plan's module set, no gaps.
  },
  {
    key: "diagnostic_pathology_lab_chain",
    label: "Diagnostic / Pathology Lab Chain",
    broadCategory: "diagnostic_procedure",
    coarseType: "clinic",
    core: ["Laboratory (LIS)", "Radiology (RIS)"],
    conditional: ["Insurance / TPA", "Inventory & Stores", "CRM & Marketing", "HR & Payroll"],
    optional: ["Patient Portal", "Communication Inbox", "Notifications", "Analytics & BI"],
    usuallyNotRequired: ["OPD Queue", "IPD / Wards", "Operation Theatre", "Emergency", "Pharmacy (IP)", "Blood Bank", "CSSD", "Dialysis Unit", "Oncology", "Obstetric ANC", "Neonatal EMR", "Govt Schemes / PMJAY"],
    inferred: true,
    // Core is just Laboratory + Radiology — both true on Starter (Clinic's module set has no
    // Radiology, so Clinic would leave this type unable to run its second core workflow).
    // PLAN FIT GAP: "chain" in the name implies multi-branch operation, which none of today's
    // plans are built around (Enterprise's multi-branch feature assumes a bedded hospital's
    // pricing shape, not a bedless diagnostics network) — flagging for the founder rather than
    // forcing a fit.
    defaultPlanSlug: "starter",
  },
  {
    key: "trauma_emergency_centre",
    label: "Trauma / Emergency Centre",
    broadCategory: "diagnostic_procedure",
    coarseType: "specialty",
    core: ["Emergency", "OPD Queue", "Operation Theatre", "Laboratory (LIS)", "Radiology (RIS)", "Blood Bank", "Ambulance Service", "Pharmacy (IP)"],
    conditional: ["IPD / Wards", "CSSD", "Anaesthesia EMR", "Insurance / TPA", "MCI / Disaster Response"],
    optional: ["Telemedicine", "Patient Portal", "Notifications"],
    usuallyNotRequired: ["Obstetric ANC", "Neonatal EMR", "IVF & ART", "Oncology", "Dialysis Unit", "Govt Schemes / PMJAY"],
    inferred: true,
    defaultPlanSlug: "professional", // OT + Blood Bank + Ambulance all core — all Professional-only.
  },

  // ───────────────────────── TRADITIONAL & PREVENTIVE ─────────────────────────
  {
    // ONE type, not four — AYUSH already bundles Ayurveda/Homeopathy/Unani/Siddha. subSystems
    // drives a secondary "which system(s)" multi-select in the registration UI.
    key: "ayush_traditional_medicine_centre",
    label: "AYUSH / Traditional Medicine Centre",
    broadCategory: "traditional_preventive",
    coarseType: "clinic",
    core: ["OPD Queue", "AYUSH", "Pharmacy Retail"],
    conditional: ["Day Care Unit", "Health Packages", "Insurance / TPA", "Dietetics & Nutrition"],
    optional: ["Telemedicine", "Patient Portal", "CRM & Marketing", "Communication Inbox"],
    usuallyNotRequired: ["IPD / Wards", "Operation Theatre", "Emergency", "Laboratory (LIS)", "Radiology (RIS)", "Blood Bank", "CSSD", "Dialysis Unit", "Oncology", "Govt Schemes / PMJAY"],
    subSystems: ["Ayurveda", "Homeopathy", "Unani", "Siddha", "Yoga & Naturopathy"],
    inferred: true,
    // PLAN FIT GAP: a small single-practitioner AYUSH clinic (coarseType "clinic", no IPD/OT)
    // can only chart its own system via the AYUSH module, which is Professional-only — forcing
    // ₹17,999/mo onto a segment that is almost always budget-constrained. Strongest single
    // candidate in this taxonomy for either an AYUSH add-on on Clinic, or a dedicated AYUSH tier.
    defaultPlanSlug: "professional",
  },
  {
    key: "wellness_preventive_health_centre",
    label: "Wellness / Preventive-health Centre",
    broadCategory: "traditional_preventive",
    coarseType: "clinic",
    core: ["OPD Queue", "Health Packages", "Pharmacy Retail"],
    conditional: ["Laboratory (LIS)", "Dietetics & Nutrition", "Physiotherapy", "Insurance / TPA"],
    optional: ["Telemedicine", "Patient Portal", "CRM & Marketing", "Communication Inbox"],
    usuallyNotRequired: ["IPD / Wards", "Operation Theatre", "Emergency", "Blood Bank", "CSSD", "Dialysis Unit", "Oncology", "Obstetric ANC", "Neonatal EMR", "Govt Schemes / PMJAY"],
    inferred: true,
    // PLAN FIT GAP: same pattern as Dermatology — small OPD-only wellness practice forced to
    // Professional purely because Health Packages (its core service) is gated there.
    defaultPlanSlug: "professional",
  },
  {
    key: "vaccination_centre",
    label: "Vaccination Centre",
    broadCategory: "traditional_preventive",
    coarseType: "clinic",
    core: ["Vaccination", "OPD Queue"],
    conditional: ["Govt HMIS Reporting", "Insurance / TPA", "Inventory & Stores", "CRM & Marketing"],
    optional: ["Patient Portal", "Communication Inbox", "Notifications"],
    usuallyNotRequired: ["IPD / Wards", "Operation Theatre", "Emergency", "Laboratory (LIS)", "Radiology (RIS)", "Blood Bank", "CSSD", "Dialysis Unit", "Oncology", "Pharmacy (IP)", "Govt Schemes / PMJAY"],
    inferred: true,
    // PLAN FIT GAP: a standalone vaccination drive/centre has close to zero other footprint
    // (no beds, no OT, no pharmacy) yet the Vaccination module itself is Professional-only,
    // so this tiny operation is suggested the most expensive self-serve tier. Strong candidate
    // for a cheap Vaccination add-on on Clinic rather than a full tier jump.
    defaultPlanSlug: "professional",
  },
];

export function getHospitalTypesByCategory(category: BroadHospitalCategory | string): HospitalTypeDefinition[] {
  return HOSPITAL_TYPES.filter((t) => t.broadCategory === category);
}

export function getHospitalTypeByKey(key: string | null | undefined): HospitalTypeDefinition | undefined {
  if (!key) return undefined;
  return HOSPITAL_TYPES.find((t) => t.key === key);
}

/** The `subscription_plans.slug` to suggest on the Choose Plan step for a given hospital-type
 *  key, or `undefined` if no type (or an unrecognised one) was picked in Step 1. Callers must
 *  treat this as a SUGGESTION only — never use it to filter/hide other plans, and never block
 *  proceeding if the plan it names isn't in the live, active plan list (a plan can be renamed or
 *  deactivated in Plans Manager independently of this taxonomy). */
export function getDefaultPlanSlug(key: string | null | undefined): string | undefined {
  return getHospitalTypeByKey(key)?.defaultPlanSlug;
}

/** Resolves a stored `hospitals.hospital_category` value (new granular key, or a legacy
 *  free-text label from before this taxonomy existed) to a human-readable label for display. */
export function getHospitalTypeLabel(categoryOrKey: string | null | undefined): string {
  if (!categoryOrKey) return "—";
  return getHospitalTypeByKey(categoryOrKey)?.label ?? categoryOrKey;
}

/** Core/Conditional/Optional/UsuallyNotRequired for a type, with the teaching-institution
 *  overlay applied (promotes Research Platform + Staff Training/LMS to Core) when relevant. */
export function resolveModuleBuckets(type: HospitalTypeDefinition, isTeachingInstitution = false) {
  const core = [...BASELINE_CORE_MODULES, ...type.core];
  let optional = type.optional;
  if (isTeachingInstitution && type.teachingOverlayEligible) {
    const promoted = ["Research Platform", "Staff Training / LMS"];
    core.push(...promoted.filter((m) => !core.includes(m)));
    optional = optional.filter((m) => !promoted.includes(m));
  }
  return { core, conditional: type.conditional, optional, usuallyNotRequired: type.usuallyNotRequired };
}

// ── Dev-time sanity check: every module name referenced above must exist in ALL_MODULES. ──
if (import.meta.env?.DEV) {
  const knownModuleNames = new Set(ALL_MODULES.map((m) => m.name));
  for (const t of HOSPITAL_TYPES) {
    for (const name of [...t.core, ...t.conditional, ...t.optional, ...t.usuallyNotRequired]) {
      if (!knownModuleNames.has(name)) {
        console.warn(`hospitalTypes.ts: "${t.key}" references unknown module "${name}" — check spelling against ALL_MODULES in src/lib/modules.ts.`);
      }
    }
  }
}
