import { parseJSON } from '@/lib/utils';
import type { Petition, PetitionContent, Citation } from '@/types/petition';
import type {
  StrategyAnalysis,
  ChanakyaAnalysis,
  GameTheoryScenario,
  OpponentPrediction,
  StrategyRecommendation,
} from '@/types/strategy';
import type { WarRoomConfig } from '@/types/agent';

export function serializePetitionContent(content: PetitionContent): string {
  return JSON.stringify(content);
}

export function serializeCitations(citations: Citation[]): string {
  return JSON.stringify(citations);
}

export function parsePetitionContent(value: string | null): PetitionContent {
  return (
    parseJSON<PetitionContent>(value, {
      sections: [],
      prayer: '',
      verification: '',
      fullText: '',
    }) ?? {
      sections: [],
      prayer: '',
      verification: '',
      fullText: '',
    }
  );
}

export function parseCitations(value: string | null): Citation[] {
  return parseJSON<Citation[]>(value, []) ?? [];
}

export function deserializePetitionRow(row: {
  id: string;
  caseId: string | null;
  petitionType: Petition['petitionType'];
  court: string | null;
  title: string;
  content: string | null;
  citations: string | null;
  status: Petition['status'];
  generatedAt: Date;
  updatedAt: Date;
}): Petition {
  return {
    id: row.id,
    caseId: row.caseId,
    petitionType: row.petitionType,
    court: row.court,
    title: row.title,
    content: parsePetitionContent(row.content),
    citations: parseCitations(row.citations),
    status: row.status,
    generatedAt: row.generatedAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

export function serializeStrategyAnalysis(analysis: StrategyAnalysis) {
  return {
    chanakyaAnalysis: JSON.stringify(analysis.chanakyaAnalysis),
    gameTheoryAnalysis: JSON.stringify(analysis.gameTheoryAnalysis),
    opponentPredictions: JSON.stringify(analysis.opponentPredictions),
    recommendedStrategy: JSON.stringify(analysis.recommendedStrategy),
  };
}

export function deserializeStrategyRow(row: {
  id: string;
  caseId: string;
  chanakyaAnalysis: string | null;
  gameTheoryAnalysis: string | null;
  opponentPredictions: string | null;
  recommendedStrategy: string | null;
  confidence: number;
  createdAt: Date;
}): StrategyAnalysis {
  return {
    id: row.id,
    caseId: row.caseId,
    chanakyaAnalysis: parseJSON<ChanakyaAnalysis[]>(row.chanakyaAnalysis, []) ?? [],
    gameTheoryAnalysis: parseJSON<GameTheoryScenario[]>(row.gameTheoryAnalysis, []) ?? [],
    opponentPredictions: parseJSON<OpponentPrediction[]>(row.opponentPredictions, []) ?? [],
    recommendedStrategy:
      parseJSON<StrategyRecommendation>(row.recommendedStrategy) ??
      ({
        primary: {
          name: 'Awaiting analysis',
          description: 'No recommendation yet.',
          chanakyaPillar: 'saam',
          steps: [],
          expectedOutcome: 'Unknown',
          timeEstimate: 'Unknown',
          riskLevel: 'medium',
        },
        alternatives: [],
        reasoning: 'No reasoning available.',
        confidence: 0,
        riskLevel: 'medium',
      } as StrategyRecommendation),
    confidence: row.confidence,
    createdAt: row.createdAt.getTime(),
  };
}

export function parseWarRoomConfig(config: string | null): WarRoomConfig {
  return (
    parseJSON<WarRoomConfig>(config, {
      activeClusters: ['prosecution', 'defense', 'judicial', 'strategy'],
      maxDebateRounds: 3,
      enableChanakyaStrategy: true,
      enableGameTheory: true,
      temperature: 0.4,
      focusAreas: [],
      llmProvider: 'openai',
      llmModel: 'gpt-4o-mini',
    }) ?? {
      activeClusters: ['prosecution', 'defense', 'judicial', 'strategy'],
      maxDebateRounds: 3,
      enableChanakyaStrategy: true,
      enableGameTheory: true,
      temperature: 0.4,
      focusAreas: [],
      llmProvider: 'openai',
      llmModel: 'gpt-4o-mini',
    }
  );
}
