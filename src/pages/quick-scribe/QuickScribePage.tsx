import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Printer, Plus, AlertTriangle, ShieldAlert, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useHospitalId } from "@/hooks/useHospitalId";
import { useAIFeatureFlag } from "@/hooks/useAIFeatureFlag";
import { useAIAudit } from "@/hooks/useAIAudit";
import { useToast } from "@/hooks/use-toast";
import { useVoiceScribe } from "@/hooks/useVoiceScribe";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import SectionChip from "@/components/quick-scribe/SectionChip";
import VoiceDictationButton from "@/components/voice/VoiceDictationButton";
import {
  printQuickScribeDoc,
  validateForPrint,
  QuickScribePrintBlocked,
  type QuickScribeMedicine,
  type QuickScribeNoteInput,
} from "@/lib/quickScribePrint";
import { screenQuickScribeMedicines, describeScreening, type QuickScribeSafetyResult } from "@/lib/quickScribeSafety";
import { calcQuantity, normalizeDurationDays } from "@/lib/prescriptionQuantity";

interface QuickScribeNote {
  summary: string;
  medicines: QuickScribeMedicine[];
  labTests: string[];
  radiologyTests: string[];
}

const EMPTY_MED: QuickScribeMedicine = { drug_name: "", dose: "", frequency: "", duration: "", quantity: "" };

