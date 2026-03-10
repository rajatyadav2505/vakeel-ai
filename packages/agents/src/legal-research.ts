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
import { Redis } from '@upstash/redis';
import { z } from 'zod';
import { getAgentsEnv } from './env';
import { invokeJsonModel, type RuntimeLlmConfig } from './llm';
import {
  fetchKanoonDocumentFragment,
  fetchKanoonDocumentMeta,
  searchKanoonDetailed,
  type KanoonSearchHit,
} from './tools';

const STATUTES_TTL_MS = 24 * 60 * 60 * 1000;
const LEADING_PRECEDENTS_TTL_MS = 6 * 60 * 60 * 1000;
const LATEST_PRECEDENTS_TTL_MS = 30 * 60 * 1000;
const DEFAULT_LATEST_LOOKBACK_MONTHS = 24;
const retrievalPlannerHintsSchema = z.object({
  issues: z.array(z.string().min(1)).max(20).optional(),
  topical_terms: z.array(z.string().min(2)).max(12).optional(),
  negative_terms: z.array(z.string().min(2)).max(10).optional(),
  precedent_queries: z.array(z.string().min(6)).max(10).optional(),
  statute_queries: z.array(z.string().min(6)).max(10).optional(),
});
const RESEARCH_CACHE_KEY_PREFIX = 'legal-research';
const RESEARCH_CACHE_TTL_SECONDS = Math.ceil(STATUTES_TTL_MS / 1000);

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
let researchRedis: Redis | null | undefined;

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
  domain: string;
  patterns: RegExp[];
  acts: string[];
  queryTerms: string[];
}

interface ParsedSignals {
  combinedText: string;
  issues: string[];
  acts: string[];
  sections: string[];
  domains: string[];
  salientTerms: string[];
  proceduralPosture: string | null;
  reliefType: string | null;
}

interface RetrievalQuery {
  text: string;
  reason: string;
  anchorTags: string[];
}

interface RetrievalPlan {
  issues: string[];
  acts: string[];
  sections: string[];
  domains: string[];
  salientTerms: string[];
  negativeTerms: string[];
  statuteQueries: string[];
  precedentQueries: RetrievalQuery[];
}

interface StatuteAdapterInput {
  queries: string[];
  issues: string[];
  acts: string[];
  sections: string[];
  domains: string[];
  salientTerms: string[];
  negativeTerms: string[];
  jurisdiction: string | null;
  forum: string | null;
  combinedText: string;
}

