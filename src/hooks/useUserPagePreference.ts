import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useHospitalId } from "@/hooks/useHospitalId";

interface UseUserPagePreferenceResult<T extends Record<string, unknown>> {
  /** null while loading, or once loaded, when the user has no saved preference for this page. */
  preference: T | null;
  isLoading: boolean;
  /** Merges into the stored preference — pass only the keys you want to change. */
  save: (patch: Partial<T>) => Promise<void>;
  /** Clears the whole stored preference for this page (not other pages). */
  clear: () => Promise<void>;
}

// Generic per-user, per-page preference store (public.user_page_preferences).
// One row per (user, page_key); `preferences` is a small jsonb blob whose
// shape is entirely owned by the calling page — this hook doesn't interpret
// it. Use for "set as my default" style controls that don't fit the
// navigation-scoped useQuickAccessPicks (sidebar shortcuts, landing page).
export function useUserPagePreference<T extends Record<string, unknown>>(
  pageKey: string
): UseUserPagePreferenceResult<T> {
  const { userId, hospitalId, loading: identityLoading } = useHospitalId();
  const queryClient = useQueryClient();

  const queryKey = ["user-page-preference", userId, pageKey] as const;

  const { data: row, isLoading: queryLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_page_preferences")
        .select("preferences")
        .eq("user_id", userId!)
        .eq("hospital_id", hospitalId!)
        .eq("page_key", pageKey)
        .maybeSingle();
      if (error) throw error;
      return (data?.preferences ?? null) as T | null;
    },
    enabled: !!userId && !!hospitalId,
    staleTime: 10 * 60 * 1000,
  });

  const saveMutation = useMutation({
    mutationFn: async (patch: Partial<T>) => {
      if (!userId || !hospitalId) throw new Error("identity not resolved");
      const merged = { ...(row ?? {}), ...patch };
      const { error } = await supabase
        .from("user_page_preferences")
        .upsert(
          {
            user_id: userId,
            hospital_id: hospitalId,
            page_key: pageKey,
            preferences: merged,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,page_key" }
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("identity not resolved");
      const { error } = await supabase
        .from("user_page_preferences")
        .delete()
        .eq("user_id", userId)
        .eq("page_key", pageKey);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    preference: row ?? null,
    isLoading: identityLoading || (!!userId && queryLoading),
    save: (patch: Partial<T>) => saveMutation.mutateAsync(patch),
    clear: () => clearMutation.mutateAsync(),
  };
}
