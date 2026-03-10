import type {
  KautilyaCaseGraph,
  KautilyaJudgeAggregate,
  KautilyaJudgeScore,
  KautilyaStructuredMove,
} from '@nyaya/shared';

export type OpponentProfile =
  | 'aggressive_procedural'
  | 'credibility_attack'
  | 'document_suppression'
  | 'settlement_pragmatist';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((lhs, rhs) => lhs - rhs);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
  }
  return sorted[middle] ?? 0;
}

function trimmedMean(values: number[]) {
  if (!values.length) return 0;
  if (values.length <= 2) return average(values);
  const sorted = values.slice().sort((lhs, rhs) => lhs - rhs);
  const trimmed = sorted.slice(1, -1);
  return average(trimmed);
}

export function aggregateJudgeScores(scores: KautilyaJudgeScore[]): KautilyaJudgeAggregate {
  const overallScores = scores.map((score) => score.overall);
  const appealScores = scores.map((score) => score.appealSurvival);
  const original = scores
    .filter((score) => score.orderVariant === 'original')
    .map((score) => score.overall);
  const swapped = scores
    .filter((score) => score.orderVariant === 'swapped')
    .map((score) => score.overall);
  const aggregateOverall = Number(trimmedMean(overallScores).toFixed(2));
  const disagreementIndex = Number(
    Math.sqrt(
      average(
        overallScores.map((score) => {
          const delta = score - aggregateOverall;
          return delta * delta;
        })
      )
    ).toFixed(2)
  );

  return {
    scores,
    aggregateOverall,
    disagreementIndex,
    appealSurvival: Number(median(appealScores).toFixed(2)),
    orderSwapDelta: Number(Math.abs(average(original) - average(swapped)).toFixed(2)),
  };
}

