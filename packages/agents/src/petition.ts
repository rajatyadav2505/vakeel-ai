import type { Citation, GroundedLegalClaim, LegalResearchPacket, PrecedentAuthority, StatutoryAuthority } from '@nyaya/shared';
import { requireLawyerVerification } from '@nyaya/shared';
import { invokeJsonModel, type RuntimeLlmConfig } from './llm';
import {
  buildLegalResearchPacket,
  legalGroundingStatus,
  legalResearchPacketToCitations,
  summarizePacketForPrompt,
  verifyLegalClaims,
} from './legal-research';

export interface PetitionToolInput {
  caseId: string;
  petitionType: string;
  courtTemplate: 'district' | 'high_court' | 'supreme_court';
  facts: string;
  legalGrounds: string;
  reliefSought: string;
  forum?: string | null;
  jurisdiction?: string | null;
  parsedDocumentTexts?: string[];
  voiceTranscript?: string | null;
  lawyerVerified: boolean;
  llmConfig?: RuntimeLlmConfig;
}

export interface PetitionToolOutput {
  title: string;
  body: string;
  citations: Citation[];
  confidence: number;
  legalResearchPacket: LegalResearchPacket;
  statutoryAuthorities: StatutoryAuthority[];
  leadingPrecedents: PrecedentAuthority[];
  latestPrecedents: PrecedentAuthority[];
  groundedLegalClaims: GroundedLegalClaim[];
  unverifiedClaims: GroundedLegalClaim[];
  legalGroundingStatus: 'complete' | 'incomplete';
}

