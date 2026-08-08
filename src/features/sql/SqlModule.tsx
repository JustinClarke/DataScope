import { useCallback, useEffect, useState } from "react";
import { Play, Save, ShieldCheck, WrapText } from "lucide-react";
import {
  useQuerySession,
  useQueryStore,
  CONSOLE_SESSION,
} from "../../stores/query";
import { requestRun } from "../../services/runPath";
import { analystCore } from "../../services/analyst";
import { isOpError, type OpOutcome } from "../../lib/analyst/types";
import { LazySqlEditor } from "./LazySqlEditor";

/**
 * The dry-run check beside Run (A2, master §11.5/§13.3) — A1's `validate_sql`
 * surfaced as a console affordance. `EXPLAIN`s the buffer without running it,
 * so the banner can say "costs no execution" honestly rather than as a claim
 * nothing behind it backs up.
 */
function ValidateBanner({ outcome }: { outcome: OpOutcome }) {
  if (isOpError(outcome)) {
    return (
      <p
        role="alert"
        data-testid="console-validate-result"
        className="shrink-0 border-t border-(--color-rule-2) px-3 py-1.5 font-mono text-[length:var(--text-xs)] text-(--color-error)"
      >
        {outcome.message}
      </p>
    );
  }

  const schema = outcome.schema;
  const at = (name: string) => schema.findIndex((field) => field.name === name);
  const row = outcome.rows[0] ?? [];
  const ok = Boolean(row[at("ok")]);
  const statementClass = String(row[at("statement_class")] ?? "");
  const referencedObjects =
    (row[at("referenced_objects")] as string[] | undefined) ?? [];
  const error = row[at("error")] as string | null;

  return (
    <p
      role={ok ? undefined : "alert"}
      data-testid="console-validate-result"
      className={`shrink-0 border-t border-(--color-rule-2) px-3 py-1.5 font-mono text-[length:var(--text-xs)] ${
        ok ? "text-(--color-ok)" : "text-(--color-error)"
      }`}
    >
      {ok
        ? `✓ Valid — ${statementClass}${referencedObjects.length > 0 ? `, references ${referencedObjects.join(", ")}` : ""} — costs no execution`
        : error}
    </p>
  );
}

/**
 * The derive action (A3) — the answer to "a user should not have to know that
 * typing `CREATE TABLE AS` in the console does something special."
 *
 * It calls `derive_table`/`create_view`, which compose the statement, apply
 * ingestion's own naming rules, and register the result through the same
 * `services/transforms.ts` path the console's own `CREATE TABLE AS` takes — so
 * this button is a shortcut for a thing the user could already type, not a
 * second way of making a table.
 */
function DeriveBar({
  name,
  kind,
  busy,
  onName,
  onKind,
  onConfirm,
  onCancel,
}: {
  name: string;
  kind: "table" | "view";
  busy: boolean;
  onName: (value: string) => void;
  onKind: (value: "table" | "view") => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      data-testid="console-derive-bar"
      className="shrink-0 border-t border-(--color-rule-2) px-3 py-2"
    >
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <label
          htmlFor="console-derive-name"
          className="text-[length:var(--text-xs)] text-(--color-fg-muted)"
        >
          Save this query as
        </label>
        <select
          aria-label="What to create"
          value={kind}
          onChange={(event) => onKind(event.target.value as "table" | "view")}
          className="rounded border border-(--color-border) bg-transparent px-2 py-1 text-[length:var(--text-xs)] text-(--color-fg)"
        >
          <option value="table">table</option>
          <option value="view">view</option>
        </select>
        <input
          id="console-derive-name"
          value={name}
          onChange={(event) => onName(event.target.value)}
          autoFocus
          className="min-w-40 flex-1 rounded border border-(--color-border) bg-transparent px-2 py-1 font-mono text-[length:var(--text-xs)] text-(--color-fg)"
        />
        <button
          type="submit"
          disabled={busy || name.trim().length === 0}
          data-testid="console-derive-confirm"
          className="rounded-lg bg-(--color-accent) px-3 py-1 text-[length:var(--text-xs)] font-medium text-(--color-accent-fg) disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-(--color-border) px-3 py-1 text-[length:var(--text-xs)] text-(--color-fg)"
        >
          Cancel
        </button>
      </form>
    </div>
  );
}

/** The derive outcome, rendered outside the form so a success can close it and still be reported. */
function DeriveResult({ outcome }: { outcome: OpOutcome }) {
  const failed = isOpError(outcome);
  return (
    <p
      role={failed ? "alert" : undefined}
      data-testid="console-derive-result"
      className={`shrink-0 border-t border-(--color-rule-2) px-3 py-1.5 font-mono text-[length:var(--text-xs)] ${
        failed ? "text-(--color-error)" : "text-(--color-ok)"
      }`}
    >
      {failed
        ? outcome.message
        : // The note carries the deterministic facts the operation reports — a
          // name it had to change, and what the new object derives from.
          `✓ ${String(outcome.rows[0]?.[0] ?? "")} created${outcome.note ? ` — ${outcome.note}` : ""}`}
    </p>
  );
}

/**
 * The SQL console — since S6.5, the editor and nothing else. It writes SQL and
 * runs it; what a run *produced* belongs to the drawer's Info pane, which is
 * where the result, its chart, the export actions and the session history live
 * now. One pane for the code, one for its consequences.
 *
 * It has been a *view* over the run path rather than an owner of one since S4:
 * classification, the transform guard and the tracked execution cycle all live
 * in `services/runPath.ts`, which every other surface in the app calls too.
 */
