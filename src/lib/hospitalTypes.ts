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
  },
];

export function getHospitalTypesByCategory(category: BroadHospitalCategory | string): HospitalTypeDefinition[] {
  return HOSPITAL_TYPES.filter((t) => t.broadCategory === category);
}

export function getHospitalTypeByKey(key: string | null | undefined): HospitalTypeDefinition | undefined {
  if (!key) return undefined;
  return HOSPITAL_TYPES.find((t) => t.key === key);
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
