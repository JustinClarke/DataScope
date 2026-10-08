// Shared chrome for the AI settings panel, per `.hallmark/design.md`.
//
// Three pieces used across every section of the panel, so they live here rather
// than being re-spelled inline: the micro-caps section header (the system's
// single labelling device), the HUD secondary button (§ CTA voice), and the
// field description. Surfaces follow § What pages MUST share — a panel is
// always `--color-panel`, a raised face is always `--color-card`.
import { useEffect, useState, type ReactNode } from "react";

/**
 * One titled block. `.micro` is the system's only labelling device — mono,
 * 0.625rem, 0.14em tracking, uppercase — so section headers are not h3s dressed
 * in sentence case.
 */
export function Section({
  title,
  children,
  first = false,
}: {
  title: string;
  children: ReactNode;
  first?: boolean;
}) {
  return (
    <section
      className={
        first
          ? "space-y-3"
          : "mt-5 space-y-3 border-t border-(--color-rule) pt-5"
      }
    >
      <h3 className="micro text-(--color-ink-3)">{title}</h3>
      {children}
    </section>
  );
}

/**
 * The secondary / HUD button (§ CTA voice): panel-or-card face, 1px rule
 * border, mono, `--color-ink-2` text. Hover lifts the *text and border* only —
 * the face does not change. Press is a 1px translate, which is the whole of the
 * press feedback the system allows.
 */
export function HudButton({
  onClick,
  disabled = false,
  children,
  tone = "normal",
  ...rest
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  /** `warn` is for a destructive confirm step, which § Status register requires to carry a word, never colour alone. */
  tone?: "normal" | "warn";
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      {...rest}
      className={[
        "rounded-(--radius-md) border px-3 py-1.5 font-mono text-xs",
        "transition-colors duration-(--dur-fast) ease-(--ease-out)",
        "active:translate-y-px disabled:opacity-40 disabled:active:translate-y-0",
        tone === "warn"
          ? "border-(--color-error) bg-(--color-card) text-(--color-error) hover:brightness-110"
          : "border-(--color-rule) bg-(--color-card) text-(--color-ink-2) hover:border-(--color-rule-hi) hover:text-(--color-ink)",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/** Explanatory text under a control. Tertiary ink — present, never competing. */
export function FieldNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs leading-relaxed text-(--color-ink-2)">{children}</p>
  );
}

/**
 * The panel's footer line. There is no Save button because there is nothing to
 * save: the settings store persists to localStorage on every change (zustand
 * `persist`), so a Save control would imply pending state that does not exist —
 * the opposite of reassuring. What the user is owed instead is *evidence* that
 * it happened, which is what this is: a standing statement of where the
 * settings live, and a transient acknowledgement when one changes.
 *
 * Deliberately not a toast. § Microinteractions stance: silent success, no
 * celebratory toasts, ever.
 */
export function SavedIndicator({
  subscribe,
}: {
  /** Store subscription — injected so this stays testable without a live store. */
  subscribe: (listener: () => void) => () => void;
}) {
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const unsubscribe = subscribe(() => {
      setJustSaved(true);
      clearTimeout(timer);
      timer = setTimeout(() => setJustSaved(false), 1600);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [subscribe]);

  return (
    <p
      className="mt-5 flex items-center gap-2 border-t border-(--color-rule) pt-4 text-xs text-(--color-ink-3)"
      role="status"
    >
      <span
        aria-hidden="true"
        className={[
          "font-mono transition-opacity duration-(--dur-fast) ease-(--ease-out)",
          justSaved ? "text-(--color-ok) opacity-100" : "opacity-0",
        ].join(" ")}
      >
        ✓
      </span>
      {justSaved
        ? "Saved to this browser."
        : "Changes here save to this browser as you make them."}
    </p>
  );
}
