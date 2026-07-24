import { useEffect, useState } from 'react';
import {
  Bot,
  ChartNoAxesCombined,
  ClipboardList,
  FolderInput,
  LayoutDashboard,
  ScatterChart,
  Share2,
  SkipForward,
  Table2,
  Terminal,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
import { useDatasetsStore } from '../stores/datasets';
import { useSettingsStore } from '../stores/settings';
import { useUIStore, type SidebarModule } from '../stores/ui';
import { useCapabilities } from '../hooks/useCapabilities';
import { JOIN_GRAPH_ENABLED } from '../lib/featureFlags';
import { SidebarCard } from './SidebarCard';
import { SidebarGroup } from './SidebarGroup';

interface Card {
  id: SidebarModule;
  label: string;
  icon: LucideIcon;
  enabled: boolean;
  disabledReason?: string;
}

interface Group {
  id: 'data' | 'explore' | 'analyze' | 'output';
  label: string;
  cards: Card[];
  /** §13.2's "Expanded when" column — the default reveal condition, before any manual toggle. */
  revealed: boolean;
}

/**
 * Sidebar navigation — four collapsible, capability-gated intent groups
 * (§13.2, D68d): DATA / EXPLORE / ANALYZE / OUTPUT. The sidebar is secondary
 * navigation now; the primary path is Verdict → ranked action → thread
 * (the Dossier). Per-card enabled/disabled logic is unchanged from the flat
 * pre-D68 sidebar — D68d only changes how destinations are grouped and
 * revealed.
 */
export function Sidebar() {
  const tables = useDatasetsStore((state) => state.tables);
  const aiMode = useSettingsStore((state) => state.aiMode);
  const skipToData = useSettingsStore((state) => state.skipToData);
  const setSkipToData = useSettingsStore((state) => state.setSkipToData);
  const shareLinks = useSettingsStore((state) => state.shareLinks);
  const activeModule = useUIStore((state) => state.activeModule);
  const setActiveModule = useUIStore((state) => state.setActiveModule);
  const capabilities = useCapabilities();

  const hasDatasets = tables.length > 0;

  const dataCards: Card[] = [
    { id: 'ingestion', label: 'Ingest', icon: FolderInput, enabled: true },
    {
      id: 'dossier',
      label: 'Blueprint',
      icon: LayoutDashboard,
      enabled: hasDatasets,
      disabledReason: 'Drop a dataset to get started',
    },
    {
      id: 'profile',
      label: 'Profile',
      icon: ClipboardList,
      enabled: hasDatasets,
      disabledReason: 'Drop a dataset to get started',
    },
    ...(JOIN_GRAPH_ENABLED
      ? [
          {
            id: 'relationships' as const,
            label: 'Join Graph',
            icon: Waypoints,
            enabled: tables.length >= 2,
            disabledReason: 'Needs 2+ tables',
          },
        ]
      : []),
  ];

  const exploreCards: Card[] = [
    {
      id: 'sql',
      label: 'SQL',
      icon: Terminal,
      enabled: hasDatasets,
      disabledReason: 'Drop a dataset to get started',
    },
    {
      id: 'charts',
      label: 'Charts',
      icon: ChartNoAxesCombined,
      enabled: hasDatasets && (capabilities.canDoTimeSeries || capabilities.canDoDistribution || capabilities.canDoCategoricalBreakdown),
      disabledReason: hasDatasets ? 'Needs a date, numeric, or categorical column' : 'Drop a dataset to get started',
    },
  ];

  const analyzeCards: Card[] = [
    {
      id: 'pivot',
      label: 'Pivot',
      icon: Table2,
      enabled: hasDatasets,
      disabledReason: 'Drop a dataset to get started',
    },
    {
      id: 'correlation',
      label: 'Correlation',
      icon: ScatterChart,
      enabled: capabilities.canDoCorrelation,
      disabledReason: 'Needs 2+ numeric columns',
    },
    {
      id: 'ai',
      label: 'AI Chat',
      icon: Bot,
      enabled: aiMode !== null,
      disabledReason: 'AI is off — enable in settings',
    },
  ];

  const outputCards: Card[] = [
    {
      id: 'export',
      label: 'Export / Share',
      icon: Share2,
      // Reachable with no dataset loaded too, so a share link created in an
      // earlier session can still be found and deleted (§12.3's "delete now"
      // control) even though tables themselves never persist across reloads.
      enabled: hasDatasets || shareLinks.length > 0,
      disabledReason: 'Drop a dataset to get started',
    },
  ];

  const groups: Group[] = [
    { id: 'data', label: 'DATA', cards: dataCards, revealed: true },
    { id: 'explore', label: 'EXPLORE', cards: exploreCards, revealed: hasDatasets },
    { id: 'analyze', label: 'ANALYZE', cards: analyzeCards, revealed: analyzeCards.some((c) => c.enabled) },
    { id: 'output', label: 'OUTPUT', cards: outputCards, revealed: outputCards.some((c) => c.enabled) },
  ];

  const [expanded, setExpanded] = useState<Set<Group['id']>>(new Set(['data']));

  // Auto-expand a group once its gate condition is met, or once it holds the
  // active module — never auto-collapses a group the user (or a prior
  // reveal) already opened.
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const group of groups) {
        if (group.revealed) next.add(group.id);
        if (group.cards.some((c) => c.id === activeModule)) next.add(group.id);
      }
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDatasets, activeModule, capabilities.canDoCorrelation, aiMode]);

  const toggleGroup = (id: Group['id']) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSkipToDataToggle = () => {
    const next = !skipToData;
    setSkipToData(next);
    if (next && hasDatasets) setActiveModule('profile');
  };

  return (
    <aside className="flex w-56 flex-col gap-3 overflow-y-auto border-r border-(--color-border) bg-(--color-bg) px-3 py-4">
      <label className="flex items-center gap-2 rounded-lg border border-(--color-border) px-2.5 py-2 text-xs text-(--color-fg)">
        <input
          type="checkbox"
          checked={skipToData}
          onChange={handleSkipToDataToggle}
          className="size-3.5 accent-(--color-accent)"
        />
        <SkipForward size={14} aria-hidden={true} className="text-(--color-fg-muted)" />
        <span className="flex-1">Skip to data</span>
      </label>

      {groups.map((group) => (
        <SidebarGroup
          key={group.id}
          label={group.label}
          expanded={expanded.has(group.id)}
          onToggle={() => toggleGroup(group.id)}
          badge={group.id === 'data' && tables.length > 0 ? `Tables (${tables.length})` : undefined}
        >
          {group.cards.map((card) => (
            <SidebarCard
              key={card.id}
              id={card.id}
              label={card.label}
              icon={card.icon}
              enabled={card.enabled}
              disabledReason={card.disabledReason}
            />
          ))}
        </SidebarGroup>
      ))}
    </aside>
  );
}
