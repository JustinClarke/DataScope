import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { TrustChromeBand } from './TrustChromeBand';
import { passesFactWordingGuard } from '../../lib/dsps';
import type { StructureReport } from '../../lib/structureReport';

const REPORT: StructureReport = {
  dspsVersion: '1.0.0',
  generatedAt: '2026-07-25T12:00:00.000Z',
  tables: [],
  insights: [],
};

describe('TrustChromeBand (D63)', () => {
  it('renders the D45 structure-only claim, clean against the phrasing guard', () => {
    const { container } = render(<TrustChromeBand report={REPORT} />);
    const band = container.querySelector('[data-testid="trust-chrome-band"]');
    expect(band?.textContent).toContain('Structure only');
    expect(band?.textContent).toContain('no data rows included');
    expect(passesFactWordingGuard(band?.textContent ?? '')).toBe(true);
  });

  it('renders an honest unsigned state rather than a fabricated signature (D63.2 unbuilt)', () => {
    const { container } = render(<TrustChromeBand report={REPORT} />);
    expect(container.textContent).toContain('Unsigned');
    expect(container.textContent).toContain('Signing not yet available');
  });
});
