import type { LucideIcon } from 'lucide-react';
import { useUIStore, type SidebarModule } from '../stores/ui';
import { Tooltip } from './Tooltip';

interface SidebarCardProps {
  id: SidebarModule;
  label: string;
  icon: LucideIcon;
  enabled: boolean;
  disabledReason?: string;
}

/**
 * One navigation card in the sidebar. Displays an icon and label, with visual
 * feedback for active/inactive state. When disabled, shows a tooltip explaining why.
 */
export function SidebarCard({ id, label, icon: Icon, enabled, disabledReason }: SidebarCardProps) {
  const activeModule = useUIStore((state) => state.activeModule);
  const setActiveModule = useUIStore((state) => state.setActiveModule);

  const isActive = activeModule === id;

  const handleClick = () => {
    if (enabled && !isActive) {
      setActiveModule(id);
    }
  };

  const cardContent = (
    <button
      onClick={handleClick}
      disabled={!enabled}
      className={`
        flex w-full flex-col items-center gap-2 rounded-lg px-4 py-3
        transition-all
        ${
          isActive
            ? 'bg-(--color-accent) text-(--color-accent-fg)'
            : enabled
              ? 'bg-transparent text-(--color-fg) hover:bg-(--color-border) cursor-pointer'
              : 'bg-transparent text-(--color-fg-muted) cursor-not-allowed opacity-50'
        }
      `}
    >
      <Icon size={22} aria-hidden="true" />
      <span className="text-xs font-medium text-center">{label}</span>
    </button>
  );

  if (!enabled && disabledReason) {
    return <Tooltip content={disabledReason}>{cardContent}</Tooltip>;
  }

  return cardContent;
}
