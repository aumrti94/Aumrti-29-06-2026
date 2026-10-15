import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { autoChargeService, MODULE_ED } from "@/lib/serviceBilling";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Pill, AlertTriangle } from "lucide-react";
import { useConfigValues } from "@/hooks/useConfigValues";
import { checkDrugSafety, type DrugSafetyResult } from "@/lib/drugSafetyCheck";
import DrugSafetyAlertModal from "@/components/opd/DrugSafetyAlertModal";

interface MedRow {
  id: string;
  drug_name: string;
  dose: string | null;
  route: string | null;
  administered_at: string;
  notes: string | null;
  ed_charge_item_id: string | null;
}

interface Props {
  hospitalId: string;
  userId: string | null;
  edVisitId: string;
  patientId: string;
  patientName: string;
  allergies?: string;          // from AMPLE history (visit.ample_history.a)
  onClose: () => void;
  onAdministered?: () => void;  // refresh parent charge totals when a med is billed
}


/**
 * ED medication administration record (eMAR) — Phase 7.
 * Records administered emergency drugs and bills the drug/consumable via the Phase-1
 * ed_charge_items path. Before any drug is recorded as administered, it is run through the
 * shared `checkDrugSafety()` gate — the same allergy / drug-drug interaction / duplicate-
 * molecule check used by OPD prescribing and IPD medication administration — so this
 * drug-administration screen never relies on a narrower, ED-only substring match.
 */
