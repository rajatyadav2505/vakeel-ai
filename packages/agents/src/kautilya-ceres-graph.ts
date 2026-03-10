import type {
  CaseEvidenceGraph,
  Citation,
  DocumentType,
  GroundedLegalClaim,
  KautilyaAuthorityNode,
  KautilyaCaseGraph,
  KautilyaEvidenceNode,
  KautilyaHistoryEvent,
  KautilyaIssueNode,
  KautilyaMandalaEdge,
  KautilyaPhase,
  KautilyaProcedureGate,
  KautilyaStakeholderNode,
  KautilyaUncertaintyNode,
  LegalResearchPacket,
  MissingDocumentIssue,
  PrecedentAuthority,
  StatutoryAuthority,
} from '@nyaya/shared';
import { buildCaseEvidenceGraph } from './evidence-os';
import {
  buildLegalResearchPacket,
  legalGroundingStatus,
  legalResearchPacketToCitations,
  verifyLegalClaims,
} from './legal-research';
import type { RuntimeLlmConfig } from './llm';

export interface KautilyaDocumentInput {
  id: string;
  name: string;
  documentType: DocumentType;
  text?: string | null;
}

export interface CompileKautilyaCaseGraphInput {
  caseId: string;
  summary: string;
  objective: string;
  forum?: string | null;
  jurisdiction?: string | null;
  reliefSought?: string | null;
  voiceTranscript?: string | null;
  parsedDocumentTexts?: string[];
  documents?: KautilyaDocumentInput[];
  llmConfig?: RuntimeLlmConfig;
}