export function SqlModule() {
  const { sql, status } = useQuerySession(CONSOLE_SESSION);
  const [checkOutcome, setCheckOutcome] = useState<OpOutcome | null>(null);
  const [checking, setChecking] = useState(false);
  const [deriveOpen, setDeriveOpen] = useState(false);
  const [deriveKind, setDeriveKind] = useState<"table" | "view">("table");
  const [deriveName, setDeriveName] = useState("");
  const [deriveOutcome, setDeriveOutcome] = useState<OpOutcome | null>(null);
  const [deriving, setDeriving] = useState(false);

  // A check answers for the buffer it saw; the moment that buffer changes the
  // answer is stale, so it disappears rather than sitting there looking current.
  // A derive result is stale for the same reason — but the *form* stays open,
  // since editing the query is a normal thing to do between two attempts.
  useEffect(() => {
    setCheckOutcome(null);
    setDeriveOutcome(null);
  }, [sql]);

  const handleRun = useCallback(() => {
    requestRun(
      useQueryStore.getState().sessions[CONSOLE_SESSION]?.sql ?? "",
      CONSOLE_SESSION,
    );
  }, []);

  const handleValidate = useCallback(async () => {
    const current =
      useQueryStore.getState().sessions[CONSOLE_SESSION]?.sql ?? "";
    if (current.trim().length === 0) return;
    setChecking(true);
    const outcome = await analystCore().call("validate_sql", { sql: current });
    setChecking(false);
    setCheckOutcome(outcome);
  }, []);

  const handleDerive = useCallback(async () => {
    const current =
      useQueryStore.getState().sessions[CONSOLE_SESSION]?.sql ?? "";
    if (current.trim().length === 0 || deriveName.trim().length === 0) return;
    setDeriving(true);
    const outcome = await analystCore().call(
      deriveKind === "view" ? "create_view" : "derive_table",
      {
        name: deriveName,
        sql: current,
      },
    );
    setDeriving(false);
    setDeriveOutcome(outcome);
    // Left open on failure so the name and the message sit together; a success
    // has nothing left to do, and the new object is already in the rail.
    if (!isOpError(outcome)) setDeriveOpen(false);
  }, [deriveKind, deriveName]);

  // Writes through the store rather than reaching for the editor instance, so
  // the buffer stays the single source of truth and `MonacoWrapper`'s own
  // subscription carries the change into the view — the same path a ranked
  // action's prefill already takes.
  //
  // Imported on the click, not at module scope: this component is in the
  // shell's eager graph (the drawer mounts it), and a formatter nobody has
  // asked for has no business in the startup chunk (§15).
  const handleFormat = useCallback(async () => {
    const current =
      useQueryStore.getState().sessions[CONSOLE_SESSION]?.sql ?? "";
    if (current.trim().length === 0) return;
    const { formatSql } = await import("./sqlFormatting");
    useQueryStore.getState().setSql(CONSOLE_SESSION, formatSql(current));
  }, []);

  const canRun = sql.trim().length > 0 && status !== "running";
  const hasSql = sql.trim().length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        data-testid="console-editor-region"
        className="min-h-[4.5rem] flex-1 overflow-hidden px-3 pt-2"
      >
        <LazySqlEditor
          sessionId={CONSOLE_SESSION}
          onRunQuery={handleRun}
          fillHeight
        />
      </div>

      <div
        data-testid="console-toolbar"
        className="flex shrink-0 items-center justify-end gap-2 border-t border-(--color-rule-2) px-3 py-2"
      >
        <button
          type="button"
          onClick={handleFormat}
          disabled={!hasSql}
          title="Reformat this query (⇧⌥F in the editor)"
          className="flex items-center gap-1 rounded-lg border border-(--color-border) px-3 py-1.5 text-sm font-medium text-(--color-fg) disabled:cursor-not-allowed disabled:opacity-50"
        >
          <WrapText size={14} aria-hidden="true" />
          Format
        </button>
        <button
          type="button"
          onClick={() => {
            setDeriveOutcome(null);
            setDeriveName("");
            setDeriveOpen((open) => !open);
          }}
          disabled={!hasSql}
          title="Save this query's result as a table or view you can query by name"
          data-testid="console-derive-button"
          className="flex items-center gap-1 rounded-lg border border-(--color-border) px-3 py-1.5 text-sm font-medium text-(--color-fg) disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save size={14} aria-hidden="true" />
          Save as…
        </button>
        <button
          type="button"
          onClick={handleValidate}
          disabled={!hasSql || checking}
          title="Check this query — plans it without running it, so it costs no execution"
          data-testid="console-validate-button"
          className="flex items-center gap-1 rounded-lg border border-(--color-border) px-3 py-1.5 text-sm font-medium text-(--color-fg) disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShieldCheck size={14} aria-hidden="true" />
          {checking ? "Checking…" : "Check"}
        </button>
        <button
          type="button"
          onClick={handleRun}
          disabled={!canRun}
          className="flex items-center gap-2 rounded-lg bg-(--color-accent) px-3 py-1.5 text-sm font-medium text-(--color-accent-fg) disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play size={14} aria-hidden="true" />
          {status === "running" ? "Running…" : "Run"}
          <span className="text-xs opacity-75">⌘/Ctrl+Enter</span>
        </button>
      </div>

      {deriveOpen && (
        <DeriveBar
          name={deriveName}
          kind={deriveKind}
          busy={deriving}
          onName={setDeriveName}
          onKind={setDeriveKind}
          onConfirm={handleDerive}
          onCancel={() => setDeriveOpen(false)}
        />
      )}
      {deriveOutcome && <DeriveResult outcome={deriveOutcome} />}
      {checkOutcome && <ValidateBanner outcome={checkOutcome} />}
    </div>
  );
}
