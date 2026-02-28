import { v4 as uuidv4 } from 'uuid';
import type { Case } from '@/types/case';
import type {
  ChanakyaAnalysis,
  ChanakyaStrategy,
  GameTheoryScenario,
  OpponentPrediction,
  StrategyAnalysis,
  StrategyOption,
  StrategyRecommendation,
} from '@/types/strategy';
import { invokeModel } from '@/lib/ai/shared/llm';

interface StrategyInput {
  caseData: Case;
  facts: string;
  objective: string;
  riskTolerance: 'low' | 'medium' | 'high';
}

function strategyBiasByCaseType(caseType: Case['caseType']): Record<ChanakyaStrategy, number> {
  if (caseType === 'criminal') {
    return { saam: 0.45, daam: 0.3, dand: 0.8, bhed: 0.75 };
  }

  if (caseType === 'consumer' || caseType === 'family') {
    return { saam: 0.8, daam: 0.75, dand: 0.45, bhed: 0.5 };
  }

  if (caseType === 'constitutional') {
    return { saam: 0.4, daam: 0.35, dand: 0.82, bhed: 0.7 };
  }

  return { saam: 0.62, daam: 0.65, dand: 0.7, bhed: 0.66 };
}

function riskFactor(risk: StrategyInput['riskTolerance']) {
  if (risk === 'low') return 0.85;
  if (risk === 'high') return 1.12;
  return 1;
}

function createChanakyaAnalyses(input: StrategyInput): ChanakyaAnalysis[] {
  const bias = strategyBiasByCaseType(input.caseData.caseType);
  const factor = riskFactor(input.riskTolerance);

  const entries: Array<{
    strategy: ChanakyaStrategy;
    description: string;
    actions: Array<{ action: string; expectedOutcome: string; riskLevel: 'low' | 'medium' | 'high' }>;
  }> = [
    {
      strategy: 'saam',
      description: 'Controlled dialogue track that preserves legal leverage and narrows issues.',
      actions: [
        {
          action: 'Issue a structured pre-litigation proposal with strict response windows.',
          expectedOutcome: 'Opponent reveals priorities and acceptable compromise zone.',
          riskLevel: 'low',
        },
        {
          action: 'Table narrow concessions tied to admissions.',
          expectedOutcome: 'Creates record useful for court if talks fail.',
          riskLevel: 'medium',
        },
      ],
    },
    {
      strategy: 'daam',
      description: 'Settlement economics and cost-of-delay modeling to force rational outcomes.',
      actions: [
        {
          action: 'Quantify expected trial cost and delay, then offer optimized settlement band.',
          expectedOutcome: 'Shifts narrative to measurable risk for opponent.',
          riskLevel: 'medium',
        },
        {
          action: 'Use milestone-based settlement terms.',
          expectedOutcome: 'Reduces breach risk while retaining enforcement leverage.',
          riskLevel: 'medium',
        },
      ],
    },
    {
      strategy: 'dand',
      description: 'Aggressive court-led pressure strategy using procedural and substantive strength.',
      actions: [
        {
          action: 'Pursue interim protection and early evidence-preservation directions.',
          expectedOutcome: 'Locks the battlefield and prevents tactical dilution.',
          riskLevel: 'high',
        },
        {
          action: 'Sequence filings to maximize procedural momentum.',
          expectedOutcome: 'Opponent spends resources responding rather than attacking.',
          riskLevel: 'high',
        },
      ],
    },
    {
      strategy: 'bhed',
      description: 'Exploit contradictions, misalignment, and weak links in opponent’s position.',
      actions: [
        {
          action: 'Map inconsistent pleadings, witness statements, and document timelines.',
          expectedOutcome: 'Creates decisive impeachment opportunities.',
          riskLevel: 'medium',
        },
        {
          action: 'Target weakest legal element with focused evidentiary challenge.',
          expectedOutcome: 'Forces opponent into defensive procedural posture.',
          riskLevel: 'high',
        },
      ],
    },
  ];

  return entries.map((entry) => {
    const confidence = Math.min(0.95, Number((bias[entry.strategy] * factor).toFixed(2)));
    return {
      strategy: entry.strategy,
      description: entry.description,
      applicability: confidence,
      confidence,
      actions: entry.actions.map((action, index) => ({
        step: index + 1,
        action: action.action,
        expectedOutcome: action.expectedOutcome,
        riskLevel: action.riskLevel,
        timeline: index === 0 ? '0-7 days' : '7-21 days',
      })),
    };
  });
}

function createGameTheory(input: StrategyInput): GameTheoryScenario[] {
  const assertive =
    input.riskTolerance === 'high'
      ? [7, 2, 8, 3]
      : input.riskTolerance === 'low'
        ? [6, 3, 6, 4]
        : [7, 2, 7, 3];

  return [
    {
      name: 'Early Settlement Signaling Game',
      description: 'Assess whether signaling readiness for trial improves settlement terms.',
      probability: 0.58,
      payoff: {
        cooperateCooperate: assertive[0],
        cooperateDefect: assertive[1],
        defectCooperate: assertive[2],
        defectDefect: assertive[3],
      },
      nashEquilibrium: {
        ourStrategy: 'credible-trial-readiness',
        opponentStrategy: 'conditional-negotiation',
        isStable: true,
        explanation:
          'Opponent minimizes downside by negotiating once trial readiness appears credible.',
      },
    },
    {
      name: 'Interim Relief Pressure Game',
      description: 'Model impact of seeking urgent relief versus waiting for full hearing.',
      probability: 0.66,
      payoff: {
        cooperateCooperate: 6,
        cooperateDefect: 2,
        defectCooperate: 8,
        defectDefect: 3,
      },
      nashEquilibrium: {
        ourStrategy: 'file-early-interim-motion',
        opponentStrategy: 'seek-adjournment',
        isStable: true,
        explanation: 'Procedural initiative usually shifts bargaining power before trial merits.',
      },
    },
  ];
}

