import { beforeEach, describe, expect, it } from "vitest";
import {
  useQueryStore,
  getSession,
  EMPTY_SESSION,
  CONSOLE_SESSION,
} from "./query";
import type { ChartSpec, QueryResult } from "../types";

const result: QueryResult = {
  columnNames: ["id"],
  columnTypes: ["BIGINT"],
  rows: [[1]],
  rowCount: 1,
  executionTimeMs: 5,
};

const chart: ChartSpec = {
  type: "distribution",
  title: "id spread",
  xField: "id",
  yFields: [],
};

beforeEach(() => {
  useQueryStore.setState({
    sessions: {},
    history: [],
    lastRunSession: CONSOLE_SESSION,
  });
});

describe("query store", () => {
  it("queryStarted marks the query running and clears prior error", () => {
    useQueryStore.getState().queryFailed(CONSOLE_SESSION, "boom");
    useQueryStore.getState().queryStarted(CONSOLE_SESSION, "SELECT 1");

    const session = getSession(CONSOLE_SESSION);
    expect(session.sql).toBe("SELECT 1");
    expect(session.lastRunSql).toBe("SELECT 1");
    expect(session.status).toBe("running");
    expect(session.error).toBeNull();
  });

  it("querySucceeded stores the result and prepends history", () => {
    useQueryStore.getState().queryStarted(CONSOLE_SESSION, "SELECT 1");
    useQueryStore.getState().querySucceeded(CONSOLE_SESSION, result);

    const state = useQueryStore.getState();
    expect(getSession(CONSOLE_SESSION).status).toBe("success");
    expect(getSession(CONSOLE_SESSION).result).toEqual(result);
    expect(state.history).toHaveLength(1);
    expect(state.history[0].sql).toBe("SELECT 1");
    expect(state.history[0].result).toEqual(result);
  });

  it("queryFailed records the error and prepends history without a result", () => {
    useQueryStore.getState().queryStarted(CONSOLE_SESSION, "SELECT bad");
    useQueryStore.getState().queryFailed(CONSOLE_SESSION, "syntax error");

    const session = getSession(CONSOLE_SESSION);
    expect(session.status).toBe("error");
    expect(session.error).toBe("syntax error");
    expect(session.result).toBeNull();
    expect(useQueryStore.getState().history[0].error).toBe("syntax error");
  });

  it("newest history entry is always first, across sessions", () => {
    useQueryStore.getState().queryStarted(CONSOLE_SESSION, "SELECT 1");
    useQueryStore.getState().querySucceeded(CONSOLE_SESSION, result);
    useQueryStore.getState().queryStarted("tab-1", "SELECT 2");
    useQueryStore
      .getState()
      .querySucceeded("tab-1", { ...result, rowCount: 2 });

    const history = useQueryStore.getState().history;
    expect(history).toHaveLength(2);
    expect(history[0].sql).toBe("SELECT 2");
    expect(history[1].sql).toBe("SELECT 1");
  });

  it("addChart/removeChart manage one session’s chart list by index", () => {
    useQueryStore.getState().addChart(CONSOLE_SESSION, chart);
    expect(getSession(CONSOLE_SESSION).charts).toEqual([chart]);

    useQueryStore.getState().removeChart(CONSOLE_SESSION, 0);
    expect(getSession(CONSOLE_SESSION).charts).toEqual([]);
  });

  it("clearResult resets one session to idle without touching history", () => {
    useQueryStore.getState().queryStarted(CONSOLE_SESSION, "SELECT 1");
    useQueryStore.getState().querySucceeded(CONSOLE_SESSION, result);
    useQueryStore.getState().clearResult(CONSOLE_SESSION);

    expect(getSession(CONSOLE_SESSION).result).toBeNull();
    expect(getSession(CONSOLE_SESSION).status).toBe("idle");
    expect(useQueryStore.getState().history).toHaveLength(1);
  });

  // S5 — the sessions themselves.
  it("sessions are independent: running one leaves the others untouched", () => {
    useQueryStore.getState().setSql(CONSOLE_SESSION, "SELECT 1");
    useQueryStore.getState().setSql("tab-1", "SELECT 2");

    useQueryStore.getState().queryStarted("tab-1", "SELECT 2");
    useQueryStore.getState().querySucceeded("tab-1", result);

    expect(getSession("tab-1").status).toBe("success");
    expect(getSession(CONSOLE_SESSION).status).toBe("idle");
    expect(getSession(CONSOLE_SESSION).result).toBeNull();
    expect(getSession(CONSOLE_SESSION).sql).toBe("SELECT 1");
  });

  it("an unknown session reads as the same empty session object every time", () => {
    expect(getSession("nobody")).toBe(EMPTY_SESSION);
    expect(getSession("nobody")).toBe(getSession("nobody-else"));
  });

  it("dropSession removes one session and leaves its siblings", () => {
    useQueryStore.getState().setSql("tab-1", "SELECT 1");
    useQueryStore.getState().setSql("tab-2", "SELECT 2");

    useQueryStore.getState().dropSession("tab-1");

    expect(getSession("tab-1")).toBe(EMPTY_SESSION);
    expect(getSession("tab-2").sql).toBe("SELECT 2");
  });

  it("lastRunSession follows whichever session started a run", () => {
    useQueryStore.getState().queryStarted(CONSOLE_SESSION, "SELECT 1");
    expect(useQueryStore.getState().lastRunSession).toBe(CONSOLE_SESSION);

    useQueryStore.getState().queryStarted("tab-1", "SELECT 2");
    expect(useQueryStore.getState().lastRunSession).toBe("tab-1");
  });

  it("adoptResult hands over a result without adding a history entry", () => {
    useQueryStore.getState().adoptResult("tab-1", result, "SELECT 1");

    expect(getSession("tab-1").result).toBe(result);
    expect(getSession("tab-1").status).toBe("success");
    expect(getSession("tab-1").lastRunSql).toBe("SELECT 1");
    expect(useQueryStore.getState().history).toHaveLength(0);
  });
});
