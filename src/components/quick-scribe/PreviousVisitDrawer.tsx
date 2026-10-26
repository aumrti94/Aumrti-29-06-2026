/**
 * PreviousVisitDrawer — the door PR 7 builds. Reads a prior Quick Scribe note back, read-only.
 *
 * Built on the AIAuditLogDrawer.tsx Sheet + ScrollArea template — there is no shared read-only
 * side-pane primitive in this codebase yet.
 *
 * ── Why code entry is explicit, not live-as-you-type ───────────────────────────────────────
 *
 * Every call to quick_scribe_lookup_by_code writes a phi_access_audit row, whether or not it
 * finds a match — that is deliberate, so a failed attempt is still on the record. Firing it on
 * every keystroke would turn five characters of typing into five audit rows for one lookup. The
 * search only runs on Enter or the button, matching the DrugMasterSearchInput/PatientSearchPicker
 * convention of not querying until there is something meaningful to query — except here the
 * trigger is "the doctor finished typing", not "typed enough characters", since a code is either
 * complete or not a code at all.
 *
 * ── Why this component has no carry-forward actions yet ────────────────────────────────────
 *
 * This is PR 7's scope: the retrieval door, read-only. The per-drug "Continue" buttons that let a
 * doctor pull a prior medicine into today's note are a separate, later change — carrying forward
 * is a bigger decision (it changes what prints on today's prescription) than opening a drawer to
 * look, and the two should not land in the same review.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, FileText, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { QuickScribeMedicine } from "@/lib/quickScribePrint";
import PreviousVisitSearch from "./PreviousVisitSearch";

/** Shared with PreviousVisitSearch.tsx — the narrow list shape every lookup RPC returns. */
export interface VisitSummaryRow {
  id: string;
  visit_code: string | null;
  patient_name: string | null;
  patient_age: string | null;
  patient_sex: string | null;
  created_at: string;
  doctor_name: string | null;
}

/** Shared with PreviousVisitSearch.tsx. */
export const formatVisitDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

interface StructuredNoteContent {
  summary?: string;
  medicines?: QuickScribeMedicine[];
  labTests?: string[];
  radiologyTests?: string[];
}

/** Shared with QuickScribePage.tsx — "Continue this visit" hands back the whole record, not
 * just the summary shape, so the caller can prompt the doctor with what was actually ordered. */
export interface FullNote extends VisitSummaryRow {
  chief_complaint: string | null;
  advice: string | null;
  diagnosis: string | null;
  reports_reviewed: string | null;
  follow_up_date: string | null;
  structured_note_json: StructuredNoteContent | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * Appends one prior medicine into today's note, unmodified — see the Medicines section below
   * for why this is a per-drug click, never automatic. Omit to render the drawer read-only with
   * no carry-forward action at all (e.g. for a future context with no "today's note" to add to).
   */
  onContinueMedicine?: (medicine: QuickScribeMedicine, sourceVisitDate: string) => void;
  /**
   * Marks today's note as a follow-up of this visit — distinct from onContinueMedicine, which
   * carries one drug. This is the thing that makes the PRINTOUT say "Follow-up of visit dated
   * ..." and is what makes the second-visit workflow actually connect on paper, not just in the
   * doctor's head. Takes the full record (not just the summary shape) so the caller can prompt
   * with which lab/radiology tests were ordered last time — see QuickScribePage's handler.
   * Omit to render the drawer with no such action (read-only lookup only).
   */
  onContinueVisit?: (visit: FullNote) => void;
}

