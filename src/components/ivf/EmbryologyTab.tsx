import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useHospitalId } from "@/hooks/useHospitalId";
import { logNABHEvidence } from "@/lib/nabh-evidence";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Save } from "lucide-react";

// Real table is `embryology_records` (hospital_id, cycle_id, embryo_id, oocyte_maturity,
// fertilization_status, day3_grade, blast_grade, disposition, ...) — verified against
// supabase/migrations/20260330090552_8f181820-6667-4345-ae68-d4aed2b4e34e.sql and
// src/integrations/supabase/types.ts. No new columns/tables invented.
interface EmbryoRecord {
  id: string; // real UUID once persisted, a temp client id before first save
  isNew: boolean;
  embryo_id: string;
  oocyte_maturity: string;
  fertilization_status: string;
  day3_grade: string;
  blast_grade: string;
  disposition: "active" | "transferred" | "frozen" | "discarded";
}

interface IvfCycleOption {
  id: string;
  cycle_type: string;
  start_date: string;
}

// No props — hospitalId/userId come from the hook, same as the other IVF tabs
// (CouplesTab, AndrologyTab, ICMRComplianceTab). IVFPage.tsx mounts this with no props.
type Props = object;

const emptyEmbryo = (embryoId: string): EmbryoRecord => ({
  id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  isNew: true,
  embryo_id: embryoId,
  oocyte_maturity: "",
  fertilization_status: "",
  day3_grade: "",
  blast_grade: "",
  disposition: "active",
});

