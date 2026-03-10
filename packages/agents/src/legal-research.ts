import { createHash } from 'crypto';
import type {
  AuthoritySource,
  ConflictAuthority,
  GroundedLegalClaim,
  LegalResearchPacket,
  PrecedentAuthority,
  StatutoryAuthority,
  Citation,
} from '@nyaya/shared';
import { z } from 'zod';
import { invokeJsonModel, type RuntimeLlmConfig } from './llm';
import { searchKanoon } from './tools';

const STATUTES_TTL_MS = 24 * 60 * 60 * 1000;
const LEADING_PRECEDENTS_TTL_MS = 6 * 60 * 60 * 1000;
const LATEST_PRECEDENTS_TTL_MS = 30 * 60 * 1000;
const DEFAULT_LATEST_LOOKBACK_MONTHS = 24;
const issueRefinementSchema = z.object({
  issues: z.array(z.string().min(1)).max(20).optional(),
});

interface CachedStatutes {
  fetchedAt: number;
  data: StatutoryAuthority[];
}

interface CachedPrecedents {
  fetchedAt: number;
  leading: PrecedentAuthority[];
  latest: PrecedentAuthority[];
  conflicts: ConflictAuthority[];
  precedentsCheckedAt: string;
}

interface CachedResearchEntry {
  statutes?: CachedStatutes;
  precedents?: CachedPrecedents;
}

const RESEARCH_CACHE = new Map<string, CachedResearchEntry>();

export interface LegalResearchInput {
  caseId: string;
  summary: string;
  objective?: string;
  userQuery?: string;
  forum?: string | null;
  jurisdiction?: string | null;
  state?: string | null;
  courtLevel?: string | null;
  reliefSought?: string | null;
  parsedDocumentTexts?: string[];
  voiceTranscript?: string | null;
  extractedFacts?: string[];
  latestLookbackMonths?: number;
  llmConfig?: RuntimeLlmConfig;
}

interface IssuePattern {
  tag: string;
  patterns: RegExp[];
  acts: string[];
}

interface ParsedSignals {
  combinedText: string;
  issues: string[];
  acts: string[];
  sections: string[];
  proceduralPosture: string | null;
  reliefType: string | null;
}

interface StatuteAdapterInput {
  queries: string[];
  issues: string[];
  acts: string[];
  sections: string[];
  jurisdiction: string | null;
  forum: string | null;
  combinedText: string;
}

interface PrecedentAdapterInput {
  queries: string[];
  issues: string[];
  acts: string[];
  sections: string[];
  jurisdiction: string | null;
  forum: string | null;
  combinedText: string;
  checkedAt: string;
  lookbackMonths: number;
}

export interface StatuteSourceAdapter {
  id: string;
  search(input: StatuteAdapterInput): Promise<StatutoryAuthority[]>;
}

export interface PrecedentSourceAdapter {
  id: string;
  search(input: PrecedentAdapterInput): Promise<PrecedentAuthority[]>;
}

const ISSUE_PATTERNS: IssuePattern[] = [
  {
    tag: 'cheque_bounce',
    patterns: [/\bcheque\b/i, /\bsection\s*138\b/i, /\bni act\b/i, /\bnegotiable instruments\b/i],
    acts: ['Negotiable Instruments Act, 1881'],
  },
  {
    tag: 'consumer_dispute',
    patterns: [/\bconsumer\b/i, /\bdeficiency\b/i, /\bunfair trade\b/i],
    acts: ['Consumer Protection Act, 2019'],
  },
  {
    tag: 'injunction_relief',
    patterns: [/\binjunction\b/i, /\bstay\b/i, /\bstatus quo\b/i],
    acts: ['Specific Relief Act, 1963', 'Code of Civil Procedure, 1908'],
  },
  {
    tag: 'arbitration',
    patterns: [/\barbitration\b/i, /\barbitral\b/i, /\bsection\s*9\b/i],
    acts: ['Arbitration and Conciliation Act, 1996'],
  },
  {
    tag: 'employment_dues',
    patterns: [/\bemployment\b/i, /\btermination\b/i, /\bgratuity\b/i, /\bwage\b/i],
    acts: ['Industrial Disputes Act, 1947', 'Payment of Wages Act, 1936'],
  },
  {
    tag: 'property_dispute',
    patterns: [/\bproperty\b/i, /\btitle\b/i, /\bpossession\b/i, /\bsale deed\b/i],
    acts: ['Transfer of Property Act, 1882', 'Specific Relief Act, 1963'],
  },
  {
    tag: 'limitation',
    patterns: [/\blimitation\b/i, /\bdelay condonation\b/i, /\bsection\s*5\b/i],
    acts: ['Limitation Act, 1963'],
  },
  {
    tag: 'jurisdiction',
    patterns: [/\bjurisdiction\b/i, /\bterritorial\b/i, /\bpecuniary\b/i],
    acts: ['Code of Civil Procedure, 1908'],
  },
  {
    tag: 'bail',
    patterns: [/\bbail\b/i, /\banticipatory bail\b/i, /\bsection\s*438\b/i],
    acts: ['Code of Criminal Procedure, 1973'],
  },
];

const COURT_PRIORITY: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /supreme court/i, score: 1 },
  { pattern: /constitutional bench/i, score: 0.98 },
  { pattern: /high court/i, score: 0.87 },
  { pattern: /tribunal/i, score: 0.72 },
  { pattern: /district/i, score: 0.62 },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function splitTokens(input: string) {
  return normalizeText(input)
    .split(' ')
    .filter((token) => token.length >= 3);
}

