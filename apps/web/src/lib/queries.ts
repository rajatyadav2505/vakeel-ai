import { createSupabaseUserClient } from '@/lib/supabase/server';
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

export interface UserStrategyPreferences {
  kautilyaCeresEnabled: boolean;
  kautilyaCeresDefaultMode: 'robust_mode' | 'exploit_mode';
  kautilyaCeresComputeMode: 'fast' | 'standard' | 'full';
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
  const supabase = createSupabaseUserClient(user.supabaseAccessToken);
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

export async function getUserStrategyPreferences(): Promise<UserStrategyPreferences> {
  const user = await requireAppUser();
  const supabase = createSupabaseUserClient(user.supabaseAccessToken);
  const result = await supabase
    .from('user_settings')
    .select('kautilya_ceres_enabled,kautilya_ceres_default_mode,kautilya_ceres_compute_mode')
    .eq('owner_user_id', user.userId)
    .maybeSingle();

  if (result.error || !result.data) {
    return {
      kautilyaCeresEnabled: true,
      kautilyaCeresDefaultMode: 'robust_mode',
      kautilyaCeresComputeMode: 'standard',
    };
  }

  return {
    kautilyaCeresEnabled: result.data.kautilya_ceres_enabled ?? true,
    kautilyaCeresDefaultMode:
      result.data.kautilya_ceres_default_mode === 'exploit_mode' ? 'exploit_mode' : 'robust_mode',
    kautilyaCeresComputeMode:
      result.data.kautilya_ceres_compute_mode === 'fast'
        ? 'fast'
        : result.data.kautilya_ceres_compute_mode === 'full'
          ? 'full'
          : 'standard',
  };
}

export async function getDashboardSnapshot() {
  const user = await requireAppUser();
  const supabase = createSupabaseUserClient(user.supabaseAccessToken);

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
  if (petitionsRes.error)
    console.error('[queries] petitions fetch error:', petitionsRes.error.message);

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
  const supabase = createSupabaseUserClient(user.supabaseAccessToken);

  const [caseRes, simulationRes, docsRes] = await Promise.all([
    supabase
      .from('cases')
      .select(
        'id, title, case_type, stage, court_name, summary, client_name, opponent_name, jurisdiction, cnr_number, evidence_graph_json, case_sensitivity, evidence_extracted_at',
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
        'id, file_name, file_path, document_type, parser_status, size_bytes, is_privileged, created_at',
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
  const supabase = createSupabaseUserClient(user.supabaseAccessToken);
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
  const supabase = createSupabaseUserClient(user.supabaseAccessToken);
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

export async function getSimulationJobsOverview(limit = 8) {
  const user = await requireAppUser();
  const supabase = createSupabaseUserClient(user.supabaseAccessToken);
  const boundedLimit = Math.max(1, Math.min(20, Math.floor(limit)));
  const res = await supabase
    .from('simulation_jobs')
    .select(
      'id,mode,status,objective,attempts,last_error,result_simulation_id,queued_at,started_at,finished_at,updated_at',
    )
    .eq('owner_user_id', user.userId)
    .order('queued_at', { ascending: false })
    .limit(boundedLimit);

  if (res.error) {
    console.error('[queries] simulation jobs list error:', res.error.message);
    return [];
  }

  return res.data ?? [];
}

export async function getPetitionsPage(options?: PaginationOptions): Promise<
  PaginatedResult<{
    id: string;
    petition_type: string;
    court_template: string;
    confidence: number | null;
    case_id: string;
    created_at: string;
    review_status: string;
    current_version: number;
    last_reviewed_at: string | null;
  }>
> {
  const user = await requireAppUser();
  const supabase = createSupabaseUserClient(user.supabaseAccessToken);
  const { page, pageSize, from, to } = normalizePagination(options);
  let res: any = await supabase
    .from('petitions')
    .select(
      'id, petition_type, court_template, confidence, case_id, created_at, review_status, current_version, last_reviewed_at',
      {
        count: 'exact',
      },
    )
    .eq('owner_user_id', user.userId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (res.error) {
    // Backward compatibility when review columns are not present yet.
    res = await supabase
      .from('petitions')
      .select('id, petition_type, court_template, confidence, case_id, created_at', {
        count: 'exact',
      })
      .eq('owner_user_id', user.userId)
      .order('created_at', { ascending: false })
      .range(from, to);
  }

  if (res.error) console.error('[queries] petitions list error:', res.error.message);

  const items = (res.data ?? []).map((item: unknown) => {
    const row = item as {
      id: string;
      petition_type: string;
      court_template: string;
      confidence: number | null;
      case_id: string;
      created_at: string;
      review_status?: string | null;
      current_version?: number | null;
      last_reviewed_at?: string | null;
    };
    return {
      id: row.id,
      petition_type: row.petition_type,
      court_template: row.court_template,
      confidence: row.confidence,
      case_id: row.case_id,
      created_at: row.created_at,
      review_status: row.review_status ?? 'draft',
      current_version: Math.max(1, row.current_version ?? 1),
      last_reviewed_at: row.last_reviewed_at ?? null,
    };
  });

  const total = res.count ?? 0;
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getPetitionReviewBundle(petitionId: string) {
  const user = await requireAppUser();
  const supabase = createSupabaseUserClient(user.supabaseAccessToken);

  let petitionRes: any = await supabase
    .from('petitions')
    .select(
      'id, case_id, petition_type, court_template, body, confidence, lawyer_verified, created_at, review_status, current_version, review_notes, last_reviewed_at',
    )
    .eq('id', petitionId)
    .eq('owner_user_id', user.userId)
    .single();

  if (petitionRes.error) {
    petitionRes = (await supabase
      .from('petitions')
      .select(
        'id, case_id, petition_type, court_template, body, confidence, lawyer_verified, created_at',
      )
      .eq('id', petitionId)
      .eq('owner_user_id', user.userId)
      .single()) as typeof petitionRes;
  }

  if (petitionRes.error && petitionRes.error.code !== 'PGRST116') {
    console.error('[queries] petition review fetch error:', petitionRes.error.message);
  }

  let versionsRes: any = await supabase
    .from('petition_versions')
    .select('id, version, body, change_summary, review_action, created_at, created_by')
    .eq('petition_id', petitionId)
    .eq('owner_user_id', user.userId)
    .order('version', { ascending: false })
    .limit(25);

  if (versionsRes.error) {
    // Backward compatibility before version table migration.
    versionsRes = {
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    } as typeof versionsRes;
  }

  return {
    petition: petitionRes.data
      ? {
          ...(petitionRes.data as Record<string, unknown>),
          review_status:
            (petitionRes.data as { review_status?: string | null }).review_status ?? 'draft',
          current_version: Math.max(
            1,
            (petitionRes.data as { current_version?: number | null }).current_version ?? 1,
          ),
          review_notes: (petitionRes.data as { review_notes?: string | null }).review_notes ?? null,
          last_reviewed_at:
            (petitionRes.data as { last_reviewed_at?: string | null }).last_reviewed_at ?? null,
        }
      : null,
    versions: versionsRes.data ?? [],
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
  const supabase = createSupabaseUserClient(user.supabaseAccessToken);
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
