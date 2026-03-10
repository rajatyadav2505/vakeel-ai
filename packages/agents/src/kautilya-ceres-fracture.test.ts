import { describe, expect, it } from 'vitest';
import { compileKautilyaCaseGraph } from './kautilya-ceres-graph';
import { computeBhedaFractureTargets } from './kautilya-ceres-fracture';
import { KAUTILYA_CERES_FIXTURE_CASE } from './kautilya-ceres.fixture';

describe('computeBhedaFractureTargets', () => {
  it('returns top contradiction and gap targets ordered by acceptance drop minus cut cost', async () => {
    const compiled = await compileKautilyaCaseGraph({
      caseId: KAUTILYA_CERES_FIXTURE_CASE.caseId,
      summary: KAUTILYA_CERES_FIXTURE_CASE.summary,
      objective: KAUTILYA_CERES_FIXTURE_CASE.objective,
      forum: KAUTILYA_CERES_FIXTURE_CASE.forum,
      jurisdiction: KAUTILYA_CERES_FIXTURE_CASE.jurisdiction,
      voiceTranscript: KAUTILYA_CERES_FIXTURE_CASE.voiceTranscript,
      documents: KAUTILYA_CERES_FIXTURE_CASE.documents,
    });

    const targets = computeBhedaFractureTargets({
      caseGraph: compiled.caseGraph,
      evidenceGraph: compiled.evidenceGraph,
      legalResearchPacket: compiled.legalResearchPacket,
    });

    expect(targets.length).toBeGreaterThan(0);
    expect(targets[0]!.acceptanceScoreDrop).toBeGreaterThan(0.15);
    expect(targets.some((target) => /gap|service|missing/i.test(target.label))).toBe(true);
  });
});
