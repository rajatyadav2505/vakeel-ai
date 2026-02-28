import { describe, expect, it } from 'vitest';
import type { Citation } from '@nyaya/shared';
import { buildCaseEvidenceGraph, buildEvidenceBackedClaims, toProbabilityBand } from './evidence-os';

describe('evidence-os', () => {
  it('builds an evidence graph with chronology, contradictions, and missing-document signals', async () => {
    const graph = await buildCaseEvidenceGraph({
      caseId: crypto.randomUUID(),
      summary: [
        'Notice served to respondent on 01/02/2026 through speed post tracking entry.',
        'In another statement, notice not served due to wrong address.',
        'Agreement dated 05/01/2026 for Rs 1,00,000 and later demand for Rs 2,40,000.',
        'Section 138 NI Act invoked before District Court, Delhi. CNR DLCT010012342025.',
      ].join(' '),
      evidenceSources: [
        {
          id: crypto.randomUUID(),
          name: 'intake-summary.txt',
          documentType: 'evidence',
          text: 'Reference to legal notice and cheque dishonour without postal acknowledgement.',
        },
      ],
    });

    expect(graph.extractionStatus).toBe('completed');
    expect(graph.facts.some((fact) => fact.kind === 'amount')).toBe(true);
    expect(graph.facts.some((fact) => fact.kind === 'date')).toBe(true);
    expect(graph.facts.some((fact) => fact.kind === 'section')).toBe(true);
    expect(graph.chronology.length).toBeGreaterThan(0);
    expect(graph.contradictions.some((issue) => issue.title.toLowerCase().includes('service'))).toBe(
      true
    );
    expect(graph.contradictions.some((issue) => issue.title.toLowerCase().includes('amount'))).toBe(true);
    expect(graph.missingDocuments.some((issue) => issue.requiredDocumentType === 'postal_proof')).toBe(
      true
    );
    expect(graph.nextDocumentSuggestions.length).toBeGreaterThan(0);
  });

  it('classifies claims into evidence, law, and assumption buckets', async () => {
    const graph = await buildCaseEvidenceGraph({
      caseId: crypto.randomUUID(),
      summary: 'Agreement dated 05/01/2026 with demand of Rs 1,00,000.',
    });

    const citations: Citation[] = [
      {
        id: crypto.randomUUID(),
        title: 'Section 138 NI Act mandatory ingredients',
        source: 'bare_act',
        url: 'https://example.test/statute',
        excerpt: 'A cheque must be returned unpaid and notice served within statutory period.',
        confidence: 0.84,
      },
    ];

    const claims = buildEvidenceBackedClaims({
      statements: [
        'The claim amount includes Rs 1,00,000 as principal.',
        'Section 138 NI Act mandatory ingredients support maintainability.',
        'The respondent will definitely settle before first hearing.',
      ],
      facts: graph.facts,
      citations,
    });

    expect(claims[0]?.supportClass).toBe('evidence');
    expect(claims[1]?.supportClass).toBe('law');
    expect(claims[2]?.supportClass).toBe('assumption');
    expect(claims[2]?.requiresHumanConfirmation).toBe(true);
  });

  it('maps numeric probability to calibrated output bands', () => {
    expect(toProbabilityBand(0.3)).toBe('low');
    expect(toProbabilityBand(0.55)).toBe('medium');
    expect(toProbabilityBand(0.82)).toBe('high');
  });
});
