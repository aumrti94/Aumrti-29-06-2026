import { ENTERPRISE_EMAIL } from "@/lib/brand";
export const INDIAN_STATES = [
  "Andaman & Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra & Nagar Haveli",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu & Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

// Sales / Enterprise contact — centralised so ops can override via env
// (VITE_SALES_WHATSAPP / VITE_SALES_EMAIL) without editing component code.
export const SALES_WHATSAPP =
  (import.meta.env.VITE_SALES_WHATSAPP as string) || "918800000000";
export const SALES_EMAIL =
  (import.meta.env.VITE_SALES_EMAIL as string) || ENTERPRISE_EMAIL;

export const BED_COUNTS = [
  { label: "Under 30 beds", value: "under_30" },
  { label: "30–50 beds", value: "30_50" },
  { label: "51–100 beds", value: "51_100" },
  { label: "101–200 beds", value: "101_200" },
  { label: "201–500 beds", value: "201_500" },
  { label: "500+ beds", value: "500_plus" },
];

export const DESIGNATIONS = [
  "Medical Director",
  "CEO / Managing Director",
  "Hospital Administrator",
  "IT Head / CTO",
  "Finance Head / CFO",
  "Operations Head",
  "Other",
];

export interface RegistrationData {
  hospitalName: string;
  /** Broad category key from src/lib/hospitalTypes.ts (BROAD_CATEGORIES) — UI-only, narrows the
   *  second dropdown; not sent to register-hospital. */
  hospitalBroadCategory: string;
  /** Specific hospital-type key from src/lib/hospitalTypes.ts (HOSPITAL_TYPES) — this is what
   *  gets sent as hospital.type and stored verbatim in hospitals.hospital_category. */
  hospitalType: string;
  /** "Medical College / Teaching Hospital" overlay checkbox — only offered for types with
   *  teachingOverlayEligible. Front-end wizard state only for now (no DB column yet). */
  isTeachingInstitution: boolean;
  /** AYUSH-only secondary multi-select ("which system(s)") — front-end wizard state only. */
  ayushSubSystems: string[];
  state: string;
  bedCount: string;
  phone: string;
  phoneVerified: boolean;
  /** Single-use token issued by verify-signup-otp; validated server-side by register-hospital. */
  phoneOtpToken: string;
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  designation: string;
  referralCode: string;
  address1: string;
  address2: string;
  pincode: string;
  city: string;
  gstin: string;
  nabhAccredited: boolean;
  nabhNumber: string;
  website: string;
  // Plan slugs are admin-configurable (Plans Manager) and fetched live from subscription_plans
  // in Step4ChoosePlan — "clinic" included here since it's one of the four live plans today, but
  // this union is a convenience, not a hard contract; the wizard already treats any slug.
  plan: "clinic" | "starter" | "professional" | "enterprise" | "";
  termsAccepted: boolean;
  dpdpConsent: boolean;
  verificationMethod: "email" | "phone";
}

export const initialData: RegistrationData = {
  hospitalName: "",
  hospitalBroadCategory: "",
  hospitalType: "",
  isTeachingInstitution: false,
  ayushSubSystems: [],
  state: "",
  bedCount: "",
  phone: "",
  phoneVerified: false,
  phoneOtpToken: "",
  fullName: "",
  email: "",
  password: "",
  confirmPassword: "",
  designation: "",
  referralCode: "",
  address1: "",
  address2: "",
  pincode: "",
  city: "",
  gstin: "",
  nabhAccredited: false,
  nabhNumber: "",
  website: "",
  plan: "" as any,
  termsAccepted: false,
  dpdpConsent: false,
  verificationMethod: "email",
};
