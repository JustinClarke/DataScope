import { create } from 'zustand';
import type { StructureReport } from '../lib/structureReport';

/**
 * The universal `.dsps` receiver's render state (D62) — a dropped/opened
 * `.dsps` file, parsed locally with no network call, rendered read-only via
 * `ViewerMode`, the same shared render target the "open a share link" flow
 * (`WorkbenchShell`'s `useShareLinkOpener`) now routes through too: two
 * producers (a share fetch, a local file read) into one shared, read-only
 * render target — this store is why they can share one renderer.
 */
interface DspsReceiverState {
  document: StructureReport | null;
  error: string | null;
  open(document: StructureReport): void;
  fail(message: string): void;
  close(): void;
}

export const useDspsReceiverStore = create<DspsReceiverState>((set) => ({
  document: null,
  error: null,
  open(document) {
    set({ document, error: null });
  },
  fail(message) {
    set({ document: null, error: message });
  },
  close() {
    set({ document: null, error: null });
  },
}));