export function scoreJudgePanel(params: {
  moves: KautilyaStructuredMove[];
  caseGraph: KautilyaCaseGraph;
  opponentProfile: OpponentProfile;
}): KautilyaJudgeAggregate {
  const approvedMoves = params.moves.filter((move) => move.verifier_status === 'approved').length;
  const abstainedMoves = params.moves.filter((move) => move.verifier_status === 'abstained').length;
  const unsupportedRate = 1 - approvedMoves / Math.max(1, params.moves.length);
  const avgMerits = average(params.moves.map((move) => move.expected_utility.merits_delta));
  const avgLeverage = average(params.moves.map((move) => move.expected_utility.leverage_delta));
  const avgCredibility = average(params.moves.map((move) => move.expected_utility.credibility_delta));
  const avgSettlement = average(params.moves.map((move) => move.expected_utility.settlement_value));
  const avgSanctionRisk = average(params.moves.map((move) => move.expected_utility.sanction_risk));
  const avgReversalRisk = average(params.moves.map((move) => move.expected_utility.reversal_risk));
  const citationCoverage = average(
    params.moves.map((move) => Math.min(1, move.authority_ids.length / 3))
  );
  const tacticDiversity =
    new Set(params.moves.map((move) => move.tactic)).size / Math.max(1, params.moves.length);
  const blockedGatePenalty = params.caseGraph.proceduralState.some((gate) => gate.status === 'blocked')
    ? 0.08
    : 0;
  const profileBonus =
    params.opponentProfile === 'aggressive_procedural'
      ? average(params.moves.map((move) => (move.tactic === 'DANDA' ? 0.08 : 0)))
      : params.opponentProfile === 'settlement_pragmatist'
        ? average(params.moves.map((move) => (move.tactic === 'DANA' ? 0.08 : 0)))
        : params.opponentProfile === 'document_suppression'
          ? average(
              params.moves.map((move) =>
                move.tactic === 'BHEDA' || move.move_type === 'evidence_request' ? 0.08 : 0
              )
            )
          : average(params.moves.map((move) => (move.tactic === 'SAMA' ? 0.06 : 0)));

  const orderVariants: Array<'original' | 'swapped'> = ['original', 'swapped'];
  const judgeRoles: Array<KautilyaJudgeScore['judgeRole']> = [
    'judge_merits',
    'judge_procedure',
    'judge_citations',
    'appellate_reviewer',
    'neutrality_auditor',
  ];

  const scores: KautilyaJudgeScore[] = [];
  for (const orderVariant of orderVariants) {
    const swapPenalty = orderVariant === 'swapped' ? 0.02 * (1 - tacticDiversity) : 0;
    for (const judgeRole of judgeRoles) {
      const legalCorrectness = clamp(
        0.5 + avgMerits * 0.45 + avgCredibility * 0.15 + profileBonus - unsupportedRate * 0.28,
        0,
        1
      );
      const citationGrounding = clamp(0.42 + citationCoverage * 0.5 - unsupportedRate * 0.32, 0, 1);
      const proceduralCompliance = clamp(
        0.58 + avgLeverage * 0.15 - avgSanctionRisk * 0.45 - blockedGatePenalty - swapPenalty,
        0,
        1
      );
      const consistency = clamp(
        0.52 + tacticDiversity * 0.22 + (1 - abstainedMoves / Math.max(1, params.moves.length)) * 0.12,
        0,
        1
      );
      const fairness = clamp(
        0.56
          + average(params.moves.map((move) => (move.tactic === 'SAMA' ? 0.05 : 0)))
          - average(params.moves.map((move) => (move.tactic === 'DANDA' ? 0.04 : 0)))
          - unsupportedRate * 0.18
          - swapPenalty,
        0,
        1
      );
      const appealSurvival = clamp(
        0.54
          + citationGrounding * 0.18
          + proceduralCompliance * 0.1
          - avgReversalRisk * 0.5
          - unsupportedRate * 0.2,
        0,
        1
      );

      const weightShift =
        judgeRole === 'judge_merits'
          ? { merits: 0.34, citations: 0.14, procedure: 0.16, consistency: 0.16, fairness: 0.2 }
          : judgeRole === 'judge_procedure'
            ? { merits: 0.16, citations: 0.12, procedure: 0.38, consistency: 0.16, fairness: 0.18 }
            : judgeRole === 'judge_citations'
              ? { merits: 0.16, citations: 0.42, procedure: 0.14, consistency: 0.14, fairness: 0.14 }
              : judgeRole === 'appellate_reviewer'
                ? { merits: 0.18, citations: 0.18, procedure: 0.18, consistency: 0.14, fairness: 0.12 }
                : { merits: 0.14, citations: 0.14, procedure: 0.14, consistency: 0.18, fairness: 0.4 };
      const overall = clamp(
        legalCorrectness * weightShift.merits
          + citationGrounding * weightShift.citations
          + proceduralCompliance * weightShift.procedure
          + consistency * weightShift.consistency
          + fairness * weightShift.fairness
          + appealSurvival * (judgeRole === 'appellate_reviewer' ? 0.14 : 0.06)
          + avgSettlement * (judgeRole === 'neutrality_auditor' ? 0.04 : 0.02),
        0,
        1
      );

      scores.push({
        judgeRole,
        orderVariant,
        legalCorrectness: Number(legalCorrectness.toFixed(2)),
        citationGrounding: Number(citationGrounding.toFixed(2)),
        proceduralCompliance: Number(proceduralCompliance.toFixed(2)),
        consistency: Number(consistency.toFixed(2)),
        fairness: Number(fairness.toFixed(2)),
        appealSurvival: Number(appealSurvival.toFixed(2)),
        overall: Number(overall.toFixed(2)),
        notes:
          judgeRole === 'appellate_reviewer'
            ? 'Scores durability and remand risk, not just first-instance shine.'
            : judgeRole === 'judge_citations'
              ? 'Penalizes unsupported or weakly linked authorities.'
              : judgeRole === 'judge_procedure'
                ? 'Checks gate compliance, sanction exposure, and phase discipline.'
                : judgeRole === 'neutrality_auditor'
                  ? 'Measures style-neutral fairness after party-order swapping.'
                  : 'Measures core merits strength and contradiction leverage.',
      });
    }
  }

  return aggregateJudgeScores(scores);
}
