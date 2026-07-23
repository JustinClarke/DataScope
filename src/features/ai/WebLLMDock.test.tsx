import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { WebLLMDock } from './WebLLMDock';
import { useSettingsStore } from '../../stores/settings';
import { useByokKeyStore } from '../../stores/byokKey';
import { useWebLLMStore } from '../../stores/webllm';
import { warmWebLLM } from '../../services/webllm';

// The dock triggers the real warm-up as a side effect; mock the service so the
// test asserts the trigger without a Worker or a model download in jsdom.
vi.mock('../../services/webllm', () => ({
  warmWebLLM: vi.fn(() => Promise.resolve(true)),
  WEBLLM_DOWNLOAD_SIZE: '~830 MB',
}));

afterEach(cleanup);

beforeEach(() => {
  vi.mocked(warmWebLLM).mockClear();
  localStorage.clear();
  useSettingsStore.setState({ aiMode: 'cloud', webllmConsent: null });
  useByokKeyStore.setState({ key: null });
  useWebLLMStore.setState({ status: 'idle', progress: 0, progressText: '', error: null });
  // jsdom has no WebGPU; the dock's eligibility gate reads `'gpu' in navigator`.
  Object.defineProperty(navigator, 'gpu', { value: {}, configurable: true });
});

describe('WebLLMDock — ask-first consent', () => {
  it('offers the download once, with the size named, when eligible', () => {
    const { getByText } = render(<WebLLMDock />);
    expect(getByText(/~830 MB/)).toBeTruthy();
    expect(vi.mocked(warmWebLLM)).not.toHaveBeenCalled();
  });

  it('accept records consent and starts the background warm-up', () => {
    const { getByText } = render(<WebLLMDock />);
    fireEvent.click(getByText('Download'));
    expect(useSettingsStore.getState().webllmConsent).toBe('accepted');
    expect(vi.mocked(warmWebLLM)).toHaveBeenCalled();
  });

  it('decline records the choice and renders nothing — the free tier keeps serving', () => {
    const { getByText, container } = render(<WebLLMDock />);
    fireEvent.click(getByText('Not now'));
    expect(useSettingsStore.getState().webllmConsent).toBe('declined');
    expect(container.textContent).toBe('');
    expect(vi.mocked(warmWebLLM)).not.toHaveBeenCalled();
  });

  it('never offers when a BYOK key is set — their own provider serves', () => {
    useByokKeyStore.setState({ key: 'sk-user-key' });
    const { container } = render(<WebLLMDock />);
    expect(container.textContent).toBe('');
  });

  it('never offers before a first-run mode choice or in local-only mode', () => {
    useSettingsStore.setState({ aiMode: null });
    expect(render(<WebLLMDock />).container.textContent).toBe('');
    cleanup();
    useSettingsStore.setState({ aiMode: 'local-only' });
    expect(render(<WebLLMDock />).container.textContent).toBe('');
  });

  it('never offers without WebGPU — the surface stays on the edge rung', () => {
    // Recreate a navigator without `gpu` (defineProperty can't delete cleanly in jsdom).
    const gpuLess = Object.create(Object.getPrototypeOf(navigator)) as Navigator;
    const spy = vi.spyOn(globalThis, 'navigator', 'get').mockReturnValue(gpuLess);
    try {
      const { container } = render(<WebLLMDock />);
      expect(container.textContent).toBe('');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('WebLLMDock — background progress', () => {
  it('warms on mount when consent was already given (a returning session)', () => {
    useSettingsStore.setState({ webllmConsent: 'accepted' });
    render(<WebLLMDock />);
    expect(vi.mocked(warmWebLLM)).toHaveBeenCalled();
  });

  it('shows the download progress bar while shards come down', () => {
    useSettingsStore.setState({ webllmConsent: 'accepted' });
    useWebLLMStore.setState({ status: 'downloading', progress: 0.42, progressText: 'Fetching param shard 12/30' });
    const { getByText } = render(<WebLLMDock />);
    expect(getByText(/Downloading local model — 42%/)).toBeTruthy();
    expect(getByText(/shard 12\/30/)).toBeTruthy();
  });

  it('shows the warming state at full bar', () => {
    useSettingsStore.setState({ webllmConsent: 'accepted' });
    useWebLLMStore.setState({ status: 'warming', progress: 1, progressText: 'Loading model onto GPU' });
    const { getByText } = render(<WebLLMDock />);
    expect(getByText(/Warming local model/)).toBeTruthy();
  });

  it('surfaces a load failure without blocking anything', () => {
    useSettingsStore.setState({ webllmConsent: 'accepted' });
    useWebLLMStore.setState({ status: 'error', error: 'Failed to fetch' });
    const { getByText } = render(<WebLLMDock />);
    expect(getByText(/failed to load — cloud keeps serving/i)).toBeTruthy();
  });

  it('gets out of the way once ready — the chat surface owns the running-locally state', () => {
    useSettingsStore.setState({ webllmConsent: 'accepted' });
    useWebLLMStore.setState({ status: 'ready' });
    const { container } = render(<WebLLMDock />);
    expect(container.textContent).toBe('');
  });
});
