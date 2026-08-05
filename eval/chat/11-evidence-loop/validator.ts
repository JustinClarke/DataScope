import type { DraftAnswer, EvidencePacket, ValidatedAnswer } from './contracts';

function numericTokens(value: string): string[] {
  const withoutCitationLabels = value.replace(/\bevidence:(?:evidence:)?\d+\b/gi, '');
  return withoutCitationLabels.match(/(?<![A-Za-z_])-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?/g) ?? [];
}

function normalized(token: string): string {
  const percent = token.endsWith('%');
  const raw = (percent ? token.slice(0, -1) : token).replace(/,/g, '');
  const number = Number(raw);
  return Number.isFinite(number) ? `${number}${percent ? '%' : ''}` : token;
}

export function validateAnswer(answer: DraftAnswer, evidence: EvidencePacket[]): ValidatedAnswer {
  const evidenceById = new Map(evidence.map((packet) => [packet.id, packet]));
  const findings: DraftAnswer['findings'] = [];
  const rejected: ValidatedAnswer['rejected'] = [];
  for (const finding of answer.findings) {
    const reasons: string[] = [];
    if (finding.evidenceIds.length === 0) reasons.push('missing evidence id');
    const cited = finding.evidenceIds
      .map((id) => evidenceById.get(id))
      .filter((packet): packet is EvidencePacket => packet !== undefined);
    const unknown = finding.evidenceIds.filter((id) => !evidenceById.has(id));
    if (unknown.length > 0) reasons.push(`unknown evidence: ${unknown.join(', ')}`);
    const availableNumbers = new Set(cited.flatMap((packet) => numericTokens(packet.statement).map(normalized)));
    const unsupportedNumbers = numericTokens(finding.observation)
      .map(normalized)
      .filter((token) => !availableNumbers.has(token));
    if (unsupportedNumbers.length > 0) {
      reasons.push(`numbers absent from cited evidence: ${[...new Set(unsupportedNumbers)].join(', ')}`);
    }
    if (reasons.length === 0) findings.push(finding);
    else rejected.push({ finding, reasons });
  }
  const summary =
    findings.length > 0
      ? findings.map((finding) => finding.observation).join(' ')
      : 'No grounded factual findings survived validation.';
  return { ...answer, summary, findings, rejected };
}