const EDMedicationPanel: React.FC<Props> = ({
  hospitalId, userId, edVisitId, patientId, patientName, allergies, onClose, onAdministered,
}) => {
  // Emergency keeps its own route shorthand ("PO (oral)", "Nebulized") rather than
  // the pharmacy drug_routes vocabulary — see configValueDefaults.ts.
  const routes = useConfigValues("emergency_drug_routes");
  const [rows, setRows] = useState<MedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [drugName, setDrugName] = useState("");
  const [dose, setDose] = useState("");
  const [route, setRoute] = useState("IV");
  const [notes, setNotes] = useState("");
  const [billConsumable, setBillConsumable] = useState(false);
  const [rate, setRate] = useState("");

  // The patient's CONFIRMED structured allergy record (patients.allergies), as distinct from
  // this visit's unconfirmed AMPLE free-text field below. Neither replaces the other — see
  // combinedAllergies.
  const [structuredAllergies, setStructuredAllergies] = useState<string | null>(null);

  const [safetyResult, setSafetyResult] = useState<DrugSafetyResult | null>(null);
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [checkingSafety, setCheckingSafety] = useState(false);

  const loadRows = useCallback(async () => {
    const { data } = await (supabase as any).from("ed_medications")
      .select("id, drug_name, dose, route, administered_at, notes, ed_charge_item_id")
      .eq("ed_visit_id", edVisitId)
      .order("administered_at", { ascending: false });
    setRows((data as MedRow[]) || []);
    setLoading(false);
  }, [edVisitId]);

  useEffect(() => { loadRows(); }, [loadRows]);

  // Confirmed structured allergy record for this patient — the input RxOrdersTab reads via
  // ConsultationWorkspace's `token.patient.allergies`, fetched directly here since the ED
  // visit object only carries the AMPLE free-text field.
  useEffect(() => {
    let cancelled = false;
    (supabase as any).from("patients").select("allergies").eq("id", patientId).maybeSingle()
      .then(({ data, error }: any) => {
        if (cancelled) return;
        if (error) {
          // A failed lookup must not silently read as "no known allergies" — surface it so a
          // clinician isn't shown a falsely clean allergy line, and leave the AMPLE text (the
          // other input) still in play for the safety check below.
          toast({ title: "Could not load patient allergy record", description: error.message, variant: "destructive" });
          setStructuredAllergies(null);
          return;
        }
        setStructuredAllergies(data?.allergies ?? null);
      });
    return () => { cancelled = true; };
  }, [patientId]);

  // The allergy set fed into checkDrugSafety(): the union of the patient's confirmed structured
  // record AND this visit's AMPLE free-text — AMPLE may carry information not yet transcribed
  // into the structured record, so neither input is dropped in favour of the other.
  const combinedAllergies = useMemo(() => {
    const parse = (s: string | null | undefined) =>
      (s || "").split(/[,;/]+/).map(a => a.trim()).filter(a => a.length > 2);
    const set = new Set<string>([...parse(structuredAllergies), ...parse(allergies)]);
    return [...set];
  }, [structuredAllergies, allergies]);

  // Likely-allergy detection for the inline hint shown while typing — informational only, not
  // the gate. The authoritative, blocking check runs in administer() via checkDrugSafety().
  const allergyHit = useMemo(() => {
    const drug = drugName.trim().toLowerCase();
    if (!drug) return null;
    const match = combinedAllergies.find(a => {
      const al = a.toLowerCase();
      return drug.includes(al) || al.includes(drug);
    });
    return match || null;
  }, [combinedAllergies, drugName]);

  /** Drugs already administered this ED visit — the "currentDrugs" input to checkDrugSafety(),
   *  so a drug-drug interaction or duplicate-molecule against today's own eMAR is caught. */
  const currentDrugNames = useMemo(() => rows.map(r => r.drug_name), [rows]);

  const doAdminister = async () => {
    setSaving(true);
    try {
      let chargeItemId: string | null = null;

      // Optional: bill the drug / consumable via the Phase-1 ed_charge_items path.
      if (billConsumable) {
        const r = parseFloat(rate) || 0;
        if (r <= 0) { toast({ title: "Enter a rate to bill", variant: "destructive" }); setSaving(false); return; }
        const { data: chargeRow, error: cErr } = await (supabase as any).from("ed_charge_items").insert({
          hospital_id: hospitalId,
          ed_visit_id: edVisitId,
          patient_id:  patientId,
          description: `${drugName.trim()}${dose ? ` ${dose}` : ""}`,
          category:    "consumable",
          quantity:    1,
          unit_rate:   r,
          gst_percent: 0,
          performed_by: userId,
        }).select("id").maybeSingle();
        if (cErr || !chargeRow) throw new Error(cErr?.message || "Could not create charge");
        chargeItemId = chargeRow.id;
        await autoChargeService({
          hospitalId, patientId,
          encounterId:   edVisitId,
          serviceName:   `${drugName.trim()}${dose ? ` ${dose}` : ""}`,
          serviceModule: MODULE_ED,
          sourceTable:   "ed_charge_items",
          sourceId:      chargeItemId,
          unitRate:      r,
          performedBy:   userId,
        });
      }

      const { error } = await (supabase as any).from("ed_medications").insert({
        hospital_id: hospitalId,
        ed_visit_id: edVisitId,
        patient_id:  patientId,
        drug_name:   drugName.trim(),
        dose:        dose.trim() || null,
        route,
        administered_by: userId,
        notes:       notes.trim() || null,
        ed_charge_item_id: chargeItemId,
      });
      if (error) throw new Error(error.message);

      toast({ title: "Medication recorded", description: `${drugName.trim()} administered.` });
      setDrugName(""); setDose(""); setRoute("IV"); setNotes(""); setBillConsumable(false); setRate("");
      await loadRows();
      if (chargeItemId) onAdministered?.();
    } catch (e: any) {
      toast({ title: "Could not record medication", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  /**
   * The gate. Every drug typed into this eMAR is run through the shared `checkDrugSafety()` —
   * the patient's structured allergy record, this visit's AMPLE allergies, drug-drug
   * interactions against everything already given this visit, and duplicate-molecule detection
   * — before it can be recorded as administered. `result.hasIssues` routes to the same
   * `DrugSafetyAlertModal` OPD/IPD use rather than a bypassable inline note; a failed lookup
   * (`checkUnavailable`) is surfaced the same way, never treated as a clean result.
   */
  const administer = async () => {
    if (!drugName.trim()) { toast({ title: "Enter a drug name", variant: "destructive" }); return; }
    setCheckingSafety(true);
    try {
      const result = await checkDrugSafety(drugName.trim(), currentDrugNames, combinedAllergies, hospitalId ?? "");
      if (result.hasIssues) {
        setSafetyResult(result);
        setShowSafetyModal(true);
        return;
      }
      await doAdminister();
    } catch (e) {
      // Same fail-loud shape as RxOrdersTab's performSafetyCheck (KNOWN-BUG-108): an
      // unexpected throw here must surface as an incomplete/unsafe result, never let the drug
      // through unchecked.
      setSafetyResult({
        hasIssues: true,
        interactions: [],
        allergyConflicts: [],
        duplicates: [],
        worstSeverity: "major",
        checkUnavailable: true,
        unavailableReasons: [`Drug safety check failed: ${e instanceof Error ? e.message : String(e)}`],
      });
      setShowSafetyModal(true);
    } finally {
      setCheckingSafety(false);
    }
  };

  const closeSafetyModal = () => {
    setShowSafetyModal(false);
    setSafetyResult(null);
  };

  const handleSafetyAddAnyway = () => {
    closeSafetyModal();
    void doAdminister();
  };

  /** Mirrors RxOrdersTab's handleSafetyOverride (BUG-P4-004): patient_id AND created_by must
   *  both be populated, or the override is logged to nobody. */
  const handleSafetyOverride = (reason: string) => {
    const result = safetyResult;
    closeSafetyModal();
    if (hospitalId && result) {
      const conflicts = result.allergyConflicts.map(c => `${c.allergy} (${c.type})`).join(", ");
      supabase.from("clinical_alerts").insert({
        hospital_id: hospitalId,
        patient_id: patientId ?? null,
        created_by: userId ?? null,
        alert_type: "drug_override",
        severity: "critical",
        alert_message:
          `ED medication safety override: ${drugName.trim()} administered despite ${result.worstSeverity} alert` +
          `${conflicts ? ` (allergy conflict: ${conflicts})` : ""}. Reason: ${reason}`,
      } as never).then(({ error }) => {
        if (error) {
          toast({
            title: "Override not recorded",
            description: `${drugName.trim()} was administered but the override could not be written to the patient record: ${error.message}`,
            variant: "destructive",
          });
        }
      });
    }
    void doAdminister();
  };

  return (
    <>
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pill className="h-4 w-4" /> Medications — {patientName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {allergies?.trim() && (
            <p className="text-[11px] text-muted-foreground">
              AMPLE allergies: <span className="font-medium text-foreground">{allergies}</span>
            </p>
          )}
          {structuredAllergies?.trim() && (
            <p className="text-[11px] text-muted-foreground">
              Confirmed allergy record: <span className="font-medium text-foreground">{structuredAllergies}</span>
            </p>
          )}

          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Drug</label>
                <Input value={drugName} onChange={e => setDrugName(e.target.value)} className="mt-1 h-9" placeholder="e.g. Inj. Adrenaline" />
              </div>
              <div className="w-24">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Dose</label>
                <Input value={dose} onChange={e => setDose(e.target.value)} className="mt-1 h-9" placeholder="1 mg" />
              </div>
              <div className="w-32">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Route</label>
                <Select value={route} onValueChange={setRoute}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {routes.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {allergyHit && (
              <div className="flex items-center gap-1.5 rounded-md bg-red-50 border border-red-200 px-2.5 py-1.5 text-red-700 text-xs font-medium">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                Allergy alert — patient is recorded allergic to “{allergyHit}”. Confirm before administering.
              </div>
            )}

            <Input value={notes} onChange={e => setNotes(e.target.value)} className="h-9" placeholder="Notes (optional)" />

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium">
                <input type="checkbox" checked={billConsumable} onChange={e => setBillConsumable(e.target.checked)} className="rounded" />
                Bill as consumable
              </label>
              {billConsumable && (
                <Input type="number" min="0" value={rate} onChange={e => setRate(e.target.value)} className="h-8 w-24" placeholder="Rate ₹" />
              )}
              <Button onClick={administer} disabled={saving || checkingSafety} className="ml-auto h-9">
                {(saving || checkingSafety) ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                {checkingSafety ? "Checking…" : "Administer"}
              </Button>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-foreground mb-1.5">Administered this visit</p>
            {loading ? (
              <p className="text-xs text-muted-foreground py-3 text-center">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center">No medications recorded yet.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase text-muted-foreground">
                    <th className="py-1 font-medium">Time</th>
                    <th className="py-1 font-medium">Drug</th>
                    <th className="py-1 font-medium">Dose</th>
                    <th className="py-1 font-medium">Route</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-t border-border/50">
                      <td className="py-1.5 pr-2 tabular-nums whitespace-nowrap">{new Date(r.administered_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="py-1.5 pr-2">{r.drug_name}{r.ed_charge_item_id ? " 💲" : ""}</td>
                      <td className="py-1.5 pr-2">{r.dose || "—"}</td>
                      <td className="py-1.5">{r.route || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Same blocking/warning treatment OPD (RxOrdersTab) and IPD (IPDMedicationsTab) use for
        drug safety — rendered outside the Dialog's own content node so it is never clipped by
        the eMAR panel's `overflow-y-auto`, and sits above it in the modal stack. */}
    {showSafetyModal && safetyResult && (
      <DrugSafetyAlertModal
        open={showSafetyModal}
        drugName={drugName.trim()}
        result={safetyResult}
        hospitalId={hospitalId}
        onClose={closeSafetyModal}
        onAddAnyway={handleSafetyAddAnyway}
        onOverride={handleSafetyOverride}
      />
    )}
    </>
  );
};

export default EDMedicationPanel;
