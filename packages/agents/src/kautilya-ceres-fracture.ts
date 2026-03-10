import type {
  CaseEvidenceGraph,
  KautilyaCaseGraph,
  KautilyaContradictionTarget,
  LegalResearchPacket,
} from '@nyaya/shared';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function severityWeight(value: 'low' | 'medium' | 'high') {
  if (value === 'high') return 0.82;
  if (value === 'medium') return 0.62;
  return 0.44;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function computeBhedaFractureTargets(params: {
  caseGraph: KautilyaCaseGraph;
  evidenceGraph: CaseEvidenceGraph;
  legalResearchPacket: LegalResearchPacket;
  topK?: number;
}): KautilyaContradictionTarget[] {
  const topK = Math.max(1, Math.min(8, params.topK ?? 6));
  const issueMap = new Map(params.caseGraph.issueGraph.map((issue) => [issue.id, issue]));
  const evidenceMap = new Map(params.caseGraph.evidenceGraph.map((node) => [node.id, node]));
  const targets: KautilyaContradictionTarget[] = [];

  params.evidenceGraph.contradictions.forEach((contradiction, index) => {
    const linkedIssue =
      params.caseGraph.issueGraph.find((issue) =>
        issue.label.toLowerCase().includes(contradiction.title.toLowerCase().slice(0, 12))
      ) ?? params.caseGraph.issueGraph[0];
    if (!linkedIssue) return;
    const evidenceIds = contradiction.anchors
      .map((anchor) => anchor.sourceId)
      .filter((value): value is string => Boolean(value));
    const evidenceConfidence = average(
      evidenceIds.map((id) => evidenceMap.get(id)?.confidence ?? 0.5)
    );
    const authoritySupport = linkedIssue.authorityIds.length
      ? Math.min(0.24, linkedIssue.authorityIds.length * 0.05)
      : 0;
    const acceptanceScoreDrop = clamp(
      severityWeight(contradiction.severity) * 0.6 + evidenceConfidence * 0.25 + authoritySupport,
      0.18,
      0.95
    );
    const minCutCost = clamp(1 - evidenceConfidence + (linkedIssue.status === 'gated' ? 0.12 : 0), 0.08, 0.86);
    targets.push({
      id: `fracture_${index + 1}`,
      issueId: linkedIssue.id,
      label: contradiction.title,
      supportingEvidenceIds: evidenceIds.length > 0 ? evidenceIds : linkedIssue.supportingEvidenceIds.slice(0, 2),
      acceptanceScoreDrop: Number(acceptanceScoreDrop.toFixed(2)),
      minCutCost: Number(minCutCost.toFixed(2)),
      rationale: contradiction.description,
    });
  });

  params.evidenceGraph.missingDocuments.forEach((missing, index) => {
    const linkedIssue =
      params.caseGraph.issueGraph.find((issue) =>
        issue.label.toLowerCase().includes(missing.requiredDocumentType.replace('_', ' '))
      ) ?? params.caseGraph.issueGraph[0];
    if (!linkedIssue) return;
    targets.push({
      id: `fracture_missing_${index + 1}`,
      issueId: linkedIssue.id,
      label: `${missing.requiredDocumentType.replace('_', ' ')} gap`,
      supportingEvidenceIds: linkedIssue.supportingEvidenceIds.slice(0, 2),
      acceptanceScoreDrop: Number(clamp(missing.confidence * 0.72, 0.16, 0.82).toFixed(2)),
      minCutCost: Number(clamp(0.22 + (1 - missing.confidence) * 0.5, 0.18, 0.88).toFixed(2)),
      rationale: missing.reason,
    });
  });

  params.legalResearchPacket.conflictsDetected.forEach((conflict, index) => {
    const linkedIssue =
      params.caseGraph.issueGraph.find((issue) =>
        conflict.issueTag.toLowerCase().includes(issue.label.toLowerCase().slice(0, 10))
      ) ?? params.caseGraph.issueGraph[0];
    if (!linkedIssue) return;
    targets.push({
      id: `fracture_conflict_${index + 1}`,
      issueId: linkedIssue.id,
      label: `Authority split on ${conflict.issueTag}`,
      supportingEvidenceIds: linkedIssue.supportingEvidenceIds.slice(0, 2),
      acceptanceScoreDrop: Number(clamp(0.3 + conflict.conflictingAuthorityIds.length * 0.08, 0.24, 0.78).toFixed(2)),
      minCutCost: Number(clamp(0.34 - linkedIssue.authorityIds.length * 0.03, 0.12, 0.62).toFixed(2)),
      rationale: conflict.summary,
    });
  });

  return targets
    .sort(
      (lhs, rhs) =>
        rhs.acceptanceScoreDrop - rhs.minCutCost - (lhs.acceptanceScoreDrop - lhs.minCutCost)
    )
    .slice(0, topK);
}
