import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useHospitalId } from "@/hooks/useHospitalId";
import { DEFAULT_QUICK_ACCESS_PICKS, type QuickAccessPick } from "@/lib/quickAccessDefaults";

interface QuickAccessRow {
  items: QuickAccessPick[] | null;
  default_route: string | null;
}

interface UseQuickAccessPicksResult {
  /** Stored picks, or the default 9 if the user hasn't customized. */
  picks: QuickAccessPick[];
  isCustomized: boolean;
  /** Personal "land here after sign-in" override, or null to use the role default. */
  defaultRoute: string | null;
  isLoading: boolean;
  save: (picks: QuickAccessPick[]) => Promise<void>;
  reset: () => Promise<void>;
  saveDefaultRoute: (route: string | null) => Promise<void>;
}

// Dumb read/write of the stored preference row only — deliberately does NOT
// filter picks against role/plan/admin access. That ceiling lives in
// AppSidebar's filterItems and must be re-applied on every render, never
// trusted from here. Same reasoning applies to defaultRoute: a stale pick
// (role changed since it was saved) is caught by RoleGuard's own denied-route
// fallback at sign-in time, not by this hook.
//
// Quick Access picks and the default landing route are two independent
// preferences that happen to live on the same row (one row per user). Each
// column is independently nullable so resetting/clearing one never disturbs
// the other — save()/reset() only ever write `items`, saveDefaultRoute()
// only ever writes `default_route`.
export function useQuickAccessPicks(): UseQuickAccessPicksResult {
  const { userId, hospitalId, loading: identityLoading } = useHospitalId();
  const queryClient = useQueryClient();

  const queryKey = ["quick-access-picks", userId] as const;

  const { data: row, isLoading: queryLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("user_quick_access")
        .select("items, default_route")
        .eq("user_id", userId!)
        .eq("hospital_id", hospitalId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as QuickAccessRow | null;
    },
    enabled: !!userId && !!hospitalId,
    staleTime: 10 * 60 * 1000,
  });

  const saveMutation = useMutation({
    mutationFn: async (newPicks: QuickAccessPick[]) => {
      if (!userId || !hospitalId) throw new Error("identity not resolved");
      const { error } = await (supabase as any)
        .from("user_quick_access")
        .upsert(
          {
            user_id: userId,
            hospital_id: hospitalId,
            items: newPicks,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      if (!userId || !hospitalId) throw new Error("identity not resolved");
      // Sets items back to NULL ("not customized") rather than deleting the
      // row, so a saved default_route on the same row survives a reset.
      const { error } = await (supabase as any)
        .from("user_quick_access")
        .upsert(
          { user_id: userId, hospital_id: hospitalId, items: null, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const saveDefaultRouteMutation = useMutation({
    mutationFn: async (route: string | null) => {
      if (!userId || !hospitalId) throw new Error("identity not resolved");
      const { error } = await (supabase as any)
        .from("user_quick_access")
        .upsert(
          {
            user_id: userId,
            hospital_id: hospitalId,
            default_route: route,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  // row?.items == null → not customized (no row yet, or items explicitly NULL);
  // an array (including []) → customized.
  const isCustomized = row?.items != null;
  const picks = isCustomized ? (row!.items as QuickAccessPick[]) : DEFAULT_QUICK_ACCESS_PICKS;
  const defaultRoute = row?.default_route ?? null;
  const isLoading = identityLoading || (!!userId && queryLoading);

  return {
    picks,
    isCustomized,
    defaultRoute,
    isLoading,
    save: (newPicks: QuickAccessPick[]) => saveMutation.mutateAsync(newPicks),
    reset: () => resetMutation.mutateAsync(),
    saveDefaultRoute: (route: string | null) => saveDefaultRouteMutation.mutateAsync(route),
  };
}
