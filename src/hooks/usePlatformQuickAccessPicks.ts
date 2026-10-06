import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAumrtiAdmin } from "@/hooks/useAumrtiAdmin";
import { DEFAULT_PLATFORM_QUICK_ACCESS } from "@/lib/platformModules";

interface PlatformQuickAccessRow {
  items: string[] | null;
}

interface UsePlatformQuickAccessPicksResult {
  /** Stored picks (paths), or the default 4 if the admin hasn't customized. */
  picks: string[];
  isCustomized: boolean;
  isLoading: boolean;
  save: (picks: string[]) => Promise<void>;
  reset: () => Promise<void>;
}

// Platform-admin analog of useQuickAccessPicks.ts, keyed on admin_id (no hospital_id — a
// platform admin isn't tenant-scoped). Same NULL-vs-array convention: items == null → not
// customized → falls back to DEFAULT_PLATFORM_QUICK_ACCESS.
export function usePlatformQuickAccessPicks(): UsePlatformQuickAccessPicksResult {
  const { admin, isLoading: adminLoading } = useAumrtiAdmin();
  const queryClient = useQueryClient();

  const queryKey = ["platform-quick-access", admin?.id] as const;

  const { data: row, isLoading: queryLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("platform_admin_quick_access")
        .select("items")
        .eq("admin_id", admin!.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as PlatformQuickAccessRow | null;
    },
    enabled: !!admin?.id,
    staleTime: 10 * 60 * 1000,
  });

  const saveMutation = useMutation({
    mutationFn: async (newPicks: string[]) => {
      if (!admin?.id) throw new Error("admin identity not resolved");
      const { error } = await (supabase as any)
        .from("platform_admin_quick_access")
        .upsert(
          { admin_id: admin.id, items: newPicks, updated_at: new Date().toISOString() },
          { onConflict: "admin_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      if (!admin?.id) throw new Error("admin identity not resolved");
      const { error } = await (supabase as any)
        .from("platform_admin_quick_access")
        .upsert(
          { admin_id: admin.id, items: null, updated_at: new Date().toISOString() },
          { onConflict: "admin_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const isCustomized = row?.items != null;
  const picks = isCustomized ? (row!.items as string[]) : DEFAULT_PLATFORM_QUICK_ACCESS;
  const isLoading = adminLoading || (!!admin?.id && queryLoading);

  return {
    picks,
    isCustomized,
    isLoading,
    save: (newPicks: string[]) => saveMutation.mutateAsync(newPicks),
    reset: () => resetMutation.mutateAsync(),
  };
}
