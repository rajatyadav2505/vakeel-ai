import {
  documentTypeSchema,
  type CaseEvidenceGraph,
  type CaseFact,
  type ChronologyEvent,
  type ContradictionIssue,
  type DocumentType,
  type EvidenceAnchor,
  type EvidenceBackedClaim,
  type MissingDocumentIssue,
  type NextDocumentSuggestion,
  type Citation,
} from '@nyaya/shared';
import { z } from 'zod';
import { invokeJsonModel } from './llm';
import type { RuntimeLlmConfig } from './llm';

interface EvidenceSource {
  id: string;
  name: string;
  documentType: DocumentType;
  text?: string | null;
}

interface BuildEvidenceGraphInput {
  caseId: string;
  summary: string;
  voiceTranscript?: string | null;
  evidenceSources?: EvidenceSource[];
  llmConfig?: RuntimeLlmConfig;
}

const evidenceGraphRefinementSchema = z.object({
  chronology: z
    .array(
      z.object({
        title: z.string().min(1).optional(),
        date: z.string().nullable().optional(),
        details: z.string().min(1).optional(),
      })
    )
    .max(24)
    .optional(),
  contradictions: z
    .array(
      z.object({
        title: z.string().min(1).optional(),
        description: z.string().min(1).optional(),
        severity: z.enum(['low', 'medium', 'high']).optional(),
      })
    )
    .max(24)
    .optional(),
  missingDocuments: z
    .array(
      z.object({
        title: z.string().min(1).optional(),
        requiredDocumentType: documentTypeSchema.optional(),
        reason: z.string().min(1).optional(),
        confidence: z.number().finite().min(0).max(1).optional(),
      })
    )
    .max(24)
    .optional(),
  nextDocumentSuggestions: z
    .array(
      z.object({
        documentType: documentTypeSchema.optional(),
        reason: z.string().min(1).optional(),
        priority: z.enum(['high', 'medium', 'low']).optional(),
      })
    )
    .max(24)
    .optional(),
});

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(item);
  }
  return out;
}

function sentenceChunks(text: string) {
  return text
    .split(/[\n\r]+|(?<=[.?!])\s+/g)
    .map((item) => item.trim())
    .filter((item) => item.length >= 8);
}

function buildAnchor(params: {
  sourceType: EvidenceAnchor['sourceType'];
  sourceId?: string | undefined;
  sourceName?: string | undefined;
  excerpt: string;
  confidence?: number | undefined;
  page?: number | undefined;
  paragraph?: number | undefined;
}): EvidenceAnchor {
  return {
    sourceType: params.sourceType,
    ...(params.sourceId ? { sourceId: params.sourceId } : {}),
    ...(params.sourceName ? { sourceName: params.sourceName } : {}),
    ...(typeof params.page === 'number' ? { page: params.page } : {}),
    ...(typeof params.paragraph === 'number' ? { paragraph: params.paragraph } : {}),
    excerpt: params.excerpt.slice(0, 360),
    confidence: Math.min(1, Math.max(0.2, params.confidence ?? 0.72)),
  };
}

function findContextLine(text: string, needle: string) {
  const lines = sentenceChunks(text);
  const lowerNeedle = needle.toLowerCase();
  const line = lines.find((item) => item.toLowerCase().includes(lowerNeedle));
  return line ?? needle;
}

