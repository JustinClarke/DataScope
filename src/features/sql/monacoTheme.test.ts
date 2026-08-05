import { beforeEach, describe, expect, it, vi } from 'vitest';

// The module statically imports `monaco-editor`, which needs a browser to do
// anything real — only `defineTheme` is called here, and only its argument is
// under test.
const { defineTheme } = vi.hoisted(() => ({ defineTheme: vi.fn() }));
vi.mock('monaco-editor', () => ({ editor: { defineTheme } }));

/**
 * The tokens are written in a wide-gamut syntax Monaco's theme format cannot
 * take, so the module converts them through a canvas context. jsdom has no
 * canvas, so these tests stand one in — assigning a recognised colour and
 * reading back its hex, and leaving `fillStyle` untouched on anything it does
 * not recognise, which is the contract the platform's own parser holds.
 */
/** What the spec says a untouched 2D context's `fillStyle` reads as. */
const CANVAS_DEFAULT_FILL = '#000000';

const CONVERSIONS: Record<string, string> = {
  'oklch(15.4% 0.0092 264)': '#1a1d24',
  'oklch(96.6% 0.0045 258)': '#f4f5f8',
  'oklch(65.9% 0.002 248)': '#94969b',
  'oklch(61% 0.006 262)': '#85888f',
  'oklch(76.9% 0.1647 70)': '#e59a1f',
  'oklch(22.1% 0.0132 258)': '#282c34',
  'oklch(77.3% 0.1535 163)': '#2fc79b',
};

const TOKENS: Record<string, string> = {
  '--color-canvas': 'oklch(15.4% 0.0092 264)',
  '--color-ink': 'oklch(96.6% 0.0045 258)',
  '--color-ink-2': 'oklch(65.9% 0.002 248)',
  '--color-ink-3': 'oklch(61% 0.006 262)',
  '--color-active': 'oklch(76.9% 0.1647 70)',
  '--color-elev': 'oklch(22.1% 0.0132 258)',
  '--color-ok': 'oklch(77.3% 0.1535 163)',
};

/** A fresh context per call, defaulting to the spec's own initial `fillStyle` — the baseline the module reads instead of naming. */
function installFakeCanvas(convert: (value: string) => string | null) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    let assigned = CANVAS_DEFAULT_FILL;
    return {
      set fillStyle(value: string) {
        assigned = convert(value) ?? assigned;
      },
      get fillStyle() {
        return assigned;
      },
    } as unknown as CanvasRenderingContext2D;
  });
}

function installTokens(values: Record<string, string>) {
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    getPropertyValue: (name: string) => values[name] ?? '',
  } as unknown as CSSStyleDeclaration);
}

/** The module memoises its registration, so each test needs a fresh copy of it. */
async function loadFresh() {
  vi.resetModules();
  return import('./monacoTheme');
}

describe('the console editor theme (S6.5 scope call 12)', () => {
  beforeEach(() => {
    defineTheme.mockClear();
    vi.restoreAllMocks();
  });

  it('is not Monaco’s default: the tokens are what colour the editor', async () => {
    installFakeCanvas((value) => (value.startsWith('#') ? value : (CONVERSIONS[value] ?? null)));
    installTokens(TOKENS);

    const { ensureMonacoTheme, MONACO_THEME_ID } = await loadFresh();
    ensureMonacoTheme(document.createElement('div'));

    expect(MONACO_THEME_ID).not.toBe('vs');
    expect(defineTheme).toHaveBeenCalledTimes(1);
    const [id, theme] = defineTheme.mock.calls[0];
    expect(id).toBe(MONACO_THEME_ID);
    // Dark is the HUD's primary register and jsdom's answer (`activeRegister`).
    expect(theme.base).toBe('vs-dark');
    expect(theme.colors['editor.background']).toBe(CONVERSIONS[TOKENS['--color-canvas']]);
    expect(theme.colors['editor.foreground']).toBe(CONVERSIONS[TOKENS['--color-ink']]);
    expect(theme.colors['editorCursor.foreground']).toBe(CONVERSIONS[TOKENS['--color-active']]);
    // Token rules take the same hex without its `#`.
    expect(theme.rules).toContainEqual({
      token: 'keyword',
      foreground: CONVERSIONS[TOKENS['--color-active']].slice(1),
    });
  });

  it('registers once, however many editors are created', async () => {
    installFakeCanvas((value) => (value.startsWith('#') ? value : (CONVERSIONS[value] ?? null)));
    installTokens(TOKENS);

    const { ensureMonacoTheme } = await loadFresh();
    ensureMonacoTheme(document.createElement('div'));
    ensureMonacoTheme(document.createElement('div'));
    expect(defineTheme).toHaveBeenCalledTimes(1);
  });

  // A stale literal is a wrong colour nobody notices; an omitted one is a
  // slightly-off editor Monaco's own base fills in.
  it('omits a colour it cannot resolve rather than inventing one', async () => {
    installFakeCanvas((value) => (value.startsWith('#') ? value : null));
    installTokens(TOKENS);

    const { ensureMonacoTheme } = await loadFresh();
    ensureMonacoTheme(document.createElement('div'));

    const [, theme] = defineTheme.mock.calls[0];
    expect(theme.colors).toEqual({});
    expect(theme.rules).toEqual([]);
    expect(theme.inherit).toBe(true);
  });

  it('reads the tokens from the element it is given, so a pinned register wins', async () => {
    installFakeCanvas((value) => (value.startsWith('#') ? value : (CONVERSIONS[value] ?? null)));
    installTokens(TOKENS);

    const { ensureMonacoTheme } = await loadFresh();
    const host = document.createElement('div');
    ensureMonacoTheme(host);

    expect(window.getComputedStyle).toHaveBeenCalledWith(host);
  });
});
