import { useEffect, useRef, useState, type ComponentType } from 'react';
import { LineChart, ChartColumn, PieChart } from 'lucide-react';
import { useUIStore } from '../../stores/ui';
import { useCapabilities } from '../../hooks/useCapabilities';
import { useThreadPrefill } from '../../hooks/useThreadPrefill';
import type { ModulePrefill } from '../../lib/threadPrefill';
import type { DataCapabilities } from '../../types';
import { TimeSeriesModule } from './time-series/TimeSeriesModule';
import { DistributionModule } from './distribution/DistributionModule';
import { CategoricalModule } from './categorical/CategoricalModule';

type ChartTabId = 'time-series' | 'distribution' | 'categorical';

interface ChartTab {
  id: ChartTabId;
  label: string;
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
  legal: (caps: DataCapabilities) => boolean;
  Component: ComponentType<{ prefill: ModulePrefill }>;
}

const TABS: ChartTab[] = [
  { id: 'time-series', label: 'Time Series', icon: LineChart, legal: (c) => c.canDoTimeSeries, Component: TimeSeriesModule },
  { id: 'distribution', label: 'Distribution', icon: ChartColumn, legal: (c) => c.canDoDistribution, Component: DistributionModule },
  { id: 'categorical', label: 'Categorical', icon: PieChart, legal: (c) => c.canDoCategoricalBreakdown, Component: CategoricalModule },
];

/**
 * The EXPLORE group's single "Charts" destination (§13.2, D68d) — time
 * series / distribution / categorical are internal tabs now, not sidebar
 * modules. Filters to broker-eligible tabs and auto-selects the first;
 * `activeTabId` (set by a ranked action naming a specific chart type, e.g.
 * a change-point finding) is honored once on arrival if still eligible, but
 * never overrides a tab the user has since picked by hand. `useThreadPrefill`
 * (D68e) is read here, once, and handed to whichever sub-module ends up
 * active — tab routing (`activeTabId`/`action.tab`) and thread prefill
 * (`action.prefill`) are separate D68 contracts, deliberately not conflated.
 */
export function ChartsModule() {
  const capabilities = useCapabilities();
  const requestedTab = useUIStore((state) => state.activeTabId);
  const prefill = useThreadPrefill();
  const eligible = TABS.filter((t) => t.legal(capabilities));

  const [tab, setTab] = useState<ChartTabId | null>(null);
  const appliedRequest = useRef(false);

  useEffect(() => {
    if (appliedRequest.current || eligible.length === 0) return;
    appliedRequest.current = true;
    const requested = eligible.find((t) => t.id === requestedTab);
    setTab((requested ?? eligible[0]).id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible.length]);

  useEffect(() => {
    if (tab && !eligible.some((t) => t.id === tab)) {
      setTab(eligible[0]?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible.map((t) => t.id).join(',')]);

  if (eligible.length === 0) {
    return <p className="text-sm text-(--color-fg-muted)">No chart type is available for the current data.</p>;
  }

  const active = eligible.find((t) => t.id === tab) ?? eligible[0];
  const ActiveComponent = active.Component;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 border-b border-(--color-border)" role="tablist" aria-label="Chart type">
        {eligible.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active.id === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active.id === t.id
                ? 'border-(--color-accent) text-(--color-fg)'
                : 'border-transparent text-(--color-fg-muted) hover:text-(--color-fg)'
            }`}
          >
            <t.icon size={14} aria-hidden={true} />
            {t.label}
          </button>
        ))}
      </div>

      <ActiveComponent prefill={prefill} />
    </div>
  );
}
