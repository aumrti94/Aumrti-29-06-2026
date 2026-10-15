import { ALL_MODULES } from './modules';
import { ROUTE_TO_MODULE_KEY } from '@/lib/moduleKeys';
import { LEGACY_MODULE_PARENT } from './moduleRegistry';

export const ROUTE_ROLES: Record<string, string[]> = {};

ALL_MODULES.forEach(m => {
  const path = m.route.split('?')[0];
  ROUTE_ROLES[path] = m.roles;
});

ROUTE_ROLES['/ipd/day-care'] = ['doctor', 'nurse', 'receptionist', 'billing_executive', 'super_admin', 'hospital_admin'];

// Override / add explicit admin-only routes
ROUTE_ROLES['/settings'] = ['super_admin', 'hospital_admin'];
ROUTE_ROLES['/accounts'] = ['accountant', 'billing_executive', 'billing_staff', 'cfo', 'super_admin', 'hospital_admin'];
ROUTE_ROLES['/hr'] = ['hr_manager', 'super_admin', 'hospital_admin'];
ROUTE_ROLES['/billing'] = ['accountant', 'billing_executive', 'billing_staff', 'super_admin', 'hospital_admin'];
ROUTE_ROLES['/billing/closure'] = ['accountant', 'billing_executive', 'cfo', 'super_admin', 'hospital_admin'];
ROUTE_ROLES['/insurance'] = ['billing_executive', 'insurance_executive', 'super_admin', 'hospital_admin'];
ROUTE_ROLES['/lab'] = ['lab_technician', 'lab_tech', 'doctor', 'super_admin', 'hospital_admin'];
ROUTE_ROLES['/radiology'] = ['radiologist', 'doctor', 'super_admin', 'hospital_admin'];
ROUTE_ROLES['/nabh/compliance'] = ['super_admin', 'hospital_admin', 'quality_officer', 'quality_manager'];
ROUTE_ROLES['/quality/events'] = [
  'super_admin', 'hospital_admin', 'quality_officer', 'quality_manager',
  'doctor', 'nurse', 'receptionist', 'nursing_supervisor',
];
// No override for /ipc/dashboard — ALL_MODULES already declares the correct role list
// (quality_officer, quality_manager, infection_control_nurse, doctor, super_admin,
// hospital_admin). The override that used to sit here was missing infection_control_nurse —
// the role the catalogue created specifically to represent nursing on this module — while
// granting access to generic nurse/nursing_supervisor instead. Investigated per Nirmala: IPC
// surveillance data entry here (device-day logging, HAI event entry, antibiogram review, AI
// anomaly detection) is infection-control-team work, not bedside nursing's; a ward nurse
// performs hand hygiene in practice but does not log the audit or read microbiology/antibiogram
// data in this dashboard — that is the IPC nurse's job, which is exactly the role the catalogue
// already names. Same copy-paste-override shape Phase 9 found and fixed for /fms/dashboard
// (see that comment below for precedent).
ROUTE_ROLES['/quality/clinical-audits'] = [
  'super_admin', 'hospital_admin', 'quality_officer', 'quality_manager',
  'doctor', 'nursing_supervisor',
];
ROUTE_ROLES['/quality/qi-projects'] = [
  'super_admin', 'hospital_admin', 'quality_officer', 'quality_manager',
  'doctor', 'nursing_supervisor',
];
ROUTE_ROLES['/quality/committees'] = [
  'super_admin', 'hospital_admin', 'quality_officer', 'quality_manager',
  'doctor', 'nursing_supervisor',
];
// No override for /fms/dashboard — ALL_MODULES already declares the correct role list
// (facility_manager, biomedical_technician, super_admin, hospital_admin). A copy-paste from
// the /quality/committees override above used to sit here, silently locking out the two
// roles this module was built for while granting it to quality_officer/quality_manager, who
// have no operational reason to be on this screen (confirmed: NABH FMS-chapter safety rounds,
// PM schedules, and BMW manifests are logged by Facility/Biomedical staff; Quality's role is
// to audit that evidence afterward via /nabh/compliance, which already has its own entry).
// No override for /abdm beyond restoring the catalogue list — the previous override dropped
// receptionist and nurse (both zero-setup default role cards on Settings → Staff Members, and
// both confirmed in use: docs/training/front-desk.md documents Receptionist capturing a
// patient's ABHA ID and clicking Verify at registration) while granting billing_executive, which
// has no operational tie anywhere in ABDMConsentPage.tsx or ABDMCareContextsPanel.tsx — no
// charge, claim, or invoice logic touches /abdm; the only "payment" string on the page is the
// HPAYMT consent-purpose label in a dropdown, not a billing-role code path. Same copy-paste-
// override bug class as the FMS/IPC precedent fixes this sprint, not a deliberate privacy
// restriction (a restriction that excludes the clinical "nurse" role while admitting a finance
// role would be internally inconsistent as policy). Confirmed: ALL_MODULES already declares the
// correct role list (receptionist, doctor, nurse, hospital_admin, super_admin).
ROUTE_ROLES['/settings/record-retention'] = ['super_admin', 'hospital_admin'];
ROUTE_ROLES['/settings/change-log']  = ['super_admin', 'hospital_admin'];
ROUTE_ROLES['/settings/tv-display']    = ['super_admin', 'hospital_admin', 'receptionist'];
ROUTE_ROLES['/settings/ai-languages']  = ['super_admin', 'hospital_admin'];
ROUTE_ROLES['/settings/integrations']  = ['super_admin', 'hospital_admin'];
ROUTE_ROLES['/analytics/forecasts']            = ['super_admin', 'hospital_admin', 'cfo', 'doctor'];
ROUTE_ROLES['/analytics/population-health']    = ['super_admin', 'hospital_admin', 'doctor', 'quality_officer', 'quality_manager'];
ROUTE_ROLES['/analytics/revenue-intelligence'] = ['super_admin', 'hospital_admin', 'cfo'];
ROUTE_ROLES['/notifications']                  = ['super_admin', 'hospital_admin', 'doctor', 'nurse', 'receptionist'];
ROUTE_ROLES['/emergency/mci']                  = ['super_admin', 'hospital_admin', 'doctor', 'nurse', 'receptionist'];
ROUTE_ROLES['/quality/jci']                    = ['super_admin', 'hospital_admin', 'quality_officer', 'quality_manager'];
ROUTE_ROLES['/accounts/financial-statements']  = ['super_admin', 'hospital_admin', 'cfo', 'accountant'];
ROUTE_ROLES['/accounts/budget']                = ['super_admin', 'hospital_admin', 'cfo', 'accountant'];
ROUTE_ROLES['/accounts/fixed-assets']          = ['super_admin', 'hospital_admin', 'cfo', 'accountant'];
ROUTE_ROLES['/settings/api-portal']            = ['super_admin', 'hospital_admin'];
ROUTE_ROLES['/settings/hl7']                   = ['super_admin', 'hospital_admin'];
ROUTE_ROLES['/settings/white-label']           = ['super_admin', 'hospital_admin'];
ROUTE_ROLES['/ai/clinical-intelligence']       = ['super_admin', 'hospital_admin', 'doctor', 'nursing_supervisor'];
ROUTE_ROLES['/research']                       = ['super_admin', 'hospital_admin', 'quality_officer', 'quality_manager'];
ROUTE_ROLES['/admin/go-live'] = ['super_admin', 'hospital_admin'];
ROUTE_ROLES['/design-system'] = ['super_admin', 'hospital_admin'];
ROUTE_ROLES['/admin/data-migration'] = ['super_admin', 'hospital_admin'];