function inferFactsFromText(params: {
  text: string;
  sourceType: EvidenceAnchor['sourceType'];
  sourceId?: string;
  sourceName?: string;
}): CaseFact[] {
  const facts: CaseFact[] = [];
  const content = params.text;

  const vsRegex = /\b([A-Za-z][A-Za-z .,&'-]{2,80})\s+(?:v(?:s|\.?)|versus)\s+([A-Za-z][A-Za-z .,&'-]{2,80})\b/gi;
  for (const match of content.matchAll(vsRegex)) {
    const lhs = match[1]?.trim();
    const rhs = match[2]?.trim();
    if (!lhs || !rhs) continue;
    facts.push({
      id: crypto.randomUUID(),
      kind: 'party',
      label: 'Party',
      value: lhs,
      confidence: 0.82,
      anchors: [
        buildAnchor({
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          sourceName: params.sourceName,
          excerpt: findContextLine(content, match[0] ?? lhs),
          confidence: 0.82,
        }),
      ],
    });
    facts.push({
      id: crypto.randomUUID(),
      kind: 'party',
      label: 'Party',
      value: rhs,
      confidence: 0.82,
      anchors: [
        buildAnchor({
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          sourceName: params.sourceName,
          excerpt: findContextLine(content, match[0] ?? rhs),
          confidence: 0.82,
        }),
      ],
    });
  }

  const dateRegex =
    /\b(?:\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{2,4})\b/gi;
  for (const match of content.matchAll(dateRegex)) {
    const value = match[0]?.trim();
    if (!value) continue;
    facts.push({
      id: crypto.randomUUID(),
      kind: 'date',
      label: 'Date',
      value,
      confidence: 0.76,
      anchors: [
        buildAnchor({
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          sourceName: params.sourceName,
          excerpt: findContextLine(content, value),
          confidence: 0.76,
        }),
      ],
    });
  }

  const amountRegex = /\b(?:rs\.?|inr|₹)\s?[\d,]+(?:\.\d{1,2})?\b/gi;
  for (const match of content.matchAll(amountRegex)) {
    const value = match[0]?.trim();
    if (!value) continue;
    facts.push({
      id: crypto.randomUUID(),
      kind: 'amount',
      label: 'Amount',
      value,
      confidence: 0.78,
      anchors: [
        buildAnchor({
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          sourceName: params.sourceName,
          excerpt: findContextLine(content, value),
          confidence: 0.78,
        }),
      ],
    });
  }

  const sectionRegex = /\b(?:section|sec\.?)\s+\d+[a-zA-Z\-]*(?:\(\d+\))?\b/gi;
  for (const match of content.matchAll(sectionRegex)) {
    const value = match[0]?.trim();
    if (!value) continue;
    facts.push({
      id: crypto.randomUUID(),
      kind: 'section',
      label: 'Statutory Section',
      value,
      confidence: 0.79,
      anchors: [
        buildAnchor({
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          sourceName: params.sourceName,
          excerpt: findContextLine(content, value),
          confidence: 0.79,
        }),
      ],
    });
  }

  const cnrRegex = /\b[A-Z]{2,8}\d{8,14}\b/g;
  for (const match of content.matchAll(cnrRegex)) {
    const value = match[0]?.trim();
    if (!value) continue;
    facts.push({
      id: crypto.randomUUID(),
      kind: 'cnr',
      label: 'CNR / Case Number',
      value,
      confidence: 0.72,
      anchors: [
        buildAnchor({
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          sourceName: params.sourceName,
          excerpt: findContextLine(content, value),
          confidence: 0.72,
        }),
      ],
    });
  }

  const courtRegex = /\b(?:district|sessions|high court|supreme court|tribunal|consumer forum)[^.,\n]{0,100}/gi;
  for (const match of content.matchAll(courtRegex)) {
    const value = match[0]?.trim();
    if (!value) continue;
    facts.push({
      id: crypto.randomUUID(),
      kind: 'court',
      label: 'Forum',
      value,
      confidence: 0.68,
      anchors: [
        buildAnchor({
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          sourceName: params.sourceName,
          excerpt: findContextLine(content, value),
          confidence: 0.68,
        }),
      ],
    });
  }

  return uniqueBy(facts, (item) => `${item.kind}:${item.value.toLowerCase()}`);
}

