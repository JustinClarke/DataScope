import { useState } from 'react';
import { CircleHelp, Settings } from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { EducationalPanel } from '../components/EducationalPanel';
import { StatusConsole } from '../components/StatusConsole';
import { Tooltip } from '../components/Tooltip';
import { EducationalPanelProvider } from './EducationalPanelContext';
import { useUIStore } from '../stores/ui';
import { IngestionPanel } from '../features/ingestion/IngestionPanel';
import { DossierModule } from '../features/profiling/DossierModule';
import { ProfileModule } from '../features/profiling/ProfileModule';
import { SqlModule } from '../features/sql/SqlModule';
import { PivotModule } from '../features/sql/PivotModule';
import { ChartsModule } from '../features/charts/ChartsModule';
import { CorrelationModule } from '../features/charts/correlation/CorrelationModule';
import { JoinGraphModule } from '../features/charts/relationships/JoinGraphModule';
import { AIChatModule } from '../features/ai/AIChatModule';
import { AIModeChooser } from '../features/ai/AIModeChooser';
import { AISettingsPanel } from '../features/ai/AISettingsPanel';
import { WebLLMDock } from '../features/ai/WebLLMDock';
import { useSettingsStore } from '../stores/settings';

// D68d: Learn left v0 nav — the Dossier absorbed the guided tour's job (D48).
// What remains is a one-line pointer to that, not a rebuilt Learn surface.
const HELP_TEXT = 'DataScope runs entirely in your browser — drop a file, explore, nothing leaves your machine.';

function AppContent() {
  const activeModule = useUIStore((state) => state.activeModule);
  // D2: null until the first-run chooser is answered — no silent default, and no
  // inference can run before a mode is chosen.
  const aiMode = useSettingsStore((state) => state.aiMode);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="flex h-svh flex-col">
      <header className="flex items-center justify-between border-b border-(--color-border) px-6 py-4">
        <h1 className="text-lg font-semibold text-(--color-fg)">DataScope</h1>
        <div className="flex items-center gap-1">
          <Tooltip content={HELP_TEXT}>
            <button
              type="button"
              className="rounded p-2 text-(--color-fg-muted) hover:bg-(--color-border) transition-colors"
              aria-label="Help"
            >
              <CircleHelp size={20} aria-hidden="true" />
            </button>
          </Tooltip>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded p-2 text-(--color-fg-muted) hover:bg-(--color-border) transition-colors"
            aria-label="AI settings"
          >
            <Settings size={20} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex flex-1 flex-col overflow-hidden bg-(--color-bg)">
          <div className="flex flex-1 flex-col overflow-auto p-6">
            <div className="mb-4">
              <EducationalPanel />
            </div>
            {/* min-h-0 lets this slot's real remaining height (after EducationalPanel)
                reach modules like AIChatModule that size themselves with h-full — without
                it, h-full resolves against the whole scroll container and overflows past
                the visible pane by EducationalPanel's height. */}
            <div className="min-h-0 flex-1">
              {activeModule === 'ingestion' ? (
                <IngestionPanel />
              ) : activeModule === 'dossier' ? (
                <DossierModule />
              ) : activeModule === 'profile' ? (
                <ProfileModule />
              ) : activeModule === 'sql' ? (
                <SqlModule />
              ) : activeModule === 'pivot' ? (
                <PivotModule />
              ) : activeModule === 'charts' ? (
                <ChartsModule />
              ) : activeModule === 'correlation' ? (
                <CorrelationModule />
              ) : activeModule === 'relationships' ? (
                <JoinGraphModule />
              ) : activeModule === 'ai' ? (
                <AIChatModule />
              ) : (
                <div className="rounded-lg border border-(--color-border) bg-(--color-bg) p-4">
                  <p className="text-center text-(--color-fg-muted)">
                    {activeModule.charAt(0).toUpperCase() + activeModule.slice(1).replace('-', ' ')} panel
                  </p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      <WebLLMDock />
      <StatusConsole />

      {aiMode === null && <AIModeChooser />}
      {settingsOpen && <AISettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function App() {
  return (
    <EducationalPanelProvider>
      <AppContent />
    </EducationalPanelProvider>
  );
}

export default App
