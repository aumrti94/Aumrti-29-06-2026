import React, { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { fetchPatientOutstandingBalance } from "@/lib/outstandingBalance";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PendingCollectionsPanel from "@/components/billing/PendingCollectionsPanel";

interface Props {
  patientId: string | null | undefined;
  hospitalId: string | null | undefined;
  /** "dark" matches EmergencyRegistrationModal's dark-themed form; "light" matches the usual card-based modals. */
  variant?: "light" | "dark";
}

/**
 * Advisory note: "₹X outstanding from N other visit(s)". Never blocks registration/
 * billing — purely informational — but is clickable: staff looking at this patient
 * anywhere in the app (registration, admission, patient profile) can collect the
 * outstanding amount in place, in one step, rather than being sent to hunt for it in
 * the general Billing → Pending Collections worklist.
 */
const OutstandingBalanceBanner: React.FC<Props> = ({ patientId, hospitalId, variant = "light" }) => {
  const [summary, setSummary] = useState<{ totalOutstanding: number; billCount: number } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!patientId || !hospitalId) { setSummary(null); return; }
    fetchPatientOutstandingBalance(patientId, hospitalId).then(setSummary);
  }, [patientId, hospitalId]);

  if (!summary || summary.totalOutstanding <= 0) return null;

  const message = `₹${summary.totalOutstanding.toLocaleString("en-IN")} outstanding from ${summary.billCount} other visit${summary.billCount !== 1 ? "s" : ""}`;

  return (
    <>
      {variant === "dark" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 w-full flex items-center gap-1.5 rounded-md border border-orange-600/50 p-2 text-left hover:brightness-110 transition-[filter]"
          style={{ background: "rgba(234,88,12,0.12)" }}
        >
          <AlertTriangle size={12} className="text-amber-400 shrink-0" />
          <span className="text-[11px] text-amber-400 font-medium">{message}</span>
          <span className="ml-auto text-[10px] text-amber-300 underline underline-offset-2 shrink-0">Collect</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-1.5 rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-900 px-3 py-2 text-left hover:bg-amber-100 dark:hover:bg-amber-950/30 transition-colors"
        >
          <AlertTriangle size={13} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-xs text-amber-800 dark:text-amber-400 font-medium">{message}</span>
          <span className="ml-auto text-[11px] text-amber-700 dark:text-amber-400 underline underline-offset-2 shrink-0">Collect</span>
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Outstanding — this patient</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {patientId && <PendingCollectionsPanel patientId={patientId} />}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default OutstandingBalanceBanner;
