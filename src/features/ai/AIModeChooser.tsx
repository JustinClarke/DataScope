// First-run AI-mode chooser (D2, §5.1): a one-screen explanation of the three
// modes shown on first launch. No silent default — the app sets no mode until
// the user picks one here, so no inference can occur before an explicit choice.
// Local-only is a first-class choice (the AI kill-switch), not a fallback. API
// (renamed from "Cloud AI", 2026-07-22) is described as a SHARED, exhaustible
// free budget (§11.2), never a personal allowance. Mode is switchable later in
// AI settings.
import { Cloud, ShieldCheck, Cpu, type LucideIcon } from 'lucide-react';
import { useSettingsStore } from '../../stores/settings';
import type { AIMode } from '../../types';

interface ModeOption {
  mode: AIMode;
  label: string;
  icon: LucideIcon;
  blurb: string;
}

const OPTIONS: ModeOption[] = [
  {
    mode: 'local-only',
    label: 'Local-only (AI off)',
    icon: ShieldCheck,
    blurb: 'Nothing leaves your browser after the page loads. The AI chat stays off; everything else works exactly the same.',
  },
  {
    mode: 'local-model',
    label: 'Local model',
    icon: Cpu,
    blurb: 'Runs a model in your browser — a one-time ~830 MB download, asked first. No data leaves the browser; SQL generation is weaker than cloud.',
  },
  {
    mode: 'cloud',
    label: 'API',
    icon: Cloud,
    blurb: 'Sends your schema, prompts, generated SQL, and error traces to the cloud — never data rows unless you turn that on. Uses a shared free budget everyone draws from; bring your own key, or point it at a local Ollama endpoint, for more.',
  },
];

export function AIModeChooser() {
  const setAIMode = useSettingsStore((s) => s.setAIMode);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose how AI works"
        className="w-full max-w-lg rounded-lg border border-(--color-border) bg-(--color-bg) p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold text-(--color-fg)">How should AI work in DataScope?</h2>
        <p className="mt-1 text-sm text-(--color-fg-muted)">
          Pick one to start — you can change it anytime in settings. Nothing is sent anywhere until you choose.
        </p>
        <div className="mt-4 space-y-2">
          {OPTIONS.map(({ mode, label, icon: Icon, blurb }) => (
            <button
              key={mode}
              type="button"
              onClick={() => setAIMode(mode)}
              className="flex w-full items-start gap-3 rounded-lg border border-(--color-border) p-3 text-left transition-colors hover:border-(--color-accent)"
            >
              <Icon size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-(--color-accent)" />
              <span>
                <span className="block text-sm font-medium text-(--color-fg)">{label}</span>
                <span className="mt-0.5 block text-xs text-(--color-fg-muted)">{blurb}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
