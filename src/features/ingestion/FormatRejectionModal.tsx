interface FormatRejectionModalProps {
  message: string;
  onDismiss: () => void;
  /** Reused for the large-file refusal modal, which isn't a format problem. */
  ariaLabel?: string;
}

/** Blocking-ingest modal — xlsx/other unsupported formats, and oversized files refused outright. */
export function FormatRejectionModal({ message, onDismiss, ariaLabel = 'Unsupported file' }: FormatRejectionModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-(--color-scrim)"
      role="presentation"
      onClick={onDismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className="mx-4 max-w-sm rounded-lg border border-(--color-border) bg-(--color-bg) p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="mb-4 text-(--color-fg)">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded bg-(--color-accent) px-4 py-2 text-sm font-medium text-(--color-accent-fg)"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
