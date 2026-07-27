// Tab envelope contract (W0, D71, master §13.3) — the D55 generalization:
// serializability is orthogonal to safety, so the tab *envelope* is authored
// only by app code, never by a model or any untyped payload. The only way to
// set these fields is through `stores/tabs.ts`'s `openTab` parameters; there
// is no spread/cast path into a `TabSpec`. Model output may only ever enter
// as a validated *inner* artifact spec (ChartSpec/ViewSpec, `producerValidators`
// in `types/producers.ts`) — never as the envelope itself.
import type { LucideIcon } from 'lucide-react';
import { Table, Terminal, LayoutGrid, BarChart3, GitCompareArrows, Download } from 'lucide-react';
import type { ThreadConfig } from './actions';

/**
 * The closed tab-type registry. Adding a member is a compile-time, reviewed
 * change, never a runtime string — the same discipline as `SidebarModule`
 * (`stores/ui.ts`). W0 seeded the `'map'` placeholder; W2 adds `'profile'`
 * (the explorer's click-to-Profile destination, D68d); W7.5 adds `'sql'` /
 * `'pivot'` / `'charts'` / `'correlation'` / `'export'`, closing the last of
 * the §13.0/§6-inventory feature homes named in W5's `NOT_YET_WIRED` list.
 */
export type TabType = 'map' | 'profile' | 'sql' | 'pivot' | 'charts' | 'correlation' | 'export';

/** The app-authored envelope (D55/D71). */
export interface TabSpec {
  id: string;
  type: TabType;
  /** The identity a singleton tab is keyed on — dedup enforced in `stores/tabs.ts` (W3). */
  subject: string;
  /** The D68e `ThreadConfig`-shaped prefill, set atomically with the tab's creation. */
  initializer: ThreadConfig | null;
}

/**
 * Workspace tabs are singletons per `(type, subject)`; artifact tabs (a
 * pinned chart, a produced result) are per-artifact and never dedupe (§13.3
 * "the canvas and the tab model"). `Record` over the closed `TabType` union
 * forces every member to be classified — the same discipline `TabType`
 * itself follows.
 */
export type TabKind = 'singleton' | 'artifact';

/**
 * No artifact-kind member exists yet. SQL/Pivot/Charts/Correlation/Export
 * (W7.5) are all `'singleton'` — none of these are per-table; each mirrors
 * the old shell's own single-instance-per-module behavior (one SQL
 * playground, one Pivot builder, etc.), the same reasoning `'map'` already
 * used for its fixed `MAP_TAB_SUBJECT`.
 */
export const TAB_KIND: Record<TabType, TabKind> = {
  map: 'singleton',
  profile: 'singleton',
  sql: 'singleton',
  pivot: 'singleton',
  charts: 'singleton',
  correlation: 'singleton',
  export: 'singleton',
};

/**
 * Per-`TabType` tab-strip glyph (V2, `design.md` Iconography). `map` keeps the
 * mock's `◈` dingbat verbatim; every other type gets a `lucide-react` line
 * icon — the dingbat set is closed at six characters, each already carrying a
 * semantic role, not a bottomless glyph well.
 */
export type TabGlyph = { kind: 'dingbat'; char: string } | { kind: 'icon'; Icon: LucideIcon };

export const TAB_GLYPH: Record<TabType, TabGlyph> = {
  map: { kind: 'dingbat', char: '◈' },
  profile: { kind: 'icon', Icon: Table },
  sql: { kind: 'icon', Icon: Terminal },
  pivot: { kind: 'icon', Icon: LayoutGrid },
  charts: { kind: 'icon', Icon: BarChart3 },
  correlation: { kind: 'icon', Icon: GitCompareArrows },
  export: { kind: 'icon', Icon: Download },
};
