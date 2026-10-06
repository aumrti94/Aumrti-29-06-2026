import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, LayoutGrid, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  ALL_MODULES,
  CATEGORIES,
  CATEGORY_COLORS,
  getRecentModules,
  trackModuleVisit,
  type ModuleCategory,
  type ModuleDefinition,
} from "@/lib/modules";
import { useHospitalId } from "@/hooks/useHospitalId";
import { hasAccess } from "@/lib/routeRoles";
import {
  useSubscriptionConfig,
  getModuleKeyForPath,
  isModuleKeyAllowed,
} from "@/hooks/useSubscriptionConfig";

type ModuleTagTone = "new" | "beta" | "popular" | "info";
type ModuleTagPosition = "bottom" | "top-left" | "top-right";
interface ModuleTagInfo { label: string; tone: ModuleTagTone; position: ModuleTagPosition; }

const TAG_TONE_STYLES: Record<ModuleTagTone, string> = {
  new: "bg-emerald-100 text-emerald-700",
  beta: "bg-purple-100 text-purple-700",
  popular: "bg-amber-100 text-amber-700",
  info: "bg-blue-100 text-blue-700",
};

// Global, platform-admin-managed labels (Beta/Most Popular/etc.) — identical for every
// hospital regardless of plan or entitlement. Independent of the per-hospital locking logic
// below; a 5-minute staleTime is fine since this changes rarely, and reusing the exact same
// query key as Platform → Module Tags means an admin editing in the same browser session
// sees it reflected immediately via the shared react-query cache.
function useModuleTags(): Record<string, ModuleTagInfo> {
  const { data } = useQuery({
    queryKey: ["platform-module-tags"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("platform_module_tags")
        .select("module_key, label, tone, position")
        .eq("is_active", true);
      return (data || []) as { module_key: string; label: string; tone: ModuleTagTone; position: ModuleTagPosition }[];
    },
    staleTime: 5 * 60_000,
  });
  return useMemo(
    () => Object.fromEntries((data || []).map((t) => [t.module_key, { label: t.label, tone: t.tone, position: t.position }])),
    [data],
  );
}

/** Chip filters: everything, only-what-this-hospital-has, or a single category. */
type Filter = "All" | "My" | ModuleCategory;

