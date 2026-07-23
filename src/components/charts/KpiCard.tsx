/**
 * A single aggregate value shown as a large stat. Deliberately not a chart —
 * a scalar has no axes — and deliberately dependency-free, so a KPI result
 * never pulls the charting library into the bundle.
 */
export function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-(--color-border) p-8">
      <span className="text-4xl font-semibold tracking-tight text-(--color-fg)">{value}</span>
      <span className="text-sm text-(--color-fg-muted)">{label}</span>
    </div>
  );
}
