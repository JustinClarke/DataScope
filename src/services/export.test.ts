import { describe, expect, it, vi } from "vitest";
import { saveToCloud, getSharedObject, deleteShare } from "./export";

const ENDPOINT = "https://edge.test/persistence";
const BUFFER = new Uint8Array([1, 2, 3, 4]);

function jsonFetch(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...headers },
      }),
    ),
  );
}

describe("saveToCloud", () => {
  it("POSTs the buffer with a sessionId query param and returns the token + delete proof", async () => {
    const fetchImpl = jsonFetch(200, {
      token: "tok-1",
      deleteToken: "del-1",
      ttlSeconds: 2_592_000,
    });
    const result = await saveToCloud(BUFFER, "application/vnd.apache.parquet", {
      endpoint: ENDPOINT,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({
      ok: true,
      token: "tok-1",
      deleteToken: "del-1",
      ttlSeconds: 2_592_000,
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toMatch(/^https:\/\/edge\.test\/persistence\?sessionId=/);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(BUFFER);
    expect((init.headers as Record<string, string>)["content-type"]).toBe(
      "application/vnd.apache.parquet",
    );
  });

  it("surfaces a typed error code (e.g. rate-limited) rather than throwing", async () => {
    const result = await saveToCloud(BUFFER, "application/json", {
      endpoint: ENDPOINT,
      fetchImpl: jsonFetch(429, {
        error: "rate-limited",
      }) as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: false, code: "rate-limited" });
  });

  it("reports unreachable rather than throwing on a network failure", async () => {
    const result = await saveToCloud(BUFFER, "application/json", {
      endpoint: ENDPOINT,
      fetchImpl: (() =>
        Promise.reject(new Error("offline"))) as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: false, code: "unreachable" });
  });
});

describe("getSharedObject", () => {
  it("fetches by token and returns the raw bytes plus content-type", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        new Response(BUFFER, {
          status: 200,
          headers: { "content-type": "application/vnd.apache.parquet" },
        }),
      ),
    );
    const result = await getSharedObject("tok-1", {
      endpoint: ENDPOINT,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect([...result.buffer]).toEqual([...BUFFER]);
      expect(result.contentType).toBe("application/vnd.apache.parquet");
    }
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe(`${ENDPOINT}?token=tok-1`);
  });

  it("reports not-found for an unknown token", async () => {
    const result = await getSharedObject("gone", {
      endpoint: ENDPOINT,
      fetchImpl: jsonFetch(404, {
        error: "not-found",
      }) as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: false, code: "not-found" });
  });
});

describe("deleteShare", () => {
  it("POSTs op=delete with the token and ownership proof", async () => {
    const fetchImpl = jsonFetch(200, { deleted: true });
    const result = await deleteShare("tok-1", "del-1", {
      endpoint: ENDPOINT,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(`${ENDPOINT}?op=delete&token=tok-1&deleteToken=del-1`);
    expect(init.method).toBe("POST");
  });

  it("treats an already-absent object as deleted — the user’s intent holds", async () => {
    const result = await deleteShare("tok-1", "del-1", {
      endpoint: ENDPOINT,
      fetchImpl: jsonFetch(404, {
        error: "not-found",
      }) as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: true });
  });

  it("reports an unreachable endpoint instead of throwing", async () => {
    const result = await deleteShare("tok-1", "del-1", {
      endpoint: ENDPOINT,
      fetchImpl: (() =>
        Promise.reject(new Error("offline"))) as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: false, code: "unreachable" });
  });

  it("surfaces a non-not-found failure code (e.g. paused) as a real failure, not success", async () => {
    const result = await deleteShare("tok-1", "del-1", {
      endpoint: ENDPOINT,
      fetchImpl: jsonFetch(503, { error: "paused" }) as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: false, code: "paused" });
  });
});
