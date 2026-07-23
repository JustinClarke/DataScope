// One transcript turn (§11.1 — the trust model). The chat never runs hidden
// SQL: an assistant turn renders every generated query and its execution log
// (timing, row count, error, retry number) inline, plus any stage-1 typo
// correction and the stage-6 chart recommendation. This is the auditability
// surface — a user can always reconstruct what ran and why it was retried.
import { Cpu } from 'lucide-react';
import type { AITurn, SqlAttempt, ChartRecommendation } from '../../types';
import { useSettingsStore } from '../../stores/settings';
import { useByokKeyStore } from '../../stores/byokKey';
import { useWebLLMStore } from '../../stores/webllm';
import { WEBLLM_DOWNLOAD_SIZE } from '../../services/webllm';

function hasWebGPU(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
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
  if (byokKey !== null || !hasWebGPU() || webllmStatus === 'ready') return null;

  if (webllmStatus === 'downloading' || webllmStatus === 'warming') {
    return (
      <p className="text-xs text-(--color-fg-muted)" role="status">
        The local model is downloading — it'll take over once ready.
      </p>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded border border-(--color-border) px-3 py-2">
      <p className="flex items-center gap-2 text-xs text-(--color-fg-muted)">
        <Cpu size={14} aria-hidden="true" className="shrink-0 text-(--color-accent)" />
        Switch to the local model? A one-time {WEBLLM_DOWNLOAD_SIZE} download, then zero-egress.
      </p>
      <button
        type="button"
        onClick={() => setConsent('accepted')}
        className="shrink-0 rounded-lg bg-(--color-accent) px-3 py-1 text-xs text-(--color-bg)"
      >
        Download
      </button>
    </div>
  );
}

function CorrectionNote({ corrections }: { corrections: NonNullable<AITurn['corrections']> }) {
  if (corrections.length === 0) return null;
  return (
    <p className="text-xs text-(--color-fg-muted)">
      Read {corrections.map((c) => `“${c.from}” as “${c.to}”`).join(', ')}.
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
      The shared free budget ran out mid-turn — this answer finished on your local Ollama endpoint.
    </p>
  );
}

function AttemptView({ attempt }: { attempt: SqlAttempt }) {
  const ok = attempt.status === 'ok';
  return (
    <div className="flex flex-col gap-1 rounded border border-(--color-border) p-2">
      <div className="flex items-center justify-between text-xs text-(--color-fg-muted)">
        <span>Suggested SQL{attempt.attempt > 1 ? ` · retry ${attempt.attempt - 1}` : ''}</span>
        <span className={ok ? 'text-(--color-accent)' : 'text-red-500'}>
          {ok
            ? `✓ ${attempt.rowCount?.toLocaleString()} rows · ${Math.round(attempt.executionTimeMs)} ms`
            : '✗ failed'}
        </span>
      </div>
      <pre className="overflow-x-auto rounded bg-(--color-border)/40 p-2 font-mono text-xs text-(--color-fg)">{attempt.sql}</pre>
      {!ok && attempt.error && <p className="font-mono text-xs text-red-500">{attempt.error}</p>}
      {attempt.sampledRows && (
        <p className="text-xs text-(--color-fg-muted)">
          Repair included up to 3 real sample rows — metadata-only repair was off for this retry.
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
  if (chart.kind === 'chart') return `Chart · ${chart.spec.type}: ${chart.spec.xField} × ${chart.spec.yFields.join(', ')}`;
  if (chart.kind === 'kpi') return `${chart.label}: ${chart.value}`;
  return null;
}

export function AITurnView({ turn }: { turn: AITurn }) {
  if (turn.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[80%] rounded-lg bg-(--color-accent)/15 px-3 py-2 text-sm text-(--color-fg)">{turn.content}</p>
      </div>
    );
  }

  const chart = turn.chart ? chartLabel(turn.chart) : null;
  return (
    <div className="flex flex-col gap-2">
      {turn.corrections && <CorrectionNote corrections={turn.corrections} />}
      {turn.attempts?.map((a) => <AttemptView key={a.attempt} attempt={a} />)}
      {turn.content && <p className="text-sm text-(--color-fg)">{turn.content}</p>}
      {chart && <p className="text-xs font-medium text-(--color-accent)">{chart}</p>}
      {turn.servedByOllamaOverflow && <OllamaOverflowNote />}
      {turn.error && (
        <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">{turn.error}</p>
      )}
      {turn.quotaExhausted && <QuotaExhaustedOffer />}
    </div>
  );
}
