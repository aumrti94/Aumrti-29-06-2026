/**
 * prescriptionQuantity — pure arithmetic, no DOM, no Supabase stub needed.
 *
 * This file's own header records that the same calculation existed three times before this
 * extraction, and two of those copies multiplied by DOSE STRENGTH instead of dose COUNT:
 * Paracetamol 650mg × TDS × 5 days computed 650 × 3 × 5 = 9750 instead of 15. That bug is the
 * reason this module exists, so it is the first thing asserted below, not an afterthought — a
 * future "simplification" that reintroduces strength into the multiplication is exactly the
 * regression this suite exists to catch.
 */
import { describe, it, expect } from "vitest";
import {
  parseFrequencySlot,
  perDayDoseFromFrequency,
  perDayDose,
  calcQuantity,
  formatDuration,
  normalizeDurationDays,
} from "./prescriptionQuantity";

describe("calcQuantity — the historical bug this file fixes", () => {
  it("computes quantity from dose COUNT × days, never dose strength", () => {
    // The strength (650mg) never appears in this call at all — that absence IS the fix.
    // TDS = 3/day × 5 days = 15, not 650 × 3 × 5 = 9750.
    expect(calcQuantity("TDS", "5")).toBe("15");
  });

  it("agrees whether the frequency is an M-A-E pattern or a legacy abbreviation", () => {
    // "1-1-1" and "TDS" both mean three times a day; the two code paths must not disagree.
    expect(calcQuantity("1-1-1", "5")).toBe("15");
    expect(calcQuantity("TDS", "5")).toBe("15");
  });
});

describe("parseFrequencySlot", () => {
  it("parses a whole-number slot", () => {
    expect(parseFrequencySlot("1")).toBe(1);
    expect(parseFrequencySlot("2")).toBe(2);
  });

  it("treats an empty slot as zero, not unparsable", () => {
    // "1-0-1" has a real, meaningful empty-ish middle slot ("0"), but a slot that is empty
    // STRING (" " between two dashes, e.g. "1--1") must still resolve rather than poisoning the
    // whole pattern to null.
    expect(parseFrequencySlot("")).toBe(0);
    expect(parseFrequencySlot("   ")).toBe(0);
  });

  it("parses a fraction slot", () => {
    expect(parseFrequencySlot("1/2")).toBe(0.5);
    expect(parseFrequencySlot("3/4")).toBe(0.75);
  });

  it("returns null for a fraction with a zero denominator", () => {
    expect(parseFrequencySlot("1/0")).toBeNull();
  });

  it("returns null for non-numeric garbage", () => {
    expect(parseFrequencySlot("x")).toBeNull();
    expect(parseFrequencySlot("TDS")).toBeNull();
  });
});

describe("perDayDoseFromFrequency — M-A-E pattern", () => {
  it("sums a standard three-slot pattern", () => {
    expect(perDayDoseFromFrequency("1-1-1")).toBe(3);
  });

  it("sums a pattern with zero slots", () => {
    expect(perDayDoseFromFrequency("1-0-1")).toBe(2);
  });

  it("sums a four-slot QID-equivalent pattern", () => {
    expect(perDayDoseFromFrequency("1-1-1-1")).toBe(4);
  });

  it("sums a pattern containing a fractional slot", () => {
    expect(perDayDoseFromFrequency("1/2-0-0")).toBe(0.5);
    expect(perDayDoseFromFrequency("2-0-1/2")).toBe(2.5);
  });

  it("requires at least one '-' to be read as a pattern at all", () => {
    // This is what lets a legacy abbreviation like "BD" (no dash) fall through to the legacy
    // shim in perDayDose, rather than being misread here as one malformed slot.
    expect(perDayDoseFromFrequency("BD")).toBeNull();
    expect(perDayDoseFromFrequency("1")).toBeNull();
  });

  it("returns null if any single slot in the pattern is unparsable", () => {
    expect(perDayDoseFromFrequency("1-x-1")).toBeNull();
  });

  it("returns null for an empty or missing frequency", () => {
    expect(perDayDoseFromFrequency("")).toBeNull();
  });

  it("treats undefined the same as empty, for a caller that bypasses the type system", () => {
    // The parameter is typed `string`, not `string | undefined` — this defends a JSON-sourced
    // value (e.g. a medicine row read loosely) that reaches here undefined despite the type.
    expect(perDayDoseFromFrequency(undefined as unknown as string)).toBeNull();
  });
});

