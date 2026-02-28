import { env } from '@/lib/env';

export type CaseStage = 'intake' | 'analysis' | 'filing' | 'hearing' | 'closed';

export interface EcourtsCaseSnapshot {
  cnrNumber: string;
  stage: string | null;
  normalizedCaseStage: CaseStage | null;
  caseStatus: string | null;
  courtName: string | null;
  caseTitle: string | null;
  nextHearingDate: string | null;
  lastUpdatedAt: string | null;
  sourceUrl: string;
  raw: unknown;
}

interface EcourtsFetchResult {
  configured: boolean;
  snapshot: EcourtsCaseSnapshot | null;
}

function normalizeCnr(cnrNumber: string) {
  return cnrNumber.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

function parseDateToIso(value: string | null | undefined) {
  if (!value) return null;
  const cleaned = value.trim();
  if (!cleaned) return null;

  const direct = new Date(cleaned);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString().slice(0, 10);
  }

  const dmy = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!dmy) return null;

  const dayRaw = dmy[1];
  const monthRaw = dmy[2];
  const rawYear = dmy[3];
  if (!dayRaw || !monthRaw || !rawYear) return null;

  const day = dayRaw.padStart(2, '0');
  const month = monthRaw.padStart(2, '0');
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  const iso = `${year}-${month}-${day}`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

function pickFirstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function pickFirstRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload) return null;
  if (Array.isArray(payload)) {
    const first = payload.find((item) => item && typeof item === 'object');
    return first && typeof first === 'object' ? (first as Record<string, unknown>) : null;
  }

  if (typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;

  const nestedArrayKeys = ['data', 'results', 'items', 'cases', 'records', 'response'];
  for (const key of nestedArrayKeys) {
    const value = record[key];
    if (Array.isArray(value)) {
      const first = value.find((item) => item && typeof item === 'object');
      if (first && typeof first === 'object') return first as Record<string, unknown>;
    }
  }

  const nestedObjectKeys = ['data', 'result', 'case', 'payload'];
  for (const key of nestedObjectKeys) {
    const value = record[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }

  return record;
}

export function mapEcourtsStageToCaseStage(value: string | null): CaseStage | null {
  if (!value) return null;
  const stage = value.toLowerCase();

  if (/(disposed|judgment|decree|final order|closed|decided)/i.test(stage)) return 'closed';
  if (/(evidence|argument|cross|trial|hearing|final hearing)/i.test(stage)) return 'hearing';
  if (/(filing|registration|admission|notice issued|process fee)/i.test(stage)) return 'filing';
  if (/(scrutiny|analysis|investigation|legal research|review)/i.test(stage)) return 'analysis';
  return 'intake';
}

function toSnapshot(params: {
  cnrNumber: string;
  payload: unknown;
  sourceUrl: string;
}): EcourtsCaseSnapshot | null {
  const record = pickFirstRecord(params.payload);
  if (!record) return null;

  const stage = pickFirstString(record, ['stage', 'case_stage', 'stage_name', 'current_stage']);
  const caseStatus = pickFirstString(record, ['status', 'case_status', 'current_status']);
  const courtName = pickFirstString(record, ['court_name', 'court', 'bench', 'forum']);
  const partyDerivedTitle = [pickFirstString(record, ['petitioner']), pickFirstString(record, ['respondent'])]
    .filter((item): item is string => Boolean(item))
    .join(' vs ')
    .trim();
  const caseTitle =
    pickFirstString(record, ['case_title', 'title', 'case_name']) ??
    (partyDerivedTitle.length > 0 ? partyDerivedTitle : null);

  const nextHearingDate = parseDateToIso(
    pickFirstString(record, ['next_hearing_date', 'next_date', 'next_listing_date'])
  );
  const lastUpdatedAt = parseDateToIso(
    pickFirstString(record, ['last_updated_at', 'updated_at', 'last_order_date', 'order_date'])
  );

  const hasUsefulData = Boolean(stage || caseStatus || courtName || nextHearingDate || caseTitle);
  if (!hasUsefulData) return null;

  const normalizedCaseStage = mapEcourtsStageToCaseStage(stage ?? caseStatus);
  return {
    cnrNumber: params.cnrNumber,
    stage,
    normalizedCaseStage,
    caseStatus,
    courtName,
    caseTitle,
    nextHearingDate,
    lastUpdatedAt,
    sourceUrl: params.sourceUrl,
    raw: params.payload,
  };
}

function buildEcourtsUrl(baseUrl: string, cnrNumber: string) {
  const url = new URL(baseUrl);
  url.searchParams.set('cnrNumber', cnrNumber);
  return url.toString();
}

export async function fetchEcourtsCaseSnapshot(cnrNumberInput: string): Promise<EcourtsFetchResult> {
  const baseUrl = env.ECOURTS_CASE_STATUS_URL?.trim();
  if (!baseUrl) {
    return { configured: false, snapshot: null };
  }

  const cnrNumber = normalizeCnr(cnrNumberInput);
  if (cnrNumber.length < 10) {
    throw new Error('Invalid CNR number format.');
  }

  const requestUrl = buildEcourtsUrl(baseUrl, cnrNumber);
  const headers: Record<string, string> = {};
  if (env.ECOURTS_API_KEY) {
    headers.Authorization = `Bearer ${env.ECOURTS_API_KEY}`;
  }

  const response = await fetch(requestUrl, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`e-Courts adapter failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  const snapshot = toSnapshot({
    cnrNumber,
    payload,
    sourceUrl: requestUrl,
  });

  return {
    configured: true,
    snapshot,
  };
}