function overlapScore(lhs: string, rhs: string) {
  const a = new Set(splitTokens(lhs));
  const b = new Set(splitTokens(rhs));
  if (a.size === 0 || b.size === 0) return 0;
  let hits = 0;
  for (const token of a) {
    if (b.has(token)) hits += 1;
  }
  return hits / Math.max(a.size, b.size);
}

function parseDateFromText(value: string): string | null {
  const dmy = value.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/);
  if (dmy) {
    const day = dmy[1]?.padStart(2, '0');
    const month = dmy[2]?.padStart(2, '0');
    const year = dmy[3];
    if (day && month && year) return `${year}-${month}-${day}`;
  }
  const monthFormat = value.match(
    /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{4})\b/i
  );
  if (monthFormat) {
    const day = monthFormat[1]?.padStart(2, '0');
    const monthMap: Record<string, string> = {
      jan: '01',
      feb: '02',
      mar: '03',
      apr: '04',
      may: '05',
      jun: '06',
      jul: '07',
      aug: '08',
      sep: '09',
      sept: '09',
      oct: '10',
      nov: '11',
      dec: '12',
    };
    const month = monthMap[(monthFormat[2] ?? '').toLowerCase()];
    const year = monthFormat[3];
    if (day && month && year) return `${year}-${month}-${day}`;
  }
  return null;
}

function monthsBetween(a: string, b: string) {
  const d1 = new Date(a);
  const d2 = new Date(b);
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return 100;
  return Math.abs((d1.getFullYear() - d2.getFullYear()) * 12 + (d1.getMonth() - d2.getMonth()));
}

function inferCourtFromTitle(title: string) {
  if (/supreme court/i.test(title)) return 'Supreme Court of India';
  const hc = title.match(/([a-z ]+high court)/i)?.[1];
  if (hc) return hc.replace(/\s+/g, ' ').trim();
  if (/tribunal/i.test(title)) return 'Tribunal';
  return 'Unknown Court';
}

function courtPriorityScore(court: string) {
  for (const item of COURT_PRIORITY) {
    if (item.pattern.test(court)) return item.score;
  }
  return 0.5;
}

function inferProceduralPosture(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes('interim')) return 'interim_stage';
  if (lower.includes('appeal')) return 'appellate_stage';
  if (lower.includes('execution')) return 'execution_stage';
  if (lower.includes('trial')) return 'trial_stage';
  return null;
}

function inferReliefType(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes('injunction')) return 'injunction';
  if (lower.includes('bail')) return 'bail';
  if (lower.includes('recovery')) return 'recovery';
  if (lower.includes('damages')) return 'damages';
  if (lower.includes('quash')) return 'quashing';
  return null;
}

function parseSections(text: string) {
  const sections = new Set<string>();
  const regex = /\b(?:section|sec\.?)\s+(\d+[a-zA-Z\-]*(?:\(\d+\))?)\b/gi;
  for (const match of text.matchAll(regex)) {
    if (match[1]) sections.add(`Section ${match[1]}`);
  }
  return Array.from(sections);
}

function extractSignals(input: LegalResearchInput): ParsedSignals {
  const combinedText = [
    input.summary,
    input.objective ?? '',
    input.userQuery ?? '',
    input.reliefSought ?? '',
    input.voiceTranscript ?? '',
    ...(input.parsedDocumentTexts ?? []),
    ...(input.extractedFacts ?? []),
  ]
    .filter(Boolean)
    .join('\n');

  const issues = new Set<string>();
  const acts = new Set<string>();
  for (const issue of ISSUE_PATTERNS) {
    if (issue.patterns.some((pattern) => pattern.test(combinedText))) {
      issues.add(issue.tag);
      for (const act of issue.acts) acts.add(act);
    }
  }

  const bareActRegex = /\b([A-Z][A-Za-z&\s]{3,80}Act(?:,\s*\d{4})?)\b/g;
  for (const match of combinedText.matchAll(bareActRegex)) {
    const act = match[1]?.trim();
    if (act) acts.add(act);
  }

  return {
    combinedText,
    issues: Array.from(issues),
    acts: Array.from(acts),
    sections: parseSections(combinedText),
    proceduralPosture: inferProceduralPosture(combinedText),
    reliefType: inferReliefType(combinedText),
  };
}

function buildQueryHash(params: {
  issues: string[];
  acts: string[];
  sections: string[];
  forum: string | null;
  jurisdiction: string | null;
  reliefType: string | null;
}) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        issues: params.issues.slice().sort(),
        acts: params.acts.slice().sort(),
        sections: params.sections.slice().sort(),
        forum: params.forum,
        jurisdiction: params.jurisdiction,
        reliefType: params.reliefType,
      })
    )
    .digest('hex');
}

function generateStatuteQueries(signals: ParsedSignals) {
  const queries: string[] = [];
  for (const issue of signals.issues) {
    queries.push(`India Code ${issue.replace(/_/g, ' ')} statutory provisions`);
  }
  for (const act of signals.acts.slice(0, 6)) {
    queries.push(`${act} relevant sections and rules`);
  }
  for (const section of signals.sections.slice(0, 8)) {
    queries.push(`${section} Indian law`);
  }
  return Array.from(new Set(queries)).slice(0, 12);
}

