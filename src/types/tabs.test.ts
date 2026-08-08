import { describe, expect, it } from "vitest";
import {
  TAB_KIND,
  TAB_GLYPH,
  tabLabel,
  type TabSpec,
  type TabType,
} from "./tabs";
import { useTabsStore } from "../stores/tabs";
import { HISTORY_TAB_SUBJECT } from "../features/sql/HistoryTab";

function tab(type: TabType, subject: string): TabSpec {
  return { id: "tab-1", type, subject, initializer: null };
}

// The registry amendment D73 call (2) lands as one change (S5).
describe("the tab registry after D73", () => {
  it("is eight singletons + one artifact type", () => {
    const kinds = Object.values(TAB_KIND);
    expect(kinds.filter((k) => k === "singleton")).toHaveLength(8);
    expect(kinds.filter((k) => k === "artifact")).toHaveLength(1);
    expect(TAB_KIND.query).toBe("artifact");
  });

  // S6.7: one run log per session, never per-table — the same reasoning `map`
  // and `export` already carry.
  it("makes history a singleton, and repeat opens dedupe to one tab", () => {
    expect(TAB_KIND.history).toBe("singleton");
    useTabsStore.setState({ tabs: [], activeTabId: null });
    const first = useTabsStore
      .getState()
      .openTab("history", HISTORY_TAB_SUBJECT);
    const second = useTabsStore
      .getState()
      .openTab("history", HISTORY_TAB_SUBJECT);
    expect(second).toBe(first);
    expect(useTabsStore.getState().tabs).toHaveLength(1);
  });

  it("has no sql member — SQL is written in the drawer console now", () => {
    expect(Object.keys(TAB_KIND)).not.toContain("sql");
    expect(Object.keys(TAB_GLYPH)).not.toContain("sql");
  });

  it("keeps export as a tab — only its entry point moved", () => {
    expect(TAB_KIND.export).toBe("singleton");
  });

  it("names no settings tab: settings stays the overlay the code ships (D73 reversal 3)", () => {
    expect(Object.keys(TAB_KIND)).not.toContain("settings");
  });

  it("classifies and gives a glyph to every member, with no gaps", () => {
    for (const type of Object.keys(TAB_KIND) as TabType[]) {
      expect(TAB_GLYPH[type]).toBeTruthy();
    }
  });
});

describe("tabLabel", () => {
  it("prints an artifact tab’s own name, without the type prefix", () => {
    expect(tabLabel(tab("query", "Query 3"))).toBe("Query 3");
  });

  it("keeps type · subject for a singleton, where the type is the identity", () => {
    expect(tabLabel(tab("profile", "orders"))).toBe("profile · orders");
  });
});