const PreviousVisitDrawer: React.FC<Props> = ({ open, onClose, onContinueMedicine, onContinueVisit }) => {
  const [code, setCode] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [recent, setRecent] = useState<VisitSummaryRow[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [selected, setSelected] = useState<FullNote | null>(null);
  const [loadingNote, setLoadingNote] = useState(false);

  // Reset on every open — a lookup left over from the last patient must not linger into this one.
  useEffect(() => {
    if (!open) return;
    setCode("");
    setSearchError("");
    setSelected(null);
    setLoadingRecent(true);
    (supabase as any).rpc("quick_scribe_recent_notes").then(
      ({ data, error }: { data: VisitSummaryRow[] | null; error: { message: string } | null }) => {
        if (error) console.warn("quick_scribe_recent_notes failed:", error.message);
        setRecent(data || []);
        setLoadingRecent(false);
      },
    );
  }, [open]);

  const openNote = useCallback(async (id: string) => {
    setLoadingNote(true);
    setSelected(null);
    const { data, error } = await (supabase as any)
      .rpc("quick_scribe_get_note", { p_note_id: id })
      .maybeSingle();
    setLoadingNote(false);
    // Supabase returns errors as values — an unhandled failure here would leave the drawer
    // silently stuck with nothing shown and no explanation.
    if (error) {
      setSearchError(error.message);
      return;
    }
    setSelected(data || null);
  }, []);

  const handleSearch = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setSearching(true);
    setSearchError("");
    setSelected(null);
    const { data, error } = await (supabase as any)
      .rpc("quick_scribe_lookup_by_code", { p_code: trimmed })
      .maybeSingle();
    setSearching(false);
    if (error) {
      setSearchError(error.message);
      return;
    }
    if (!data) {
      setSearchError("No visit found for that code.");
      return;
    }
    await openNote(data.id);
  }, [code, openNote]);

  const note = selected?.structured_note_json;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[420px] sm:w-[560px] flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" />
            Previous visit
          </SheetTitle>
        </SheetHeader>

        {selected ? (
          <>
            <div className="flex items-center justify-between mt-3 mb-1 flex-shrink-0">
              <Button variant="ghost" size="sm" className="h-7 -ml-2" onClick={() => setSelected(null)}>
                <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Back
              </Button>
              {selected.visit_code && (
                <span className="text-xs text-muted-foreground">{selected.visit_code}</span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 mb-3 flex-shrink-0">
              <p className="text-sm text-muted-foreground">
                {selected.patient_name || "—"}
                {" · "}
                {[selected.patient_age, selected.patient_sex].filter(Boolean).join(" / ") || "—"}
                {" · "}
                {formatVisitDate(selected.created_at)}
                {selected.doctor_name ? ` · Dr. ${selected.doctor_name}` : ""}
              </p>
              {/* Distinct from per-drug "Continue" below: this one marks TODAY's note as a
                  follow-up of this visit, carries the patient's name/age/sex over, and is what
                  makes the printout say "Follow-up of visit dated ...". A doctor opening this
                  drawer to review a prior visit before diagnosing today's one is the primary
                  reason this screen exists; without this button nothing on the second printout
                  ever referenced the first. */}
              {onContinueVisit && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs flex-shrink-0"
                  onClick={() => onContinueVisit(selected)}
                >
                  Continue this visit
                </Button>
              )}
            </div>

            <ScrollArea className="flex-1 min-h-0 pr-2">
              <div className="space-y-3 text-sm pb-4">
                {selected.chief_complaint && (
                  <div>
                    <h4 className="text-xs uppercase text-muted-foreground font-semibold mb-1">Chief Complaint</h4>
                    <p className="whitespace-pre-line">{selected.chief_complaint}</p>
                  </div>
                )}
                {note?.summary && (
                  <div>
                    <h4 className="text-xs uppercase text-muted-foreground font-semibold mb-1">Summary</h4>
                    <p className="whitespace-pre-line">{note.summary}</p>
                  </div>
                )}
                {selected.diagnosis && (
                  <div>
                    <h4 className="text-xs uppercase text-muted-foreground font-semibold mb-1">Diagnosis</h4>
                    <p>{selected.diagnosis}</p>
                  </div>
                )}
                <div>
                  <h4 className="text-xs uppercase text-muted-foreground font-semibold mb-1">Medicines</h4>
                  {(note?.medicines || []).length === 0 ? (
                    <p className="text-muted-foreground">None</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {(note?.medicines || []).map((m, i) => (
                        <li key={i} className="flex items-center justify-between gap-2">
                          <span>
                            {m.drug_name}
                            {m.dose ? ` ${m.dose}` : ""}
                            {m.frequency ? ` — ${m.frequency}` : ""}
                            {m.duration ? ` × ${m.duration} days` : ""}
                          </span>
                          {/* Explicit, per-drug, never automatic — a prescription the doctor
                              signs today must contain only the lines they chose. Appending to
                              the current note re-fires the safety screen via the existing
                              medicineKey effect, with no extra code needed for that. */}
                          {onContinueMedicine && (
                            <button
                              type="button"
                              className="text-xs text-primary hover:underline flex-shrink-0 whitespace-nowrap"
                              onClick={() => onContinueMedicine(m, selected.created_at)}
                            >
                              Continue (from {formatVisitDate(selected.created_at)})
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {/* Lab and radiology lines are read-only — deliberately no continue action here.
                    Carrying a prior test order forward would silently re-order tests the patient
                    has just had done. */}
                <div>
                  <h4 className="text-xs uppercase text-muted-foreground font-semibold mb-1">Lab Tests</h4>
                  <p>{(note?.labTests || []).join(", ") || "None"}</p>
                </div>
                <div>
                  <h4 className="text-xs uppercase text-muted-foreground font-semibold mb-1">Radiology Tests</h4>
                  <p>{(note?.radiologyTests || []).join(", ") || "None"}</p>
                </div>
                {selected.advice && (
                  <div>
                    <h4 className="text-xs uppercase text-muted-foreground font-semibold mb-1">Advice</h4>
                    <p className="whitespace-pre-line">{selected.advice}</p>
                  </div>
                )}
                {selected.follow_up_date && (
                  <div>
                    <h4 className="text-xs uppercase text-muted-foreground font-semibold mb-1">Follow-up was set for</h4>
                    <p>{formatVisitDate(selected.follow_up_date)}</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mt-3 flex-shrink-0">
              <Input
                className="h-9 text-sm"
                placeholder="Visit code, e.g. QS-7K3M9"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
              <Button size="sm" onClick={handleSearch} disabled={searching || !code.trim()}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            {searchError && <p className="text-sm text-destructive mt-1.5 flex-shrink-0">{searchError}</p>}
            {loadingNote && (
              <p className="text-sm text-muted-foreground mt-3 flex items-center gap-2 flex-shrink-0">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading visit…
              </p>
            )}

            {/* Recent visits and the name-search fallback scroll together below the fixed code
                entry — the code box is the primary path and stays put; everything else is a list
                that can run long. */}
            <ScrollArea className="flex-1 min-h-0 mt-5 pr-2">
              <div className="pb-4">
                <h4 className="text-xs uppercase text-muted-foreground font-semibold mb-2">
                  Your recent visits
                </h4>
                {loadingRecent ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : recent.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recent Quick Scribe visits.</p>
                ) : (
                  <div className="space-y-1.5">
                    {recent.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        className="w-full text-left border border-border rounded-md px-3 py-2 hover:bg-muted/50 transition-colors"
                        onClick={() => openNote(r.id)}
                      >
                        <div className="text-sm font-medium">{r.patient_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {[r.patient_age, r.patient_sex].filter(Boolean).join(" / ") || "—"}
                          {" · "}
                          {formatVisitDate(r.created_at)}
                          {r.visit_code ? ` · ${r.visit_code}` : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* The lost-paper fallback. Deliberately below the code box and the recent list,
                    never the first thing offered — see PreviousVisitSearch.tsx's header. */}
                <div className="mt-5 pt-4 border-t border-border">
                  <PreviousVisitSearch onSelect={openNote} />
                </div>
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default PreviousVisitDrawer;