function toSortableDate(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, ' ');
  const dmy = normalized.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (dmy) {
    const dayPart = dmy[1];
    const monthPart = dmy[2];
    const yearPart = dmy[3];
    if (!dayPart || !monthPart || !yearPart) return null;
    const day = dayPart.padStart(2, '0');
    const month = monthPart.padStart(2, '0');
    const year = yearPart.length === 2 ? `20${yearPart}` : yearPart;
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function inferChronologyFromFactsAndText(facts: CaseFact[], text: string): ChronologyEvent[] {
  const dateFacts = facts.filter((item) => item.kind === 'date');
  const events: ChronologyEvent[] = dateFacts.map((fact) => {
    const context = findContextLine(text, fact.value);
    const title = context.length > 90 ? `${context.slice(0, 87)}...` : context;
    return {
      id: crypto.randomUUID(),
      title,
      date: toSortableDate(fact.value),
      details: context,
      confidence: fact.confidence,
      anchors: fact.anchors,
    };
  });

  return uniqueBy(events, (item) => `${item.date ?? 'na'}:${item.title.toLowerCase()}`).sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });
}

function parseNumericAmount(value: string) {
  const digits = value.replace(/[^\d.]/g, '');
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

function detectContradictions(params: {
  facts: CaseFact[];
  summary: string;
  transcript?: string | null | undefined;
}): ContradictionIssue[] {
  const issues: ContradictionIssue[] = [];

  const amounts = params.facts.filter((item) => item.kind === 'amount');
  const numeric = amounts
    .map((item) => ({ fact: item, number: parseNumericAmount(item.value) }))
    .filter((item) => typeof item.number === 'number') as Array<{ fact: CaseFact; number: number }>;

  if (numeric.length >= 2) {
    const sorted = numeric.slice().sort((a, b) => b.number - a.number);
    const max = sorted[0];
    const min = sorted[sorted.length - 1];
    if (!max || !min) return issues;
    if (max.number > 0 && Math.abs(max.number - min.number) / max.number > 0.35) {
      issues.push({
        id: crypto.randomUUID(),
        title: 'Material amount mismatch detected',
        description: `Amounts vary significantly (${min.fact.value} vs ${max.fact.value}). Verify principal, interest, and penalty breakup.`,
        severity: 'high',
        anchors: [min.fact.anchors[0], max.fact.anchors[0]].filter(
          (anchor): anchor is EvidenceAnchor => Boolean(anchor)
        ),
      });
    }
  }

  const combined = `${params.summary}\n${params.transcript ?? ''}`.toLowerCase();
  if (combined.includes('no written agreement') && combined.includes('agreement dated')) {
    issues.push({
      id: crypto.randomUUID(),
      title: 'Agreement existence contradiction',
      description:
        'Case narrative mentions both absence of written agreement and a dated agreement. Confirm which statement is accurate.',
      severity: 'high',
      anchors: [
        buildAnchor({
          sourceType: 'case_summary',
          excerpt: 'Narrative contains conflicting agreement statements.',
          confidence: 0.74,
        }),
      ],
    });
  }

  if (combined.includes('notice not served') && combined.includes('notice served')) {
    issues.push({
      id: crypto.randomUUID(),
      title: 'Service status contradiction',
      description:
        'Narrative contains conflicting notice-service statements. Align service position with postal/tracking proof.',
      severity: 'medium',
      anchors: [
        buildAnchor({
          sourceType: 'case_summary',
          excerpt: 'Narrative contains conflicting service statements.',
          confidence: 0.7,
        }),
      ],
    });
  }

  return issues;
}

function docTypeSet(evidenceSources: EvidenceSource[]) {
  return new Set(evidenceSources.map((item) => item.documentType));
}

function detectMissingDocuments(params: {
  summary: string;
  evidenceSources: EvidenceSource[];
}): MissingDocumentIssue[] {
  const issues: MissingDocumentIssue[] = [];
  const text = params.summary.toLowerCase();
  const docs = docTypeSet(params.evidenceSources);

  const rules: Array<{
    trigger: RegExp;
    requiredType: DocumentType;
    title: string;
    reason: string;
    confidence: number;
  }> = [
    {
      trigger: /\bnotice\b/,
      requiredType: 'notice',
      title: 'Notice referenced without uploaded notice copy',
      reason: 'Summary mentions a notice, but no notice document is available for verification.',
      confidence: 0.84,
    },
    {
      trigger: /\bpostal|speed post|tracking\b/,
      requiredType: 'postal_proof',
      title: 'Service proof appears missing',
      reason: 'Service is referenced but postal proof / tracking acknowledgement is not uploaded.',
      confidence: 0.8,
    },
    {
      trigger: /\bagreement\b/,
      requiredType: 'agreement',
      title: 'Agreement referenced without agreement copy',
      reason: 'Summary references an agreement that is not present in uploaded evidence.',
      confidence: 0.86,
    },
    {
      trigger: /\border\b/,
      requiredType: 'order',
      title: 'Court order referenced without annexed order',
      reason: 'Summary references an order but no order document is uploaded.',
      confidence: 0.8,
    },
    {
      trigger: /\bpayment|cheque|transfer|receipt\b/,
      requiredType: 'receipt',
      title: 'Payment reference without payment proof',
      reason: 'Financial transaction is referenced without supporting receipt/bank proof.',
      confidence: 0.78,
    },
  ];

  for (const rule of rules) {
    if (!rule.trigger.test(text)) continue;
    if (docs.has(rule.requiredType)) continue;
    issues.push({
      id: crypto.randomUUID(),
      title: rule.title,
      requiredDocumentType: rule.requiredType,
      reason: rule.reason,
      confidence: rule.confidence,
    });
  }

  return issues;
}

function suggestNextDocuments(missingDocuments: MissingDocumentIssue[]): NextDocumentSuggestion[] {
  return missingDocuments
    .slice()
    .sort((a, b) => b.confidence - a.confidence)
    .map((item, index) => ({
      id: crypto.randomUUID(),
      documentType: item.requiredDocumentType,
      reason: item.reason,
      priority: index <= 1 || item.confidence >= 0.82 ? 'high' : item.confidence >= 0.7 ? 'medium' : 'low',
    }));
}

function compactTextForPrompt(params: BuildEvidenceGraphInput) {
  const chunks = [
    `Case summary:\n${params.summary}`,
    params.voiceTranscript ? `Voice transcript:\n${params.voiceTranscript}` : '',
    params.evidenceSources && params.evidenceSources.length
      ? `Evidence sources:\n${params.evidenceSources
          .map((item) => `- ${item.documentType}: ${item.name}${item.text ? `\n${item.text.slice(0, 900)}` : ''}`)
          .join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return chunks.slice(0, 12000);
}

async function refineWithLlm(params: {
  input: BuildEvidenceGraphInput;
  graph: CaseEvidenceGraph;
}): Promise<Partial<CaseEvidenceGraph> | null> {
  if (!params.input.llmConfig) return null;

  const llm = await invokeJsonModel({
    systemPrompt: [
      'You are an evidence operations analyst for Indian litigation.',
      'Return strict JSON only.',
      'Do not invent facts; only highlight consistency, chronology, and missing material.',
    ].join(' '),
    userPrompt: [
      'Build refinement output for chronology, contradictions, missing documents, and next-document suggestions.',
      compactTextForPrompt(params.input),
      'Output format: {"chronology":[...],"contradictions":[...],"missingDocuments":[...],"nextDocumentSuggestions":[...]}',
    ].join('\n\n'),
    temperature: 0.15,
    maxTokens: 1600,
    schema: evidenceGraphRefinementSchema,
    llmConfig: params.input.llmConfig,
  });

  if (!llm) return null;

  const chronology: ChronologyEvent[] =
    llm.chronology
      ?.filter((item) => item && typeof item.title === 'string' && typeof item.details === 'string')
      .map((item) => ({
        id: crypto.randomUUID(),
        title: item.title!.trim().slice(0, 180),
        date: typeof item.date === 'string' ? toSortableDate(item.date) ?? item.date.slice(0, 20) : null,
        details: item.details!.trim().slice(0, 600),
        confidence: 0.66,
        anchors: [
          buildAnchor({
            sourceType: 'case_summary',
            excerpt: `LLM refinement: ${item.title}`,
            confidence: 0.55,
          }),
        ],
      })) ?? [];

  const contradictions: ContradictionIssue[] =
    llm.contradictions
      ?.filter((item) => item && typeof item.title === 'string' && typeof item.description === 'string')
      .map((item) => ({
        id: crypto.randomUUID(),
        title: item.title!.trim().slice(0, 180),
        description: item.description!.trim().slice(0, 600),
        severity: item.severity ?? 'medium',
        anchors: [
          buildAnchor({
            sourceType: 'case_summary',
            excerpt: `LLM refinement: ${item.title}`,
            confidence: 0.56,
          }),
        ],
      })) ?? [];

  const missingDocuments: MissingDocumentIssue[] =
    llm.missingDocuments
      ?.filter(
        (item) =>
          item &&
          typeof item.title === 'string' &&
          typeof item.reason === 'string' &&
          typeof item.requiredDocumentType === 'string'
      )
      .map((item) => ({
        id: crypto.randomUUID(),
        title: item.title!.trim().slice(0, 180),
        requiredDocumentType: item.requiredDocumentType as DocumentType,
        reason: item.reason!.trim().slice(0, 400),
        confidence: Math.min(0.95, Math.max(0.3, item.confidence ?? 0.65)),
      })) ?? [];

  const nextDocumentSuggestions: NextDocumentSuggestion[] =
    llm.nextDocumentSuggestions
      ?.filter(
        (item) =>
          item && typeof item.documentType === 'string' && typeof item.reason === 'string'
      )
      .map((item) => ({
        id: crypto.randomUUID(),
        documentType: item.documentType as DocumentType,
        reason: item.reason!.trim().slice(0, 400),
        priority: item.priority ?? 'medium',
      })) ?? [];

  return {
    ...(chronology.length ? { chronology } : {}),
    ...(contradictions.length ? { contradictions } : {}),
    ...(missingDocuments.length ? { missingDocuments } : {}),
    ...(nextDocumentSuggestions.length ? { nextDocumentSuggestions } : {}),
  };
}

export async function buildCaseEvidenceGraph(input: BuildEvidenceGraphInput): Promise<CaseEvidenceGraph> {
  const baseFacts = inferFactsFromText({
    text: input.summary,
    sourceType: 'case_summary',
    sourceName: 'Case summary',
  });
  const transcriptFacts =
    input.voiceTranscript?.trim().length
      ? inferFactsFromText({
          text: input.voiceTranscript,
          sourceType: 'voice_transcript',
          sourceName: 'Voice transcript',
        })
      : [];
  const sourceFacts = (input.evidenceSources ?? []).flatMap((source) =>
    inferFactsFromText({
      text: source.text ?? '',
      sourceType: 'uploaded_document',
      sourceId: source.id,
      sourceName: source.name,
    })
  );

  const facts = uniqueBy(
    [...baseFacts, ...transcriptFacts, ...sourceFacts],
    (item) => `${item.kind}:${item.value.toLowerCase()}`
  );

  const chronology = inferChronologyFromFactsAndText(
    facts,
    [input.summary, input.voiceTranscript ?? '', ...(input.evidenceSources ?? []).map((item) => item.text ?? '')]
      .join('\n')
      .slice(0, 24000)
  );

  const contradictions = detectContradictions({
    facts,
    summary: input.summary,
    transcript: input.voiceTranscript,
  });

  const missingDocuments = detectMissingDocuments({
    summary: [input.summary, input.voiceTranscript ?? ''].join('\n'),
    evidenceSources: input.evidenceSources ?? [],
  });

  const nextDocumentSuggestions = suggestNextDocuments(missingDocuments);

  const graph: CaseEvidenceGraph = {
    caseId: input.caseId,
    extractionStatus: 'completed',
    facts,
    chronology,
    contradictions,
    missingDocuments,
    nextDocumentSuggestions,
    generatedAt: new Date().toISOString(),
  };

  const llmRefinement = await refineWithLlm({ input, graph });
  if (!llmRefinement) {
    return graph;
  }

  return {
    ...graph,
    ...(llmRefinement.chronology
      ? {
          chronology: uniqueBy(
            [...graph.chronology, ...llmRefinement.chronology],
            (item) => `${item.date ?? 'na'}:${item.title.toLowerCase()}`
          ).slice(0, 40),
        }
      : {}),
    ...(llmRefinement.contradictions
      ? {
          contradictions: uniqueBy(
            [...graph.contradictions, ...llmRefinement.contradictions],
            (item) => `${item.title.toLowerCase()}:${item.description.toLowerCase()}`
          ).slice(0, 20),
        }
      : {}),
    ...(llmRefinement.missingDocuments
      ? {
          missingDocuments: uniqueBy(
            [...graph.missingDocuments, ...llmRefinement.missingDocuments],
            (item) => `${item.requiredDocumentType}:${item.title.toLowerCase()}`
          ).slice(0, 20),
        }
      : {}),
    ...(llmRefinement.nextDocumentSuggestions
      ? {
          nextDocumentSuggestions: uniqueBy(
            [...graph.nextDocumentSuggestions, ...llmRefinement.nextDocumentSuggestions],
            (item) => `${item.documentType}:${item.reason.toLowerCase()}`
          ).slice(0, 20),
        }
      : {}),
  };
}

function firstAnchorFromFact(fact?: CaseFact): EvidenceAnchor[] {
  const anchor = fact?.anchors?.[0];
  if (!anchor) return [];
  return [anchor];
}

export function toProbabilityBand(value: number): 'low' | 'medium' | 'high' {
  if (value < 0.45) return 'low';
  if (value < 0.7) return 'medium';
  return 'high';
}

export function buildEvidenceBackedClaims(params: {
  statements: string[];
  facts: CaseFact[];
  citations: Citation[];
}): EvidenceBackedClaim[] {
  const factLookup = params.facts.map((fact) => ({
    fact,
    normalized: fact.value.toLowerCase(),
  }));

  return params.statements
    .map((statement) => {
      const normalized = statement.toLowerCase();
      const factMatch = factLookup.find((item) => item.normalized.length >= 4 && normalized.includes(item.normalized));
      const citationMatch = params.citations.find((item) => normalized.includes(item.title.toLowerCase().slice(0, 20)));

      if (factMatch) {
        return {
          id: crypto.randomUUID(),
          statement,
          supportClass: 'evidence' as const,
          requiresHumanConfirmation: false,
          anchors: firstAnchorFromFact(factMatch.fact),
        };
      }

      if (citationMatch) {
        return {
          id: crypto.randomUUID(),
          statement,
          supportClass: 'law' as const,
          requiresHumanConfirmation: false,
          anchors: [
            buildAnchor({
              sourceType: 'legal_retrieval',
              sourceId: citationMatch.id,
              sourceName: citationMatch.title,
              excerpt: citationMatch.excerpt,
              confidence: citationMatch.confidence,
            }),
          ],
        };
      }

      return {
        id: crypto.randomUUID(),
        statement,
        supportClass: 'assumption' as const,
        requiresHumanConfirmation: true,
        anchors: [
          buildAnchor({
            sourceType: 'case_summary',
            excerpt: 'No direct evidence/legal anchor identified for this claim.',
            confidence: 0.3,
          }),
        ],
      };
    })
    .slice(0, 12);
}
