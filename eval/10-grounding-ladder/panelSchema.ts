// The panel output contract for the grounding-ladder experiment
// (10-grounding-ladder.md, "The output contract is the panel object, not
// {claims:[...]}"). Replaces 08's flat claim list with the shape the UI
// actually consumes (SynthesisPanel.tsx): every item pre-labelled with the
// slot it belongs to, so slot misassignment is measurable and the per-slot
// ladder curves come out of one pass. Caps are part of the contract — 08's
// kill criterion (i) was a 38-claim fact dump, and a schema that cannot
// express 38 claims cannot fail that way, so the parser rejects an
// over-length slot rather than silently truncating it.
export type PanelSlot = 'header' | 'structural' | 'quality' | 'behavioral' | 'offers';

export interface PanelClaim {
  text: string;
  cites: string[];
}

export interface PanelOffer {
  actionId: string;
  verb: string;
}

export interface PanelAnswer {
  header: PanelClaim;
  structural: PanelClaim[];
  quality: PanelClaim[];
  behavioral: PanelClaim[];
  offers: PanelOffer[];
}

/** Per-slot caps (doc, Phase 1's output contract) — part of the contract, not a post-hoc trim. */
export const SLOT_CAPS: Record<'structural' | 'quality' | 'behavioral', number> = {
  structural: 3,
  quality: 3,
  behavioral: 2,
};

/** Offers target exactly 3 (ids from the deterministic ranker) — a model
 * returning fewer is a scoring finding (kill criterion l), not a contract
 * violation, so the parser caps at 3 rather than requiring exactly 3. */
export const OFFERS_CAP = 3;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

function parseClaim(entry: unknown, path: string): PanelClaim {
  if (typeof entry !== 'object' || entry === null) throw new Error(`${path}: not an object`);
  const { text, cites } = entry as { text?: unknown; cites?: unknown };
  if (!isNonEmptyString(text)) throw new Error(`${path}: missing text`);
  if (!Array.isArray(cites) || cites.length === 0 || !cites.every(isNonEmptyString)) {
    throw new Error(`${path}: cites must be a non-empty string array`);
  }
  return { text: text.trim(), cites: cites.map((c) => c.trim()) };
}

function parseClaimArray(entry: unknown, path: string, cap: number): PanelClaim[] {
  if (!Array.isArray(entry)) throw new Error(`${path}: not an array`);
  if (entry.length > cap) throw new Error(`${path}: ${entry.length} items exceeds cap of ${cap}`);
  return entry.map((e, i) => parseClaim(e, `${path}[${i}]`));
}

function parseOffer(entry: unknown, path: string): PanelOffer {
  if (typeof entry !== 'object' || entry === null) throw new Error(`${path}: not an object`);
  const { actionId, verb } = entry as { actionId?: unknown; verb?: unknown };
  if (!isNonEmptyString(actionId)) throw new Error(`${path}: missing actionId`);
  if (!isNonEmptyString(verb)) throw new Error(`${path}: missing verb`);
  return { actionId: actionId.trim(), verb: verb.trim() };
}

/** Tolerant of a fenced/prefaced JSON object (same leniency as 03/08's
 * `parseClaimsAnswer`) but throws on anything structurally out of contract —
 * missing slot, wrong shape, over-cap array — so the caller degrades instead
 * of scoring a mangled panel. */
export function parsePanelAnswer(raw: string): PanelAnswer {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object in model output');
  const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;

  if (!('header' in parsed)) throw new Error('missing header slot');
  const header = parseClaim(parsed.header, 'header');
  const structural = parseClaimArray(parsed.structural ?? [], 'structural', SLOT_CAPS.structural);
  const quality = parseClaimArray(parsed.quality ?? [], 'quality', SLOT_CAPS.quality);
  const behavioral = parseClaimArray(parsed.behavioral ?? [], 'behavioral', SLOT_CAPS.behavioral);

  if (!Array.isArray(parsed.offers)) throw new Error('offers: not an array');
  if (parsed.offers.length > OFFERS_CAP) throw new Error(`offers: ${parsed.offers.length} items exceeds cap of ${OFFERS_CAP}`);
  const offers = parsed.offers.map((e, i) => parseOffer(e, `offers[${i}]`));

  return { header, structural, quality, behavioral, offers };
}
