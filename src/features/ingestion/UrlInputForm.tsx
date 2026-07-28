import { useState, type FormEvent } from 'react';
import { Link2 } from 'lucide-react';

interface UrlInputFormProps {
  onSubmit: (url: string) => void;
  disabled?: boolean;
}

/** Tier 1 API ingestion entry point (§7.4) — paste a URL, fetch it directly. */
export function UrlInputForm({ onSubmit, disabled = false }: UrlInputFormProps) {
  const [value, setValue] = useState('');
  const hasValue = value.trim().length > 0;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className={`flex flex-1 items-center gap-2.5 rounded-xl border bg-(--color-canvas) px-4 py-2.5 transition-all duration-200 ${hasValue
            ? 'border-(--color-active)/40'
            : 'border-(--color-rule) focus-within:border-(--color-active)/40'
          }`}>
          <Link2 size={15} className="shrink-0 text-(--color-ink-3)" aria-hidden="true" />
          <input
            type="url"
            inputMode="url"
            placeholder="CSV, API endpoint, or public sheet"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            disabled={disabled}
            aria-label="API URL"
            className="w-full bg-transparent text-[length:var(--text-base)] text-(--color-ink) outline-none placeholder:text-(--color-ink-3) disabled:cursor-not-allowed"
          />
        </div>
        <button
          type="submit"
          disabled={disabled || !hasValue}
          className={`rounded-xl border px-5 py-2.5 font-mono text-[length:var(--text-md)] font-medium transition-all duration-200 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 ${hasValue
              ? 'border-(--color-active)/40 bg-(--color-active)/10 text-(--color-active) hover:bg-(--color-active)/20'
              : 'border-(--color-rule) bg-(--color-panel) text-(--color-ink-3) hover:border-(--color-rule-hi) hover:text-(--color-ink)'
            }`}
        >
          Fetch
        </button>
      </div>
    </form>
  );
}
