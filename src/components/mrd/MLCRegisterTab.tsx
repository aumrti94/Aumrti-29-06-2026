import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { printDocument, printHeader } from "@/lib/printUtils";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Printer, Search } from "lucide-react";

interface MLCCase {
  id: string;
  mlc_number: string;
  case_type: string;
  incident_date: string | null;
  incident_place: string | null;
  police_station: string | null;
  police_informed: boolean;
  fir_number: string | null;
  created_at: string;
  ed_visit_id: string | null;
  admission_id: string | null;
  patient: { full_name: string; uhid: string } | null;
  ed_visit: { triage_category: string } | null;
}

// Keyed by `${source_table}:${source_id}` so a case can be resolved against the notification
// row regardless of whether it's ED- or admission-sourced — mlc_police_notifications has no FK
// to mlc_cases (it's a polymorphic source_table/source_id pair keyed off ed_visits/admissions
// directly, per 20261106000036), so this can't be expressed as a PostgREST embed and is merged
// client-side instead.
interface MLCNotification {
  source_table: string;
  source_id: string;
  status: string;
  notification_deadline: string;
  informed_at: string | null;
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * TAT indicator for the 6h police-intimation clock (mlc_police_notifications.notification_deadline
 * — never mlc_cases.created_at, which is form-submission time, not MLC-designation time).
 * Returns null when there's nothing to show: no tracked notification row for this case (e.g. a
 * case whose source ed_visits.mlc / admissions.is_mlc flag was never set, so no clock exists yet).
 */
function renderMlcTat(notif: MLCNotification | null): React.ReactNode {
  if (!notif) return <span className="text-[11px] text-muted-foreground">—</span>;

  if (notif.status === "informed") {
    return <StatusBadge status="mlc_tat_resolved" />;
  }

  const diffMs = new Date(notif.notification_deadline).getTime() - Date.now();
  if (diffMs <= 0) {
    return <StatusBadge status="mlc_tat_overdue" label={`Overdue by ${formatDuration(-diffMs)}`} />;
  }
  if (diffMs <= 60 * 60 * 1000) {
    return <StatusBadge status="mlc_tat_warning" label={`${formatDuration(diffMs)} left`} />;
  }
  return <StatusBadge status="mlc_tat_ok" label={`${formatDuration(diffMs)} left`} />;
}

const CASE_TYPE_LABELS: Record<string, string> = {
  road_accident: "Road Traffic Accident",
  assault: "Assault / Violence",
  poisoning: "Poisoning",
  burns: "Burns",
  fall: "Fall from Height",
  sexual_assault: "Sexual Assault",
  other: "Other",
};

interface Props {
  hospitalId: string;
}

