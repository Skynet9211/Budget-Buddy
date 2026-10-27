import { describe, expect, it } from "vitest";
import { PALETTES, buildVars, chartColors, contrast, getPalette, isPaletteId, mix } from "./themes";

const HEX = /^#[0-9a-f]{6}$/i;

describe("palettes", () => {
  it("have unique ids and valid colours in both modes", () => {
    expect(new Set(PALETTES.map((p) => p.id)).size).toBe(PALETTES.length);
    for (const p of PALETTES) {
      for (const mode of ["light", "dark"] as const) {
        for (const [key, value] of Object.entries(p[mode])) {
          expect(value, `${p.id}.${mode}.${key}`).toMatch(HEX);
        }
      }
    }
  });

  it("keep text readable and white-on-accent buttons usable", () => {
    for (const p of PALETTES) {
      for (const mode of ["light", "dark"] as const) {
        const c = p[mode];
        expect(contrast(c.text, c.bg), `${p.id} ${mode} text/bg`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c.text, c.card), `${p.id} ${mode} text/card`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c.muted, c.card), `${p.id} ${mode} muted/card`).toBeGreaterThanOrEqual(3);
        expect(contrast(c.accentDark, c.card), `${p.id} ${mode} heading/card`).toBeGreaterThanOrEqual(4.5);
        expect(contrast("#ffffff", c.accent), `${p.id} ${mode} white/accent`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe("helpers", () => {
  it("builds every CSS variable the stylesheets use", () => {
    const vars = buildVars(getPalette("ocean"), "dark");
    expect(vars["--background"]).toBe("#0f1a21");
    expect(vars["--primary"]).toBe("#3b8fb8");
    for (const name of [
      "--foreground", "--card", "--card-foreground", "--popover", "--popover-foreground", "--primary-foreground",
      "--primary-hover", "--secondary", "--secondary-foreground", "--muted", "--muted-foreground", "--accent",
      "--accent-foreground", "--heading", "--surface", "--border", "--input", "--ring", "--destructive",
      "--success", "--debit-bg", "--credit-bg", "--credit", "--shadow",
    ]) {
      expect(vars[name], name).toBeTruthy();
    }
  });

  it("mixes colours", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mix("#123456", "#ffffff", 0)).toBe("#123456");
  });

  it("gives each theme its own distinct chart colours, starting at the accent", () => {
    for (const p of PALETTES) {
      for (const mode of ["light", "dark"] as const) {
        const colors = chartColors(p, mode);
        expect(colors).toHaveLength(10);
        expect(new Set(colors).size, `${p.id} ${mode}`).toBe(10);
        colors.forEach((c) => expect(c).toMatch(HEX));
        expect(colors[0]).toBe(p[mode].accent);
      }
    }
    expect(chartColors(getPalette("forest"), "light")).not.toEqual(chartColors(getPalette("ocean"), "light"));
  });

  it("falls back to the first palette for unknown ids", () => {
    expect(getPalette("nope").id).toBe(PALETTES[0].id);
    expect(isPaletteId("rose")).toBe(true);
    expect(isPaletteId("nope")).toBe(false);
  });
});
