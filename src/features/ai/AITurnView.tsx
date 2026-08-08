// One transcript turn (§11.1 — the trust model). The chat never runs hidden
// SQL: an assistant turn renders every generated query and its execution log
// (timing, row count, error, retry number) inline, plus any stage-1 typo
// correction and the stage-6 chart recommendation. This is the auditability
// surface — a user can always reconstruct what ran and why it was retried.
import { Cpu } from "lucide-react";
import type { AITurn, SqlAttempt, ChartRecommendation } from "../../types";
import { useSettingsStore } from "../../stores/settings";
import { useByokKeyStore } from "../../stores/byokKey";
import { useWebLLMStore } from "../../stores/webllm";
import { WEBLLM_DOWNLOAD_SIZE } from "../../services/webllm";
import { RunSqlButton } from "../sql/RunSqlButton";
import { AutoChartPanel } from "../sql/AutoChartPanel";
import { KpiCard } from "../../components/charts/KpiCard";

function hasWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

/**
 * Offered only on the shared-budget-exhausted turn (§11.2) — a real need to
 * switch, not a nag. Setting consent here is the whole action: the
 * always-mounted WebLLMDock (App.tsx) owns the actual download/warm-up, so
 * this never starts a second warm-up in parallel. Re-offers even after an
 * earlier decline — "not now" wasn't "never," and the budget is genuinely
 * gone right now.
 */