describe("perDayDose — pattern first, legacy abbreviation as fallback", () => {
  it("reads an M-A-E pattern directly", () => {
    expect(perDayDose("1-0-1")).toBe(2);
  });

  it.each([
    ["OD", 1], ["QD", 1], ["HS", 1], ["SOS", 1], ["STAT", 1], ["AC", 1], ["PC", 1],
    ["BD", 2], ["Q12H", 2],
    ["TDS", 3], ["Q8H", 3],
    ["QID", 4], ["Q6H", 4],
  ])("resolves the legacy abbreviation %s to %i/day", (abbr, perDay) => {
    expect(perDayDose(abbr)).toBe(perDay);
  });

  it("is case-insensitive for legacy abbreviations", () => {
    expect(perDayDose("tds")).toBe(3);
    expect(perDayDose("Bd")).toBe(2);
  });

  it("returns null for an unrecognised abbreviation", () => {
    expect(perDayDose("XYZ")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(perDayDose("")).toBeNull();
  });

  it("treats undefined the same as empty", () => {
    expect(perDayDose(undefined as unknown as string)).toBeNull();
  });
});

describe("calcQuantity — the full contract", () => {
  it("rounds up a fractional per-day total rather than under-dispensing", () => {
    // 1/2 per day × 5 days = 2.5 → the patient needs 3, not 2, tablets to finish the course.
    expect(calcQuantity("1/2-0-0", "5")).toBe("3");
  });

  it("reads a leading numeral out of a free-text duration like '15 days'", () => {
    expect(calcQuantity("1-0-1", "5 days")).toBe("10");
  });

  it("returns empty for an unparsable frequency", () => {
    expect(calcQuantity("XYZ", "5")).toBe("");
  });

  it("returns empty for a duration with no leading number", () => {
    expect(calcQuantity("TDS", "until further notice")).toBe("");
  });

  it("returns empty rather than zero for a zero or negative duration", () => {
    expect(calcQuantity("TDS", "0")).toBe("");
  });

  it("returns empty for empty frequency or duration", () => {
    expect(calcQuantity("", "5")).toBe("");
    expect(calcQuantity("TDS", "")).toBe("");
  });

  it("treats an undefined frequency or duration the same as empty", () => {
    expect(calcQuantity(undefined as unknown as string, "5")).toBe("");
    expect(calcQuantity("TDS", undefined as unknown as string)).toBe("");
  });

  it("returns empty, not '0', when every M-A-E slot is zero", () => {
    // A degenerate but syntactically valid pattern (e.g. a dictation artifact) — per-day dose
    // is 0, so the course quantity rounds to zero tablets. "0" would be worse than a blank box:
    // it reads as a deliberate answer rather than as nothing to dispense.
    expect(calcQuantity("0-0-0", "5")).toBe("");
  });
});

describe("formatDuration", () => {
  it("appends the suffix to a bare number", () => {
    expect(formatDuration("15", " days")).toBe("15 days");
  });

  it("leaves text that already names its own unit unchanged, avoiding double suffixes", () => {
    expect(formatDuration("1 week", " days")).toBe("1 week");
    expect(formatDuration("15 days", " days")).toBe("15 days");
  });

  it("returns empty for empty input", () => {
    expect(formatDuration("", " days")).toBe("");
  });

  it("returns empty for undefined input", () => {
    expect(formatDuration(undefined as unknown as string, " days")).toBe("");
  });
});

describe("normalizeDurationDays", () => {
  it("strips a unit word down to the bare leading number", () => {
    expect(normalizeDurationDays("15 days")).toBe("15");
    expect(normalizeDurationDays("1 week")).toBe("1");
  });

  it("returns empty for undefined input", () => {
    expect(normalizeDurationDays(undefined as unknown as string)).toBe("");
  });

  it("leaves an already-bare number unchanged", () => {
    expect(normalizeDurationDays("15")).toBe("15");
  });

  it("falls back to the original text when no leading number is found", () => {
    expect(normalizeDurationDays("SOS")).toBe("SOS");
  });

  it("returns empty for empty input", () => {
    expect(normalizeDurationDays("")).toBe("");
  });
});
