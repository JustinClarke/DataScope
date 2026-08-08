// Query tabs (S5, D73, master §13.3) — the artifact tab kind's first live
// member, and the single creation path both of its producers use:
// pin-from-console (here) and a chosen Suggested Exploration (S6, which calls
// `openQueryTab` with `autoRun`). A query tab's session id *is* its tab id, so
// nothing has to keep a second mapping in sync.
//
// No ceiling is enforced. §13.3: the number and the at-the-ceiling behaviour
// (refuse vs. evict) are a memory measurement — `00-synthesis-and-limits-
// probe.md`'s Probe B — and "until it reports, no ceiling is written into a
// leaf doc." When it does, this is the one function that changes.
import { useTabsStore } from "../stores/tabs";
import { useQueryStore, getSession, CONSOLE_SESSION } from "../stores/query";
import { cancelQuery } from "./sql";
import { requestRun } from "./runPath";
import { TAB_KIND, type TabSpec } from "../types/tabs";
import type { QueryResult } from "../types";

interface OpenQueryTabOptions {
  /** Seeds the tab's editor. Absent for an empty tab. */
  sql?: string;
  /** The tab's name. Defaults to `Query N`. */
  name?: string;
  /** Run on creation — the pre-run producer (§13.3: "born already running"). */
  autoRun?: boolean;
  /** A result already in hand, adopted by reference rather than re-run (Pin). */
  result?: QueryResult;
  /** The statement that produced `result` — only meaningful alongside it. */
  resultSql?: string;
}

let nextQueryNumber = 0;

/** The single creation path for both producers. Returns the new tab's id. */
export function openQueryTab({
  sql,
  name,
  autoRun,
  result,
  resultSql,
}: OpenQueryTabOptions = {}): string {
  const label = name ?? `Query ${++nextQueryNumber}`;
  // `TAB_KIND.query === 'artifact'`, so `openTab` never dedupes this — two
  // pins of the same SQL are two keepers, deliberately.
  const tabId = useTabsStore.getState().openTab("query", label);

  if (sql) useQueryStore.getState().setSql(tabId, sql);
  if (result)
    useQueryStore.getState().adoptResult(tabId, result, resultSql ?? sql ?? "");
  // Never `runInConsole` — that is the console's entry, and routing a tab's own
  // run through it would defeat the independence the tab exists for.
  if (autoRun && sql) requestRun(sql, tabId);

  return tabId;
}

/**
 * Pin: promote the console's buffer, and whatever it is showing, into a keeper.
 * One-way and explicit (§13.3) — the console is left exactly as it was, and
 * there is no un-pin.
 */
export function pinConsoleQuery(): string | null {
  const consoleSession = getSession(CONSOLE_SESSION);
  const sql = consoleSession.sql.trim();
  if (!sql) return null;
  return openQueryTab({
    sql,
    result: consoleSession.result ?? undefined,
    resultSql: consoleSession.lastRunSql,
  });
}

/**
 * Closes any tab. An artifact tab's session goes with it — otherwise the store
 * keeps a result per closed tab, which is the memory shape Probe B is measuring,
 * made worse by the one gesture a user makes to relieve it.
 */
export function closeQueryTab(tab: TabSpec): void {
  if (TAB_KIND[tab.type] === "artifact") {
    cancelQuery(tab.id);
    useQueryStore.getState().dropSession(tab.id);
  }
  useTabsStore.getState().closeTab(tab.id);
}
