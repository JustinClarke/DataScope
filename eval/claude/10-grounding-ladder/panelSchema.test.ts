import { describe, it, expect } from 'vitest';
import { parsePanelAnswer, SLOT_CAPS, OFFERS_CAP, PANEL_RESPONSE_SCHEMA, validatesAgainstPanelSchema } from './panelSchema';

function validPayload() {
  return {
    header: { text: 'titanic: 891 rows.', cites: ['fact:titanic.rowCount'] },
    structural: [{ text: 'Fare for Pclass group "1" runs 1.6σ above the rest.', cites: ['fact:titanic.outlier-group:Pclass:Fare'] }],
    quality: [] as { text: string; cites: string[] }[],
    behavioral: [] as { text: string; cites: string[] }[],
    offers: [{ actionId: 'action-1', verb: 'Explore' }],
  };
}

// Three of this harness's four runs died at this exact boundary
// (11-gemini-comparison-arm.md, step 0), and it had no tests before this file.
describe('parsePanelAnswer', () => {
  it('parses a well-formed panel', () => {
    const answer = parsePanelAnswer(JSON.stringify(validPayload()));
    expect(answer.header.text).toBe('titanic: 891 rows.');
    expect(answer.structural).toHaveLength(1);
    expect(answer.offers).toEqual([{ actionId: 'action-1', verb: 'Explore' }]);
  });

  it('parses a fence-wrapped payload (```json ... ```)', () => {
    const raw = '```json\n' + JSON.stringify(validPayload()) + '\n```';
    const answer = parsePanelAnswer(raw);
    expect(answer.header.text).toBe('titanic: 891 rows.');
  });

  it('parses a prose-prefixed payload ("Here is the panel: {...}")', () => {
    const raw = `Here is the panel:\n${JSON.stringify(validPayload())}`;
    const answer = parsePanelAnswer(raw);
    expect(answer.structural).toHaveLength(1);
  });

  it('throws when a slot exceeds its cap rather than silently truncating', () => {
    const payload = validPayload();
    payload.structural = Array.from({ length: SLOT_CAPS.structural + 1 }, (_, i) => ({ text: `claim ${i}`, cites: ['fact:x'] }));
    expect(() => parsePanelAnswer(JSON.stringify(payload))).toThrow(/exceeds cap/);
  });

  it('throws when offers exceeds its cap', () => {
    const payload = validPayload();
    payload.offers = Array.from({ length: OFFERS_CAP + 1 }, (_, i) => ({ actionId: `a${i}`, verb: 'Explore' }));
    expect(() => parsePanelAnswer(JSON.stringify(payload))).toThrow(/exceeds cap/);
  });

  it('throws when the header slot is missing', () => {
    const { header: _header, ...rest } = validPayload();
    expect(() => parsePanelAnswer(JSON.stringify(rest))).toThrow(/missing header/);
  });

  it('throws when a claim has no citations', () => {
    const payload = validPayload();
    payload.structural = [{ text: 'an uncited claim', cites: [] }];
    expect(() => parsePanelAnswer(JSON.stringify(payload))).toThrow(/cites must be/);
  });

  it('throws when no JSON object is present at all', () => {
    expect(() => parsePanelAnswer('The model refused to answer.')).toThrow(/no JSON object/);
  });
});

// PanelResponseSchema is what a provider's structured-output param is asked to
// constrain to (11-gemini-comparison-arm.md, "What ships" §1) — kept
// structurally honest against PanelAnswer here, since nothing else checks it.
describe('PANEL_RESPONSE_SCHEMA', () => {
  it('validates a well-formed panel', () => {
    expect(validatesAgainstPanelSchema(validPayload(), PANEL_RESPONSE_SCHEMA)).toBe(true);
  });

  it('rejects a slot that exceeds its cap', () => {
    const payload = validPayload();
    payload.structural = Array.from({ length: SLOT_CAPS.structural + 1 }, (_, i) => ({ text: `claim ${i}`, cites: ['fact:x'] }));
    expect(validatesAgainstPanelSchema(payload, PANEL_RESPONSE_SCHEMA)).toBe(false);
  });

  it('rejects offers exceeding its cap', () => {
    const payload = validPayload();
    payload.offers = Array.from({ length: OFFERS_CAP + 1 }, (_, i) => ({ actionId: `a${i}`, verb: 'Explore' }));
    expect(validatesAgainstPanelSchema(payload, PANEL_RESPONSE_SCHEMA)).toBe(false);
  });

  it('rejects a claim missing its required cites field', () => {
    const payload = { ...validPayload(), header: { text: 'no cites here' } };
    expect(validatesAgainstPanelSchema(payload, PANEL_RESPONSE_SCHEMA)).toBe(false);
  });
});
