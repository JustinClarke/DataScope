import type { ProviderSummary } from './scorer';

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

export function printReport(summaries: ProviderSummary[]): void {
  console.log('\nD40 NL→SQL eval — §11.4\n');
  console.log(
    ['provider', 'n', 'exec-rate', 'correctness', 'repair-rate', 'est. tokens/turn']
      .map((h) => h.padEnd(18))
      .join(''),
  );
  for (const s of summaries) {
    console.log(
      [
        s.provider,
        String(s.total),
        pct(s.execRate),
        pct(s.correctnessRate),
        s.repairRate === null ? 'n/a' : pct(s.repairRate),
        s.avgEstTokensPerTurn.toFixed(0),
      ]
        .map((v) => String(v).padEnd(18))
        .join(''),
    );
  }
  console.log(
    '\nmock-cloud is a scripted plumbing check, not a capability measurement (100% by construction).',
  );
}
