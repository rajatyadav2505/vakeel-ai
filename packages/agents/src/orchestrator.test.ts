import { describe, expect, it } from 'vitest';
import { runOrchestratedWarGame } from './orchestrator';

describe('runOrchestratedWarGame', () => {
  it('creates a ranked strategy output', async () => {
    const caseId = crypto.randomUUID();
    const result = await runOrchestratedWarGame({
      caseId,
      summary: 'Urgent injunction matter with procedural delay by opponent.',
      objective: 'Secure interim relief and maintain procedural control.',
      depth: 6,
    });

    expect(result.rankedPlan.length).toBeGreaterThan(0);
    expect(result.proposals.length).toBeGreaterThan(0);
    expect(result.headline.length).toBeGreaterThan(10);
    expect(result.legalResearchPacket).toBeDefined();
    expect(result.precedentsCheckedAt).toBeDefined();
    expect(result.legalGroundingStatus === 'complete' || result.legalGroundingStatus === 'incomplete').toBe(
      true
    );
    expect(result.legalAuthorities).toBeDefined();
    expect(result.unverifiedClaims).toBeDefined();
  });

  it('returns stable branch scoring for same input', async () => {
    const caseId = crypto.randomUUID();
    const input = {
      caseId,
      summary: 'Urgent injunction matter with procedural delay by opponent.',
      objective: 'Secure interim relief and maintain procedural control.',
      depth: 6,
    };

    const first = await runOrchestratedWarGame(input);
    const second = await runOrchestratedWarGame(input);
    const firstScores = first.proposals.map((proposal) => proposal.expectedPayoff);
    const secondScores = second.proposals.map((proposal) => proposal.expectedPayoff);

    expect(firstScores).toEqual(secondScores);
  });
});