// Core authenticated routes
ROUTE_ROLES['/dashboard'] = [
  'doctor', 'nurse', 'receptionist', 'pharmacist',
  'lab_technician', 'lab_tech',
  'radiologist',
  'billing_executive', 'billing_staff', 'accountant',
  'hr_manager', 'cfo',
  'super_admin', 'hospital_admin',
];
ROUTE_ROLES['/patients'] = ['doctor', 'nurse', 'receptionist', 'super_admin', 'hospital_admin'];
ROUTE_ROLES['/modules'] = [
  'doctor', 'nurse', 'receptionist', 'pharmacist',
  'lab_technician', 'lab_tech',
  'radiologist',
  'billing_executive', 'billing_staff', 'accountant',
  'hr_manager', 'cfo',
  'super_admin', 'hospital_admin',
];
ROUTE_ROLES['/schedule'] = ['receptionist', 'doctor', 'nurse', 'super_admin', 'hospital_admin'];
ROUTE_ROLES['/inbox'] = [
  'doctor', 'nurse', 'receptionist', 'pharmacist',
  'billing_executive', 'billing_staff', 'super_admin', 'hospital_admin',
];

export const BYPASS_ROLES = ["super_admin", "hospital_admin"];

/**
 * Mapping from route path to the module key used in the role_permissions blob.
 *
 * Derived from the canonical `ROUTE_TO_MODULE_KEY` (the same map Layers 1 & 2 use) so a
 * route resolves to its OWN module key instead of being bucketed into one of ~18 parents.
 * Only the internal governance / convenience routes that the sellable registry does not
 * carry are added on top. Specialty modules that previously inherited a bucket keep working
 * via the LEGACY_MODULE_PARENT fallback in `hasAccess`/`hasPermission` below.
 */
