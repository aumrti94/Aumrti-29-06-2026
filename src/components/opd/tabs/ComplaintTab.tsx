import React, { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Pencil } from "lucide-react";
import type { EncounterData, PrescriptionData } from "../ConsultationWorkspace";
import { useDoctorQuickPicks } from "@/hooks/useDoctorQuickPicks";
import QuickPickManagerPanel from "@/components/opd/QuickPickManagerPanel";
import DiagnosisPanel from "../DiagnosisPanel";

interface Props {
  encounter: EncounterData;
  onChange: (partial: Partial<EncounterData>) => void;
  /**
   * All optional, and all-or-nothing in practice: OPD's ConsultationWorkspace passes every one
   * of these so Examination, Diagnosis, and Plan & Advice render beside Chief Complaint / HPI.
   * Teleconsult reuses this same tab for vitals + complaint only and passes none of them, so the
   * gate below is `prescription && onPrescriptionChange` rather than a dedicated boolean prop.
   */
  encounterId?: string | null;
  hospitalId?: string | null;
  patientId?: string | null;
  userId?: string | null;
  seedDiagnosis?: { text: string; icd10_code: string; nonce: number; isAiSuggested?: boolean; basis?: string } | null;
  prescription?: PrescriptionData;
  onPrescriptionChange?: (partial: Partial<PrescriptionData>) => void;
}

function getVital(vitals: Record<string, unknown>, key: string): string {
  return String(vitals[key] ?? "");
}

function setVital(vitals: Record<string, unknown>, key: string, val: string): Record<string, unknown> {
  return { ...vitals, [key]: val };
}

const VitalField: React.FC<{
  label: string; unit: string; value: string; placeholder: string;
  onChange: (v: string) => void; alert?: "amber" | "red" | "green"; type?: string;
}> = ({ label, unit, value, placeholder, onChange, alert, type = "number" }) => (
  <div className={cn(
    "flex-1 min-w-0 bg-white border rounded-lg px-2 py-1.5 transition-colors",
    alert === "red" ? "border-red-300" : alert === "amber" ? "border-amber-300" : alert === "green" ? "border-emerald-300" : "border-slate-200"
  )}>
    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block truncate">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-sm font-semibold text-slate-900 bg-transparent outline-none"
    />
    <span className="text-[9px] text-slate-400 truncate block">{unit}</span>
  </div>
);

const SkeletonChips = () => (
  <div className="flex flex-wrap gap-1 mb-2">
    {Array.from({ length: 6 }).map((_, i) => (
      <span key={i} className="h-6 w-20 rounded-full bg-muted animate-pulse inline-block" />
    ))}
  </div>
);

