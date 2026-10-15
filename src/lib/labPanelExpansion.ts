// Turn a prescribed lab PANEL into the member tests the lab will actually run.
//
// WHY THIS EXISTS
// A panel has two names in this system: the bundle a doctor says ("Thyroid Profile", "LFT") and
// the analytes the lab performs and bills (T3, T4, TSH). Clicking the panel chip in the Rx tab
// has always added the members — `applyLabPickerSelection` does exactly that — but a panel that
// arrived by voice, by the AI guidance chips, or typed into the search box stayed as a single
// line carrying the bundle name. Downstream that line is not a test:
// `NewLabOrderModal` pre-selects prescribed tests by exact `lab_test_master.test_name`, so the
// panel matched nothing, nothing was selected, and nothing was billed.
//
// Expanding here — in the consultation, while the doctor is looking at it — is what makes the
// two paths agree, and it is deliberately not done at commit time: a substitution that leads to
// a charge has to be visible to the person who can still disagree with it.
//
// Pure and synchronous so the convergence property can actually be asserted: this runs inside a
// React effect that re-fires on every change to the order list, so `f(f(x))` MUST equal `f(x)`
// or the consultation screen loops.

import {
  lookupExactEntry,
  matchOrderNameDetailed,
  type OrderCatalogue,
} from "@/lib/orderCatalogue";
import type { LabOrder } from "@/components/opd/ConsultationWorkspace";

/** The member names of one panel, keyed by `lab_test_groups.id`. */
export interface LabPanel {
  id: string;
  group_name: string;
  testNames: string[];
}

export interface ExpandLabPanelsResult {
  /** The new order list. Reference-equal to the input when nothing expanded. */
  labOrders: LabOrder[];
  /**
   * Members a panel claims but this hospital cannot currently run, keyed by panel name.
   * Surfaced on the panel header rather than dropped silently — "3 of 4 tests" with no
   * explanation is how a doctor ends up believing an analyte was ordered.
   */
  omittedByPanel: Map<string, string[]>;
}

/**
 * Replace every prescribed panel with its member tests.
 *
 * `panelsById` is keyed by `lab_test_groups.id` and matched against the catalogue entry's id,
 * never by name — a lab_group entry's `id` IS the group row's id, so this survives renames,
 * casing, and a hospital that has two panels with confusingly similar names.
 */
export function expandLabPanels(
  labOrders: readonly LabOrder[],
  catalogue: OrderCatalogue,
  panelsById: ReadonlyMap<string, LabPanel>,
): ExpandLabPanelsResult {
  const omittedByPanel = new Map<string, string[]>();
  if (!catalogue?.all.length || !labOrders.length) {
    return { labOrders: labOrders as LabOrder[], omittedByPanel };
  }

  const out: LabOrder[] = [];
  // Seeded from every INPUT line, not just the ones emitted so far: a member the doctor also
  // asked for standalone must not be duplicated, and that standalone line is the one that
  // survives — it carries no `expanded_from`, so undoing the panel leaves it in place, which
  // is right. They asked for it twice.
  const seen = new Set(labOrders.map((l) => key(l.test_name)));
  const expandedPanelIds = new Set<string>();
  let changed = false;

  for (const l of labOrders) {
    // `keep_as_typed` is the doctor having rejected a match; it outranks everything here.
    // `expanded_from` means this line IS a member — the guard that makes a second pass a no-op.
    if (l.keep_as_typed || l.expanded_from) { out.push(l); continue; }

    const hit = matchOrderNameDetailed(l.test_name, catalogue);
    if (hit?.entry.kind !== "lab_group") { out.push(l); continue; }

    const panel = panelsById.get(hit.entry.id);
    // A panel row with no membership rows. `seed_lab_groups_for_hospital` only inserts members
    // when it CREATES the group, so this is a real configuration, and expanding it to nothing
    // would silently delete an investigation the doctor asked for.
    if (!panel?.testNames.length) { out.push(l); continue; }

    const members: string[] = [];
    const omitted: string[] = [];
    for (const name of panel.testNames) {
      // Absent from the catalogue = deactivated in lab_test_master since the panel was built.
      // Expanding to it would print "Not offered here" on a line no counter can bill.
      if (lookupExactEntry(name, catalogue)?.kind === "lab") members.push(name);
      else omitted.push(name);
    }
    if (omitted.length) omittedByPanel.set(hit.entry.name, omitted);
    // Every member deactivated: keep the panel line so the doctor sees their own request and
    // the existing unresolved badge can speak for it.
    if (!members.length) { out.push(l); continue; }

    // The same panel asked for twice ("TFT" and then "thyroid profile test") is one panel.
    if (expandedPanelIds.has(hit.entry.id)) { changed = true; continue; }
    expandedPanelIds.add(hit.entry.id);
    changed = true;

    for (const name of members) {
      const k = key(name);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({
        test_name: name,
        // Carried from the panel line. Not merged onto a member already prescribed
        // standalone — rewriting that line's urgency without telling anyone is a clinical
        // change nobody authorised.
        urgency: l.urgency,
        clinical_indication: l.clinical_indication,
        availability: "in_stock",
        catalogue_id: lookupExactEntry(name, catalogue)?.id,
        expanded_from: hit.entry.name,
        // Keeps its existing meaning: the doctor's own wording, set only when it differed from
        // the canonical name. Never the panel name — that belongs to `expanded_from`, and
        // offering a revert that puts a panel name back on a single member row is nonsense.
        matched_from: hit.entry.name === l.test_name ? undefined : l.test_name,
      });
    }
  }

  return { labOrders: changed ? out : (labOrders as LabOrder[]), omittedByPanel };
}

const key = (name: string) => (name ?? "").toLowerCase().trim();
