import {
  CHANAKYA_PRINCIPLES,
  calculateExpectedUtility,
  monteCarloBranchScore,
  solveNashHeuristic,
  type Citation,
} from '@nyaya/shared';
import { getAgentsEnv } from './env';

const KANOON_API_BASE = 'https://api.indiankanoon.org';

export interface KanoonSearchParams {
  query: string;
  page?: number;
  maxResults?: number;
  titleHint?: string | null;
}

export interface KanoonSearchHit {
  tid: string;
  title: string;
  headline: string;
  url: string;
  rank: number;
  docType?: string;
  court?: string;
  date?: string;
}

export interface KanoonDocumentFragment {
  tid: string;
  text: string;
  paragraphRefs: number[];
  pageRefs: number[];
}

export interface KanoonDocumentMeta {
  tid: string;
  court?: string;
  bench?: string;
  date?: string;
  citationText?: string;
  citedByCount?: number;
}

function kanoonHeaders() {
  const token = getAgentsEnv().INDIANKANOON_API_TOKEN;
  return token ? { Authorization: `Token ${token}` } : {};
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asRecord(item)).filter((item): item is Record<string, unknown> => Boolean(item));
}

function pickString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

function pickNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

async function safeKanoonJson(path: string) {
  try {
    const response = await fetch(`${KANOON_API_BASE}${path}`, {
      headers: kanoonHeaders(),
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function collectText(value: unknown): string[] {
  if (typeof value === 'string') return [stripHtml(value)];
  if (Array.isArray(value)) return value.flatMap((item) => collectText(item));
  const record = asRecord(value);
  if (!record) return [];
  return Object.values(record).flatMap((item) => collectText(item));
}

function collectNumbers(value: unknown): number[] {
  if (typeof value === 'number' && Number.isFinite(value)) return [value];
  if (typeof value === 'string') {
    return Array.from(value.matchAll(/\d+/g))
      .map((match) => Number(match[0]))
      .filter((item) => Number.isFinite(item));
  }
  if (Array.isArray(value)) return value.flatMap((item) => collectNumbers(item));
  const record = asRecord(value);
  if (!record) return [];
  return Object.values(record).flatMap((item) => collectNumbers(item));
}

export async function searchKanoonDetailed(params: KanoonSearchParams): Promise<KanoonSearchHit[]> {
  const query = params.query.trim();
  if (!query) return [];

  const search = new URLSearchParams({
    formInput: query,
    pagenum: String(params.page ?? 0),
  });
  if (params.titleHint?.trim()) search.set('title', params.titleHint.trim());

  const payload = await safeKanoonJson(`/search/?${search.toString()}`);
  const root = asRecord(payload);
  if (!root) return [];

  const docs = asRecordArray(root.docs);
  return docs.slice(0, params.maxResults ?? 5).map((doc, index) => {
    const tid = pickString(doc, ['tid', 'id', 'docid']) ?? `unknown-${index}`;
    const title = pickString(doc, ['title', 'doc_title']) ?? `Indian Kanoon result ${index + 1}`;
    const headline = stripHtml(
      pickString(doc, ['headline', 'fragment', 'snippet']) ?? 'Relevant precedent from Indian Kanoon search.'
    );
    const docType = pickString(doc, ['doctype', 'docsource', 'source']);
    const court = pickString(doc, ['court', 'courtname']);
    const date = pickString(doc, ['publishdate', 'date']);
    return {
      tid,
      title,
      headline,
      url: `https://indiankanoon.org/doc/${tid}/`,
      rank: index + 1,
      ...(docType ? { docType } : {}),
      ...(court ? { court } : {}),
      ...(date ? { date } : {}),
    };
  });
}

export async function fetchKanoonDocumentFragment(
  tid: string,
  query: string
): Promise<KanoonDocumentFragment | null> {
  const docId = tid.trim();
  const search = query.trim();
  if (!docId || !search) return null;

  const payload = await safeKanoonJson(
    `/docfragment/${encodeURIComponent(docId)}/?formInput=${encodeURIComponent(search)}`
  );
  const root = asRecord(payload);
  if (!root) return null;

  const textCandidates = [
    ...collectText(root.docfragment),
    ...collectText(root.fragment),
    ...collectText(root.fragments),
    ...collectText(root.headline),
    ...collectText(root.text),
  ].filter(Boolean);
  const paragraphRefs = Array.from(new Set(collectNumbers(root.paragraphs ?? root.paras ?? root.paragraphRefs))).slice(
    0,
    8
  );
  const pageRefs = Array.from(new Set(collectNumbers(root.pages ?? root.pageRefs))).slice(0, 8);
  const text = textCandidates.find((item) => item.length > 40) ?? textCandidates[0] ?? '';

  if (!text) return null;
  return {
    tid: docId,
    text,
    paragraphRefs,
    pageRefs,
  };
}

export async function fetchKanoonDocumentMeta(tid: string): Promise<KanoonDocumentMeta | null> {
  const docId = tid.trim();
  if (!docId) return null;

  const payload = await safeKanoonJson(`/docmeta/${encodeURIComponent(docId)}/`);
  const root = asRecord(payload);
  if (!root) return null;

  const citationText = [
    pickString(root, ['citation', 'citations', 'neutral_citation']),
    ...collectText(root.equivalent_citations).slice(0, 2),
  ]
    .filter((item): item is string => Boolean(item))
    .join('; ');
  const citedByCount =
    pickNumber(root, ['citedby_count', 'citedByCount', 'numcites']) ??
    asRecordArray(root.citedby).length ??
    undefined;
  const court = pickString(root, ['court', 'docsource', 'courtname']);
  const bench = pickString(root, ['bench', 'author', 'judge']);
  const date = pickString(root, ['publishdate', 'date']);

  return {
    tid: docId,
    ...(court ? { court } : {}),
    ...(bench ? { bench } : {}),
    ...(date ? { date } : {}),
    ...(citationText ? { citationText } : {}),
    ...(typeof citedByCount === 'number' ? { citedByCount } : {}),
  };
}

export async function searchKanoon(query: string): Promise<Citation[]> {
  const hits = await searchKanoonDetailed({ query, maxResults: 5 });
  return hits.map((doc, index) => ({
      id: `k-${doc.tid}`,
      title: doc.title,
      source: 'indiankanoon',
      url: doc.url,
      excerpt: doc.headline || 'Relevant precedent from Indian Kanoon search.',
      confidence: Number((0.8 - index * 0.05).toFixed(2)),
    }));
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