interface PrecedentAdapterInput {
  queries: RetrievalQuery[];
  titleHints: string[];
  issues: string[];
  acts: string[];
  sections: string[];
  domains: string[];
  salientTerms: string[];
  negativeTerms: string[];
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
    domain: 'commercial_criminal',
    patterns: [/\bcheque\b/i, /\bsection\s*138\b/i, /\bni act\b/i, /\bnegotiable instruments\b/i],
    acts: ['Negotiable Instruments Act, 1881'],
    queryTerms: ['dishonour of cheque', 'statutory notice', 'complaint maintainability'],
  },
  {
    tag: 'consumer_dispute',
    domain: 'consumer',
    patterns: [/\bconsumer\b/i, /\bdeficiency\b/i, /\bunfair trade\b/i],
    acts: ['Consumer Protection Act, 2019'],
    queryTerms: ['consumer deficiency', 'unfair trade practice', 'consumer commission'],
  },
  {
    tag: 'injunction_relief',
    domain: 'civil_procedure',
    patterns: [/\binjunction\b/i, /\bstay\b/i, /\bstatus quo\b/i],
    acts: ['Specific Relief Act, 1963', 'Code of Civil Procedure, 1908'],
    queryTerms: ['temporary injunction', 'prima facie balance of convenience', 'status quo'],
  },
  {
    tag: 'arbitration',
    domain: 'arbitration',
    patterns: [/\barbitration\b/i, /\barbitral\b/i, /\bsection\s*9\b/i],
    acts: ['Arbitration and Conciliation Act, 1996'],
    queryTerms: ['interim measures arbitration', 'arbitrability', 'section 9'],
  },
  {
    tag: 'employment_dues',
    domain: 'labour',
    patterns: [/\bemployment\b/i, /\btermination\b/i, /\bgratuity\b/i, /\bwage\b/i],
    acts: ['Industrial Disputes Act, 1947', 'Payment of Wages Act, 1936'],
    queryTerms: ['termination wages gratuity', 'industrial dispute', 'back wages'],
  },
  {
    tag: 'property_dispute',
    domain: 'property',
    patterns: [/\bproperty\b/i, /\btitle\b/i, /\bpossession\b/i, /\bsale deed\b/i],
    acts: ['Transfer of Property Act, 1882', 'Specific Relief Act, 1963'],
    queryTerms: ['title possession', 'self acquired property', 'declaration and injunction'],
  },
  {
    tag: 'limitation',
    domain: 'procedure',
    patterns: [/\blimitation\b/i, /\bdelay condonation\b/i, /\bsection\s*5\b/i],
    acts: ['Limitation Act, 1963'],
    queryTerms: ['condonation of delay', 'sufficient cause', 'limitation bar'],
  },
  {
    tag: 'jurisdiction',
    domain: 'procedure',
    patterns: [/\bjurisdiction\b/i, /\bterritorial\b/i, /\bpecuniary\b/i],
    acts: ['Code of Civil Procedure, 1908'],
    queryTerms: ['territorial jurisdiction', 'pecuniary jurisdiction', 'maintainability'],
  },
  {
    tag: 'bail',
    domain: 'criminal',
    patterns: [/\bbail\b/i, /\banticipatory bail\b/i, /\bsection\s*438\b/i],
    acts: ['Code of Criminal Procedure, 1973'],
    queryTerms: ['anticipatory bail', 'custodial interrogation', 'personal liberty'],
  },
  {
    tag: 'writ_jurisdiction',
    domain: 'constitutional',
    patterns: [/\bwrit\b/i, /\barticle\s*226\b/i, /\bmandamus\b/i, /\bcertiorari\b/i],
    acts: ['Constitution of India'],
    queryTerms: ['article 226 writ jurisdiction', 'alternative remedy', 'judicial review'],
  },
  {
    tag: 'domestic_violence',
    domain: 'family',
    patterns: [/\bdomestic violence\b/i, /\bshared household\b/i, /\bresidence order\b/i, /\bdv act\b/i],
    acts: ['Protection of Women from Domestic Violence Act, 2005'],
    queryTerms: ['shared household', 'residence rights', 'domestic violence act'],
  },
  {
    tag: 'senior_citizen_protection',
    domain: 'family_property',
    patterns: [/\bsenior citizen\b/i, /\bmaintenance tribunal\b/i, /\bparents and senior citizens\b/i],
    acts: ['Maintenance and Welfare of Parents and Senior Citizens Act, 2007'],
    queryTerms: ['senior citizen residence', 'parents and senior citizens act', 'eviction protection'],
  },
  {
    tag: 'family_dispute',
    domain: 'family',
    patterns: [/\bmatrimonial\b/i, /\bmaintenance\b/i, /\bdivorce\b/i, /\bcustody\b/i],
    acts: ['Hindu Marriage Act, 1955', 'Code of Civil Procedure, 1908'],
    queryTerms: ['matrimonial dispute', 'maintenance', 'custody'],
  },
  {
    tag: 'tenancy_dispute',
    domain: 'property',
    patterns: [/\btenant\b/i, /\blandlord\b/i, /\beviction\b/i, /\brent\b/i],
    acts: ['Transfer of Property Act, 1882'],
    queryTerms: ['tenant landlord eviction', 'rent dispute', 'possession of premises'],
  },
  {
    tag: 'service_law',
    domain: 'service',
    patterns: [/\bdepartmental inquiry\b/i, /\bservice matter\b/i, /\bsuspension\b/i, /\bpromotion\b/i],
    acts: ['Constitution of India'],
    queryTerms: ['service matter disciplinary proceedings', 'promotion seniority', 'departmental inquiry'],
  },
  {
    tag: 'insolvency',
    domain: 'commercial',
    patterns: [/\binsolvency\b/i, /\bibc\b/i, /\bcirp\b/i, /\bresolution professional\b/i],
    acts: ['Insolvency and Bankruptcy Code, 2016'],
    queryTerms: ['IBC CIRP', 'operational debt', 'financial creditor'],
  },
  {
    tag: 'tax_dispute',
    domain: 'tax',
    patterns: [/\bgst\b/i, /\bincome tax\b/i, /\bassessment order\b/i, /\btax demand\b/i],
    acts: ['Income-tax Act, 1961', 'Central Goods and Services Tax Act, 2017'],
    queryTerms: ['assessment order', 'tax demand', 'statutory appeal'],
  },
  {
    tag: 'company_compliance',
    domain: 'corporate',
    patterns: [/\boppression\b/i, /\bmismanagement\b/i, /\bboard resolution\b/i, /\bcompanies act\b/i],
    acts: ['Companies Act, 2013'],
    queryTerms: ['oppression mismanagement', 'board resolution', 'company law'],
  },
];

