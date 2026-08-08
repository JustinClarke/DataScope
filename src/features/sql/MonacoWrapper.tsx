import { useEffect, useRef } from "react";
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
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { useDatasetsStore } from "../../stores/datasets";
import {
  useQueryStore,
  getSession,
  type QuerySessionId,
} from "../../stores/query";
import { buildCompletionItems } from "./completionProvider";
import { ensureMonacoTheme, MONACO_THEME_ID } from "./monacoTheme";
import { consolePlaceholder } from "./editorPlaceholder";
import { formatSql } from "./sqlFormatting";

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

  monaco.languages.registerCompletionItemProvider("sql", {
    triggerCharacters: [".", " "],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn,
      );

      // Read the registry fresh on every trigger (not captured at mount time)
      // so a table added, dropped, or derived mid-session is reflected on the
      // very next completion, per this item's own acceptance criteria.
      const tables = useDatasetsStore.getState().tables;
      const items = buildCompletionItems(tables);

      return {
        suggestions: items.map((item) => ({
          label: item.label,
          kind:
            item.kind === "table"
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

// Monaco's bundled SQL contribution ships brackets and comment syntax but no
// indentation rules, which is why `autoIndent` looks inert on a SQL buffer: it
// has nothing to consult. These two registrations are what make it work —
// indent after an opening paren, dedent the line that closes it — and the
// formatting provider is what gives the editor its built-in Format Document
// (⇧⌥F) and format-on-paste over the same function the toolbar button calls.
let languageFeaturesRegistered = false;
function ensureSqlLanguageFeatures(): void {
  if (languageFeaturesRegistered) return;
  languageFeaturesRegistered = true;

  monaco.languages.setLanguageConfiguration("sql", {
    indentationRules: {
      increaseIndentPattern: /\([^)]*$/,
      decreaseIndentPattern: /^\s*\)/,
    },
  });

  monaco.languages.registerDocumentFormattingEditProvider("sql", {
    provideDocumentFormattingEdits(model) {
      return [
        { range: model.getFullModelRange(), text: formatSql(model.getValue()) },
      ];
    },
  });
}

interface MonacoWrapperProps {
  /** Which query session this editor's buffer belongs to (S5) — the console, or one query tab. */
  sessionId: QuerySessionId;
  /** Invoked by the Ctrl/Cmd+Enter editor action; the run button lives outside this component. */
  onRunQuery: () => void;
  /** Fill the parent instead of the standalone surfaces' fixed height — the drawer console's editor region owns its own height (S6.5). */
  fillHeight?: boolean;
}

/**
 * The Monaco mount itself — this module (and the `monaco-editor` it statically
 * imports) only ever loads behind `React.lazy` (see `LazySqlEditor.tsx`), so it
 * must not be imported from anything reachable at startup.
 */
export default function MonacoWrapper({
  sessionId,
  onRunQuery,
  fillHeight = false,
}: MonacoWrapperProps) {
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
    ensureSqlLanguageFeatures();
    // Resolved from the container, so an editor inside a register-pinned
    // subtree (`[data-theme]`) reads that register's values rather than the
    // document's.
    ensureMonacoTheme(containerRef.current);

    const editor = monaco.editor.create(containerRef.current, {
      value: getSession(sessionId).sql,
      language: "sql",
      theme: MONACO_THEME_ID,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      scrollBeyondLastLine: false,
      autoIndent: "full",
      formatOnPaste: true,
    });

    // The empty buffer's one-line invitation (S6.7), as a decoration rather
    // than an overlay element so it scrolls, wraps and disappears with the
    // text it stands in for. The table name is read at render time, so a file
    // dropped after the editor mounted still names a real table.
    const placeholder = editor.createDecorationsCollection();
    const renderPlaceholder = () => {
      placeholder.set(
        editor.getValue().length > 0
          ? []
          : [
              {
                range: new monaco.Range(1, 1, 1, 1),
                options: {
                  after: {
                    content: consolePlaceholder(
                      useDatasetsStore.getState().tables,
                    ),
                    inlineClassName: "sql-editor-placeholder",
                  },
                },
              },
            ],
      );
    };
    renderPlaceholder();

    const changeSub = editor.onDidChangeModelContent(() => {
      useQueryStore.getState().setSql(sessionId, editor.getValue());
      renderPlaceholder();
    });

    const runAction = editor.addAction({
      id: "datascope.sql.runQuery",
      label: "Run Query",
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
      if (
        next !== undefined &&
        next !== previous &&
        next !== editor.getValue()
      ) {
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
      className={`w-full overflow-hidden rounded-lg border border-(--color-border) ${fillHeight ? "h-full" : "h-64"}`}
      data-testid="monaco-container"
    />
  );
}
