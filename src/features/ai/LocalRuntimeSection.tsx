// "Local runtime" — what the Ollama daemon is holding in memory, and the two
// controls the browser genuinely has over it.
//
// This section exists because the honest answer to "does closing the tab stop
// Ollama?" is no, and nothing in the app said so. Ollama is a separate daemon:
// it keeps running, and it keeps the model resident for the request's
// `keep_alive` — 30m by default here — whether or not a tab is still open. On
// a memory-constrained machine that is gigabytes held after the user has walked
// away, with no indication anywhere that it is happening.
//
// What a web page may do about it is exactly two things, and the copy here does
// not overstate either: it can end a model's residency (`keep_alive: 0`, which
// the daemon answers with `done_reason: "unload"`), and it can ask for a
// shorter residency next time. It **cannot stop the daemon** — Ollama exposes
// no shutdown endpoint — so there is no "kill Ollama" control here, because
// there is no such thing to wire it to.
import { useCallback, useEffect, useState } from "react";
import { useSettingsStore } from "../../stores/settings";
import {
  listRunningOllamaModels,
  unloadOllamaModel,
  type OllamaRunningModel,
} from "../../services/ollamaProvider";
import { formatBytes } from "../../lib/formatBytes";
import { Section, HudButton, FieldNote } from "./settingsChrome";

/** Residency windows worth offering. `0` is real: it unloads after every answer. */
const KEEP_ALIVE_CHOICES: { value: string; label: string; note: string }[] = [
  { value: "0", label: "Don’t keep it", note: "frees memory after every answer — every question then pays the load again" },
  { value: "5m", label: "5 minutes", note: "a short session stays warm; memory comes back soon after you stop" },
  { value: "30m", label: "30 minutes", note: "stays warm across a work session" },
  { value: "2h", label: "2 hours", note: "for a long session — holds the memory that whole time" },
];

/** How long until the daemon drops it on its own, in the user's terms. */
function untilExpiry(expiresAt: Date | null, now: number): string | null {
  if (expiresAt === null) return null;
  const minutes = Math.round((expiresAt.getTime() - now) / 60_000);
  if (minutes <= 0) return "expiring now";
  if (minutes < 60) return `frees in ${minutes}m`;
  return `frees in ${Math.round(minutes / 60)}h`;
}

export function LocalRuntimeSection({ baseUrl }: { baseUrl: string }) {
  const keepAlive = useSettingsStore((s) => s.ollamaKeepAlive);
  const setKeepAlive = useSettingsStore((s) => s.setOllamaKeepAlive);
  const [running, setRunning] = useState<OllamaRunningModel[]>([]);
  const [probed, setProbed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const found = await listRunningOllamaModels({ baseUrl, signal });
      if (signal?.aborted === true) return;
      setRunning(found);
      setProbed(true);
      setNow(Date.now());
    },
    [baseUrl],
  );

  // Poll while the panel is open: residency is a live fact — a model expires on
  // its own, and another tab or terminal can load one. A stale list here would
  // be worse than none, because the whole point is telling the user what is
  // held *right now*.
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = setInterval(() => void refresh(controller.signal), 5_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [refresh]);

  const unload = async (model: string) => {
    setBusy(model);
    try {
      await unloadOllamaModel(model, { baseUrl });
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const totalBytes = running.reduce((n, m) => n + m.sizeBytes, 0);

  return (
    <Section title="Local runtime">
      <FieldNote>
        Ollama runs as its own program on this machine, not in the browser.
        Closing this tab does not stop it, and does not free the model — the
        daemon keeps it in memory for the window below, then drops it. This
        page can unload a model or shorten that window; it cannot stop the
        daemon itself.
      </FieldNote>

      <div className="rounded-(--radius-md) border border-(--color-rule) bg-(--color-card)">
        <div className="flex items-baseline justify-between border-b border-(--color-rule) px-3 py-2">
          <span className="micro text-(--color-ink-3)">In memory now</span>
          {running.length > 0 && (
            <span className="font-mono text-xs text-(--color-ink-2)">
              {formatBytes(totalBytes)}
            </span>
          )}
        </div>

        {running.length === 0 ? (
          <p className="px-3 py-3 font-mono text-xs text-(--color-ink-3)">
            {probed
              ? "Nothing resident — no memory held."
              : "Checking the daemon…"}
          </p>
        ) : (
          <ul>
            {running.map((m) => {
              const expiry = untilExpiry(m.expiresAt, now);
              return (
                <li
                  key={m.name}
                  className="flex items-center justify-between gap-3 border-b border-(--color-rule) px-3 py-2 last:border-b-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-xs text-(--color-ink)">
                      {m.name}
                    </span>
                    <span className="font-mono text-2xs text-(--color-ink-3)">
                      {formatBytes(m.sizeBytes)}
                      {expiry !== null && ` · ${expiry}`}
                    </span>
                  </span>
                  <HudButton
                    onClick={() => void unload(m.name)}
                    disabled={busy !== null}
                    aria-label={`Unload ${m.name}`}
                  >
                    {busy === m.name ? "Unloading…" : "Unload"}
                  </HudButton>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {running.length > 1 && (
        <HudButton
          onClick={() => void (async () => {
            for (const m of running) await unload(m.name);
          })()}
          disabled={busy !== null}
        >
          Unload all
        </HudButton>
      )}

      <div>
        <label
          htmlFor="ollama-keep-alive"
          className="block font-mono text-xs text-(--color-ink)"
        >
          Keep the model in memory for
        </label>
        <select
          id="ollama-keep-alive"
          value={keepAlive}
          onChange={(e) => setKeepAlive(e.target.value)}
          className="mt-1 w-full rounded-(--radius-md) border border-(--color-rule) bg-(--color-panel) px-3 py-2 font-mono text-xs text-(--color-ink)"
        >
          {/* A window set elsewhere (or an older build) stays listed rather than
              silently snapping the user to one of ours. */}
          {!KEEP_ALIVE_CHOICES.some((c) => c.value === keepAlive) && (
            <option value={keepAlive}>{keepAlive}</option>
          )}
          {KEEP_ALIVE_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <FieldNote>
          {KEEP_ALIVE_CHOICES.find((c) => c.value === keepAlive)?.note ??
            "Applies to your next question."}{" "}
          Takes effect on your next question.
        </FieldNote>
      </div>
    </Section>
  );
}
