import { describe, expect, it } from 'vitest';
import { KAUTILYA_CERES_FIXTURE_CASE } from './kautilya-ceres.fixture';
import { runKautilyaCeresWarGame } from './kautilya-ceres';

describe('runKautilyaCeresWarGame', () => {
  it('produces structured strategies for both sides with judge scores and traceability', async () => {
    const output = await runKautilyaCeresWarGame({
      caseId: KAUTILYA_CERES_FIXTURE_CASE.caseId,
      summary: KAUTILYA_CERES_FIXTURE_CASE.summary,
      objective: KAUTILYA_CERES_FIXTURE_CASE.objective,
      forum: KAUTILYA_CERES_FIXTURE_CASE.forum,
      jurisdiction: KAUTILYA_CERES_FIXTURE_CASE.jurisdiction,
      voiceTranscript: KAUTILYA_CERES_FIXTURE_CASE.voiceTranscript,
      documents: KAUTILYA_CERES_FIXTURE_CASE.documents,
      strategyMode: 'robust_mode',
      computeMode: 'standard',
    });

    expect(output.engineName).toBe('KAUTILYA_CERES');
    expect(output.kautilyaCeres).toBeDefined();
    expect(output.kautilyaCeres!.petitionerStrategies.robust_mode.length).toBeGreaterThan(0);
    expect(output.kautilyaCeres!.respondentStrategies.robust_mode.length).toBeGreaterThan(0);
    expect(output.kautilyaCeres!.contradictionTargets.length).toBeGreaterThan(0);
    expect(output.kautilyaCeres!.missingEvidenceChecklist.length).toBeGreaterThan(0);

    const topPetitioner = output.kautilyaCeres!.petitionerStrategies.robust_mode[0]!;
    expect(topPetitioner.structuredMoves.every((move) => move.evidence_ids.length > 0)).toBe(true);
    expect(topPetitioner.structuredMoves.every((move) => move.authority_ids.length > 0)).toBe(true);
    expect(topPetitioner.judgeAggregate.scores.length).toBeGreaterThanOrEqual(10);
  });
});
