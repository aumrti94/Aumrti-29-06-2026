import React, { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Pin, Lock, Loader2, LogIn } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ALL_MODULES,
  CATEGORIES,
  CATEGORY_COLORS,
  type ModuleCategory,
  type ModuleDefinition,
} from "@/lib/modules";
import { useHospitalId } from "@/hooks/useHospitalId";
import { hasAccess } from "@/lib/routeRoles";
import { useQuickAccessPicks } from "@/hooks/useQuickAccessPicks";
import { DEFAULT_QUICK_ACCESS_PICKS, type QuickAccessPick } from "@/lib/quickAccessDefaults";
import {
  useSubscriptionConfig,
  getModuleKeyForPath,
  isModuleKeyAllowed,
} from "@/hooks/useSubscriptionConfig";
import { useToast } from "@/hooks/use-toast";

type Filter = "All" | "Pinned" | ModuleCategory;

/** Sentinel for "no personal override — use my role's default", since Select can't hold null. */
const ROLE_DEFAULT = "__role_default__";

const QuickAccessPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<Filter>("All");
  const [saving, setSaving] = useState(false);
  const { role, permissions } = useHospitalId();
  const { enabledModules, isLoading: subLoading } = useSubscriptionConfig();
  const {
    picks,
    isLoading: picksLoading,
    save,
    reset,
    defaultRoute,
    saveDefaultRoute,
  } = useQuickAccessPicks();

  // Local pending selection + default-route choice, seeded once from the
  // loaded preferences so edits here aren't clobbered by the query
  // refetching in the background.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [landingRoute, setLandingRoute] = useState(ROLE_DEFAULT);
  const seededRef = useRef(false);
  useEffect(() => {
    if (picksLoading || seededRef.current) return;
    setSelected(new Set(picks.map((p) => p.route)));
    setLandingRoute(defaultRoute ?? ROLE_DEFAULT);
    seededRef.current = true;
  }, [picks, defaultRoute, picksLoading]);

  // Same eligibility pool as the "All Modules" page — a user may only pin
  // what their role and hospital plan already let them open.
  const roleModules = useMemo(
    () => ALL_MODULES.filter((m) => hasAccess(m.route, role, permissions)),
    [role, permissions]
  );

  const isLocked = (route: string): boolean => {
    if (subLoading) return false;
    const key = getModuleKeyForPath(route);
    if (!key) return false;
    return !isModuleKeyAllowed(key, enabledModules);
  };

  const filtered = useMemo(() => {
    let list = roleModules;
    if (activeFilter === "Pinned") list = list.filter((m) => selected.has(m.route));
    else if (activeFilter !== "All") list = list.filter((m) => m.category === activeFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.desc.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q)
      );
    }
    return list;
  }, [roleModules, activeFilter, search, selected]);

  const grouped = useMemo(() => {
    const map = new Map<ModuleCategory, ModuleDefinition[]>();
    for (const m of filtered) {
      if (!map.has(m.category)) map.set(m.category, []);
      map.get(m.category)!.push(m);
    }
    return map;
  }, [filtered]);

  const togglePin = (route: string) => {
    if (isLocked(route)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(route)) next.delete(route);
      else next.add(route);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const newPicks: QuickAccessPick[] = Array.from(selected).map((route) => ({
        route,
        moduleKey: getModuleKeyForPath(route) ?? undefined,
      }));
      await Promise.all([
        save(newPicks),
        saveDefaultRoute(landingRoute === ROLE_DEFAULT ? null : landingRoute),
      ]);
      toast({ title: "Quick Access updated" });
    } catch (err: any) {
      toast({ title: "Couldn't save Quick Access", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Scoped to Quick Access shortcuts only — the landing-page preference
  // below is independent and has its own "Use my role's default" option.
  const handleReset = async () => {
    setSaving(true);
    try {
      await reset();
      setSelected(new Set(DEFAULT_QUICK_ACCESS_PICKS.map((p) => p.route)));
      toast({ title: "Reset to default Quick Access" });
    } catch (err: any) {
      toast({ title: "Couldn't reset Quick Access", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const chipClass = (active: boolean) =>
    cn(
      "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
      active
        ? "bg-primary text-primary-foreground"
        : "bg-card border border-border text-muted-foreground hover:text-foreground"
    );

  const isLoading = picksLoading && !seededRef.current;

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col overflow-hidden bg-muted/30">
      {/* Header */}
      <div className="flex-shrink-0 h-14 bg-card border-b border-border flex items-center gap-3 px-5">
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">Quick Access</p>
          <p className="text-[11px] text-muted-foreground">
            Choose which shortcuts appear in your sidebar — {selected.size} pinned
          </p>
        </div>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={handleReset} disabled={saving}>
          Reset to defaults
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      {/* Default landing page after sign-in */}
      <div className="flex-shrink-0 bg-card border-b border-border px-5 py-3 flex items-center gap-3">
        <LogIn className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-[13px] font-medium text-foreground shrink-0">
          Default landing page after sign-in
        </span>
        <Select value={landingRoute} onValueChange={setLandingRoute}>
          <SelectTrigger className="h-9 w-[260px] text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ROLE_DEFAULT}>Use my role's default</SelectItem>
            {roleModules.map((m) => (
              <SelectItem key={m.route} value={m.route}>
                {m.icon} {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Search + filters */}
      <div className="flex-shrink-0 bg-card border-b border-border px-8 py-3 flex items-center gap-6 flex-wrap">
        <div className="flex-1 flex justify-center max-w-md mx-auto">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search modules..."
              className="pl-9 h-10 rounded-xl"
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button onClick={() => setActiveFilter("All")} className={chipClass(activeFilter === "All")}>
            All
          </button>
          <button onClick={() => setActiveFilter("Pinned")} className={chipClass(activeFilter === "Pinned")}>
            Pinned ({selected.size})
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
        {isLoading && (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {!isLoading && roleModules.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-sm">No modules are available to pin for your role yet.</p>
          </div>
        )}

        {!isLoading && roleModules.length > 0 && filtered.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-sm">
              {search ? `No modules found for "${search}"` : "Nothing in this filter yet — pin something from All."}
            </p>
          </div>
        )}

        {!isLoading &&
          CATEGORIES.filter((c) => grouped.has(c)).map((cat) => (
            <div key={cat} className="mb-8">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                {cat}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {grouped.get(cat)!.map((m) => (
                  <PinnableCard
                    key={m.route}
                    module={m}
                    locked={isLocked(m.route)}
                    pinned={selected.has(m.route)}
                    onToggle={() => togglePin(m.route)}
                  />
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};

const PinnableCard: React.FC<{
  module: ModuleDefinition;
  locked: boolean;
  pinned: boolean;
  onToggle: () => void;
}> = ({ module, locked, pinned, onToggle }) => {
  const bgColor = CATEGORY_COLORS[module.category] || "#64748B";

  return (
    <button
      onClick={locked ? undefined : onToggle}
      disabled={locked}
      title={locked ? "Not included in your current plan" : pinned ? "Remove from Quick Access" : "Add to Quick Access"}
      className={cn(
        "relative bg-card border rounded-xl px-4 py-5 flex flex-col items-center gap-2.5 text-center transition-all",
        locked
          ? "opacity-60 cursor-not-allowed border-border"
          : pinned
          ? "cursor-pointer border-primary shadow-md"
          : "cursor-pointer border-border hover:border-primary hover:shadow-lg hover:-translate-y-0.5"
      )}
    >
      <span
        className={cn(
          "absolute top-2 right-2",
          locked ? "text-muted-foreground/70" : pinned ? "text-primary" : "text-muted-foreground/40"
        )}
        aria-label={locked ? "Locked" : pinned ? "Pinned" : "Not pinned"}
      >
        {locked ? <Lock size={14} /> : <Pin size={14} fill={pinned ? "currentColor" : "none"} />}
      </span>
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
    </button>
  );
};

export default QuickAccessPage;
