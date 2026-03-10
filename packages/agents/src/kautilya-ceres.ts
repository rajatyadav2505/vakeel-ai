import type {
  Citation,
  KautilyaAppealRisk,
  KautilyaAuthorityNode,
  KautilyaCaseGraph,
  KautilyaCeresOutput,
  KautilyaContradictionTarget,
  KautilyaEvidenceNode,
  KautilyaIracBlock,
  KautilyaIssueNode,
  KautilyaLikelyOrder,
  KautilyaSettlementOption,
  KautilyaStrategyCard,
  KautilyaStructuredMove,
  KautilyaTactic,
  SimulationStep,
  StrategyComputeMode,
  StrategyMode,
  StrategyOutput,
} from '@nyaya/shared';
import { buildEvidenceBackedClaims, toProbabilityBand } from './evidence-os';
import { invokeJsonModel, type RuntimeLlmConfig } from './llm';
import { calculateGameTheory, simulateBranchSeeded } from './tools';
import { compileKautilyaCaseGraph, type KautilyaDocumentInput } from './kautilya-ceres-graph';
import { computeBhedaFractureTargets } from './kautilya-ceres-fracture';
import { scoreJudgePanel, type OpponentProfile } from './kautilya-ceres-judge';
import { computeCounterfactualEvidenceRegret } from './kautilya-ceres-regret';
import { verifyStructuredMoves } from './kautilya-ceres-verifiers';
import { buildKautilyaDistillationTrace } from './distillation';

export interface KautilyaCeresInput {
  caseId: string;
  summary: string;
  objective: string;
  forum?: string | null;
  jurisdiction?: string | null;
  reliefSought?: string | null;
  voiceTranscript?: string | null;
  parsedDocumentTexts?: string[];
  documents?: KautilyaDocumentInput[];
  depth?: number;
  strategyMode?: StrategyMode;
  computeMode?: StrategyComputeMode;
  outputLanguage?: 'en-IN' | 'hi-IN';
  llmConfig?: RuntimeLlmConfig;
}

