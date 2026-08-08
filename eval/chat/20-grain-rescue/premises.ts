// The gate DESIGN.md §2 requires before the question bank is frozen: every
// question declares the entity-dimension premises its wording depends on (a
// column existing, a specific categorical value being present, a year
// falling inside a temporal column's range), and every premise is checked
// against dataset-facts.json before the question can be committed. This is
// what would have caught v1's weather.csv error (described as multi-city;
// it's 100% City='Springfield') at design time — OPUS_REVIEW.md B1 — instead
// of in adversarial review.
import type { DatasetFacts } from './datasetFacts';

export type Premise =
  | { kind: 'column'; table: string; column: string }
  | { kind: 'categoricalValue'; table: string; column: string; value: string | number }
  | { kind: 'temporalYear'; table: string; column: string; year: number };

export interface PremiseViolation {
  premise: Premise;
  reason: string;
}

/** SUMMARIZE reports temporal min/max as ISO-ish strings (e.g. "2015-01-01"); a leading 4-digit group is the year across every Temporal physical type this project loads (DATE/TIMESTAMP). */
function yearOf(value: string | number): number | null {
  const match = /^(\d{4})/.exec(String(value));
  return match ? Number(match[1]) : null;
}

/** Returns one violation per failing premise; an empty array means every premise the question depends on is actually true of the data. */
export function assertPremises(facts: DatasetFacts, premises: readonly Premise[]): PremiseViolation[] {
  const violations: PremiseViolation[] = [];

  for (const premise of premises) {
    const table = facts.tables[premise.table];
    if (!table) {
      violations.push({ premise, reason: `no such table '${premise.table}' in dataset-facts.json` });
      continue;
    }

    if (premise.kind === 'column') {
      if (!table.columns.includes(premise.column)) {
        violations.push({ premise, reason: `'${premise.table}' has no column '${premise.column}'` });
      }
      continue;
    }

    if (premise.kind === 'categoricalValue') {
      const values = table.categoricalValues[premise.column];
      if (!values) {
        violations.push({ premise, reason: `'${premise.table}.${premise.column}' is not a known Categorical column` });
      } else if (!values.includes(premise.value)) {
        violations.push({
          premise,
          reason: `'${premise.table}.${premise.column}' never takes the value '${premise.value}' — actual values: ${values.join(', ')}`,
        });
      }
      continue;
    }

    if (premise.kind === 'temporalYear') {
      const range = table.temporalRange[premise.column];
      if (!range) {
        violations.push({ premise, reason: `'${premise.table}.${premise.column}' is not a known Temporal column` });
        continue;
      }
      const minYear = yearOf(range[0]);
      const maxYear = yearOf(range[1]);
      if (minYear === null || maxYear === null || premise.year < minYear || premise.year > maxYear) {
        violations.push({
          premise,
          reason: `'${premise.table}.${premise.column}' covers ${range[0]}..${range[1]}, which does not include ${premise.year}`,
        });
      }
      continue;
    }
  }

  return violations;
}