function generatePrecedentQueries(params: {
  signals: ParsedSignals;
  forum: string | null;
  jurisdiction: string | null;
}) {
  const queries: string[] = [];
  for (const issue of params.signals.issues) {
    queries.push(
      `${issue.replace(/_/g, ' ')} Indian judgment ${params.forum ?? ''} ${params.jurisdiction ?? ''}`.trim()
    );
  }
  for (const act of params.signals.acts.slice(0, 6)) {
    queries.push(`${act} latest precedent India`);
  }
  for (const section of params.signals.sections.slice(0, 6)) {
    queries.push(`${section} latest Supreme Court or High Court judgment`);
  }
  return Array.from(new Set(queries)).slice(0, 12);
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

const LOCAL_STATUTE_CATALOG: Array<{
  id: string;
  authorityType: StatutoryAuthority['authorityType'];
  title: string;
  actName: string;
  sectionRef?: string;
  ruleRef?: string;
  proposition: string;
  issueTags: string[];
  sourceUrl: string;
}> = [
  {
    id: 'stat-ni-138',
    authorityType: 'statute',
    title: 'Negotiable Instruments Act, 1881 - Section 138',
    actName: 'Negotiable Instruments Act, 1881',
    sectionRef: 'Section 138',
    proposition: 'Dishonour of cheque for insufficiency of funds creates penal liability subject to statutory notice and timelines.',
    issueTags: ['cheque_bounce', 'service_of_notice'],
    sourceUrl: 'https://www.indiacode.nic.in',
  },
  {
    id: 'stat-ni-142',
    authorityType: 'statute',
    title: 'Negotiable Instruments Act, 1881 - Section 142',
    actName: 'Negotiable Instruments Act, 1881',
    sectionRef: 'Section 142',
    proposition: 'Complaint under Section 138 must satisfy limitation and cognizance requirements.',
    issueTags: ['cheque_bounce', 'limitation'],
    sourceUrl: 'https://www.indiacode.nic.in',
  },
  {
    id: 'stat-cpc-o39',
    authorityType: 'rule',
    title: 'Code of Civil Procedure, 1908 - Order XXXIX Rules 1 and 2',
    actName: 'Code of Civil Procedure, 1908',
    ruleRef: 'Order XXXIX Rules 1 and 2',
    proposition: 'Temporary injunction requires prima facie case, balance of convenience, and irreparable injury.',
    issueTags: ['injunction_relief', 'property_dispute'],
    sourceUrl: 'https://www.indiacode.nic.in',
  },
  {
    id: 'stat-specific-relief',
    authorityType: 'statute',
    title: 'Specific Relief Act, 1963 - Injunctive Relief Framework',
    actName: 'Specific Relief Act, 1963',
    proposition: 'Injunctive and declaratory relief must satisfy statutory discretion and maintainability conditions.',
    issueTags: ['injunction_relief', 'property_dispute'],
    sourceUrl: 'https://www.indiacode.nic.in',
  },
  {
    id: 'stat-consumer-35',
    authorityType: 'statute',
    title: 'Consumer Protection Act, 2019 - Section 35',
    actName: 'Consumer Protection Act, 2019',
    sectionRef: 'Section 35',
    proposition: 'Consumer complaint institution and maintainability requirements before commission are governed by Section 35.',
    issueTags: ['consumer_dispute', 'jurisdiction'],
    sourceUrl: 'https://www.indiacode.nic.in',
  },
  {
    id: 'stat-limitation-5',
    authorityType: 'statute',
    title: 'Limitation Act, 1963 - Section 5',
    actName: 'Limitation Act, 1963',
    sectionRef: 'Section 5',
    proposition: 'Delay condonation requires sufficient cause, supported by specific explanation for the delay period.',
    issueTags: ['limitation'],
    sourceUrl: 'https://www.indiacode.nic.in',
  },
];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asRecord(item)).filter((item): item is Record<string, unknown> => Boolean(item));
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

function pickResultsArray(payload: unknown): Array<Record<string, unknown>> {
  const root = asRecord(payload);
  if (!root) return [];
  const candidates = [
    asRecordArray(root.results),
    asRecordArray(root.items),
    asRecordArray(root.data),
    asRecordArray(root.documents),
    asRecordArray(root.docs),
  ];
  return candidates.find((items) => items.length > 0) ?? [];
}

async function safeJsonFetch(url: string) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

const indiaCodeStatuteAdapter: StatuteSourceAdapter = {
  id: 'india_code_adapter',
  async search(input) {
    const tokens = splitTokens([input.combinedText, ...input.queries].join(' '));
    const picked = LOCAL_STATUTE_CATALOG.filter((row) => {
      const rowText = normalizeText(`${row.title} ${row.proposition} ${row.actName} ${row.sectionRef ?? ''}`);
      const tokenHit = tokens.some((token) => rowText.includes(token));
      const issueHit = row.issueTags.some((tag) => input.issues.includes(tag));
      return tokenHit || issueHit;
    }).slice(0, 12);

    const now = nowIso();
    return picked.map((row, index) => {
      const relevance = clamp(0.9 - index * 0.06, 0.42, 0.95);
      return {
        id: row.id,
        authorityType: row.authorityType,
        source: 'india_code' as const,
        sourceUrl: row.sourceUrl,
        title: row.title,
        proposition: row.proposition,
        issueTags: row.issueTags,
        relevanceScore: relevance,
        courtPriorityScore: 1,
        freshnessScore: 0.72,
        overallScore: relevance,
        retrievedAt: now,
        verified: true,
        actName: row.actName,
        ...(row.sectionRef ? { sectionRef: row.sectionRef } : {}),
        ...(row.ruleRef ? { ruleRef: row.ruleRef } : {}),
        ...(input.jurisdiction ? { jurisdiction: input.jurisdiction } : {}),
      };
    });
  },
};

