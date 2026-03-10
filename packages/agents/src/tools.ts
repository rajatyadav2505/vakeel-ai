import {
  CHANAKYA_PRINCIPLES,
  calculateExpectedUtility,
  monteCarloBranchScore,
  solveNashHeuristic,
  type Citation,
} from '@nyaya/shared';
import { getAgentsEnv } from './env';

const KANOON_API_BASE = 'https://api.indiankanoon.org';

function kanoonHeaders() {
  const token = getAgentsEnv().INDIANKANOON_API_TOKEN;
  return token ? { Authorization: `Token ${token}` } : {};
}

export async function searchKanoon(query: string): Promise<Citation[]> {
  if (!query.trim()) return [];

  try {
    const response = await fetch(
      `${KANOON_API_BASE}/search/?formInput=${encodeURIComponent(query)}&pagenum=0`,
      { headers: kanoonHeaders(), cache: 'no-store' }
    );
    if (!response.ok) return [];

    const data = (await response.json()) as {
      docs?: Array<{ tid: string; title: string; headline?: string }>;
    };

    return (data.docs ?? []).slice(0, 5).map((doc, index) => ({
      id: `k-${doc.tid}`,
      title: doc.title,
      source: 'indiankanoon',
      url: `https://indiankanoon.org/doc/${doc.tid}/`,
      excerpt: doc.headline ?? 'Relevant precedent from Indian Kanoon search.',
      confidence: Number((0.8 - index * 0.05).toFixed(2)),
    }));
  } catch {
    return [];
  }
}

export function applyChanakyaPrinciples(factPattern: string) {
  const lower = factPattern.toLowerCase();
  if (lower.includes('urgent') || lower.includes('stay') || lower.includes('injunction')) {
    return CHANAKYA_PRINCIPLES.dand;
  }
  if (lower.includes('settle') || lower.includes('compensation')) {
    return CHANAKYA_PRINCIPLES.daam;
  }
  if (lower.includes('relationship') || lower.includes('family')) {
    return CHANAKYA_PRINCIPLES.saam;
  }
  return CHANAKYA_PRINCIPLES.bhed;
}

export function calculateGameTheory(params: {
  cooperateCooperate: number;
  cooperateDefect: number;
  defectCooperate: number;
  defectDefect: number;
  opponentDefectProbability: number;
}) {
  const expectedUtility = calculateExpectedUtility(params, params.opponentDefectProbability);
  const nash = solveNashHeuristic(params, params.opponentDefectProbability);
  return { expectedUtility, nash };
}

export function simulateBranch(branchScores: number[], samples = 2000) {
  return monteCarloBranchScore(branchScores, samples);
}

export function simulateBranchSeeded(branchScores: number[], samples: number, seed: number) {
  return monteCarloBranchScore(branchScores, samples, seed);
}
