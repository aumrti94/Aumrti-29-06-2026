import React from "react";
import {
  Stethoscope, BedDouble, FlaskConical, Receipt, BarChart3,
  HeartPulse, Building2, CalendarDays, Users,
} from "lucide-react";

export interface SidebarItem {
  label: string;
  path: string;
  icon: React.ElementType;
  moduleKey?: string; // optional: if set, hidden when module is disabled
  // optional: if set, this Quick Access shortcut is gated by the `dashboard` module
  // action of the same key, so admins can hide it per role/user (SettingsRolesPage /
  // StaffAccessPanel) without removing the underlying module.
  actionKey?: string;
}

/** Raw per-user preference shape, as stored in `public.user_quick_access`. */
export interface QuickAccessPick {
  route: string;
  moduleKey?: string;
}

// The original fixed 9-item list — now the fallback shown to any user who
// hasn't personalized their Quick Access yet. Keeps its lucide icons and
// actionKeys so the existing admin per-role kill-switch keeps working
// unchanged for these specific shortcuts.
export const DEFAULT_QUICK_ACCESS_ITEMS: SidebarItem[] = [
  { label: "Scheduling",       path: "/schedule",    icon: CalendarDays, moduleKey: "opd",       actionKey: "quick_scheduling" },
  { label: "OPD Queue",        path: "/opd",         icon: Stethoscope,  moduleKey: "opd",       actionKey: "quick_opd" },
  { label: "IPD / Wards",      path: "/ipd",         icon: BedDouble,    moduleKey: "ipd",       actionKey: "quick_ipd" },
  { label: "Billing",          path: "/billing",     icon: Receipt,      moduleKey: "billing",   actionKey: "quick_billing" },
  { label: "HR & Staff",       path: "/hr",          icon: Users,        moduleKey: "hr",        actionKey: "quick_hr" },
  { label: "CEO Board",        path: "/ceo-board",   icon: Building2,    moduleKey: "analytics", actionKey: "quick_ceo_board" },
  { label: "Govt Schemes",     path: "/pmjay",       icon: HeartPulse,   moduleKey: "insurance", actionKey: "quick_govt_schemes" },
  { label: "Lab",              path: "/lab",         icon: FlaskConical, moduleKey: "lab",       actionKey: "quick_lab" },
  { label: "Analytics",        path: "/analytics",   icon: BarChart3,    moduleKey: "analytics", actionKey: "quick_analytics" },
];

// Same list, expressed as picks — this is what a not-yet-customized user's
// preference resolves to, so useQuickAccessPicks() always returns the same
// QuickAccessPick[] shape whether or not a database row exists.
export const DEFAULT_QUICK_ACCESS_PICKS: QuickAccessPick[] = DEFAULT_QUICK_ACCESS_ITEMS.map((item) => ({
  route: item.path,
  moduleKey: item.moduleKey,
}));

/**
 * Wraps an ALL_MODULES emoji string as a React.ElementType compatible with
 * SidebarNavItem.icon (rendered as <Icon size={18}/> by SidebarChrome), so a
 * user-picked module outside the legacy 9 can render its catalogue icon
 * without needing a lucide icon assigned.
 */
export function emojiIcon(emoji: string): React.ElementType {
  return ({ size }: { size?: number }) =>
    React.createElement("span", { style: { fontSize: size ?? 18, lineHeight: 1 } }, emoji);
}