export async function generateFormattedPetition(
  input: PetitionToolInput
): Promise<PetitionToolOutput> {
  requireLawyerVerification(input.lawyerVerified);

  const legalResearchPacket = await buildLegalResearchPacket({
    caseId: input.caseId,
    summary: `${input.facts}\n\n${input.legalGrounds}`,
    objective: `${input.petitionType} petition drafting`,
    reliefSought: input.reliefSought,
    forum: input.forum ?? input.courtTemplate,
    jurisdiction: input.jurisdiction ?? null,
    parsedDocumentTexts: input.parsedDocumentTexts ?? [],
    voiceTranscript: input.voiceTranscript ?? null,
    ...(input.llmConfig ? { llmConfig: input.llmConfig } : {}),
  });
  const citations = legalResearchPacketToCitations(legalResearchPacket);
  const mustCiteStatutes = legalResearchPacket.statutoryAuthorities.slice(0, 4);
  const mustCitePrecedents = legalResearchPacket.leadingPrecedents.slice(0, 4);
  const supportingAuthorities = legalResearchPacket.latestPrecedents.slice(0, 5);

  const fallbackTitle = `Draft ${input.petitionType.replace('_', ' ')} petition`;
  const fallbackBody = [
    `IN THE HON'BLE ${input.courtTemplate.replace('_', ' ').toUpperCase()} COURT`,
    '',
    'FACTS',
    input.facts,
    '',
    'GROUNDS',
    input.legalGrounds,
    '',
    'STATUTORY BASIS',
    mustCiteStatutes.length
      ? mustCiteStatutes.map((item) => `- ${item.title} (${item.sourceUrl})`).join('\n')
      : '- [NO VERIFIED STATUTORY AUTHORITY FOUND]',
    '',
    'PRECEDENT SUPPORT',
    mustCitePrecedents.length
      ? mustCitePrecedents
          .map((item) => `- ${item.caseName} (${item.court}, ${item.date}) - ${item.sourceUrl}`)
          .join('\n')
      : '- [NO VERIFIED PRECEDENT FOUND]',
    '',
    'LATEST PRECEDENTS CHECKED',
    supportingAuthorities.length
      ? supportingAuthorities
          .map((item) => `- ${item.caseName} (${item.date}) - ${item.sourceUrl}`)
          .join('\n')
      : `- [NO VERIFIED RECENT PRECEDENT FOUND] (checked ${legalResearchPacket.precedentsCheckedAt})`,
    '',
    'PRAYER',
    input.reliefSought,
    '',
    'VERIFICATION',
    'This draft is AI-assisted. Licensed advocate review is mandatory before filing.',
  ].join('\n');

  const llm = await invokeJsonModel<{ title?: string; body?: string; confidence?: number }>({
    systemPrompt: [
      'You draft Indian legal petitions.',
      'Return strict JSON with keys: title, body, confidence.',
      'Body must include sections FACTS, GROUNDS, STATUTORY BASIS, PRECEDENT SUPPORT, LATEST PRECEDENTS CHECKED, PRAYER, VERIFICATION.',
      'No legal proposition without authority.',
      'No invented sections or case citations.',
      'If authority is missing, explicitly write: [NO VERIFIED AUTHORITY FOUND - NEEDS HUMAN VERIFICATION].',
    ].join(' '),
    userPrompt: [
      `Petition type: ${input.petitionType}`,
      `Court template: ${input.courtTemplate}`,
      `Facts: ${input.facts}`,
      `Legal grounds: ${input.legalGrounds}`,
      `Relief sought: ${input.reliefSought}`,
      `Legal research packet:\n${summarizePacketForPrompt(legalResearchPacket)}`,
      `Must-cite statutes:\n${mustCiteStatutes.map((item) => `- ${item.title} (${item.sourceUrl})`).join('\n') || '- none'}`,
      `Must-cite leading precedents:\n${mustCitePrecedents.map((item) => `- ${item.caseName} (${item.court}, ${item.date}) (${item.sourceUrl})`).join('\n') || '- none'}`,
      `Supporting latest precedents:\n${supportingAuthorities.map((item) => `- ${item.caseName} (${item.date}) (${item.sourceUrl})`).join('\n') || '- none'}`,
      'Output format: {"title":"...","body":"...","confidence":0.8}',
    ].join('\n'),
    temperature: 0.25,
    maxTokens: 1800,
    ...(input.llmConfig ? { llmConfig: input.llmConfig } : {}),
  });

  const title =
    typeof llm?.title === 'string' && llm.title.trim().length > 5 ? llm.title.trim() : fallbackTitle;
  const body =
    typeof llm?.body === 'string' && llm.body.includes('VERIFICATION') ? llm.body : fallbackBody;
  const confidence =
    typeof llm?.confidence === 'number' && Number.isFinite(llm.confidence)
      ? Math.min(0.98, Math.max(0.25, Number(llm.confidence.toFixed(2))))
      : citations.length
        ? 0.78
        : 0.61;

  const groundedClaims = verifyLegalClaims({
    claims: [
      {
        statement: input.legalGrounds,
        issueTag: legalResearchPacket.issuesIdentified[0] ?? 'general',
      },
      {
        statement: input.reliefSought,
        issueTag: legalResearchPacket.issuesIdentified[1] ?? legalResearchPacket.issuesIdentified[0] ?? 'general',
      },
    ],
    packet: legalResearchPacket,
  });
  const unverifiedClaims = groundedClaims.filter((item) => !item.verified);
  const groundingStatus = legalGroundingStatus(legalResearchPacket, 0.55);

  const finalBody =
    groundingStatus === 'complete' && unverifiedClaims.length === 0
      ? body
      : [
          body,
          '',
          'AUTHORITY COVERAGE WARNING',
          `- authorityCoverageScore: ${legalResearchPacket.authorityCoverageScore}`,
          `- precedentsCheckedAt: ${legalResearchPacket.precedentsCheckedAt}`,
          ...unverifiedClaims.map((item) => `- ${item.statement}: ${item.unverifiedReason}`),
          '- [INCOMPLETE LEGAL GROUNDING - HUMAN ADVOCATE VERIFICATION REQUIRED]',
        ].join('\n');

  return {
    title,
    body: finalBody,
    citations,
    confidence,
    legalResearchPacket,
    statutoryAuthorities: legalResearchPacket.statutoryAuthorities,
    leadingPrecedents: legalResearchPacket.leadingPrecedents,
    latestPrecedents: legalResearchPacket.latestPrecedents,
    groundedLegalClaims: groundedClaims.filter((item) => item.verified),
    unverifiedClaims,
    legalGroundingStatus: groundingStatus,
  };
}
