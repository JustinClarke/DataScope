import type { VerifiedFact } from './verifier';

function value(number: number, unit: string): string {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(number)} ${unit}`;
}

const COMPARISON_WORDS: Record<string, string> = {
  greater_than: 'greater than',
  less_than: 'less than',
  equal: 'equal to',
};

export function renderVerifiedFact(fact: VerifiedFact): string {
  const subject = `${fact.subject} (${value(fact.leftValue, fact.unit)})`;
  if (fact.kind === 'comparison') {
    return `${subject} was ${COMPARISON_WORDS[fact.operator]} ${fact.object} (${value(fact.rightValue, fact.unit)}).`;
  }
  if (fact.kind === 'change') {
    return `${fact.subject} was a verified ${fact.operator} from ${fact.object}: ${value(fact.rightValue, fact.unit)} to ${value(fact.leftValue, fact.unit)}.`;
  }
  if (fact.kind === 'extremum') {
    return `${subject} was the ${fact.operator} for the complete evidence scope.`;
  }
  return `${subject} was ${fact.operator} the threshold ${value(fact.rightValue, fact.unit)}.`;
}
