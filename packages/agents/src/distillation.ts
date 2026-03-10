import type {
  KautilyaCeresOutput,
  KautilyaDistillationTrace,
  KautilyaRole,
  StrategyComputeMode,
  StrategyMode,
} from '@nyaya/shared';

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildKautilyaDistillationTrace(params: {
  caseId: string;
  objective: string;
  requestedMode: StrategyMode;
  output: KautilyaCeresOutput;
}): KautilyaDistillationTrace {
  const petitionerTop = params.output.petitionerStrategies[params.requestedMode][0];
  const respondentTop = params.output.respondentStrategies[params.requestedMode][0];
  const judgeAgreement = 1 - average(
    [
      petitionerTop?.judgeAggregate.disagreementIndex ?? 0.4,
      respondentTop?.judgeAggregate.disagreementIndex ?? 0.4,
    ]
  );
  const appealSurvival = average(
    [petitionerTop?.appealSurvival ?? 0.4, respondentTop?.appealSurvival ?? 0.4]
  );
  const groundingStrength =
    1
    - average(
        [
          ...(petitionerTop?.structuredMoves ?? []),
          ...(respondentTop?.structuredMoves ?? []),
        ].map((move) =>
          move.verifier_status === 'approved'
            ? 0
            : move.verifier_status === 'abstained'
              ? 0.4
              : 1
        )
      );
  const unsupportedClaimRate = Number((1 - groundingStrength).toFixed(2));
  const reversalRisk = Number((1 - appealSurvival).toFixed(2));
  const qualityScore = Number(
    (
      judgeAgreement * 0.25
      + appealSurvival * 0.25
      + groundingStrength * 0.35
      + (params.output.contradictionTargets.length > 0 ? 0.15 : 0.05)
    ).toFixed(2)
  );
  const approvalState =
    qualityScore >= 0.78 ? 'approved' : qualityScore >= 0.62 ? 'candidate' : 'rejected';
  const prompt = [
    `<ROLE=STRATEGIST><MODE=${params.requestedMode}>`,
    `CASE_ID=${params.caseId}`,
    `OBJECTIVE=${params.objective}`,
    `ISSUES=${params.output.caseGraph.issueGraph.map((issue) => issue.label).join(' | ')}`,
    'Produce evidence-linked, authority-linked, phase-aware strategies for both sides.',
  ].join('\n');
  const completion = JSON.stringify(
    {
      petitioner: petitionerTop,
      respondent: respondentTop,
      likelyJudgeOrder: params.output.likelyJudgeOrder,
    },
    null,
    2
  );

  return {
    role: 'strategist',
    qualityScore,
    approvalState,
    judgeAgreement: Number(judgeAgreement.toFixed(2)),
    groundingScore: Number(groundingStrength.toFixed(2)),
    unsupportedClaimRate,
    reversalRisk,
    prompt,
    completion,
    traceSummary: `${params.requestedMode} run with ${params.output.contradictionTargets.length} fracture targets and appeal score ${appealSurvival.toFixed(2)}.`,
  };
}

export interface DistillationDatasetRecord extends KautilyaDistillationTrace {
  caseId: string;
  runId: string;
  strategyMode: StrategyMode;
  computeMode: StrategyComputeMode;
  metadata?: Record<string, unknown>;
}

export interface DistillationSelectionOptions {
  minQualityScore?: number;
  minGroundingScore?: number;
  maxUnsupportedClaimRate?: number;
  maxReversalRisk?: number;
  minJudgeAgreement?: number;
  includeCandidates?: boolean;
}

export interface RoleTokenizedSftExample {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  metadata: {
    runId: string;
    caseId: string;
    role: KautilyaRole;
    strategyMode: StrategyMode;
    computeMode: StrategyComputeMode;
    qualityScore: number;
  };
}

export interface AgentRewardSample {
  agent: KautilyaRole;
  reward: number;
  baseline?: number;
}

export interface NormalizedAgentRewardSample extends AgentRewardSample {
  centeredReward: number;
  normalizedReward: number;
}

export function selectDistillationDataset(
  records: DistillationDatasetRecord[],
  options: DistillationSelectionOptions = {}
) {
  const {
    minQualityScore = 0.62,
    minGroundingScore = 0.68,
    maxUnsupportedClaimRate = 0.18,
    maxReversalRisk = 0.38,
    minJudgeAgreement = 0.62,
    includeCandidates = true,
  } = options;

  return records
    .filter((record) => record.approvalState !== 'rejected')
    .filter((record) => includeCandidates || record.approvalState === 'approved')
    .filter((record) => record.qualityScore >= minQualityScore)
    .filter((record) => record.groundingScore >= minGroundingScore)
    .filter((record) => record.unsupportedClaimRate <= maxUnsupportedClaimRate)
    .filter((record) => record.reversalRisk <= maxReversalRisk)
    .filter((record) => record.judgeAgreement >= minJudgeAgreement)
    .sort((lhs, rhs) => rhs.qualityScore - lhs.qualityScore);
}

export function toRoleTokenizedSftExample(
  record: DistillationDatasetRecord
): RoleTokenizedSftExample {
  const roleToken = `<ROLE=${record.role.toUpperCase()}><MODE=${record.strategyMode}><COMPUTE=${record.computeMode}>`;

  return {
    messages: [
      {
        role: 'system',
        content:
          'You are part of KAUTILYA_CERES. Produce only evidence-grounded, authority-grounded, phase-aware litigation strategy.',
      },
      {
        role: 'user',
        content: `${roleToken}\n${record.prompt}`,
      },
      {
        role: 'assistant',
        content: record.completion,
      },
    ],
    metadata: {
      runId: record.runId,
      caseId: record.caseId,
      role: record.role,
      strategyMode: record.strategyMode,
      computeMode: record.computeMode,
      qualityScore: record.qualityScore,
    },
  };
}

export function exportDistillationJsonl(
  records: DistillationDatasetRecord[],
  options?: DistillationSelectionOptions
) {
  return selectDistillationDataset(records, options)
    .map((record) => JSON.stringify(toRoleTokenizedSftExample(record)))
    .join('\n');
}

export function agentWiseNormalizeRewards(
  samples: AgentRewardSample[]
): NormalizedAgentRewardSample[] {
  const grouped = new Map<KautilyaRole, number[]>();

  for (const sample of samples) {
    const centeredReward = sample.reward - (sample.baseline ?? 0);
    const existing = grouped.get(sample.agent) ?? [];
    existing.push(centeredReward);
    grouped.set(sample.agent, existing);
  }

  return samples.map((sample) => {
    const centeredReward = sample.reward - (sample.baseline ?? 0);
    const values = grouped.get(sample.agent) ?? [centeredReward];
    const mean = average(values);
    const variance = average(values.map((value) => (value - mean) ** 2));
    const stdDev = Math.sqrt(Math.max(variance, 1e-6));

    return {
      ...sample,
      centeredReward: Number(centeredReward.toFixed(4)),
      normalizedReward: Number(((centeredReward - mean) / stdDev).toFixed(4)),
    };
  });
}
