import { describe, expect, it } from 'vitest';
import { postIngestLandingTarget } from './landing';

describe('postIngestLandingTarget', () => {
  it('opens on the Blueprint by default', () => {
    expect(postIngestLandingTarget(false)).toBe('dossier');
  });

  it('honors the D68d skip-to-data preference', () => {
    expect(postIngestLandingTarget(true)).toBe('profile');
  });
});
