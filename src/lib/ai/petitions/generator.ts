import { v4 as uuidv4 } from 'uuid';
import type { Case } from '@/types/case';
import type {
  Citation,
  Petition,
  PetitionContent,
  PetitionGenerationRequest,
  PetitionSection,
} from '@/types/petition';
import { buildPetitionTemplate } from '@/lib/legal/templates';
import { findRelevantAuthorities } from '@/lib/legal/precedents';
import { invokeModel } from '@/lib/ai/shared/llm';

function buildCitations(params: {
  petitionType: PetitionGenerationRequest['petitionType'];
  caseType?: string;
  facts: string;
  legalGrounds: string;
}): Citation[] {
  const authorities = findRelevantAuthorities({
    petitionType: params.petitionType,
    caseType: params.caseType,
    facts: params.facts,
    legalGrounds: params.legalGrounds,
    limit: 8,
  });

  const statuteCitations: Citation[] = authorities.statutes.map((item) => ({
    caseTitle: `${item.statute} ${item.section}`,
    citation: item.section,
    court: 'Statute',
    year: new Date().getFullYear(),
    relevance: item.gist,
    paragraph: 'Statutory grounding for maintainability and relief.',
  }));

  const precedentCitations: Citation[] = authorities.precedents.map((item) => ({
    caseTitle: item.caseTitle,
    citation: item.citation,
    court: item.court,
    year: item.year,
    relevance: item.ratio,
    paragraph: 'Supports core legal proposition in grounds.',
  }));

  return [...precedentCitations, ...statuteCitations].slice(0, 10);
}

function assembleSections(params: {
  request: PetitionGenerationRequest;
  caseData?: Case | null;
  citations: Citation[];
}): PetitionSection[] {
  const template = buildPetitionTemplate(params.request.petitionType, params.request.court);
  const citationDigest = params.citations
    .slice(0, 4)
    .map((citation) => `${citation.caseTitle} (${citation.citation})`)
    .join('; ');

  return template.sections.map((section) => {
    if (section.heading.toLowerCase().includes('facts')) {
      return {
        heading: section.heading,
        order: section.order,
        content: params.request.facts,
      };
    }

    if (section.heading.toLowerCase().includes('grounds')) {
      return {
        heading: section.heading,
        order: section.order,
        content: `${params.request.legalGrounds}\n\nKey Authorities: ${citationDigest}`,
      };
    }

    if (section.heading.toLowerCase().includes('interim')) {
      return {
        heading: section.heading,
        order: section.order,
        content:
          'Interim protection is necessary to prevent irreversible prejudice pending final adjudication.',
      };
    }

    if (section.heading.toLowerCase().includes('public importance')) {
      return {
        heading: section.heading,
        order: section.order,
        content:
          params.request.additionalContext ??
          'The matter affects similarly situated citizens and requires institutional corrective directions.',
      };
    }

    return {
      heading: section.heading,
      order: section.order,
      content:
        params.request.additionalContext ??
        `Draft this section for ${params.request.petitionType} before ${params.request.court}.`,
    };
  });
}

function buildFullText(params: {
  title: string;
  sections: PetitionSection[];
  prayer: string;
  verification: string;
}): string {
  const parts = [`IN THE HON'BLE COURT\n\n${params.title}\n`];

  for (const section of params.sections.sort((a, b) => a.order - b.order)) {
    parts.push(`\n${section.heading.toUpperCase()}\n${section.content}\n`);
  }

  parts.push(`\nPRAYER\n${params.prayer}\n`);
  parts.push(`\nVERIFICATION\n${params.verification}\n`);

  return parts.join('\n');
}

function validationChecklist(citations: Citation[]): string {
  const recency = citations.filter((citation) => citation.year >= 2010).length;
  return recency >= 2
    ? 'Authorities include contemporary Supreme Court guidance and statutory provisions.'
    : 'Consider adding at least two recent authorities before final filing.';
}

export async function generatePetitionDraft(params: {
  request: PetitionGenerationRequest;
  caseData?: Case | null;
}): Promise<Petition> {
  const citations = buildCitations({
    petitionType: params.request.petitionType,
    caseType: params.caseData?.caseType,
    facts: params.request.facts,
    legalGrounds: params.request.legalGrounds,
  });

  const sections = assembleSections({
    request: params.request,
    caseData: params.caseData,
    citations,
  });

  const prayer = params.request.reliefSought;
  const verification = [
    'I, the Petitioner above named, do hereby verify that the contents of this petition are true and correct to my knowledge and belief.',
    validationChecklist(citations),
  ].join(' ');

  const llmRewrite = await invokeModel({
    temperature: 0.15,
    maxTokens: 700,
    prompt: [
      'Rewrite the following Indian legal petition sections in formal court language.',
      'Preserve facts and relief exactly. Keep response concise and structured in numbered bullets.',
      `Court: ${params.request.court}`,
      `Petition Type: ${params.request.petitionType}`,
      `Facts: ${params.request.facts}`,
      `Grounds: ${params.request.legalGrounds}`,
      `Prayer: ${params.request.reliefSought}`,
    ].join('\n'),
  });

  if (llmRewrite) {
    sections.push({
      heading: 'AI Draft Refinement',
      order: sections.length + 1,
      content: llmRewrite,
    });
  }

  const content: PetitionContent = {
    sections,
    prayer,
    verification,
    fullText: buildFullText({
      title: params.request.title,
      sections,
      prayer,
      verification,
    }),
  };

  return {
    id: uuidv4(),
    caseId: params.request.caseId ?? null,
    petitionType: params.request.petitionType,
    court: params.request.court,
    title: params.request.title,
    content,
    citations,
    status: 'draft',
    generatedAt: Date.now(),
    updatedAt: Date.now(),
  };
}
