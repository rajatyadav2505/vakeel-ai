import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAppUser } from '@/lib/auth';

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface UserListPreferences {
  defaultPageSize: number;
  realtimeUpdatesEnabled: boolean;
}

function normalizePagination(options?: PaginationOptions) {
  const rawPage = Number(options?.page ?? 1);
  const rawPageSize = Number(options?.pageSize ?? 10);

  const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
  const pageSize = Number.isFinite(rawPageSize)
    ? Math.min(50, Math.max(5, Math.floor(rawPageSize)))
    : 10;

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  return { page, pageSize, from, to };
}

export async function getUserListPreferences(): Promise<UserListPreferences> {
  const user = await requireAppUser();
  const supabase = createSupabaseServerClient();
  const result = await supabase
    .from('user_settings')
    .select('default_page_size,realtime_updates_enabled')
    .eq('owner_user_id', user.userId)
    .maybeSingle();

  if (result.error || !result.data) {
    return {
      defaultPageSize: 12,
      realtimeUpdatesEnabled: true,
    };
  }

  return {
    defaultPageSize: Math.min(50, Math.max(5, result.data.default_page_size ?? 12)),
    realtimeUpdatesEnabled: result.data.realtime_updates_enabled ?? true,
  };
}

export async function getDashboardSnapshot() {
  const user = await requireAppUser();
  const supabase = createSupabaseServerClient();

  const [casesRes, simRes, petitionsRes] = await Promise.all([
    supabase
      .from('cases')
      .select('id, title, case_type, stage, court_name, updated_at')
      .eq('owner_user_id', user.userId)
      .order('updated_at', { ascending: false })
      .limit(8),
    supabase
      .from('simulations')
      .select('id, headline, mode, confidence, win_probability, created_at')
      .eq('owner_user_id', user.userId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('petitions')
      .select('id, petition_type, court_template, confidence, case_id, created_at')
      .eq('owner_user_id', user.userId)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  if (casesRes.error) console.error('[queries] cases fetch error:', casesRes.error.message);
  if (simRes.error) console.error('[queries] simulations fetch error:', simRes.error.message);
  if (petitionsRes.error) console.error('[queries] petitions fetch error:', petitionsRes.error.message);

  return {
    cases: casesRes.data ?? [],
    simulations: simRes.data ?? [],
    petitions: petitionsRes.data ?? [],
    role: user.role,
    user,
  };
}

export async function getCaseById(caseId: string) {
  const user = await requireAppUser();
  const supabase = createSupabaseServerClient();

  const [caseRes, simulationRes, docsRes] = await Promise.all([
    supabase
      .from('cases')
      .select(
        'id, title, case_type, stage, court_name, summary, client_name, opponent_name, jurisdiction, cnr_number, evidence_graph_json, case_sensitivity, evidence_extracted_at'
      )
      .eq('id', caseId)
      .eq('owner_user_id', user.userId)
      .single(),
    supabase
      .from('simulations')
      .select('id, headline, mode, confidence, win_probability, created_at')
      .eq('case_id', caseId)
      .eq('owner_user_id', user.userId)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('case_documents')
      .select(
        'id, file_name, file_path, document_type, parser_status, size_bytes, is_privileged, created_at'
      )
      .eq('case_id', caseId)
      .eq('owner_user_id', user.userId)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  if (caseRes.error && caseRes.error.code !== 'PGRST116') {
    console.error('[queries] case fetch error:', caseRes.error.message);
  }
  if (docsRes.error && docsRes.error.code !== 'PGRST116') {
    console.error('[queries] case documents fetch error:', docsRes.error.message);
  }

  return {
    caseData: caseRes.data,
    latestSimulation: simulationRes.data?.[0] ?? null,
    evidenceDocuments: docsRes.data ?? [],
  };
}

export async function getSimulationById(simulationId: string) {
  const user = await requireAppUser();
  const supabase = createSupabaseServerClient();
  const res = await supabase
    .from('simulations')
    .select('id, headline, mode, confidence, win_probability, strategy_json, case_id, created_at')
    .eq('id', simulationId)
    .eq('owner_user_id', user.userId)
    .single();

  if (res.error && res.error.code !== 'PGRST116') {
    console.error('[queries] simulation fetch error:', res.error.message);
  }

  return res.data;
}

export async function getSimulationsPage(options?: PaginationOptions): Promise<
  PaginatedResult<{
    id: string;
    headline: string;
    mode: string;
    confidence: number | null;
    win_probability: number | null;
    created_at: string;
  }>
> {
  const user = await requireAppUser();
  const supabase = createSupabaseServerClient();
  const { page, pageSize, from, to } = normalizePagination(options);

  const res = await supabase
    .from('simulations')
    .select('id, headline, mode, confidence, win_probability, created_at', { count: 'exact' })
    .eq('owner_user_id', user.userId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (res.error) console.error('[queries] simulations list error:', res.error.message);

  const total = res.count ?? 0;
  return {
    items: res.data ?? [],
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getPetitionsPage(options?: PaginationOptions): Promise<
  PaginatedResult<{
    id: string;
    petition_type: string;
    court_template: string;
    confidence: number | null;
    case_id: string;
    created_at: string;
  }>
> {
  const user = await requireAppUser();
  const supabase = createSupabaseServerClient();
  const { page, pageSize, from, to } = normalizePagination(options);
  const res = await supabase
    .from('petitions')
    .select('id, petition_type, court_template, confidence, case_id, created_at', {
      count: 'exact',
    })
    .eq('owner_user_id', user.userId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (res.error) console.error('[queries] petitions list error:', res.error.message);

  const total = res.count ?? 0;
  return {
    items: res.data ?? [],
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getCasesPage(options?: PaginationOptions): Promise<
  PaginatedResult<{
    id: string;
    title: string;
    case_type: string;
    stage: string;
    court_name: string | null;
    updated_at: string;
  }>
> {
  const user = await requireAppUser();
  const supabase = createSupabaseServerClient();
  const { page, pageSize, from, to } = normalizePagination(options);
  const res = await supabase
    .from('cases')
    .select('id, title, case_type, stage, court_name, updated_at', { count: 'exact' })
    .eq('owner_user_id', user.userId)
    .order('updated_at', { ascending: false })
    .range(from, to);

  if (res.error) console.error('[queries] cases list error:', res.error.message);

  const total = res.count ?? 0;
  return {
    items: res.data ?? [],
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
