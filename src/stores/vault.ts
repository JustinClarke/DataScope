// The browser's half of the opt-in "Remember my key" custody path (D9,
// build/09-edge/03-vault). What persists here is a *reference* and the session
// it is scoped to — never key material, which is exactly the trade the vault
// offers: the key moves server-side (encrypted, idle-expiring, deletable) so the
// browser can stop holding it. §5.2 names the BYOK reference as one of the few
// things settings may persist locally.
//
// The session id is deliberately vault-specific and minted only on the first
// store. The per-page-load id the edge limiter uses (AIChatModule) is ephemeral
// by design, and a durable id is what "across sessions" requires — so a user who
// never opts into the vault never gains a durable identifier at all, and one who
// does gains it only for the feature that needs it.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const VAULT_STORAGE_KEY = "datascope-vault";

interface VaultState {
  /** The durable vault session; null until a key is first remembered. */
  session: string | null;
  /** The reference token standing in for the stored key; null when none is stored. */
  ref: string | null;
  remember: (session: string, ref: string) => void;
  forget: () => void;
}

export const useVaultStore = create<VaultState>()(
  persist(
    (set) => ({
      session: null,
      ref: null,
      remember: (session, ref) => set({ session, ref }),
      // The session survives a forget: the same browser reusing its session id
      // keeps the vault's per-session credential cap and rate limits meaningful
      // across a remove-then-re-add, which a fresh id each time would defeat.
      forget: () => set({ ref: null }),
    }),
    {
      name: VAULT_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
