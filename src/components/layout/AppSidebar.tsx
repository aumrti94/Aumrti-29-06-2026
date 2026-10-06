import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Home, LayoutGrid, UserPlus, Pill,
  Inbox, Settings, LogOut, Activity, FolderOpen, X, ShieldCheck, Wrench, UserCircle, Sparkles,
} from "lucide-react";
import { useCredentialAlert } from "@/hooks/useCredentialAlert";
import { useSubscriptionConfig, isModuleKeyAllowed } from "@/hooks/useSubscriptionConfig";
import { useSidebar } from "@/hooks/useSidebar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useHospitalId } from "@/hooks/useHospitalId";
import { useQuickAccessPicks } from "@/hooks/useQuickAccessPicks";
import { hasAccess } from "@/lib/routeRoles";
import { hasActionAccess } from "@/lib/tabPermissions";
import { ALL_MODULES } from "@/lib/modules";
import { DEFAULT_QUICK_ACCESS_ITEMS, emojiIcon, type SidebarItem } from "@/lib/quickAccessDefaults";
import SidebarChrome, { type SidebarNavGroup, type SidebarNavItem } from "./SidebarChrome";

const topItems: SidebarItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: Home },
  { label: "All Modules", path: "/modules", icon: LayoutGrid },
  { label: "Patients", path: "/patients", icon: UserPlus, moduleKey: "patients" },
];

const recordsItems: SidebarItem[] = [
  { label: "Medical Records", path: "/mrd",          icon: FolderOpen,  moduleKey: "mrd" },
  { label: "IPC Dashboard",   path: "/ipc/dashboard",icon: ShieldCheck, moduleKey: "ipc" },
  { label: "FMS / Safety",    path: "/fms/dashboard",icon: Wrench,      moduleKey: "fms" },
  { label: "ABDM / ABHA",     path: "/abdm",         icon: ShieldCheck },
];

const bottomItems: SidebarItem[] = [
  { label: "My HR", path: "/my-hr", icon: UserCircle },
  { label: "Inbox", path: "/inbox", icon: Inbox },
  { label: "Settings", path: "/settings", icon: Settings },
];

interface AppSidebarProps {
  isMobileOverlay?: boolean;
  onClose?: () => void;
}

const AppSidebar: React.FC<AppSidebarProps> = ({ isMobileOverlay, onClose }) => {
  const { collapsed } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hospitalId, role, permissions, loading } = useHospitalId();
  const { expiringCount } = useCredentialAlert();
  const [userName, setUserName] = useState("User");
  const [userInitials, setUserInitials] = useState("U");
  const [pendingConsentCount, setPendingConsentCount] = useState(0);

  // Entitlement comes from the Platform console only (plan + feature overrides),
  // the same decision <ModuleGate> enforces on the route itself.
  const { enabledModules, isLoading: subLoading } = useSubscriptionConfig();

  // Per-user personalization (src/pages/modules/QuickAccessPage.tsx). Deliberately
  // NOT trusted blindly — filterItems() below still re-applies the full
  // hasAccess/isModuleKeyAllowed/hasActionAccess ceiling to whatever comes out
  // of this, so a stored pick can never exceed what the role/plan/admin allow.
  const { picks: quickAccessPicks } = useQuickAccessPicks();

  const quickAccessItems: SidebarItem[] = useMemo(
    () =>
      quickAccessPicks
        .map((p) => {
          const legacy = DEFAULT_QUICK_ACCESS_ITEMS.find((d) => d.path === p.route);
          if (legacy) return legacy;
          const mod = ALL_MODULES.find((m) => m.route === p.route);
          return mod
            ? { label: mod.name, path: mod.route, icon: emojiIcon(mod.icon), moduleKey: p.moduleKey }
            : null;
        })
        .filter((item): item is SidebarItem => item !== null),
    [quickAccessPicks]
  );

  const filterItems = (items: SidebarItem[]) =>
    items.filter((item) =>
      hasAccess(item.path, role, permissions) &&
      (!item.moduleKey || subLoading || isModuleKeyAllowed(item.moduleKey, enabledModules)) &&
      (!item.actionKey || hasActionAccess("dashboard", item.actionKey, permissions, role))
    );

  useEffect(() => {
    if (hospitalId) {
      supabase
        .from("abdm_consents")
        .select("id", { count: "exact", head: true })
        .eq("hospital_id", hospitalId)
        .eq("status", "REQUESTED")
        .then(({ count }) => setPendingConsentCount(count ?? 0));
    }
  }, [hospitalId]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("users").select("full_name, role").eq("auth_user_id", user.id).maybeSingle()
        .then(({ data }) => {
          if (data) {
            setUserName(data.full_name || "User");
            const parts = (data.full_name || "U").split(" ");
            setUserInitials(parts.map((p: string) => p[0]).join("").toUpperCase().slice(0, 2));
          }
        });
    });
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({ title: "Signed out successfully" });
    navigate("/login", { replace: true });
  };

  const handleNav = () => {
    if (onClose) onClose();
  };

  const toNavItems = (items: SidebarItem[]): SidebarNavItem[] =>
    filterItems(items).map((item) => ({
      key: item.path,
      label: item.label,
      icon: item.icon,
      active: location.pathname === item.path,
      to: item.path,
      onClick: handleNav,
      badge: item.path === "/hr" ? expiringCount : item.path === "/abdm" ? pendingConsentCount : 0,
      emphasize: item.path === "/modules",
    }));

  const topGroups: SidebarNavGroup[] = [{ key: "top", items: toNavItems(topItems) }];
  const scrollGroups: SidebarNavGroup[] = [
    {
      key: "quick-access",
      label: "Quick Access",
      items: toNavItems(quickAccessItems),
      labelActionIcon: Sparkles,
      labelActionTitle: "Customize Quick Access",
      onLabelActionClick: () => navigate("/quick-access"),
    },
    { key: "records", label: "Records", items: toNavItems(recordsItems) },
  ];
  const bottomGroups: SidebarNavGroup[] = [{ key: "bottom", items: toNavItems(bottomItems) }];

  return (
    <SidebarChrome
      topGroups={topGroups}
      scrollGroups={scrollGroups}
      bottomGroups={bottomGroups}
      collapsed={collapsed}
      isMobileOverlay={isMobileOverlay}
      onClose={onClose}
      user={{
        name: userName,
        initials: userInitials,
        subtitle: (role || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      }}
      onSignOut={handleSignOut}
    />
  );
};

export default AppSidebar;
