import { describe, expect, it } from 'vitest';
import { compileKautilyaCaseGraph } from './kautilya-ceres-graph';
import { KAUTILYA_CERES_FIXTURE_CASE } from './kautilya-ceres.fixture';

describe('compileKautilyaCaseGraph', () => {
  it('builds issue, procedure, stakeholder, and uncertainty structures from fixture data', async () => {
    const compiled = await compileKautilyaCaseGraph({
      caseId: KAUTILYA_CERES_FIXTURE_CASE.caseId,
      summary: KAUTILYA_CERES_FIXTURE_CASE.summary,
      objective: KAUTILYA_CERES_FIXTURE_CASE.objective,
      forum: KAUTILYA_CERES_FIXTURE_CASE.forum,
      jurisdiction: KAUTILYA_CERES_FIXTURE_CASE.jurisdiction,
      voiceTranscript: KAUTILYA_CERES_FIXTURE_CASE.voiceTranscript,
      documents: KAUTILYA_CERES_FIXTURE_CASE.documents,
    });

    expect(compiled.caseGraph.issueGraph.length).toBeGreaterThan(1);
    expect(compiled.caseGraph.evidenceGraph.some((node) => node.id === 'ev_reply')).toBe(true);
    expect(compiled.caseGraph.proceduralState.some((gate) => gate.label.toLowerCase().includes('urgency'))).toBe(
      true
    );
    expect(compiled.caseGraph.mandalaGraph.stakeholders.some((node) => node.stance === 'convertible')).toBe(
      true
    );
    expect(compiled.caseGraph.uncertaintyMap.length).toBeGreaterThan(0);
  });
});
