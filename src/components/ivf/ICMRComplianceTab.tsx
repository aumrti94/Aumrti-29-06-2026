import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useHospitalId } from "@/hooks/useHospitalId";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Download, CheckCircle2, AlertTriangle, FileText } from "lucide-react";
import { format } from "date-fns";

interface ArtCycle {
  id: string;
  cycle_number: number;
  couple_name: string;
  female_name: string;
  male_name: string;
  icmr_reg_number: string | null;
  cycle_type: string;
  start_date: string;
  status: string | null;
  delivery_outcome: string | null;
  clinical_pregnancy: boolean | null;
  embryos_transferred: number | null;
  embryos_frozen: number | null;
}

// No props — hospitalId comes from the hook.
type Props = object;

const ICMRComplianceTab: React.FC<Props> = () => {
  const { toast } = useToast();
  const { hospitalId } = useHospitalId();
  const [cycles, setCycles] = useState<ArtCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [generating, setGenerating] = useState(false);
  // ICMR ART Act annual-report "submitted" status is tracked at the year/hospital granularity in
  // hmis_reports (report_type = "icmr_art_annual") — ivf_cycles has no per-cycle submitted flag,
  // and adding one is a schema change out of scope here (flagged separately to data-pod/Latha).
  const [submittedYears, setSubmittedYears] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    if (!hospitalId) return;
    setLoading(true);
    // Real table is `art_couples` (not `ivf_couples`), joined via its real FK constraint names
    // art_couples_female_patient_id_fkey / art_couples_male_patient_id_fkey — verified against
    // supabase/migrations/20260330090552_8f181820-6667-4345-ae68-d4aed2b4e34e.sql and
    // src/integrations/supabase/types.ts. The previous select also referenced several ivf_cycles
    // columns (cycle_start_date, outcome, procedure_type, sperm_source, oocyte_source,
    // gestational_carrier, live_birth_date, birth_weight_grams, congenital_anomalies,
    // icmr_submitted) that do not exist anywhere in the schema; replaced with the real columns
    // (start_date, cycle_type, delivery_outcome, clinical_pregnancy, status).
    const [cyclesRes, reportsRes] = await Promise.all([
      supabase
        .from("ivf_cycles")
        .select("id, cycle_number, start_date, status, cycle_type, delivery_outcome, clinical_pregnancy, embryos_transferred, embryos_frozen, art_couples!inner(icmr_reg_number, female_patient:patients!art_couples_female_patient_id_fkey(full_name), male_patient:patients!art_couples_male_patient_id_fkey(full_name))")
        .eq("hospital_id", hospitalId)
        .order("start_date", { ascending: false })
        .limit(200),
      supabase
        .from("hmis_reports")
        .select("period_year")
        .eq("hospital_id", hospitalId)
        .eq("report_type", "icmr_art_annual"),
    ]);

    if (cyclesRes.error) {
      console.error(cyclesRes.error);
      toast({ title: "Failed to load ICMR compliance data", description: cyclesRes.error.message, variant: "destructive" });
      setCycles([]);
      setLoading(false);
      return;
    }
    if (reportsRes.error) {
      console.error(reportsRes.error);
    } else {
      setSubmittedYears(new Set((reportsRes.data || []).map((r: any) => r.period_year)));
    }

    const mapped: ArtCycle[] = (cyclesRes.data || []).map((c: any) => ({
      id: c.id,
      cycle_number: c.cycle_number,
      couple_name: `${c.art_couples?.female_patient?.full_name || "?"} & ${c.art_couples?.male_patient?.full_name || "?"}`,
      female_name: c.art_couples?.female_patient?.full_name || "—",
      male_name: c.art_couples?.male_patient?.full_name || "—",
      icmr_reg_number: c.art_couples?.icmr_reg_number || null,
      cycle_type: c.cycle_type,
      start_date: c.start_date,
      status: c.status,
      delivery_outcome: c.delivery_outcome,
      clinical_pregnancy: c.clinical_pregnancy,
      embryos_transferred: c.embryos_transferred,
      embryos_frozen: c.embryos_frozen,
    }));

    setCycles(mapped);
    setLoading(false);
  }, [hospitalId, toast]);

  useEffect(() => { load(); }, [load]);

  const generateAnnualReport = async () => {
    if (!hospitalId) return;
    setGenerating(true);

    const yearCycles = cycles.filter((c) => new Date(c.start_date).getFullYear() === reportYear);

    if (yearCycles.length === 0) {
      toast({ title: `No cycles found for ${reportYear}` });
      setGenerating(false);
      return;
    }

    // Build ICMR ART Annual Report data structure per ART Act 2021 requirements, from real
    // ivf_cycles/art_couples columns only. `cycle_type` already carries donor-egg/donor-sperm/
    // surrogacy as distinct values (see CyclesTab.tsx CYCLE_TYPES) — there is no separate
    // sperm_source/oocyte_source/gestational_carrier column. Neonatal outcome fields
    // (live birth date, birth weight, congenital anomalies) have no column anywhere in the
    // schema; that is a genuine data-capture gap for full ART Act 2021 reporting, flagged
    // separately rather than invented here.
    const reportData = {
      report_year: reportYear,
      hospital_id: hospitalId,
      generated_at: new Date().toISOString(),
      total_cycles: yearCycles.length,
      procedure_breakdown: {
        ivf: yearCycles.filter(c => c.cycle_type === "ivf").length,
        icsi: yearCycles.filter(c => c.cycle_type === "icsi").length,
        iui: yearCycles.filter(c => c.cycle_type === "iui").length,
        fet: yearCycles.filter(c => c.cycle_type === "fet").length,
        donor_egg: yearCycles.filter(c => c.cycle_type === "donor_egg").length,
        donor_sperm: yearCycles.filter(c => c.cycle_type === "donor_sperm").length,
        surrogacy: yearCycles.filter(c => c.cycle_type === "surrogacy").length,
      },
      outcomes: {
        clinical_pregnancy: yearCycles.filter(c => c.clinical_pregnancy).length,
        live_births: yearCycles.filter(c => c.delivery_outcome === "live_birth").length,
        cancelled: yearCycles.filter(c => c.status === "cancelled").length,
        miscarriage: yearCycles.filter(c => c.delivery_outcome === "miscarriage").length,
        ongoing: yearCycles.filter(c => !c.delivery_outcome && c.status !== "cancelled").length,
      },
      pregnancy_rate: yearCycles.length > 0
        ? Math.round((yearCycles.filter(c => c.clinical_pregnancy).length / yearCycles.length) * 100)
        : 0,
      live_birth_rate: yearCycles.length > 0
        ? Math.round((yearCycles.filter(c => c.delivery_outcome === "live_birth").length / yearCycles.length) * 100)
        : 0,
      cycle_details: yearCycles.map(c => ({
        icmr_reg_number: c.icmr_reg_number,
        cycle_number: c.cycle_number,
        cycle_type: c.cycle_type,
        start_date: c.start_date,
        status: c.status,
        delivery_outcome: c.delivery_outcome,
        clinical_pregnancy: c.clinical_pregnancy,
        embryos_transferred: c.embryos_transferred,
        embryos_frozen: c.embryos_frozen,
      })),
    };

    // Save to HMIS reports table for record-keeping — also doubles as the per-year "submitted"
    // marker for this tab (ivf_cycles has no per-cycle submitted flag; see submittedYears above).
    const { error: reportError } = await supabase.from("hmis_reports").upsert({
      hospital_id: hospitalId,
      report_type: "icmr_art_annual",
      period_year: reportYear,
      status: "generated",
      generated_at: new Date().toISOString(),
      report_data: reportData,
    } as any, { onConflict: "hospital_id,report_type,period_year,period_month,period_week" }).select().maybeSingle();

    if (reportError) {
      console.error(reportError);
      toast({ title: "Failed to save ICMR annual report", description: reportError.message, variant: "destructive" });
      setGenerating(false);
      return;
    }

    // Download as JSON (ICMR submission format)
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ICMR_ART_Annual_Report_${reportYear}.json`;
    a.click();
    URL.revokeObjectURL(url);

    toast({ title: `ICMR ART Annual Report ${reportYear} generated`, description: `${yearCycles.length} cycles included. Download started.` });
    setGenerating(false);
    load();
  };

  const pendingCount = cycles.filter(c => !c.icmr_reg_number).length;
  const unsubmittedCount = cycles.filter(c => !submittedYears.has(new Date(c.start_date).getFullYear())).length;

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="flex flex-col gap-4">
      {/* ICMR Compliance Status */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded-xl border p-3 ${pendingCount > 0 ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
          <div className="flex items-center gap-2">
            {pendingCount > 0 ? <AlertTriangle size={16} className="text-amber-600" /> : <CheckCircle2 size={16} className="text-emerald-600" />}
            <span className={`text-sm font-bold ${pendingCount > 0 ? "text-amber-700" : "text-emerald-700"}`}>
              {pendingCount > 0 ? `${pendingCount} couples missing ICMR ID` : "All couples have ICMR IDs"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">ICMR Couple ID required under ART Act 2021 Rule 5(2)</p>
        </div>
        <div className={`rounded-xl border p-3 ${unsubmittedCount > 0 ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
          <div className="flex items-center gap-2">
            {unsubmittedCount > 0 ? <AlertTriangle size={16} className="text-amber-600" /> : <CheckCircle2 size={16} className="text-emerald-600" />}
            <span className={`text-sm font-bold ${unsubmittedCount > 0 ? "text-amber-700" : "text-emerald-700"}`}>
              {unsubmittedCount > 0 ? `${unsubmittedCount} cycles pending ICMR report` : "All cycles reported"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Annual ART Act 2021 report due by 31 March each year</p>
        </div>
      </div>

      {/* Annual Report Generator */}
      <div className="flex items-center justify-between bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-3">
          <FileText size={18} className="text-primary" />
          <div>
            <p className="text-sm font-bold">ICMR ART Annual Registry Report</p>
            <p className="text-xs text-muted-foreground">ART Act 2021 — Section 25 Annual Submission to ICMR</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={reportYear}
            onChange={(e) => setReportYear(parseInt(e.target.value))}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <Button size="sm" className="gap-1.5" onClick={generateAnnualReport} disabled={generating}>
            {generating ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            {generating ? "Generating..." : "Generate & Download"}
          </Button>
        </div>
      </div>

      {/* Cycle list */}
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-[10px] font-bold uppercase text-muted-foreground">
              <th className="px-3 py-2 text-left">Cycle</th>
              <th className="px-3 py-2 text-left">Couple</th>
              <th className="px-3 py-2 text-left">ICMR ID</th>
              <th className="px-3 py-2 text-center">Procedure</th>
              <th className="px-3 py-2 text-center">Date</th>
              <th className="px-3 py-2 text-center">Outcome</th>
              <th className="px-3 py-2 text-center">Gametes</th>
              <th className="px-3 py-2 text-center">ICMR Submitted</th>
            </tr>
          </thead>
          <tbody>
            {cycles.slice(0, 50).map((c) => (
              <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-3 py-2 text-xs font-mono font-bold">{c.cycle_number}</td>
                <td className="px-3 py-2 text-xs">{c.couple_name}</td>
                <td className="px-3 py-2 text-xs">
                  {c.icmr_reg_number ? (
                    <span className="font-mono text-[10px] text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">{c.icmr_reg_number}</span>
                  ) : (
                    <Badge variant="outline" className="text-[9px] border-amber-300 bg-amber-50 text-amber-700">
                      <AlertTriangle size={8} className="mr-1" /> Missing
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  <Badge variant="outline" className="text-[9px] uppercase">{c.cycle_type}</Badge>
                </td>
                <td className="px-3 py-2 text-center text-xs">{format(new Date(c.start_date), "dd/MM/yyyy")}</td>
                <td className="px-3 py-2 text-center">
                  <Badge variant="outline" className="text-[9px] capitalize">
                    {c.delivery_outcome || c.status || "ongoing"}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-center text-[10px] text-muted-foreground">
                  {c.cycle_type === "donor_sperm" ? "Donor sperm"
                    : c.cycle_type === "donor_egg" ? "Donor oocyte"
                    : c.cycle_type === "surrogacy" ? "Surrogate"
                    : "Own"}
                </td>
                <td className="px-3 py-2 text-center">
                  {submittedYears.has(new Date(c.start_date).getFullYear())
                    ? <CheckCircle2 size={14} className="text-emerald-600 mx-auto" />
                    : <span className="text-[10px] text-muted-foreground">Pending</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ICMRComplianceTab;
