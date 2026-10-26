import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Printer, Plus, AlertTriangle, Loader2, ShieldCheck, History, X } from "lucide-react";
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
import QuickScribeConsentModal, { type QuickScribeConsent } from "@/components/quick-scribe/QuickScribeConsentModal";
import PreviousVisitDrawer, { type FullNote } from "@/components/quick-scribe/PreviousVisitDrawer";
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
import { parseFollowUpInterval } from "@/lib/followUpInterval";

interface QuickScribeNote {
  /** AI-filled or typed. */
  chiefComplaint: string;
  summary: string;
  /** Typed only, follow-up visits only — see 20261111000006. Never sent to or read from the AI. */
  reportsReviewed: string;
  /** Typed only. No AI path ever populates this — see fillFn below and 20261111000006's header. */
  diagnosis: string;
  medicines: QuickScribeMedicine[];
  labTests: string[];
  radiologyTests: string[];
  /** AI-filled or typed. */
  advice: string;
  /** App-computed ISO yyyy-mm-dd, or typed directly. Empty string, never undefined. */
  followUpDate: string;
}

const EMPTY_NOTE: QuickScribeNote = {
  chiefComplaint: "", summary: "", reportsReviewed: "", diagnosis: "",
  medicines: [], labTests: [], radiologyTests: [], advice: "", followUpDate: "",
};

const EMPTY_MED: QuickScribeMedicine = { drug_name: "", dose: "", frequency: "", duration: "", quantity: "", instructions: "" };

/**
 * The five fields added on top of the original four. Kept out of the always-visible Row A/B slots
 * on the wide (xl) layout for Reports Reviewed only — see OPTIONAL_FIELD_META and revealedFields
 * below. On the narrower tablet layout all five are progressive-disclosure: shown only once
 * populated, or once the doctor taps the chip that adds an empty one.
 */
type OptionalFieldKey = "chiefComplaint" | "diagnosis" | "followUpDate" | "advice" | "reportsReviewed";

const OPTIONAL_FIELD_META: Record<OptionalFieldKey, { label: string }> = {
  chiefComplaint: { label: "Chief Complaint" },
  diagnosis: { label: "Diagnosis" },
  followUpDate: { label: "Follow-up date" },
  advice: { label: "Advice" },
  reportsReviewed: { label: "Reports Reviewed" },
};
const OPTIONAL_FIELD_KEYS = Object.keys(OPTIONAL_FIELD_META) as OptionalFieldKey[];

/**
 * A 32px label+input row — h-8 matches the arithmetic the layout is budgeted against (see the
 * body JSX below). Used for Chief Complaint / Diagnosis / Follow-up date on the wide (xl) layout,
 * and for any revealed optional field on the narrower layout.
 */
const CompactField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "date";
  placeholder?: string;
}> = ({ label, value, onChange, type = "text", placeholder }) => (
  <div className="flex items-center gap-2 h-8 flex-shrink-0">
    <label className="text-sm text-muted-foreground flex-shrink-0 w-[108px] truncate" title={label}>
      {label}
    </label>
    <Input
      type={type}
      className="h-8 text-sm flex-1 min-w-0"
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
    />
  </div>
);

/**
 * Full-width, bottom-anchored on the wide layout — this is literally the founder's "fixed
 * alignment, medicines at the bottom" request. Shared between both breakpoints so the medicine
 * grid, the quantity auto-calc and the Add button exist in exactly one place; only the visible
 * row count (maxRowsHeightClass) differs, per the two layouts' separate space budgets.
 *
 * The rows container is the one scroll region this screen allows. The page itself never scrolls.
 */
