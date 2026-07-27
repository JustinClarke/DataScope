import { useState, type FormEvent } from 'react';
import { Link2 } from 'lucide-react';

interface UrlInputFormProps {
  onSubmit: (url: string) => void;
  disabled?: boolean;
}

/** Tier 1 API ingestion entry point (§7.4) — paste a URL, fetch it directly. */
export function UrlInputForm({ onSubmit, disabled = false }: UrlInputFormProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 items-center gap-2 rounded-(--radius-xs) border border-(--color-rule) bg-(--color-canvas) px-3 py-2">
          <Link2 size={14} className="shrink-0 text-(--color-ink-3)" aria-hidden="true" />
          <input
            type="url"
            inputMode="url"
            placeholder="Paste an API URL (e.g. https://api.github.com/repos/duckdb/duckdb/issues)"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            disabled={disabled}
            aria-label="API URL"
            className="w-full bg-transparent text-[length:var(--text-base)] text-(--color-ink) outline-none placeholder:text-(--color-ink-3) disabled:cursor-not-allowed"
          />
        </div>
        <button
          type="submit"
          disabled={disabled || value.trim().length === 0}
          className="rounded-(--radius-xs) border border-(--color-rule) bg-(--color-panel) px-4 py-2 font-mono text-[length:var(--text-md)] text-(--color-ink-2) transition-colors hover:border-(--color-rule-hi) hover:text-(--color-ink) active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
        >
          Fetch
        </button>
      </div>
      <p className="text-[length:var(--text-base)] text-(--color-ink-3)">
        A CSV, an API endpoint, or a public sheet.
      </p>
    </form>
  );
}
