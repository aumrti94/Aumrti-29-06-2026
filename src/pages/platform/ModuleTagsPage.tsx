import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, X, Save, Loader2, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errorMessage";
import { FormError } from "@/components/ui/FormError";
import { logAdminAction } from "@/lib/adminAudit";
import { ALL_MODULES } from "@/lib/modules";
import { ROUTE_TO_MODULE_KEY } from "@/lib/moduleKeys";

interface ModuleTag {
  id: string;
  module_key: string;
  label: string;
  tone: "new" | "beta" | "popular" | "info";
  position: "bottom" | "top-left" | "top-right";
  is_active: boolean;
  updated_at: string;
}

const TONE_OPTIONS: { value: ModuleTag["tone"]; label: string }[] = [
  { value: "new", label: "New (green)" },
  { value: "beta", label: "Beta (purple)" },
  { value: "popular", label: "Most Popular (amber)" },
  { value: "info", label: "Info (blue)" },
];

const TONE_STYLES: Record<ModuleTag["tone"], string> = {
  new: "bg-emerald-100 text-emerald-700",
  beta: "bg-purple-100 text-purple-700",
  popular: "bg-amber-100 text-amber-700",
  info: "bg-blue-100 text-blue-700",
};

const POSITION_OPTIONS: { value: ModuleTag["position"]; label: string }[] = [
  { value: "bottom", label: "Bottom (inline, default)" },
  { value: "top-left", label: "Top-left corner ribbon" },
  { value: "top-right", label: "Top-right corner ribbon" },
];

const BLANK = { module_key: "", label: "", tone: "info" as ModuleTag["tone"], position: "bottom" as ModuleTag["position"] };

// Every module keyed the same way the entitlement system already keys them — not by route
// string, which can carry query params (e.g. "/pharmacy?mode=retail").
const MODULE_OPTIONS = ALL_MODULES.map((m) => ({
  key: ROUTE_TO_MODULE_KEY[m.route] ?? ROUTE_TO_MODULE_KEY[m.route.split("?")[0]],
  name: m.name,
  category: m.category,
})).filter((m) => !!m.key);

const MODULE_NAME_BY_KEY: Record<string, string> = Object.fromEntries(
  MODULE_OPTIONS.map((m) => [m.key, `${m.name} (${m.category})`]),
);

async function fetchTags(): Promise<ModuleTag[]> {
  const { data } = await (supabase as any).from("platform_module_tags").select("*").order("updated_at", { ascending: false });
  return data || [];
}

