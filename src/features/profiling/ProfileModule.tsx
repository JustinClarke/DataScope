import { useUIStore } from '../../stores/ui';
import { ProfileDashboard } from './ProfileDashboard';

/**
 * The DATA group's "Profile" destination (§13.1, D48/D68d) — the always-on
 * per-table view, standalone now that Dossier and Profile are separate
 * top-level modules. Opens on whichever table `activeTabId` names (set by a
 * Dossier "open this table" click or a profile-bound ranked action) and
 * defaults to the first table otherwise — `ProfileDashboard` already handles
 * both via its own `initialTableId` prop.
 */
export function ProfileModule() {
  const requestedTableId = useUIStore((state) => state.activeTabId);
  const setActiveModule = useUIStore((state) => state.setActiveModule);

  return (
    <ProfileDashboard initialTableId={requestedTableId} onBack={() => setActiveModule('dossier')} />
  );
}