const MLCRegisterTab: React.FC<Props> = ({ hospitalId }) => {
  const [cases, setCases] = useState<MLCCase[]>([]);
  const [notifications, setNotifications] = useState<Map<string, MLCNotification>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [caseTypeFilter, setCaseTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // Re-render every minute so "time remaining" ticks down without a refetch — the underlying
  // deadline doesn't change between fetches, only how close "now" is to it.
  const [, setTick] = useState(0);

  const fetchCases = useCallback(async () => {
    if (!hospitalId) return;
    setLoading(true);

    let query = (supabase as any)
      .from("mlc_cases")
      .select("id, mlc_number, case_type, incident_date, incident_place, police_station, police_informed, fir_number, created_at, ed_visit_id, admission_id, patient:patients(full_name, uhid), ed_visit:ed_visits(triage_category)")
      .eq("hospital_id", hospitalId)
      .order("created_at", { ascending: false });

    if (caseTypeFilter !== "all") {
      query = query.eq("case_type", caseTypeFilter);
    }
    if (dateFrom) {
      query = query.gte("created_at", dateFrom);
    }
    if (dateTo) {
      query = query.lte("created_at", dateTo + "T23:59:59");
    }

    const { data, error } = await query;
    const rows: MLCCase[] = error ? [] : (data || []);
    setCases(rows);

    // Second query: mlc_police_notifications is the canonical clock (6h-from-designation,
    // corrected by 20261108000006) — never derive the TAT from mlc_cases.created_at, which is
    // form-submission time, not MLC-designation time. Scoped to the union of this register's
    // ed_visit_id / admission_id values; mortuary-sourced MLC cases aren't in mlc_cases at all
    // (they live in mlc_records, a separate register — see note below) so there's nothing to
    // fetch for a source_table of 'mortuary_admissions' here.
    const edVisitIds = rows.map((r) => r.ed_visit_id).filter((v): v is string => !!v);
    const admissionIds = rows.map((r) => r.admission_id).filter((v): v is string => !!v);
    const notifMap = new Map<string, MLCNotification>();

    if (edVisitIds.length > 0 || admissionIds.length > 0) {
      const orClauses: string[] = [];
      if (edVisitIds.length > 0) orClauses.push(`and(source_table.eq.ed_visits,source_id.in.(${edVisitIds.join(",")}))`);
      if (admissionIds.length > 0) orClauses.push(`and(source_table.eq.admissions,source_id.in.(${admissionIds.join(",")}))`);

      const { data: notifData, error: notifError } = await (supabase as any)
        .from("mlc_police_notifications")
        .select("source_table, source_id, status, notification_deadline, informed_at")
        .eq("hospital_id", hospitalId)
        .or(orClauses.join(","));

      if (!notifError) {
        for (const n of (notifData || []) as MLCNotification[]) {
          notifMap.set(`${n.source_table}:${n.source_id}`, n);
        }
      }
    }
    setNotifications(notifMap);

    setLoading(false);
  }, [hospitalId, caseTypeFilter, dateFrom, dateTo]);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  const notificationFor = useCallback((c: MLCCase): MLCNotification | null => {
    if (c.ed_visit_id) {
      const hit = notifications.get(`ed_visits:${c.ed_visit_id}`);
      if (hit) return hit;
    }
    if (c.admission_id) {
      const hit = notifications.get(`admissions:${c.admission_id}`);
      if (hit) return hit;
    }
    return null;
  }, [notifications]);

  const filtered = search
    ? cases.filter((c) =>
        c.mlc_number.toLowerCase().includes(search.toLowerCase()) ||
        (c.patient?.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (c.patient?.uhid || "").toLowerCase().includes(search.toLowerCase()) ||
        (c.police_station || "").toLowerCase().includes(search.toLowerCase()) ||
        (c.fir_number || "").toLowerCase().includes(search.toLowerCase())
      )
    : cases;

  const handlePrintRegister = async () => {
    const { data: hospital } = await supabase.from("hospitals").select("name, address").eq("id", hospitalId).maybeSingle();

    const rows = filtered.map((c, idx) => `
      <tr>
        <td style="text-align:center">${idx + 1}</td>
        <td><b>${c.mlc_number}</b></td>
        <td>${c.patient?.full_name || "—"}<br><span style="font-size:10px;color:#64748b">${c.patient?.uhid || ""}</span></td>
        <td>${CASE_TYPE_LABELS[c.case_type] || c.case_type}</td>
        <td>${c.incident_date ? new Date(c.incident_date).toLocaleDateString("en-IN") : "—"}</td>
        <td>${c.incident_place || "—"}</td>
        <td>${c.police_station || "—"}</td>
        <td>${c.fir_number || "—"}</td>
        <td style="text-align:center">
          <span style="padding:2px 6px;border-radius:4px;font-size:10px;background:${c.police_informed ? "#dcfce7" : "#fee2e2"};color:${c.police_informed ? "#15803d" : "#dc2626"}">
            ${c.police_informed ? "Yes" : "No"}
          </span>
        </td>
        <td style="font-size:10px">${new Date(c.created_at).toLocaleDateString("en-IN")}</td>
      </tr>
    `).join("");

    const body = `
      ${printHeader(hospital?.name || "Hospital", "MLC REGISTER", `<p style="font-size:12px">${hospital?.address || ""}</p><p style="font-size:11px;color:#64748b">Generated: ${new Date().toLocaleString("en-IN")} — Total: ${filtered.length} cases</p>`)}
      <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:10px">
        <thead>
          <tr style="background:#1e293b;color:white">
            <th style="padding:6px 4px">#</th>
            <th style="padding:6px 4px">MLC No.</th>
            <th style="padding:6px 4px">Patient</th>
            <th style="padding:6px 4px">Case Type</th>
            <th style="padding:6px 4px">Incident Date</th>
            <th style="padding:6px 4px">Place</th>
            <th style="padding:6px 4px">Police Station</th>
            <th style="padding:6px 4px">FIR No.</th>
            <th style="padding:6px 4px">Police Informed</th>
            <th style="padding:6px 4px">Registered</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:40px;display:flex;justify-content:space-between;padding-top:20px;border-top:1px solid #e2e8f0;">
        <div style="text-align:center;width:40%"><div style="border-top:1px solid #334155;padding-top:4px;font-size:11px;color:#64748b">MRD Officer Signature</div></div>
        <div style="text-align:center;width:40%"><div style="border-top:1px solid #334155;padding-top:4px;font-size:11px;color:#64748b">Medical Superintendent Signature</div></div>
      </div>`;

    printDocument(`MLC_Register_${new Date().toISOString().slice(0, 10)}`, body);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 p-3 border-b border-border flex-shrink-0 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search MLC no., patient, FIR…"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Select value={caseTypeFilter} onValueChange={setCaseTypeFilter}>
          <SelectTrigger className="h-8 text-sm w-48">
            <SelectValue placeholder="All case types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Case Types</SelectItem>
            {Object.entries(CASE_TYPE_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-sm w-36" placeholder="From" />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-sm w-36" placeholder="To" />
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-sm" onClick={handlePrintRegister} disabled={filtered.length === 0}>
          <Printer className="h-3.5 w-3.5" /> Print Register
        </Button>
        <span className="text-[11px] text-muted-foreground">{filtered.length} case{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Loading MLC cases…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center gap-2">
            <span className="text-2xl">⚖️</span>
            <p className="text-sm text-muted-foreground">No MLC cases found</p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-muted/80">
              <tr>
                <th className="text-left px-3 py-2 text-[11px] font-bold uppercase text-muted-foreground whitespace-nowrap">MLC No.</th>
                <th className="text-left px-3 py-2 text-[11px] font-bold uppercase text-muted-foreground">Patient</th>
                <th className="text-left px-3 py-2 text-[11px] font-bold uppercase text-muted-foreground">Case Type</th>
                <th className="text-left px-3 py-2 text-[11px] font-bold uppercase text-muted-foreground whitespace-nowrap">Incident Date</th>
                <th className="text-left px-3 py-2 text-[11px] font-bold uppercase text-muted-foreground">Place</th>
                <th className="text-left px-3 py-2 text-[11px] font-bold uppercase text-muted-foreground">Police Station</th>
                <th className="text-left px-3 py-2 text-[11px] font-bold uppercase text-muted-foreground">FIR No.</th>
                <th className="text-center px-3 py-2 text-[11px] font-bold uppercase text-muted-foreground whitespace-nowrap">Police Informed</th>
                <th className="text-left px-3 py-2 text-[11px] font-bold uppercase text-muted-foreground whitespace-nowrap">Police Intimation TAT</th>
                <th className="text-left px-3 py-2 text-[11px] font-bold uppercase text-muted-foreground whitespace-nowrap">Registered On</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-[12px] font-bold text-red-700">{c.mlc_number}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-foreground">{c.patient?.full_name || "—"}</p>
                    <p className="text-[10px] text-muted-foreground">{c.patient?.uhid || ""}</p>
                  </td>
                  <td className="px-3 py-2.5 text-sm">{CASE_TYPE_LABELS[c.case_type] || c.case_type}</td>
                  <td className="px-3 py-2.5 text-sm whitespace-nowrap">
                    {c.incident_date ? new Date(c.incident_date).toLocaleDateString("en-IN") : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-sm max-w-[140px] truncate">{c.incident_place || "—"}</td>
                  <td className="px-3 py-2.5 text-sm">{c.police_station || "—"}</td>
                  <td className="px-3 py-2.5 text-sm font-mono">{c.fir_number || "—"}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${c.police_informed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {c.police_informed ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {renderMlcTat(notificationFor(c))}
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-muted-foreground whitespace-nowrap">
                    {new Date(c.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default MLCRegisterTab;
