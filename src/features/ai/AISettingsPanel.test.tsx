import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { AISettingsPanel } from './AISettingsPanel';
import { SETTINGS_STORAGE_KEY, useSettingsStore } from '../../stores/settings';
import { useByokKeyStore } from '../../stores/byokKey';
import { VAULT_STORAGE_KEY, useVaultStore } from '../../stores/vault';
import { storeVaultedKey, deleteVaultedKey } from '../../services/vaultClient';

// The vault endpoint is mocked: this suite asserts the panel's custody behavior
// (what crosses, what persists, what a failure leaves behind), not the wire.
vi.mock('../../services/vaultClient', () => ({
  storeVaultedKey: vi.fn(),
  deleteVaultedKey: vi.fn(),
}));

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({
    aiMode: 'cloud',
    byokPreference: 'free-tier-first',
    byokRoutingTouched: false,
    theme: 'system',
    metadataOnlyRepair: true,
  });
  useByokKeyStore.setState({ key: null });
});

const noop = () => {};

describe('AISettingsPanel', () => {
  it('switches mode', () => {
    const { getByLabelText } = render(<AISettingsPanel onClose={noop} />);
    fireEvent.click(getByLabelText(/Local model \(in-browser\)/i));
    expect(useSettingsStore.getState().aiMode).toBe('local-model');
  });

  it('shows BYOK routing + key field only in API (cloud) mode', () => {
    const { queryByLabelText, rerender } = render(<AISettingsPanel onClose={noop} />);
    expect(queryByLabelText('Your API key or local endpoint')).toBeTruthy();

    useSettingsStore.setState({ aiMode: 'local-model' });
    rerender(<AISettingsPanel onClose={noop} />);
    expect(queryByLabelText('Your API key or local endpoint')).toBeNull();
  });

  it('switches BYOK routing preference (D3) and marks routing as explicitly touched (2026-07-23)', () => {
    expect(useSettingsStore.getState().byokRoutingTouched).toBe(false);
    const { getByLabelText } = render(<AISettingsPanel onClose={noop} />);
    fireEvent.click(getByLabelText(/Prefer my key/i));
    expect(useSettingsStore.getState().byokPreference).toBe('prefer-key');
    expect(useSettingsStore.getState().byokRoutingTouched).toBe(true);
  });

  it('keeps the entered key in memory only — never in localStorage (D9 default custody)', () => {
    const { getByLabelText } = render(<AISettingsPanel onClose={noop} />);
    fireEvent.change(getByLabelText('Your API key or local endpoint'), { target: { value: 'sk-secret-123' } });

    expect(useByokKeyStore.getState().key).toBe('sk-secret-123');
    // The raw key must not reach any persisted storage.
    expect(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '').not.toContain('sk-secret-123');
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      expect(localStorage.getItem(k)).not.toContain('sk-secret-123');
    }
  });

  it('masks a bearer key but shows a local Ollama endpoint in plain text, with matching disclosure copy (D9 field-shape detection, 2026-07-22)', () => {
    const { getByLabelText, getByText, queryByText } = render(<AISettingsPanel onClose={noop} />);
    const field = getByLabelText('Your API key or local endpoint') as HTMLInputElement;

    fireEvent.change(field, { target: { value: 'sk-secret-123' } });
    expect(field.type).toBe('password');
    expect(getByText(/attached per request and forwarded to your provider/i)).toBeTruthy();

    fireEvent.change(field, { target: { value: 'http://localhost:11434' } });
    expect(field.type).toBe('text');
    expect(getByText(/detected as a local Ollama endpoint/i)).toBeTruthy();
    // Vaulting only makes sense for a secret — never offered for a local endpoint.
    expect(queryByText(/remember my key/i)).toBeNull();
  });

  it('under explicit free-tier-first routing, an Ollama endpoint discloses the cloud-first overflow, not "zero egress" (D3, 2026-07-23)', () => {
    useSettingsStore.setState({ byokPreference: 'free-tier-first', byokRoutingTouched: true });
    const { getByLabelText, getByText, getAllByText, queryByText } = render(<AISettingsPanel onClose={noop} />);
    fireEvent.change(getByLabelText('Your API key or local endpoint'), { target: { value: 'http://localhost:11434' } });

    expect(getByText(/detected as a local Ollama endpoint/i)).toBeTruthy();
    expect(getAllByText(/only as overflow/i).length).toBeGreaterThan(0);
    expect(queryByText(/zero egress, same as the in-browser model/i)).toBeNull();
    expect(queryByText(/never at all when your key\/endpoint below/i)).toBeNull();
  });

  it('an untouched routing default keeps the zero-egress disclosure for an Ollama endpoint', () => {
    const { getByLabelText, getByText, queryByText } = render(<AISettingsPanel onClose={noop} />);
    fireEvent.change(getByLabelText('Your API key or local endpoint'), { target: { value: 'http://localhost:11434' } });

    expect(getByText(/zero egress, same as the in-browser model/i)).toBeTruthy();
    expect(queryByText(/only as overflow/i)).toBeNull();
  });

  it('clears the key on demand', () => {
    useByokKeyStore.setState({ key: 'sk-x' });
    const { getByText } = render(<AISettingsPanel onClose={noop} />);
    fireEvent.click(getByText('Clear'));
    expect(useByokKeyStore.getState().key).toBeNull();
  });

  it('discloses exactly the §5.1 API-mode payload list', () => {
    const { getByText } = render(<AISettingsPanel onClose={noop} />);
    expect(getByText(/schema \(table\/column names, types\), prompts, generated SQL, and/i)).toBeTruthy();
    expect(getByText(/error traces to the routed provider/i)).toBeTruthy();
  });

  it('metadata-only repair defaults on and toggles via settings (§11.3 / 06-ai/03)', () => {
    const { getByLabelText } = render(<AISettingsPanel onClose={noop} />);
    const toggle = getByLabelText(/Metadata-only repair/i) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    expect(useSettingsStore.getState().metadataOnlyRepair).toBe(true);

    fireEvent.click(toggle);
    expect(useSettingsStore.getState().metadataOnlyRepair).toBe(false);
  });

  it('closes via the close control', () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(<AISettingsPanel onClose={onClose} />);
    fireEvent.click(getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('AISettingsPanel — "Remember my key" (D9 opt-in vault, 09-edge/03)', () => {
  beforeEach(() => {
    useVaultStore.setState({ session: null, ref: null });
    vi.mocked(storeVaultedKey).mockReset();
    vi.mocked(deleteVaultedKey).mockReset();
  });

  it('cannot be checked until a key is entered', () => {
    const { getByLabelText } = render(<AISettingsPanel onClose={noop} />);
    const box = getByLabelText(/Remember my key across sessions/i) as HTMLInputElement;
    expect(box.disabled).toBe(true);

    fireEvent.change(getByLabelText('Your API key or local endpoint'), { target: { value: 'sk-secret-123' } });
    expect((getByLabelText(/Remember my key across sessions/i) as HTMLInputElement).disabled).toBe(false);
  });

  it('stores the key and keeps only the reference — never the key — in localStorage', async () => {
    vi.mocked(storeVaultedKey).mockResolvedValue({ ok: true, ref: 'ref-xyz' });
    useByokKeyStore.setState({ key: 'sk-secret-123' });
    const { getByLabelText } = render(<AISettingsPanel onClose={noop} />);

    fireEvent.click(getByLabelText(/Remember my key across sessions/i));
    await waitFor(() => expect(useVaultStore.getState().ref).toBe('ref-xyz'));

    const call = vi.mocked(storeVaultedKey).mock.calls[0][0];
    expect(call.key).toBe('sk-secret-123');
    expect(call.provider).toBe('openai');
    expect(call.sessionId).toBeTruthy();
    // The durable half of the credential persists; the key itself never does.
    for (let i = 0; i < localStorage.length; i++) {
      const stored = localStorage.getItem(localStorage.key(i)!) ?? '';
      expect(stored).not.toContain('sk-secret-123');
    }
    expect(localStorage.getItem(VAULT_STORAGE_KEY) ?? '').toContain('ref-xyz');
  });

  it('reuses the same vault session across a remove-then-re-add', async () => {
    vi.mocked(storeVaultedKey).mockResolvedValue({ ok: true, ref: 'ref-1' });
    vi.mocked(deleteVaultedKey).mockResolvedValue({ ok: true });
    useByokKeyStore.setState({ key: 'sk-secret-123' });
    const { getByLabelText } = render(<AISettingsPanel onClose={noop} />);

    fireEvent.click(getByLabelText(/Remember my key across sessions/i));
    await waitFor(() => expect(useVaultStore.getState().ref).toBe('ref-1'));
    const session = useVaultStore.getState().session;

    fireEvent.click(getByLabelText(/Remember my key across sessions/i));
    await waitFor(() => expect(useVaultStore.getState().ref).toBeNull());
    expect(useVaultStore.getState().session).toBe(session);

    vi.mocked(storeVaultedKey).mockResolvedValue({ ok: true, ref: 'ref-2' });
    fireEvent.click(getByLabelText(/Remember my key across sessions/i));
    await waitFor(() => expect(useVaultStore.getState().ref).toBe('ref-2'));
    expect(vi.mocked(storeVaultedKey).mock.calls[1][0].sessionId).toBe(session);
  });

  it('unchecking deletes the stored key', async () => {
    vi.mocked(deleteVaultedKey).mockResolvedValue({ ok: true });
    useVaultStore.setState({ session: 'sess-1', ref: 'ref-xyz' });
    const { getByLabelText } = render(<AISettingsPanel onClose={noop} />);

    const box = getByLabelText(/Remember my key across sessions/i) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);

    await waitFor(() => expect(useVaultStore.getState().ref).toBeNull());
    expect(deleteVaultedKey).toHaveBeenCalledWith({ sessionId: 'sess-1', ref: 'ref-xyz' });
  });

  it('a failed delete keeps the reference and says the key is still stored', async () => {
    vi.mocked(deleteVaultedKey).mockResolvedValue({ ok: false, code: 'unreachable' });
    useVaultStore.setState({ session: 'sess-1', ref: 'ref-xyz' });
    const { getByLabelText, findByText } = render(<AISettingsPanel onClose={noop} />);

    fireEvent.click(getByLabelText(/Remember my key across sessions/i));
    expect(await findByText(/your key is still stored/i)).toBeTruthy();
    // Dropping the reference locally would strand a real stored key.
    expect(useVaultStore.getState().ref).toBe('ref-xyz');
  });

  it('says so honestly when the deployment has no vault, leaving the key in-tab', async () => {
    vi.mocked(storeVaultedKey).mockResolvedValue({ ok: false, code: 'unavailable' });
    useByokKeyStore.setState({ key: 'sk-secret-123' });
    const { getByLabelText, findByText } = render(<AISettingsPanel onClose={noop} />);

    fireEvent.click(getByLabelText(/Remember my key across sessions/i));
    expect(await findByText(/isn’t available on this deployment/i)).toBeTruthy();
    expect(useVaultStore.getState().ref).toBeNull();
    expect((getByLabelText(/Remember my key across sessions/i) as HTMLInputElement).checked).toBe(false);
  });

  it('explains the empty key field when a remembered key is serving', () => {
    useVaultStore.setState({ session: 'sess-1', ref: 'ref-xyz' });
    const { getByText } = render(<AISettingsPanel onClose={noop} />);
    expect(getByText(/this browser holds only a reference/i)).toBeTruthy();
  });

  it('discloses the retention and delete terms of the opt-in (D21 language: verifiable behavior)', () => {
    const { getByText } = render(<AISettingsPanel onClose={noop} />);
    expect(getByText(/expires\s+after 90 days without use, and unchecking this deletes it/i)).toBeTruthy();
    expect(getByText(/Stores the key on our servers, encrypted/i)).toBeTruthy();
  });
});