const MedicinesPanel: React.FC<{
  medicines: QuickScribeMedicine[];
  screening: boolean;
  maxRowsHeightClass: string;
  onUpdate: (idx: number, patch: Partial<QuickScribeMedicine>) => void;
  onAdd: () => void;
}> = ({ medicines, screening, maxRowsHeightClass, onUpdate, onAdd }) => (
  <div className="border border-border rounded-lg p-3 flex flex-col min-h-0">
    <div className="flex items-center justify-between mb-2">
      <h4 className="text-sm uppercase text-muted-foreground font-semibold">Medicines</h4>
      {screening && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
    </div>
    {/* Structured rows, not a joined textarea. The previous version rendered the list as
        "name — dose — frequency" text and parsed edits back by splitting on newlines, which
        discarded dose, frequency and duration on every edit. */}
    {medicines.length === 0 && (
      <p className="text-sm text-muted-foreground mb-2">No medicines mentioned</p>
    )}
    <div className={`space-y-1.5 overflow-y-auto ${maxRowsHeightClass}`}>
      {medicines.map((m, idx) => (
        <div key={idx} className="grid grid-cols-12 gap-1.5">
          <Input className="col-span-3 h-8 text-sm" placeholder="Drug" value={m.drug_name || ""}
            onChange={e => onUpdate(idx, { drug_name: e.target.value })} />
          <Input className="col-span-2 h-8 text-sm" placeholder="Dose" value={m.dose || ""}
            onChange={e => onUpdate(idx, { dose: e.target.value })} />
          <Input className="col-span-2 h-8 text-sm" placeholder="M-A-E e.g. 1-0-1" title="Morning-Afternoon-Evening, e.g. 1-0-1 or 1/2-0-0" value={m.frequency || ""}
            onChange={e => onUpdate(idx, { frequency: e.target.value })} />
          <Input className="col-span-1 h-8 text-sm" placeholder="Days" value={m.duration || ""}
            onChange={e => onUpdate(idx, { duration: e.target.value })} />
          <Input className="col-span-2 h-8 text-sm" placeholder="Qty *" title="Auto-calculated from frequency x days; edit to override" value={m.quantity || ""}
            onChange={e => onUpdate(idx, { quantity: e.target.value })} />
          <Input className="col-span-2 h-8 text-sm" placeholder="Instructions" value={m.instructions || ""}
            onChange={e => onUpdate(idx, { instructions: e.target.value })} />
        </div>
      ))}
    </div>
    <Button variant="ghost" size="sm" className="mt-2 h-7 text-sm flex-shrink-0" onClick={onAdd}>
      <Plus className="h-3.5 w-3.5 mr-1" /> Add medicine
    </Button>
  </div>
);

const QuickScribePage: React.FC = () => {
  const { hospitalId, userId, fullName } = useHospitalId();
  const enabled = useAIFeatureFlag("quick_scribe");
  const { logAudit } = useAIAudit();
  const { toast } = useToast();
  const { registerScreen, unregisterScreen, resetSession, rawTranscript } = useVoiceScribe();

  const [isSaving, setIsSaving] = useState(false);
  const [note, setNote] = useState<QuickScribeNote | null>(null);
  const [patient, setPatient] = useState({ name: "", age: "", sex: "", address: "" });

  // Fetched once on mount so it can be embedded on the printed prescription when on file.
  // Not a print prerequisite — printing proceeds without it if it's missing.
  const [regNumber, setRegNumber] = useState<string | null>(null);

  const [safety, setSafety] = useState<QuickScribeSafetyResult | null>(null);
  const [screening, setScreening] = useState(false);
  // Distinguishes an AI-filled draft from a blank note opened via "New" — the latter has no
  // AI output to review, so the "AI draft — unreviewed" chip would be misleading on it.
  const [isDraft, setIsDraft] = useState(false);

  // The AI's untouched output, kept so the audit trail can record whether the doctor
  // accepted the draft or overrode it. Previously every note logged "accepted".
  const aiOriginal = useRef<QuickScribeNote | null>(null);

  // DPDP s.6 consent for recording. Held per patient and cleared by "New", because consent is
  // given by one patient for one consultation — carrying it to the next person in the queue
  // would be the same category of error as carrying their dictation across.
  const [consent, setConsent] = useState<QuickScribeConsent | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);

  // The retrieval door — see PreviousVisitDrawer.tsx.
  const [previousVisitOpen, setPreviousVisitOpen] = useState(false);

  // Set when today's note is a follow-up of an earlier one — this is what the printed "Follow-up
  // of visit dated ..." line reads from. Deliberately separate from `note` (same reasoning as
  // `consent`): it is metadata about the relationship between two visits, not clinical content
  // of this one, and it has to survive `setNote` calls that replace the whole note object.
  //
  // orderedTests is the prior visit's lab/radiology test NAMES — never results, never auto-typed
  // into the note. It only drives the Reports Reviewed box's placeholder, so the doctor sees
  // exactly what to review and types their own findings. See handleContinueVisit below.
  const [previousVisit, setPreviousVisit] = useState<
    { visitCode: string; createdAt: string; orderedTests: string[] } | null
  >(null);

  // A hint, never a value — reportsReviewed itself is only ever set by the doctor typing.
  const reportsReviewedPlaceholder = previousVisit?.orderedTests.length
    ? `Ordered last visit: ${previousVisit.orderedTests.join(", ")} — note findings`
    : "On a return visit — what was checked";

  // Which of the five optional fields currently have an input showing, on the narrower (tablet)
  // layout where screen space does not allow all nine fields to render unconditionally — see the
  // layout note above the body JSX. A field is revealed automatically once it holds content (so a
  // dictation that fills Advice makes it visible without the doctor hunting for a chip), and
  // manually via the chip row otherwise. The wide (xl) layout ignores this for four of the five
  // fields, which have fixed slots regardless of content; only Reports Reviewed is gated by it on
  // both layouts, since an empty "Reports Reviewed" box on a first visit is noise.
  const [revealedFields, setRevealedFields] = useState<Set<OptionalFieldKey>>(new Set());

  useEffect(() => {
    if (!note) return;
    setRevealedFields(prev => {
      let changed = false;
      const next = new Set(prev);
      for (const key of OPTIONAL_FIELD_KEYS) {
        if (note[key] && note[key].trim() && !next.has(key)) {
          next.add(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [note]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) return;
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
    })();
    return () => { cancelled = true; };
  }, [userId, toast]);

  // Opportunistic retention sweep — one of the three triggers in 20261111000003. pg_cron has
  // historically not run on this project, so an active clinic keeps itself clean by sweeping when
  // a doctor opens the screen. Tenant-scoped and capped at 500 rows server-side, and the common
  // case (nothing expired) is a single index scan.
  //
  // Deliberately fire-and-forget: a failed sweep must never block or warn a doctor mid-clinic. The
  // Edge Function and the cron job are the paths that are allowed to report failure.
  useEffect(() => {
    if (!hospitalId) return;
    void (supabase as any).rpc("sweep_quick_scribe_retention").then(({ error }: { error: unknown }) => {
      if (error) console.warn("Quick Scribe retention sweep skipped:", error);
    });
  }, [hospitalId]);

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
        chiefComplaint: typeof data.chief_complaint === "string" ? data.chief_complaint : "",
        summary: typeof data.summary === "string" ? data.summary : "",
        // Typed only, never read from the AI's output — see the QuickScribeNote field comment.
        reportsReviewed: "",
        // Typed only. The AI schema has no diagnosis key for quick_scribe and never will; this
        // line intentionally does not read data.diagnosis.
        diagnosis: "",
        medicines,
        labTests: Array.isArray(data.lab_tests) ? (data.lab_tests as string[]) : [],
        radiologyTests: Array.isArray(data.radiology_tests) ? (data.radiology_tests as string[]) : [],
        advice: typeof data.advice === "string" ? data.advice : "",
        // The AI returns a spoken interval ("2 weeks"), never a date — see the schema comment in
        // CONTEXT_PROMPTS.quick_scribe for why. parseFollowUpInterval resolves it against the
        // browser's real clock and returns "" for anything unparsable, same contract as
        // calcQuantity: a blank box the doctor notices, never a silently wrong date.
        followUpDate: typeof data.follow_up_interval === "string"
          ? parseFollowUpInterval(data.follow_up_interval)
          : "",
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
      chiefComplaint: note.chiefComplaint,
      summary: note.summary,
      reportsReviewed: note.reportsReviewed,
      diagnosis: note.diagnosis,
      medicines: note.medicines,
      labTests: note.labTests,
      radiologyTests: note.radiologyTests,
      advice: note.advice,
      followUpDate: note.followUpDate,
      screeningNote: describeScreening(safety),
    };
  }, [note, fullName, regNumber, patient, safety]);

  const missing = useMemo(() => (printInput ? validateForPrint(printInput) : []), [printInput]);
  const canPrint = !!note && missing.length === 0 && !isSaving;

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

  const setField = useCallback((key: OptionalFieldKey, value: string) => {
    setNote(prev => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  // Carry-forward from PreviousVisitDrawer. Appends one drug, unmodified, to today's note — never
  // auto-populated, only ever in response to the doctor's own click on that specific drug. If no
  // note has been started yet (the doctor opened "Find visit" before recording or typing
  // anything), this starts a blank one so the medicine has somewhere to land; it does NOT copy
  // over the prior visit's patient name or any other field, since the only thing the doctor
  // explicitly chose here is this one medicine.
  //
  // Appending to note.medicines changes the medicineKey memo above, so the existing drug-safety
  // effect re-screens automatically — no new safety code needed for this path.
  const handleContinueMedicine = useCallback((medicine: QuickScribeMedicine) => {
    setNote(prev => {
      const base = prev ?? { ...EMPTY_NOTE };
      return { ...base, medicines: [...base.medicines, { ...medicine }] };
    });
    toast({
      title: "Medicine added",
      description: `${medicine.drug_name} added to today's note — review before printing.`,
    });
  }, [toast]);

  // Marks today's note as a follow-up of the selected visit. Pre-fills patient identity (name,
  // age, sex — not address, which quick_scribe_get_note deliberately never returns) because the
  // doctor has already identified this specific prior visit by code or from their own list, so
  // carrying the demographics over is the same confirmed choice, not a guess. Never pre-fills
  // clinical content (summary, diagnosis, medicines) — that stays per-drug opt-in via
  // handleContinueMedicine above, same reasoning as that handler's own comment.
  //
  // What it DOES do beyond the delta line: reveals Reports Reviewed and seeds its placeholder
  // (never its value) with the lab/radiology test NAMES ordered at the prior visit — "the doctor
  // knows what was ordered last time and needs to record what the reports showed" is the whole
  // reason that field exists, and leaving the doctor to remember the test names from an open
  // drawer panel rather than seeing them on the box they're about to type into was the gap.
  const handleContinueVisit = useCallback((visit: FullNote) => {
    if (!visit.visit_code) {
      // A note printed before 20261111000005 applied, or one whose insert failed, has no code.
      // There is nothing to print a "Follow-up of visit ..." line against, so there is nothing
      // useful this action can do.
      toast({
        title: "Can't link to this visit",
        description: "This older note has no visit code on file.",
        variant: "destructive",
      });
      return;
    }
    const orderedTests = [
      ...(visit.structured_note_json?.labTests || []),
      ...(visit.structured_note_json?.radiologyTests || []),
    ];
    setPreviousVisit({ visitCode: visit.visit_code, createdAt: visit.created_at, orderedTests });
    setPatient(p => ({
      ...p,
      name: visit.patient_name || p.name,
      age: visit.patient_age || p.age,
      sex: visit.patient_sex || p.sex,
    }));
    // Reports Reviewed is gated behind revealedFields on BOTH layouts (see the body JSX) — an
    // empty box on a first visit is noise, but this is deliberately no longer a first visit.
    setRevealedFields(prev => new Set(prev).add("reportsReviewed"));
    setPreviousVisitOpen(false);
    toast({
      title: "Linked to previous visit",
      description: `Today's note will print as a follow-up of ${visit.visit_code}.`,
    });
  }, [toast]);

  const handlePrint = useCallback(async () => {
    if (!note || !hospitalId || !printInput) return;
    setIsSaving(true);
    try {
      const edited = JSON.stringify(aiOriginal.current) !== JSON.stringify(note);

      const { data: saved, error: insertError } = await (supabase as any).from("quick_scribe_notes").insert({
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
        // Null only for a note typed without ever recording — consent gates the microphone, not
        // the keyboard, and a hand-typed note involves no third-party processing to consent to.
        consent_id: consent?.id ?? null,
        // Real columns, not JSON keys — see 20261111000006. diagnosis in particular is written
        // here from typed state only; nothing upstream of this line can populate it from the AI.
        chief_complaint: note.chiefComplaint || null,
        advice: note.advice || null,
        diagnosis: note.diagnosis || null,
        reports_reviewed: note.reportsReviewed || null,
        follow_up_date: note.followUpDate || null,
      })
        // The visit code is allocated by a BEFORE INSERT trigger, so it can only be read back —
        // it is what the patient brings in on the paper at their next visit.
        .select("visit_code")
        .maybeSingle();
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

      // Printed from the value the database actually allocated, never from a client guess. If the
      // insert failed, the code is absent and the page prints without one rather than printing a
      // code that resolves to nothing when the patient brings it back.
      await printQuickScribeDoc(hospitalId, {
        ...printInput,
        visitCode: saved?.visit_code ?? null,
        previousVisitCode: previousVisit?.visitCode ?? null,
        previousVisitDate: previousVisit?.createdAt ?? null,
      });
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
  }, [note, hospitalId, userId, patient, printInput, safety, rawTranscript, consent, previousVisit, logAudit, toast]);

  const handleNew = useCallback(() => {
    setNote({ ...EMPTY_NOTE });
    setIsDraft(false);
    setPatient({ name: "", age: "", sex: "", address: "" });
    setSafety(null);
    aiOriginal.current = null;
    setRevealedFields(new Set());
    // Consent belongs to the patient who gave it. Clearing it here is the same safeguard as
    // resetSession() below — without it, the next patient in the queue is recorded under the
    // previous patient's agreement.
    setConsent(null);
    // The follow-up link belongs to the specific patient it was set for. Without this, "New"
    // after a follow-up consultation would print the NEXT patient's note as a follow-up of
    // someone else's visit.
    setPreviousVisit(null);
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

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: "calc(100vh - 56px)" }}>
      {/* Top bar */}
      <div className="h-[52px] flex-shrink-0 bg-card border-b border-border flex items-center gap-3 px-5">
        <span className="text-base font-bold text-foreground">🎙️ Quick Scribe</span>
        <SectionChip label="Standalone — not linked to any patient record" tone="neutral" />
        <Button variant="outline" size="sm" onClick={() => setPreviousVisitOpen(true)}>
          <History className="h-4 w-4 mr-1.5" />
          Find visit
        </Button>
        {/* Visible for the same reason the delta line prints: a doctor mid-consultation should
            see at a glance that today's note is linked, and be able to undo a wrong link before
            it ends up on paper. */}
        {previousVisit && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
            Follow-up of {previousVisit.visitCode}
            <button
              type="button"
              className="hover:text-blue-900 dark:hover:text-blue-100"
              onClick={() => setPreviousVisit(null)}
              title="Unlink from this visit"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {isDraft && <SectionChip label="AI draft — unreviewed" tone="draft" />}
          {consent && <SectionChip label="Consent recorded" tone="info" />}
          {/* Consent gates the microphone, which is the moment collection starts. Until it is
              taken the real Record button is not rendered at all — a disabled-looking control
              that still mounts the recorder would be a way to start capture by accident. */}
          {consent ? (
            <VoiceDictationButton sessionType="quick_scribe" size="sm" />
          ) : (
            <Button size="sm" onClick={() => setConsentOpen(true)}>
              <ShieldCheck className="h-4 w-4 mr-1.5" />
              Consent &amp; record
            </Button>
          )}
        </div>
      </div>

      <QuickScribeConsentModal
        open={consentOpen}
        hospitalId={hospitalId || ""}
        doctorId={userId || ""}
        onClose={() => setConsentOpen(false)}
        onConsented={(c) => {
          setConsent(c);
          setConsentOpen(false);
          toast({
            title: "Consent recorded",
            description: "You can start recording now.",
          });
        }}
      />

      <PreviousVisitDrawer
        open={previousVisitOpen}
        onClose={() => setPreviousVisitOpen(false)}
        onContinueMedicine={handleContinueMedicine}
        onContinueVisit={handleContinueVisit}
      />

      {/* Patient identity. Not a patient record — no MRN, no chart, nothing written to
          public.patients. Not required to print. */}
      <div className="flex-shrink-0 border-b border-border bg-muted/30 px-5 py-2 flex items-end gap-3">
        <div className="flex-1 min-w-0">
          <label className="text-sm text-muted-foreground block mb-1">Patient name</label>
          <Input className="h-8" value={patient.name} onChange={e => setPatient(p => ({ ...p, name: e.target.value }))} />
        </div>
        <div className="w-24">
          <label className="text-sm text-muted-foreground block mb-1">Age</label>
          <Input className="h-8" value={patient.age} onChange={e => setPatient(p => ({ ...p, age: e.target.value }))} />
        </div>
        <div className="w-28">
          <label className="text-sm text-muted-foreground block mb-1">Sex</label>
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

      {/* Clinical alerts, surfaced immediately rather than at print. */}
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

      {/* Body.
          Two layouts, not one grid reflowing at a breakpoint — the wide (xl, 1280px+) arrangement
          and the narrower progressive-disclosure one are different enough in which fields are
          unconditionally visible that a single responsive grid would need per-field breakpoint
          overrides throughout. Both are always mounted; Tailwind's `xl:`/`hidden` pair decides
          which one is on screen, so there is exactly one note/revealedFields state driving both. */}
      <div className="flex-1 min-h-0 overflow-hidden p-4">
        {!note ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Press Record to start. Review the draft in the panel, then click “Apply to Quick Scribe”.
          </div>
        ) : (
          <>
            {/* ── Wide (≥1280px): three fixed rows, medicines bottom-anchored ── */}
            <div className="hidden xl:flex xl:flex-col gap-3 h-full min-h-0">
              <div className="grid grid-cols-3 gap-3 flex-shrink-0">
                <CompactField label="Chief Complaint" value={note.chiefComplaint}
                  onChange={v => setField("chiefComplaint", v)} />
                <CompactField label="Diagnosis" value={note.diagnosis}
                  onChange={v => setField("diagnosis", v)}
                  placeholder="Typed by you — never AI-filled" />
                <CompactField label="Follow-up date" type="date" value={note.followUpDate}
                  onChange={v => setField("followUpDate", v)} />
              </div>

              <div className="grid grid-cols-3 gap-3 flex-1 min-h-0">
                <div className="border border-border rounded-lg p-3 flex flex-col min-h-0">
                  <h4 className="text-sm uppercase text-muted-foreground font-semibold mb-2">Summary</h4>
                  <Textarea
                    className="flex-1 min-h-0 resize-none text-sm"
                    value={note.summary}
                    onChange={e => setNote({ ...note, summary: e.target.value })}
                  />
                </div>

                <div className="border border-border rounded-lg p-3 flex flex-col min-h-0">
                  <h4 className="text-sm uppercase text-muted-foreground font-semibold mb-2">Advice</h4>
                  <Textarea
                    className="flex-1 min-h-0 resize-none text-sm"
                    value={note.advice}
                    onChange={e => setNote({ ...note, advice: e.target.value })}
                  />
                </div>

                <div className="flex flex-col gap-3 min-h-0 overflow-y-auto pr-1">
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
                  {/* Follow-up only, typed only — see 20261111000006. An empty "Reports
                      Reviewed" box on a first visit is noise, so it stays a chip until either
                      the doctor taps it or a future carry-forward step populates it. */}
                  {revealedFields.has("reportsReviewed") ? (
                    <div className="border border-border rounded-lg p-3">
                      <h4 className="text-sm uppercase text-muted-foreground font-semibold mb-2">Reports Reviewed</h4>
                      <Textarea
                        className="resize-none text-sm" rows={2}
                        value={note.reportsReviewed}
                        onChange={e => setField("reportsReviewed", e.target.value)}
                        placeholder={reportsReviewedPlaceholder}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="self-start"
                      onClick={() => setRevealedFields(prev => new Set(prev).add("reportsReviewed"))}
                    >
                      <SectionChip label="+ Reports Reviewed" tone="info" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-shrink-0">
                <MedicinesPanel
                  medicines={note.medicines}
                  screening={screening}
                  maxRowsHeightClass="max-h-[160px]"
                  onUpdate={updateMedicine}
                  onAdd={() => setNote({ ...note, medicines: [...note.medicines, { ...EMPTY_MED }] })}
                />
              </div>
            </div>

            {/* ── Narrower (<1280px, tablet-first): progressive disclosure ──
                Only populated optional fields render; the chip row offers the rest. Summary,
                Lab Tests, Radiology Tests and Medicines are unconditional — the original four. */}
            <div className="flex xl:hidden flex-col gap-3 h-full min-h-0 overflow-y-auto">
              {OPTIONAL_FIELD_KEYS.some(k => !revealedFields.has(k)) && (
                <div className="flex flex-wrap gap-1.5 flex-shrink-0">
                  {OPTIONAL_FIELD_KEYS.filter(k => !revealedFields.has(k)).map(k => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setRevealedFields(prev => new Set(prev).add(k))}
                    >
                      <SectionChip label={`+ ${OPTIONAL_FIELD_META[k].label}`} tone="info" />
                    </button>
                  ))}
                </div>
              )}

              {OPTIONAL_FIELD_KEYS.filter(k => revealedFields.has(k)).map(k => (
                <CompactField
                  key={k}
                  label={OPTIONAL_FIELD_META[k].label}
                  type={k === "followUpDate" ? "date" : "text"}
                  value={note[k]}
                  onChange={v => setField(k, v)}
                  placeholder={k === "reportsReviewed" ? reportsReviewedPlaceholder : undefined}
                />
              ))}

              <div className="border border-border rounded-lg p-3 flex flex-col min-h-[120px] flex-shrink-0">
                <h4 className="text-sm uppercase text-muted-foreground font-semibold mb-2">Summary</h4>
                <Textarea
                  className="flex-1 min-h-0 resize-none text-sm"
                  value={note.summary}
                  onChange={e => setNote({ ...note, summary: e.target.value })}
                />
              </div>

              <div className="border border-border rounded-lg p-3 flex-shrink-0">
                <h4 className="text-sm uppercase text-muted-foreground font-semibold mb-2">Lab Tests</h4>
                <Textarea
                  className="resize-none text-sm" rows={2}
                  value={note.labTests.join("\n")}
                  onChange={e => setNote({ ...note, labTests: e.target.value.split("\n").filter(Boolean) })}
                  placeholder="No lab tests mentioned"
                />
              </div>
              <div className="border border-border rounded-lg p-3 flex-shrink-0">
                <h4 className="text-sm uppercase text-muted-foreground font-semibold mb-2">Radiology Tests</h4>
                <Textarea
                  className="resize-none text-sm" rows={2}
                  value={note.radiologyTests.join("\n")}
                  onChange={e => setNote({ ...note, radiologyTests: e.target.value.split("\n").filter(Boolean) })}
                  placeholder="No radiology tests mentioned"
                />
              </div>

              <div className="flex-shrink-0">
                <MedicinesPanel
                  medicines={note.medicines}
                  screening={screening}
                  maxRowsHeightClass="max-h-[122px]"
                  onUpdate={updateMedicine}
                  onAdd={() => setNote({ ...note, medicines: [...note.medicines, { ...EMPTY_MED }] })}
                />
              </div>
            </div>
          </>
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