function QuotaExhaustedOffer() {
  const setConsent = useSettingsStore((s) => s.setWebllmConsent);
  const byokKey = useByokKeyStore((s) => s.key);
  const webllmStatus = useWebLLMStore((s) => s.status);

  // quota-exhausted only fires with no BYOK key (§11.2); still guard the rest.
  if (byokKey !== null || !hasWebGPU() || webllmStatus === "ready") return null;

  if (webllmStatus === "downloading" || webllmStatus === "warming") {
    return (
      <p className="text-xs text-(--color-fg-muted)" role="status">
        The local model is downloading — it'll take over once ready.
      </p>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded border border-(--color-border) px-3 py-2">
      <p className="flex items-center gap-2 text-xs text-(--color-fg-muted)">
        <Cpu
          size={14}
          aria-hidden="true"
          className="shrink-0 text-(--color-ai-2)"
        />
        Switch to the local model? A one-time {WEBLLM_DOWNLOAD_SIZE} download,
        then zero-egress.
      </p>
      <button
        type="button"
        onClick={() => setConsent("accepted")}
        className="shrink-0 rounded-lg bg-(--color-ai) px-3 py-1 text-xs text-(--color-ai-ink)"
      >
        Download
      </button>
    </div>
  );
}

function CorrectionNote({
  corrections,
}: {
  corrections: NonNullable<AITurn["corrections"]>;
}) {
  if (corrections.length === 0) return null;
  return (
    <p className="text-xs text-(--color-fg-muted)">
      Read {corrections.map((c) => `“${c.from}” as “${c.to}”`).join(", ")}.
    </p>
  );
}

/**
 * Disclosure for the D3 overflow (2026-07-23): the shared free budget ran out
 * mid-turn under explicit free-tier-first routing, and this answer finished on
 * the local Ollama endpoint instead — the transcript's audit trail for it.
 */
function OllamaOverflowNote() {
  return (
    <p className="text-xs text-(--color-fg-muted)">
      The shared free budget ran out mid-turn — this answer finished on your
      local Ollama endpoint.
    </p>
  );
}

// The run action is offered on failed attempts too (S4): J5 is "the AI answers,
// the user verifies by running the model's SQL," and a failed attempt is often
// the one worth running by hand to see the error first-hand. The D55 seam is
// untouched — a person reads the SQL and clicks; nothing here lets a model
// cause execution.
function AttemptView({ attempt }: { attempt: SqlAttempt }) {
  const ok = attempt.status === "ok";
  // A4: an analyst turn's second call is not necessarily a retry — it may be a
  // follow-up query, or a page read whose `sql` is the query that produced the
  // result rather than a new one. The label says which rather than guessing.
  const label =
    attempt.op === "read_result" ? "Read more rows of" : "Suggested SQL";
  return (
    <div className="flex flex-col gap-1 rounded border border-(--color-ai)/20 bg-(--color-ai-soft) p-2">
      <div className="flex items-center justify-between text-xs text-(--color-fg-muted)">
        <span>
          {label}
          {attempt.attempt > 1 ? ` · call ${attempt.attempt}` : ""}
        </span>
        <div className="flex items-center gap-3">
          <span className={ok ? "text-(--color-ai-2)" : "text-(--color-error)"}>
            {ok
              ? `✓ ${attempt.rowCount?.toLocaleString()} rows · ${Math.round(attempt.executionTimeMs)} ms`
              : "✗ failed"}
          </span>
          <RunSqlButton sql={attempt.sql} />
        </div>
      </div>
      <pre className="overflow-x-auto rounded bg-(--color-border)/40 p-2 font-mono text-xs text-(--color-fg)">
        {attempt.sql}
      </pre>
      {!ok && attempt.error && (
        <p className="font-mono text-xs text-(--color-error)">
          {attempt.error}
        </p>
      )}
      {attempt.sampledRows && (
        <p className="text-xs text-(--color-fg-muted)">
          Repair included up to 3 real sample rows — metadata-only repair was
          off for this retry.
        </p>
      )}
      {attempt.lint?.map((f) => (
        <p key={f.rule} className="text-xs text-(--color-fg-muted)">
          Lint: {f.message}
        </p>
      ))}
    </div>
  );
}

function chartLabel(chart: ChartRecommendation): string | null {
  if (chart.kind === "chart")
    return `Chart · ${chart.spec.type}: ${chart.spec.xField} × ${chart.spec.yFields.join(", ")}`;
  if (chart.kind === "kpi") return `${chart.label}: ${chart.value}`;
  return null;
}

/**
 * The turn's chart, drawn (A6) rather than described. The renderer is the same
 * deterministic one the console and every query tab use — it is handed rows and
 * a spec whose every field name came from those rows' own schema, and it
 * executes nothing. With no rows on the turn it stays the one-line label it has
 * always been, which is what a stage-6 recommendation on a released result is.
 */
function TurnChart({ turn }: { turn: AITurn }) {
  const { chart, chartResult } = turn;
  if (!chart) return null;
  if (chart.kind === "kpi")
    return <KpiCard label={chart.label} value={chart.value} />;

  const label = chartLabel(chart);
  if (chart.kind !== "chart" || !chartResult || chartResult.rows.length === 0) {
    return label ? (
      <p className="text-xs font-medium text-(--color-ai-2)">{label}</p>
    ) : null;
  }
  return <AutoChartPanel result={chartResult} spec={chart.spec} />;
}

export function AITurnView({ turn }: { turn: AITurn }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[80%] rounded-lg bg-(--color-elev) px-3 py-2 text-sm text-(--color-fg)">
          {turn.content}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="font-mono text-[length:var(--text-2xs)] uppercase tracking-[0.1em] text-(--color-ai-2)">
        ✦ Copilot
      </div>
      {turn.corrections && <CorrectionNote corrections={turn.corrections} />}
      {turn.attempts?.map((a) => (
        <AttemptView key={a.attempt} attempt={a} />
      ))}
      {turn.content && (
        <p className="text-sm text-(--color-fg)">{turn.content}</p>
      )}
      <TurnChart turn={turn} />
      {turn.servedByOllamaOverflow && <OllamaOverflowNote />}
      {turn.error && (
        <p className="rounded border border-(--color-error)/40 bg-(--color-error)/10 px-3 py-2 text-sm text-(--color-error)">
          {turn.error}
        </p>
      )}
      {turn.quotaExhausted && <QuotaExhaustedOffer />}
    </div>
  );
}