export interface CompiledKautilyaContext {
  caseGraph: KautilyaCaseGraph;
  evidenceGraph: CaseEvidenceGraph;
  legalResearchPacket: LegalResearchPacket;
  citations: Citation[];
  groundedLegalClaims: GroundedLegalClaim[];
  unverifiedClaims: GroundedLegalClaim[];
  legalGroundingStatus: 'complete' | 'incomplete';
  legalAuthorities: Array<StatutoryAuthority | PrecedentAuthority>;
  inferredPhase: KautilyaPhase;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function titleFromTag(tag: string) {
  return tag
    .split(/[_\s]+/g)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenOverlap(lhs: string, rhs: string) {
  const a = new Set(normalize(lhs).split(' ').filter((token) => token.length >= 3));
  const b = new Set(normalize(rhs).split(' ').filter((token) => token.length >= 3));
  if (!a.size || !b.size) return 0;
  let hits = 0;
  for (const token of a) {
    if (b.has(token)) hits += 1;
  }
  return hits / Math.max(a.size, b.size);
}

function inferPhase(text: string): KautilyaPhase {
  const lower = text.toLowerCase();
  if (lower.includes('appeal') || lower.includes('appellate')) return 'appeal';
  if (lower.includes('interim') || lower.includes('injunction') || lower.includes('stay')) {
    return 'interim_relief';
  }
  if (lower.includes('settlement') || lower.includes('concession')) return 'settlement';
  if (lower.includes('cross') || lower.includes('witness')) return 'evidence';
  if (lower.includes('disclosure') || lower.includes('discovery')) return 'discovery';
  if (lower.includes('pleading') || lower.includes('maintainability')) return 'pleadings';
  if (lower.includes('hearing') || lower.includes('oral')) return 'hearing';
  return 'pre_litigation';
}

function buildEvidenceNodes(params: {
  documents: KautilyaDocumentInput[];
  summary: string;
  voiceTranscript?: string | null;
  issueLabels: string[];
}): KautilyaEvidenceNode[] {
  const nodes: KautilyaEvidenceNode[] = params.documents.map((document) => ({
    id: document.id,
    label: document.name,
    sourceName: document.name,
    documentType: document.documentType,
    excerpt: (document.text ?? document.name).slice(0, 260),
    confidence: 0.74,
    issueIds: params.issueLabels
      .map((label, index) => ({
        id: `issue_${index + 1}`,
        score: tokenOverlap(`${document.name} ${document.text ?? ''}`, label),
      }))
      .filter((item) => item.score >= 0.12)
      .map((item) => item.id),
  }));

  nodes.push({
    id: 'summary_case',
    label: 'Case summary',
    sourceName: 'Case summary',
    documentType: 'case_summary',
    excerpt: params.summary.slice(0, 260),
    confidence: 0.68,
    issueIds: params.issueLabels.map((_label, index) => `issue_${index + 1}`),
  });

  if (params.voiceTranscript?.trim()) {
    nodes.push({
      id: 'voice_transcript',
      label: 'Voice transcript',
      sourceName: 'Voice transcript',
      documentType: 'voice_transcript',
      excerpt: params.voiceTranscript.slice(0, 260),
      confidence: 0.66,
      issueIds: params.issueLabels
        .map((label, index) => ({
          id: `issue_${index + 1}`,
          score: tokenOverlap(params.voiceTranscript ?? '', label),
        }))
        .filter((item) => item.score >= 0.1)
        .map((item) => item.id),
    });
  }

  return nodes;
}

function buildAuthorityNodes(packet: LegalResearchPacket): KautilyaAuthorityNode[] {
  const rows = [
    ...packet.statutoryAuthorities,
    ...packet.leadingPrecedents,
    ...packet.latestPrecedents,
  ] as Array<StatutoryAuthority | PrecedentAuthority>;

  return rows.map((authority) => ({
    ...authority,
    id: authority.id,
    title: authority.title,
    authorityType: authority.authorityType,
    proposition: authority.proposition,
    issueTags: authority.issueTags,
    sourceUrl: authority.sourceUrl,
    score: authority.overallScore,
  }));
}

function buildIssueNodes(params: {
  packet: LegalResearchPacket;
  evidenceGraph: CaseEvidenceGraph;
  inferredPhase: KautilyaPhase;
  evidenceNodes: KautilyaEvidenceNode[];
}): KautilyaIssueNode[] {
  const baseLabels = new Set<string>();
  for (const issue of params.packet.issuesIdentified) baseLabels.add(titleFromTag(issue));
  for (const contradiction of params.evidenceGraph.contradictions) baseLabels.add(contradiction.title);
  for (const missing of params.evidenceGraph.missingDocuments) baseLabels.add(missing.title);
  if (baseLabels.size === 0) baseLabels.add('General Merits Position');

  const authorityByIssue = new Map<string, string[]>();
  for (const authority of [
    ...params.packet.statutoryAuthorities,
    ...params.packet.leadingPrecedents,
    ...params.packet.latestPrecedents,
  ]) {
    for (const tag of authority.issueTags) {
      const key = titleFromTag(tag);
      const rows = authorityByIssue.get(key) ?? [];
      rows.push(authority.id);
      authorityByIssue.set(key, rows);
    }
  }

  return Array.from(baseLabels).map((label, index) => {
    const supportingEvidenceIds = params.evidenceNodes
      .filter((node) => tokenOverlap(`${node.label} ${node.excerpt}`, label) >= 0.1)
      .map((node) => node.id);
    const authorityIds = authorityByIssue.get(label) ?? [];
    const severity =
      label.toLowerCase().includes('contradiction') || label.toLowerCase().includes('missing')
        ? 'high'
        : authorityIds.length > 0
          ? 'medium'
          : 'low';
    return {
      id: `issue_${index + 1}`,
      label,
      phase: params.inferredPhase,
      status:
        label.toLowerCase().includes('missing') || label.toLowerCase().includes('service')
          ? 'gated'
          : label.toLowerCase().includes('contradiction')
            ? 'contested'
            : 'open',
      severity,
      confidence: clamp(0.48 + authorityIds.length * 0.07 + supportingEvidenceIds.length * 0.05, 0.35, 0.94),
      supportingEvidenceIds,
      authorityIds: authorityIds.slice(0, 4),
    };
  });
}

function buildProcedureGates(params: {
  phase: KautilyaPhase;
  missingDocuments: MissingDocumentIssue[];
  evidenceNodes: KautilyaEvidenceNode[];
}): KautilyaProcedureGate[] {
  const gates: KautilyaProcedureGate[] = [];

  if (params.phase === 'interim_relief') {
    gates.push({
      id: 'gate_urgency',
      label: 'Urgency and irreparable harm gate',
      phase: 'interim_relief',
      status: params.evidenceNodes.length >= 2 ? 'clear' : 'watch',
      reason: 'Interim relief needs a coherent urgency record and supporting documents.',
      requiredEvidenceIds: params.evidenceNodes.slice(0, 2).map((node) => node.id),
    });
  }

  const postalProofMissing = params.missingDocuments.find(
    (item) => item.requiredDocumentType === 'postal_proof'
  );
  if (postalProofMissing) {
    gates.push({
      id: 'gate_service',
      label: 'Service proof gate',
      phase: params.phase,
      status: 'blocked',
      reason: postalProofMissing.reason,
      requiredEvidenceIds: params.evidenceNodes
        .filter((node) => node.documentType === 'notice' || node.documentType === 'postal_proof')
        .map((node) => node.id),
    });
  }

  const orderMissing = params.missingDocuments.find((item) => item.requiredDocumentType === 'order');
  if (orderMissing) {
    gates.push({
      id: 'gate_impugned_order',
      label: 'Impugned order availability',
      phase: 'appeal',
      status: 'watch',
      reason: orderMissing.reason,
      requiredEvidenceIds: params.evidenceNodes
        .filter((node) => node.documentType === 'order')
        .map((node) => node.id),
    });
  }

  return gates;
}

function buildStakeholderGraph(params: {
  summary: string;
  forum?: string | null;
  packet: LegalResearchPacket;
  contradictions: CaseEvidenceGraph['contradictions'];
}) {
  const stakeholders: KautilyaStakeholderNode[] = [
    {
      id: 'stakeholder_petitioner',
      label: 'Petitioner / Plaintiff',
      kind: 'party',
      stance: 'ally',
      credibility: 0.72,
      notes: 'Primary claimant seeking immediate relief.',
    },
    {
      id: 'stakeholder_respondent',
      label: 'Respondent / Defendant',
      kind: 'party',
      stance: 'adversary',
      credibility: 0.55,
      notes: 'Counterparty with contestable timeline and possession position.',
    },
    {
      id: 'stakeholder_bench',
      label: params.forum ?? 'Bench',
      kind: 'court',
      stance: 'neutral',
      credibility: 0.95,
      notes: 'Decision-maker whose preference depends on grounding and procedural fairness.',
    },
  ];

  if (params.packet.issuesIdentified.includes('consumer_dispute')) {
    stakeholders.push({
      id: 'stakeholder_regulator',
      label: 'Consumer regulator / authority',
      kind: 'regulator',
      stance: 'constrained',
      credibility: 0.81,
      notes: 'Can strengthen leverage if statutory non-compliance is framed cleanly.',
    });
  }

  if (
    params.contradictions.length > 0
    || /site|access|possession|custodian/i.test(params.summary)
  ) {
    stakeholders.push({
      id: 'stakeholder_site_manager',
      label: 'Site manager / record custodian',
      kind: 'witness',
      stance: 'convertible',
      credibility: 0.62,
      notes: 'Potentially useful for possession and access contradiction line.',
    });
  }

  const edges: KautilyaMandalaEdge[] = [
    {
      id: 'edge_petitioner_bench',
      fromStakeholderId: 'stakeholder_petitioner',
      toStakeholderId: 'stakeholder_bench',
      relation: 'neutral',
      weight: 0.52,
      rationale: 'Bench can be persuaded by coherent chronology and admissible documents.',
    },
    {
      id: 'edge_respondent_bench',
      fromStakeholderId: 'stakeholder_respondent',
      toStakeholderId: 'stakeholder_bench',
      relation: 'neutral',
      weight: 0.48,
      rationale: 'Respondent position depends on procedural and factual consistency.',
    },
    ...(params.contradictions.length > 0 || /site|access|possession|custodian/i.test(params.summary)
      ? [
          {
            id: 'edge_site_manager_respondent',
            fromStakeholderId: 'stakeholder_site_manager',
            toStakeholderId: 'stakeholder_respondent',
            relation: 'convertible' as const,
            weight: 0.66,
            rationale: 'Possession inconsistency makes this witness a convertibility target.',
          },
        ]
      : []),
  ];

  return {
    stakeholders,
    edges,
  };
}

function buildUncertaintyMap(params: {
  packet: LegalResearchPacket;
  missingDocuments: MissingDocumentIssue[];
  issueGraph: KautilyaIssueNode[];
}): KautilyaUncertaintyNode[] {
  const items: KautilyaUncertaintyNode[] = params.packet.unresolvedIssues.map((item, index) => ({
    id: `uncertain_packet_${index + 1}`,
    proposition: item,
    level: 0.68,
    blocker: 'Authority coverage is incomplete for this proposition.',
    linkedIssueIds: params.issueGraph
      .filter((issue) => tokenOverlap(issue.label, item) >= 0.1)
      .map((issue) => issue.id),
  }));

  params.missingDocuments.forEach((item, index) => {
    items.push({
      id: `uncertain_doc_${index + 1}`,
      proposition: item.title,
      level: clamp(item.confidence, 0.4, 0.9),
      blocker: item.reason,
      linkedIssueIds: params.issueGraph
        .filter((issue) => tokenOverlap(issue.label, item.title) >= 0.1)
        .map((issue) => issue.id),
    });
  });

  return items;
}

export async function compileKautilyaCaseGraph(
  input: CompileKautilyaCaseGraphInput
): Promise<CompiledKautilyaContext> {
  const documents =
    input.documents && input.documents.length > 0
      ? input.documents
      : (input.parsedDocumentTexts ?? []).map((text, index) => ({
          id: `doc_${index + 1}`,
          name: `Document ${index + 1}`,
          documentType: 'evidence' as const,
          text,
        }));
  const evidenceGraph = await buildCaseEvidenceGraph({
    caseId: input.caseId,
    summary: input.summary,
    ...(input.voiceTranscript ? { voiceTranscript: input.voiceTranscript } : {}),
    evidenceSources: documents.map((document) => ({
      id: document.id,
      name: document.name,
      documentType: document.documentType,
      text: document.text ?? null,
    })),
    ...(input.llmConfig ? { llmConfig: input.llmConfig } : {}),
  });

  const legalResearchPacket = await buildLegalResearchPacket({
    caseId: input.caseId,
    summary: input.summary,
    objective: input.objective,
    forum: input.forum ?? null,
    jurisdiction: input.jurisdiction ?? null,
    reliefSought: input.reliefSought ?? null,
    parsedDocumentTexts: documents.map((document) => document.text ?? '').filter(Boolean),
    voiceTranscript: input.voiceTranscript ?? null,
    extractedFacts: evidenceGraph.facts.map((fact) => fact.value),
    ...(input.llmConfig ? { llmConfig: input.llmConfig } : {}),
  });

  const citations = legalResearchPacketToCitations(legalResearchPacket);
  const phase = inferPhase(`${input.summary} ${input.objective} ${input.reliefSought ?? ''}`);
  const issueLabels = [
    ...legalResearchPacket.issuesIdentified.map((issue) => titleFromTag(issue)),
    ...evidenceGraph.contradictions.map((item) => item.title),
    ...evidenceGraph.missingDocuments.map((item) => item.title),
  ];
  const evidenceNodes = buildEvidenceNodes({
    documents,
    summary: input.summary,
    voiceTranscript: input.voiceTranscript ?? null,
    issueLabels: issueLabels.length > 0 ? issueLabels : ['General merits position'],
  });
  const authorityNodes = buildAuthorityNodes(legalResearchPacket);
  const issueGraph = buildIssueNodes({
    packet: legalResearchPacket,
    evidenceGraph,
    inferredPhase: phase,
    evidenceNodes,
  });
  const proceduralState = buildProcedureGates({
    phase,
    missingDocuments: evidenceGraph.missingDocuments,
    evidenceNodes,
  });
  const mandalaGraph = buildStakeholderGraph({
    summary: input.summary,
    forum: input.forum ?? null,
    packet: legalResearchPacket,
    contradictions: evidenceGraph.contradictions,
  });
  const uncertaintyMap = buildUncertaintyMap({
    packet: legalResearchPacket,
    missingDocuments: evidenceGraph.missingDocuments,
    issueGraph,
  });
  const historyLog: KautilyaHistoryEvent[] = [
    {
      id: 'history_ingest',
      actor: 'system',
      phase,
      summary: 'Compiled issue, evidence, authority, procedural, and stakeholder graphs for KAUTILYA_CERES.',
      linkedMoveIds: [],
    },
  ];

  const caseGraph: KautilyaCaseGraph = {
    issueGraph,
    evidenceGraph: evidenceNodes,
    authorityGraph: authorityNodes,
    proceduralState,
    mandalaGraph,
    historyLog,
    uncertaintyMap,
  };

  const verifiedClaims = verifyLegalClaims({
    claims: issueGraph.map((issue) => ({
      statement: `${issue.label} requires a grounded, phase-aware litigation response.`,
      issueTag: normalize(issue.label).replace(/\s+/g, '_'),
    })),
    packet: legalResearchPacket,
  });

  const groundedLegalClaims = verifiedClaims.filter((claim) => claim.verified);
  const unverifiedClaims = verifiedClaims.filter((claim) => !claim.verified);

  return {
    caseGraph,
    evidenceGraph,
    legalResearchPacket,
    citations,
    groundedLegalClaims,
    unverifiedClaims,
    legalGroundingStatus: legalGroundingStatus(legalResearchPacket, 0.55),
    legalAuthorities: [
      ...legalResearchPacket.statutoryAuthorities,
      ...legalResearchPacket.leadingPrecedents,
      ...legalResearchPacket.latestPrecedents,
    ],
    inferredPhase: phase,
  };
}
