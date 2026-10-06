/**
 * Settings → Patient Credit / Pay Later.
 *
 * Lets a hospital opt into offering "Pay Later" for OPD Laboratory and Radiology
 * orders — a patient who cannot pay at the counter still gets the order created
 * today, with the amount owed collected later through the existing Billing →
 * Pending Collections screen.
 *
 * Off by default: absence of this settings row must mean "nothing changed" for
 * the Collect Payment modal, not a new behaviour appearing unannounced on the
 * busiest OPD path in the product — see patientCreditGate.ts's header.
 *
 * SECURITY NOTE: hospital_settings has no per-role RLS — any authenticated user of
 * the hospital can write any key via PostgREST. The route guard (RG path="/settings")
 * is the only thing keeping this page to settings-permitted staff; the toggle is not
 * itself enforcement. The actual gate lives client-side in lib/patientCreditGate.ts
 * and the two Collect Payment modals that read it.
 */

import React from "react";
import SettingsPageWrapper from "@/components/settings/SettingsPageWrapper";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useHospitalId } from "@/hooks/useHospitalId";
import { APP_ROLES } from "@/lib/appRoles";
import {
  DEFAULT_PATIENT_CREDIT_POLICY,
  PATIENT_CREDIT_POLICY_KEY,
  PatientCreditPolicy,
  fetchPatientCreditPolicy,
  serialisePatientCreditPolicy,
} from "@/lib/patientCreditGate";

const SettingsPatientCreditPaymentPage: React.FC = () => {
  const { toast } = useToast();
  const { hospitalId } = useHospitalId();
  const queryClient = useQueryClient();

  const { data: policy = DEFAULT_PATIENT_CREDIT_POLICY } = useQuery({
    queryKey: ["patient-credit-policy", hospitalId],
    queryFn: () => fetchPatientCreditPolicy(hospitalId!),
    enabled: !!hospitalId,
  });

  const save = useMutation({
    mutationFn: async (next: PatientCreditPolicy) => {
      const { error } = await (supabase as any).from("hospital_settings").upsert({
        hospital_id: hospitalId!,
        key: PATIENT_CREDIT_POLICY_KEY,
        value: serialisePatientCreditPolicy(next),
        updated_at: new Date().toISOString(),
      }, { onConflict: "hospital_id,key" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-credit-policy"] });
      toast({ title: "Saved" });
    },
    onError: (err: any) => toast({ title: "Failed to save", description: err.message, variant: "destructive" }),
  });

  const update = (mutate: (p: PatientCreditPolicy) => PatientCreditPolicy) => save.mutate(mutate(policy));

  const toggleApproverRole = (value: string) => {
    const has = policy.approverRoles.includes(value);
    const next = has
      ? policy.approverRoles.filter((r) => r !== value)
      : [...policy.approverRoles, value];
    // Refuse to save an empty approver list — an above-cap grant must always have
    // someone who can clear it, or the counter is stuck with no way forward.
    if (next.length === 0) return;
    update((p) => ({ ...p, approverRoles: next }));
  };

  return (
    <SettingsPageWrapper title="Patient Credit / Pay Later" hideSave>
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Let billing staff create an OPD lab or radiology order today and collect payment
          later, when a patient cannot pay at the counter. The order is created immediately;
          the amount owed shows up in Billing → Pending Collections until it is paid.
        </p>

        <div className="border border-border rounded-lg p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold">Allow Pay Later</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Adds a "Credit / Pay Later" option to the Collect Payment step in the lab and
                radiology order screens. Off by default — no change to those screens until
                this is turned on.
              </p>
            </div>
            <Switch
              checked={policy.enabled}
              onCheckedChange={(v) => update((p) => ({ ...p, enabled: v }))}
            />
          </div>
        </div>

        {policy.enabled && (
          <>
            <div className="border border-border rounded-lg p-4 space-y-2">
              <Label className="text-xs">Per-transaction cap (₹)</Label>
              <p className="text-xs text-muted-foreground">
                Below this amount, any billing staff can grant Pay Later with a typed reason.
                Above it, a supervisor must re-authenticate with their own password before the
                order is created.
              </p>
              <Input
                type="number"
                min={0}
                step={100}
                className="h-8 w-40"
                defaultValue={policy.perTransactionCap}
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n >= 0 && n !== policy.perTransactionCap)
                    update((p) => ({ ...p, perTransactionCap: n }));
                }}
              />
            </div>

            <div className="border border-border rounded-lg p-4 space-y-3">
              <div>
                <Label className="text-xs">Roles that can approve an above-cap grant</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  At least one role must stay selected.
                </p>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {APP_ROLES.map((r) => (
                  <label key={r.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={policy.approverRoles.includes(r.value)}
                      onChange={() => toggleApproverRole(r.value)}
                    />
                    {r.label}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </SettingsPageWrapper>
  );
};

export default SettingsPatientCreditPaymentPage;
