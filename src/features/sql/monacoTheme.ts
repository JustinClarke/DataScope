// Monaco ships its own stylesheet and reads none of the app's CSS custom
// properties, so an editor created without a `theme` is Monaco's default `vs`
// — a light-theme rectangle pasted into the HUD's dark register. Since S6.5 the
// console is visible in every open drawer, so that is no longer a corner of the
// app: it is half of it.
//
// This is the same category V6b named for the canvas charts — a path that
// cannot resolve a `var()` — but with the opposite conclusion about literals.
// `lib/chartPalette.ts` carries resolved values because its palette has its own
// section in `design.md` to be checked against. The editor has no palette of
// its own: it borrows the surface tokens. So every colour here is read from the
// live computed tokens and converted, and this file declares none.
import * as monaco from 'monaco-editor';
import { activeRegister } from '../../lib/chartPalette';

export const MONACO_THEME_ID = 'datascope-hud';

/**
 * A canvas 2D context is the one colour parser in the platform that takes the
 * wide-gamut syntax the tokens are written in and hands back the `#rrggbb`
 * Monaco's theme format requires.
 *
 * An unparseable assignment leaves `fillStyle` at its previous value rather
 * than throwing — so a *fresh* context per call gives a baseline to compare
 * against, and "unchanged" is how a failed parse is told apart from a
 * successful one. Reading the baseline rather than naming it keeps this file
 * free of a colour literal of its own; a token that genuinely resolved to the
 * context's default would be read as a failure and fall back to Monaco's base,
 * which beats silently painting the editor that colour.
 */
function hexFrom(value: string): string | null {
  if (!value) return null;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return null;

  const untouched = ctx.fillStyle;
  ctx.fillStyle = value;
  const normalized = ctx.fillStyle;
  if (typeof normalized !== 'string' || normalized === untouched) return null;
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : null;
}

/** Monaco takes `colors` with a leading `#` and `rules[].foreground` without one. */
const bare = (hex: string): string => hex.slice(1);

let defined = false;

/**
 * Registers the editor theme against whichever register is live on `element`.
 * Tokens that cannot be resolved are omitted rather than guessed, so Monaco's
 * own `vs-dark`/`vs` base fills the gap: a slightly-off editor beats a stale
 * literal nobody notices has drifted.
 */
export function ensureMonacoTheme(element: HTMLElement): void {
  if (defined) return;
  defined = true;

  const computed = getComputedStyle(element);
  const token = (name: string): string | null => hexFrom(computed.getPropertyValue(name).trim());

  const canvas = token('--color-canvas');
  const ink = token('--color-ink');
  const ink2 = token('--color-ink-2');
  const ink3 = token('--color-ink-3');
  const active = token('--color-active');
  const elev = token('--color-elev');
  const ok = token('--color-ok');

  const colors: Record<string, string> = {};
  if (canvas) colors['editor.background'] = canvas;
  if (ink) colors['editor.foreground'] = ink;
  if (elev) colors['editor.lineHighlightBackground'] = elev;
  if (elev) colors['editorSuggestWidget.background'] = elev;
  if (active) colors['editorCursor.foreground'] = active;
  if (ink3) colors['editorLineNumber.foreground'] = ink3;
  if (ink2) colors['editorLineNumber.activeForeground'] = ink2;

  const rules: monaco.editor.ITokenThemeRule[] = [];
  if (active) rules.push({ token: 'keyword', foreground: bare(active) });
  if (ok) rules.push({ token: 'string', foreground: bare(ok) });
  if (ink2) rules.push({ token: 'number', foreground: bare(ink2) });
  if (ink3) rules.push({ token: 'comment', foreground: bare(ink3), fontStyle: 'italic' });

  monaco.editor.defineTheme(MONACO_THEME_ID, {
    base: activeRegister() === 'light' ? 'vs' : 'vs-dark',
    inherit: true,
    rules,
    colors,
  });
}