const ACT_ALIASES: Array<{ canonical: string; aliases: RegExp[] }> = [
  {
    canonical: 'Negotiable Instruments Act, 1881',
    aliases: [/\bnegotiable instruments act\b/i, /\bni act\b/i, /\bsection\s*138\b/i, /\bsection\s*142\b/i],
  },
  {
    canonical: 'Consumer Protection Act, 2019',
    aliases: [/\bconsumer protection act\b/i, /\bconsumer commission\b/i],
  },
  {
    canonical: 'Code of Civil Procedure, 1908',
    aliases: [/\bcode of civil procedure\b/i, /\bcpc\b/i, /\border\s*xxxix\b/i, /\border\s*39\b/i],
  },
  {
    canonical: 'Specific Relief Act, 1963',
    aliases: [/\bspecific relief act\b/i, /\bdeclaratory relief\b/i],
  },
  {
    canonical: 'Arbitration and Conciliation Act, 1996',
    aliases: [/\barbitration and conciliation act\b/i, /\barbitration act\b/i, /\bsection\s*9\b/i],
  },
  {
    canonical: 'Industrial Disputes Act, 1947',
    aliases: [/\bindustrial disputes act\b/i, /\bindustrial dispute\b/i],
  },
  {
    canonical: 'Payment of Wages Act, 1936',
    aliases: [/\bpayment of wages act\b/i, /\bwages act\b/i],
  },
  {
    canonical: 'Transfer of Property Act, 1882',
    aliases: [/\btransfer of property act\b/i, /\btpa\b/i],
  },
  {
    canonical: 'Limitation Act, 1963',
    aliases: [/\blimitation act\b/i, /\bdelay condonation\b/i],
  },
  {
    canonical: 'Code of Criminal Procedure, 1973',
    aliases: [/\bcode of criminal procedure\b/i, /\bcrpc\b/i, /\bsection\s*438\b/i],
  },
  {
    canonical: 'Constitution of India',
    aliases: [/\bconstitution of india\b/i, /\barticle\s*226\b/i, /\barticle\s*32\b/i],
  },
  {
    canonical: 'Protection of Women from Domestic Violence Act, 2005',
    aliases: [/\bdomestic violence act\b/i, /\bdv act\b/i, /\bshared household\b/i],
  },
  {
    canonical: 'Maintenance and Welfare of Parents and Senior Citizens Act, 2007',
    aliases: [/\bparents and senior citizens act\b/i, /\bsenior citizens act\b/i],
  },
  {
    canonical: 'Hindu Marriage Act, 1955',
    aliases: [/\bhindu marriage act\b/i, /\bmatrimonial\b/i],
  },
  {
    canonical: 'Insolvency and Bankruptcy Code, 2016',
    aliases: [/\binsolvency and bankruptcy code\b/i, /\bibc\b/i, /\bcirp\b/i],
  },
  {
    canonical: 'Income-tax Act, 1961',
    aliases: [/\bincome tax act\b/i, /\bincome tax\b/i],
  },
  {
    canonical: 'Central Goods and Services Tax Act, 2017',
    aliases: [/\bcgst act\b/i, /\bgst\b/i],
  },
  {
    canonical: 'Companies Act, 2013',
    aliases: [/\bcompanies act\b/i, /\boppression\b/i, /\bmismanagement\b/i],
  },
];

const LEGAL_STOPWORDS = new Set([
  'about',
  'after',
  'again',
  'against',
  'application',
  'applicant',
  'being',
  'between',
  'case',
  'court',
  'counsel',
  'dated',
  'defendant',
  'document',
  'documents',
  'evidence',
  'facts',
  'filed',
  'hearing',
  'issue',
  'judge',
  'judgment',
  'law',
  'legal',
  'matter',
  'notice',
  'order',
  'orders',
  'party',
  'petitioner',
  'plaintiff',
  'please',
  'prayer',
  'proceeding',
  'proposition',
  'relief',
  'respondent',
  'section',
  'seeking',
  'state',
  'statute',
  'their',
  'thereof',
  'therein',
  'these',
  'this',
  'under',
  'versus',
  'which',
  'with',
  'without',
]);

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

function getResearchRedis() {
  if (researchRedis !== undefined) return researchRedis;

  const env = getAgentsEnv();
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    researchRedis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
  } else {
    researchRedis = null;
  }

  return researchRedis;
}

function researchCacheKey(queryHash: string) {
  return `${RESEARCH_CACHE_KEY_PREFIX}:${queryHash}`;
}

async function getCachedResearchEntry(queryHash: string) {
  const redis = getResearchRedis();
  if (redis) {
    try {
      const cached = await redis.get<CachedResearchEntry>(researchCacheKey(queryHash));
      if (cached && typeof cached === 'object') {
        RESEARCH_CACHE.set(queryHash, cached);
        return cached;
      }
    } catch (error) {
      console.warn('[legal-research] redis cache read failed:', error);
    }
  }

  return RESEARCH_CACHE.get(queryHash) ?? {};
}

async function setCachedResearchEntry(queryHash: string, entry: CachedResearchEntry) {
  RESEARCH_CACHE.set(queryHash, entry);

  const redis = getResearchRedis();
  if (!redis) return;

  try {
    await redis.set(researchCacheKey(queryHash), entry, { ex: RESEARCH_CACHE_TTL_SECONDS });
  } catch (error) {
    console.warn('[legal-research] redis cache write failed:', error);
  }
}