export default function ModuleTagsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ModuleTag | null>(null);
  const [form, setForm] = useState(BLANK);
  const [formError, setFormError] = useState<string | null>(null);
  // Create-mode only: which modules the bulk-add applies to. A single row is just the N=1
  // case of the same flow, so there's no separate "single create" path to maintain.
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [moduleSearch, setModuleSearch] = useState("");

  const { data: tags = [], isLoading } = useQuery({ queryKey: ["platform-module-tags"], queryFn: fetchTags, staleTime: 30_000 });

  const taggedKeys = new Set(tags.filter((t) => t.is_active).map((t) => t.module_key));
  const availableModules = MODULE_OPTIONS.filter((m) => !taggedKeys.has(m.key));
  const filteredAvailableModules = useMemo(() => {
    const q = moduleSearch.trim().toLowerCase();
    if (!q) return availableModules;
    return availableModules.filter((m) => m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q));
  }, [availableModules, moduleSearch]);

  const openCreate = () => {
    setEditing(null);
    setForm(BLANK);
    setSelectedKeys(new Set());
    setModuleSearch("");
    setFormError(null);
    setShowForm(true);
  };
  const openEdit = (t: ModuleTag) => {
    setEditing(t);
    setForm({ module_key: t.module_key, label: t.label, tone: t.tone, position: t.position });
    setFormError(null);
    setShowForm(true);
  };

  const toggleModule = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        await (supabase as any)
          .from("platform_module_tags")
          .update({ label: form.label, tone: form.tone, position: form.position, updated_at: new Date().toISOString() })
          .eq("id", editing.id);
      } else {
        const rows = Array.from(selectedKeys).map((key) => ({ module_key: key, label: form.label, tone: form.tone, position: form.position }));
        await (supabase as any).from("platform_module_tags").insert(rows);
      }
    },
    onSuccess: () => {
      setFormError(null);
      if (editing) {
        logAdminAction("module_tag_updated", { details: { module_key: form.module_key, label: form.label } });
      } else if (selectedKeys.size === 1) {
        logAdminAction("module_tag_created", { details: { module_key: Array.from(selectedKeys)[0], label: form.label } });
      } else {
        logAdminAction("module_tags_bulk_created", { details: { module_keys: Array.from(selectedKeys), label: form.label, tone: form.tone } });
      }
      toast.success(editing ? "Tag updated" : selectedKeys.size > 1 ? `${selectedKeys.size} tags created` : "Tag created");
      setShowForm(false);
      setForm(BLANK);
      setSelectedKeys(new Set());
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["platform-module-tags"] });
    },
    onError: (e: any) => { const m = getErrorMessage(e); setFormError(m); toast.error(m); },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      await (supabase as any).from("platform_module_tags").update({ is_active, updated_at: new Date().toISOString() }).eq("id", id);
    },
    onSuccess: (_r, vars) => {
      logAdminAction(vars.is_active ? "module_tag_reactivated" : "module_tag_deactivated", { details: { id: vars.id } });
      qc.invalidateQueries({ queryKey: ["platform-module-tags"] });
    },
    onError: (e: any) => toast.error(getErrorMessage(e)),
  });

  const removeTag = useMutation({
    mutationFn: async (id: string) => {
      await (supabase as any).from("platform_module_tags").delete().eq("id", id);
      return id;
    },
    onSuccess: (id: string) => {
      logAdminAction("module_tag_removed", { details: { id } });
      toast.success("Tag removed");
      qc.invalidateQueries({ queryKey: ["platform-module-tags"] });
    },
    onError: (e: any) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 border-b border-border flex items-center justify-between px-6 shrink-0">
        <div>
          <h1 className="text-[15px] font-semibold text-foreground">Module Tags</h1>
          <p className="text-[11px] text-muted-foreground">
            Labels shown on every hospital's module launcher (e.g. "Beta", "Most Popular") — global, not tied to any plan or entitlement.
          </p>
        </div>
        <button onClick={openCreate} disabled={availableModules.length === 0}
          className="flex items-center gap-2 px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
          <Plus size={12} /> New Tag
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="text-[10px] uppercase font-bold text-muted-foreground border-b border-border">
              {["Module", "Tag", "Active", "Updated", ""].map((h) => (
                <th key={h} className="px-5 py-3 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-xs text-muted-foreground">Loading…</td></tr>
            ) : tags.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-xs text-muted-foreground">No module tags yet</td></tr>
            ) : tags.map((t) => (
              <tr key={t.id} className="border-t border-border hover:bg-muted/40 transition-colors cursor-pointer" onClick={() => openEdit(t)}>
                <td className="px-5 py-3 text-xs font-medium text-foreground">{MODULE_NAME_BY_KEY[t.module_key] || t.module_key}</td>
                <td className="px-5 py-3">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TONE_STYLES[t.tone]}`}>{t.label}</span>
                </td>
                <td className="px-5 py-3">
                  <button onClick={(e) => { e.stopPropagation(); toggleActive.mutate({ id: t.id, is_active: !t.is_active }); }}
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${t.is_active ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                    {t.is_active ? "Active" : "Inactive"}
                  </button>
                </td>
                <td className="px-5 py-3 text-xs text-muted-foreground">{new Date(t.updated_at).toLocaleDateString("en-IN")}</td>
                <td className="px-5 py-3">
                  <button onClick={(e) => { e.stopPropagation(); if (window.confirm(`Remove the "${t.label}" tag?`)) removeTag.mutate(t.id); }}
                    className="text-muted-foreground hover:text-red-600 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-card border border-border rounded-xl w-[460px] max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <p className="text-sm font-semibold text-foreground">{editing ? "Edit Module Tag" : "New Module Tag"}</p>
              <button onClick={() => setShowForm(false)}><X size={15} className="text-muted-foreground hover:text-foreground" /></button>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto">
              <div>
                <label className="text-xs text-muted-foreground">
                  {editing ? "Module" : `Modules${selectedKeys.size > 0 ? ` (${selectedKeys.size} selected)` : ""}`}
                </label>
                {editing ? (
                  <p className="mt-1 h-8 flex items-center px-3 text-xs bg-muted rounded-lg text-foreground">
                    {MODULE_NAME_BY_KEY[form.module_key] || form.module_key}
                  </p>
                ) : (
                  <>
                    <div className="relative mt-1">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input value={moduleSearch} onChange={(e) => setModuleSearch(e.target.value)}
                        placeholder="Search modules…"
                        className="w-full h-8 pl-7 pr-2 text-xs bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <button type="button"
                        onClick={() => setSelectedKeys(new Set(filteredAvailableModules.map((m) => m.key)))}
                        className="text-[11px] text-primary hover:underline">
                        Select all ({filteredAvailableModules.length})
                      </button>
                      {selectedKeys.size > 0 && (
                        <button type="button" onClick={() => setSelectedKeys(new Set())} className="text-[11px] text-muted-foreground hover:underline">
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="mt-1.5 max-h-48 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                      {filteredAvailableModules.length === 0 ? (
                        <p className="px-3 py-4 text-xs text-muted-foreground text-center">No untagged modules match.</p>
                      ) : filteredAvailableModules.map((m) => (
                        <label key={m.key} className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-muted/40">
                          <input type="checkbox" checked={selectedKeys.has(m.key)} onChange={() => toggleModule(m.key)} />
                          <span className="text-foreground">{m.name}</span>
                          <span className="text-muted-foreground">({m.category})</span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Label</label>
                <input value={form.label} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                  placeholder="Beta"
                  className="w-full mt-1 h-8 px-3 text-xs bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Tone</label>
                <select value={form.tone} onChange={(e) => setForm((p) => ({ ...p, tone: e.target.value as ModuleTag["tone"] }))}
                  className="w-full mt-1 h-8 px-2 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary">
                  {TONE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Position on card</label>
                <select value={form.position} onChange={(e) => setForm((p) => ({ ...p, position: e.target.value as ModuleTag["position"] }))}
                  className="w-full mt-1 h-8 px-2 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary">
                  {POSITION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${TONE_STYLES[form.tone]}`}>
                  {form.label || "Preview"}
                </span>
              </div>
            </div>
            <div className="px-5 pb-5 pt-3 space-y-3 shrink-0 border-t border-border">
              <FormError message={formError} />
              <button
                onClick={() => save.mutate()}
                disabled={save.isPending || !form.label || (editing ? false : selectedKeys.size === 0)}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
                {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {editing ? "Save Changes" : selectedKeys.size > 1 ? `Create ${selectedKeys.size} Tags` : "Create Tag"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
