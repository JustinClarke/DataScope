// Command-palette open state (V2, §13.3) — lifted out of `CommandPalette`'s
// former local `useState` so its own ⌘K/Ctrl+K keyboard listener and
// `TitleBar`'s button share one source of truth instead of one driving the
// other through a synthetic keyboard-event dispatch.
import { create } from 'zustand';

interface PaletteOpenState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export const usePaletteOpenStore = create<PaletteOpenState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
}));