const ComplaintTab: React.FC<Props> = ({
  encounter, onChange, encounterId, hospitalId, patientId, userId, seedDiagnosis,
  prescription, onPrescriptionChange,
}) => {
  const v = encounter.vitals;
  const showExtended = !!prescription && !!onPrescriptionChange;

  const [showExamManager, setShowExamManager] = useState(false);
  const { items: examFindings, isLoading: examLoading, save: saveExam, reset: resetExam } =
    useDoctorQuickPicks<string>("exam_findings");

  const appendToExam = (text: string) => {
    const cur = encounter.examination_notes;
    onChange({ examination_notes: cur + (cur ? ", " : "") + text });
  };

  const updateVital = (key: string, val: string) => {
    onChange({ vitals: setVital(v, key, val) });
  };

  const sys = parseFloat(getVital(v, "bp_systolic"));
  const pulse = parseFloat(getVital(v, "pulse"));
  const temp = parseFloat(getVital(v, "temperature"));
  const spo2 = parseFloat(getVital(v, "spo2"));
  const weight = parseFloat(getVital(v, "weight_kg"));
  const height = parseFloat(getVital(v, "height_cm"));

  const bmi = useMemo(() => {
    if (!weight || !height) return null;
    return weight / Math.pow(height / 100, 2);
  }, [weight, height]);

  const bmiCategory = useMemo(() => {
    if (!bmi) return null;
    if (bmi < 18.5) return { label: "Underweight", color: "text-blue-600" };
    if (bmi < 25) return { label: "Normal", color: "text-emerald-600" };
    if (bmi < 30) return { label: "Overweight", color: "text-amber-600" };
    return { label: "Obese", color: "text-red-600" };
  }, [bmi]);

  const bpAlert = sys > 180 ? "red" : sys > 140 ? "amber" : undefined;
  const pulseAlert = pulse > 100 || pulse < 60 ? "amber" : undefined;
  const tempAlert = temp > 100.4 ? "amber" : undefined;
  const spo2Alert = spo2 < 95 ? "red" : spo2 <= 97 ? "amber" : spo2 >= 98 ? "green" : undefined;

  return (
    <div className="h-full overflow-y-auto p-4 space-y-3">
      {/* Vitals — one compact row so the doctor never has to leave the complaint screen to record them */}
      <div>
        <label className="text-xs font-bold text-slate-700 mb-1.5 block">Vitals</label>
        <div className="flex gap-2">
          <div className={cn("flex-[1.4] min-w-0 bg-white border rounded-lg px-2 py-1.5 transition-colors", bpAlert === "red" ? "border-red-300" : bpAlert === "amber" ? "border-amber-300" : "border-slate-200")}>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block truncate">BP (mmHg)</label>
            <div className="flex items-center gap-1">
              <input type="number" value={getVital(v, "bp_systolic")} onChange={(e) => updateVital("bp_systolic", e.target.value)} placeholder="120" className="w-full min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-sm font-semibold text-slate-900 bg-transparent outline-none" />
              <span className="text-slate-400 text-sm shrink-0">/</span>
              <input type="number" value={getVital(v, "bp_diastolic")} onChange={(e) => updateVital("bp_diastolic", e.target.value)} placeholder="80" className="w-full min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-sm font-semibold text-slate-900 bg-transparent outline-none" />
            </div>
            <span className="text-[9px] text-slate-400 truncate block">Normal: 90-140/60-90</span>
          </div>

          <VitalField label="Pulse (/min)" unit="Normal: 60-100" value={getVital(v, "pulse")} placeholder="72" onChange={(val) => updateVital("pulse", val)} alert={pulseAlert} />
          <VitalField label="Temp (°F)" unit="Normal: 97-99" value={getVital(v, "temperature")} placeholder="98.6" onChange={(val) => updateVital("temperature", val)} alert={tempAlert} />
          <VitalField label="SpO2 (%)" unit="Normal: ≥ 98%" value={getVital(v, "spo2")} placeholder="98" onChange={(val) => updateVital("spo2", val)} alert={spo2Alert} />
          <VitalField label="Weight (kg)" unit="" value={getVital(v, "weight_kg")} placeholder="65" onChange={(val) => updateVital("weight_kg", val)} />
          <VitalField label="Height (cm)" unit="" value={getVital(v, "height_cm")} placeholder="170" onChange={(val) => updateVital("height_cm", val)} />

          <div className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-2 py-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block truncate">BMI</label>
            <span className="text-sm font-semibold text-slate-900">{bmi ? bmi.toFixed(1) : "—"}</span>
            {bmiCategory && <span className={cn("text-[9px] block truncate font-semibold", bmiCategory.color)}>{bmiCategory.label}</span>}
          </div>
        </div>
      </div>

      {/* Complaint/History beside Examination/Diagnosis — side by side so both are visible
          together without scrolling past one to reach the other. */}
      <div className={cn("grid gap-3", showExtended ? "grid-cols-2 items-start" : "grid-cols-1")}>
        <div className="space-y-3">
          {/* Chief complaint */}
          <div>
            <label className="text-xs font-bold text-slate-700 mb-1.5 block">Chief Complaint *</label>
            <textarea
              value={encounter.chief_complaint}
              onChange={(e) => onChange({ chief_complaint: e.target.value })}
              placeholder="Patient's main complaint in their own words..."
              className="w-full min-h-[100px] border border-slate-200 rounded-lg p-3 text-sm resize-none focus:border-[#1A2F5A] focus:ring-2 focus:ring-[#1A2F5A]/10 outline-none"
            />
          </div>

          {/* History of Present Illness */}
          <div>
            <label className="text-xs font-bold text-slate-700 mb-1.5 block">History of Present Illness</label>
            <textarea
              value={encounter.history_of_present_illness}
              onChange={(e) => onChange({ history_of_present_illness: e.target.value })}
              placeholder="History of present illness — onset, duration, progression, aggravating/relieving factors..."
              className="w-full min-h-[80px] border border-slate-200 rounded-lg p-3 text-sm resize-none focus:border-[#1A2F5A] focus:ring-2 focus:ring-[#1A2F5A]/10 outline-none"
            />
          </div>
        </div>

        {showExtended && (
          <div className="space-y-3">
            {/* General Examination */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">General Examination</label>
                <button
                  onClick={() => setShowExamManager(v => !v)}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-[#1A2F5A] transition-colors"
                >
                  <Pencil className="h-3 w-3" />
                  {showExamManager ? "Done" : "Manage"}
                </button>
              </div>

              {examLoading ? (
                <SkeletonChips />
              ) : (
                <div className="flex flex-wrap gap-1 mb-2">
                  {examFindings.map((c) => (
                    <button
                      key={c}
                      onClick={() => appendToExam(c)}
                      className="text-xs px-2.5 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}

              {showExamManager && !examLoading && (
                <QuickPickManagerPanel
                  items={examFindings}
                  onSave={saveExam}
                  onReset={resetExam}
                  label="examination finding chips"
                />
              )}

              <textarea
                value={encounter.examination_notes}
                onChange={(e) => onChange({ examination_notes: e.target.value })}
                className="w-full min-h-[90px] border border-slate-200 rounded-lg p-3 text-sm resize-none focus:border-[#1A2F5A] focus:ring-2 focus:ring-[#1A2F5A]/10 outline-none mt-2"
                placeholder="General examination findings..."
              />
            </div>

            {/* Systemic Examination */}
            <div>
              <label className="text-xs font-bold text-slate-700 mb-1 block">Systemic Examination / Clinical Notes</label>
              <textarea
                value={encounter.soap_objective}
                onChange={(e) => onChange({ soap_objective: e.target.value })}
                className="w-full min-h-[90px] border border-slate-200 rounded-lg p-3 text-sm resize-none focus:border-[#1A2F5A] focus:ring-2 focus:ring-[#1A2F5A]/10 outline-none"
                placeholder="Systemic examination findings..."
              />
            </div>

            {/* Multi-Diagnosis Panel */}
            <DiagnosisPanel
              encounterId={encounterId ?? null}
              hospitalId={hospitalId ?? null}
              patientId={patientId ?? null}
              userId={userId ?? null}
              onPrimaryChange={(diagnosis, icd10_code, icd11_code) => onChange({ diagnosis, icd10_code, icd11_code })}
              seedDiagnosis={seedDiagnosis ?? null}
            />
          </div>
        )}
      </div>

      {/* Plan & Advice */}
      {showExtended && prescription && onPrescriptionChange && (
        <div className="pt-3 mt-1 border-t-2 border-slate-200 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 mb-1 block">Plan &amp; Investigations</label>
              <textarea
                value={encounter.soap_plan}
                onChange={(e) => onChange({ soap_plan: e.target.value })}
                placeholder="Management plan, investigations advised, referrals..."
                className="w-full min-h-[100px] border border-slate-200 rounded-lg p-3 text-sm resize-none focus:border-[#1A2F5A] focus:ring-2 focus:ring-[#1A2F5A]/10 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 mb-1 block">Advice &amp; Instructions</label>
              <textarea
                value={prescription.advice_notes}
                onChange={(e) => onPrescriptionChange({ advice_notes: e.target.value })}
                placeholder="Advice and instructions for the patient..."
                className="w-full min-h-[100px] border border-slate-200 rounded-lg p-3 text-sm resize-none focus:border-[#1A2F5A] focus:ring-2 focus:ring-[#1A2F5A]/10 outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 mb-1 block">Follow-up</label>
              <input
                type="text"
                value={encounter.follow_up_notes}
                onChange={(e) => onChange({ follow_up_notes: e.target.value })}
                placeholder="e.g. Follow up with MRI report"
                className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#1A2F5A]"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 mb-1 block">Review date</label>
              <input
                type="date"
                value={prescription.review_date}
                onChange={(e) => onPrescriptionChange({ review_date: e.target.value })}
                className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#1A2F5A]"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComplaintTab;
