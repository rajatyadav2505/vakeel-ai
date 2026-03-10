import { describe, expect, it } from 'vitest';
import type { KautilyaStructuredMove } from '@nyaya/shared';
import { computeCounterfactualEvidenceRegret } from './kautilya-ceres-regret';

function move(id: string, tactic: KautilyaStructuredMove['tactic'], score: number): KautilyaStructuredMove {
  return {
    id,
    role: 'petitioner_or_plaintiff',
    phase: 'interim_relief',
    tactic,
    move_type: 'claim',
    target_issue_id: 'issue_1',
    claim: `${tactic} move ${id}`,
    evidence_ids: [`ev_${id}`],
    authority_ids: [`auth_${id}`],
    expected_utility: {
      merits_delta: score,
      leverage_delta: score,
      credibility_delta: score,
      settlement_value: 0.05,
      sanction_risk: 0.02,
      reversal_risk: 0.03,
      unsupported_claim_risk: 0.01,
      overall: score,
    },
    confidence: 0.7,
    verifier_status: 'approved',
    verifier_results: [],
    support_spans: [],
  };
}

describe('computeCounterfactualEvidenceRegret', () => {
  it('builds regret-matched probabilities over evidence+tactic bundles', () => {
    const snapshots = computeCounterfactualEvidenceRegret({
      role: 'petitioner_or_plaintiff',
      moves: [move('1', 'SAMA', 0.12), move('2', 'BHEDA', 0.22), move('3', 'DANDA', 0.18)],
      selectedMoveId: '1',
      scoreByMoveId: {
        '1': 0.5,
        '2': 0.78,
        '3': 0.64,
      },
    });

    expect(snapshots.length).toBe(3);
    expect(snapshots.find((item) => item.tactic === 'BHEDA')!.probability).toBeGreaterThan(
      snapshots.find((item) => item.tactic === 'SAMA')!.probability
    );
  });
});