function normalizeText(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function splitTokens(input: string) {
  return normalizeText(input)
    .split(' ')
    .filter((token) => token.length >= 3 && !LEGAL_STOPWORDS.has(token));
}

function arrayOverlapScore(lhs: string[], rhs: string[]) {
  if (!lhs.length || !rhs.length) return 0;
  const a = new Set(lhs);
  const b = new Set(rhs);
  let hits = 0;
  for (const item of a) {
    if (b.has(item)) hits += 1;
  }
  return hits / Math.max(a.size, b.size);
}

function titleFromTag(tag: string) {
  return tag.replace(/_/g, ' ');
}

function domainsForIssues(issues: string[]) {
  return dedupeStrings(
    issues.flatMap((tag) => ISSUE_PATTERNS.filter((item) => item.tag === tag).map((item) => item.domain)),
    8
  );
}

function actsForIssues(issues: string[]) {
  return dedupeStrings(
    issues.flatMap((tag) => ISSUE_PATTERNS.filter((item) => item.tag === tag).flatMap((item) => item.acts)),
    10
  );
}

function inferActs(text: string) {
  const acts = new Set<string>();
  for (const entry of ACT_ALIASES) {
    if (entry.aliases.some((pattern) => pattern.test(text))) {
      acts.add(entry.canonical);
    }
  }

  const bareActRegex = /\b([A-Z][A-Za-z&\s]{3,100}Act(?:,\s*\d{4})?)\b/g;
  for (const match of text.matchAll(bareActRegex)) {
    const act = match[1]?.trim();
    if (act) acts.add(act);
  }
  return Array.from(acts);
}

function inferIssuesAndDomains(text: string) {
  const issues = new Set<string>();
  const acts = new Set<string>();
  const domains = new Set<string>();

  for (const issue of ISSUE_PATTERNS) {
    if (issue.patterns.some((pattern) => pattern.test(text))) {
      issues.add(issue.tag);
      domains.add(issue.domain);
      for (const act of issue.acts) acts.add(act);
    }
  }

  for (const act of inferActs(text)) {
    acts.add(act);
    for (const issue of ISSUE_PATTERNS) {
      if (issue.acts.includes(act)) {
        issues.add(issue.tag);
        domains.add(issue.domain);
      }
    }
  }

  return {
    issues: Array.from(issues),
    acts: Array.from(acts),
    domains: Array.from(domains),
  };
}

function extractSalientTerms(text: string, limit = 10) {
  const counts = new Map<string, number>();
  for (const token of splitTokens(text)) {
    if (token.length < 4) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((lhs, rhs) => {
      if (rhs[1] !== lhs[1]) return rhs[1] - lhs[1];
      return rhs[0].length - lhs[0].length;
    })
    .slice(0, limit)
    .map(([token]) => token);
}

function dedupeStrings(values: string[], limit?: number) {
  const out = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  return typeof limit === 'number' ? out.slice(0, limit) : out;
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
  const inferred = inferIssuesAndDomains(combinedText);

  return {
    combinedText,
    issues: inferred.issues,
    acts: inferred.acts,
    sections: parseSections(combinedText),
    domains: inferred.domains,
    salientTerms: extractSalientTerms(combinedText),
    proceduralPosture: inferProceduralPosture(combinedText),
    reliefType: inferReliefType(combinedText),
  };
}

function buildQueryHash(params: {
  issues: string[];
  acts: string[];
  sections: string[];
  domains: string[];
  salientTerms: string[];
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
        domains: params.domains.slice().sort(),
        salientTerms: params.salientTerms.slice().sort(),
        forum: params.forum,
        jurisdiction: params.jurisdiction,
        reliefType: params.reliefType,
      })
    )
    .digest('hex');
}

async function maybeBuildRetrievalHintsWithLlm(params: {
  signals: ParsedSignals;
  forum: string | null;
  jurisdiction: string | null;
  llmConfig?: RuntimeLlmConfig;
}) {
  if (!params.llmConfig) {
    return null;
  }

  const llm = await invokeJsonModel({
    systemPrompt: [
      'You are a retrieval planner for Indian legal research.',
      'Return strict JSON only.',
      'Suggest only search phrases and topical terms.',
      'Do not invent holdings, citations, or case names.',
    ].join(' '),
    userPrompt: [
      `Forum: ${params.forum ?? 'unknown'}`,
      `Jurisdiction: ${params.jurisdiction ?? 'unknown'}`,
      `Current issues: ${params.signals.issues.join(', ') || 'none'}`,
      `Current acts: ${params.signals.acts.join(', ') || 'none'}`,
      `Current sections: ${params.signals.sections.join(', ') || 'none'}`,
      `Facts: ${params.signals.combinedText.slice(0, 4000)}`,
      'Output format: {"issues":["injunction_relief"],"topical_terms":["possession"],"negative_terms":["cheque dishonour"],"precedent_queries":["temporary injunction possession India"],"statute_queries":["Order 39 CPC temporary injunction"]}',
    ].join('\n'),
    temperature: 0.1,
    maxTokens: 320,
    schema: retrievalPlannerHintsSchema,
    llmConfig: params.llmConfig,
  });

  if (!llm) {
    return null;
  }

  return {
    issues: dedupeStrings(
      (llm.issues ?? []).map((item) => normalizeText(item).replace(/\s+/g, '_')).filter((item) => item.length >= 3),
      12
    ),
    topicalTerms: dedupeStrings((llm.topical_terms ?? []).map((item) => normalizeText(item)), 10),
    negativeTerms: dedupeStrings((llm.negative_terms ?? []).map((item) => normalizeText(item)), 8),
    precedentQueries: dedupeStrings(llm.precedent_queries ?? [], 8),
    statuteQueries: dedupeStrings(llm.statute_queries ?? [], 8),
  };
}