const TACTIC_ORDER: KautilyaTactic[] = ['SAMA', 'DANA', 'BHEDA', 'DANDA'];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleCase(value: string) {
  return value
    .split(/[_\s]+/g)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function deterministicSeedFromText(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function computeProfileSet(text: string): {
  inferred: OpponentProfile;
  plausible: OpponentProfile[];
} {
  const lower = text.toLowerCase();
  const inferred =
    lower.includes('settlement') || lower.includes('concession')
      ? 'settlement_pragmatist'
      : lower.includes('documents') || lower.includes('notice') || lower.includes('disclosure')
        ? 'document_suppression'
        : lower.includes('credibility') || lower.includes('witness') || lower.includes('impeach')
          ? 'credibility_attack'
          : 'aggressive_procedural';
  return {
    inferred,
    plausible: [
      inferred,
      'aggressive_procedural',
      'document_suppression',
      'credibility_attack',
      'settlement_pragmatist',
    ].filter(
      (value, index, items): value is OpponentProfile => items.indexOf(value) === index
    ),
  };
}

function computeSettings(computeMode: StrategyComputeMode) {
  if (computeMode === 'fast') {
    return { horizon: 2, beamWidth: 4, candidateBudget: 8, rolloutSamples: 60 };
  }
  if (computeMode === 'full') {
    return { horizon: 4, beamWidth: 10, candidateBudget: 14, rolloutSamples: 220 };
  }
  return { horizon: 3, beamWidth: 7, candidateBudget: 10, rolloutSamples: 120 };
}

function tacticSummary(tactic: KautilyaTactic) {
  if (tactic === 'SAMA') return 'credibility and coherence';
  if (tactic === 'DANA') return 'calibrated concession and settlement leverage';
  if (tactic === 'BHEDA') return 'contradiction exposure and narrative fracture';
  return 'lawful procedural pressure and urgency';
}

function selectEvidenceIds(params: {
  issue: KautilyaIssueNode;
  documents: KautilyaEvidenceNode[];
  tactic: KautilyaTactic;
}) {
  const linked = params.issue.supportingEvidenceIds.slice(0, 2);
  if (linked.length > 0) return linked;
  const fallback = params.documents
    .filter((node) => (params.tactic === 'BHEDA' ? /reply|affidavit|note|summary/i.test(node.label) : true))
    .slice(0, 2)
    .map((node) => node.id);
  return fallback;
}

function selectAuthorityIds(params: {
  issue: KautilyaIssueNode;
  authorities: KautilyaAuthorityNode[];
}) {
  if (params.issue.authorityIds.length > 0) return params.issue.authorityIds.slice(0, 2);
  const matched = params.authorities
    .filter((authority) => authority.issueTags.some((tag) => normalize(params.issue.label).includes(tag)))
    .slice(0, 2)
    .map((authority) => authority.id);
  if (matched.length > 0) return matched;
  return params.authorities.slice(0, 2).map((authority) => authority.id);
}

function baseMoveTypeForTactic(tactic: KautilyaTactic) {
  if (tactic === 'SAMA') return 'claim' as const;
  if (tactic === 'DANA') return 'settlement_offer' as const;
  if (tactic === 'BHEDA') return 'rebuttal' as const;
  return 'procedural_push' as const;
}

function buildMoveClaim(params: {
  role: 'petitioner_or_plaintiff' | 'respondent_or_defendant';
  tactic: KautilyaTactic;
  issueLabel: string;
  profile: OpponentProfile;
}) {
  const side = params.role === 'petitioner_or_plaintiff' ? 'petitioner' : 'respondent';
  if (params.tactic === 'BHEDA') {
    return `${titleCase(side)} should isolate the opponent's inconsistency on ${params.issueLabel.toLowerCase()} and convert it into a credibility fracture.`;
  }
  if (params.tactic === 'DANA') {
    return `${titleCase(side)} should open a measured concession ladder on ${params.issueLabel.toLowerCase()} without surrendering timeline control.`;
  }
  if (params.tactic === 'DANDA') {
    return `${titleCase(side)} should seek a phase-specific procedural order on ${params.issueLabel.toLowerCase()} to punish delay and preserve leverage.`;
  }
  return `${titleCase(side)} should frame ${params.issueLabel.toLowerCase()} through credibility, coherence, and bench-friendly structure against a ${params.profile.replace(/_/g, ' ')} opponent.`;
}

function estimateUtility(params: {
  tactic: KautilyaTactic;
  severity: 'low' | 'medium' | 'high';
  evidenceCount: number;
  authorityCount: number;
  profile: OpponentProfile;
  status: 'open' | 'contested' | 'gated' | 'resolved';
}): KautilyaStructuredMove['expected_utility'] {
  const severityBoost = params.severity === 'high' ? 0.18 : params.severity === 'medium' ? 0.11 : 0.06;
  const evidenceBoost = Math.min(0.2, params.evidenceCount * 0.06);
  const authorityBoost = Math.min(0.18, params.authorityCount * 0.07);
  const tacticBoost =
    params.tactic === 'BHEDA'
      ? params.status === 'contested'
        ? 0.16
        : 0.08
      : params.tactic === 'DANDA'
        ? params.profile === 'aggressive_procedural'
          ? 0.15
          : 0.09
        : params.tactic === 'DANA'
          ? params.profile === 'settlement_pragmatist'
            ? 0.17
            : 0.08
          : 0.1;
  const meritsDelta = clamp(0.08 + severityBoost + evidenceBoost * 0.6 + authorityBoost * 0.5, 0.06, 0.38);
  const leverageDelta = clamp(0.06 + tacticBoost + evidenceBoost * 0.25, 0.04, 0.36);
  const credibilityDelta = clamp(0.06 + authorityBoost * 0.35 + (params.tactic === 'SAMA' ? 0.12 : 0.05), 0.05, 0.32);
  const settlementValue = clamp(
    params.tactic === 'DANA' ? 0.16 + leverageDelta * 0.55 : 0.05 + leverageDelta * 0.18,
    0.02,
    0.28
  );
  const sanctionRisk = clamp(
    params.tactic === 'DANDA' ? 0.08 + (params.status === 'gated' ? 0.05 : 0) : 0.02 + (params.status === 'gated' ? 0.04 : 0),
    0.01,
    0.18
  );
  const reversalRisk = clamp(
    0.05 + (params.authorityCount === 0 ? 0.08 : 0) + (params.status === 'gated' ? 0.06 : 0),
    0.03,
    0.2
  );
  const unsupportedClaimRisk = clamp(
    0.02 + (params.evidenceCount === 0 ? 0.09 : 0) + (params.authorityCount === 0 ? 0.08 : 0),
    0.02,
    0.2
  );
  const overall = clamp(
    meritsDelta * 0.28
      + leverageDelta * 0.22
      + credibilityDelta * 0.18
      + settlementValue * 0.1
      - sanctionRisk * 0.08
      - reversalRisk * 0.08
      - unsupportedClaimRisk * 0.06,
    0.08,
    0.42
  );

  return {
    merits_delta: Number(meritsDelta.toFixed(2)),
    leverage_delta: Number(leverageDelta.toFixed(2)),
    credibility_delta: Number(credibilityDelta.toFixed(2)),
    settlement_value: Number(settlementValue.toFixed(2)),
    sanction_risk: Number(sanctionRisk.toFixed(2)),
    reversal_risk: Number(reversalRisk.toFixed(2)),
    unsupported_claim_risk: Number(unsupportedClaimRisk.toFixed(2)),
    overall: Number(overall.toFixed(2)),
  };
}

function createMove(params: {
  role: 'petitioner_or_plaintiff' | 'respondent_or_defendant';
  tactic: KautilyaTactic;
  issue: KautilyaIssueNode;
  evidenceIds: string[];
  authorityIds: string[];
  profile: OpponentProfile;
}): KautilyaStructuredMove {
  return {
    id: crypto.randomUUID(),
    role: params.role,
    phase: params.issue.phase,
    tactic: params.tactic,
    move_type: baseMoveTypeForTactic(params.tactic),
    target_issue_id: params.issue.id,
    claim: buildMoveClaim({
      role: params.role,
      tactic: params.tactic,
      issueLabel: params.issue.label,
      profile: params.profile,
    }),
    evidence_ids: params.evidenceIds,
    authority_ids: params.authorityIds,
    expected_utility: estimateUtility({
      tactic: params.tactic,
      severity: params.issue.severity,
      evidenceCount: params.evidenceIds.length,
      authorityCount: params.authorityIds.length,
      profile: params.profile,
      status: params.issue.status,
    }),
    confidence: Number(
      clamp(0.54 + params.evidenceIds.length * 0.06 + params.authorityIds.length * 0.05, 0.42, 0.88).toFixed(2)
    ),
    verifier_status: 'abstained',
    verifier_results: [],
    support_spans: [],
  };
}

async function generateLlmMoveCandidates(params: {
  role: 'petitioner_or_plaintiff' | 'respondent_or_defendant';
  objective: string;
  mode: StrategyMode;
  profile: OpponentProfile;
  outputLanguage: 'en-IN' | 'hi-IN';
  compiled: Awaited<ReturnType<typeof compileKautilyaCaseGraph>>;
  llmConfig?: RuntimeLlmConfig;
}): Promise<KautilyaStructuredMove[]> {
  const llm = await invokeJsonModel<{
    moves?: Array<{
      tactic?: KautilyaTactic;
      move_type?: KautilyaStructuredMove['move_type'];
      target_issue_id?: string;
      claim?: string;
      evidence_ids?: string[];
      authority_ids?: string[];
      confidence?: number;
    }>;
  }>({
    systemPrompt: [
      'You are a litigation move generator for KAUTILYA_CERES.',
      'Return strict JSON only.',
      'Never invent evidence IDs or authority IDs.',
      'Each move must be lawful, phase-aware, and grounded.',
      params.outputLanguage === 'hi-IN'
        ? 'Claims may be in Hindi but must preserve IDs exactly.'
        : 'Claims must use professional English for Indian litigation.',
    ].join(' '),
    userPrompt: [
      `Role: ${params.role}`,
      `Requested mode: ${params.mode}`,
      `Opponent profile: ${params.profile}`,
      `Objective: ${params.objective}`,
      `Issues: ${JSON.stringify(params.compiled.caseGraph.issueGraph.map((issue) => ({ id: issue.id, label: issue.label, evidenceIds: issue.supportingEvidenceIds, authorityIds: issue.authorityIds })))}`,
      `Evidence IDs: ${JSON.stringify(params.compiled.caseGraph.evidenceGraph.map((node) => ({ id: node.id, excerpt: node.excerpt })))}`,
      `Authority IDs: ${JSON.stringify(params.compiled.caseGraph.authorityGraph.map((node) => ({ id: node.id, title: node.title })))}`,
      'Output format: {"moves":[{"tactic":"BHEDA","move_type":"rebuttal","target_issue_id":"issue_1","claim":"...","evidence_ids":["ev_1"],"authority_ids":["auth_1"],"confidence":0.72}]}',
    ].join('\n\n'),
    temperature: 0.25,
    maxTokens: 1200,
    ...(params.llmConfig ? { llmConfig: params.llmConfig } : {}),
  });

  return (llm?.moves ?? [])
    .map((move) => {
      const issue = params.compiled.caseGraph.issueGraph.find((item) => item.id === move.target_issue_id);
      if (!issue || !move.tactic || !move.move_type || !move.claim) return null;
      return {
        id: crypto.randomUUID(),
        role: params.role,
        phase: issue.phase,
        tactic: move.tactic,
        move_type: move.move_type,
        target_issue_id: issue.id,
        claim: move.claim.slice(0, 260),
        evidence_ids: (move.evidence_ids ?? []).filter((id) =>
          params.compiled.caseGraph.evidenceGraph.some((node) => node.id === id)
        ),
        authority_ids: (move.authority_ids ?? []).filter((id) =>
          params.compiled.caseGraph.authorityGraph.some((node) => node.id === id)
        ),
        expected_utility: estimateUtility({
          tactic: move.tactic,
          severity: issue.severity,
          evidenceCount: (move.evidence_ids ?? []).length,
          authorityCount: (move.authority_ids ?? []).length,
          profile: params.profile,
          status: issue.status,
        }),
        confidence: Number(clamp(move.confidence ?? 0.62, 0.28, 0.92).toFixed(2)),
        verifier_status: 'abstained',
        verifier_results: [],
        support_spans: [],
      } as KautilyaStructuredMove;
    })
    .filter((move): move is KautilyaStructuredMove => Boolean(move));
}

function dedupeMoves(moves: KautilyaStructuredMove[]) {
  const seen = new Set<string>();
  const output: KautilyaStructuredMove[] = [];
  for (const move of moves) {
    const key = `${move.role}:${move.tactic}:${move.target_issue_id}:${normalize(move.claim).slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(move);
  }
  return output;
}

async function generateCandidateMoves(params: {
  role: 'petitioner_or_plaintiff' | 'respondent_or_defendant';
  objective: string;
  mode: StrategyMode;
  profile: OpponentProfile;
  computeMode: StrategyComputeMode;
  compiled: Awaited<ReturnType<typeof compileKautilyaCaseGraph>>;
  contradictionTargets: KautilyaContradictionTarget[];
  outputLanguage: 'en-IN' | 'hi-IN';
  llmConfig?: RuntimeLlmConfig;
}) {
  const settings = computeSettings(params.computeMode);
  const prioritizedIssues = params.compiled.caseGraph.issueGraph
    .slice()
    .sort((lhs, rhs) => {
      const lhsPenalty = lhs.status === 'gated' ? 1 : lhs.status === 'contested' ? 0.4 : 0;
      const rhsPenalty = rhs.status === 'gated' ? 1 : rhs.status === 'contested' ? 0.4 : 0;
      const lhsScore = lhs.authorityIds.length * 0.3 + lhs.confidence - lhsPenalty;
      const rhsScore = rhs.authorityIds.length * 0.3 + rhs.confidence - rhsPenalty;
      return rhsScore - lhsScore;
    });
  const heuristicMoves = prioritizedIssues
    .slice(0, Math.max(2, Math.ceil(settings.candidateBudget / TACTIC_ORDER.length)))
    .flatMap((issue) =>
      TACTIC_ORDER.map((tactic) =>
        createMove({
          role: params.role,
          tactic,
          issue,
          evidenceIds: selectEvidenceIds({
            issue,
            documents: params.compiled.caseGraph.evidenceGraph,
            tactic,
          }),
          authorityIds: selectAuthorityIds({
            issue,
            authorities: params.compiled.caseGraph.authorityGraph,
          }),
          profile: params.profile,
        })
      )
    );
  const llmMoves = await generateLlmMoveCandidates({
    role: params.role,
    objective: params.objective,
    mode: params.mode,
    profile: params.profile,
    outputLanguage: params.outputLanguage,
    compiled: params.compiled,
    ...(params.llmConfig ? { llmConfig: params.llmConfig } : {}),
  });
  const verified = verifyStructuredMoves({
    moves: dedupeMoves([...llmMoves, ...heuristicMoves]).slice(0, settings.candidateBudget * 2),
    caseGraph: params.compiled.caseGraph,
    contradictionTargets: params.contradictionTargets,
  }).sort((lhs, rhs) => rhs.confidence - lhs.confidence);
  const approved = verified.filter((move) => move.verifier_status === 'approved');
  const abstained = verified.filter((move) => move.verifier_status === 'abstained');
  return approved.length >= 4 ? approved : [...approved, ...abstained].slice(0, settings.candidateBudget);
}

function evaluateSequence(params: {
  moves: KautilyaStructuredMove[];
  caseGraph: KautilyaCaseGraph;
  contradictionTargets: KautilyaContradictionTarget[];
  profile: OpponentProfile;
  mode: StrategyMode;
  rolloutSamples: number;
}) {
  const judgeAggregate = scoreJudgePanel({
    moves: params.moves,
    caseGraph: params.caseGraph,
    opponentProfile: params.profile,
  });
  const branchSeed = deterministicSeedFromText(
    params.moves.map((move) => `${move.id}:${move.claim}`).join('|')
  );
  const rollout = simulateBranchSeeded(
    params.moves.map((move) => Math.round(move.expected_utility.overall * 100)),
    params.rolloutSamples,
    branchSeed
  );
  const contradictionBonus = average(
    params.moves.map((move) =>
      move.tactic === 'BHEDA'
      && params.contradictionTargets.some((target) => target.issueId === move.target_issue_id)
        ? 0.08
        : 0
    )
  );
  const modeBias =
    params.mode === 'robust_mode'
      ? Math.min(...params.moves.map((move) => move.expected_utility.overall))
      : average(params.moves.map((move) => move.expected_utility.overall));
  return {
    judgeAggregate,
    rolloutScore: rollout / 100,
    totalScore: Number(
      clamp(
        judgeAggregate.aggregateOverall * 0.55
          + average(params.moves.map((move) => move.expected_utility.overall)) * 0.25
          + contradictionBonus
          + modeBias * 0.12
          - average(params.moves.map((move) => move.expected_utility.reversal_risk)) * 0.12
          - judgeAggregate.disagreementIndex * 0.08,
        0.08,
        0.99
      ).toFixed(2)
    ),
  };
}

function buildIracBlocks(params: {
  moves: KautilyaStructuredMove[];
  caseGraph: KautilyaCaseGraph;
}) {
  const authorityMap = new Map(params.caseGraph.authorityGraph.map((authority) => [authority.id, authority]));
  return params.moves.slice(0, 3).map((move) => {
    const authorityTitle =
      move.authority_ids
        .map((id) => authorityMap.get(id)?.title)
        .filter((value): value is string => Boolean(value))
        .join('; ') || 'No verified authority identified';
    return {
      id: crypto.randomUUID(),
      issue:
        params.caseGraph.issueGraph.find((issue) => issue.id === move.target_issue_id)?.label
        ?? move.target_issue_id,
      rule: authorityTitle,
      application: move.claim,
      conclusion:
        move.tactic === 'DANA'
          ? 'Use the calibrated concession only if it improves leverage while preserving filing position.'
          : 'Advance the line only with the cited evidence and authority support attached.',
      evidenceIds: move.evidence_ids,
      authorityIds: move.authority_ids,
    } satisfies KautilyaIracBlock;
  });
}

function createStrategyCard(params: {
  id: string;
  role: 'petitioner_or_plaintiff' | 'respondent_or_defendant';
  mode: StrategyMode;
  moves: KautilyaStructuredMove[];
  score: ReturnType<typeof evaluateSequence>;
  caseGraph: KautilyaCaseGraph;
  contradictionTargets: KautilyaContradictionTarget[];
}) {
  const firstMove = params.moves[0];
  const citedEvidenceIds = Array.from(new Set(params.moves.flatMap((move) => move.evidence_ids)));
  const citedAuthorityIds = Array.from(new Set(params.moves.flatMap((move) => move.authority_ids)));
  const contradictionTargetIds = params.contradictionTargets
    .filter((target) => params.moves.some((move) => move.target_issue_id === target.issueId))
    .map((target) => target.id);
  const title = `${titleCase(params.role.replace(/_/g, ' '))}: ${tacticSummary(firstMove?.tactic ?? 'SAMA')}`;
  return {
    id: params.id,
    role: params.role,
    mode: params.mode,
    title,
    summary: params.moves.map((move) => move.claim).join(' ').slice(0, 420),
    structuredMoves: params.moves,
    judgeAggregate: params.score.judgeAggregate,
    contradictionTargetIds,
    citedEvidenceIds,
    citedAuthorityIds,
    expectedValue: params.score.totalScore,
    appealSurvival: params.score.judgeAggregate.appealSurvival,
    settlementSignal: Number(
      average(params.moves.map((move) => move.expected_utility.settlement_value)).toFixed(2)
    ),
    iracBlocks: buildIracBlocks({
      moves: params.moves,
      caseGraph: params.caseGraph,
    }),
  } satisfies KautilyaStrategyCard;
}

function buildStrategyCards(params: {
  role: 'petitioner_or_plaintiff' | 'respondent_or_defendant';
  mode: StrategyMode;
  candidateMoves: KautilyaStructuredMove[];
  caseGraph: KautilyaCaseGraph;
  contradictionTargets: KautilyaContradictionTarget[];
  plausibleProfiles: OpponentProfile[];
  inferredProfile: OpponentProfile;
  computeMode: StrategyComputeMode;
}) {
  const settings = computeSettings(params.computeMode);
  let beams: KautilyaStructuredMove[][] = [[]];

  for (let depth = 0; depth < settings.horizon; depth += 1) {
    const next: KautilyaStructuredMove[][] = [];
    for (const beam of beams) {
      for (const move of params.candidateMoves) {
        if (beam.some((existing) => existing.id === move.id)) continue;
        if (beam.some((existing) => existing.target_issue_id === move.target_issue_id)) continue;
        const candidate = [...beam, move];
        next.push(candidate);
      }
    }

    if (next.length === 0) {
      break;
    }

    beams = next
      .sort(
        (lhs, rhs) =>
          average(rhs.map((move) => move.expected_utility.overall + move.confidence * 0.1))
          - average(lhs.map((move) => move.expected_utility.overall + move.confidence * 0.1))
      )
      .slice(0, settings.beamWidth);
  }

  const scored = beams
    .filter((beam) => beam.length > 0)
    .map((beam) => {
      const profileScores = new Map<OpponentProfile, ReturnType<typeof evaluateSequence>>();
      for (const profile of params.plausibleProfiles) {
        profileScores.set(
          profile,
          evaluateSequence({
            moves: beam,
            caseGraph: params.caseGraph,
            contradictionTargets: params.contradictionTargets,
            profile,
            mode: params.mode,
            rolloutSamples: settings.rolloutSamples,
          })
        );
      }

      const scoreValues = Array.from(profileScores.values());
      const fallbackScore =
        scoreValues[0]
        ?? evaluateSequence({
          moves: beam,
          caseGraph: params.caseGraph,
          contradictionTargets: params.contradictionTargets,
          profile: params.inferredProfile,
          mode: params.mode,
          rolloutSamples: settings.rolloutSamples,
        });

      const chosenScore =
        params.mode === 'robust_mode'
          ? scoreValues.reduce((best, score) =>
              score.totalScore < best.totalScore ? score : best
            , fallbackScore)
          : profileScores.get(params.inferredProfile)
            ?? fallbackScore;

      return createStrategyCard({
        id: crypto.randomUUID(),
        role: params.role,
        mode: params.mode,
        moves: beam,
        score: chosenScore,
        caseGraph: params.caseGraph,
        contradictionTargets: params.contradictionTargets,
      });
    })
    .sort((lhs, rhs) => rhs.expectedValue - lhs.expectedValue);

  return scored.slice(0, 3);
}

function buildSettlementLadder(strategies: KautilyaStrategyCard[]): KautilyaSettlementOption[] {
  const danaStrategies = strategies
    .flatMap((strategy) => strategy.structuredMoves)
    .filter((move) => move.tactic === 'DANA')
    .slice(0, 3);
  if (danaStrategies.length === 0) {
    return [
      {
        id: 'settlement_watch',
        title: 'Without-prejudice document exchange',
        concession: 'Exchange core records before hearing without conceding merits.',
        trigger: 'Use when missing evidence is the real blocker.',
        leverageNote: 'Improves credibility while preserving interim leverage.',
        settlementValue: 0.12,
      },
    ];
  }
  return danaStrategies.map((move, index) => ({
    id: `settlement_${index + 1}`,
    title: `Settlement rung ${index + 1}`,
    concession: move.claim,
    trigger: `Trigger when ${move.move_type.replace(/_/g, ' ')} improves expected value.`,
    leverageNote: 'Use only with authority-linked fallback strategy ready.',
    settlementValue: move.expected_utility.settlement_value,
  }));
}

function buildAppealRiskMap(strategies: KautilyaStrategyCard[]): KautilyaAppealRisk[] {
  return strategies.slice(0, 6).map((strategy, index) => ({
    id: `appeal_risk_${index + 1}`,
    strategyId: strategy.id,
    severity:
      strategy.appealSurvival >= 0.72
        ? 'low'
        : strategy.appealSurvival >= 0.56
          ? 'medium'
          : 'high',
    risk:
      strategy.appealSurvival >= 0.72
        ? 'Appeal posture is relatively durable.'
        : 'Reasoning risks remand or dilution unless procedural support is tightened.',
    mitigation: 'Strengthen directly binding authority and attach the cleanest evidence spans.',
    authorityIds: strategy.citedAuthorityIds.slice(0, 3),
  }));
}

function buildLikelyJudgeOrder(params: {
  petitioner: KautilyaStrategyCard | undefined;
  respondent: KautilyaStrategyCard | undefined;
}): KautilyaLikelyOrder {
  const petitionerScore = params.petitioner?.judgeAggregate.aggregateOverall ?? 0.5;
  const respondentScore = params.respondent?.judgeAggregate.aggregateOverall ?? 0.5;
  if (petitionerScore - respondentScore > 0.08) {
    return {
      prevailingSide: 'petitioner_or_plaintiff',
      summary: 'Bench likely grants protective interim relief with tightly framed compliance directions.',
      proceduralNote: 'Order likely turns on chronology coherence and preservation concerns.',
      reasoning: [
        'Petitioner line is better grounded on evidence and authority support.',
        'Respondent narrative shows more fracture points than sustainable rebuttal strength.',
      ],
    };
  }
  if (respondentScore - petitionerScore > 0.08) {
    return {
      prevailingSide: 'respondent_or_defendant',
      summary: 'Bench likely narrows relief and pushes petitioner toward a better-grounded procedural posture.',
      proceduralNote: 'Bench may insist on curing procedural gates before broad relief.',
      reasoning: [
        'Respondent line survives judge panel scrutiny better on procedure and appeal posture.',
        'Petitioner strategy still needs stronger gate compliance or documentary support.',
      ],
    };
  }
  return {
    prevailingSide: 'split',
    summary: 'Bench likely issues a mixed order preserving status quo while reserving contested merits.',
    proceduralNote: 'Expect a structured disclosure or affidavit direction before final leverage shifts.',
    reasoning: [
      'Both sides retain plausible paths under the judge panel.',
      'Contradiction and missing-document issues make a split interim arrangement likely.',
    ],
  };
}

function mapToSimulationProposal(card: KautilyaStrategyCard, citations: Citation[]) {
  return {
    id: card.id,
    agentId: `${card.role}:${card.structuredMoves[0]?.tactic ?? 'SAMA'}`,
    move: card.title,
    rationale: card.summary,
    expectedPayoff: Number((card.expectedValue * 10).toFixed(2)),
    riskScore: Number(((1 - card.appealSurvival) * 10).toFixed(2)),
    citations: citations.filter((citation) => card.citedAuthorityIds.includes(citation.id)).slice(0, 3),
  };
}

function mapToSimulationStep(move: KautilyaStructuredMove, step: number): SimulationStep {
  return {
    step,
    opponentLikelyMove:
      move.tactic === 'BHEDA'
        ? 'Opponent likely repairs the fractured narrative with a procedural objection.'
        : move.tactic === 'DANDA'
          ? 'Opponent likely resists timeline acceleration and sanction pressure.'
          : 'Opponent likely reframes the issue to soften credibility loss.',
    recommendedCounterMove: move.claim,
    chanakyaTag:
      move.tactic === 'SAMA'
        ? 'saam'
        : move.tactic === 'DANA'
          ? 'daam'
          : move.tactic === 'DANDA'
            ? 'dand'
            : 'bhed',
    confidence: move.confidence,
  };
}

export async function runKautilyaCeresWarGame(
  input: KautilyaCeresInput
): Promise<StrategyOutput> {
  const requestedMode = input.strategyMode ?? 'robust_mode';
  const computeMode = input.computeMode ?? 'standard';
  const outputLanguage = input.outputLanguage ?? 'en-IN';
  const compiled = await compileKautilyaCaseGraph({
    caseId: input.caseId,
    summary: input.summary,
    objective: input.objective,
    forum: input.forum ?? null,
    jurisdiction: input.jurisdiction ?? null,
    reliefSought: input.reliefSought ?? null,
    voiceTranscript: input.voiceTranscript ?? null,
    parsedDocumentTexts: input.parsedDocumentTexts ?? [],
    documents: input.documents ?? [],
    ...(input.llmConfig ? { llmConfig: input.llmConfig } : {}),
  });

  const contradictionTargets = computeBhedaFractureTargets({
    caseGraph: compiled.caseGraph,
    evidenceGraph: compiled.evidenceGraph,
    legalResearchPacket: compiled.legalResearchPacket,
  });
  const profiles = computeProfileSet(`${input.summary} ${input.objective}`);

  const petitionerCandidates = await generateCandidateMoves({
    role: 'petitioner_or_plaintiff',
    objective: input.objective,
    mode: requestedMode,
    profile: profiles.inferred,
    computeMode,
    compiled,
    contradictionTargets,
    outputLanguage,
    ...(input.llmConfig ? { llmConfig: input.llmConfig } : {}),
  });
  const respondentCandidates = await generateCandidateMoves({
    role: 'respondent_or_defendant',
    objective: input.objective,
    mode: requestedMode,
    profile: profiles.inferred,
    computeMode,
    compiled,
    contradictionTargets,
    outputLanguage,
    ...(input.llmConfig ? { llmConfig: input.llmConfig } : {}),
  });

  const petitionerStrategies = {
    robust_mode: buildStrategyCards({
      role: 'petitioner_or_plaintiff',
      mode: 'robust_mode',
      candidateMoves: petitionerCandidates,
      caseGraph: compiled.caseGraph,
      contradictionTargets,
      plausibleProfiles: profiles.plausible,
      inferredProfile: profiles.inferred,
      computeMode,
    }),
    exploit_mode: buildStrategyCards({
      role: 'petitioner_or_plaintiff',
      mode: 'exploit_mode',
      candidateMoves: petitionerCandidates,
      caseGraph: compiled.caseGraph,
      contradictionTargets,
      plausibleProfiles: profiles.plausible,
      inferredProfile: profiles.inferred,
      computeMode,
    }),
  } satisfies Record<StrategyMode, KautilyaStrategyCard[]>;

  const respondentStrategies = {
    robust_mode: buildStrategyCards({
      role: 'respondent_or_defendant',
      mode: 'robust_mode',
      candidateMoves: respondentCandidates,
      caseGraph: compiled.caseGraph,
      contradictionTargets,
      plausibleProfiles: profiles.plausible,
      inferredProfile: profiles.inferred,
      computeMode,
    }),
    exploit_mode: buildStrategyCards({
      role: 'respondent_or_defendant',
      mode: 'exploit_mode',
      candidateMoves: respondentCandidates,
      caseGraph: compiled.caseGraph,
      contradictionTargets,
      plausibleProfiles: profiles.plausible,
      inferredProfile: profiles.inferred,
      computeMode,
    }),
  } satisfies Record<StrategyMode, KautilyaStrategyCard[]>;

  const selectedPetitioner = petitionerStrategies[requestedMode][0];
  const selectedRespondent = respondentStrategies[requestedMode][0];
  const allStrategies = [
    ...petitionerStrategies.robust_mode,
    ...petitionerStrategies.exploit_mode,
    ...respondentStrategies.robust_mode,
    ...respondentStrategies.exploit_mode,
  ];
  const scoreByMoveId = Object.fromEntries(
    allStrategies.flatMap((strategy) =>
      strategy.structuredMoves.map((move) => [move.id, strategy.expectedValue])
    )
  );
  const policySnapshots = [
    ...(selectedPetitioner
      ? computeCounterfactualEvidenceRegret({
          role: 'petitioner_or_plaintiff',
          moves: petitionerCandidates,
          selectedMoveId: selectedPetitioner.structuredMoves[0]?.id ?? petitionerCandidates[0]?.id ?? '',
          scoreByMoveId,
        })
      : []),
    ...(selectedRespondent
      ? computeCounterfactualEvidenceRegret({
          role: 'respondent_or_defendant',
          moves: respondentCandidates,
          selectedMoveId: selectedRespondent.structuredMoves[0]?.id ?? respondentCandidates[0]?.id ?? '',
          scoreByMoveId,
        })
      : []),
  ];

  const kautilyaCeres: KautilyaCeresOutput = {
    engine: 'KAUTILYA_CERES',
    requestedMode,
    computeMode,
    escalationTriggered:
      selectedPetitioner?.judgeAggregate.disagreementIndex !== undefined
      && selectedPetitioner.judgeAggregate.disagreementIndex >= 0.14,
    caseGraph: compiled.caseGraph,
    petitionerStrategies,
    respondentStrategies,
    likelyJudgeOrder: buildLikelyJudgeOrder({
      petitioner: selectedPetitioner,
      respondent: selectedRespondent,
    }),
    contradictionTargets,
    missingEvidenceChecklist: compiled.evidenceGraph.missingDocuments,
    settlementLadder: buildSettlementLadder(
      [...petitionerStrategies[requestedMode], ...respondentStrategies[requestedMode]]
    ),
    appealRiskMap: buildAppealRiskMap(
      [...petitionerStrategies[requestedMode], ...respondentStrategies[requestedMode]]
    ),
    policySnapshots,
    distillationTrace: {
      role: 'strategist',
      qualityScore: 0,
      approvalState: 'candidate',
      judgeAgreement: 0,
      groundingScore: 0,
      unsupportedClaimRate: 1,
      reversalRisk: 1,
      prompt: '',
      completion: '',
      traceSummary: '',
    },
  };
  kautilyaCeres.distillationTrace = buildKautilyaDistillationTrace({
    caseId: input.caseId,
    objective: input.objective,
    requestedMode,
    output: kautilyaCeres,
  });

  const citations = compiled.citations;
  const selectedClaims = [
    ...(selectedPetitioner?.structuredMoves ?? []),
    ...(selectedRespondent?.structuredMoves ?? []),
  ].map((move) => move.claim);
  const evidenceClaims = buildEvidenceBackedClaims({
    statements: selectedClaims,
    facts: compiled.evidenceGraph.facts,
    citations,
  });
  const petitionerValue = selectedPetitioner?.expectedValue ?? 0.5;
  const respondentValue = selectedRespondent?.expectedValue ?? 0.5;
  const winProbability = Number(
    clamp(petitionerValue / Math.max(0.2, petitionerValue + respondentValue), 0.22, 0.84).toFixed(2)
  );
  const gameTheory = calculateGameTheory({
    cooperateCooperate: 6 + Math.round(average(kautilyaCeres.settlementLadder.map((item) => item.settlementValue)) * 10),
    cooperateDefect: 2 + Math.round((selectedRespondent?.expectedValue ?? 0.4) * 4),
    defectCooperate: 8 + Math.round((selectedPetitioner?.expectedValue ?? 0.4) * 4),
    defectDefect: 4 + Math.round((selectedRespondent?.appealSurvival ?? 0.5) * 2),
    opponentDefectProbability: Number((1 - (selectedRespondent?.appealSurvival ?? 0.5) * 0.5).toFixed(2)),
  });

  return {
    id: crypto.randomUUID(),
    caseId: input.caseId,
    engineName: 'KAUTILYA_CERES',
    strategyMode: requestedMode,
    computeMode,
    headline:
      requestedMode === 'robust_mode'
        ? 'KAUTILYA_CERES robust strategy board'
        : 'KAUTILYA_CERES exploit strategy board',
    confidence: Number(
      average([
        selectedPetitioner?.judgeAggregate.aggregateOverall ?? 0.54,
        1 - (selectedPetitioner?.judgeAggregate.disagreementIndex ?? 0.2),
        kautilyaCeres.distillationTrace.qualityScore,
      ]).toFixed(2)
    ),
    winProbability,
    winProbabilityBand: toProbabilityBand(winProbability),
    payOffMatrix: [
      [6, gameTheory.expectedUtility],
      [selectedPetitioner ? selectedPetitioner.expectedValue * 10 : 5, 4],
    ].map((row) => row.map((value) => Number(value.toFixed(2)))),
    rankedPlan: (selectedPetitioner?.structuredMoves ?? [])
      .slice(0, input.depth ?? 4)
      .map((move, index) => mapToSimulationStep(move, index + 1)),
    proposals: [
      ...petitionerStrategies[requestedMode].map((card) => mapToSimulationProposal(card, citations)),
      ...respondentStrategies[requestedMode].map((card) => mapToSimulationProposal(card, citations)),
    ].slice(0, 6),
    citations,
    claims: evidenceClaims,
    legalResearchPacket: compiled.legalResearchPacket,
    legalAuthorities: compiled.legalAuthorities,
    groundedLegalClaims: compiled.groundedLegalClaims,
    unverifiedClaims: compiled.unverifiedClaims,
    conflictingAuthorities: compiled.legalResearchPacket.conflictsDetected,
    precedentsCheckedAt: compiled.legalResearchPacket.precedentsCheckedAt,
    legalGroundingStatus: compiled.legalGroundingStatus,
    kautilyaCeres,
    disclaimerAccepted: true,
    createdAt: new Date().toISOString(),
  };
}
