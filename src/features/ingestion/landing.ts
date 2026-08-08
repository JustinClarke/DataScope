import type { SidebarModule } from "../../stores/ui";

/**
 * Where a completed ingest lands the user (§13.1, D68d/D70). The opinionated
 * default is the Blueprint — the promoted Dossier (module id 'dossier'), the
 * Verdict-forward opening the app leads with. The D68d "skip to data"
 * preference sends the returning analyst straight to the per-table data surface
 * instead; the Blueprint is the default, never a wall.
 */
export function postIngestLandingTarget(skipToData: boolean): SidebarModule {
  return skipToData ? "profile" : "dossier";
}
