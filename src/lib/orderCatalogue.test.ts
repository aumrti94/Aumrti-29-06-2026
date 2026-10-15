import { describe, it, expect } from "vitest";
import {
  buildOrderCatalogue,
  lookupExactEntry,
  matchOrderNameDetailed,
  type CatalogueEntry,
} from "@/lib/orderCatalogue";

const lab = (name: string, id = name): CatalogueEntry => ({ id, name, kind: "lab" });
const panel = (name: string, id = `g:${name}`): CatalogueEntry => ({ id, name, kind: "lab_group" });
const rad = (name: string, id = `r:${name}`): CatalogueEntry => ({ id, name, kind: "radiology" });

describe("buildOrderCatalogue — a panel shadows a single test of the same name", () => {
  // The reported bug: a hospital carrying "Thyroid Profile" as BOTH a test and a panel made the
  // panel unreachable, and the dictated name was neither ordered nor billed.
  const twins = [lab("Thyroid Profile", "test-id"), panel("Thyroid Profile", "panel-id")];

  it("indexes the panel, not the test — whichever order the rows arrive in", () => {
    for (const rows of [twins, [...twins].reverse()]) {
      const c = buildOrderCatalogue(rows);
      expect(lookupExactEntry("Thyroid Profile", c)?.id).toBe("panel-id");
      expect(lookupExactEntry("Thyroid Profile", c)?.kind).toBe("lab_group");
    }
  });

  it("resolves a dictated panel name with a trailing noise word", () => {
    const c = buildOrderCatalogue(twins);
    const hit = matchOrderNameDetailed("Thyroid Profile test", c);
    // Returned null before the fix: both twins scored 1.0, so the ambiguity guard refused both.
    expect(hit?.entry.kind).toBe("lab_group");
    expect(hit?.entry.id).toBe("panel-id");
  });

  it("drops the shadowed test from `all`, so the fuzzy loop cannot tie on it", () => {
    const c = buildOrderCatalogue(twins);
    expect(c.all.filter((e) => e.name === "Thyroid Profile")).toHaveLength(1);
  });

  it("routes a built-in alias to the panel", () => {
    const c = buildOrderCatalogue([lab("Thyroid Profile", "test-id"), panel("Thyroid Profile", "panel-id")]);
    expect(matchOrderNameDetailed("TFT", c)?.entry.id).toBe("panel-id");
  });

  it("leaves a test alone when no panel shares its name", () => {
    const c = buildOrderCatalogue([lab("Thyroid Profile (TSH)"), lab("Serum Creatinine")]);
    const hit = matchOrderNameDetailed("Thyroid Profile (TSH)", c);
    expect(hit?.entry.kind).toBe("lab");
    expect(hit?.source).toBe("exact");
  });

  it("does not shadow a RADIOLOGY study that shares a panel's name", () => {
    // A study sharing a lab panel's name is a different modality, not a duplicate.
    const c = buildOrderCatalogue([rad("Lipid Profile", "rad-id"), panel("Lipid Profile", "panel-id")]);
    expect(c.all).toHaveLength(2);
  });
});

describe("matchOrderNameDetailed — the guarantees that must not regress", () => {
  const catalogue = buildOrderCatalogue([
    panel("Lipid Profile"),
    panel("Fever Panel"),
    panel("Complete Blood Count"),
    lab("Lipoprotein (a)"),
    lab("Urine R/M"),
    lab("Urine Culture"),
    lab("Serum Creatinine"),
  ]);

  it("rejects a request MORE GENERAL than every candidate", () => {
    // "Lipid" is not "Lipid Profile" — billing the panel is work nobody asked for.
    expect(matchOrderNameDetailed("Lipid", catalogue)).toBeNull();
    expect(matchOrderNameDetailed("Urine", catalogue)).toBeNull();
  });

  it("rejects a request MORE SPECIFIC than every candidate", () => {
    expect(matchOrderNameDetailed("malaria fever panel", catalogue)).toBeNull();
  });

  it("rejects a request made entirely of everyday words", () => {
    expect(matchOrderNameDetailed("check the sugar", catalogue)).toBeNull();
    expect(matchOrderNameDetailed("please do", catalogue)).toBeNull();
  });

  it("still forgives spelling drift on an unambiguous name", () => {
    expect(matchOrderNameDetailed("serum creatinin", catalogue)?.entry.name).toBe("Serum Creatinine");
  });

  it("still strips noise words for a panel with no twin", () => {
    expect(matchOrderNameDetailed("Fever panel test", catalogue)?.entry.name).toBe("Fever Panel");
  });

  it("refuses to choose between two genuinely different rows that score the same", () => {
    // The ambiguity guard. Ordering the wrong test is worse than asking the doctor to pick.
    const ambiguous = buildOrderCatalogue([lab("Vitamin D2"), lab("Vitamin D3")]);
    expect(matchOrderNameDetailed("Vitamin D", ambiguous)).toBeNull();
  });
});

