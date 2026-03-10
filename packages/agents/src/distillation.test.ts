import { describe, expect, it } from 'vitest';
import {
  agentWiseNormalizeRewards,
  exportDistillationJsonl,
  selectDistillationDataset,
  toRoleTokenizedSftExample,
  type DistillationDatasetRecord,
} from './distillation';

function createRecord(overrides: Partial<DistillationDatasetRecord> = {}): DistillationDatasetRecord {
  return {
    runId: 'run_1',
    caseId: 'case_1',
    role: 'strategist',
    strategyMode: 'robust_mode',
    computeMode: 'standard',
    qualityScore: 0.82,
    approvalState: 'approved',
    judgeAgreement: 0.8,
    groundingScore: 0.88,
    unsupportedClaimRate: 0.08,
    reversalRisk: 0.14,
    prompt: 'Generate strategy.',
    completion: '{"ok":true}',
    traceSummary: 'summary',
    ...overrides,
  };
}

describe('distillation pipeline helpers', () => {
  it('filters out low-quality traces', () => {
    const records = [
      createRecord({ runId: 'approved_top', qualityScore: 0.9 }),
      createRecord({ runId: 'candidate_ok', approvalState: 'candidate', qualityScore: 0.7 }),
      createRecord({
        runId: 'rejected_low_grounding',
        approvalState: 'rejected',
        groundingScore: 0.2,
      }),
      createRecord({
        runId: 'high_reversal',
        reversalRisk: 0.52,
      }),
    ];

    const selected = selectDistillationDataset(records);

    expect(selected.map((record) => record.runId)).toEqual(['approved_top', 'candidate_ok']);
  });

  it('builds role-tokenized SFT examples', () => {
    const example = toRoleTokenizedSftExample(
      createRecord({
        runId: 'run_role',
        role: 'judge_merits',
        strategyMode: 'exploit_mode',
        computeMode: 'full',
      })
    );

    expect(example.messages[1]?.content).toContain('<ROLE=JUDGE_MERITS><MODE=exploit_mode><COMPUTE=full>');
    expect(example.metadata.role).toBe('judge_merits');
  });

  it('exports filtered JSONL datasets', () => {
    const jsonl = exportDistillationJsonl([
      createRecord({ runId: 'good' }),
      createRecord({ runId: 'bad', unsupportedClaimRate: 0.4 }),
    ]);

    const lines = jsonl.split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('"runId":"good"');
  });

  it('normalizes rewards per agent', () => {
    const normalized = agentWiseNormalizeRewards([
      { agent: 'petitioner_or_plaintiff', reward: 0.7, baseline: 0.2 },
      { agent: 'petitioner_or_plaintiff', reward: 0.5, baseline: 0.2 },
      { agent: 'respondent_or_defendant', reward: 0.45, baseline: 0.25 },
    ]);

    expect(normalized).toHaveLength(3);
    expect(normalized[0]?.centeredReward).toBe(0.5);
    expect(Math.abs(normalized[0]?.normalizedReward ?? 0)).toBeGreaterThan(0.9);
    expect(normalized[2]?.normalizedReward).toBe(0);
  });
});
