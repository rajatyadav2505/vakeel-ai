import { describe, expect, it } from 'vitest';
import type { KautilyaJudgeScore } from '@nyaya/shared';
import { aggregateJudgeScores } from './kautilya-ceres-judge';

describe('aggregateJudgeScores', () => {
  it('aggregates scores with order swapping into trimmed mean and disagreement metrics', () => {
    const scores: KautilyaJudgeScore[] = [
      {
        judgeRole: 'judge_merits',
        orderVariant: 'original',
        legalCorrectness: 0.8,
        citationGrounding: 0.74,
        proceduralCompliance: 0.7,
        consistency: 0.76,
        fairness: 0.72,
        appealSurvival: 0.75,
        overall: 0.76,
        notes: 'original',
      },
      {
        judgeRole: 'judge_merits',
        orderVariant: 'swapped',
        legalCorrectness: 0.78,
        citationGrounding: 0.73,
        proceduralCompliance: 0.69,
        consistency: 0.74,
        fairness: 0.71,
        appealSurvival: 0.74,
        overall: 0.74,
        notes: 'swapped',
      },
      {
        judgeRole: 'judge_procedure',
        orderVariant: 'original',
        legalCorrectness: 0.71,
        citationGrounding: 0.7,
        proceduralCompliance: 0.83,
        consistency: 0.72,
        fairness: 0.7,
        appealSurvival: 0.73,
        overall: 0.75,
        notes: 'original',
      },
      {
        judgeRole: 'judge_procedure',
        orderVariant: 'swapped',
        legalCorrectness: 0.7,
        citationGrounding: 0.68,
        proceduralCompliance: 0.81,
        consistency: 0.71,
        fairness: 0.69,
        appealSurvival: 0.72,
        overall: 0.73,
        notes: 'swapped',
      },
    ];

    const aggregate = aggregateJudgeScores(scores);
    expect(aggregate.aggregateOverall).toBeGreaterThan(0.7);
    expect(aggregate.orderSwapDelta).toBeGreaterThanOrEqual(0);
    expect(aggregate.disagreementIndex).toBeLessThan(0.05);
  });
});