const indiaCodeRemoteStatuteAdapter: StatuteSourceAdapter = {
  id: 'india_code_remote_adapter',
  async search(input) {
    const baseUrl = process.env.INDIA_CODE_SEARCH_URL?.trim();
    if (!baseUrl) return [];
    const now = nowIso();
    const out: StatutoryAuthority[] = [];

    for (const query of input.queries.slice(0, 4)) {
      const payload = await safeJsonFetch(`${baseUrl}${baseUrl.includes('?') ? '&' : '?'}q=${encodeURIComponent(query)}`);
      const rows = pickResultsArray(payload).slice(0, 4);
      for (const row of rows) {
        const title = pickString(row, ['title', 'name', 'heading']) ?? `India Code result for ${query}`;
        const actName = pickString(row, ['act', 'act_name']) ?? title;
        const sourceUrl = pickString(row, ['url', 'source_url', 'link']) ?? 'https://www.indiacode.nic.in';
        const sectionRef = pickString(row, ['section', 'section_ref']);
        out.push({
          id: `india-code-${createHash('md5').update(`${title}|${sourceUrl}`).digest('hex')}`,
          authorityType: 'statute',
          source: 'india_code',
          sourceUrl,
          title,
          proposition:
            pickString(row, ['summary', 'proposition', 'holding']) ??
            'Statutory proposition from India Code search connector.',
          issueTags: input.issues.slice(0, 3),
          relevanceScore: 0.72,
          courtPriorityScore: 1,
          freshnessScore: 0.7,
          overallScore: 0.72,
          retrievedAt: now,
          verified: true,
          actName,
          ...(sectionRef ? { sectionRef } : {}),
        });
      }
    }

    return uniqueBy(out, (item) => item.id).slice(0, 10);
  },
};

const indianKanoonPrecedentAdapter: PrecedentSourceAdapter = {
  id: 'indiankanoon_adapter',
  async search(input) {
    const searches = await Promise.all(input.queries.slice(0, 5).map((query) => searchKanoon(query)));
    const flattened = searches.flat();
    const checkedAt = input.checkedAt;

    return flattened.map((citation, index) => {
      const parsedDate = parseDateFromText(`${citation.title} ${citation.excerpt}`);
      const date = parsedDate ?? checkedAt.slice(0, 10);
      const court = inferCourtFromTitle(citation.title);
      const issueTags = input.issues.filter((issue) =>
        normalizeText(`${citation.title} ${citation.excerpt}`).includes(issue.replace(/_/g, ' '))
      );
      const inferredIssueTags = issueTags.length ? issueTags : input.issues.slice(0, 2);
      const relevance = clamp(citation.confidence - index * 0.03, 0.34, 0.92);

      return {
        id: `prec-${citation.id}`,
        authorityType: 'precedent' as const,
        source: 'indiankanoon' as const,
        sourceUrl: citation.url,
        title: citation.title,
        proposition: citation.excerpt,
        issueTags: inferredIssueTags,
        relevanceScore: relevance,
        courtPriorityScore: courtPriorityScore(court),
        freshnessScore: parsedDate ? 0.8 : 0.36,
        overallScore: relevance,
        retrievedAt: checkedAt,
        verified: true,
        caseName: citation.title,
        court,
        date,
        citationText: citation.title,
        forumFitScore: 0.5,
        jurisdictionFitScore: 0.5,
        ...(parsedDate ? {} : { isDateInferred: true }),
      };
    });
  },
};