export const ROUTE_TO_MODULE: Record<string, string> = {
  ...ROUTE_TO_MODULE_KEY,
  // Internal / non-sellable governance routes (not in the canonical registry)
  "/patients": "patients",
  "/reports": "reports",
  "/users": "user_management",
  "/schedule": "opd",
  "/teleconsult": "telemedicine",
  // Quality sub-pages resolve to the quality module
  "/quality/events": "quality",
  "/quality/clinical-audits": "quality",
  "/quality/qi-projects": "quality",
  "/quality/committees": "quality",
};

/**
 * Resolve a module's permission entry from the blob, falling back to the legacy parent
 * bucket when the specific key is absent. This keeps modules that USED to inherit a
 * bucket (e.g. /dialysis → ipd) working for role blobs written before the rewire, until
 * the backfill migration normalizes them.
 */
function resolveModPerms(permissions: Record<string, any>, moduleKey: string): any {
  const direct = permissions[moduleKey];
  if (direct !== undefined && direct !== null) return direct;
  const parent = LEGACY_MODULE_PARENT[moduleKey];
  if (parent) return permissions[parent];
  return undefined;
}

/** Find a keyed entry in `keys` that `path` is an exact match or sub-path of (first match wins). */
function findParentPath(keys: string[], path: string): string | undefined {
  return keys.find(p => path === p || path.startsWith(p + "/"));
}

/**
 * Resolve a path against the static ROUTE_ROLES table: exact entry first, then the
 * nearest parent prefix. Shared by the settings gate below and the no-permissions-row
 * fallback in `hasAccess`.
 */
function staticRolesFor(path: string): string[] | undefined {
  const exact = ROUTE_ROLES[path];
  if (exact) return exact;
  const parentPath = findParentPath(Object.keys(ROUTE_ROLES), path);
  return parentPath ? ROUTE_ROLES[parentPath] : undefined;
}

/**
 * Checks if a role (or specifically its permissions) has access to a path
 */
export function hasAccess(
  path: string, 
  role: string | null, 
  permissions?: Record<string, any> | null
): boolean {
  if (!role) return false;
  
  // 1. Hard-coded bypass roles (Super Admin / Admin always have access)
  if (BYPASS_ROLES.includes(role)) return true;

  const normalizedPath = path.split("?")[0].replace(/\/$/, "") || "/";

  // 1.5 Core routes that all authenticated users can access
  //
  // "/lms" was added here so any authenticated staff member can reach Staff Training's
  // Staff View — their OWN assigned courses, quiz, and certificates — the same way every
  // other module lets a logged-in user see their own record. Before this, `/lms` was
  // gated to hr_manager/super_admin/hospital_admin ONLY (ALL_MODULES in modules.ts), which
  // blocked a Doctor or Nurse from even taking their own "Hand Hygiene" or "Fire Safety"
  // course. Widening this gate does NOT widen who can run the Training Coordinator's
  // Admin View (Bulk Enrol / Add Course / Add Questions) — `LMSPage.tsx` gates that
  // separately via `hasLmsAdminAccess` below, which reproduces the ORIGINAL gate this
  // comment replaces. It also does not widen plan entitlement — `<ModuleGate>` still
  // independently blocks hospitals whose plan doesn't include LMS, regardless of role.
  const coreRoutes = ["/dashboard", "/modules", "/settings/profile", "/inbox", "/my-hr", "/quick-access", "/lms"];
  if (coreRoutes.includes(normalizedPath)) return true;

  // 1.6 The settings surface is gated by ROLE, never by module entitlement.
  //
  // ROUTE_TO_MODULE below is derived from ROUTE_TO_MODULE_KEY, which is a SUBSCRIPTION-PLAN
  // map: it answers "does this hospital's plan include this screen", not "may this user
  // configure it". Routing /settings/* through it conflates the two and hands the settings
  // screen for a module to everyone who can merely USE that module — a nurse with `ipd` view
  // reached /settings/discharge-workflow and could delete the billing-clearance step, a
  // receptionist with `opd` view reached /settings/opd-workflow and could change the token
  // scheme mid-clinic, and every remaining /settings/* page fell through to the `settings`
  // key (ALWAYS_ENABLED) for anyone whose blob carried it.
  //
  // ROUTE_ROLES already encodes the correct intent — admin-only, with the two deliberate
  // exceptions (/settings/profile above, /settings/tv-display for reception) — so consult it
  // directly and do NOT fall through to the permissions blob. Restoring the module lookup
  // here would reopen the hole; entitlement gating for these screens is ModuleGate's job.
  if (normalizedPath === "/settings" || normalizedPath.startsWith("/settings/")) {
    const settingsRoles = staticRolesFor(normalizedPath);
    return settingsRoles ? settingsRoles.includes(role) : false;
  }

  // 2. Check Database Overrides (Dynamic Permissions)
  // When permissions is explicitly set (even empty {}), use ONLY permissions — no static fallthrough.
  // This ensures a role with zero permissions configured is denied, not granted by static defaults.
  if (permissions !== null && permissions !== undefined) {
    if (permissions.all === true) return true;

    // Find the module key by checking exact matches or parent prefixes
    let moduleKey = ROUTE_TO_MODULE[normalizedPath];

    if (!moduleKey) {
      const parentPath = findParentPath(Object.keys(ROUTE_TO_MODULE), normalizedPath);
      if (parentPath) {
        moduleKey = ROUTE_TO_MODULE[parentPath];
      }
    }

    if (moduleKey) {
      const modPerms = resolveModPerms(permissions, moduleKey);

      if (modPerms) {
        if (typeof modPerms === "string") {
          return modPerms === "r" || modPerms === "rw";
        }
        if (typeof modPerms === "object") {
          return (modPerms as any).view === true;
        }
      }

      return false;
    }

    // Path has no module mapping — deny by default when permissions are explicitly configured
    return false;
  }

  // 3. Fallback to Static System Definitions (only when no permissions row configured).
  // Mirrors the dynamic branch's parent-prefix fallback above: a sub-route with no exact
  // ROUTE_ROLES entry inherits its parent module's allowed roles, so a future /accounts/*
  // (or any module's) sub-page doesn't silently deny everyone until someone remembers to
  // add it explicitly.
  const allowedRoles = staticRolesFor(normalizedPath);
  if (!allowedRoles) return false;

  return allowedRoles.includes(role);
}

