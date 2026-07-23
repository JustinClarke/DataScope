interface TransformGuardModalProps {
  targetTable: string;
  onMaterialize: () => void;
  onModifyAnyway: () => void;
  onCancel: () => void;
}

/**
 * The mutation guard (§12.1): a statement that would mutate a source table in
 * place gets this confirm prompt, with "materialize as a new table instead"
 * as the default/primary action — the raw mutation is still available, but
 * never on by default.
 */
export function TransformGuardModal({ targetTable, onMaterialize, onModifyAnyway, onCancel }: TransformGuardModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="presentation" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Confirm in-place edit"
        className="mx-4 max-w-md rounded-lg border border-(--color-border) bg-(--color-bg) p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="mb-2 font-medium text-(--color-fg)">
          This edits <span className="font-mono">{targetTable}</span> directly
        </p>
        <p className="mb-4 text-sm text-(--color-fg-muted)">
          {targetTable} is a source table — editing it in place can&rsquo;t be undone. We recommend materializing the
          result as a new table instead, which keeps {targetTable} untouched and stays undoable.
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onMaterialize}
            autoFocus
            className="rounded bg-(--color-accent) px-4 py-2 text-sm font-medium text-(--color-accent-fg)"
          >
            Materialize as a new table
          </button>
          <button
            type="button"
            onClick={onModifyAnyway}
            className="rounded border border-(--color-border) px-4 py-2 text-sm font-medium text-(--color-fg)"
          >
            Modify original anyway
          </button>
          <button type="button" onClick={onCancel} className="rounded px-4 py-2 text-sm text-(--color-fg-muted)">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