const EmbryologyTab: React.FC<Props> = () => {
  const { toast } = useToast();
  const { hospitalId } = useHospitalId();
  const [cycles, setCycles] = useState<IvfCycleOption[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState("");
  const [embryos, setEmbryos] = useState<EmbryoRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Same active-cycle picker pattern as StimulationTab.tsx.
  useEffect(() => {
    if (!hospitalId) return;
    supabase
      .from("ivf_cycles")
      .select("id, cycle_type, start_date, status")
      .eq("hospital_id", hospitalId)
      .not("status", "in", '("positive","negative","cancelled")')
      .order("start_date", { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error(error);
        setCycles(data || []);
      });
  }, [hospitalId]);

  const loadEmbryos = useCallback(async () => {
    if (!selectedCycleId) { setEmbryos([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("embryology_records")
      .select("*")
      .eq("cycle_id", selectedCycleId)
      .order("embryo_id");
    if (error) {
      console.error(error);
      toast({ title: "Failed to load embryo records", description: error.message, variant: "destructive" });
      setEmbryos([]);
      setLoading(false);
      return;
    }
    setEmbryos((data || []).map((r: any) => ({
      id: r.id,
      isNew: false,
      embryo_id: r.embryo_id,
      oocyte_maturity: r.oocyte_maturity || "",
      fertilization_status: r.fertilization_status || "",
      day3_grade: r.day3_grade || "",
      blast_grade: r.blast_grade || "",
      disposition: (r.disposition as EmbryoRecord["disposition"]) || "active",
    })));
    setLoading(false);
  }, [selectedCycleId, toast]);

  useEffect(() => { loadEmbryos(); }, [loadEmbryos]);

  const addEmbryo = () => {
    const newNum = `E-${String(embryos.length + 1).padStart(2, "0")}`;
    setEmbryos([...embryos, emptyEmbryo(newNum)]);
  };

  const updateEmbryo = (index: number, field: keyof EmbryoRecord, value: string) => {
    const updated = [...embryos];
    updated[index] = { ...updated[index], [field]: value } as EmbryoRecord;
    setEmbryos(updated);
  };

  const handleSaveRecords = async () => {
    if (!hospitalId) { toast({ title: "Hospital context not ready", variant: "destructive" }); return; }
    if (!selectedCycleId) { toast({ title: "Select an IVF cycle first", variant: "destructive" }); return; }
    if (embryos.length === 0) { toast({ title: "No embryo records to save" }); return; }

    setSaving(true);
    let failed = 0;
    for (const e of embryos) {
      const payload = {
        hospital_id: hospitalId,
        cycle_id: selectedCycleId,
        embryo_id: e.embryo_id,
        oocyte_maturity: e.oocyte_maturity || null,
        fertilization_status: e.fertilization_status || null,
        day3_grade: e.day3_grade || null,
        blast_grade: e.blast_grade || null,
        disposition: e.disposition,
      };
      const { error } = e.isNew
        ? await supabase.from("embryology_records").insert(payload)
        : await supabase.from("embryology_records").update(payload).eq("id", e.id);
      if (error) { console.error(error); failed += 1; }
    }

    if (failed > 0) {
      toast({ title: `${failed} embryo record(s) failed to save`, variant: "destructive" });
    } else {
      toast({ title: "Embryo records saved", description: `${embryos.length} record(s) persisted for this cycle.` });
      // ICMR ART Act 2021 requires embryo records to be retained — log the NABH evidence trail
      // for this clinical documentation event (clinical-pod hard rule: never skip this on a
      // clinical action).
      await logNABHEvidence(
        hospitalId,
        "COP.1",
        `Embryology records documented for IVF cycle ${selectedCycleId}: ${embryos.length} embryo(s) tracked (ICMR ART Act 2021 retention).`,
        "compliant",
      );
    }
    setSaving(false);
    await loadEmbryos();
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "transferred": return "default";
      case "frozen": return "secondary";
      case "discarded": return "destructive";
      default: return "outline"; // active
    }
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-semibold text-foreground">Embryo Development Tracking (Day 0 - Day 6)</h2>
        <div className="flex items-center gap-2">
          <Select value={selectedCycleId} onValueChange={setSelectedCycleId}>
            <SelectTrigger className="h-8 w-56 text-[13px]"><SelectValue placeholder="Select active cycle" /></SelectTrigger>
            <SelectContent>
              {cycles.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.cycle_type.toUpperCase()} — {c.start_date}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={addEmbryo} disabled={!selectedCycleId}>
            <Plus className="w-4 h-4 mr-2" /> Add Oocyte
          </Button>
          <Button size="sm" onClick={handleSaveRecords} disabled={saving || !selectedCycleId || embryos.length === 0}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            {saving ? "Saving…" : "Save Records"}
          </Button>
        </div>
      </div>

      <div className="border rounded-md flex-1 overflow-y-auto bg-card">
        <Table>
          <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
            <TableRow>
              <TableHead className="w-20 text-[14px]">ID</TableHead>
              <TableHead className="text-[14px]">Day 0 (Oocyte)</TableHead>
              <TableHead className="text-[14px]">Day 1 (Fertilization)</TableHead>
              <TableHead className="text-[14px]">Day 3 (Cleavage)</TableHead>
              <TableHead className="text-[14px]">Day 5/6 (Blastocyst)</TableHead>
              <TableHead className="w-36 text-[14px]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!selectedCycleId ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-[14px]">
                  Select an active IVF cycle to view or enter embryo records.
                </TableCell>
              </TableRow>
            ) : loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-[14px]">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading…
                </TableCell>
              </TableRow>
            ) : embryos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-[14px]">
                  No oocytes tracked yet for this cycle. Click "Add Oocyte" to begin.
                </TableCell>
              </TableRow>
            ) : (
              embryos.map((embryo, idx) => (
                <TableRow key={embryo.id}>
                  <TableCell className="font-mono text-[14px] font-medium">{embryo.embryo_id}</TableCell>
                  <TableCell>
                    <Select value={embryo.oocyte_maturity} onValueChange={(v) => updateEmbryo(idx, "oocyte_maturity", v)}>
                      <SelectTrigger className="h-8 text-[14px] w-full"><SelectValue placeholder="Stage" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MII">MII (Mature)</SelectItem>
                        <SelectItem value="MI">MI (Immature)</SelectItem>
                        <SelectItem value="GV">GV (Germinal Vesicle)</SelectItem>
                        <SelectItem value="Degenerate">Degenerate</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select value={embryo.fertilization_status} onValueChange={(v) => updateEmbryo(idx, "fertilization_status", v)}>
                      <SelectTrigger className="h-8 text-[14px] w-full"><SelectValue placeholder="Check PN" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2PN">2PN (Normal)</SelectItem>
                        <SelectItem value="1PN">1PN (Abnormal)</SelectItem>
                        <SelectItem value="3PN">3PN (Abnormal)</SelectItem>
                        <SelectItem value="0PN">0PN (Failed)</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-8 text-[14px]"
                      placeholder="e.g. 8C, Gr 1"
                      value={embryo.day3_grade}
                      onChange={(e) => updateEmbryo(idx, "day3_grade", e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-8 text-[14px]"
                      placeholder="Gardner (e.g. 4AA)"
                      value={embryo.blast_grade}
                      onChange={(e) => updateEmbryo(idx, "blast_grade", e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Select value={embryo.disposition} onValueChange={(v) => updateEmbryo(idx, "disposition", v)}>
                      <SelectTrigger className="h-8 text-[13px] font-medium w-full border-none bg-transparent focus:ring-0">
                        <Badge variant={getStatusBadgeVariant(embryo.disposition)} className="capitalize px-2 py-0.5 rounded-sm whitespace-nowrap">
                          {embryo.disposition}
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active (Culture)</SelectItem>
                        <SelectItem value="transferred">Transferred</SelectItem>
                        <SelectItem value="frozen">Frozen (Cryobank)</SelectItem>
                        <SelectItem value="discarded">Discarded</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default EmbryologyTab;