function buildRetrievalPlan(params: {
  signals: ParsedSignals;
  issues: string[];
  forum: string | null;
  jurisdiction: string | null;
  hints?: {
    topicalTerms: string[];
    negativeTerms: string[];
    precedentQueries: string[];
    statuteQueries: string[];
  } | null;
}): RetrievalPlan {
  const issues = dedupeStrings(params.issues, 12);
  const domains = dedupeStrings(
    [
      ...params.signals.domains,
      ...issues.flatMap((tag) => ISSUE_PATTERNS.filter((item) => item.tag === tag).map((item) => item.domain)),
    ],
    10
  );
  const acts = dedupeStrings(params.signals.acts, 12);
  const salientTerms = dedupeStrings(
    [...params.signals.salientTerms, ...(params.hints?.topicalTerms ?? [])].filter((item) => item.length >= 3),
    10
  );
  const negativeTerms = dedupeStrings(params.hints?.negativeTerms ?? [], 8);
  const statuteQueries = dedupeStrings(
    [
      ...issues.map((issue) => `India Code ${titleFromTag(issue)} statutory provisions`),
      ...issues.flatMap(
        (issue) =>
          ISSUE_PATTERNS.find((item) => item.tag === issue)?.queryTerms.map(
            (term) => `${term} statutory provisions India`
          ) ?? []
      ),
      ...acts.slice(0, 6).map((act) => `${act} relevant sections and rules`),
      ...params.signals.sections.slice(0, 8).map((section) => `${section} Indian law`),
      ...salientTerms.slice(0, 4).map((term) => `${term} India bare act provision`),
      ...(params.hints?.statuteQueries ?? []),
    ],
    14
  );
  const precedentQueries = dedupeStrings(
    [
      ...issues.map(
        (issue) =>
          `${titleFromTag(issue)} Indian judgment ${params.forum ?? ''} ${params.jurisdiction ?? ''}`.trim()
      ),
      ...issues.flatMap(
        (issue) =>
          ISSUE_PATTERNS.find((item) => item.tag === issue)?.queryTerms.map(
            (term) => `${term} Indian precedent ${params.jurisdiction ?? ''}`.trim()
          ) ?? []
      ),
      ...acts.slice(0, 6).map((act) => `${act} latest precedent India`),
      ...params.signals.sections
        .slice(0, 6)
        .map((section) => `${section} latest Supreme Court or High Court judgment`),
      ...salientTerms
        .slice(0, 4)
        .map((term) => `${term} ${params.forum ?? 'India'} judgment ${params.jurisdiction ?? ''}`.trim()),
      ...(params.hints?.precedentQueries ?? []),
    ],
    16
  ).map((text) => {
    const queryIssues = issues.filter((issue) => normalizeText(text).includes(normalizeText(titleFromTag(issue))));
    return {
      text,
      reason: queryIssues.length ? 'issue_or_act_focus' : 'salient_term_focus',
      anchorTags: queryIssues.length ? queryIssues : issues.slice(0, 2),
    };
  });

  return {
    issues,
    acts,
    sections: params.signals.sections,
    domains,
    salientTerms,
    negativeTerms,
    statuteQueries,
    precedentQueries,
  };
}

function generatePrecedentTitleHints(plan: RetrievalPlan) {
  return dedupeStrings(
    [
      ...plan.acts.map((act) => act.replace(/,\s*\d{4}$/, '')),
      ...plan.issues.map((issue) => titleFromTag(issue)),
      ...plan.salientTerms.slice(0, 4),
    ],
    6
  );
}

function reciprocalRankFusion(rank: number, weight = 1, k = 60) {
  return weight / (k + rank);
}

function scoreTermCoverage(text: string, terms: string[]) {
  if (!terms.length) return 0;
  const normalized = normalizeText(text);
  const hits = terms.filter((term) => normalized.includes(normalizeText(term))).length;
  return hits / terms.length;
}

