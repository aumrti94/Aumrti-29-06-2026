/**
 * followUpInterval — turns the AI's spoken-interval field ("2 weeks", "10 days") into the ISO
 * date Quick Scribe's follow_up_date column actually stores.
 *
 * ── Why the AI never returns a date directly ───────────────────────────────────────────────
 *
 * The CONTEXT_PROMPTS.quick_scribe schema asks the model for `follow_up_interval`, a short phrase
 * in the doctor's own words, and explicitly forbids a date: "Never a date — the app computes the
 * date from this interval." That is deliberate, not a missing feature. A model computing "today
 * plus two weeks" has to know today's date, which means trusting whatever the prompt claims the
 * current date is — a string that is one stale cache or one mis-set server clock away from being
 * wrong, and wrong in a way nothing downstream would ever notice, because an ISO date LOOKS
 * exactly as trustworthy whether it is correct or not. Parsing the interval here, against the
 * browser's actual clock, removes that whole class of failure.
 *
 * ── Why this mirrors calcQuantity's contract ───────────────────────────────────────────────
 *
 * Same shape as calcQuantity() in prescriptionQuantity.ts: pure function, returns an empty string
 * on anything unparsable rather than guessing or throwing, so a doctor sees a blank Follow-up
 * date box (which they can fill by hand) instead of a silently wrong one.
 */

const UNIT_DAYS: Record<string, number> = {
  day: 1, days: 1,
  week: 7, weeks: 7,
  fortnight: 14, fortnights: 14,
  month: 30, months: 30,
};

const WORD_NUMBER: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/** `d` plus `days`, as yyyy-mm-dd. Uses local date fields, not UTC, so "tomorrow" means the same
 * calendar day in the browser's timezone that the doctor is standing in. */
function addDaysIso(from: Date, days: number): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parses a spoken follow-up interval into an ISO date, measured from `from` (defaults to now).
 * Returns "" when the text is empty, already a date, or does not match a recognised
 * number-plus-unit pattern — the caller's job, not this function's, to decide what a blank result
 * means.
 */
export function parseFollowUpInterval(text: string, from: Date = new Date()): string {
  const trimmed = (text || "").trim().toLowerCase();
  if (!trimmed) return "";

  // "fortnight" on its own, with no leading number, means exactly one — same convention as
  // "a week" below, spelled out because "fortnight" is the one unit word that is also a complete
  // quantity on its own in everyday English.
  if (/^(a|an|one)?\s*fortnights?$/.test(trimmed)) {
    return addDaysIso(from, 14);
  }

  const match = trimmed.match(/^(\d+|[a-z]+)\s+(day|days|week|weeks|fortnight|fortnights|month|months)$/);
  if (!match) return "";

  const [, qtyRaw, unitRaw] = match;
  const qty = /^\d+$/.test(qtyRaw) ? parseInt(qtyRaw, 10) : WORD_NUMBER[qtyRaw];
  if (!qty || qty <= 0) return "";

  // No fallback needed: unitRaw can only be one of the regex's eight alternatives, and
  // UNIT_DAYS has an entry for all eight, so this lookup is never undefined.
  const unitDays = UNIT_DAYS[unitRaw];

  return addDaysIso(from, qty * unitDays);
}
