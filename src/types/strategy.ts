// ─── Chanakya Strategy ──────────────────────────────────────────────────────────

/**
 * The four pillars of Chanakya Niti applied to legal strategy:
 *  - saam:  Conciliation / negotiation / mediation
 *  - daam:  Compensation / settlement / incentives
 *  - dand:  Punishment / strict legal action / litigation
 *  - bhed:  Division / exploiting weaknesses in opponent's position
 */
export type ChanakyaStrategy = 'saam' | 'daam' | 'dand' | 'bhed';

export const CHANAKYA_STRATEGY_LABELS: Record<ChanakyaStrategy, string> = {
  saam: 'Saam (Conciliation)',
  daam: 'Daam (Compensation)',
  dand: 'Dand (Strict Action)',
  bhed: 'Bhed (Strategic Division)',
};

export const CHANAKYA_STRATEGY_DESCRIPTIONS: Record<ChanakyaStrategy, string> = {
  saam: 'Resolve through dialogue, negotiation, and finding common ground. Best for cases where maintaining relationships matters or when a settlement is advantageous.',
  daam: 'Offer compensation, settlement, or incentives to resolve the dispute. Effective when financial resolution is preferred over prolonged litigation.',
  dand: 'Pursue strict legal action through full litigation. Appropriate when rights have been clearly violated and a precedent-setting judgment is needed.',
  bhed: 'Identify and exploit weaknesses in the opponent\'s legal position. Useful when the opponent\'s case has internal contradictions or procedural vulnerabilities.',
};

// ─── Chanakya Analysis ──────────────────────────────────────────────────────────

export interface ChanakyaAnalysis {
  strategy: ChanakyaStrategy;
  description: string;
  applicability: number; // 0.0 to 1.0
  actions: ChanakyaAction[];
  confidence: number; // 0.0 to 1.0
}

export interface ChanakyaAction {
  step: number;
  action: string;
  expectedOutcome: string;
  riskLevel: RiskLevel;
  timeline: string;
}

// ─── Game Theory ────────────────────────────────────────────────────────────────

export interface GameTheoryScenario {
  name: string;
  description: string;
  payoff: PayoffMatrix;
  probability: number; // 0.0 to 1.0
  nashEquilibrium: NashEquilibrium;
}

export interface PayoffMatrix {
  /** Our payoff if both cooperate */
  cooperateCooperate: number;
  /** Our payoff if we cooperate but opponent defects */
  cooperateDefect: number;
  /** Our payoff if we defect but opponent cooperates */
  defectCooperate: number;
  /** Our payoff if both defect */
  defectDefect: number;
}

export interface NashEquilibrium {
  ourStrategy: string;
  opponentStrategy: string;
  isStable: boolean;
  explanation: string;
}

// ─── Opponent Prediction ────────────────────────────────────────────────────────

export interface OpponentPrediction {
  move: string;
  probability: number; // 0.0 to 1.0
  counterStrategy: string;
  reasoning: string;
}

// ─── Strategy Recommendation ────────────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface StrategyRecommendation {
  primary: StrategyOption;
  alternatives: StrategyOption[];
  reasoning: string;
  confidence: number; // 0.0 to 1.0
  riskLevel: RiskLevel;
}

export interface StrategyOption {
  name: string;
  description: string;
  chanakyaPillar: ChanakyaStrategy;
  steps: string[];
  expectedOutcome: string;
  timeEstimate: string;
  riskLevel: RiskLevel;
}

// ─── Complete Strategy Analysis ─────────────────────────────────────────────────

export interface StrategyAnalysis {
  id: string;
  caseId: string;
  chanakyaAnalysis: ChanakyaAnalysis[];
  gameTheoryAnalysis: GameTheoryScenario[];
  opponentPredictions: OpponentPrediction[];
  recommendedStrategy: StrategyRecommendation;
  confidence: number;
  createdAt: number;
}