function createOpponentPredictions(input: StrategyInput): OpponentPrediction[] {
  const objectiveHint = input.objective.toLowerCase();
  const mayDelay = objectiveHint.includes('injunction') || objectiveHint.includes('stay');

  return [
    {
      move: 'Delay through adjournments and procedural objections',
      probability: mayDelay ? 0.72 : 0.55,
      counterStrategy: 'Prepare objection grid and seek cost-backed timelines from court.',
      reasoning:
        'Delay is often rational for opponents when merits are weak and time improves their leverage.',
    },
    {
      move: 'Challenge maintainability and jurisdiction',
      probability: 0.61,
      counterStrategy: 'Front-load maintainability arguments with compact authority table.',
      reasoning: 'Early maintainability attacks can shrink your relief window if unanswered.',
    },
    {
      move: 'Offer late settlement after partial concessions',
      probability: 0.49,
      counterStrategy: 'Use quantified BATNA and insist on enforceable milestones.',
      reasoning: 'Late concessions are typically used to cap downside after interim setbacks.',
    },
  ];
}

function choosePrimary(analyses: ChanakyaAnalysis[]): ChanakyaAnalysis {
  return analyses.reduce((best, current) => {
    return current.applicability > best.applicability ? current : best;
  });
}

function recommendationFromAnalyses(
  analyses: ChanakyaAnalysis[],
  objective: string
): StrategyRecommendation {
  const primaryAnalysis = choosePrimary(analyses);

  const primary: StrategyOption = {
    name: `Primary: ${primaryAnalysis.strategy.toUpperCase()} track`,
    description: primaryAnalysis.description,
    chanakyaPillar: primaryAnalysis.strategy,
    steps: primaryAnalysis.actions.map((a) => `${a.step}. ${a.action}`),
    expectedOutcome: `Aligned with objective: ${objective}`,
    timeEstimate: '2-6 weeks',
    riskLevel: primaryAnalysis.actions.some((a) => a.riskLevel === 'high') ? 'high' : 'medium',
  };

  const alternatives = analyses
    .filter((item) => item.strategy !== primaryAnalysis.strategy)
    .slice(0, 2)
    .map<StrategyOption>((item) => ({
      name: `Alternative: ${item.strategy.toUpperCase()} track`,
      description: item.description,
      chanakyaPillar: item.strategy,
      steps: item.actions.map((a) => `${a.step}. ${a.action}`),
      expectedOutcome: 'Provides fallback pathway if primary assumptions fail.',
      timeEstimate: '3-8 weeks',
      riskLevel: item.actions.some((a) => a.riskLevel === 'high') ? 'high' : 'medium',
    }));

  return {
    primary,
    alternatives,
    confidence: primaryAnalysis.confidence,
    riskLevel: primary.riskLevel,
    reasoning:
      'Primary option selected by combining Chanakya applicability, litigation timing leverage, and opponent response forecast.',
  };
}

function parseModelRecommendation(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 6);
}

export async function analyzeStrategy(input: StrategyInput): Promise<StrategyAnalysis> {
  const chanakyaAnalysis = createChanakyaAnalyses(input);
  const gameTheoryAnalysis = createGameTheory(input);
  const opponentPredictions = createOpponentPredictions(input);
  const recommendation = recommendationFromAnalyses(chanakyaAnalysis, input.objective);

  const llmEnhancement = await invokeModel({
    temperature: 0.2,
    maxTokens: 450,
    prompt: [
      'You are a senior Indian litigation strategist.',
      'Refine this strategy into concise tactical bullet points (max 6).',
      `Case Title: ${input.caseData.title}`,
      `Case Type: ${input.caseData.caseType}`,
      `Objective: ${input.objective}`,
      `Facts: ${input.facts}`,
      `Primary Strategy: ${recommendation.primary.description}`,
    ].join('\n'),
  });

  if (llmEnhancement) {
    recommendation.primary.steps = [
      ...recommendation.primary.steps,
      ...parseModelRecommendation(llmEnhancement),
    ].slice(0, 8);
  }

  const confidence = Number(
    (
      (recommendation.confidence +
        gameTheoryAnalysis.reduce((sum, item) => sum + item.probability, 0) /
          gameTheoryAnalysis.length) /
      2
    ).toFixed(2)
  );

  return {
    id: uuidv4(),
    caseId: input.caseData.id,
    chanakyaAnalysis,
    gameTheoryAnalysis,
    opponentPredictions,
    recommendedStrategy: recommendation,
    confidence,
    createdAt: Date.now(),
  };
}
