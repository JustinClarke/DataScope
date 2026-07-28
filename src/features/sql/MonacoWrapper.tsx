import { useEffect, useRef } from 'react';
// A hand-narrowed import graph (core editor + just the SQL Monarch
// tokenizer, skipping the other ~70 basic-language contributions and the
// TypeScript/JSON/CSS/HTML language services) was measured against this bare
// import and made no measurable difference to the shipped chunk (925.38 KB vs
// 927.04 KB gzip) — Monaco's own basic-language contributions are already
// behind internal dynamic imports, so a bundler splits them into their own
// chunks regardless of which entry point pulls the package in. The bare
// import is kept for that reason: same cost, less code, no risk of the
// narrow path silently missing something the full editor needs (ADR-004
// spike evidence).
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { useDatasetsStore } from '../../stores/datasets';
import { useQueryStore, getSession, type QuerySessionId } from '../../stores/query';
import { buildCompletionItems } from './completionProvider';

// Self-hosted (same-origin) worker, matching the rest of the app's ADR-001
// same-origin-asset convention rather than Monaco's CDN-loader default. Only
// the plain editor worker is needed for this editor's feature set (no
// TypeScript/JSON/CSS/HTML language-service workers are used).
let workerEnvironmentReady = false;
function ensureWorkerEnvironment(): void {
  if (workerEnvironmentReady) return;
  self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
  workerEnvironmentReady = true;
}

// registerCompletionItemProvider is global (not per-editor-instance) and
// throwing on a duplicate registration isn't a risk here, but registering
// twice would offer every suggestion twice — guard it the same way the
// worker environment setup above is guarded.
let completionProviderRegistered = false;
function ensureCompletionProvider(): void {
  if (completionProviderRegistered) return;
  completionProviderRegistered = true;

  monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['.', ' '],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);

      // Read the registry fresh on every trigger (not captured at mount time)
      // so a table added, dropped, or derived mid-session is reflected on the
      // very next completion, per this item's own acceptance criteria.
      const tables = useDatasetsStore.getState().tables;
      const items = buildCompletionItems(tables);

      return {
        suggestions: items.map((item) => ({
          label: item.label,
          kind:
            item.kind === 'table'
              ? monaco.languages.CompletionItemKind.Struct
              : monaco.languages.CompletionItemKind.Field,
          detail: item.detail,
          insertText: item.insertText,
          range,
        })),
      };
    },
  });
}

interface MonacoWrapperProps {
  /** Which query session this editor's buffer belongs to (S5) — the console, or one query tab. */
  sessionId: QuerySessionId;
  /** Invoked by the Ctrl/Cmd+Enter editor action; the run button lives outside this component. */
  onRunQuery: () => void;
}

/**
 * The Monaco mount itself — this module (and the `monaco-editor` it statically
 * imports) only ever loads behind `React.lazy` (see `LazySqlEditor.tsx`), so it
 * must not be imported from anything reachable at startup.
 */
export default function MonacoWrapper({ sessionId, onRunQuery }: MonacoWrapperProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Ref indirection so the Ctrl/Cmd+Enter action (bound once, at editor
  // creation) always calls the latest `onRunQuery` without recreating the
  // editor whenever the parent re-renders with a new callback identity.
  const onRunQueryRef = useRef(onRunQuery);
  onRunQueryRef.current = onRunQuery;

  useEffect(() => {
    if (!containerRef.current) return;

    ensureWorkerEnvironment();
    ensureCompletionProvider();

    const editor = monaco.editor.create(containerRef.current, {
      value: getSession(sessionId).sql,
      language: 'sql',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      scrollBeyondLastLine: false,
    });

    const changeSub = editor.onDidChangeModelContent(() => {
      useQueryStore.getState().setSql(sessionId, editor.getValue());
    });

    const runAction = editor.addAction({
      id: 'datascope.sql.runQuery',
      label: 'Run Query',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => onRunQueryRef.current(),
    });

    // The query store is the source of truth for editor content (this
    // item's own spec — "editor content is session state"); anything that
    // sets `sql` from outside this component (e.g. a future "reuse this
    // history entry" affordance) must be reflected back into the editor.
    const unsubscribe = useQueryStore.subscribe((state, prevState) => {
      const next = state.sessions[sessionId]?.sql;
      const previous = prevState.sessions[sessionId]?.sql;
      if (next !== undefined && next !== previous && next !== editor.getValue()) {
        editor.setValue(next);
      }
    });

    return () => {
      unsubscribe();
      changeSub.dispose();
      runAction.dispose();
      editor.dispose();
    };
  }, [sessionId]);

  return (
    <div
      ref={containerRef}
      className="h-64 w-full overflow-hidden rounded-lg border border-(--color-border)"
      data-testid="monaco-container"
    />
  );
}