function makeRemotePrecedentAdapter(params: {
  id: string;
  envKey:
    | 'ECOURTS_JUDGMENTS_SEARCH_URL'
    | 'SUPREME_COURT_SEARCH_URL'
    | 'VERDICTUM_SEARCH_URL'
    | 'SCC_ONLINE_SEARCH_URL';
  source: AuthoritySource;
  courtHint?: string;
}) {
  const adapter: PrecedentSourceAdapter = {
    id: params.id,
    async search(input) {
      const baseUrl = process.env[params.envKey]?.trim();
      if (!baseUrl) return [];
      const out: PrecedentAuthority[] = [];

      for (const query of input.queries.slice(0, 3)) {
        const payload = await safeJsonFetch(`${baseUrl}${baseUrl.includes('?') ? '&' : '?'}q=${encodeURIComponent(query)}`);
        const rows = pickResultsArray(payload).slice(0, 4);
        for (const row of rows) {
          const caseName = pickString(row, ['case_name', 'title', 'name']) ?? `Precedent for ${query}`;
          const neutralCitation = pickString(row, ['neutral_citation']);
          const caseNumber = pickString(row, ['case_number']);
          const date =
            parseDateFromText(
              `${pickString(row, ['date', 'judgment_date']) ?? ''} ${pickString(row, ['title', 'summary']) ?? ''}`
            ) ?? input.checkedAt.slice(0, 10);
          const court = pickString(row, ['court', 'court_name']) ?? params.courtHint ?? inferCourtFromTitle(caseName);
          const sourceUrl = pickString(row, ['url', 'source_url', 'link']) ?? baseUrl;
          out.push({
            id: `${params.id}-${createHash('md5').update(`${caseName}|${sourceUrl}`).digest('hex')}`,
            authorityType: 'precedent',
            source: params.source,
            sourceUrl,
            title: caseName,
            proposition:
              pickString(row, ['summary', 'holding', 'proposition']) ??
              'Precedent extracted from configured remote connector.',
            issueTags: input.issues.slice(0, 3),
            relevanceScore: 0.7,
            courtPriorityScore: courtPriorityScore(court),
            freshnessScore: 0.7,
            overallScore: 0.7,
            retrievedAt: input.checkedAt,
            verified: true,
            caseName,
            court,
            date,
            citationText: pickString(row, ['citation', 'neutral_citation', 'case_number']) ?? caseName,
            ...(neutralCitation ? { neutralCitation } : {}),
            ...(caseNumber ? { caseNumber } : {}),
            forumFitScore: 0.5,
            jurisdictionFitScore: 0.5,
          });
        }
      }

      return uniqueBy(out, (item) => item.id).slice(0, 12);
    },
  };
  return adapter;
}

const ecourtsPrecedentAdapter = makeRemotePrecedentAdapter({
  id: 'ecourts_precedent_adapter',
  envKey: 'ECOURTS_JUDGMENTS_SEARCH_URL',
  source: 'ecourts',
});

const supremeCourtPrecedentAdapter = makeRemotePrecedentAdapter({
  id: 'supreme_court_precedent_adapter',
  envKey: 'SUPREME_COURT_SEARCH_URL',
  source: 'supreme_court',
  courtHint: 'Supreme Court of India',
});

const verdictumPrecedentAdapter = makeRemotePrecedentAdapter({
  id: 'verdictum_precedent_adapter',
  envKey: 'VERDICTUM_SEARCH_URL',
  source: 'verdictum',
});

const sccOnlinePrecedentAdapter = makeRemotePrecedentAdapter({
  id: 'scc_online_precedent_adapter',
  envKey: 'SCC_ONLINE_SEARCH_URL',
  source: 'scc_online',
});

function detectAuthorityConflicts(precedents: PrecedentAuthority[]) {
  const conflicts: ConflictAuthority[] = [];
  const positiveTokens = ['allowed', 'granted', 'maintainable', 'upheld', 'liable'];
  const negativeTokens = ['dismissed', 'rejected', 'not maintainable', 'set aside', 'not liable'];

  const tags = Array.from(new Set(precedents.flatMap((item) => item.issueTags)));
  for (const tag of tags) {
    const scoped = precedents.filter((item) => item.issueTags.includes(tag)).slice(0, 8);
    const positives = scoped.filter((item) =>
      positiveTokens.some((token) => normalizeText(item.proposition).includes(token))
    );
    const negatives = scoped.filter((item) =>
      negativeTokens.some((token) => normalizeText(item.proposition).includes(token))
    );
    if (!positives.length || !negatives.length) continue;
    conflicts.push({
      id: `conf-${tag}-${crypto.randomUUID()}`,
      issueTag: tag,
      summary:
        `Authorities show potentially conflicting outcomes for issue "${tag}". ` +
        'Manual legal synthesis is required before final advice.',
      conflictingAuthorityIds: [...positives.slice(0, 2), ...negatives.slice(0, 2)].map((item) => item.id),
      severity: 'medium',
    });
  }
  return conflicts;
}

function enrichAndRankPrecedents(params: {
  precedents: PrecedentAuthority[];
  forum: string | null;
  jurisdiction: string | null;
  issues: string[];
  sections: string[];
  checkedAt: string;
  lookbackMonths: number;
}) {
  const enriched = params.precedents.map((item) => {
    const issueOverlap =
      item.issueTags.length > 0
        ? item.issueTags.filter((tag) => params.issues.includes(tag)).length / Math.max(1, params.issues.length)
        : 0;
    const forumFit = params.forum
      ? overlapScore(item.court, params.forum) > 0.2
        ? 1
        : 0.45
      : 0.55;
    const jurisdictionFit = params.jurisdiction
      ? overlapScore(`${item.title} ${item.proposition}`, params.jurisdiction) > 0.14
        ? 1
        : 0.5
      : 0.55;
    const sectionMatch = params.sections.some((section) =>
      normalizeText(`${item.title} ${item.proposition}`).includes(normalizeText(section))
    )
      ? 0.9
      : 0.45;
    const ageMonths = monthsBetween(params.checkedAt.slice(0, 10), item.date);
    const freshness = clamp(1 - ageMonths / Math.max(1, params.lookbackMonths * 1.8), 0.18, 1);

    const overall = clamp(
      issueOverlap * 0.32 +
        item.courtPriorityScore * 0.24 +
        forumFit * 0.16 +
        jurisdictionFit * 0.12 +
        freshness * 0.1 +
        sectionMatch * 0.06,
      0.15,
      0.99
    );

    return {
      ...item,
      forumFitScore: Number(forumFit.toFixed(2)),
      jurisdictionFitScore: Number(jurisdictionFit.toFixed(2)),
      freshnessScore: Number(freshness.toFixed(2)),
      overallScore: Number(overall.toFixed(2)),
      relevanceScore: Number(
        clamp((item.relevanceScore + issueOverlap + sectionMatch) / 3, 0.2, 0.97).toFixed(2)
      ),
    };
  });

  const deduped = uniqueBy(
    enriched.sort((a, b) => b.overallScore - a.overallScore),
    (item) => `${item.caseName.toLowerCase()}|${item.date}|${item.sourceUrl}`
  );

  const leading = deduped.slice(0, 8);
  const cutoff = new Date(params.checkedAt);
  cutoff.setMonth(cutoff.getMonth() - params.lookbackMonths);
  const latest = deduped
    .filter((item) => new Date(item.date).getTime() >= cutoff.getTime())
    .slice(0, 8);

  return {
    leading,
    latest,
    conflicts: detectAuthorityConflicts(deduped),
  };
}

