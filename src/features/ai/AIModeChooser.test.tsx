import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { AIModeChooser } from './AIModeChooser';
import { useSettingsStore } from '../../stores/settings';

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({ aiMode: null, byokPreference: 'free-tier-first', theme: 'system' });
});

describe('AIModeChooser (D2 — first-run, no silent default)', () => {
  it('offers all three modes with local-only as a first-class choice', () => {
    const { getByText } = render(<AIModeChooser />);
    expect(getByText('Local-only (AI off)')).toBeTruthy();
    expect(getByText('Local model')).toBeTruthy();
    expect(getByText('API')).toBeTruthy();
  });

  it('describes API mode as a shared free budget, not a personal allowance', () => {
    const { getByText } = render(<AIModeChooser />);
    expect(getByText(/shared free budget/i)).toBeTruthy();
  });

  it('sets the chosen mode (and no mode is set before a click)', () => {
    expect(useSettingsStore.getState().aiMode).toBeNull();
    const { getByText } = render(<AIModeChooser />);
    fireEvent.click(getByText('Local-only (AI off)'));
    expect(useSettingsStore.getState().aiMode).toBe('local-only');
  });
});