describe("spoken radiology study names", () => {
  // One hospital's actual radiology catalogue. Dictated names must land on these rows, or the
  // study is ordered under the doctor's own spelling and billed at the default rate.
  const catalogue = buildOrderCatalogue([
    rad("X-Ray Chest PA View"),
    rad("USG Abdomen + Pelvis"),
    rad("USG KUB + Prostate"),
    rad("2D Echo + Doppler"),
    rad("MRI Brain"),
    rad("CT Chest"),
    rad("X-Ray KUB"),
  ]);
  const resolve = (spoken: string) => matchOrderNameDetailed(spoken, catalogue)?.entry.name ?? null;

  it.each([
    ["chest x-ray", "X-Ray Chest PA View"],
    ["CXR", "X-Ray Chest PA View"],
    ["x ray chest pa", "X-Ray Chest PA View"],
    ["usg abdomen and pelvis", "USG Abdomen + Pelvis"],
    ["ultrasound abdomen pelvis", "USG Abdomen + Pelvis"],
    ["whole abdomen ultrasound", "USG Abdomen + Pelvis"],
    ["2d echo", "2D Echo + Doppler"],
    ["echo doppler", "2D Echo + Doppler"],
    ["MRI of the brain", "MRI Brain"],
    ["brain mri", "MRI Brain"],
    ["CT scan chest", "CT Chest"],
    ["kub x ray", "X-Ray KUB"],
  ])("resolves %j to %j", (spoken, expected) => {
    expect(resolve(spoken)).toBe(expected);
  });

  it("resolves an alias carrying a filler word", () => {
    // The alias tier is a whole-string lookup, so "please" used to defeat it outright even
    // though the fuzzy tier drops the word happily.
    expect(resolve("chest xray please")).toBe("X-Ray Chest PA View");
    expect(resolve("do a chest x ray")).toBe("X-Ray Chest PA View");
  });

  it("refuses a request more general than any study the hospital carries", () => {
    // "USG Abdomen" is not "USG Abdomen + Pelvis" — ordering the wider scan bills for a
    // region nobody asked about.
    expect(resolve("usg abdomen")).toBeNull();
    expect(resolve("x ray")).toBeNull();
    expect(resolve("ultrasound")).toBeNull();
    expect(resolve("please do a scan")).toBeNull();
  });

  it("refuses a bare KUB, which names two different studies here", () => {
    expect(resolve("kub")).toBeNull();
  });

  it("refuses an alias whose study this hospital does not offer", () => {
    // "HRCT" maps to "HRCT Chest", which is not in this catalogue. CT Chest is a different
    // study, not a near-enough one.
    expect(resolve("hrct chest")).toBeNull();
  });
});

describe("lookupExactEntry", () => {
  const catalogue = buildOrderCatalogue([lab("USG Abdomen & Pelvis"), lab("Serum Creatinine")]);

  it("matches on the same key the catalogue indexes with, symbols expanded", () => {
    // Bare normalizeTerm misses this: "&" collapses away rather than becoming "and".
    expect(lookupExactEntry("USG Abdomen and Pelvis", catalogue)?.name).toBe("USG Abdomen & Pelvis");
    expect(lookupExactEntry("usg abdomen & pelvis", catalogue)?.name).toBe("USG Abdomen & Pelvis");
  });

  it("returns undefined for a name the hospital does not carry", () => {
    expect(lookupExactEntry("Procalcitonin", catalogue)).toBeUndefined();
  });

  it("does not fuzzy-match", () => {
    expect(lookupExactEntry("creatinin", catalogue)).toBeUndefined();
  });
});
