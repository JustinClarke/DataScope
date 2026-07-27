import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { composite, contrastRatio, oklchToRgb, type Rgb } from '../lib/oklch';

/**
 * V6e's two mechanical conformance gates (build/13-hallmark-replication/06e-conformance-gate.md).
 *
 * V1–V6d each asserted conformance to `design.md` and each deferred measuring it. These
 * two gates are the mechanical half of that measurement, and they live in the suite rather
 * than in a document because a number taken once is a number the next leaf invalidates in
 * silence. The perceptual half — the 58 slop gates and live-browser verification — is
 * recorded in the leaf doc; it cannot be automated and does not pretend to be.
 */

const APP = __dirname;
const SRC = join(APP, '..');
const theme = readFileSync(join(APP, 'theme.css'), 'utf8');

// ---------------------------------------------------------------- token parsing

interface TokenValue {
  rgb: Rgb;
  alpha: number;
}

/**
 * Parse one register's `oklch()` declarations. `--color-warn` and the legacy aliases are
 * `var()` indirections and resolve through `resolve()` below rather than being parsed.
 */
function parseRegister(block: string): Map<string, TokenValue | { alias: string }> {
  const out = new Map<string, TokenValue | { alias: string }>();
  const declaration =
    /(--[a-z0-9-]+):\s*(?:oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)|var\((--[a-z0-9-]+)\))/g;
  for (const [, name, L, C, H, A, alias] of block.matchAll(declaration)) {
    out.set(
      name,
      alias
        ? { alias }
        : { rgb: oklchToRgb(Number(L) / 100, Number(C), Number(H)), alpha: A === undefined ? 1 : Number(A) },
    );
  }
  return out;
}

const lightStart = theme.indexOf('@media (prefers-color-scheme: light)');
const themeStart = theme.indexOf('@theme');
const darkTokens = parseRegister(theme.slice(0, lightStart));
// The light register is a partial override — anything it does not restate keeps its dark value.
const lightTokens = new Map([...darkTokens, ...parseRegister(theme.slice(lightStart, themeStart))]);

const REGISTERS = { dark: darkTokens, light: lightTokens } as const;
type RegisterName = keyof typeof REGISTERS;

function resolve(register: RegisterName, name: string, depth = 0): TokenValue {
  const value = REGISTERS[register].get(name);
  if (!value) throw new Error(`${name} is not declared in the ${register} register`);
  if ('alias' in value) {
    if (depth > 4) throw new Error(`${name} aliases in a cycle`);
    return resolve(register, value.alias, depth + 1);
  }
  return value;
}

/** The seven opaque surfaces of design.md's depth ladder — everything text can land on. */
const SURFACES = [
  '--color-void',
  '--color-canvas',
  '--color-chrome',
  '--color-panel',
  '--color-card',
  '--color-elev',
  '--color-footer',
] as const;

/**
 * Worst ratio for a foreground across every surface. `wash` composites the foreground over
 * each surface at that alpha first — the badge and status-block pattern where amber text
 * sits on an amber tint, which is where V1's canvas-only measurement went wrong.
 */
function worstAcrossSurfaces(register: RegisterName, token: string, wash = 0) {
  const fg = resolve(register, token).rgb;
  return SURFACES.map((surface) => {
    const base = resolve(register, surface).rgb;
    return { surface, ratio: contrastRatio(fg, wash ? composite(fg, base, wash) : base) };
  }).reduce((worst, candidate) => (candidate.ratio < worst.ratio ? candidate : worst));
}

// ---------------------------------------------------------------- gate 1: contrast

/**
 * Body text — the 4.5:1 tier. This type scale runs 0.5–0.6875rem for most of the UI, so
 * effectively nothing in this app qualifies as "large text": the 3:1 carve-out applies to
 * the focus ring and to non-text marks, and to nothing else.
 */
const BODY_INK = ['--color-ink', '--color-ink-2', '--color-ink-3'] as const;

/**
 * Accents and status colours used as *text*, per their call sites in `src/`.
 *
 * `--color-fk` and `--color-ai` are deliberately absent: neither sets body text on an
 * arbitrary surface. `--color-fk` has exactly two uses — one word of Act 0 prose on
 * `canvas`, and an `aria-hidden` tab glyph on `chrome` — covered by their own case below.
 * The readable purple for text is `--color-ai-2`, which V4 introduced for that job and
 * which is swept here like any other.
 */
const ACCENT_TEXT = ['--color-active', '--color-warn', '--color-error', '--color-ok', '--color-ai-2'] as const;

/**
 * Tinted washes that carry same-coloured text: `bg-(--token)/N text-(--token)`. The alphas
 * are the ones actually used — /5 and /10 for the status blocks, /12 and /15 for the ranked
 * top action's rest and hover.
 */
const WASHES: [string, number][] = [
  ['--color-error', 0.05],
  ['--color-error', 0.1],
  ['--color-warn', 0.05],
  ['--color-warn', 0.1],
  ['--color-active', 0.1],
  ['--color-active', 0.12],
  ['--color-active', 0.15],
  ['--color-ink-2', 0.1],
];

/** Ink deliberately paired with a filled accent surface. */
const FILLS: [string, string][] = [
  ['--color-active-ink', '--color-active'],
  ['--color-ai-ink', '--color-ai'],
  ['--color-canvas', '--color-active'],
];

