import React, { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, LayoutGrid, Settings, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAumrtiAdmin } from "@/hooks/useAumrtiAdmin";
import { useSidebar } from "@/hooks/useSidebar";
import { usePlatformQuickAccessPicks } from "@/hooks/usePlatformQuickAccessPicks";
import { ALL_PLATFORM_MODULES } from "@/lib/platformModules";
import SidebarChrome, { type SidebarNavGroup, type SidebarNavItem } from "@/components/layout/SidebarChrome";

interface PlatformNavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  exact?: boolean;
}

// Only the pinned essentials live in the permanent sidebar now, mirroring the hospital
// app's shape (Dashboard + All Modules pinned, everything else in a searchable grid) —
// the 17 Growth/Commerce/Operations destinations that used to be permanently listed here
// now live in src/lib/platformModules.ts, rendered by PlatformModulesPage.tsx at
// /platform/modules instead of growing this sidebar forever.
const topItems: PlatformNavItem[] = [
  { label: "Overview", path: "/platform", icon: LayoutDashboard, exact: true },
  { label: "All Modules", path: "/platform/modules", icon: LayoutGrid },
];

const settingsItems: PlatformNavItem[] = [
  { label: "Settings", path: "/platform/settings", icon: Settings },
];

interface PlatformSidebarProps {
  isMobileOverlay?: boolean;
  onClose?: () => void;
}

const PlatformSidebar: React.FC<PlatformSidebarProps> = ({ isMobileOverlay, onClose }) => {
  const { collapsed } = useSidebar();
  const { admin } = useAumrtiAdmin();
  const location = useLocation();
  const navigate = useNavigate();
  const { picks: quickAccessPicks } = usePlatformQuickAccessPicks();

  // Resolve stored paths against the live catalogue, silently dropping a pick whose page no
  // longer exists — same silent-skip the hospital sidebar does for a removed module.
  const quickAccessItems: PlatformNavItem[] = useMemo(
    () =>
      quickAccessPicks
        .map((path) => {
          const mod = ALL_PLATFORM_MODULES.find((m) => m.path === path);
          return mod ? { label: mod.name, path: mod.path, icon: mod.icon } : null;
        })
        .filter((item): item is PlatformNavItem => item !== null),
    [quickAccessPicks],
  );

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  const handleNav = () => {
    if (onClose) onClose();
  };

  // Matches the old NavLink semantics: `exact` items only light up on an
  // exact pathname match; everything else lights up for itself and any
  // nested route below it (e.g. /platform/hospitals/:id keeps "Hospitals" lit).
  const isActive = (item: PlatformNavItem) =>
    item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path);

  const toNavItems = (items: PlatformNavItem[]): SidebarNavItem[] =>
    items.map((item) => ({
      key: item.path,
      label: item.label,
      icon: item.icon,
      active: isActive(item),
      to: item.path,
      onClick: handleNav,
      // Same outlined-when-inactive treatment the hospital sidebar gives its own
      // "All Modules" link — a no-op for every other item.
      emphasize: item.path === "/platform/modules",
    }));

  const topGroups: SidebarNavGroup[] = [{ key: "top", items: toNavItems(topItems) }];
  const scrollGroups: SidebarNavGroup[] = [
    {
      key: "quick-access",
      label: "Quick Access",
      items: toNavItems(quickAccessItems),
      labelActionIcon: Sparkles,
      labelActionTitle: "Customize Quick Access",
      onLabelActionClick: () => navigate("/platform/quick-access"),
    },
  ];
  const bottomGroups: SidebarNavGroup[] = [{ key: "settings", items: toNavItems(settingsItems) }];

  return (
    <SidebarChrome
      topGroups={topGroups}
      scrollGroups={scrollGroups}
      bottomGroups={bottomGroups}
      collapsed={collapsed}
      isMobileOverlay={isMobileOverlay}
      onClose={onClose}
      mobileTitle="Platform"
      user={{
        name: admin?.full_name ?? "Admin",
        initials: admin?.full_name?.[0]?.toUpperCase() ?? "A",
        subtitle: admin?.email,
      }}
      onSignOut={signOut}
    />
  );
};

export default PlatformSidebar;
