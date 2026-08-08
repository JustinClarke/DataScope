// The in-browser local model's consent + progress surface, docked above the
// bottom status bar. The ~924 MB download is never silent: eligible users (an
// AI mode chosen, no BYOK key — their own provider already serves — and WebGPU
// present) are asked once. Accepting starts the resumable background download
// with a progress bar here; declining keeps the quota'd cloud free tier
// serving and renders nothing. Nothing in this dock ever blocks the app.
import { useEffect } from "react";
import { Cpu, X } from "lucide-react";
import { useSettingsStore } from "../../stores/settings";
import { useByokKeyStore } from "../../stores/byokKey";
import { useWebLLMStore } from "../../stores/webllm";
import { warmWebLLM, WEBLLM_DOWNLOAD_SIZE } from "../../services/webllm";

function hasWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

export function WebLLMDock() {
  const aiMode = useSettingsStore((s) => s.aiMode);
  const consent = useSettingsStore((s) => s.webllmConsent);
  const setConsent = useSettingsStore((s) => s.setWebllmConsent);
  const byokKey = useByokKeyStore((s) => s.key);
  const status = useWebLLMStore((s) => s.status);
  const progress = useWebLLMStore((s) => s.progress);
  const progressText = useWebLLMStore((s) => s.progressText);

  const eligible =
    (aiMode === "cloud" || aiMode === "local-model") &&
    byokKey === null &&
    hasWebGPU();

  // Accepted (this session or a previous one): warm in the background. The
  // service is idempotent, so re-renders and route changes cost nothing.
  useEffect(() => {
    if (
      eligible &&
      consent === "accepted" &&
      (status === "idle" || status === "error")
    ) {
      void warmWebLLM();
    }
    // Warm-up is keyed to consent/eligibility, not transient status flaps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, consent]);

  if (!eligible) return null;

  if (consent === null) {
    return (
      <div className="flex items-center justify-between gap-3 border-t border-(--color-border) bg-(--color-bg) px-6 py-2">
        <p className="flex items-center gap-2 text-xs text-(--color-fg-muted)">
          <Cpu
            size={14}
            aria-hidden="true"
            className="shrink-0 text-(--color-accent)"
          />
          Run AI fully on your device? A one-time {WEBLLM_DOWNLOAD_SIZE} model
          download — afterwards questions never leave your browser. Skipping
          keeps the shared cloud free tier serving.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setConsent("accepted")}
            className="rounded-lg bg-(--color-accent) px-3 py-1 text-xs text-(--color-bg)"
          >
            Download
          </button>
          <button
            type="button"
            onClick={() => setConsent("declined")}
            className="rounded-lg border border-(--color-border) px-3 py-1 text-xs text-(--color-fg)"
            aria-label="Not now"
          >
            Not now
          </button>
        </div>
      </div>
    );
  }

  if (consent !== "accepted") return null;

  if (status === "downloading" || status === "warming") {
    const percent = Math.round(progress * 100);
    return (
      <div
        className="border-t border-(--color-border) bg-(--color-bg) px-6 py-2"
        role="status"
      >
        <div className="flex items-center justify-between text-xs text-(--color-fg-muted)">
          <span>
            {status === "downloading"
              ? `Downloading local model — ${percent}%`
              : "Warming local model…"}
          </span>
          <span className="max-w-96 truncate">{progressText}</span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded bg-(--color-border)">
          <div
            className="h-full bg-(--color-accent) transition-[width]"
            style={{ width: `${status === "warming" ? 100 : percent}%` }}
          />
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        className="flex items-center justify-between gap-3 border-t border-(--color-border) bg-(--color-bg) px-6 py-2"
        role="status"
      >
        <p className="text-xs text-(--color-fg-muted)">
          The local model failed to load — cloud keeps serving. Retry from AI
          settings.
        </p>
        <button
          type="button"
          onClick={() => setConsent("declined")}
          aria-label="Dismiss"
          className="rounded p-1 text-(--color-fg-muted) hover:bg-(--color-border)"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    );
  }

  // idle (warm-up about to start) or ready — the chat surface owns the
  // "running locally" state; the dock stays out of the way.
  return null;
}