describe.each(['dark', 'light'] as const)('contrast — %s register', (register) => {
  it.each(BODY_INK)('%s clears 4.5:1 on every surface', (token) => {
    const { surface, ratio } = worstAcrossSurfaces(register, token);
    expect(ratio, `${token} on ${surface}`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ACCENT_TEXT)('%s clears 4.5:1 as text on every surface', (token) => {
    const { surface, ratio } = worstAcrossSurfaces(register, token);
    expect(ratio, `${token} on ${surface}`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(WASHES)('%s text on its own %f wash clears 4.5:1', (token, alpha) => {
    const { surface, ratio } = worstAcrossSurfaces(register, token, alpha);
    expect(ratio, `${token} on ${token}/${alpha * 100} over ${surface}`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(FILLS)('%s clears 4.5:1 on the %s fill', (ink, fill) => {
    const ratio = contrastRatio(resolve(register, ink).rgb, resolve(register, fill).rgb);
    expect(ratio, `${ink} on ${fill}`).toBeGreaterThanOrEqual(4.5);
  });

  it('the foreign-key purple clears its tier on the two surfaces it renders on', () => {
    // Prose ("…joins another…" in Act 0) on canvas is body text; the tab glyph on chrome is
    // an aria-hidden mark. If a future leaf sets --color-fk on another surface, widen this.
    expect(contrastRatio(resolve(register, '--color-fk').rgb, resolve(register, '--color-canvas').rgb)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(resolve(register, '--color-fk').rgb, resolve(register, '--color-chrome').rgb)).toBeGreaterThanOrEqual(3);
  });

  it('the focus ring clears the 3:1 non-text tier on every surface', () => {
    const { surface, ratio } = worstAcrossSurfaces(register, '--color-focus');
    expect(ratio, `--color-focus on ${surface}`).toBeGreaterThanOrEqual(3);
  });

  it('every chart slot clears 3:1 on the three surfaces a chart lands on', () => {
    for (const slot of ['--chart-1', '--chart-2', '--chart-3', '--chart-4']) {
      for (const surface of ['--color-canvas', '--color-card', '--color-elev']) {
        const ratio = contrastRatio(resolve(register, slot).rgb, resolve(register, surface).rgb);
        expect(ratio, `${slot} on ${surface}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

// ---------------------------------------------------------------- gate 2: residual literals

/**
 * The closed allowlist of files permitted to carry a resolved colour literal, each with the
 * reason `design.md` records for it. Asserted as set equality, so a new literal anywhere
 * fails — and so does an allowlist entry that has stopped being true.
 */
const LITERAL_ALLOWLIST: Record<string, string> = {
  'lib/chartPalette.ts': 'canvas 2D cannot resolve custom properties; the correlation scale needs numeric colour maths (design.md § Chart palette)',
  'lib/exportTheme.ts': 'the D63 share artifact leaves the repo and can reach neither stylesheet (design.md § Exports)',
  'features/charts/correlation/CanvasScatter.tsx': 'getComputedStyle fallbacks for the same canvas-2D reason, pinned by CanvasScatter.test.tsx',
  'features/charts/correlation/correlationColor.ts': 'builds rgb() strings from chartPalette.ts at runtime; declares no colour of its own',
};

const LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(|\boklch\(/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) return [];
    return [full];
  });
}

describe('token discipline', () => {
  it('no surface neutral is pure grey (slop gate 22)', () => {
    // Every neutral is tinted toward the anchor hue — a zero-chroma surface reads flat.
    // Caught light `--color-card` at `oklch(100% 0 262)`: pure white, and 100% lightness
    // cannot carry chroma at all, so the fix was to step it off the white point.
    const declarations = [...theme.matchAll(/--color-(?:void|canvas|chrome|panel|card|elev|footer):\s*oklch\(([\d.]+)%\s+([\d.]+)/g)];
    expect(declarations.length).toBeGreaterThanOrEqual(14); // seven surfaces, two registers
    for (const [text, , chroma] of declarations) {
      expect(Number(chroma), text.trim()).toBeGreaterThanOrEqual(0.003);
    }
  });

  it('no text colour is dimmed with an opacity modifier', () => {
    // `text-(--color-x)/NN` silently defeats every measurement above: the token clears its
    // gate and the rendered text does not. Caught `ResultsGrid`'s NULL marker at 2.9:1.
    // Muted text has a token — `--color-ink-3` — that is measured like everything else.
    const offenders = sourceFiles(SRC)
      .flatMap((file) => {
        const hits = readFileSync(file, 'utf8').match(/text-\(--color-[a-z0-9-]+\)\/\d+/g) ?? [];
        return hits.map((hit) => `${relative(SRC, file)}: ${hit}`);
      });
    expect(offenders).toEqual([]);
  });
});

describe('residual colour literals', () => {
  it('only the allowlisted files declare a colour value', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => LITERAL.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file).split('\\').join('/'))
      .sort();
    expect(offenders).toEqual(Object.keys(LITERAL_ALLOWLIST).sort());
  });

  it('the modal scrim is a token, not five copies of a literal', () => {
    expect(theme).toContain('--color-scrim:');
    const scrims = sourceFiles(SRC).filter((file) => readFileSync(file, 'utf8').includes('rgba(4, 5, 7'));
    expect(scrims).toEqual([]);
  });
});
