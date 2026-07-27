// Act 2 AI defaults (W6, D71, master §5.1) — the recommendation logic only.
// No forced gate: §13.3 supersedes the old shell's blocking first-run
// AIModeChooser with a default posture the Workbench just starts in. Pure and
// unwired on purpose — the only surface that could ever show or act on a
// recommendation (the flat Off/Cloudflare/WebLLM/Your-own-key switches) is
// W7's AI pane, so wiring this into the shared, persisted `useSettingsStore`
// now would be an invisible behavior change with nothing yet rendering it.
import type { AIMode } from '../types';

function defaultHasWebGPU(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/**
 * The same signal `WebLLMDock`'s own post-consent eligibility check already
 * uses — WebGPU presence, nothing else. A device-memory floor was considered
 * and rejected: no GB threshold for coexisting with the pinned WebLLM model is
 * stated or verified anywhere in the spec, so adding one here would invent
 * certainty this probe doesn't have.
 */
export function isCapableDevice(hasWebGPU: () => boolean = defaultHasWebGPU): boolean {
  return hasWebGPU();
}

/**
 * §5.1's mapping, stated directly: Off = mode (a) = `'local-only'`; WebLLM =
 * mode (b) = `'local-model'`. A recommendation never touches `webllmConsent` —
 * D70's download-confirm stays the sole consent gate for the ~830 MB pull.
 */
export function recommendedWorkbenchAIMode(capableDevice: boolean): AIMode {
  return capableDevice ? 'local-model' : 'local-only';
}
