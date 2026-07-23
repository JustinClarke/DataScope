// ViewSpec validator (D55) — the declarative, capability-gated layout artifact.
// A ViewSpec is versioned JSON: panels[] of componentId (from this fixed
// registry) + typed props + an optional §11.1-stage-6 chart config. The
// deterministic renderer (ViewSpecRenderer.tsx) maps componentId to a
// hardcoded component via this same registry — it never evals a string or
// executes model-authored code, so a future v0.5 AI producer (D56) can only
// ever compose panels this list already knows how to render.
import type { ViewSpec, ViewSpecPanel } from '../types';

export const VIEWSPEC_VERSION = '1.0.0';

export const VIEWSPEC_COMPONENT_REGISTRY = [
  'identity-band',
  'hero-join-graph',
  'hero-table-grid',
  'table-strip',
  'quality-headline',
  'time-coverage',
  'verdict',
  'top-insights',
  'sensitive-columns',
] as const;

export type ViewSpecComponentId = (typeof VIEWSPEC_COMPONENT_REGISTRY)[number];

export function isRegisteredComponent(id: string): id is ViewSpecComponentId {
  return (VIEWSPEC_COMPONENT_REGISTRY as readonly string[]).includes(id);
}

export interface ViewSpecValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Structural validation only — the renderer is the second gate (an unknown
 * componentId still can't render, even if this were skipped), but validating
 * here means a malformed spec never reaches the render path silently.
 */
export function validateViewSpec(spec: ViewSpec): ViewSpecValidationResult {
  const errors: string[] = [];

  if (typeof spec.viewspecVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(spec.viewspecVersion)) {
    errors.push(`viewspecVersion must be a semver string, got ${JSON.stringify(spec.viewspecVersion)}`);
  }

  if (!Array.isArray(spec.panels)) {
    errors.push('panels must be an array');
    return { valid: false, errors };
  }

  spec.panels.forEach((panel: ViewSpecPanel, index: number) => {
    if (!isRegisteredComponent(panel.componentId)) {
      errors.push(`panels[${index}].componentId "${panel.componentId}" is not in the fixed component registry`);
    }
    if (typeof panel.props !== 'object' || panel.props === null || Array.isArray(panel.props)) {
      errors.push(`panels[${index}].props must be a plain object`);
    }
    if (panel.tier !== 1 && panel.tier !== 2 && panel.tier !== 3) {
      errors.push(`panels[${index}].tier must be 1, 2, or 3, got ${JSON.stringify(panel.tier)}`);
    }
  });

  return { valid: errors.length === 0, errors };
}
