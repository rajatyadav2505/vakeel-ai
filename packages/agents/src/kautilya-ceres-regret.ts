import type {
  KautilyaPolicySnapshot,
  KautilyaStructuredMove,
} from '@nyaya/shared';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function buildEvidenceTacticBundleId(move: KautilyaStructuredMove) {
  const evidencePart = move.evidence_ids.slice().sort().join('+') || 'no_evidence';
  return `${move.tactic}:${evidencePart}`;
}

export function computeCounterfactualEvidenceRegret(params: {
  role: KautilyaPolicySnapshot['role'];
  moves: KautilyaStructuredMove[];
  selectedMoveId: string;
  scoreByMoveId: Record<string, number>;
}): KautilyaPolicySnapshot[] {
  const selectedValue = params.scoreByMoveId[params.selectedMoveId] ?? 0;
  const bundleMap = new Map<string, KautilyaPolicySnapshot>();

  for (const move of params.moves) {
    const bundleId = buildEvidenceTacticBundleId(move);
    const regret = (params.scoreByMoveId[move.id] ?? 0) - selectedValue;
    const current = bundleMap.get(bundleId);
    if (!current || regret > current.cumulativeRegret) {
      bundleMap.set(bundleId, {
        role: params.role,
        bundleId,
        evidenceIds: move.evidence_ids.slice().sort(),
        tactic: move.tactic,
        cumulativeRegret: Number(regret.toFixed(2)),
        probability: 0,
      });
    }
  }

  const bundles = Array.from(bundleMap.values());
  const positiveTotal = bundles.reduce(
    (sum, bundle) => sum + Math.max(0, bundle.cumulativeRegret),
    0
  );

  return bundles.map((bundle) => ({
    ...bundle,
    probability: Number(
      (
        positiveTotal > 0
          ? Math.max(0, bundle.cumulativeRegret) / positiveTotal
          : 1 / Math.max(1, bundles.length)
      ).toFixed(3)
    ),
    cumulativeRegret: Number(clamp(bundle.cumulativeRegret, -1, 1).toFixed(2)),
  }));
}
