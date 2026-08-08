import {
  CloudSun,
  Database,
  Loader2,
  ShoppingCart,
  Ship,
  Star,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { SAMPLE_MANIFEST } from "./samples";

interface SamplePickerProps {
  onSelect: (sampleId: string) => void;
  disabled?: boolean;
  activeId?: string | null;
}

// One glyph per sample, hinting at the data shape. Monochrome line icons rather than
// pictographic emoji, and tinted from the `--sample-*` ramp (design.md § Sample accent
// ramp) — the card's identity colour, never a data mark.
const SAMPLE_ICONS: Record<string, { Icon: LucideIcon; accent: string }> = {
  ecommerce: { Icon: ShoppingCart, accent: "var(--sample-1)" },
  titanic: { Icon: Ship, accent: "var(--sample-2)" },
  stock_prices: { Icon: TrendingUp, accent: "var(--sample-3)" },
  product_reviews: { Icon: Star, accent: "var(--sample-4)" },
  weather: { Icon: CloudSun, accent: "var(--sample-5)" },
};

/**
 * Sample dataset picker — each sample is a clickable card with hover glow.
 * Designed to be the most inviting part of the welcome page.
 */
export function SamplePicker({
  onSelect,
  disabled = false,
  activeId = null,
}: SamplePickerProps) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {SAMPLE_MANIFEST.map((sample) => {
        const meta = SAMPLE_ICONS[sample.id] ?? {
          Icon: Database,
          accent: "var(--color-ink-2)",
        };
        return (
          <button
            key={sample.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(sample.id)}
            className="group flex items-center gap-3 rounded-xl border border-(--color-rule) bg-(--color-canvas) px-4 py-3 text-left transition-all duration-200 hover:border-(--color-active)/40 hover:bg-(--color-elev)/50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {/* Icon */}
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110"
              style={{
                backgroundColor: `color-mix(in oklch, ${meta.accent} 8%, transparent)`,
              }}
            >
              <meta.Icon
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
                style={{ color: meta.accent }}
              />
            </span>

            {/* Text */}
            <div className="min-w-0 flex-1">
              <span className="block text-[length:var(--text-base)] font-medium text-(--color-ink) transition-colors group-hover:text-(--color-active)">
                {sample.label}
              </span>
              <span className="block truncate text-[length:var(--text-sm)] text-(--color-ink-3)">
                {sample.description}
              </span>
            </div>

            {/* Arrow or Loader */}
            {activeId === sample.id ? (
              <Loader2
                size={14}
                className="shrink-0 animate-spin text-(--color-active)"
              />
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-(--color-ink-3) transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-(--color-active)"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}
