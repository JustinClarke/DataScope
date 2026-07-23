import { X } from 'lucide-react';
import type { SkippedFile } from '../../services/ingestion';
import { summarizeBatch } from './summarize';

interface SummaryToastProps {
  ingestedCount: number;
  skipped: SkippedFile[];
  onDismiss: () => void;
}

export function SummaryToast({ ingestedCount, skipped, onDismiss }: SummaryToastProps) {
  return (
    <div
      role="status"
      className="flex items-start justify-between gap-3 rounded-lg border border-(--color-border) bg-(--color-bg) p-4 text-sm text-(--color-fg) shadow-lg"
    >
      <p>{summarizeBatch(ingestedCount, skipped)}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 text-(--color-fg-muted) hover:text-(--color-fg)"
      >
        <X size={16} />
      </button>
    </div>
  );
}
