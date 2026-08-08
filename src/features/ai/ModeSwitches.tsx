// Flat AI mode switches (W7, D71, master §5.1's Workbench amendment) — a
// presentation re-partition of AISettingsPanel's existing Mode radio, not a
// fourth mode. Each button writes the same (aiMode, byokPreference) pair a
// user picking that radio option would have set. "Configure workspace" is
// always visible regardless of mode — "no forced gate" holds for mode
// switching too.
import { Cloud, Cpu, Key, Settings, ShieldOff } from "lucide-react";
import { useSettingsStore, type BYOKPreference } from "../../stores/settings";
import type { AIMode } from "../../types";

type SwitchId = "off" | "cloudflare" | "webllm" | "byok";

const SWITCHES: {
  id: SwitchId;
  label: string;
  icon: typeof Cloud;
  aiMode: AIMode;
  byokPreference?: BYOKPreference;
}[] = [
  { id: "off", label: "Off", icon: ShieldOff, aiMode: "local-only" },
  {
    id: "cloudflare",
    label: "Cloudflare",
    icon: Cloud,
    aiMode: "cloud",
    byokPreference: "free-tier-first",
  },
  { id: "webllm", label: "WebLLM", icon: Cpu, aiMode: "local-model" },
  {
    id: "byok",
    label: "Your own key",
    icon: Key,
    aiMode: "cloud",
    byokPreference: "prefer-key",
  },
];

function activeSwitchId(
  aiMode: AIMode | null,
  byokPreference: BYOKPreference,
): SwitchId | null {
  if (aiMode === "local-only") return "off";
  if (aiMode === "local-model") return "webllm";
  if (aiMode === "cloud")
    return byokPreference === "prefer-key" ? "byok" : "cloudflare";
  return null;
}

interface ModeSwitchesProps {
  onConfigure: () => void;
}

export function ModeSwitches({ onConfigure }: ModeSwitchesProps) {
  const aiMode = useSettingsStore((s) => s.aiMode);
  const byokPreference = useSettingsStore((s) => s.byokPreference);
  const setAIMode = useSettingsStore((s) => s.setAIMode);
  const setByokPreference = useSettingsStore((s) => s.setByokPreference);
  const active = activeSwitchId(aiMode, byokPreference);

  return (
    <div className="flex flex-col gap-2 border-b border-(--color-border) p-3">
      <div className="flex gap-1" role="group" aria-label="AI mode">
        {SWITCHES.map(
          ({
            id,
            label,
            icon: Icon,
            aiMode: mode,
            byokPreference: preference,
          }) => (
            <button
              key={id}
              type="button"
              aria-pressed={active === id}
              onClick={() => {
                setAIMode(mode);
                if (preference) setByokPreference(preference);
              }}
              className={`flex flex-1 flex-col items-center gap-1 rounded-lg border px-1.5 py-1.5 text-[11px] ${
                active === id
                  ? "border-(--color-ai) bg-(--color-ai)/10 text-(--color-ai-2)"
                  : "border-(--color-border) text-(--color-fg-muted) hover:text-(--color-fg)"
              }`}
            >
              <Icon size={14} aria-hidden="true" />
              {label}
            </button>
          ),
        )}
      </div>
      {aiMode === "cloud" && (
        <p className="text-xs text-(--color-fg-muted)">
          Sends schema, prompts, generated SQL, and error traces to the routed
          provider.
        </p>
      )}
      <button
        type="button"
        onClick={onConfigure}
        className="flex items-center gap-1.5 self-start text-xs text-(--color-ai-2) hover:underline"
      >
        <Settings size={12} aria-hidden="true" />
        Configure workspace
      </button>
    </div>
  );
}