function computeCoverage(params: {
  issues: string[];
  statutes: StatutoryAuthority[];
  leading: PrecedentAuthority[];
  latest: PrecedentAuthority[];
}) {
  if (!params.issues.length) {
    return params.statutes.length + params.leading.length + params.latest.length > 0 ? 0.5 : 0;
  }

  let covered = 0;
  for (const issue of params.issues) {
    const byStatute = params.statutes.some((item) => item.issueTags.includes(issue));
    const byPrecedent =
      params.leading.some((item) => item.issueTags.includes(issue)) ||
      params.latest.some((item) => item.issueTags.includes(issue));
    if (byStatute || byPrecedent) covered += 1;
  }
  return Number((covered / params.issues.length).toFixed(2));
}

function computeCacheSliceMeta(params: {
  status: 'fresh' | 'cache' | 'miss';
  nowMs: number;
  fetchedAt: number | undefined;
  ttlMs: number;
}) {
  return {
    status: params.status,
    ageMs: params.fetchedAt ? Math.max(0, params.nowMs - params.fetchedAt) : 0,
    ttlMs: params.ttlMs,
  };
}

function toCitationFromStatute(item: StatutoryAuthority): Citation {
  return {
    id: `cit-${item.id}`,
    title: item.title,
    source: 'bare_act',
    url: item.sourceUrl,
    excerpt: item.proposition,
    confidence: item.overallScore,
  };
}

function toCitationFromPrecedent(item: PrecedentAuthority): Citation {
  return {
    id: `cit-${item.id}`,
    title: item.title,
    source: 'indiankanoon',
    url: item.sourceUrl,
    excerpt: item.proposition,
    confidence: item.overallScore,
  };
}

function formatAuthorityForPrompt(authority: StatutoryAuthority | PrecedentAuthority) {
  if (authority.authorityType === 'precedent') {
    return `[precedent] ${authority.caseName} | ${authority.court} | ${authority.date} | ${authority.sourceUrl}`;
  }
  return `[statute] ${authority.actName} ${authority.sectionRef ?? authority.ruleRef ?? ''} | ${authority.sourceUrl}`;
}

async function maybeRefineIssuesWithLlm(params: {
  signals: ParsedSignals;
  forum: string | null;
  jurisdiction: string | null;
  llmConfig?: RuntimeLlmConfig;
}) {
  if (!params.llmConfig) return params.signals.issues;
  const llm = await invokeJsonModel({
    systemPrompt:
      'You are an Indian legal issue classifier. Return strict JSON only with key "issues" (snake_case issue tags).',
    userPrompt: [
      `Forum: ${params.forum ?? 'unknown'}`,
      `Jurisdiction: ${params.jurisdiction ?? 'unknown'}`,
      `Case text: ${params.signals.combinedText.slice(0, 4000)}`,
      `Current tags: ${params.signals.issues.join(', ') || 'none'}`,
      'Output format: {"issues":["limitation","jurisdiction"]}',
    ].join('\n'),
    temperature: 0.1,
    maxTokens: 240,
    schema: issueRefinementSchema,
    llmConfig: params.llmConfig,
  });

  if (!llm?.issues?.length) return params.signals.issues;
  const normalized = llm.issues
    .map((item) => normalizeText(item).replace(/\s+/g, '_'))
    .filter((item) => item.length >= 3);
  return Array.from(new Set([...params.signals.issues, ...normalized])).slice(0, 12);
}

async function runStatuteAdapters(input: StatuteAdapterInput, adapters: StatuteSourceAdapter[]) {
  const results = await Promise.all(
    adapters.map(async (adapter) => {
      try {
        return await adapter.search(input);
      } catch {
        return [];
      }
    })
  );
  return uniqueBy(results.flat(), (item) => item.id);
}

async function runPrecedentAdapters(input: PrecedentAdapterInput, adapters: PrecedentSourceAdapter[]) {
  const results = await Promise.all(
    adapters.map(async (adapter) => {
      try {
        return await adapter.search(input);
      } catch {
        return [];
      }
    })
  );
  return uniqueBy(results.flat(), (item) => item.id);
}

