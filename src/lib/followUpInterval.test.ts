/**
 * followUpInterval — pure function, no DOM, no Supabase stub needed.
 *
 * The contract that matters: a string the model did not clearly express as "number + unit" must
 * come back empty, never a guessed date. A guessed follow-up date is worse than a blank box,
 * because a blank box gets noticed and filled in; a wrong date looks exactly like a right one.
 */
import { describe, it, expect } from "vitest";
import { parseFollowUpInterval } from "./followUpInterval";

// Fixed anchor so every assertion is deterministic regardless of when the suite runs.
const FROM = new Date(2026, 9, 23); // 23 Oct 2026 (JS months are 0-indexed)

describe("parseFollowUpInterval — recognised patterns", () => {
  it("parses a bare number of days", () => {
    expect(parseFollowUpInterval("10 days", FROM)).toBe("2026-11-02");
    expect(parseFollowUpInterval("1 day", FROM)).toBe("2026-10-24");
  });

  it("parses a number of weeks", () => {
    expect(parseFollowUpInterval("2 weeks", FROM)).toBe("2026-11-06");
    expect(parseFollowUpInterval("1 week", FROM)).toBe("2026-10-30");
  });

  it("parses a number of months as 30 days per month", () => {
    // A calendar month is deliberately NOT used — "1 month" meaning "the 23rd of next month" is
    // not how an OPD doctor means it, and November has 30 days anyway so the two agree here.
    expect(parseFollowUpInterval("1 month", FROM)).toBe("2026-11-22");
  });

  it("parses a spelled-out number", () => {
    expect(parseFollowUpInterval("two weeks", FROM)).toBe("2026-11-06");
    expect(parseFollowUpInterval("ten days", FROM)).toBe("2026-11-02");
  });

  it("treats 'a week' / 'an week' / 'a month' as one unit", () => {
    expect(parseFollowUpInterval("a week", FROM)).toBe("2026-10-30");
    expect(parseFollowUpInterval("a month", FROM)).toBe("2026-11-22");
  });

  it("treats a bare 'fortnight' as 14 days, with no leading number required", () => {
    expect(parseFollowUpInterval("fortnight", FROM)).toBe("2026-11-06");
    expect(parseFollowUpInterval("a fortnight", FROM)).toBe("2026-11-06");
  });

  it("is case-insensitive and tolerates surrounding whitespace", () => {
    expect(parseFollowUpInterval("  2 WEEKS  ", FROM)).toBe("2026-11-06");
  });
});

describe("parseFollowUpInterval — returns empty rather than guessing", () => {
  it("returns empty for blank or whitespace-only input", () => {
    expect(parseFollowUpInterval("", FROM)).toBe("");
    expect(parseFollowUpInterval("   ", FROM)).toBe("");
  });

  it("returns empty for an already-formed date — the AI is told never to send one", () => {
    expect(parseFollowUpInterval("2026-11-06", FROM)).toBe("");
  });

  it("returns empty for a vague phrase with no number or recognised unit", () => {
    expect(parseFollowUpInterval("soon", FROM)).toBe("");
    expect(parseFollowUpInterval("if symptoms persist", FROM)).toBe("");
    expect(parseFollowUpInterval("next visit", FROM)).toBe("");
  });

  it("returns empty for a zero or negative quantity", () => {
    expect(parseFollowUpInterval("0 days", FROM)).toBe("");
  });

  it("returns empty for an unrecognised unit", () => {
    expect(parseFollowUpInterval("2 years", FROM)).toBe("");
    expect(parseFollowUpInterval("3 hours", FROM)).toBe("");
  });

  it("returns empty for a number with no unit at all", () => {
    expect(parseFollowUpInterval("2", FROM)).toBe("");
  });
});

describe("parseFollowUpInterval — defaults to the real clock", () => {
  it("uses now() when no anchor date is supplied", () => {
    const result = parseFollowUpInterval("7 days");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).not.toBe("");
  });
});
