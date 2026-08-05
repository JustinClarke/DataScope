// Hand-authored phrase asset for the phrase-library synthesis candidate
// (01-phrase-library.md). One entry per CapabilityKey `detectCapabilities`
// (src/lib/datasetCapabilities.ts) can return; the model never writes any of
// this prose, it only selects among these vetted phrasings per key. Reviewed
// once, kept in one file so a change to the wording is one diff.
//
// Experiment-scoped (ideation README: "nothing here ships") — unlike
// datasetCapabilities.ts, this is not product code.
import type { CapabilityKey } from '../../../src/lib/datasetCapabilities';

export interface CapabilityPhrase {
  key: CapabilityKey;
  /** Documentary only — src/lib/datasetCapabilities.ts is the actual gate;
   * this records what each key's detection rule already requires. */
  requires: string[];
  phrasings: string[];
}

export const CAPABILITY_PHRASES: CapabilityPhrase[] = [
  {
    key: 'seasonality',
    requires: ['temporal', 'quantitative', 'categorical'],
    phrasings: [
      'spotting seasonal swings over time',
      'tracking how measurements shift across the calendar',
      'comparing periods to find recurring patterns',
    ],
  },
  {
    key: 'cohort-retention',
    requires: ['temporal', 'repeated-entity-key'],
    phrasings: [
      'seeing how the same customers behave across repeat visits',
      'tracking repeat activity per customer over time',
      'measuring how often the same customers come back',
    ],
  },
  {
    key: 'group-comparison',
    requires: ['two-value-categorical', 'quantitative'],
    phrasings: [
      'comparing outcomes between two groups',
      'seeing what separates one group from the other',
      'breaking results down by a two-way split',
    ],
  },
  {
    key: 'lifetime-value',
    requires: ['join-key', 'temporal', 'money-quantitative'],
    phrasings: [
      'estimating how much each customer is worth over time',
      'calculating customer lifetime value',
      'tracking spend per customer across their order history',
    ],
  },
  {
    key: 'correlation-study',
    requires: ['quantitative', 'quantitative'],
    phrasings: [
      'finding which measurements move together',
      'checking whether these numbers are related',
      'spotting relationships between the numeric columns',
    ],
  },
];
