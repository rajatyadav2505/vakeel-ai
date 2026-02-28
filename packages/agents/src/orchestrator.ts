import type { Citation, StrategyOutput, SimulationProposal, SimulationStep } from '@nyaya/shared';
import {
  applyChanakyaPrinciples,
  calculateGameTheory,
  simulateBranchSeeded,
} from './tools';
import { AGENT_POOL } from './personas';
import { traceRun } from './tracing';
import { invokeJsonModel, type RuntimeLlmConfig } from './llm';
import { buildCaseEvidenceGraph, buildEvidenceBackedClaims, toProbabilityBand } from './evidence-os';
import {
  buildLegalResearchPacket,
  legalGroundingStatus,
  legalResearchPacketToCitations,
  summarizePacketForPrompt,
  verifyLegalClaims,
} from './legal-research';

export interface OrchestratorInput {
  caseId: string;
  summary: string;
  objective: string;
  parsedDocumentTexts?: string[];
  voiceTranscript?: string | null;
  forum?: string | null;
  jurisdiction?: string | null;
  reliefSought?: string | null;
  depth?: number;
  outputLanguage?: 'en-IN' | 'hi-IN';
  llmConfig?: RuntimeLlmConfig;
}

interface GeneratedProposal {
  agentId: string;
  move: string;
  rationale: string;
  riskScore: number;
  payoffBias: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function deterministicSeedFromText(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function chooseAgents(summary: string, objective: string) {
  const text = `${summary} ${objective}`.toLowerCase();
  const requested = text.includes('urgent') || text.includes('interim') ? 14 : 10;
  return AGENT_POOL.slice(0, requested);
}

function buildProposal(params: {
  agentId: string;
  move: string;
  rationale: string;
  expectedPayoff: number;
  riskScore: number;
  citations: Citation[];
}): SimulationProposal {
  return {
    id: crypto.randomUUID(),
    agentId: params.agentId,
    move: params.move,
    rationale: params.rationale,
    expectedPayoff: Number(params.expectedPayoff.toFixed(2)),
    riskScore: Number(params.riskScore.toFixed(2)),
    citations: params.citations.slice(0, 3),
  };
}

function rankSteps(
  proposals: SimulationProposal[],
  depth: number,
  summary: string
): SimulationStep[] {
  const best = proposals
    .slice()
    .sort((a, b) => b.expectedPayoff - a.expectedPayoff)
    .slice(0, depth);

  return best.map((proposal, index) => {
    const chanakya = applyChanakyaPrinciples(`${summary} ${proposal.move}`);
    const chanakyaName = chanakya.name.toLowerCase().split(' ')[0];
    const chanakyaTag =
      chanakyaName === 'saam' ||
      chanakyaName === 'daam' ||
      chanakyaName === 'dand' ||
      chanakyaName === 'bhed'
        ? chanakyaName
        : 'bhed';
    const opponentLikelyMove =
      proposal.riskScore >= 6
        ? `Aggressive maintainability challenge against "${proposal.move}".`
        : `Procedural delay and selective disclosure against "${proposal.move}".`;

    return {
      step: index + 1,
      opponentLikelyMove,
      recommendedCounterMove: proposal.move,
      chanakyaTag: chanakyaTag as 'saam' | 'daam' | 'dand' | 'bhed',
      confidence: Number((1 - proposal.riskScore / 10).toFixed(2)),
    };
  });
}

function estimateDefectProbabilityHeuristic(params: {
  summary: string;
  objective: string;
  citationCount: number;
}) {
  const text = `${params.summary} ${params.objective}`.toLowerCase();
  const adversarialTerms = [
    'criminal',
    'fraud',
    'urgent',
    'injunction',
    'stay',
    'contempt',
    'raid',
    'adversarial',
  ];
  const settlementTerms = ['settle', 'mediation', 'compensation', 'conciliation', 'amicable'];

  const adversarialHits = adversarialTerms.reduce(
    (count, term) => count + (text.includes(term) ? 1 : 0),
    0
  );
  const settlementHits = settlementTerms.reduce(
    (count, term) => count + (text.includes(term) ? 1 : 0),
    0
  );

  const citationSignal = params.citationCount >= 3 ? -0.03 : 0.04;
  const score = 0.46 + adversarialHits * 0.045 - settlementHits * 0.035 + citationSignal;
  return Number(clamp(score, 0.25, 0.88).toFixed(2));
}

async function inferOpponentDefectProbability(params: {
  summary: string;
  objective: string;
  citationCount: number;
  llmConfig?: RuntimeLlmConfig;
}) {
  const heuristic = estimateDefectProbabilityHeuristic(params);
  const llm = await invokeJsonModel<{ opponentDefectProbability?: number }>({
    systemPrompt:
      'You are a litigation game-theory analyst. Return strict JSON with key opponentDefectProbability in [0,1].',
    userPrompt: [
      'Estimate how likely the opponent is to defect (procedural obstruction, delay, bad-faith tactical move).',
      `Case summary: ${params.summary}`,
      `Objective: ${params.objective}`,
      `Citation count: ${params.citationCount}`,
      'Response format: {"opponentDefectProbability": number}',
    ].join('\n'),
    temperature: 0.2,
    maxTokens: 180,
    ...(params.llmConfig ? { llmConfig: params.llmConfig } : {}),
  });

  const llmProbability = llm?.opponentDefectProbability;
  if (typeof llmProbability !== 'number' || Number.isNaN(llmProbability)) {
    return heuristic;
  }

  const blended = heuristic * 0.7 + clamp(llmProbability, 0.05, 0.95) * 0.3;
  return Number(clamp(blended, 0.25, 0.9).toFixed(2));
}

function createPayoffMatrix(opponentDefectProbability: number) {
  const matrix = {
    cooperateCooperate: 6,
    cooperateDefect: 2,
    defectCooperate: 8,
    defectDefect: 4,
    opponentDefectProbability,
  };
  const result = calculateGameTheory(matrix);
  return {
    matrix: [
      [matrix.cooperateCooperate, matrix.cooperateDefect],
      [matrix.defectCooperate, matrix.defectDefect],
    ],
    result,
    opponentDefectProbability,
  };
}

function fallbackProposalForAgent(params: {
  agentId: string;
  role: string;
  cluster: string;
  objective: string;
  summary: string;
}): GeneratedProposal {
  const text = `${params.summary} ${params.objective}`.toLowerCase();

  if (params.cluster === 'research') {
    return {
      agentId: params.agentId,
      move: 'Build citation-backed precedent bundle',
      rationale:
        'Prioritize directly binding rulings and contradictory-obiter filters so the bench gets a compact authority map quickly.',
      riskScore: 3.6,
      payoffBias: 0.8,
    };
  }

  if (params.cluster === 'forensics') {
    return {
      agentId: params.agentId,
      move: 'Lock evidentiary chain and metadata timeline',
      rationale:
        'Freeze record integrity early to block later fabrication arguments and force opponent disclosures onto a verifiable timeline.',
      riskScore: 4.1,
      payoffBias: 0.6,
    };
  }

  if (params.cluster === 'negotiation') {
    return {
      agentId: params.agentId,
      move: 'Prepare dual-track settlement and hearing pressure',
      rationale:
        'Run settlement architecture in parallel with aggressive listing strategy to improve leverage without conceding courtroom momentum.',
      riskScore: 4.8,
      payoffBias: 0.45,
    };
  }

  if (params.cluster === 'judicial') {
    return {
      agentId: params.agentId,
      move: 'Sequence reliefs to match likely bench preference',
      rationale:
        'Stage interim and final prayers to align with the expected bench pattern and reduce rejection risk from over-broad relief asks.',
      riskScore: 4.2,
      payoffBias: 0.5,
    };
  }

  if (params.cluster === 'strategy') {
    const move = text.includes('urgent')
      ? 'Use Dand pressure with strict procedural milestones'
      : 'Use Bhed pattern to expose contradictions early';
    return {
      agentId: params.agentId,
      move,
      rationale:
        'Apply Chanakya overlay to force opponent signaling errors while preserving optionality for tactical shifts across hearings.',
      riskScore: 5.3,
      payoffBias: 0.35,
    };
  }

  return {
    agentId: params.agentId,
    move: `${params.role}: enforce timeline order and evidentiary lock-in`,
    rationale:
      'Constrain adjournment pathways and convert every hearing into a measurable procedural advantage.',
    riskScore: 4.4,
    payoffBias: 0.55,
  };
}

async function generateAgentProposals(params: {
  summary: string;
  objective: string;
  legalResearchSummary: string;
  agents: Array<{
    id: string;
    role: string;
    cluster: string;
    tools: string[];
  }>;
  citationTitles: string[];
  outputLanguage: 'en-IN' | 'hi-IN';
  llmConfig?: RuntimeLlmConfig;
}): Promise<Map<string, GeneratedProposal>> {
  const fallbackMap = new Map(
    params.agents.map((agent) => [
      agent.id,
      fallbackProposalForAgent({
        agentId: agent.id,
        role: agent.role,
        cluster: agent.cluster,
        objective: params.objective,
        summary: params.summary,
      }),
    ])
  );

  const llm = await invokeJsonModel<{ proposals?: GeneratedProposal[] }>({
    systemPrompt: [
      'You are a legal war-room orchestrator.',
      'Return STRICT JSON with key "proposals" (array).',
      'Each item must include: agentId, move, rationale, riskScore (1-10), payoffBias (-2 to 2).',
      'Differentiate reasoning by each agent role and cluster. No duplicated rationale.',
      params.outputLanguage === 'hi-IN'
        ? 'Write move and rationale in professional Hindi (Devanagari).'
        : 'Write move and rationale in professional English used in Indian litigation practice.',
    ].join(' '),
    userPrompt: [
      `Case summary: ${params.summary}`,
      `Objective: ${params.objective}`,
      `Authority hints: ${params.citationTitles.join(' | ') || 'none'}`,
      `Legal research packet:\n${params.legalResearchSummary}`,
      'Agents:',
      JSON.stringify(params.agents),
      'Output format:',
      '{"proposals":[{"agentId":"p1","move":"...","rationale":"...","riskScore":4.2,"payoffBias":0.6}]}',
    ].join('\n'),
    temperature: 0.45,
    maxTokens: 1600,
    ...(params.llmConfig ? { llmConfig: params.llmConfig } : {}),
  });

  if (!llm?.proposals?.length) {
    return fallbackMap;
  }

  for (const item of llm.proposals) {
    if (!item || typeof item !== 'object') continue;
    if (typeof item.agentId !== 'string' || !fallbackMap.has(item.agentId)) continue;
    if (typeof item.move !== 'string' || typeof item.rationale !== 'string') continue;
    if (typeof item.riskScore !== 'number' || typeof item.payoffBias !== 'number') continue;

    fallbackMap.set(item.agentId, {
      agentId: item.agentId,
      move: item.move.trim().slice(0, 180),
      rationale: item.rationale.trim().slice(0, 500),
      riskScore: clamp(item.riskScore, 1, 9.7),
      payoffBias: clamp(item.payoffBias, -2, 2),
    });
  }

  return fallbackMap;
}

export async function runOrchestratedWarGame(input: OrchestratorInput): Promise<StrategyOutput> {
  const outputLanguage = input.outputLanguage ?? 'en-IN';
  return traceRun({
    runName: 'multi-agent-war-room',
    input,
    executor: async () => {
      const selectedAgents = chooseAgents(input.summary, input.objective);
      const legalResearchPacket = await buildLegalResearchPacket({
        caseId: input.caseId,
        summary: input.summary,
        objective: input.objective,
        forum: input.forum ?? null,
        jurisdiction: input.jurisdiction ?? null,
        reliefSought: input.reliefSought ?? null,
        parsedDocumentTexts: input.parsedDocumentTexts ?? [],
        voiceTranscript: input.voiceTranscript ?? null,
        ...(input.llmConfig ? { llmConfig: input.llmConfig } : {}),
      });
      const citations = legalResearchPacketToCitations(legalResearchPacket);
      const evidenceGraph = await buildCaseEvidenceGraph({
        caseId: input.caseId,
        summary: input.summary,
        voiceTranscript: input.voiceTranscript ?? null,
        evidenceSources: (input.parsedDocumentTexts ?? []).map((text, index) => ({
          id: `doc-${index + 1}`,
          name: `Uploaded document ${index + 1}`,
          documentType: 'evidence',
          text,
        })),
      });
      const defectProbability = await inferOpponentDefectProbability({
        summary: input.summary,
        objective: input.objective,
        citationCount: citations.length,
        ...(input.llmConfig ? { llmConfig: input.llmConfig } : {}),
      });
      const payoff = createPayoffMatrix(defectProbability);
      const generatedProposals = await generateAgentProposals({
        summary: input.summary,
        objective: input.objective,
        legalResearchSummary: summarizePacketForPrompt(legalResearchPacket),
        citationTitles: citations.map((citation) => citation.title).slice(0, 4),
        outputLanguage,
        agents: selectedAgents.map((agent) => ({
          id: agent.id,
          role: agent.role,
          cluster: agent.cluster,
          tools: agent.tools,
        })),
        ...(input.llmConfig ? { llmConfig: input.llmConfig } : {}),
      });

      const proposals = selectedAgents.map((agent, index) => {
        const generated = generatedProposals.get(agent.id);
        const fallback = fallbackProposalForAgent({
          agentId: agent.id,
          role: agent.role,
          cluster: agent.cluster,
          objective: input.objective,
          summary: input.summary,
        });
        const resolved = generated ?? fallback;

        const riskScore = clamp(resolved.riskScore, 1, 9.5);
        const payoffBias = clamp(resolved.payoffBias, -2, 2);
        const chanakya = applyChanakyaPrinciples(`${input.summary} ${resolved.move}`);

        const branchBaseline = [
          7.8 - riskScore * 0.28 + payoffBias,
          6.4 - riskScore * 0.16 + (chanakya.name.toLowerCase().includes('dand') ? 0.5 : 0.2),
          7.1 - riskScore * 0.2 + (index % 3) * 0.15,
          5.9 - riskScore * 0.12 + payoff.result.expectedUtility / 10,
        ].map((score) => Number(score.toFixed(2)));

        const seed = deterministicSeedFromText(`${input.caseId}:${agent.id}:${input.objective}:${index}`);
        const branchScore = simulateBranchSeeded(branchBaseline, 700 + index * 35, seed);
        return buildProposal({
          agentId: agent.id,
          move: resolved.move,
          rationale: resolved.rationale,
          expectedPayoff: branchScore + payoffBias,
          riskScore,
          citations,
        });
      });

      const rankedPlan = rankSteps(proposals, input.depth ?? 7, input.summary);
      const aggregateConfidence = Number(
        (
          rankedPlan.reduce((sum, step) => sum + step.confidence, 0) / Math.max(1, rankedPlan.length)
        ).toFixed(2)
      );
      const winProbability = Number(
        (0.43 + aggregateConfidence * 0.42 + payoff.result.expectedUtility / 30).toFixed(2)
      );
      const claims = buildEvidenceBackedClaims({
        statements: rankedPlan.map((step) => step.recommendedCounterMove),
        facts: evidenceGraph.facts,
        citations,
      });

      const legalClaimsDraft = await invokeJsonModel<{
        claims?: Array<{ statement?: string; issueTag?: string }>;
      }>({
        systemPrompt: [
          'You are an Indian legal grounding analyst.',
          'Return strict JSON with key "claims" only.',
          'Include only legal propositions that can be tied to the provided authorities.',
          'If uncertain, omit the claim instead of guessing.',
          outputLanguage === 'hi-IN'
            ? 'Write claim statements in professional Hindi (Devanagari).'
            : 'Write claim statements in professional English.',
        ].join(' '),
        userPrompt: [
          `Objective: ${input.objective}`,
          `Case summary: ${input.summary}`,
          `Legal packet:\n${summarizePacketForPrompt(legalResearchPacket)}`,
          'Output format: {"claims":[{"statement":"...","issueTag":"..."}]}',
        ].join('\n\n'),
        temperature: 0.15,
        maxTokens: 700,
        ...(input.llmConfig ? { llmConfig: input.llmConfig } : {}),
      });

      const legalClaimCandidates =
        legalClaimsDraft?.claims
          ?.filter((item) => item && typeof item.statement === 'string' && item.statement.trim().length >= 12)
          .map((item) => ({
            statement: item.statement!.trim().slice(0, 280),
            ...(typeof item.issueTag === 'string' ? { issueTag: item.issueTag } : {}),
          }))
          .slice(0, 8) ??
        [];

      const fallbackLegalCandidates =
        legalClaimCandidates.length > 0
          ? legalClaimCandidates
          : [
              ...legalResearchPacket.statutoryAuthorities.slice(0, 3).map((item) => ({
                statement: `${item.actName}${item.sectionRef ? ` ${item.sectionRef}` : ''}: ${item.proposition}`,
                issueTag: item.issueTags[0] ?? 'general',
              })),
              ...legalResearchPacket.leadingPrecedents.slice(0, 3).map((item) => ({
                statement: `${item.caseName} (${item.court}, ${item.date}) supports ${item.proposition}`,
                issueTag: item.issueTags[0] ?? 'general',
              })),
            ];

      const verifiedClaims = verifyLegalClaims({
        claims: fallbackLegalCandidates,
        packet: legalResearchPacket,
      });
      const unverifiedClaims = verifiedClaims.filter((item) => !item.verified);
      const verifiedOnlyClaims = verifiedClaims.filter((item) => item.verified);
      const groundingStatus = legalGroundingStatus(legalResearchPacket, 0.55);
      const legalAuthorities = [
        ...legalResearchPacket.statutoryAuthorities,
        ...legalResearchPacket.leadingPrecedents,
        ...legalResearchPacket.latestPrecedents,
      ];

      return {
        id: crypto.randomUUID(),
        caseId: input.caseId,
        headline:
          groundingStatus === 'complete'
            ? outputLanguage === 'hi-IN'
              ? 'मल्टी-एजेंट वार-रूम द्वारा साक्ष्य-आधारित रणनीति विश्लेषण'
              : 'Evidence-based strategy analysis generated by multi-agent war-room'
            : outputLanguage === 'hi-IN'
              ? 'साक्ष्य-आधारित रणनीति विश्लेषण (विधिक आधार अपूर्ण - कार्रवाई से पहले सत्यापन आवश्यक)'
              : 'Evidence-based strategy analysis (incomplete legal grounding - verify before action)',
        confidence: aggregateConfidence,
        winProbability,
        winProbabilityBand: toProbabilityBand(winProbability),
        payOffMatrix: payoff.matrix,
        rankedPlan,
        proposals,
        citations,
        claims,
        legalResearchPacket,
        legalAuthorities,
        groundedLegalClaims: verifiedOnlyClaims,
        unverifiedClaims,
        conflictingAuthorities: legalResearchPacket.conflictsDetected,
        precedentsCheckedAt: legalResearchPacket.precedentsCheckedAt,
        legalGroundingStatus: groundingStatus,
        disclaimerAccepted: false,
        createdAt: new Date().toISOString(),
      };
    },
  });
}
