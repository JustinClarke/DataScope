import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { ModeSwitches } from './ModeSwitches';
import { useSettingsStore } from '../../stores/settings';

beforeEach(() => {
  useSettingsStore.setState({ aiMode: null, byokPreference: 'free-tier-first', byokRoutingTouched: false });
});
afterEach(() => cleanup());

describe('ModeSwitches — mode-to-store mapping (W7, §5.1)', () => {
  it('Off sets local-only', () => {
    const { getByText } = render(<ModeSwitches onConfigure={vi.fn()} />);
    fireEvent.click(getByText('Off'));
    expect(useSettingsStore.getState().aiMode).toBe('local-only');
  });

  it('Cloudflare sets cloud with free-tier-first routing', () => {
    const { getByText } = render(<ModeSwitches onConfigure={vi.fn()} />);
    fireEvent.click(getByText('Cloudflare'));
    expect(useSettingsStore.getState().aiMode).toBe('cloud');
    expect(useSettingsStore.getState().byokPreference).toBe('free-tier-first');
  });

  it('WebLLM sets local-model', () => {
    const { getByText } = render(<ModeSwitches onConfigure={vi.fn()} />);
    fireEvent.click(getByText('WebLLM'));
    expect(useSettingsStore.getState().aiMode).toBe('local-model');
  });

  it('Your own key sets cloud with prefer-key routing', () => {
    const { getByText } = render(<ModeSwitches onConfigure={vi.fn()} />);
    fireEvent.click(getByText('Your own key'));
    expect(useSettingsStore.getState().aiMode).toBe('cloud');
    expect(useSettingsStore.getState().byokPreference).toBe('prefer-key');
  });

  it('marks the active switch that matches the current (aiMode, byokPreference) pair', () => {
    useSettingsStore.setState({ aiMode: 'cloud', byokPreference: 'prefer-key' });
    const { getByText } = render(<ModeSwitches onConfigure={vi.fn()} />);
    expect(getByText('Your own key').closest('button')?.getAttribute('aria-pressed')).toBe('true');
    expect(getByText('Cloudflare').closest('button')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('renders the disclosure line iff aiMode is cloud', () => {
    const { queryByText, rerender } = render(<ModeSwitches onConfigure={vi.fn()} />);
    expect(queryByText(/Sends schema/)).toBeNull();

    useSettingsStore.setState({ aiMode: 'cloud' });
    rerender(<ModeSwitches onConfigure={vi.fn()} />);
    expect(queryByText(/Sends schema/)).toBeTruthy();

    useSettingsStore.setState({ aiMode: 'local-model' });
    rerender(<ModeSwitches onConfigure={vi.fn()} />);
    expect(queryByText(/Sends schema/)).toBeNull();
  });

  it('"Configure workspace" is always present and calls onConfigure', () => {
    const onConfigure = vi.fn();
    const { getByText } = render(<ModeSwitches onConfigure={onConfigure} />);
    fireEvent.click(getByText('Configure workspace'));
    expect(onConfigure).toHaveBeenCalled();
  });
});
