import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXPORT_THEME_CSS, EXPORT_TOKENS_DARK, EXPORT_TOKENS_LIGHT, EXPORT_TOKENS_STATIC } from './exportTheme';

// The anti-drift gate. `exportTheme.ts` exists only because the DSPS share
// artifact leaves the app and cannot reference `theme.css`; the moment its
// declarations stop matching the ones they mirror, an exported report stops
// looking like the app that produced it. Both sides are CSS strings, so this
// compares them literally — no conversion, no tolerance.

const theme = readFileSync(join(__dirname, '../app/theme.css'), 'utf8');

const lightStart = theme.indexOf('@media (prefers-color-scheme: light)');
const themeSource = {
  dark: theme.slice(theme.indexOf(':root {'), lightStart),
  light: theme.slice(lightStart, theme.indexOf('@theme {')),
};

function declarations(css: string): Map<string, string> {
  return new Map([...css.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, token, value]) => [token, value.trim()]));
}

const carried = {
  dark: declarations(EXPORT_TOKENS_DARK),
  light: declarations(EXPORT_TOKENS_LIGHT),
};
const staticTokens = declarations(EXPORT_TOKENS_STATIC);

// The two type tokens are the artifact's one deliberate departure, asserted
// separately below — everything else must match byte for byte.
const DEPARTURES = new Map([
  ['--font-sans', "'Geist', "],
  ['--font-mono', "'JetBrains Mono', "],
]);

describe('export theme literals', () => {
  it.each(['dark', 'light'] as const)('%s register matches theme.css declaration for declaration', (register) => {
    const declared = declarations(themeSource[register]);
    expect(carried[register].size).toBeGreaterThan(0);
    for (const [token, value] of carried[register]) {
      expect(declared.get(token), `${token} (${register})`).toBe(value);
    }
  });

  it('carries the same token set in both registers', () => {
    expect([...carried.light.keys()]).toEqual([...carried.dark.keys()]);
  });

  it('matches theme.css on every register-invariant token', () => {
    const declared = declarations(themeSource.dark);
    for (const [token, value] of staticTokens) {
      if (DEPARTURES.has(token)) continue;
      expect(declared.get(token), token).toBe(value);
    }
  });

  it('takes theme.css font stacks minus their self-hosted leading family', () => {
    const declared = declarations(themeSource.dark);
    for (const [token, selfHosted] of DEPARTURES) {
      expect(declared.get(token), token).toBe(`${selfHosted}${staticTokens.get(token)}`);
    }
  });

  it('emits dark, then the light query, then print — the order the print override depends on', () => {
    const root = EXPORT_THEME_CSS.indexOf(':root {');
    const light = EXPORT_THEME_CSS.indexOf('@media (prefers-color-scheme: light)');
    const print = EXPORT_THEME_CSS.indexOf('@media print');
    expect(root).toBeGreaterThanOrEqual(0);
    expect(light).toBeGreaterThan(root);
    expect(print).toBeGreaterThan(light);
  });
});
