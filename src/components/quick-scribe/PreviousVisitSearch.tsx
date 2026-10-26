/**
 * PreviousVisitSearch — the "patient lost the paper" fallback inside PreviousVisitDrawer.
 *
 * Mechanics borrowed from DrugMasterSearchInput.tsx: the shared useDebounce hook and a
 * `cancelled` flag against out-of-order responses, rather than PatientSearchPicker.tsx's
 * hand-rolled debounce timer. Deliberately NOT copying PatientSearchPicker's interpolation of raw
 * user input into a PostgREST `.or()` filter string — moot here regardless, since the query goes
 * through quick_scribe_search_by_name as an RPC argument, never a filter string the client builds.
 *
 * Every guard this component enforces client-side — the 3-character minimum, no live search below
 * that — is enforced AGAIN server-side by the RPC itself (20261111000010). The RPC is the actual
 * boundary; this is just what keeps the common case from round-tripping for nothing.
 *
 * Name search is the fallback, not the primary path, for a specific reason: retrieving the wrong
 * "Lakshmi" and carrying her medicines onto someone else's prescription is a real way to hurt a
 * patient, with no chart or allergy list standing in the way once a note is open. Results here
 * carry the same narrow summary shape as the visit-code lookup and the recent-notes list — name,
 * age, sex, visit date, authoring doctor — specifically so a doctor can recognise the right person
 * before opening anything, never more than that.
 */
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/useDebounce";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import { type VisitSummaryRow, formatVisitDate } from "./PreviousVisitDrawer";

interface Props {
  onSelect: (id: string) => void;
}

const MIN_CHARS = 3;

const PreviousVisitSearch: React.FC<Props> = ({ onSelect }) => {
  const [term, setTerm] = useState("");
  const [allDoctors, setAllDoctors] = useState(false);
  const [results, setResults] = useState<VisitSummaryRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const debounced = useDebounce(term, 300);

  useEffect(() => {
    const trimmed = debounced.trim();
    setError("");

    // Below the minimum, show nothing and call nothing — this is what keeps a two-character
    // partial from round-tripping to the RPC only to be refused there anyway.
    if (trimmed.length < MIN_CHARS) {
      setResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    (async () => {
      const { data, error: rpcError } = await (supabase as any).rpc("quick_scribe_search_by_name", {
        p_prefix: trimmed,
        p_all_doctors: allDoctors,
      });
      if (cancelled) return;
      setSearching(false);
      if (rpcError) {
        setError(rpcError.message);
        setResults([]);
        return;
      }
      setResults((data as VisitSummaryRow[]) || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced, allDoctors]);

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <Input
          className="h-8 text-sm"
          placeholder="Or search by patient name (min 3 letters)"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        {searching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground flex-shrink-0" />}
      </div>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1.5 cursor-pointer select-none">
        <input
          type="checkbox"
          className="h-3 w-3"
          checked={allDoctors}
          onChange={(e) => setAllDoctors(e.target.checked)}
        />
        Search all doctors at this hospital
      </label>

      {error && <p className="text-xs text-destructive mt-1">{error}</p>}

      {results.length > 0 && (
        <div className="space-y-1.5 mt-2">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              className="w-full text-left border border-border rounded-md px-3 py-2 hover:bg-muted/50 transition-colors"
              onClick={() => onSelect(r.id)}
            >
              <div className="text-sm font-medium">{r.patient_name || "—"}</div>
              <div className="text-xs text-muted-foreground">
                {[r.patient_age, r.patient_sex].filter(Boolean).join(" / ") || "—"}
                {" · "}
                {formatVisitDate(r.created_at)}
                {r.doctor_name ? ` · Dr. ${r.doctor_name}` : ""}
              </div>
            </button>
          ))}
        </div>
      )}

      {!searching && !error && debounced.trim().length >= MIN_CHARS && results.length === 0 && (
        <p className="text-xs text-muted-foreground mt-2">No matching visits.</p>
      )}
    </div>
  );
};

export default PreviousVisitSearch;
