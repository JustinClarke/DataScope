import { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "../../../stores/settings";
import { useByokKeyStore } from "../../../stores/byokKey";
import {
  requestSynthesis,
  type SynthesisUpgrade,
} from "../../../services/synthesis";
import type { FactRef, RankedAction, TableRegistryEntry } from "../../../types";

/**
 * The D56 "tailored this view" upgrade. The deterministic Verdict paints first
 * and is the complete surface; this fires *after* that paint and, only when the
 * user opted into a cloud/edge mode, asks the edge to re-phrase and re-rank the
 * same baseline in place. It never blocks paint and never changes a claim: a
 * malformed, over-claiming, or altered response — or an off/down/undeployed edge
 * — simply leaves the upgraded fields null and the deterministic Verdict on
 * screen. Each seam resolves independently, so a rejected headline can ride
 * alongside accepted actions. `paused` reflects the edge's typed kill-switch
 * answer, so the Blueprint can say so rather than degrade silently.
 */
export function useSynthesisUpgrade(
  tables: TableRegistryEntry[],
  baseline: { headlineFact: FactRef; actions: RankedAction[] } | null,
): {
  tailored: boolean;
  paused: boolean;
  headlineFact: FactRef | null;
  actions: RankedAction[] | null;
} {
  const aiMode = useSettingsStore((s) => s.aiMode);
  const routing = useSettingsStore((s) => s.byokPreference);
  const byokKey = useByokKeyStore((s) => s.key);
  const [upgrade, setUpgrade] = useState<SynthesisUpgrade | null>(null);
  // Opaque, content-free per-session id — keys the edge limiter only.
  const sessionId = useRef<string>(crypto.randomUUID()).current;

  const fingerprint = baseline
    ? `${aiMode}|${baseline.headlineFact.statement}|${baseline.actions.map((a) => a.verb).join("|")}`
    : null;

  useEffect(() => {
    setUpgrade(null);
    if (baseline === null) return;
    let cancelled = false;
    void requestSynthesis({
      aiMode,
      sessionId,
      tables,
      baseline,
      routing,
      byokKey,
    }).then((result) => {
      if (!cancelled) setUpgrade(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  const headlineFact =
    upgrade?.headlineFact.source === "ai" ? upgrade.headlineFact.value : null;
  const actions =
    upgrade?.actions.source === "ai" ? upgrade.actions.value : null;
  return {
    tailored: headlineFact !== null || actions !== null,
    paused: upgrade?.paused === true,
    headlineFact,
    actions,
  };
}
