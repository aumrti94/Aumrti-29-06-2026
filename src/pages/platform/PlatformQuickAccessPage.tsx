import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Pin, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ALL_PLATFORM_MODULES,
  PLATFORM_CATEGORIES,
  PLATFORM_CATEGORY_COLORS,
  DEFAULT_PLATFORM_QUICK_ACCESS,
  type PlatformModuleCategory,
  type PlatformModuleDefinition,
} from "@/lib/platformModules";
import { usePlatformQuickAccessPicks } from "@/hooks/usePlatformQuickAccessPicks";
import { useToast } from "@/hooks/use-toast";

type Filter = "All" | "Pinned" | PlatformModuleCategory;

const PlatformQuickAccessPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<Filter>("All");
  const [saving, setSaving] = useState(false);
  const { picks, isLoading: picksLoading, save, reset } = usePlatformQuickAccessPicks();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const seededRef = useRef(false);
  useEffect(() => {
    if (picksLoading || seededRef.current) return;
    setSelected(new Set(picks));
    seededRef.current = true;
  }, [picks, picksLoading]);

  const filtered = useMemo(() => {
    let list = ALL_PLATFORM_MODULES;
    if (activeFilter === "Pinned") list = list.filter((m) => selected.has(m.path));
    else if (activeFilter !== "All") list = list.filter((m) => m.category === activeFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (m) => m.name.toLowerCase().includes(q) || m.desc.toLowerCase().includes(q) || m.category.toLowerCase().includes(q),
      );
    }
    return list;
  }, [activeFilter, search, selected]);

  const grouped = useMemo(() => {
    const map = new Map<PlatformModuleCategory, PlatformModuleDefinition[]>();
    for (const m of filtered) {
      if (!map.has(m.category)) map.set(m.category, []);
      map.get(m.category)!.push(m);
    }
    return map;
  }, [filtered]);

  const togglePin = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await save(Array.from(selected));
      toast({ title: "Quick Access updated" });
    } catch (err: any) {
      toast({ title: "Couldn't save Quick Access", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      await reset();
      setSelected(new Set(DEFAULT_PLATFORM_QUICK_ACCESS));
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
        : "bg-card border border-border text-muted-foreground hover:text-foreground",
    );

  const isLoading = picksLoading && !seededRef.current;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-muted/30">
      <div className="flex-shrink-0 h-14 bg-card border-b border-border flex items-center gap-3 px-5">
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">Quick Access</p>
          <p className="text-[11px] text-muted-foreground">
            Choose which shortcuts appear in your Platform sidebar — {selected.size} pinned
          </p>
        </div>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={handleReset} disabled={saving}>Reset to defaults</Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
      </div>

      <div className="flex-shrink-0 bg-card border-b border-border px-8 py-3 flex items-center gap-6 flex-wrap">
        <div className="flex-1 flex justify-center max-w-md mx-auto">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search platform pages..." className="pl-9 h-10 rounded-xl" />
          </div>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button onClick={() => setActiveFilter("All")} className={chipClass(activeFilter === "All")}>All</button>
          <button onClick={() => setActiveFilter("Pinned")} className={chipClass(activeFilter === "Pinned")}>Pinned ({selected.size})</button>
          <span className="h-4 w-px bg-border shrink-0 mx-0.5" aria-hidden />
          {PLATFORM_CATEGORIES.map((cat) => (
            <button key={cat} onClick={() => setActiveFilter(cat)} className={chipClass(activeFilter === cat)}>{cat}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {isLoading && (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-sm">{search ? `No pages found for "${search}"` : "Nothing in this filter yet — pin something from All."}</p>
          </div>
        )}

        {!isLoading && PLATFORM_CATEGORIES.filter((c) => grouped.has(c)).map((cat) => (
          <div key={cat} className="mb-8">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">{cat}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {grouped.get(cat)!.map((m) => (
                <PinnableCard key={m.path} module={m} pinned={selected.has(m.path)} onToggle={() => togglePin(m.path)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const PinnableCard: React.FC<{ module: PlatformModuleDefinition; pinned: boolean; onToggle: () => void }> = ({ module, pinned, onToggle }) => {
  const bgColor = PLATFORM_CATEGORY_COLORS[module.category];
  const Icon = module.icon;
  return (
    <button
      onClick={onToggle}
      title={pinned ? "Remove from Quick Access" : "Add to Quick Access"}
      className={cn(
        "relative bg-card border rounded-xl px-4 py-5 flex flex-col items-center gap-2.5 text-center transition-all cursor-pointer",
        pinned ? "border-primary shadow-md" : "border-border hover:border-primary hover:shadow-lg hover:-translate-y-0.5",
      )}
    >
      <span className={cn("absolute top-2 right-2", pinned ? "text-primary" : "text-muted-foreground/40")} aria-label={pinned ? "Pinned" : "Not pinned"}>
        <Pin size={14} fill={pinned ? "currentColor" : "none"} />
      </span>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${bgColor}15` }}>
        <Icon className="h-5 w-5" style={{ color: bgColor }} />
      </div>
      <span className="text-[13px] font-semibold leading-tight text-foreground">{module.name}</span>
      <span className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{module.desc}</span>
    </button>
  );
};

export default PlatformQuickAccessPage;