export async function buildLegalResearchPacket(
  input: LegalResearchInput,
  config?: {
    statuteAdapters?: StatuteSourceAdapter[];
    precedentAdapters?: PrecedentSourceAdapter[];
    lookbackMonths?: number;
  }
): Promise<LegalResearchPacket> {
  const signals = extractSignals(input);
  const forumUsed = input.forum ?? null;
  const jurisdictionUsed = input.jurisdiction ?? input.state ?? null;
  const issuesIdentified = await maybeRefineIssuesWithLlm({
    signals,
    forum: forumUsed,
    jurisdiction: jurisdictionUsed,
    ...(input.llmConfig ? { llmConfig: input.llmConfig } : {}),
  });

  const queryHash = buildQueryHash({
    issues: issuesIdentified,
    acts: signals.acts,
    sections: signals.sections,
    forum: forumUsed,
    jurisdiction: jurisdictionUsed,
    reliefType: signals.reliefType,
  });

  const nowMs = Date.now();
  const entry = RESEARCH_CACHE.get(queryHash) ?? {};
  const statuteAdapters = config?.statuteAdapters ?? [indiaCodeRemoteStatuteAdapter, indiaCodeStatuteAdapter];
  const precedentAdapters = config?.precedentAdapters ?? [
    ecourtsPrecedentAdapter,
    supremeCourtPrecedentAdapter,
    indianKanoonPrecedentAdapter,
    verdictumPrecedentAdapter,
    sccOnlinePrecedentAdapter,
  ];
  const lookbackMonths = input.latestLookbackMonths ?? config?.lookbackMonths ?? DEFAULT_LATEST_LOOKBACK_MONTHS;

  let statutesStatus: 'fresh' | 'cache' | 'miss' = 'miss';
  let statutes = entry.statutes?.data ?? [];
  let statutesFetchedAt = entry.statutes?.fetchedAt;
  if (entry.statutes && nowMs - entry.statutes.fetchedAt <= STATUTES_TTL_MS) {
    statutesStatus = 'cache';
  } else {
    statutes = await runStatuteAdapters(
      {
        queries: generateStatuteQueries(signals),
        issues: issuesIdentified,
        acts: signals.acts,
        sections: signals.sections,
        jurisdiction: jurisdictionUsed,
        forum: forumUsed,
        combinedText: signals.combinedText,
      },
      statuteAdapters
    );
    statutesStatus = statutes.length ? 'fresh' : 'miss';
    statutesFetchedAt = nowMs;
    entry.statutes = {
      fetchedAt: nowMs,
      data: statutes,
    };
  }

  let leadingStatus: 'fresh' | 'cache' | 'miss' = 'miss';
  let latestStatus: 'fresh' | 'cache' | 'miss' = 'miss';
  let leading = entry.precedents?.leading ?? [];
  let latest = entry.precedents?.latest ?? [];
  let conflicts = entry.precedents?.conflicts ?? [];
  let precedentsCheckedAt = entry.precedents?.precedentsCheckedAt ?? nowIso();
  let precedentFetchedAt = entry.precedents?.fetchedAt;

  const precedentAge = entry.precedents ? nowMs - entry.precedents.fetchedAt : Number.POSITIVE_INFINITY;
  if (entry.precedents && precedentAge <= LATEST_PRECEDENTS_TTL_MS) {
    leadingStatus = 'cache';
    latestStatus = 'cache';
  } else {
    const fetchedPrecedents = await runPrecedentAdapters(
      {
        queries: generatePrecedentQueries({
          signals: { ...signals, issues: issuesIdentified },
          forum: forumUsed,
          jurisdiction: jurisdictionUsed,
        }),
        issues: issuesIdentified,
        acts: signals.acts,
        sections: signals.sections,
        jurisdiction: jurisdictionUsed,
        forum: forumUsed,
        combinedText: signals.combinedText,
        checkedAt: nowIso(),
        lookbackMonths,
      },
      precedentAdapters
    );

    const ranked = enrichAndRankPrecedents({
      precedents: fetchedPrecedents,
      forum: forumUsed,
      jurisdiction: jurisdictionUsed,
      issues: issuesIdentified,
      sections: signals.sections,
      checkedAt: nowIso(),
      lookbackMonths,
    });

    if (entry.precedents && precedentAge <= LEADING_PRECEDENTS_TTL_MS) {
      leadingStatus = 'cache';
      latestStatus = ranked.latest.length ? 'fresh' : 'miss';
      latest = ranked.latest;
      conflicts = ranked.conflicts;
      precedentsCheckedAt = nowIso();
      precedentFetchedAt = nowMs;
      entry.precedents = {
        fetchedAt: nowMs,
        leading: entry.precedents.leading,
        latest,
        conflicts,
        precedentsCheckedAt,
      };
    } else {
      leading = ranked.leading;
      latest = ranked.latest;
      conflicts = ranked.conflicts;
      precedentsCheckedAt = nowIso();
      leadingStatus = leading.length ? 'fresh' : 'miss';
      latestStatus = latest.length ? 'fresh' : 'miss';
      precedentFetchedAt = nowMs;
      entry.precedents = {
        fetchedAt: nowMs,
        leading,
        latest,
        conflicts,
        precedentsCheckedAt,
      };
    }
  }

  RESEARCH_CACHE.set(queryHash, entry);

  const authorityCoverageScore = computeCoverage({
    issues: issuesIdentified,
    statutes,
    leading,
    latest,
  });

  const unresolvedIssues = issuesIdentified.filter((issue) => {
    const inStatutes = statutes.some((item) => item.issueTags.includes(issue));
    const inPrecedents =
      leading.some((item) => item.issueTags.includes(issue)) ||
      latest.some((item) => item.issueTags.includes(issue));
    return !inStatutes && !inPrecedents;
  });

  return {
    queryHash,
    issuesIdentified,
    jurisdictionUsed,
    forumUsed,
    proceduralPosture: signals.proceduralPosture,
    reliefType: signals.reliefType,
    statutoryAuthorities: statutes,
    leadingPrecedents: leading,
    latestPrecedents: latest,
    conflictsDetected: conflicts,
    authorityCoverageScore,
    precedentsCheckedAt,
    unresolvedIssues,
    cacheMeta: {
      statutes: computeCacheSliceMeta({
        status: statutesStatus,
        nowMs,
        fetchedAt: statutesFetchedAt,
        ttlMs: STATUTES_TTL_MS,
      }),
      leadingPrecedents: computeCacheSliceMeta({
        status: leadingStatus,
        nowMs,
        fetchedAt: precedentFetchedAt,
        ttlMs: LEADING_PRECEDENTS_TTL_MS,
      }),
      latestPrecedents: computeCacheSliceMeta({
        status: latestStatus,
        nowMs,
        fetchedAt: precedentFetchedAt,
        ttlMs: LATEST_PRECEDENTS_TTL_MS,
      }),
    },
  };
}

