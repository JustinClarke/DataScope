import { useEducationalPanel } from '../app/useEducationalPanel';

/**
 * Workspace slot for educational content (SQL, explanations, etc.).
 * Renders whatever content has been pushed via useEducationalPanel.setContent,
 * with a sensible empty state when nothing is available.
 */
export function EducationalPanel() {
  const { content } = useEducationalPanel();

  return (
    <div className="rounded-lg border border-(--color-border) bg-(--color-bg) p-4">
      {content !== null ? (
        <div className="text-(--color-fg)">{content}</div>
      ) : (
        <p className="text-center text-(--color-fg-muted)">Nothing to explain yet</p>
      )}
    </div>
  );
}
