import type {
  KautilyaCaseGraph,
  KautilyaContradictionTarget,
  KautilyaStructuredMove,
  KautilyaVerifierResult,
} from '@nyaya/shared';

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenOverlap(lhs: string, rhs: string) {
  const a = new Set(normalize(lhs).split(' ').filter((token) => token.length >= 3));
  const b = new Set(normalize(rhs).split(' ').filter((token) => token.length >= 3));
  if (!a.size || !b.size) return 0;
  let hits = 0;
  for (const token of a) {
    if (b.has(token)) hits += 1;
  }
  return hits / Math.max(a.size, b.size);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function statusFromScore(score: number, hardFail = false): KautilyaVerifierResult['status'] {
  if (hardFail || score < 0.2) return 'rejected';
  if (score < 0.55) return 'abstained';
  return 'approved';
}

export function verifyStructuredMove(params: {
  move: KautilyaStructuredMove;
  caseGraph: KautilyaCaseGraph;
  contradictionTargets: KautilyaContradictionTarget[];
}): KautilyaStructuredMove {
  const evidenceMap = new Map(params.caseGraph.evidenceGraph.map((node) => [node.id, node]));
  const authorityMap = new Map(params.caseGraph.authorityGraph.map((node) => [node.id, node]));
  const issue = params.caseGraph.issueGraph.find((item) => item.id === params.move.target_issue_id);
  const blockedGate = params.caseGraph.proceduralState.find((gate) => {
    if (gate.phase !== params.move.phase || gate.status !== 'blocked') return false;
    return (
      issue?.status === 'gated'
      || params.move.move_type === 'procedural_push'
      || params.move.move_type === 'application'
      || gate.requiredEvidenceIds.some((id) => params.move.evidence_ids.includes(id))
    );
  });
  const supportSpans = params.move.evidence_ids
    .map((id) => evidenceMap.get(id)?.excerpt)
    .filter((value): value is string => Boolean(value))
    .slice(0, 4);

  const evidenceExists = params.move.evidence_ids.length > 0
    && params.move.evidence_ids.every((id) => evidenceMap.has(id));
  const authorityExists = params.move.authority_ids.length > 0
    && params.move.authority_ids.every((id) => authorityMap.has(id));
  const evidenceTexts = params.move.evidence_ids
    .map((id) => evidenceMap.get(id)?.excerpt ?? '')
    .join(' ');
  const authorityTexts = params.move.authority_ids
    .map((id) => authorityMap.get(id)?.proposition ?? '')
    .join(' ');
  const issueSupportScore = tokenOverlap(params.move.claim, issue?.label ?? '');
  const groundingScore = clamp(
    Math.max(
      tokenOverlap(params.move.claim, evidenceTexts),
      tokenOverlap(params.move.claim, authorityTexts),
      issueSupportScore,
      evidenceExists && authorityExists ? 0.62 : 0,
      evidenceExists && authorityExists && supportSpans.length > 0 ? 0.56 : 0
    ),
    0,
    1
  );
  const contradictionMatch =
    params.move.tactic !== 'BHEDA'
      ? 0.8
      : params.contradictionTargets.some(
            (target) =>
              target.issueId === params.move.target_issue_id
              || tokenOverlap(target.label, params.move.claim) >= 0.14
          )
        ? 0.92
        : 0.18;
  const timelineScore =
    issue?.status === 'contested' && params.move.tactic !== 'BHEDA'
      ? 0.42
      : issue?.status === 'gated'
        ? 0.5
        : 0.8;
  const procedureScore =
    blockedGate && !blockedGate.requiredEvidenceIds.some((id) => params.move.evidence_ids.includes(id))
      ? 0.12
      : 0.82;
  const spanScore = supportSpans.length > 0 ? 0.84 : 0.14;

  const results: KautilyaVerifierResult[] = [
    {
      verifier: 'evidence_existence',
      status: statusFromScore(evidenceExists ? 1 : 0, !evidenceExists),
      score: evidenceExists ? 1 : 0,
      reason: evidenceExists
        ? 'All referenced evidence IDs exist in the compiled case graph.'
        : 'One or more evidence IDs are missing from the compiled case graph.',
    },
    {
      verifier: 'authority_existence',
      status: statusFromScore(authorityExists ? 1 : 0, !authorityExists),
      score: authorityExists ? 1 : 0,
      reason: authorityExists
        ? 'All referenced authority IDs exist in the retriever result set.'
        : 'Referenced authority IDs are missing or empty.',
    },
    {
      verifier: 'claim_grounding',
      status: statusFromScore(groundingScore),
      score: Number(groundingScore.toFixed(2)),
      reason:
        groundingScore >= 0.55
          ? 'Claim language materially overlaps with cited evidence or authority support.'
          : 'Claim does not sufficiently overlap with cited evidence or authority support.',
    },
    {
      verifier: 'timeline_consistency',
      status: statusFromScore(timelineScore),
      score: Number(timelineScore.toFixed(2)),
      reason:
        timelineScore >= 0.55
          ? 'Move is compatible with the current chronology and issue posture.'
          : 'Move risks fighting against unresolved chronology inconsistencies.',
    },
    {
      verifier: 'contradiction_path',
      status: statusFromScore(contradictionMatch),
      score: Number(contradictionMatch.toFixed(2)),
      reason:
        contradictionMatch >= 0.55
          ? 'Move is aligned with available contradiction or fracture targets.'
          : 'BHEDA line lacks a matching contradiction fracture target.',
    },
    {
      verifier: 'procedure_gate',
      status: statusFromScore(procedureScore, procedureScore < 0.2),
      score: Number(procedureScore.toFixed(2)),
      reason:
        procedureScore >= 0.55
          ? 'No hard procedural gate blocks this move in the current phase.'
          : blockedGate?.reason ?? 'A phase-specific procedural gate is blocking this move.',
    },
    {
      verifier: 'support_span',
      status: statusFromScore(spanScore),
      score: Number(spanScore.toFixed(2)),
      reason:
        spanScore >= 0.55
          ? 'Support spans are available for downstream traceability and quote checks.'
          : 'Traceability spans are missing for this move.',
    },
  ];

  const hardRejected = results.some((result) => result.status === 'rejected');
  const abstained = !hardRejected && results.some((result) => result.status === 'abstained');

  return {
    ...params.move,
    confidence: Number(
      clamp(
        params.move.confidence
          * (hardRejected ? 0.45 : abstained ? 0.74 : 1)
          * (0.7 + groundingScore * 0.3),
        0.12,
        0.96
      ).toFixed(2)
    ),
    verifier_status: hardRejected ? 'rejected' : abstained ? 'abstained' : 'approved',
    verifier_results: results,
    support_spans: supportSpans,
  };
}

export function verifyStructuredMoves(params: {
  moves: KautilyaStructuredMove[];
  caseGraph: KautilyaCaseGraph;
  contradictionTargets: KautilyaContradictionTarget[];
}) {
  return params.moves.map((move) =>
    verifyStructuredMove({
      move,
      caseGraph: params.caseGraph,
      contradictionTargets: params.contradictionTargets,
    })
  );
}