function scoreAuthorityTopicality(params: {
  candidateText: string;
  candidateIssues: string[];
  candidateActs: string[];
  candidateDomains: string[];
  candidateSections: string[];
  input: Pick<PrecedentAdapterInput | StatuteAdapterInput, 'issues' | 'acts' | 'sections' | 'domains' | 'salientTerms' | 'negativeTerms'>;
}) {
  const issueScore = params.input.issues.length ? arrayOverlapScore(params.candidateIssues, params.input.issues) : 0.55;
  const domainScore = params.input.domains.length
    ? arrayOverlapScore(params.candidateDomains, params.input.domains)
    : 0.55;
  const actScore = params.input.acts.length ? arrayOverlapScore(params.candidateActs, params.input.acts) : 0.5;
  const sectionScore = params.input.sections.length
    ? arrayOverlapScore(params.candidateSections, params.input.sections)
    : 0.45;
  const salientScore = scoreTermCoverage(params.candidateText, params.input.salientTerms);
  const negativePenalty = scoreTermCoverage(params.candidateText, params.input.negativeTerms);
  const disjointDomainPenalty =
    params.input.domains.length > 0 &&
    params.candidateDomains.length > 0 &&
    arrayOverlapScore(params.candidateDomains, params.input.domains) === 0
      ? 0.45
      : 0;
  const disjointActPenalty =
    params.input.acts.length > 0 &&
    params.candidateActs.length > 0 &&
    arrayOverlapScore(params.candidateActs, params.input.acts) === 0
      ? 0.35
      : 0;
  const score = clamp(
    issueScore * 0.32 +
      domainScore * 0.22 +
      actScore * 0.18 +
      salientScore * 0.16 +
      sectionScore * 0.12 -
      negativePenalty * 0.45 -
      disjointDomainPenalty -
      disjointActPenalty,
    0,
    1
  );
  const accepted = !(
    score < 0.24 ||
    (issueScore === 0 && actScore === 0 && salientScore < 0.15) ||
    (domainScore === 0 && actScore === 0 && params.input.domains.length > 0 && params.input.acts.length > 0)
  );

  return { score, accepted };
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
    id: 'stat-dv-shared-household',
    authorityType: 'statute',
    title: 'Protection of Women from Domestic Violence Act, 2005 - Sections 17 and 19',
    actName: 'Protection of Women from Domestic Violence Act, 2005',
    sectionRef: 'Sections 17 and 19',
    proposition:
      'Residence rights and residence orders under the Domestic Violence Act turn on the statutory concept of shared household and the relief sought.',
    issueTags: ['domestic_violence', 'family_dispute', 'property_dispute'],
    sourceUrl: 'https://www.indiacode.nic.in',
  },
  {
    id: 'stat-senior-citizen-22',
    authorityType: 'statute',
    title: 'Maintenance and Welfare of Parents and Senior Citizens Act, 2007 - Section 22',
    actName: 'Maintenance and Welfare of Parents and Senior Citizens Act, 2007',
    sectionRef: 'Section 22',
    proposition:
      'State mechanisms for protection of life and property of senior citizens may be invoked in residence and eviction-related disputes involving parents or senior citizens.',
    issueTags: ['senior_citizen_protection', 'property_dispute'],
    sourceUrl: 'https://www.indiacode.nic.in',
  },
  {
    id: 'stat-arb-9',
    authorityType: 'statute',
    title: 'Arbitration and Conciliation Act, 1996 - Section 9',
    actName: 'Arbitration and Conciliation Act, 1996',
    sectionRef: 'Section 9',
    proposition: 'Courts may grant interim measures before, during, or after arbitral proceedings in aid of arbitration.',
    issueTags: ['arbitration', 'injunction_relief'],
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
    const picked = LOCAL_STATUTE_CATALOG.map((row) => {
      const rowText = `${row.title} ${row.proposition} ${row.actName} ${row.sectionRef ?? ''} ${row.ruleRef ?? ''}`;
      const inferred = inferIssuesAndDomains(rowText);
      const scored = scoreAuthorityTopicality({
        candidateText: rowText,
        candidateIssues: dedupeStrings([...row.issueTags, ...inferred.issues]),
        candidateActs: dedupeStrings([row.actName, ...actsForIssues(row.issueTags), ...inferred.acts]),
        candidateDomains: dedupeStrings([...domainsForIssues(row.issueTags), ...inferred.domains]),
        candidateSections: parseSections(rowText),
        input,
      });
      return { row, scored };
    })
      .filter((item) => item.scored.accepted)
      .sort((lhs, rhs) => rhs.scored.score - lhs.scored.score)
      .slice(0, 12);

    const now = nowIso();
    return picked.map(({ row, scored }, index) => {
      const relevance = clamp(scored.score * 0.78 + (0.9 - index * 0.04) * 0.22, 0.42, 0.95);
      return {
        id: row.id,
        authorityType: row.authorityType,
        source: 'india_code' as const,
        sourceUrl: row.sourceUrl,
        title: row.title,
        proposition: row.proposition,
        issueTags: dedupeStrings(row.issueTags, 4),
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
    const baseUrl = getAgentsEnv().INDIA_CODE_SEARCH_URL?.trim();
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
        const proposition =
          pickString(row, ['summary', 'proposition', 'holding']) ??
          'Statutory proposition from India Code search connector.';
        const text = `${title} ${proposition} ${actName} ${sectionRef ?? ''}`;
        const inferred = inferIssuesAndDomains(text);
        const scored = scoreAuthorityTopicality({
          candidateText: text,
          candidateIssues: inferred.issues,
          candidateActs: dedupeStrings([actName, ...inferred.acts]),
          candidateDomains: dedupeStrings([...domainsForIssues(inferred.issues), ...inferred.domains]),
          candidateSections: parseSections(text),
          input,
        });
        if (!scored.accepted) continue;
        out.push({
          id: `india-code-${createHash('md5').update(`${title}|${sourceUrl}`).digest('hex')}`,
          authorityType: 'statute',
          source: 'india_code',
          sourceUrl,
          title,
          proposition,
          issueTags: inferred.issues.length ? inferred.issues.slice(0, 4) : input.issues.slice(0, 3),
          relevanceScore: Number(scored.score.toFixed(2)),
          courtPriorityScore: 1,
          freshnessScore: 0.7,
          overallScore: Number(scored.score.toFixed(2)),
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
    const checkedAt = input.checkedAt;
    const searches = await Promise.all(
      input.queries.slice(0, 6).map(async (query) => ({
        query,
        hits: await searchKanoonDetailed({
          query: query.text,
          maxResults: 5,
          titleHint: input.titleHints[0] ?? null,
        }),
      }))
    );
    const hitMap = new Map<
      string,
      {
        hit: KanoonSearchHit;
        score: number;
        anchorTags: Set<string>;
        matchedQueries: string[];
      }
    >();

    for (const result of searches) {
      const weight =
        result.query.reason === 'issue_or_act_focus'
          ? 1
          : result.query.reason === 'salient_term_focus'
            ? 0.9
            : 0.8;
      result.hits.forEach((hit, index) => {
        const existing = hitMap.get(hit.tid);
        const fusedScore = reciprocalRankFusion(index + 1, weight);
        if (existing) {
          existing.score += fusedScore;
          result.query.anchorTags.forEach((tag) => existing.anchorTags.add(tag));
          existing.matchedQueries.push(result.query.text);
          return;
        }
        hitMap.set(hit.tid, {
          hit,
          score: fusedScore,
          anchorTags: new Set(result.query.anchorTags),
          matchedQueries: [result.query.text],
        });
      });
    }

    const topDocs = Array.from(hitMap.values())
      .sort((lhs, rhs) => rhs.score - lhs.score)
      .slice(0, 12);

    const enriched = await Promise.all(
      topDocs.map(async (entry) => {
        const fragment = await fetchKanoonDocumentFragment(entry.hit.tid, entry.matchedQueries[0] ?? input.queries[0]?.text ?? '');
        const meta = await fetchKanoonDocumentMeta(entry.hit.tid);
        const candidateText = [
          entry.hit.title,
          entry.hit.headline,
          fragment?.text ?? '',
          meta?.citationText ?? '',
          meta?.bench ?? '',
          meta?.court ?? '',
        ]
          .filter(Boolean)
          .join(' ');
        const inferred = inferIssuesAndDomains(candidateText);
        const scored = scoreAuthorityTopicality({
          candidateText,
          candidateIssues: dedupeStrings([...entry.anchorTags, ...inferred.issues], 6),
          candidateActs: dedupeStrings([...actsForIssues([...entry.anchorTags, ...inferred.issues]), ...inferred.acts]),
          candidateDomains: dedupeStrings([...domainsForIssues([...entry.anchorTags, ...inferred.issues]), ...inferred.domains]),
          candidateSections: parseSections(candidateText),
          input,
        });
        if (!scored.accepted) return null;

        const parsedDate = parseDateFromText(`${meta?.date ?? ''} ${entry.hit.date ?? ''} ${candidateText}`);
        const date = parsedDate ?? checkedAt.slice(0, 10);
        const court = meta?.court ?? entry.hit.court ?? inferCourtFromTitle(entry.hit.title);
        const citationStrength = meta?.citedByCount ? clamp(Math.log1p(meta.citedByCount) / 6, 0.1, 1) : 0.35;
        const rrfScore = clamp(entry.score * 40, 0.18, 1);
        const relevance = clamp(rrfScore * 0.45 + scored.score * 0.4 + citationStrength * 0.15, 0.25, 0.97);

        return {
          id: `prec-k-${entry.hit.tid}`,
          authorityType: 'precedent' as const,
          source: 'indiankanoon' as const,
          sourceUrl: entry.hit.url,
          title: entry.hit.title,
          proposition: fragment?.text ?? entry.hit.headline,
          issueTags: dedupeStrings([...entry.anchorTags, ...inferred.issues], 4),
          relevanceScore: Number(relevance.toFixed(2)),
          courtPriorityScore: courtPriorityScore(court),
          freshnessScore: parsedDate ? 0.8 : 0.36,
          overallScore: Number(relevance.toFixed(2)),
          retrievedAt: checkedAt,
          verified: true,
          caseName: entry.hit.title,
          court,
          date,
          citationText: meta?.citationText ?? entry.hit.title,
          ...(fragment?.paragraphRefs.length ? { paragraphRefs: fragment.paragraphRefs } : {}),
          ...(fragment?.pageRefs.length ? { pageRefs: fragment.pageRefs } : {}),
          forumFitScore: 0.5,
          jurisdictionFitScore: 0.5,
          ...(parsedDate ? {} : { isDateInferred: true }),
        };
      })
    );

    return enriched.flatMap((item) => (item ? [item] : []));
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
        const payload = await safeJsonFetch(
          `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}q=${encodeURIComponent(query.text)}`
        );
        const rows = pickResultsArray(payload).slice(0, 4);
        for (const row of rows) {
          const caseName = pickString(row, ['case_name', 'title', 'name']) ?? `Precedent for ${query.text}`;
          const neutralCitation = pickString(row, ['neutral_citation']);
          const caseNumber = pickString(row, ['case_number']);
          const date =
            parseDateFromText(
              `${pickString(row, ['date', 'judgment_date']) ?? ''} ${pickString(row, ['title', 'summary']) ?? ''}`
            ) ?? input.checkedAt.slice(0, 10);
          const court = pickString(row, ['court', 'court_name']) ?? params.courtHint ?? inferCourtFromTitle(caseName);
          const sourceUrl = pickString(row, ['url', 'source_url', 'link']) ?? baseUrl;
          const proposition =
            pickString(row, ['summary', 'holding', 'proposition']) ??
            'Precedent extracted from configured remote connector.';
          const candidateText = `${caseName} ${proposition} ${court} ${date}`;
          const inferred = inferIssuesAndDomains(candidateText);
          const scored = scoreAuthorityTopicality({
            candidateText,
            candidateIssues: dedupeStrings([...query.anchorTags, ...inferred.issues]),
            candidateActs: dedupeStrings([...actsForIssues([...query.anchorTags, ...inferred.issues]), ...inferred.acts]),
            candidateDomains: dedupeStrings([...domainsForIssues([...query.anchorTags, ...inferred.issues]), ...inferred.domains]),
            candidateSections: parseSections(candidateText),
            input,
          });
          if (!scored.accepted) continue;
          out.push({
            id: `${params.id}-${createHash('md5').update(`${caseName}|${sourceUrl}`).digest('hex')}`,
            authorityType: 'precedent',
            source: params.source,
            sourceUrl,
            title: caseName,
            proposition,
            issueTags: dedupeStrings([...query.anchorTags, ...inferred.issues], 4),
            relevanceScore: Number(scored.score.toFixed(2)),
            courtPriorityScore: courtPriorityScore(court),
            freshnessScore: 0.7,
            overallScore: Number(scored.score.toFixed(2)),
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
  acts: string[];
  domains: string[];
  sections: string[];
  salientTerms: string[];
  negativeTerms: string[];
  checkedAt: string;
  lookbackMonths: number;
}) {
  const enriched = params.precedents
    .map((item) => {
      const candidateText = `${item.caseName} ${item.title} ${item.proposition} ${item.court} ${item.citationText}`;
      const inferred = inferIssuesAndDomains(candidateText);
      const topicality = scoreAuthorityTopicality({
        candidateText,
        candidateIssues: dedupeStrings([...item.issueTags, ...inferred.issues]),
        candidateActs: dedupeStrings([...actsForIssues(item.issueTags), ...inferred.acts]),
        candidateDomains: dedupeStrings([...domainsForIssues(item.issueTags), ...inferred.domains]),
        candidateSections: parseSections(candidateText),
        input: {
          issues: params.issues,
          acts: params.acts,
          sections: params.sections,
          domains: params.domains,
          salientTerms: params.salientTerms,
          negativeTerms: params.negativeTerms,
        },
      });
      if (!topicality.accepted) return null;

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
      issueOverlap * 0.26 +
        topicality.score * 0.2 +
        item.courtPriorityScore * 0.18 +
        forumFit * 0.14 +
        jurisdictionFit * 0.1 +
        freshness * 0.08 +
        sectionMatch * 0.04,
      0.15,
      0.99
    );

    return {
      ...item,
      issueTags: dedupeStrings([...item.issueTags, ...inferred.issues], 4),
      forumFitScore: Number(forumFit.toFixed(2)),
      jurisdictionFitScore: Number(jurisdictionFit.toFixed(2)),
      freshnessScore: Number(freshness.toFixed(2)),
      overallScore: Number(overall.toFixed(2)),
      relevanceScore: Number(
        clamp((item.relevanceScore + issueOverlap + sectionMatch + topicality.score) / 4, 0.2, 0.97).toFixed(2)
      ),
    };
    })
    .filter((item): item is PrecedentAuthority => Boolean(item));

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
  const retrievalHints = await maybeBuildRetrievalHintsWithLlm({
    signals,
    forum: forumUsed,
    jurisdiction: jurisdictionUsed,
    ...(input.llmConfig ? { llmConfig: input.llmConfig } : {}),
  });
  const issuesIdentified = dedupeStrings([...signals.issues, ...(retrievalHints?.issues ?? [])], 12);
  const retrievalPlan = buildRetrievalPlan({
    signals,
    issues: issuesIdentified,
    forum: forumUsed,
    jurisdiction: jurisdictionUsed,
    ...(retrievalHints
      ? {
          hints: {
            topicalTerms: retrievalHints.topicalTerms,
            negativeTerms: retrievalHints.negativeTerms,
            precedentQueries: retrievalHints.precedentQueries,
            statuteQueries: retrievalHints.statuteQueries,
          },
        }
      : {}),
  });

  const queryHash = buildQueryHash({
    issues: retrievalPlan.issues,
    acts: retrievalPlan.acts,
    sections: retrievalPlan.sections,
    domains: retrievalPlan.domains,
    salientTerms: retrievalPlan.salientTerms,
    forum: forumUsed,
    jurisdiction: jurisdictionUsed,
    reliefType: signals.reliefType,
  });

  const nowMs = Date.now();
  const entry = await getCachedResearchEntry(queryHash);
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
        queries: retrievalPlan.statuteQueries,
        issues: retrievalPlan.issues,
        acts: retrievalPlan.acts,
        sections: retrievalPlan.sections,
        domains: retrievalPlan.domains,
        salientTerms: retrievalPlan.salientTerms,
        negativeTerms: retrievalPlan.negativeTerms,
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
        queries: retrievalPlan.precedentQueries,
        titleHints: generatePrecedentTitleHints(retrievalPlan),
        issues: retrievalPlan.issues,
        acts: retrievalPlan.acts,
        sections: retrievalPlan.sections,
        domains: retrievalPlan.domains,
        salientTerms: retrievalPlan.salientTerms,
        negativeTerms: retrievalPlan.negativeTerms,
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
      issues: retrievalPlan.issues,
      acts: retrievalPlan.acts,
      domains: retrievalPlan.domains,
      sections: retrievalPlan.sections,
      salientTerms: retrievalPlan.salientTerms,
      negativeTerms: retrievalPlan.negativeTerms,
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

  await setCachedResearchEntry(queryHash, entry);

  const authorityCoverageScore = computeCoverage({
    issues: retrievalPlan.issues,
    statutes,
    leading,
    latest,
  });

  const unresolvedIssues = retrievalPlan.issues.filter((issue) => {
    const inStatutes = statutes.some((item) => item.issueTags.includes(issue));
    const inPrecedents =
      leading.some((item) => item.issueTags.includes(issue)) ||
      latest.some((item) => item.issueTags.includes(issue));
    return !inStatutes && !inPrecedents;
  });

  return {
    queryHash,
    issuesIdentified: retrievalPlan.issues,
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
