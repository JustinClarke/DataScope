// Wires W6's pure `isCapableDevice`/`recommendedWorkbenchAIMode` probe into
// the shared, persisted `useSettingsStore` for the first time (W7, D71,
// master §5.1) — the wiring `workbenchAIDefaults.ts`'s own header comment
// names as "W7's job". Ref-guarded the same way `useMapAutoOpen` (W4) is:
// runs at most once per mount, and only when `aiMode` is still `null`, so an
// explicit prior choice — including one restored from persisted settings —
// is never overwritten.
import { useEffect, useRef } from "react";
import { useSettingsStore } from "../stores/settings";
import {
  isCapableDevice,
  recommendedWorkbenchAIMode,
} from "./workbenchAIDefaults";

export function useApplyWorkbenchAIDefault(): void {
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    if (useSettingsStore.getState().aiMode !== null) return;
    useSettingsStore
      .getState()
      .setAIMode(recommendedWorkbenchAIMode(isCapableDevice()));
  }, []);
}
