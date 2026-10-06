import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, LayoutGrid } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ALL_PLATFORM_MODULES,
  PLATFORM_CATEGORIES,
  PLATFORM_CATEGORY_COLORS,
  type PlatformModuleCategory,
  type PlatformModuleDefinition,
} from "@/lib/platformModules";

type Filter = "All" | PlatformModuleCategory;

const PlatformModulesPage: React.FC = () => {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<Filter>("All");

  const filtered = useMemo(() => {
    let list = ALL_PLATFORM_MODULES;
    if (activeFilter !== "All") list = list.filter((m) => m.category === activeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) => m.name.toLowerCase().includes(q) || m.desc.toLowerCase().includes(q) || m.category.toLowerCase().includes(q),
      );
    }
    return list;
  }, [activeFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<PlatformModuleCategory, PlatformModuleDefinition[]>();
    for (const m of filtered) {
      if (!map.has(m.category)) map.set(m.category, []);
      map.get(m.category)!.push(m);
    }
    return map;
  }, [filtered]);

  const chipClass = (active: boolean) =>
    cn(
      "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
      active
        ? "bg-primary text-primary-foreground"
        : "bg-card border border-border text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="flex flex-col h-full bg-muted/30">
      {/* Header */}
      <div className="bg-card border-b border-border px-8 py-4 flex items-center gap-6 flex-wrap shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <LayoutGrid size={22} className="text-primary" />
            <h1 className="text-xl font-bold text-foreground">All Modules</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{ALL_PLATFORM_MODULES.length} platform pages</p>
        </div>

        <div className="flex-1 flex justify-center max-w-md mx-auto">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search platform pages..."
              className="pl-9 h-11 rounded-xl"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button onClick={() => setActiveFilter("All")} className={chipClass(activeFilter === "All")}>All</button>
          {PLATFORM_CATEGORIES.map((cat) => (
            <button key={cat} onClick={() => setActiveFilter(cat)} className={chipClass(activeFilter === cat)}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {filtered.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-sm">{search ? `No pages found for "${search}"` : "No pages available."}</p>
          </div>
        )}

        {PLATFORM_CATEGORIES.filter((c) => grouped.has(c)).map((cat) => (
          <div key={cat} className="mb-8">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">{cat}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {grouped.get(cat)!.map((m) => (
                <PlatformModuleCard key={m.path} module={m} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const PlatformModuleCard: React.FC<{ module: PlatformModuleDefinition }> = ({ module }) => {
  const bgColor = PLATFORM_CATEGORY_COLORS[module.category];
  const Icon = module.icon;
  return (
    <Link
      to={module.path}
      className="relative bg-card border border-border rounded-xl px-4 py-5 flex flex-col items-center gap-2.5 text-center transition-all cursor-pointer hover:border-primary hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-none"
    >
      <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${bgColor}15` }}>
        <Icon className="h-5 w-5" style={{ color: bgColor }} />
      </div>
      <span className="text-[13px] font-semibold leading-tight text-foreground">{module.name}</span>
      <span className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{module.desc}</span>
      {module.isNew && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">NEW</span>
      )}
    </Link>
  );
};

export default PlatformModulesPage;
