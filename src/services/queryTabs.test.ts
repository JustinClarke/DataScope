import { beforeEach, describe, expect, it, vi } from "vitest";
import { openQueryTab, pinConsoleQuery, closeQueryTab } from "./queryTabs";
import { useTabsStore } from "../stores/tabs";
import {
  useQueryStore,
  getSession,
  EMPTY_SESSION,
  CONSOLE_SESSION,
} from "../stores/query";
import * as runPath from "./runPath";
import * as sql from "./sql";
import type { QueryResult } from "../types";

vi.mock("./runPath", async () => {
  const actual = await vi.importActual<typeof runPath>("./runPath");
  return { ...actual, requestRun: vi.fn() };
});

vi.mock("./sql", async () => {
  const actual = await vi.importActual<typeof sql>("./sql");
  return { ...actual, cancelQuery: vi.fn() };
});

const result: QueryResult = {
  columnNames: ["n"],
  columnTypes: ["BIGINT"],
  rows: [[1]],
  rowCount: 1,
  executionTimeMs: 3,
};

beforeEach(() => {
  useTabsStore.setState({ tabs: [], activeTabId: null });
  useQueryStore.setState({
    sessions: {},
    history: [],
    lastRunSession: CONSOLE_SESSION,
  });
  vi.mocked(runPath.requestRun).mockReset();
  vi.mocked(sql.cancelQuery).mockReset();
});

describe("openQueryTab", () => {
  it("opens an artifact tab and seeds its own session", () => {
    const tabId = openQueryTab({ sql: "SELECT 1" });

    const tabs = useTabsStore.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].type).toBe("query");
    expect(tabs[0].id).toBe(tabId);
    expect(getSession(tabId).sql).toBe("SELECT 1");
  });

  it("never dedupes: the same SQL twice is two keepers", () => {
    const first = openQueryTab({ sql: "SELECT 1" });
    const second = openQueryTab({ sql: "SELECT 1" });

    expect(first).not.toBe(second);
    expect(useTabsStore.getState().tabs).toHaveLength(2);
  });

  it("names tabs Query N in sequence, and takes a supplied name instead", () => {
    const generated = useTabsStore.getState().tabs;
    expect(generated).toHaveLength(0);

    openQueryTab();
    openQueryTab();
    const names = useTabsStore.getState().tabs.map((t) => t.subject);
    expect(names[0]).toMatch(/^Query \d+$/);
    expect(names[1]).toMatch(/^Query \d+$/);
    expect(names[0]).not.toBe(names[1]);

    openQueryTab({ name: "Orders by month" });
    expect(useTabsStore.getState().tabs[2].subject).toBe("Orders by month");
  });

  it("runs nothing unless asked, and then runs in its own session", () => {
    openQueryTab({ sql: "SELECT 1" });
    expect(runPath.requestRun).not.toHaveBeenCalled();

    const tabId = openQueryTab({ sql: "SELECT 2", autoRun: true });
    expect(runPath.requestRun).toHaveBeenCalledWith("SELECT 2", tabId);
  });

  it("adopts a result already in hand without re-running it", () => {
    const tabId = openQueryTab({
      sql: "SELECT 1",
      result,
      resultSql: "SELECT 1",
    });

    expect(getSession(tabId).result).toBe(result);
    expect(getSession(tabId).status).toBe("success");
    expect(runPath.requestRun).not.toHaveBeenCalled();
  });

  it("enforces no ceiling — S0 has not reported, so no leaf invents one (§13.3)", () => {
    for (let i = 0; i < 40; i++) openQueryTab({ sql: `SELECT ${i}` });
    expect(useTabsStore.getState().tabs).toHaveLength(40);
  });
});

describe("pinConsoleQuery", () => {
  it("promotes the console buffer and its result, leaving the console untouched", () => {
    useQueryStore.getState().queryStarted(CONSOLE_SESSION, "SELECT 1");
    useQueryStore.getState().querySucceeded(CONSOLE_SESSION, result);

    const tabId = pinConsoleQuery();

    expect(tabId).not.toBeNull();
    expect(getSession(tabId!).sql).toBe("SELECT 1");
    expect(getSession(tabId!).result).toBe(result);
    expect(runPath.requestRun).not.toHaveBeenCalled();
    // One-way: the console keeps everything it had.
    expect(getSession(CONSOLE_SESSION).sql).toBe("SELECT 1");
    expect(getSession(CONSOLE_SESSION).result).toBe(result);
  });

  it("pins a query that has never run", () => {
    useQueryStore.getState().setSql(CONSOLE_SESSION, "SELECT 1");
    const tabId = pinConsoleQuery();
    expect(getSession(tabId!).sql).toBe("SELECT 1");
    expect(getSession(tabId!).result).toBeNull();
  });

  it("is a no-op on an empty buffer", () => {
    expect(pinConsoleQuery()).toBeNull();
    expect(useTabsStore.getState().tabs).toHaveLength(0);
  });
});

describe("closeQueryTab", () => {
  it("drops a query tab’s session with the tab", () => {
    const tabId = openQueryTab({ sql: "SELECT 1" });
    closeQueryTab(useTabsStore.getState().tabs[0]);

    expect(useTabsStore.getState().tabs).toHaveLength(0);
    expect(getSession(tabId)).toBe(EMPTY_SESSION);
  });

  // A closed tab must not leave a query running into a session nothing reads —
  // the memory shape Probe B is measuring, made worse by the one gesture a user
  // makes to relieve it.
  it("cancels the closed tab’s in-flight query", () => {
    const tabId = openQueryTab({ sql: "SELECT 1" });
    closeQueryTab(useTabsStore.getState().tabs[0]);

    expect(vi.mocked(sql.cancelQuery)).toHaveBeenCalledWith(tabId);
  });

  it("closes a singleton tab without touching any session", () => {
    useTabsStore.getState().openTab("pivot", "pivot");
    useQueryStore.getState().setSql(CONSOLE_SESSION, "SELECT 1");

    closeQueryTab(useTabsStore.getState().tabs[0]);

    expect(useTabsStore.getState().tabs).toHaveLength(0);
    expect(getSession(CONSOLE_SESSION).sql).toBe("SELECT 1");
  });
});
