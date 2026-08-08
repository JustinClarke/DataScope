import { describe, expect, it, vi } from "vitest";
import { storeVaultedKey, deleteVaultedKey } from "./vaultClient";

const ENDPOINT = "https://edge.test/vault";
const KEY = "sk-live-secret-123";

function jsonFetch(status: number, body: unknown) {
  return vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

describe("vaultClient — store", () => {
  it("sends the key once and returns the reference", async () => {
    const fetchImpl = jsonFetch(200, { ref: "ref-abc" });
    const result = await storeVaultedKey(
      { sessionId: "sess-1", provider: "openai", key: KEY },
      { endpoint: ENDPOINT, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result).toEqual({ ok: true, ref: "ref-abc" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(ENDPOINT);
    expect(JSON.parse(String(init.body))).toEqual({
      op: "store",
      sessionId: "sess-1",
      provider: "openai",
      key: KEY,
    });
  });

  it("surfaces the endpoint’s typed code so the UI can be specific", async () => {
    const result = await storeVaultedKey(
      { sessionId: "sess-1", provider: "openai", key: KEY },
      {
        endpoint: ENDPOINT,
        fetchImpl: jsonFetch(503, {
          error: "unavailable",
        }) as unknown as typeof fetch,
      },
    );
    expect(result).toEqual({ ok: false, code: "unavailable" });
  });

  it("reports an unreachable vault rather than throwing", async () => {
    const result = await storeVaultedKey(
      { sessionId: "sess-1", provider: "openai", key: KEY },
      {
        endpoint: ENDPOINT,
        fetchImpl: (() =>
          Promise.reject(new Error("offline"))) as unknown as typeof fetch,
      },
    );
    expect(result).toEqual({ ok: false, code: "unreachable" });
  });
});

describe("vaultClient — delete", () => {
  it("deletes by reference", async () => {
    const fetchImpl = jsonFetch(200, { deleted: true });
    const result = await deleteVaultedKey(
      { sessionId: "sess-1", ref: "ref-abc" },
      { endpoint: ENDPOINT, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result).toEqual({ ok: true });
    expect(
      JSON.parse(
        String(
          (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body,
        ),
      ),
    ).toEqual({
      op: "delete",
      sessionId: "sess-1",
      ref: "ref-abc",
    });
  });

  it("treats an already-absent record as deleted — the user’s intent holds", async () => {
    const result = await deleteVaultedKey(
      { sessionId: "sess-1", ref: "gone" },
      {
        endpoint: ENDPOINT,
        fetchImpl: jsonFetch(404, {
          error: "not-found",
        }) as unknown as typeof fetch,
      },
    );
    expect(result).toEqual({ ok: true });
  });

  it("reports a failed delete instead of pretending the key is gone", async () => {
    const result = await deleteVaultedKey(
      { sessionId: "sess-1", ref: "ref-abc" },
      {
        endpoint: ENDPOINT,
        fetchImpl: (() =>
          Promise.reject(new Error("offline"))) as unknown as typeof fetch,
      },
    );
    expect(result).toEqual({ ok: false, code: "unreachable" });
  });
});
