/**
 * QuickScribeConsentModal — the DPDP s.5 notice and s.6 consent, taken before the microphone opens.
 *
 * ── Why it gates Record rather than Print ──────────────────────────────────────────────────
 *
 * Consent has to precede collection, and collection is the microphone turning on. By the time the
 * doctor reaches Print the audio has already been captured, already left the hospital, and already
 * been transcribed by a third party. A consent recorded at that point authorises processing that
 * has finished, which is not consent — it is a receipt.
 *
 * ── Whose signature this is ────────────────────────────────────────────────────────────────
 *
 * The doctor's attestation, not the patient's. There is no patient-facing device on this screen —
 * the whole premise of Quick Scribe is that the patient never goes near a terminal — so asking for
 * a patient e-signature here would produce a signature the patient never saw. What is recorded is
 * a named clinician stating that they read the notice out and the patient agreed, which is what a
 * verbal consent record is in every other setting.
 *
 * Mechanics (attestation gate, content snapshot, tamper hash, NABH PRE.1 evidence) follow
 * ConsentSignatureModal.tsx:87-123. The deliberate divergence is that no patient identity is
 * written anywhere here, including the NABH evidence line — at consent time the name box is often
 * still empty, and a consent record is not a place to start collecting identifiers.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Mic, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logNABHEvidence } from "@/lib/nabh-evidence";
import { sha256hex } from "@/lib/apiPlatform";
import { fetchHospitalBrand } from "@/lib/printUtils";
import {
  QS_CONSENT_VERSION,
  QS_CONSENT_PURPOSE,
  buildQuickScribeConsentText,
  buildQuickScribeConsentHashInput,
} from "@/lib/quickScribeConsent";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** What the page keeps once consent is taken — enough to stamp the note and the printout. */
export interface QuickScribeConsent {
  id: string;
  version: string;
  obtainedAt: string;
}

interface Props {
  open: boolean;
  hospitalId: string;
  doctorId: string;
  onClose: () => void;
  onConsented: (consent: QuickScribeConsent) => void;
}

const QuickScribeConsentModal: React.FC<Props> = ({
  open,
  hospitalId,
  doctorId,
  onClose,
  onConsented,
}) => {
  const { toast } = useToast();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hospitalName, setHospitalName] = useState("");
  const [disclosureVersion, setDisclosureVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Reset on every open: a consent screen that opens pre-ticked is not a consent screen.
  useEffect(() => {
    if (open) setAgreed(false);
  }, [open]);

  useEffect(() => {
    if (!open || !hospitalId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      // fetchHospitalBrand also warms the brand cache the print path reads later, so this is not
      // a duplicate round trip.
      const brand = await fetchHospitalBrand(supabase, hospitalId);

      // Newest PUBLISHED disclosure. Drafts are invisible to hospitals by design
      // (20261110000000: is_published), so citing one would quote a document the patient
      // cannot be shown.
      const { data, error } = await (supabase as any)
        .from("ai_processing_disclosure")
        .select("version")
        .eq("is_published", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      // Supabase returns errors as values. A missing disclosure is a normal state — the consent
      // text simply omits the citation — so this degrades silently rather than blocking consent.
      if (error) console.warn("AI processing disclosure lookup failed:", error.message);

      setHospitalName(brand?.name || "");
      setDisclosureVersion(data?.version ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, hospitalId]);

  const consentText = buildQuickScribeConsentText({ hospitalName, disclosureVersion });

  const handleConfirm = useCallback(async () => {
    if (!agreed || !hospitalId || !doctorId) return;
    setSaving(true);
    try {
      const obtainedAt = new Date().toISOString();
      const hash = await sha256hex(
        buildQuickScribeConsentHashInput({
          version: QS_CONSENT_VERSION,
          hospitalId,
          doctorId,
          obtainedAt,
        }),
      );

      const { data, error } = await (supabase as any)
        .from("quick_scribe_consents")
        .insert({
          hospital_id: hospitalId,
          terms_version: QS_CONSENT_VERSION,
          purpose: QS_CONSENT_PURPOSE,
          // Snapshot, not a reference: the wording must survive a later edit to the builder.
          consent_text: consentText,
          disclosure_version: disclosureVersion,
          signature_hash: hash,
          obtained_by: doctorId,
          obtained_at: obtainedAt,
        })
        .select("id")
        .maybeSingle();

      // Hard-fail here, unlike most Supabase reads in this app. If the consent row did not
      // persist, recording anyway would put us back exactly where this feature started.
      if (error || !data?.id) {
        toast({
          title: "Could not record consent",
          description: error?.message || "The consent was not saved, so recording cannot start.",
          variant: "destructive",
        });
        return;
      }

      // NABH PRE.1 — patient rights and informed consent. No patient identifier: at this point
      // there often is not one, and a consent record is not where identity collection should begin.
      await logNABHEvidence(
        hospitalId,
        "PRE.1",
        `Quick Scribe recording consent obtained (${QS_CONSENT_VERSION}) before audio capture, ` +
          `attested by the consulting doctor, hash: ${hash.substring(0, 16)}…`,
        "compliant",
      );

      onConsented({ id: data.id, version: QS_CONSENT_VERSION, obtainedAt });
    } catch (e) {
      toast({
        title: "Could not record consent",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [agreed, hospitalId, doctorId, consentText, disclosureVersion, onConsented, toast]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Before you record
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Read this to the patient in the language they speak.
            </p>

            {/* 14px minimum: this is the text a doctor reads aloud to a patient, which puts it
                squarely inside the Clarity rule. */}
            <div className="max-h-[320px] overflow-y-auto rounded-md border border-border bg-muted/30 p-3 text-sm leading-relaxed whitespace-pre-line">
              {consentText}
            </div>

            <label className="flex items-start gap-2.5 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 flex-shrink-0 accent-primary"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span>
                I have explained this to the patient and they have <strong>agreed</strong> to the
                consultation being recorded.
              </span>
            </label>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Patient refused
              </Button>
              <Button onClick={handleConfirm} disabled={!agreed || saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Mic className="h-4 w-4 mr-1.5" />
                )}
                Record consent &amp; continue
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default QuickScribeConsentModal;
