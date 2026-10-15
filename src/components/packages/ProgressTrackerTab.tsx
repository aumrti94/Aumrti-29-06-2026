import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { callAI } from "@/lib/aiProvider";
import { FileText, Download, MessageSquare, Loader2 } from "lucide-react";
import { useHospitalId } from '@/hooks/useHospitalId';
import { fetchHospitalBrand, printHeader, printDocument } from "@/lib/printUtils";
import { sendWhatsApp } from "@/lib/whatsapp-send";

export default function ProgressTrackerTab() {
  const { hospitalId } = useHospitalId();
  const [bookings, setBookings] = useState<any[]>([]);
  const [generating, setGenerating] = useState<string | null>(null);
  const [reports, setReports] = useState<Record<string, string>>({});
  const [sendingWhatsApp, setSendingWhatsApp] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("package_bookings")
      .select("*, health_packages(package_name), patients(full_name, uhid, dob, gender, phone)")
      .eq("hospital_id", hospitalId)
      .in("status", ["awaiting_report", "completed"])
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setBookings(data || []));
  }, [hospitalId]);

  const generateReport = async (booking: any) => {
    setGenerating(booking.id);
    try {
      const patient = booking.patients;
      const age = patient?.dob
        ? Math.floor((Date.now() - new Date(patient.dob).getTime()) / 31557600000)
        : "N/A";

      const response = await callAI({
        featureKey: "ai_digest",
        hospitalId: hospitalId,
        prompt: `Generate a professional health report summary for a preventive health checkup patient.

Patient: ${patient?.full_name}, Age: ${age}, Gender: ${patient?.gender || "N/A"}
Package: ${booking.health_packages?.package_name}
Date: ${booking.scheduled_date}

Write a doctor-friendly health report summary:
1. Overall health status (Excellent/Good/Fair/Poor)
2. Key findings (normal values to reassure, abnormal to highlight)
3. Risk factors identified
4. Recommendations (lifestyle, follow-up tests, specialist referrals)
5. Next checkup: recommended in N months

Keep language professional but accessible. Max 300 words.`,
        maxTokens: 400,
      });

      if (response.error) {
        toast.error(response.error);
        return;
      }

      if (!response.text) {
        toast.error("No report text generated. Check AI provider configuration.");
        return;
      }

      setReports((prev) => ({ ...prev, [booking.id]: response.text }));

      await supabase.from("package_bookings").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", booking.id);
      toast.success("Report generated successfully");
    } catch (e) {
      toast.error("Failed to generate report");
    } finally {
      setGenerating(null);
    }
  };

  const downloadReport = async (booking: any) => {
    const report = reports[booking.id];
    if (!report) {
      toast.error("No report available to download yet");
      return;
    }
    if (!hospitalId) {
      toast.error("Missing hospital context");
      return;
    }
    const patient = booking.patients;
    const age = patient?.dob
      ? Math.floor((Date.now() - new Date(patient.dob).getTime()) / 31557600000)
      : "N/A";
    const scheduledDate = booking.scheduled_date
      ? new Date(booking.scheduled_date).toLocaleDateString("en-IN")
      : "N/A";

    const brand = await fetchHospitalBrand(supabase, hospitalId);
    const body = `
${printHeader(brand.name, "Preventive Health Checkup Report")}
<div class="section-title">Patient Details</div>
<div class="row"><span class="label">Name</span><span>${patient?.full_name ?? "—"}</span></div>
<div class="row"><span class="label">UHID</span><span>${patient?.uhid ?? "—"}</span></div>
<div class="row"><span class="label">Age / Gender</span><span>${age} / ${patient?.gender ?? "N/A"}</span></div>
<div class="row"><span class="label">Package</span><span>${booking.health_packages?.package_name ?? "—"}</span></div>
<div class="row"><span class="label">Checkup Date</span><span>${scheduledDate}</span></div>
<div class="section-title">Health Report Summary</div>
<pre>${report}</pre>
`;
    printDocument(`Health Report — ${patient?.full_name ?? "Patient"}`, body);
  };

  const whatsAppReport = async (booking: any) => {
    const report = reports[booking.id];
    if (!report) {
      toast.error("No report available to send yet");
      return;
    }
    const patient = booking.patients;
    if (!patient?.phone) {
      toast.error("No phone number on file for this patient");
      return;
    }
    if (!hospitalId) {
      toast.error("Missing hospital context");
      return;
    }
    setSendingWhatsApp(booking.id);
    try {
      const scheduledDate = booking.scheduled_date
        ? new Date(booking.scheduled_date).toLocaleDateString("en-IN")
        : "N/A";
      const message = `Hello ${patient.full_name}, your health report for the "${booking.health_packages?.package_name ?? "package"}" checkup on ${scheduledDate} is ready.\n\n${report}\n\nPlease consult your doctor for any follow-up recommended above.`;
      const cleanPhone = String(patient.phone).replace(/\D/g, "");
      const fullPhone = cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`;
      await sendWhatsApp({ hospitalId, phone: fullPhone, message });
      toast.success("Report sent via WhatsApp");
    } catch (e) {
      toast.error("Failed to send report via WhatsApp");
    } finally {
      setSendingWhatsApp(null);
    }
  };

  return (
    <div className="space-y-4">
      {bookings.length === 0 && <p className="text-center text-muted-foreground py-8">No bookings awaiting report</p>}
      {bookings.map((b) => {
        const patient = b.patients;
        const report = reports[b.id];
        return (
          <Card key={b.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{patient?.full_name} — {b.health_packages?.package_name}</CardTitle>
                <Badge variant={b.status === "completed" ? "default" : "secondary"}>{b.status.replace("_", " ")}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">UHID: {patient?.uhid} • Scheduled: {b.scheduled_date}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {report && (
                <div className="bg-muted/50 rounded-md p-3 text-sm whitespace-pre-wrap border">{report}</div>
              )}
              <div className="flex gap-2">
                {b.status === "awaiting_report" && (
                  <Button size="sm" onClick={() => generateReport(b)} disabled={generating === b.id}>
                    {generating === b.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
                    Generate Health Report
                  </Button>
                )}
                {(b.status === "completed" || report) && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadReport(b)}
                      disabled={!report}
                      title={!report ? "Report text isn't loaded in this session — reopen or regenerate it to download" : undefined}
                    >
                      <Download className="h-4 w-4 mr-1" /> Download Report
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => whatsAppReport(b)}
                      disabled={!report || sendingWhatsApp === b.id}
                      title={!report ? "Report text isn't loaded in this session — reopen or regenerate it to send" : undefined}
                    >
                      {sendingWhatsApp === b.id ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <MessageSquare className="h-4 w-4 mr-1" />
                      )}
                      WhatsApp to Patient
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
