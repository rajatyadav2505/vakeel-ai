import type { Citation } from '@nyaya/shared';
import { z } from 'zod';
import { invokeJsonModel, type RuntimeLlmConfig } from './llm';
import {
  buildLegalResearchPacket,
  legalGroundingStatus,
  legalResearchPacketToCitations,
  summarizePacketForPrompt,
  verifyLegalClaims,
} from './legal-research';

export interface SingleAgentInput {
  caseId: string;
  objective: string;
  facts: string;
  forum?: string | null;
  jurisdiction?: string | null;
  reliefSought?: string | null;
  parsedDocumentTexts?: string[];
  voiceTranscript?: string | null;
  outputLanguage?: 'en-IN' | 'hi-IN';
  llmConfig?: RuntimeLlmConfig;
}

export interface SingleAgentOutput {
  caseId: string;
  analysis: string;
  confidence: number;
  citations: Citation[];
  legalResearchPacket?: Awaited<ReturnType<typeof buildLegalResearchPacket>>;
  groundedLegalClaims?: ReturnType<typeof verifyLegalClaims>;
  legalGroundingStatus?: 'complete' | 'incomplete';
}

const singleAgentResponseSchema = z.object({
  analysis: z.string().min(20).optional(),
  confidence: z.number().finite().min(0).max(1).optional(),
});

export async function runSingleAgentSimulation(
  input: SingleAgentInput
): Promise<SingleAgentOutput> {
  const outputLanguage = input.outputLanguage ?? 'en-IN';
  const languageInstruction =
    outputLanguage === 'hi-IN'
      ? 'Write analysis in professional Hindi (Devanagari script) suitable for Indian legal practice.'
      : 'Write analysis in professional English suitable for Indian legal practice.';

  const legalResearchPacket = await buildLegalResearchPacket({
    caseId: input.caseId,
    summary: input.facts,
    objective: input.objective,
    forum: input.forum ?? null,
    jurisdiction: input.jurisdiction ?? null,
    reliefSought: input.reliefSought ?? null,
    parsedDocumentTexts: input.parsedDocumentTexts ?? [],
    voiceTranscript: input.voiceTranscript ?? null,
    ...(input.llmConfig ? { llmConfig: input.llmConfig } : {}),
  });
  const citations = legalResearchPacketToCitations(legalResearchPacket);

  const llm = await invokeJsonModel({
    systemPrompt:
      [
        'You are a senior Indian litigation strategist.',
        'Return strict JSON with "analysis" and "confidence" in [0,1].',
        'Do not assert legal propositions unless supported by provided authorities.',
        languageInstruction,
      ].join(' '),
    userPrompt: [
      `Objective: ${input.objective}`,
      `Facts: ${input.facts}`,
      `Legal packet:\n${summarizePacketForPrompt(legalResearchPacket)}`,
      `Authority hints: ${citations.map((item) => item.title).join(' | ') || 'none'}`,
      'Output format: {"analysis":"...", "confidence":0.74}',
    ].join('\n'),
    temperature: 0.3,
    maxTokens: 700,
    schema: singleAgentResponseSchema,
    ...(input.llmConfig ? { llmConfig: input.llmConfig } : {}),
  });

  const confidence =
    typeof llm?.confidence === 'number' && Number.isFinite(llm.confidence)
      ? Math.min(0.97, Math.max(0.2, Number(llm.confidence.toFixed(2))))
      : citations.length > 0
        ? 0.72
        : 0.58;
  const analysis =
    typeof llm?.analysis === 'string' && llm.analysis.trim().length > 20
      ? llm.analysis.trim()
      : outputLanguage === 'hi-IN'
        ? 'प्रारंभिक रणनीति में साक्ष्य श्रृंखला सुरक्षित रखना, शीघ्र अंतरिम राहत मांगना और समय-सीमा अनुशासन लागू करना शामिल है। सत्यापित प्राधिकरण के बिना किसी विधिक दावे पर कार्रवाई न करें।'
        : 'Initial strategy recommends preserving evidence chain, seeking early interim protection, and forcing timeline discipline. No unsupported legal proposition should be acted upon without verified authorities.';

  const legalClaims = verifyLegalClaims({
    claims: [
      {
        statement: analysis,
        issueTag: legalResearchPacket.issuesIdentified[0] ?? 'general',
      },
    ],
    packet: legalResearchPacket,
  });

  return {
    caseId: input.caseId,
    analysis,
    confidence,
    citations,
    legalResearchPacket,
    groundedLegalClaims: legalClaims,
    legalGroundingStatus: legalGroundingStatus(legalResearchPacket, 0.55),
  };
}
