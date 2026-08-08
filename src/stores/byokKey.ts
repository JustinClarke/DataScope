// D9 default custody: the raw BYOK key lives in memory only, for this tab's
// lifetime — never localStorage/IndexedDB/cookies. Deliberately a plain
// (non-persist) zustand store, unlike `stores/settings.ts`, so a reload always
// starts empty and no raw key can survive a tab close. "Remember my key"
// (server-side vault) is a separate opt-in the vault service owns
// (build/09-edge/03-vault) — this store never grows that capability itself.
import { create } from "zustand";

interface ByokKeyState {
  key: string | null;
  setKey: (key: string | null) => void;
  clearKey: () => void;
}

export const useByokKeyStore = create<ByokKeyState>((set) => ({
  key: null,
  setKey: (key) => set({ key: key && key.length > 0 ? key : null }),
  clearKey: () => set({ key: null }),
}));
