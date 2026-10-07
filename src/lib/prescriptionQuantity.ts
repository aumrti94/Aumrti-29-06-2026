// Shared prescription-quantity math.
//
// WHY THIS EXISTS
// This math existed three times, two of them wrong:
//   - QuickScribePage.tsx had the CORRECT version: an M-A-E (morning-afternoon-evening[-night])
//     pattern like "1-0-1" or "1/2-0-0" summed into a per-day dose count, x days.
//   - RxOrdersTab.tsx's calcQty multiplied the DOSE STRENGTH by an OD/BD/TDS/QID lookup by
//     days — e.g. Paracetamol 650mg x TDS x 5 days computed 650 x 3 x 5 = 9750 instead of 15.
//   - drugStock.ts's calcDrugQuantity was a third copy of the exact same dose-strength bug,
//     explicitly commented "Mirrors calcQty in RxOrdersTab", used to quantify voice-added drugs.
// This file is the one correct implementation, extracted from QuickScribePage, plus a
// legacy-abbreviation compatibility shim so historical rx_templates, DrugEntry rows saved
// before this change, and voice dictation that still emits an abbreviation keep computing a
// sane quantity instead of regressing to blank.

/**
 * Frequency is entered as a morning-afternoon-evening[-night] pattern (e.g. "1-0-1",
 * "1/2-0-0", "2-0-1/2") rather than free text, so Qty can be derived instead of guessed.
 * A fraction like "1/2" is a half-tablet slot; an unparsable slot yields null.
 */
export function parseFrequencySlot(slot: string): number | null {
  const s = slot.trim();
  if (!s) return 0;
  const fraction = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const denom = Number(fraction[2]);
    if (!denom) return null;
    return Number(fraction[1]) / denom;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Sum of an M-A-E[-night] pattern's slots. Needs at least one "-" to be treated as a pattern
 *  at all, which is what lets a legacy abbreviation like "BD" fall through to the shim below
 *  instead of being misread as a single malformed slot. */
export function perDayDoseFromFrequency(frequency: string): number | null {
  const slots = (frequency ?? "").split("-");
  if (slots.length < 2) return null;
  let total = 0;
  for (const slot of slots) {
    const v = parseFrequencySlot(slot);
    if (v === null) return null;
    total += v;
  }
  return total;
}

/**
 * Compatibility shim: legacy abbreviation frequencies, pre-dating the M-A-E pattern format.
 * Union of RxOrdersTab's old FREQ_PER_DAY and drugStock's old FREQ_PER_DAY, so neither
 * loses coverage when both collapse into this one table.
 */
const LEGACY_PER_DAY: Record<string, number> = {
  OD: 1, QD: 1, HS: 1, SOS: 1, STAT: 1, AC: 1, PC: 1,
  BD: 2, Q12H: 2,
  TDS: 3, Q8H: 3,
  QID: 4, Q6H: 4,
};

function perDayDoseLegacy(frequency: string): number | null {
  const key = (frequency ?? "").trim().toUpperCase();
  if (!key) return null;
  return LEGACY_PER_DAY[key] ?? null;
}

/**
 * Doses per day for a frequency value, whichever format it arrives in: an M-A-E pattern first,
 * a legacy abbreviation otherwise. `null` means neither could be parsed. Exported separately
 * from `calcQuantity` so UI can show "x N/day" without re-deriving it.
 */
export function perDayDose(frequency: string): number | null {
  const pattern = perDayDoseFromFrequency(frequency ?? "");
  return pattern !== null ? pattern : perDayDoseLegacy(frequency ?? "");
}

/**
 * Units to dispense for a course: ceil(doses-per-day x days). Returns "" when the frequency
 * or duration cannot be parsed, or the result is zero — an unparsable or empty pattern is left
 * blank for the doctor to fill in by hand, never silently defaulted to a wrong number.
 */
export function calcQuantity(frequency: string, duration: string): string {
  const perDay = perDayDose(frequency ?? "");
  // Duration often arrives as "15 days" rather than a bare number (free dictation, or the
  // doctor typing it that way), so pull out the leading numeral instead of requiring an
  // exact numeric string.
  const match = (duration || "").match(/\d+(\.\d+)?/);
  const days = match ? parseFloat(match[0]) : NaN;
  if (perDay === null || !Number.isFinite(days) || days <= 0) return "";
  const qty = Math.ceil(perDay * days);
  return qty > 0 ? String(qty) : "";
}

/**
 * Display label for a duration field that already carries whatever unit the doctor (or voice
 * dictation) typed — "15", "15 days", "1 week" are all valid free text here. A caller that
 * unconditionally appends its own unit suffix (e.g. `` `${duration} days` ``) ends up
 * double-printing it as "15 days days" or "1 week days" the moment the field isn't a bare
 * number. Only a bare number gets the suffix added; anything that already contains a letter
 * is assumed to already name its own unit and is left alone.
 */
export function formatDuration(duration: string, suffix: string): string {
  const trimmed = (duration ?? "").trim();
  if (!trimmed) return "";
  return /[a-zA-Z]/.test(trimmed) ? trimmed : `${trimmed}${suffix}`;
}

/**
 * Strip a unit word off a duration value down to the bare leading number the Days field
 * expects — "15 days" → "15", "1 week" → "1". The AI prompt is instructed to never emit a
 * unit here, but prompt compliance isn't guaranteed every time, so this is the belt to that
 * braces: it runs once, when a voice-dictated duration first lands on the prescription, so
 * the Days field always shows a clean number regardless of what the model actually returned.
 * Falls back to the original text unchanged if no leading number is found, rather than
 * blanking something unrecognised.
 */
export function normalizeDurationDays(duration: string): string {
  const trimmed = (duration ?? "").trim();
  const match = trimmed.match(/^\d+(\.\d+)?/);
  return match ? match[0] : trimmed;
}
