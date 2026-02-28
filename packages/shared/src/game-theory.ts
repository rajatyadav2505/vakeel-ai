export interface PayoffInputs {
  cooperateCooperate: number;
  cooperateDefect: number;
  defectCooperate: number;
  defectDefect: number;
}

export interface NashResult {
  recommendedMove: 'cooperate' | 'defect';
  expectedUtility: number;
  confidence: number;
}

function seededRandom(seed: number) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function calculateExpectedUtility(payoff: PayoffInputs, opponentDefectProbability: number): number {
  const p = Math.max(0, Math.min(1, opponentDefectProbability));
  const cooperateUtility =
    payoff.cooperateDefect * p + payoff.cooperateCooperate * (1 - p);
  const defectUtility = payoff.defectDefect * p + payoff.defectCooperate * (1 - p);
  return Math.max(cooperateUtility, defectUtility);
}

export function solveNashHeuristic(
  payoff: PayoffInputs,
  opponentDefectProbability: number
): NashResult {
  const p = Math.max(0, Math.min(1, opponentDefectProbability));

  const cooperateUtility =
    payoff.cooperateDefect * p + payoff.cooperateCooperate * (1 - p);
  const defectUtility = payoff.defectDefect * p + payoff.defectCooperate * (1 - p);

  const recommendedMove = defectUtility >= cooperateUtility ? 'defect' : 'cooperate';
  const expectedUtility = Math.max(cooperateUtility, defectUtility);
  const gap = Math.abs(defectUtility - cooperateUtility);
  const confidence = Math.min(0.95, Number((0.5 + gap / 20).toFixed(2)));

  return { recommendedMove, expectedUtility, confidence };
}

export function monteCarloBranchScore(branches: number[], simulations = 1000, seed?: number): number {
  if (!branches.length) return 0;
  const random = typeof seed === 'number' ? seededRandom(seed) : Math.random;

  let total = 0;
  for (let i = 0; i < simulations; i += 1) {
    const randomIndex = Math.floor(random() * branches.length);
    total += branches[randomIndex] ?? 0;
  }

  return Number((total / simulations).toFixed(2));
}
