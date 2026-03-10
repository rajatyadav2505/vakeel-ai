import {
  kautilyaMoveTypeSchema,
  kautilyaPhaseSchema,
  kautilyaRoleSchema,
  kautilyaTacticSchema,
  type KautilyaStrategyCard,
  type StrategyOutput,
} from '@nyaya/shared';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const strategyTurnFieldSchema = z.object({
  role: kautilyaRoleSchema,
  phase: kautilyaPhaseSchema,
  tactic: kautilyaTacticSchema,
  move_type: kautilyaMoveTypeSchema,
});

function uniqueCards(output: NonNullable<StrategyOutput['kautilyaCeres']>) {
  const seen = new Set<string>();
  const cards: KautilyaStrategyCard[] = [];
  for (const card of [
    ...output.petitionerStrategies.robust_mode,
    ...output.petitionerStrategies.exploit_mode,
    ...output.respondentStrategies.robust_mode,
    ...output.respondentStrategies.exploit_mode,
  ]) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    cards.push(card);
  }
  return cards;
}

export async function persistKautilyaStrategyRun(params: {
  simulationId: string;
  ownerUserId: string;
  caseId: string;
  objective: string;
  output: StrategyOutput;
}) {
  if (!params.output.kautilyaCeres) return null;

  const run = params.output.kautilyaCeres;
  const supabase = createSupabaseServerClient();
  const runId = crypto.randomUUID();
  const selectedCards = new Set<string>([
    run.petitionerStrategies[run.requestedMode][0]?.id ?? '',
    run.respondentStrategies[run.requestedMode][0]?.id ?? '',
  ]);
  const cards = uniqueCards(run);

  const runInsert = await supabase.from('strategy_runs').insert({
    id: runId,
    simulation_id: params.simulationId,
    owner_user_id: params.ownerUserId,
    case_id: params.caseId,
    engine_name: run.engine,
    strategy_mode: run.requestedMode,
    compute_mode: run.computeMode,
    objective: params.objective,
    aggregate_score:
      run.petitionerStrategies[run.requestedMode][0]?.judgeAggregate.aggregateOverall ?? null,
    appeal_survival_score:
      run.petitionerStrategies[run.requestedMode][0]?.judgeAggregate.appealSurvival ?? null,
    disagreement_score:
      run.petitionerStrategies[run.requestedMode][0]?.judgeAggregate.disagreementIndex ?? null,
    output_json: run,
  });
  if (runInsert.error) {
    throw new Error(`Failed to insert strategy_run: ${runInsert.error.message}`);
  }

  const argumentRows = [
    ...run.caseGraph.issueGraph.map((issue) => ({
      run_id: runId,
      owner_user_id: params.ownerUserId,
      node_id: issue.id,
      node_type: 'issue',
      label: issue.label,
      payload: issue,
    })),
    ...run.caseGraph.evidenceGraph.map((node) => ({
      run_id: runId,
      owner_user_id: params.ownerUserId,
      node_id: node.id,
      node_type: 'evidence',
      label: node.label,
      payload: node,
    })),
    ...run.caseGraph.authorityGraph.map((node) => ({
      run_id: runId,
      owner_user_id: params.ownerUserId,
      node_id: node.id,
      node_type: 'authority',
      label: node.title,
      payload: node,
    })),
    ...run.caseGraph.mandalaGraph.stakeholders.map((node) => ({
      run_id: runId,
      owner_user_id: params.ownerUserId,
      node_id: node.id,
      node_type: 'stakeholder',
      label: node.label,
      payload: node,
    })),
    ...run.caseGraph.proceduralState.map((node) => ({
      run_id: runId,
      owner_user_id: params.ownerUserId,
      node_id: node.id,
      node_type: 'procedure_gate',
      label: node.label,
      payload: node,
    })),
    ...run.caseGraph.uncertaintyMap.map((node) => ({
      run_id: runId,
      owner_user_id: params.ownerUserId,
      node_id: node.id,
      node_type: 'uncertainty',
      label: node.proposition,
      payload: node,
    })),
  ];
  if (argumentRows.length > 0) {
    const argumentInsert = await supabase.from('argument_nodes').insert(argumentRows);
    if (argumentInsert.error) {
      throw new Error(`Failed to insert argument_nodes: ${argumentInsert.error.message}`);
    }
  }

  const turnRows: Array<Record<string, unknown>> = [];
  const evidenceLinkRows: Array<Record<string, unknown>> = [];
  const authorityLinkRows: Array<Record<string, unknown>> = [];
  const judgeScoreRows: Array<Record<string, unknown>> = [];

  for (const card of cards) {
    card.judgeAggregate.scores.forEach((score) => {
      judgeScoreRows.push({
        run_id: runId,
        owner_user_id: params.ownerUserId,
        strategy_id: card.id,
        judge_role: score.judgeRole,
        order_variant: score.orderVariant,
        legal_correctness: score.legalCorrectness,
        citation_grounding: score.citationGrounding,
        procedural_compliance: score.proceduralCompliance,
        consistency: score.consistency,
        fairness: score.fairness,
        appeal_survival: score.appealSurvival,
        overall: score.overall,
        notes: score.notes,
      });
    });

    card.structuredMoves.forEach((move, index) => {
      const turnId = crypto.randomUUID();
      const validatedMove = strategyTurnFieldSchema.parse({
        role: move.role,
        phase: move.phase,
        tactic: move.tactic,
        move_type: move.move_type,
      });

      turnRows.push({
        id: turnId,
        run_id: runId,
        owner_user_id: params.ownerUserId,
        strategy_id: card.id,
        role: validatedMove.role,
        turn_index: index + 1,
        phase: validatedMove.phase,
        tactic: validatedMove.tactic,
        move_type: validatedMove.move_type,
        target_issue_id: move.target_issue_id,
        claim: move.claim,
        expected_utility: move.expected_utility,
        confidence: move.confidence,
        verifier_status: move.verifier_status,
        verifier_reasons: move.verifier_results,
        selected: selectedCards.has(card.id),
        branch_score: card.expectedValue,
      });

      move.evidence_ids.forEach((evidenceId) => {
        evidenceLinkRows.push({
          run_id: runId,
          turn_id: turnId,
          owner_user_id: params.ownerUserId,
          evidence_id: evidenceId,
          excerpt:
            run.caseGraph.evidenceGraph.find((node) => node.id === evidenceId)?.excerpt ?? null,
          weight: move.confidence,
        });
      });

      move.authority_ids.forEach((authorityId) => {
        authorityLinkRows.push({
          run_id: runId,
          turn_id: turnId,
          owner_user_id: params.ownerUserId,
          authority_id: authorityId,
          title:
            run.caseGraph.authorityGraph.find((node) => node.id === authorityId)?.title ?? null,
          weight: move.confidence,
        });
      });
    });
  }

  if (turnRows.length > 0) {
    const turnInsert = await supabase.from('strategy_turns').insert(turnRows);
    if (turnInsert.error) {
      throw new Error(`Failed to insert strategy_turns: ${turnInsert.error.message}`);
    }
  }

  if (evidenceLinkRows.length > 0) {
    const evidenceInsert = await supabase.from('evidence_links').insert(evidenceLinkRows);
    if (evidenceInsert.error) {
      throw new Error(`Failed to insert evidence_links: ${evidenceInsert.error.message}`);
    }
  }

  if (authorityLinkRows.length > 0) {
    const authorityInsert = await supabase.from('authority_links').insert(authorityLinkRows);
    if (authorityInsert.error) {
      throw new Error(`Failed to insert authority_links: ${authorityInsert.error.message}`);
    }
  }

  if (judgeScoreRows.length > 0) {
    const judgeInsert = await supabase.from('judge_scores').insert(judgeScoreRows);
    if (judgeInsert.error) {
      throw new Error(`Failed to insert judge_scores: ${judgeInsert.error.message}`);
    }
  }

  if (run.contradictionTargets.length > 0) {
    const contradictionInsert = await supabase.from('contradiction_targets').insert(
      run.contradictionTargets.map((target) => ({
        run_id: runId,
        owner_user_id: params.ownerUserId,
        issue_id: target.issueId,
        target_label: target.label,
        supporting_evidence_ids: target.supportingEvidenceIds,
        acceptance_score_drop: target.acceptanceScoreDrop,
        min_cut_cost: target.minCutCost,
        rationale: target.rationale,
      }))
    );
    if (contradictionInsert.error) {
      throw new Error(`Failed to insert contradiction_targets: ${contradictionInsert.error.message}`);
    }
  }

  if (run.policySnapshots.length > 0) {
    const policyInsert = await supabase.from('policy_snapshots').insert(
      run.policySnapshots.map((snapshot) => ({
        run_id: runId,
        owner_user_id: params.ownerUserId,
        role: snapshot.role,
        bundle_id: snapshot.bundleId,
        tactic: snapshot.tactic,
        evidence_ids: snapshot.evidenceIds,
        cumulative_regret: snapshot.cumulativeRegret,
        strategy_probability: snapshot.probability,
      }))
    );
    if (policyInsert.error) {
      throw new Error(`Failed to insert policy_snapshots: ${policyInsert.error.message}`);
    }
  }

  if (
    run.distillationTrace.approvalState !== 'rejected'
    && run.distillationTrace.qualityScore >= 0.62
  ) {
    const distillationInsert = await supabase.from('distillation_traces').insert({
      run_id: runId,
      owner_user_id: params.ownerUserId,
      case_id: params.caseId,
      quality_score: run.distillationTrace.qualityScore,
      approval_state: run.distillationTrace.approvalState,
      trace_json: run.distillationTrace,
      training_json: {
        prompt: run.distillationTrace.prompt,
        completion: run.distillationTrace.completion,
        engine: run.engine,
      },
    });
    if (distillationInsert.error) {
      throw new Error(`Failed to insert distillation_traces: ${distillationInsert.error.message}`);
    }
  }

  return runId;
}
