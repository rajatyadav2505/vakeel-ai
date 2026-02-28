import { describe, expect, it } from 'vitest';
import { monteCarloBranchScore, solveNashHeuristic } from './game-theory';

describe('solveNashHeuristic', () => {
  it('returns a valid recommendation', () => {
    const result = solveNashHeuristic(
      {
        cooperateCooperate: 6,
        cooperateDefect: 1,
        defectCooperate: 8,
        defectDefect: 3,
      },
      0.6
    );

    expect(['cooperate', 'defect']).toContain(result.recommendedMove);
    expect(result.confidence).toBeGreaterThan(0);
  });
});

describe('monteCarloBranchScore', () => {
  it('is deterministic when seed is provided', () => {
    const branches = [1.2, 5.1, 4.6, 2.9];
    const first = monteCarloBranchScore(branches, 900, 42);
    const second = monteCarloBranchScore(branches, 900, 42);
    const third = monteCarloBranchScore(branches, 900, 43);

    expect(first).toBe(second);
    expect(third).not.toBe(first);
  });
});
