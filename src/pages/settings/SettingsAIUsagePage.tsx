/**
 * AI Usage & Data Processing — the hospital's own, read-only view of what its AI
 * actually did and where that data went.
 *
 * WHY THIS SCREEN EXISTS
 * ----------------------
 * Hospitals asking to "manage our own API configuration" are usually asking
 * something narrower: *which of our workflows send patient data out, how often,
 * to whom, and under what contract*. /settings/plan already answers "how much"
 * with a single monthly total and stops there. This answers the rest.
 *
 * DELIBERATELY READ-ONLY. There is no key field, no provider dropdown and no
 * save button, because none of those is what the question was. Configuration
 * ownership is a separate, much larger piece of work with its own commercial and
 * clinical gates; this screen must not grow into a half-built version of it.
 *
 * THE DISCLOSURE IS A CURATED ARTEFACT, NOT A LIVE CONFIG READ. It comes from
 * ai_processing_disclosure — authored, versioned and published by Aumrti — not
 * from platform_ai_provider_config. A live model string changes without notice
 * and a hospital's DPDP officer would reasonably treat whatever is on screen as
 * a contractual commitment. See the migration header for the full reasoning.
 *
 * ZERO SCROLL: the page itself never scrolls. The two long lists (feature
 * breakdown, sub-processors) each scroll inside their own pane, which is what
 * keeps a 40-feature month inside 100vh on a 768px tablet.
 */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ShieldCheck, Info, ExternalLink } from "lucide-react";
import SettingsPageWrapper from "@/components/settings/SettingsPageWrapper";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useHospitalId } from "@/hooks/useHospitalId";
import { formatINRPrecise } from "@/lib/currency";
import { summariseAiUsage, type AiCostDailyRow } from "@/lib/aiUsageSummary";

interface SubProcessor {
  name?: string;
  purpose?: string;
  region?: string;
  retention?: string;
  trains_on_input?: boolean;
  dpa_in_place?: boolean;
}

interface Disclosure {
  version: number;
  effective_from: string;
  sub_processors: SubProcessor[] | null;
  data_region: string;
  retention_stance: string;
  training_stance: string;
  dpa_reference: string | null;
  notes: string | null;
}

/** DD/MM/YYYY, en-IN — the only date format this product shows. */
const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN");
};

const monthStartISO = (): string => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
};

const currentMonthLabel = (): string =>
  new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });

