import type React from "react";
import {
  Newspaper, Radar, Gift, Heart, Building2, CreditCard, Tag, BarChart3, BrainCircuit,
  AlertTriangle, ScrollText, ShieldCheck, Workflow, FlaskConical, Sparkles, KeyRound,
  Smartphone, Headset, PlayCircle,
} from "lucide-react";

export type PlatformModuleCategory = "Growth" | "Commerce" | "Operations";

export interface PlatformModuleDefinition {
  name: string;
  desc: string;
  icon: React.ElementType;
  path: string;
  category: PlatformModuleCategory;
  isNew?: boolean;
}

export const PLATFORM_CATEGORY_COLORS: Record<PlatformModuleCategory, string> = {
  Growth: "#0E7B7B",
  Commerce: "#D97706",
  Operations: "#DC2626",
};

export const ALL_PLATFORM_MODULES: PlatformModuleDefinition[] = [
  // ── GROWTH ──
  { name: "Briefing", desc: "Daily/weekly summary of what changed across the platform", icon: Newspaper, path: "/platform/briefing", category: "Growth" },
  { name: "Churn Radar", desc: "Hospitals showing early risk signals", icon: Radar, path: "/platform/churn-radar", category: "Growth" },
  { name: "Referrals", desc: "Hospital-to-hospital referral program tracking", icon: Gift, path: "/platform/referrals", category: "Growth" },
  { name: "Cust. Success", desc: "Onboarding health and account-management queue", icon: Heart, path: "/platform/customer-success", category: "Growth" },
  { name: "Training Videos", desc: "Add and manage the how-to videos hospital staff see in Settings", icon: PlayCircle, path: "/platform/customer-success?tab=videos", category: "Growth" },

  // ── COMMERCE ──
  { name: "Hospitals", desc: "Every tenant — status, plan, modules, billing", icon: Building2, path: "/platform/hospitals", category: "Commerce" },
  { name: "Plans", desc: "Pricing tiers and the module entitlement matrix", icon: CreditCard, path: "/platform/plans", category: "Commerce" },
  { name: "Discounts", desc: "Promotional and negotiated pricing rules", icon: Tag, path: "/platform/discounts", category: "Commerce" },
  { name: "Revenue", desc: "MRR/ARR, collections, and revenue trends", icon: BarChart3, path: "/platform/revenue", category: "Commerce" },
  { name: "AI Costs", desc: "AI provider spend and per-feature cost breakdown", icon: BrainCircuit, path: "/platform/ai-performance", category: "Commerce" },

  // ── OPERATIONS ──
  { name: "Incidents", desc: "Platform-wide incident tracking", icon: AlertTriangle, path: "/platform/incidents", category: "Operations" },
  { name: "Audit Log", desc: "Every admin action, who did it and when", icon: ScrollText, path: "/platform/audit", category: "Operations" },
  { name: "Compliance", desc: "Statutory/regulatory compliance status across tenants", icon: ShieldCheck, path: "/platform/compliance", category: "Operations" },
  { name: "Automation", desc: "Platform automation rules", icon: Workflow, path: "/platform/automation-rules", category: "Operations" },
  { name: "Feature Flags", desc: "Staged rollouts for our own releases", icon: FlaskConical, path: "/platform/feature-flags", category: "Operations" },
  { name: "Module Tags", desc: "Beta/Most Popular labels shown on every hospital's module grid", icon: Sparkles, path: "/platform/module-tags", category: "Operations", isNew: true },
  { name: "API Hub", desc: "Platform-wide API provider configuration", icon: KeyRound, path: "/platform/api-config", category: "Operations" },
  { name: "Mobile App", desc: "Mobile app release/config management", icon: Smartphone, path: "/platform/mobile", category: "Operations" },
  { name: "Support", desc: "Support ticket queue", icon: Headset, path: "/platform/support", category: "Operations" },
];

export const PLATFORM_CATEGORIES: PlatformModuleCategory[] = ["Growth", "Commerce", "Operations"];

// Shown to any admin who hasn't customized Quick Access yet. Paths only — unlike the hospital
// side's DEFAULT_QUICK_ACCESS_PICKS there's no per-item entitlement to carry alongside, since
// nothing on the Platform side is gated per-page.
export const DEFAULT_PLATFORM_QUICK_ACCESS: string[] = [
  "/platform/hospitals", "/platform/plans", "/platform/revenue", "/platform/audit",
];
