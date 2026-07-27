import { SAMPLE_MANIFEST } from './samples';

interface SamplePickerProps {
  onSelect: (sampleId: string) => void;
  disabled?: boolean;
}

/**
 * The mock's `.samples` list (V6d) — typographic rows on a hairline that goes
 * amber on hover and focus, not bordered cards. They stay `<button>`s because
 * they start an ingest rather than navigate.
 */
export function SamplePicker({ onSelect, disabled = false }: SamplePickerProps) {
  return (
    <div className="flex flex-col">
      {SAMPLE_MANIFEST.map((sample) => (
        <button
          key={sample.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(sample.id)}
          className="flex items-baseline gap-2 border-b border-(--color-rule) py-1.5 text-left transition-colors hover:border-(--color-active) focus-visible:border-(--color-active) disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="text-[length:var(--text-base)] text-(--color-ink)">{sample.label}</span>
          <span className="flex-1 text-[length:var(--text-base)] text-(--color-ink-3)">
            — {sample.description}
          </span>
          <span aria-hidden="true" className="font-mono text-[length:var(--text-md)] text-(--color-ink-3)">
            →
          </span>
        </button>
      ))}
    </div>
  );
}