/**
 * The pre-widening `/lms` gate, preserved for Admin View eligibility.
 *
 * `/lms` was added to `coreRoutes` above so every authenticated staff member can reach
 * Staff View (their own assigned training). Before that change, `hasAccess('/lms', ...)`
 * WAS the admin gate — nothing else protected Bulk Enrol / Add Course / Add Questions.
 * This function is that same check, verbatim, with the coreRoutes short-circuit removed,
 * so `LMSPage.tsx` can keep Admin View and its three handlers restricted exactly as the
 * whole page used to be: `hr_manager` / `super_admin` / `hospital_admin`, or an explicit
 * `view` grant on the `lms` module (or its `hr` legacy-parent fallback, see
 * `LEGACY_MODULE_PARENT` in moduleRegistry.ts) in the permission matrix.
 */
export function hasLmsAdminAccess(
  role: string | null,
  permissions?: Record<string, any> | null
): boolean {
  if (!role) return false;
  if (BYPASS_ROLES.includes(role)) return true;

  if (permissions !== null && permissions !== undefined) {
    if (permissions.all === true) return true;
    const modPerms = resolveModPerms(permissions, "lms");
    if (modPerms) {
      if (typeof modPerms === "string") return modPerms === "r" || modPerms === "rw";
      if (typeof modPerms === "object") return (modPerms as any).view === true;
    }
    return false;
  }

  const allowedRoles = staticRolesFor("/lms");
  return allowedRoles ? allowedRoles.includes(role) : false;
}

/**
 * Checks if a user has a specific granular permission for a module
 */
export function hasPermission(
  moduleKey: string, 
  action: "view" | "create" | "edit" | "delete" | "approve" | "export", 
  permissions: Record<string, any> | null,
  role: string | null
): boolean {
  if (!role) return false;
  if (BYPASS_ROLES.includes(role)) return true;
  if (!permissions) return false;
  if (permissions.all === true) return true;

  const modPerms = resolveModPerms(permissions, moduleKey);
  if (!modPerms) return false;

  // Handle legacy string format
  if (typeof modPerms === "string") {
    if (action === "view") return modPerms === "r" || modPerms === "rw";
    if (action === "create" || action === "edit" || action === "delete") return modPerms === "rw";
    if (action === "export") return modPerms === "r" || modPerms === "rw";
    return false;
  }

  // Handle granular object format
  return !!(modPerms as any)[action];
}

