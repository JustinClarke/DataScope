// The single door (A0, master §11.5, D74).
//
// Every operation enters here, so the answers to "how is this cancelled?",
// "what happens at the timeout?" and "can two queries run at once?" do not
// depend on which operation was called. That is the same discipline v0.70's S4
// applied to the app's run path, one level up: one path, not one path per
// caller.
import { applyAuthority, type AuthorityProfile, type AuthorityReport } from './authority';
import { opError } from './errors';
import {
  OPERATIONS,
  OPERATION_NAMES,
  unknownOperation,
  type OpContext,
  type OperationParams,
  type OpName,
} from './operations';
import { DEFAULT_MAX_BYTES, ResultStore } from './resultStore';
import type { Catalog, EngineId, Executor, OpOutcome, Workspace } from './types';

export const DEFAULT_TIMEOUT_MS = 30_000;

export interface AnalystCoreOptions {
  /** Ceiling on retained materializations. The default is A0's measured number — see `00-analyst-core.md`. */
  maxResultBytes?: number;
  timeoutMs?: number;
  /** `shared` is what a tab can apply without ending ingestion; `sealed` is the full §11.5 lockdown, for a process the core owns. See `authority.ts`. */
  authority?: AuthorityProfile;
  /** The host's registry seam (A3). Omitted, the core is read-only: `derive_table`, `create_view` and `drop_derived` refuse. See `types.ts`. */
  catalog?: Catalog;
  /** The host's workspace seam (A6). Omitted, the core is headless: `pin_result` refuses. See `types.ts`. */
  workspace?: Workspace;
}

export interface AnalystCore {
  readonly engine: EngineId;
  /** Typed door — the call site gets parameter checking; the handler still validates. */
  call<K extends OpName>(
    op: K,
    params: OperationParams[K],
    options?: { signal?: AbortSignal },
  ): Promise<OpOutcome>;
  /** Untyped door, for arguments that arrived from a model or over a protocol. */
  invoke(op: string, params: unknown, options?: { signal?: AbortSignal }): Promise<OpOutcome>;
  /** Applies the engine-level authority configuration once; safe to await repeatedly. */
  ready(): Promise<AuthorityReport>;
  /** Record that a result informed a statement, so compaction retains it ahead of merely recent ones (D74h). */
  noteContribution(resultId: string): void;
  readonly store: ResultStore;
  close(): Promise<void>;
}

/**
 * `AbortSignal.any` exists in every runtime DataScope targets, but jsdom's
 * `AbortSignal` has historically lagged the spec and the test environment is
 * jsdom — a six-line combiner is cheaper than finding that out in CI.
 */
function combineSignals(signals: AbortSignal[]): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const forward = (source: AbortSignal) => () => controller.abort(source.reason);
  const handlers = signals.map((source) => {
    const handler = forward(source);
    if (source.aborted) handler();
    else source.addEventListener('abort', handler, { once: true });
    return { source, handler };
  });
  return {
    signal: controller.signal,
    dispose: () => handlers.forEach(({ source, handler }) => source.removeEventListener('abort', handler)),
  };
}

export function createAnalystCore(executor: Executor, options: AnalystCoreOptions = {}): AnalystCore {
  const store = new ResultStore(executor, options.maxResultBytes ?? DEFAULT_MAX_BYTES);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const profile: AuthorityProfile = options.authority ?? 'shared';

  let authority: Promise<AuthorityReport> | null = null;
  // One query at a time (§11.5, §21.6). Operations queue rather than refuse:
  // refusing would make every caller implement its own retry, and the engine
  // serializes them anyway.
  let queue: Promise<unknown> = Promise.resolve();

  function ready(): Promise<AuthorityReport> {
    if (!authority) authority = applyAuthority(executor, profile);
    return authority;
  }

  async function runOne(op: string, params: unknown, callerSignal?: AbortSignal): Promise<OpOutcome> {
    if (!OPERATION_NAMES.includes(op as OpName)) return unknownOperation(op);
    if (params !== undefined && params !== null && typeof params !== 'object') {
      return opError('invalid_argument', 'params must be an object.');
    }
    if (callerSignal?.aborted) return opError('cancelled', 'The operation was cancelled.');

    await ready();

    const timer = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      timer.abort();
    }, timeoutMs);
    const combined = combineSignals(callerSignal ? [callerSignal, timer.signal] : [timer.signal]);
    const ctx: OpContext = {
      executor,
      store,
      signal: combined.signal,
      catalog: options.catalog,
      workspace: options.workspace,
    };

    try {
      const outcome = await OPERATIONS[op as OpName](
        (params ?? {}) as Record<string, unknown>,
        ctx,
      );
      // A timeout reaches the handler as an abort, so the handler reports
      // `cancelled`; only this frame knows which of the two it was.
      if (timedOut) return opError('timeout', `The operation exceeded the ${timeoutMs} ms limit.`);
      return outcome;
    } finally {
      clearTimeout(timeout);
      combined.dispose();
    }
  }

  function invoke(op: string, params: unknown, callOptions?: { signal?: AbortSignal }): Promise<OpOutcome> {
    const run = queue.then(
      () => runOne(op, params, callOptions?.signal),
      () => runOne(op, params, callOptions?.signal),
    );
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  return {
    engine: executor.engine,
    call: (op, params, callOptions) => invoke(op, params, callOptions),
    invoke,
    ready,
    noteContribution: (resultId) => store.markContributed(resultId),
    store,
    close: () => store.reset(),
  };
}
