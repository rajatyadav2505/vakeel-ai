import { describe, expect, it } from 'vitest';
import type { KautilyaStructuredMove } from '@nyaya/shared';
import { compileKautilyaCaseGraph } from './kautilya-ceres-graph';
import { computeBhedaFractureTargets } from './kautilya-ceres-fracture';
import { KAUTILYA_CERES_FIXTURE_CASE } from './kautilya-ceres.fixture';
import { verifyStructuredMove } from './kautilya-ceres-verifiers';

describe('kautilya verifiers', () => {
  it('approves a grounded move with real evidence and authority IDs', async () => {
    const compiled = await compileKautilyaCaseGraph({
      caseId: KAUTILYA_CERES_FIXTURE_CASE.caseId,
      summary: KAUTILYA_CERES_FIXTURE_CASE.summary,
      objective: KAUTILYA_CERES_FIXTURE_CASE.objective,
      forum: KAUTILYA_CERES_FIXTURE_CASE.forum,
      jurisdiction: KAUTILYA_CERES_FIXTURE_CASE.jurisdiction,
      voiceTranscript: KAUTILYA_CERES_FIXTURE_CASE.voiceTranscript,
      documents: KAUTILYA_CERES_FIXTURE_CASE.documents,
    });
    const issue =
      compiled.caseGraph.issueGraph.find(
        (item) => item.status !== 'gated' && item.supportingEvidenceIds.length > 0
      ) ?? compiled.caseGraph.issueGraph[0];
    expect(issue).toBeDefined();
    const targets = computeBhedaFractureTargets({
      caseGraph: compiled.caseGraph,
      evidenceGraph: compiled.evidenceGraph,
      legalResearchPacket: compiled.legalResearchPacket,
    });

    const move: KautilyaStructuredMove = {
      id: crypto.randomUUID(),
      role: 'petitioner_or_plaintiff',
      phase: issue!.phase,
      tactic: 'SAMA',
      move_type: 'claim',
      target_issue_id: issue!.id,
      claim: `Petitioner should present a coherent chronology on ${issue!.label.toLowerCase()} with direct documentary support.`,
      evidence_ids:
        issue!.supportingEvidenceIds.length > 0
          ? issue!.supportingEvidenceIds.slice(0, 2)
          : compiled.caseGraph.evidenceGraph.slice(0, 2).map((node) => node.id),
      authority_ids:
        issue!.authorityIds.length > 0
          ? issue!.authorityIds.slice(0, 2)
          : compiled.caseGraph.authorityGraph.slice(0, 2).map((node) => node.id),
      expected_utility: {
        merits_delta: 0.16,
        leverage_delta: 0.12,
        credibility_delta: 0.18,
        settlement_value: 0.08,
        sanction_risk: 0.03,
        reversal_risk: 0.05,
        unsupported_claim_risk: 0.02,
        overall: 0.17,
      },
      confidence: 0.71,
      verifier_status: 'abstained',
      verifier_results: [],
      support_spans: [],
    };

    const verified = verifyStructuredMove({
      move,
      caseGraph: compiled.caseGraph,
      contradictionTargets: targets,
    });

    expect(verified.verifier_status).toBe('approved');
    expect(verified.support_spans.length).toBeGreaterThan(0);
  });

  it('rejects unsupported citations and missing authority IDs', async () => {
    const compiled = await compileKautilyaCaseGraph({
      caseId: KAUTILYA_CERES_FIXTURE_CASE.caseId,
      summary: KAUTILYA_CERES_FIXTURE_CASE.summary,
      objective: KAUTILYA_CERES_FIXTURE_CASE.objective,
      forum: KAUTILYA_CERES_FIXTURE_CASE.forum,
      jurisdiction: KAUTILYA_CERES_FIXTURE_CASE.jurisdiction,
      voiceTranscript: KAUTILYA_CERES_FIXTURE_CASE.voiceTranscript,
      documents: KAUTILYA_CERES_FIXTURE_CASE.documents,
    });
    const issue = compiled.caseGraph.issueGraph[0];
    const targets = computeBhedaFractureTargets({
      caseGraph: compiled.caseGraph,
      evidenceGraph: compiled.evidenceGraph,
      legalResearchPacket: compiled.legalResearchPacket,
    });

    const verified = verifyStructuredMove({
      move: {
        id: crypto.randomUUID(),
        role: 'petitioner_or_plaintiff',
        phase: issue!.phase,
        tactic: 'BHEDA',
        move_type: 'rebuttal',
        target_issue_id: issue!.id,
        claim: 'Press a contradiction without any real authority support.',
        evidence_ids: issue!.supportingEvidenceIds.slice(0, 1),
        authority_ids: ['auth_missing'],
        expected_utility: {
          merits_delta: 0.1,
          leverage_delta: 0.14,
          credibility_delta: 0.11,
          settlement_value: 0.03,
          sanction_risk: 0.04,
          reversal_risk: 0.08,
          unsupported_claim_risk: 0.16,
          overall: 0.1,
        },
        confidence: 0.58,
        verifier_status: 'abstained',
        verifier_results: [],
        support_spans: [],
      },
      caseGraph: compiled.caseGraph,
      contradictionTargets: targets,
    });

    expect(verified.verifier_status).toBe('rejected');
    expect(verified.verifier_results.some((item) => item.verifier === 'authority_existence' && item.status === 'rejected')).toBe(true);
  });
});
