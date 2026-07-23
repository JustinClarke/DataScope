import type { FactRef, RankedAction } from '../../../types';

export interface VerdictProps {
  headlineFact: FactRef;
  actions: RankedAction[];
}

/**
 * The tier-1 Verdict (§13.1, D68c) — the one headline fact plus the top-3
 * ranked actions, the whole "what is this + what do I do next?" briefing.
 * `headlineFact` is always present, even below the interest floor: it then
 * carries the honest structural sentence ("N tables · rows · no single
 * dominant finding — here's the structure") built by
 * `lib/dossier.ts`'s `selectHeadlineFact`, never a manufactured claim.
 * Each action is an imperative verb linking to the *real* module that
 * answers the finding (a chart, the correlation view, the SQL playground),
 * plus the fact that motivates it — `lib/capabilities.ts` enforces the
 * honesty guard and the floor at generation time; this component only
 * renders and routes what it is given.
 */
export function Verdict({
  headlineFact,
  actions,
  onSelectAction,
}: VerdictProps & { onSelectAction: (action: RankedAction) => void }) {
  return (
    <div>
      <p className="text-base text-(--color-fg)">{headlineFact.statement}</p>
      {actions.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {actions.map((action, index) => (
            <li key={index}>
              <button
                type="button"
                onClick={() => onSelectAction(action)}
                className="text-left text-sm text-(--color-accent) hover:underline"
              >
                {action.verb}
              </button>
              <span className="text-sm text-(--color-fg-muted)"> — {action.evidence.statement}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