const ModulesPage: React.FC = () => {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<Filter>("My");
  const { role, permissions } = useHospitalId();
  const { enabledModules, isLoading: subLoading } = useSubscriptionConfig();
  const moduleTags = useModuleTags();

  // Mirror the central <ModuleGate> decision so a locked card matches exactly
  // what happens on click (plan + Platform feature overrides). Optimistic (unlocked)
  // while access data is still loading, to avoid a flash of lock icons.
  const isModuleLocked = (route: string): boolean => {
    if (subLoading) return false;
    const key = getModuleKeyForPath(route);
    if (!key) return false; // non-gateable module (dashboard, settings, …) → never locked
    return !isModuleKeyAllowed(key, enabledModules);
  };

  // The full catalogue this user's ROLE may see. Locked-by-plan modules stay in the
  // list (greyed out) so the hospital can still see what's available to add on.
  const roleModules = useMemo(
    () => ALL_MODULES.filter((m) => hasAccess(m.route, role, permissions)),
    [role, permissions],
  );

  // How many of those the hospital's plan actually unlocks — drives the subtitle
  // and the "My Modules" chip count. Recomputes once entitlements resolve.
  const myModules = useMemo(
    () => roleModules.filter((m) => !isModuleLocked(m.route)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roleModules, enabledModules, subLoading],
  );

  const recentModuleRoutes = getRecentModules();
  const recentModules = roleModules.filter((m) => recentModuleRoutes.includes(m.route));

  const filtered = useMemo(() => {
    let list = roleModules;
    if (activeFilter === "My") list = myModules;
    else if (activeFilter !== "All") list = list.filter((m) => m.category === activeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.desc.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q)
      );
    }
    return list;
  }, [roleModules, myModules, activeFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<ModuleCategory, ModuleDefinition[]>();
    for (const m of filtered) {
      if (!map.has(m.category)) map.set(m.category, []);
      map.get(m.category)!.push(m);
    }
    return map;
  }, [filtered]);

  const handleNav = (route: string) => {
    trackModuleVisit(route);
  };

  const chipClass = (active: boolean) =>
    cn(
      "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
      active
        ? "bg-primary text-primary-foreground"
        : "bg-card border border-border text-muted-foreground hover:text-foreground"
    );

  return (
    <div className="flex flex-col min-h-[calc(100vh-56px)] bg-muted/30">
      {/* Header */}
      <div className="bg-card border-b border-border px-8 py-4 flex items-center gap-6 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <LayoutGrid size={22} className="text-primary" />
            <h1 className="text-xl font-bold text-foreground">All Modules</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {myModules.length} of {roleModules.length} modules available on your plan
          </p>
        </div>

        {/* Search */}
        <div className="flex-1 flex justify-center max-w-md mx-auto">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search modules..."
              className="pl-9 h-11 rounded-xl"
            />
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button onClick={() => setActiveFilter("All")} className={chipClass(activeFilter === "All")}>
            All
          </button>
          <button
            onClick={() => setActiveFilter("My")}
            title="Only the modules included in this hospital's plan"
            className={chipClass(activeFilter === "My")}
          >
            My Modules ({myModules.length})
          </button>
          <span className="h-4 w-px bg-border shrink-0 mx-0.5" aria-hidden />
          {CATEGORIES.map((cat) => (
            <button key={cat} onClick={() => setActiveFilter(cat)} className={chipClass(activeFilter === cat)}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {/* Recently used */}
        {recentModules.length > 0 && (activeFilter === "All" || activeFilter === "My") && !search && (
          <div className="mb-8">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
              Recently Used
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {recentModules.map((m) => {
                const locked = isModuleLocked(m.route);
                const tileContent = (
                  <>
                    <div className="relative w-12 h-12 rounded-xl bg-card border border-border flex items-center justify-center text-xl group-hover:border-primary group-hover:shadow-md transition-all">
                      <span className={cn(locked && "opacity-40")}>{m.icon}</span>
                      {locked && (
                        <span className="absolute -top-1 -right-1 bg-card border border-border rounded-full p-0.5 text-muted-foreground">
                          <Lock size={10} />
                        </span>
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-[11px] font-medium text-center leading-tight line-clamp-2",
                        locked ? "text-muted-foreground" : "text-foreground"
                      )}
                    >
                      {m.name}
                    </span>
                  </>
                );
                if (locked) {
                  return (
                    <div
                      key={m.route}
                      title="Not included in your current plan"
                      className="flex flex-col items-center gap-1.5 w-20 shrink-0 group cursor-not-allowed"
                    >
                      {tileContent}
                    </div>
                  );
                }
                return (
                  <Link
                    key={m.route}
                    to={m.route}
                    onClick={() => handleNav(m.route)}
                    className="flex flex-col items-center gap-1.5 w-20 shrink-0 group"
                  >
                    {tileContent}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* No results */}
        {filtered.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-sm">
              {search
                ? `No modules found for “${search}”`
                : "No modules available for this filter."}
            </p>
          </div>
        )}

        {/* Category groups */}
        {CATEGORIES.filter((c) => grouped.has(c)).map((cat) => (
          <div key={cat} className="mb-8">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
              {cat}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {grouped.get(cat)!.map((m) => (
                <ModuleCard
                  key={m.route + m.name}
                  module={m}
                  locked={isModuleLocked(m.route)}
                  tag={moduleTags[getModuleKeyForPath(m.route) || ""]}
                  onClick={() => handleNav(m.route)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const ModuleCard: React.FC<{ module: ModuleDefinition; locked?: boolean; tag?: ModuleTagInfo; onClick: () => void }> = ({
  module,
  locked = false,
  tag,
  onClick,
}) => {
  const bgColor = CATEGORY_COLORS[module.category] || "#64748B";

  const cardClass = cn(
    "relative bg-card border border-border rounded-xl px-4 py-5 flex flex-col items-center gap-2.5 text-center transition-all",
    locked
      ? "opacity-60 cursor-not-allowed"
      : "cursor-pointer hover:border-primary hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-none"
  );

  const cardContent = (
    <>
      {locked && (
        <span className="absolute top-2 right-2 text-muted-foreground/70" aria-label="Locked">
          <Lock size={14} />
        </span>
      )}
      {tag && !locked && tag.position !== "bottom" && (
        <span
          className={cn(
            "absolute top-2 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm",
            tag.position === "top-left" ? "left-2" : "right-2",
            TAG_TONE_STYLES[tag.tone],
          )}
        >
          {tag.label}
        </span>
      )}
      <div
        className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-2xl", locked && "opacity-40")}
        style={{ backgroundColor: `${bgColor}15` }}
      >
        {module.icon}
      </div>
      <span className={cn("text-[13px] font-semibold leading-tight", locked ? "text-muted-foreground" : "text-foreground")}>
        {module.name}
      </span>
      <span className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
        {module.desc}
      </span>
      {module.isNew && !locked && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
          NEW
        </span>
      )}
      {tag && !locked && tag.position === "bottom" && (
        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", TAG_TONE_STYLES[tag.tone])}>
          {tag.label}
        </span>
      )}
    </>
  );

  if (locked) {
    return (
      <div className={cardClass} title="Not included in your current plan">
        {cardContent}
      </div>
    );
  }

  return (
    <Link to={module.route} onClick={onClick} className={cardClass}>
      {cardContent}
    </Link>
  );
};

export default ModulesPage;
