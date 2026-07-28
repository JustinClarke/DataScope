// The statement the transform guard is holding (S4, D73, master §13.3 / §12.1).
// Deliberately dumb: it holds one statement and knows nothing about running
// one. The three resolutions live in `services/runPath.ts` because two of them
// execute SQL. It is a store rather than component state because the two halves
// are in different trees now — a run action can originate anywhere in the app,
// while the modal is mounted once in `WorkbenchShell`.
import { create } from 'zustand';
import type { StatementInfo } from '../lib/statementClass';
import { CONSOLE_SESSION, type QuerySessionId } from './query';

interface RunGuardState {
  /** The statement held between Run and execution, awaiting the user's call. */
  pending: StatementInfo | null;
  /**
   * Which session raised it (S5). A resolution has to execute where the run
   * came from, or a query tab's mutation would land in the console's results.
   */
  pendingSession: QuerySessionId;
  hold: (info: StatementInfo, session: QuerySessionId) => void;
  release: () => void;
}

export const useRunGuardStore = create<RunGuardState>((set) => ({
  pending: null,
  pendingSession: CONSOLE_SESSION,
  hold: (info, session) => set({ pending: info, pendingSession: session }),
  release: () => set({ pending: null }),
}));
