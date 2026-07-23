import { SAMPLE_MANIFEST } from './samples';

interface SamplePickerProps {
  onSelect: (sampleId: string) => void;
  disabled?: boolean;
}

export function SamplePicker({ onSelect, disabled = false }: SamplePickerProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {SAMPLE_MANIFEST.map((sample) => (
        <button
          key={sample.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(sample.id)}
          className="flex flex-col gap-1 rounded-lg border border-(--color-border) p-4 text-left transition-colors hover:border-(--color-accent) disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="font-medium text-(--color-fg)">{sample.label}</span>
          <span className="text-sm text-(--color-fg-muted)">{sample.description}</span>
        </button>
      ))}
    </div>
  );
}