const QuickScribePage: React.FC = () => {
  const { hospitalId, userId, fullName } = useHospitalId();
  const enabled = useAIFeatureFlag("quick_scribe");
  const { logAudit } = useAIAudit();
  const { toast } = useToast();
  const { registerScreen, unregisterScreen, resetSession, rawTranscript } = useVoiceScribe();

  const [isSaving, setIsSaving] = useState(false);
  const [note, setNote] = useState<QuickScribeNote | null>(null);
  const [patient, setPatient] = useState({ name: "", age: "", sex: "", address: "" });

  // Registration number is a print prerequisite (MCI reg. 1.4.1), not decoration. It is
  // fetched once on mount so the doctor learns it is missing BEFORE dictating a full
  // consultation, rather than at the moment they press Print.
  const [regNumber, setRegNumber] = useState<string | null>(null);
  const [regLoaded, setRegLoaded] = useState(false);

  const [safety, setSafety] = useState<QuickScribeSafetyResult | null>(null);
  const [screening, setScreening] = useState(false);
  // Distinguishes an AI-filled draft from a blank note opened via "New" — the latter has no
  // AI output to review, so the "AI draft — unreviewed" chip would be misleading on it.
  const [isDraft, setIsDraft] = useState(false);

  // The AI's untouched output, kept so the audit trail can record whether the doctor
  // accepted the draft or overrode it. Previously every note logged "accepted".
  const aiOriginal = useRef<QuickScribeNote | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) { setRegLoaded(true); return; }
      const { data, error } = await (supabase as any)
        .from("staff_profiles")
        .select("registration_number")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      // Supabase returns errors as values — an unhandled failure here previously left the
      // registration number silently blank on a printed prescription.
      if (error) {
        toast({
          title: "Could not read your registration number",
          description: error.message,
          variant: "destructive",
        });
      }
      setRegNumber(data?.registration_number ?? null);
      setRegLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [userId, toast]);

  // Recording/transcription/structuring is entirely owned by VoiceDictationButton and the
  // shared VoiceScribePanel — the exact same ASR chunking, chain failover, and Indian-language
  // handling every other clinical dictation in the app uses. This page only receives the
  // finished note when the doctor reviews it in that panel and clicks Apply.
  useEffect(() => {
    const fillFn = (data: Record<string, unknown>) => {
      const medicines = (Array.isArray(data.medicines) ? (data.medicines as QuickScribeMedicine[]) : [])
        // normalizeDurationDays strips a unit word the model wrote despite being told not to
        // ("15 days" → "15") — the Days field should only ever hold a bare number.
        .map(m => ({ ...m, duration: normalizeDurationDays(m.duration || "") }))
        // The AI rarely states a quantity itself — it's derived here the same way a manual
        // Frequency/Days edit derives it, so a dictated note doesn't arrive with blank Qty
        // every time.
        .map(m => ({ ...m, quantity: m.quantity || calcQuantity(m.frequency || "", m.duration || "") }));
      const next: QuickScribeNote = {
        summary: typeof data.summary === "string" ? data.summary : "",
        medicines,
        labTests: Array.isArray(data.lab_tests) ? (data.lab_tests as string[]) : [],
        radiologyTests: Array.isArray(data.radiology_tests) ? (data.radiology_tests as string[]) : [],
      };
      aiOriginal.current = JSON.parse(JSON.stringify(next));
      setNote(next);
      setIsDraft(true);
    };
    registerScreen("quick_scribe", fillFn);
    return () => unregisterScreen("quick_scribe");
  }, [registerScreen, unregisterScreen]);

  // Drug screening runs on every change to the medicine list, not only at print. A clinical
  // alert surfaces immediately; it is never batched behind a button press.
  const medicineKey = useMemo(
    () => (note?.medicines || []).map(m => (m.drug_name || "").trim().toLowerCase()).filter(Boolean).join("|"),
    [note],
  );

  useEffect(() => {
    if (!hospitalId || !medicineKey) { setSafety(null); return; }
    let cancelled = false;
    setScreening(true);
    (async () => {
      try {
        const result = await screenQuickScribeMedicines(note?.medicines || [], hospitalId);
        if (!cancelled) setSafety(result);
      } catch (e) {
        // Fail loud, never silently clean: an exception here must not read as "no issues".
        if (!cancelled) {
          setSafety({
            hasIssues: true, duplicatePairs: [], interactions: [], worstSeverity: "none",
            checkUnavailable: true,
            unavailableReasons: [e instanceof Error ? e.message : String(e)],
            allergyCheckSkipped: true,
          });
        }
      } finally {
        if (!cancelled) setScreening(false);
      }
    })();
    return () => { cancelled = true; };
    // `note` is intentionally not a dependency — only the drug names drive a re-screen,
    // so editing a dose does not fire a fresh round of formulary lookups.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medicineKey, hospitalId]);

  const printInput: QuickScribeNoteInput | null = useMemo(() => {
    if (!note) return null;
    return {
      doctorName: fullName || "Doctor",
      doctorRegistrationNumber: regNumber || "",
      patientName: patient.name,
      patientAge: patient.age,
      patientSex: patient.sex,
      patientAddress: patient.address,
      createdAt: new Date().toISOString(),
      summary: note.summary,
      medicines: note.medicines,
      labTests: note.labTests,
      radiologyTests: note.radiologyTests,
      screeningNote: describeScreening(safety),
    };
  }, [note, fullName, regNumber, patient, safety]);

  const missing = useMemo(() => (printInput ? validateForPrint(printInput) : []), [printInput]);
  const canPrint = !!note && regLoaded && missing.length === 0 && !isSaving;

  const updateMedicine = useCallback((idx: number, patch: Partial<QuickScribeMedicine>) => {
    setNote(prev => {
      if (!prev) return prev;
      const medicines = prev.medicines.map((m, i) => {
        if (i !== idx) return m;
        const next = { ...m, ...patch };
        // Qty is derived from Frequency x Days whenever either changes, so the doctor never
        // has to do the arithmetic — but editing Qty directly still works and sticks until
        // the next Frequency/Days edit recalculates it.
        if ("frequency" in patch || "duration" in patch) {
          const computed = calcQuantity(next.frequency || "", next.duration || "");
          if (computed) next.quantity = computed;
        }
        return next;
      });
      return { ...prev, medicines };
    });
  }, []);

  const handlePrint = useCallback(async () => {
    if (!note || !hospitalId || !printInput) return;
    setIsSaving(true);
    try {
      const edited = JSON.stringify(aiOriginal.current) !== JSON.stringify(note);

      const { error: insertError } = await (supabase as any).from("quick_scribe_notes").insert({
        hospital_id: hospitalId,
        doctor_id: userId,
        patient_label: patient.name || null,
        patient_name: patient.name || null,
        patient_age: patient.age || null,
        patient_sex: patient.sex || null,
        patient_address: patient.address || null,
        // The transcript is the medico-legal record of what was actually said. The first
        // iteration wrote an empty string into this NOT NULL column, discarding it.
        transcript_text: rawTranscript || "",
        structured_note_json: note,
        screening_json: safety ?? {},
        printed_at: printInput.createdAt,
      });
      if (insertError) {
        toast({ title: "Could not save the note", description: insertError.message, variant: "destructive" });
      }

      // ai_output carries what the MODEL produced and override_value what the doctor
      // actually printed. Logging the edited note as `aiOutput` (the previous behaviour,
      // always with action "accepted") made a doctor-corrected note indistinguishable from
      // one the model got right — which is exactly the signal a prompt-quality review needs.
      await logAudit(
        {
          hospitalId,
          featureKey: "quick_scribe",
          aiOutput: (aiOriginal.current ?? note) as unknown as Record<string, unknown>,
        },
        edited ? "overridden" : "accepted",
        edited ? (note as unknown as Record<string, unknown>) : undefined,
      );

      await printQuickScribeDoc(hospitalId, printInput);
    } catch (e) {
      if (e instanceof QuickScribePrintBlocked) {
        toast({ title: "Cannot print", description: e.message, variant: "destructive" });
      } else {
        toast({
          title: "Print failed",
          description: e instanceof Error ? e.message : String(e),
          variant: "destructive",
        });
      }
    } finally {
      setIsSaving(false);
    }
  }, [note, hospitalId, userId, patient, printInput, safety, rawTranscript, logAudit, toast]);

  const handleNew = useCallback(() => {
    setNote({ summary: "", medicines: [], labTests: [], radiologyTests: [] });
    setIsDraft(false);
    setPatient({ name: "", age: "", sex: "", address: "" });
    setSafety(null);
    aiOriginal.current = null;
    // Without this the previous patient's dictation stays in the panel and the next
    // recording merges into it as `existing_data` — one patient's history appearing on
    // another patient's printout.
    resetSession();
  }, [resetSession]);

  if (!enabled) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ height: "calc(100vh - 56px)" }}>
        <AlertTriangle className="h-8 w-8 text-amber-500 mb-3" />
        <p className="text-sm font-medium text-foreground">Quick Scribe is turned off for this hospital</p>
        <p className="text-sm text-muted-foreground mt-1">Ask your hospital admin to enable it in Settings → AI Features.</p>
      </div>
    );
  }

  // Patient identity and the doctor's registration number are only a legal requirement
  // (Drugs & Cosmetics Rules 1945 Rule 65(10); MCI reg. 1.4.1) once the note actually lists
  // a medicine — a summary/labs-only note is not a dispensable prescription. See
  // quickScribePrint.ts for the print-time gate this mirrors.
  const hasMedicines = !!medicineKey;
  const regMissing = regLoaded && !regNumber && hasMedicines;

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: "calc(100vh - 56px)" }}>
      {/* Top bar */}
      <div className="h-[52px] flex-shrink-0 bg-card border-b border-border flex items-center gap-3 px-5">
        <span className="text-base font-bold text-foreground">🎙️ Quick Scribe</span>
        <SectionChip label="Standalone — not linked to any patient record" tone="neutral" />
        <div className="ml-auto flex items-center gap-3">
          {isDraft && <SectionChip label="AI draft — unreviewed" tone="draft" />}
          <VoiceDictationButton sessionType="quick_scribe" size="sm" />
        </div>
      </div>

      {/* Patient identity. Not a patient record — no MRN, no chart, nothing written to
          public.patients. These are the fields Rule 65(10) requires on the paper. */}
      <div className="flex-shrink-0 border-b border-border bg-muted/30 px-5 py-2 flex items-end gap-3">
        <div className="flex-1 min-w-0">
          <label className="text-sm text-muted-foreground block mb-1">Patient name {hasMedicines && <span className="text-destructive">*</span>}</label>
          <Input className="h-8" value={patient.name} onChange={e => setPatient(p => ({ ...p, name: e.target.value }))} />
        </div>
        <div className="w-24">
          <label className="text-sm text-muted-foreground block mb-1">Age {hasMedicines && <span className="text-destructive">*</span>}</label>
          <Input className="h-8" value={patient.age} onChange={e => setPatient(p => ({ ...p, age: e.target.value }))} />
        </div>
        <div className="w-28">
          <label className="text-sm text-muted-foreground block mb-1">Sex {hasMedicines && <span className="text-destructive">*</span>}</label>
          <select
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={patient.sex}
            onChange={e => setPatient(p => ({ ...p, sex: e.target.value }))}
          >
            <option value="">—</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div className="flex-1 min-w-0">
          <label className="text-sm text-muted-foreground block mb-1">Address</label>
          <Input className="h-8" value={patient.address} onChange={e => setPatient(p => ({ ...p, address: e.target.value }))} />
        </div>
      </div>

      {/* Blocking conditions and clinical alerts, surfaced immediately rather than at print. */}
      {regMissing && (
        <div className="flex-shrink-0 bg-destructive/10 border-b border-destructive/30 px-5 py-2 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-destructive flex-shrink-0" />
          <span className="text-sm text-destructive font-medium">
            Your medical registration number is not on file. It is required on any prescription — add it in HR → Staff Directory before printing.
          </span>
        </div>
      )}

      {safety?.hasIssues && (
        <div className="flex-shrink-0 bg-amber-500/10 border-b border-amber-500/40 px-5 py-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900 dark:text-amber-200 space-y-0.5">
              {safety.duplicatePairs.map((p, i) => (
                <div key={`d${i}`}><strong>Duplicate molecule:</strong> “{p.a}” and “{p.b}” appear to be the same drug.</div>
              ))}
              {safety.interactions.map((x, i) => (
                <div key={`i${i}`}>
                  <strong>{x.severity} interaction:</strong> {x.drug_a} + {x.drug_b}
                  {x.recommendation ? ` — ${x.recommendation}` : ""}
                </div>
              ))}
              {safety.checkUnavailable && (
                <div><strong>Screening incomplete:</strong> {safety.unavailableReasons.join("; ")}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden p-4">
        {!note ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Press Record to start. Review the draft in the panel, then click “Apply to Quick Scribe”.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 h-full min-h-0">
            <div className="border border-border rounded-lg p-3 flex flex-col min-h-0">
              <h4 className="text-sm uppercase text-muted-foreground font-semibold mb-2">Summary</h4>
              <Textarea
                className="flex-1 min-h-0 resize-none text-sm"
                value={note.summary}
                onChange={e => setNote({ ...note, summary: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-3 min-h-0 overflow-y-auto pr-1">
              <div className="border border-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm uppercase text-muted-foreground font-semibold">Medicines</h4>
                  {screening && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </div>
                {/* Structured rows, not a joined textarea. The previous version rendered the
                    list as "name — dose — frequency" text and parsed edits back by splitting
                    on newlines, which discarded dose, frequency and duration on every edit. */}
                {note.medicines.length === 0 && (
                  <p className="text-sm text-muted-foreground mb-2">No medicines mentioned</p>
                )}
                <div className="space-y-1.5">
                  {note.medicines.map((m, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-1.5">
                      <Input className="col-span-4 h-8 text-sm" placeholder="Drug" value={m.drug_name || ""}
                        onChange={e => updateMedicine(idx, { drug_name: e.target.value })} />
                      <Input className="col-span-2 h-8 text-sm" placeholder="Dose" value={m.dose || ""}
                        onChange={e => updateMedicine(idx, { dose: e.target.value })} />
                      <Input className="col-span-2 h-8 text-sm" placeholder="M-A-E e.g. 1-0-1" title="Morning-Afternoon-Evening, e.g. 1-0-1 or 1/2-0-0" value={m.frequency || ""}
                        onChange={e => updateMedicine(idx, { frequency: e.target.value })} />
                      <Input className="col-span-2 h-8 text-sm" placeholder="Days" value={m.duration || ""}
                        onChange={e => updateMedicine(idx, { duration: e.target.value })} />
                      <Input className="col-span-2 h-8 text-sm" placeholder="Qty *" title="Auto-calculated from frequency x days; edit to override" value={m.quantity || ""}
                        onChange={e => updateMedicine(idx, { quantity: e.target.value })} />
                    </div>
                  ))}
                </div>
                <Button variant="ghost" size="sm" className="mt-2 h-7 text-sm"
                  onClick={() => setNote({ ...note, medicines: [...note.medicines, { ...EMPTY_MED }] })}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add medicine
                </Button>
              </div>

              <div className="border border-border rounded-lg p-3">
                <h4 className="text-sm uppercase text-muted-foreground font-semibold mb-2">Lab Tests</h4>
                <Textarea
                  className="resize-none text-sm" rows={2}
                  value={note.labTests.join("\n")}
                  onChange={e => setNote({ ...note, labTests: e.target.value.split("\n").filter(Boolean) })}
                  placeholder="No lab tests mentioned"
                />
              </div>
              <div className="border border-border rounded-lg p-3">
                <h4 className="text-sm uppercase text-muted-foreground font-semibold mb-2">Radiology Tests</h4>
                <Textarea
                  className="resize-none text-sm" rows={2}
                  value={note.radiologyTests.join("\n")}
                  onChange={e => setNote({ ...note, radiologyTests: e.target.value.split("\n").filter(Boolean) })}
                  placeholder="No radiology tests mentioned"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="h-[56px] flex-shrink-0 border-t border-border bg-card flex items-center justify-end gap-3 px-5">
        {note && missing.length > 0 && (
          <span className="text-sm text-muted-foreground mr-auto">
            Required before printing: {missing.join(", ")}
          </span>
        )}
        <Button variant="outline" onClick={handleNew}>
          <Plus className="h-4 w-4 mr-1.5" /> New
        </Button>
        <Button onClick={handlePrint} disabled={!canPrint}>
          <Printer className="h-4 w-4 mr-1.5" />
          Print
        </Button>
      </div>
    </div>
  );
};

export default QuickScribePage;