export function legalResearchPacketToCitations(packet: LegalResearchPacket): Citation[] {
  const statutory = packet.statutoryAuthorities.map(toCitationFromStatute);
  const leading = packet.leadingPrecedents.map(toCitationFromPrecedent);
  const latest = packet.latestPrecedents.map(toCitationFromPrecedent);
  return uniqueBy([...leading, ...latest, ...statutory], (item) => item.url).slice(0, 12);
}

export function verifyLegalClaims(params: {
  claims: Array<{ statement: string; issueTag?: string }>;
  packet: LegalResearchPacket;
}): GroundedLegalClaim[] {
  const authorities = [
    ...params.packet.statutoryAuthorities.map((item) => ({ id: item.id, type: 'statute' as const, data: item })),
    ...params.packet.leadingPrecedents.map((item) => ({ id: item.id, type: 'precedent' as const, data: item })),
    ...params.packet.latestPrecedents.map((item) => ({ id: item.id, type: 'precedent' as const, data: item })),
  ];

  return params.claims.map((claim) => {
    const issueTag = claim.issueTag ?? params.packet.issuesIdentified[0] ?? 'general';
    const hasExplicitIssue = typeof claim.issueTag === 'string' && claim.issueTag.trim().length > 0;
    const matches = authorities.filter((authority) => {
      const issueHit = authority.data.issueTags.includes(issueTag);
      const textOverlap = overlapScore(
        `${authority.data.title} ${authority.data.proposition}`,
        `${claim.statement} ${issueTag.replace(/_/g, ' ')}`
      );
      const textHit =
        overlapScore(
          `${authority.data.title} ${authority.data.proposition}`,
          `${claim.statement} ${issueTag.replace(/_/g, ' ')}`
        ) >= (hasExplicitIssue ? 0.3 : 0.14);
      if (hasExplicitIssue && issueTag !== 'general') {
        return issueHit || (textHit && textOverlap >= 0.4);
      }
      return issueHit || textHit;
    });

    if (!matches.length) {
      return {
        id: crypto.randomUUID(),
        statement: claim.statement,
        issueTag,
        supportType: 'none' as const,
        authorityIds: [],
        verified: false,
        unverifiedReason:
          'No verified Indian statutory authority or precedent found for this proposition in this run.',
      };
    }

    const hasStatute = matches.some((item) => item.type === 'statute');
    const hasPrecedent = matches.some((item) => item.type === 'precedent');
    return {
      id: crypto.randomUUID(),
      statement: claim.statement,
      issueTag,
      supportType: hasStatute && hasPrecedent ? 'mixed' : hasStatute ? 'statute' : 'precedent',
      authorityIds: matches.slice(0, 4).map((item) => item.id),
      verified: true,
    };
  });
}

export function legalGroundingStatus(packet: LegalResearchPacket, minimumCoverage = 0.55) {
  if (packet.authorityCoverageScore >= minimumCoverage) return 'complete' as const;
  return 'incomplete' as const;
}

export function summarizePacketForPrompt(packet: LegalResearchPacket) {
  const authorities = [
    ...packet.statutoryAuthorities.slice(0, 6),
    ...packet.leadingPrecedents.slice(0, 6),
    ...packet.latestPrecedents.slice(0, 6),
  ];
  return [
    `Issues: ${packet.issuesIdentified.join(', ') || 'none'}`,
    `Forum: ${packet.forumUsed ?? 'unknown'} | Jurisdiction: ${packet.jurisdictionUsed ?? 'unknown'}`,
    `Coverage score: ${packet.authorityCoverageScore}`,
    `Precedents checked at: ${packet.precedentsCheckedAt}`,
    `Authorities:\n${authorities.map((item) => `- ${formatAuthorityForPrompt(item)}`).join('\n') || '- none'}`,
    packet.conflictsDetected.length
      ? `Conflicts detected: ${packet.conflictsDetected.map((item) => item.issueTag).join(', ')}`
      : 'Conflicts detected: none',
    packet.unresolvedIssues.length
      ? `Unresolved issues: ${packet.unresolvedIssues.join(', ')}`
      : 'Unresolved issues: none',
  ].join('\n');
}