const SettingsAIUsagePage: React.FC = () => {
  const hospitalId = useHospitalId();

  // Month-to-date, per feature. Same table and same window /settings/plan sums,
  // so the two screens cannot disagree about the headline figure.
  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ["ai-usage-breakdown", hospitalId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ai_cost_daily")
        .select("feature_key, provider, total_calls, total_cost_inr")
        .eq("hospital_id", hospitalId!)
        .gte("date", monthStartISO());
      // Supabase returns errors as VALUES, not throws — an unchecked error here
      // would render as a confident, empty "no AI used this month".
      if (error) throw error;
      return summariseAiUsage((data ?? []) as AiCostDailyRow[]);
    },
    enabled: !!hospitalId,
    staleTime: 5 * 60_000,
  });

  // Newest published disclosure. Global, not tenant-scoped — one deployment,
  // one statement. RLS hides unpublished drafts from hospital users entirely.
  const { data: disclosure, isLoading: disclosureLoading } = useQuery({
    queryKey: ["ai-processing-disclosure"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ai_processing_disclosure")
        .select("version, effective_from, sub_processors, data_region, retention_stance, training_stance, dpa_reference, notes")
        .eq("is_published", true)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Disclosure | null;
    },
    staleTime: 30 * 60_000,
  });

  const subProcessors: SubProcessor[] = Array.isArray(disclosure?.sub_processors)
    ? disclosure!.sub_processors!
    : [];

  return (
    <SettingsPageWrapper title="AI Usage & Data Processing" hideSave wide>
      <div className="flex flex-col gap-4">
        {/* ── Summary strip ─────────────────────────────────────────────── */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-sm font-semibold text-foreground">
              AI activity — {currentMonthLabel()}
            </h2>
            <span className="text-xs text-muted-foreground">Resets on the 1st</span>
          </div>

          {usageLoading ? (
            <div className="h-[76px] flex items-center justify-center rounded-lg border border-border bg-card">
              <Loader2 className="animate-spin text-muted-foreground" size={18} />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile label="Total AI cost" value={formatINRPrecise(usage?.totalCostInr ?? 0)} />
              <StatTile
                label="Counts toward your plan"
                value={formatINRPrecise(usage?.meteredCostInr ?? 0)}
              />
              {/* Safety AI is shown, and shown as never-charged. A hospital that
                  sees only a total will reasonably assume it paid for the
                  drug-interaction checks too. */}
              <StatTile
                label="Patient-safety AI"
                value={formatINRPrecise(usage?.safetyCostInr ?? 0)}
                note="Never charged"
              />
              <StatTile label="AI calls" value={(usage?.totalCalls ?? 0).toLocaleString("en-IN")} />
            </div>
          )}
        </div>

        {/* ── Breakdown + disclosure ────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Per-feature breakdown */}
          <section className="rounded-lg border border-border bg-card flex flex-col min-h-0">
            <header className="px-4 py-3 border-b border-border flex-shrink-0">
              <h3 className="text-sm font-semibold text-foreground">Where AI was used</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Every feature that made an AI call this month
              </p>
            </header>

            <div className="flex-1 overflow-y-auto max-h-[46vh]">
              {usageLoading ? (
                <div className="p-8 flex justify-center">
                  <Loader2 className="animate-spin text-muted-foreground" size={18} />
                </div>
              ) : usage?.isEmpty ? (
                <p className="p-6 text-sm text-muted-foreground text-center">
                  No AI calls recorded this month.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                    <tr className="text-xs text-muted-foreground">
                      <th className="text-left font-medium px-4 py-2">Feature</th>
                      <th className="text-right font-medium px-2 py-2">Calls</th>
                      <th className="text-right font-medium px-4 py-2">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage?.features.map((f) => (
                      <tr key={f.featureKey} className="border-t border-border">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* 14px minimum — this label carries financial meaning. */}
                            <span className="text-foreground text-sm">{f.label}</span>
                            {f.isSafety && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-300 text-emerald-700">
                                Safety
                              </Badge>
                            )}
                            {/* A key we no longer recognise is shown, not hidden —
                                dropping it would understate the total above. */}
                            {!f.known && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                                Retired feature
                              </Badge>
                            )}
                          </div>
                          {f.providers.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              via {f.providers.join(", ")}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-foreground">
                          {f.calls.toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-foreground">
                          {formatINRPrecise(f.costInr)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* Data processing disclosure */}
          <section className="rounded-lg border border-border bg-card flex flex-col min-h-0">
            <header className="px-4 py-3 border-b border-border flex-shrink-0 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <ShieldCheck size={15} className="text-emerald-600" />
                  Where your data is processed
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  For your DPDP records and procurement review
                </p>
              </div>
              {disclosure && (
                <Badge variant="outline" className="text-[10px] flex-shrink-0">
                  v{disclosure.version} · {formatDate(disclosure.effective_from)}
                </Badge>
              )}
            </header>

            <div className="flex-1 overflow-y-auto max-h-[46vh] p-4">
              {disclosureLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="animate-spin text-muted-foreground" size={18} />
                </div>
              ) : !disclosure ? (
                /* An honest empty state. Inventing reassuring text here would be
                   the single worst thing this screen could do — a hospital would
                   cite it in a DPIA. */
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Info size={15} className="mt-0.5 flex-shrink-0" />
                  <p>
                    Aumrti has not yet published a data-processing disclosure. Please contact
                    Aumrti support for the current sub-processor list and the signed data-processing
                    agreement covering your hospital.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <DisclosureRow label="Data region" value={disclosure.data_region} />
                  <DisclosureRow label="Retention" value={disclosure.retention_stance} />
                  <DisclosureRow label="Use for model training" value={disclosure.training_stance} />
                  {disclosure.dpa_reference && (
                    <DisclosureRow
                      label="Data-processing agreement"
                      value={disclosure.dpa_reference}
                      icon={<ExternalLink size={12} />}
                    />
                  )}

                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                      Sub-processors
                    </p>
                    {subProcessors.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        None listed in this version of the disclosure.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {subProcessors.map((sp, i) => (
                          <li
                            key={`${sp.name ?? "unnamed"}-${i}`}
                            className="rounded-md border border-border px-3 py-2"
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="text-sm font-medium text-foreground">
                                {sp.name || "Unnamed processor"}
                              </span>
                              <div className="flex items-center gap-1">
                                {sp.dpa_in_place === true && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-300 text-emerald-700">
                                    DPA signed
                                  </Badge>
                                )}
                                {/* Only rendered when explicitly false. An absent
                                    field means "not stated", which must never be
                                    displayed as a reassurance. */}
                                {sp.trains_on_input === false && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-300 text-emerald-700">
                                    No training on input
                                  </Badge>
                                )}
                                {sp.trains_on_input === true && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-700">
                                    May train on input
                                  </Badge>
                                )}
                              </div>
                            </div>
                            {sp.purpose && (
                              <p className="text-xs text-muted-foreground mt-1">{sp.purpose}</p>
                            )}
                            <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                              {sp.region && <span>Region: {sp.region}</span>}
                              {sp.retention && <span>Retention: {sp.retention}</span>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {disclosure.notes && (
                    <p className="text-xs text-muted-foreground border-t border-border pt-3">
                      {disclosure.notes}
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </SettingsPageWrapper>
  );
};

const StatTile: React.FC<{ label: string; value: string; note?: string }> = ({
  label,
  value,
  note,
}) => (
  <div className="rounded-lg border border-border bg-card px-4 py-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-lg font-semibold text-foreground tabular-nums mt-0.5">{value}</p>
    {note && <p className="text-[11px] text-emerald-700 mt-0.5">{note}</p>}
  </div>
);

const DisclosureRow: React.FC<{ label: string; value: string; icon?: React.ReactNode }> = ({
  label,
  value,
  icon,
}) => (
  <div>
    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
    <p className="text-sm text-foreground mt-0.5 flex items-start gap-1.5">
      {icon && <span className="mt-1 flex-shrink-0">{icon}</span>}
      <span>{value}</span>
    </p>
  </div>
);

export default SettingsAIUsagePage;
