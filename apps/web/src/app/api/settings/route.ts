import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAppUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  DEFAULT_LLM_BASE_URL,
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_PROVIDER,
  resolveRuntimeLlmConfig,
} from '@/lib/llm-settings';
import { enforceRateLimit } from '@/lib/rate-limit';
import { sanitizePlainText } from '@/lib/utils';

const providerSchema = z.enum([
  'openai',
  'anthropic',
  'google',
  'groq',
  'ollama',
  'openrouter',
  'cerebras',
  'github',
  'deepseek',
  'sarvam',
]);
type LlmProvider = z.infer<typeof providerSchema>;
const languageSchema = z.enum(['en-IN', 'hi-IN']);
const strategyModeSchema = z.enum(['robust_mode', 'exploit_mode']);
const computeModeSchema = z.enum(['fast', 'standard', 'full']);

const updateSchema = z.object({
  llmProvider: providerSchema.optional(),
  llmModel: z.string().min(2).max(120).optional(),
  llmApiKey: z.string().max(500).optional(),
  clearLlmApiKey: z.boolean().optional(),
  llmBaseUrl: z.string().max(300).optional(),
  notificationsEnabled: z.boolean().optional(),
  realtimeUpdatesEnabled: z.boolean().optional(),
  freeTierOnly: z.boolean().optional(),
  defaultPageSize: z.number().int().min(5).max(50).optional(),
  timezone: z.string().min(2).max(100).optional(),
  preferredLanguage: languageSchema.optional(),
  kautilyaCeresEnabled: z.boolean().optional(),
  kautilyaCeresDefaultMode: strategyModeSchema.optional(),
  kautilyaCeresComputeMode: computeModeSchema.optional(),
});

const DEFAULT_SETTINGS = {
  llmProvider: DEFAULT_LLM_PROVIDER as LlmProvider,
  llmModel: DEFAULT_LLM_MODEL,
  llmBaseUrl: DEFAULT_LLM_BASE_URL,
  notificationsEnabled: true,
  realtimeUpdatesEnabled: true,
  freeTierOnly: true,
  defaultPageSize: 12,
  timezone: 'Asia/Kolkata',
  preferredLanguage: 'en-IN' as z.infer<typeof languageSchema>,
  kautilyaCeresEnabled: true,
  kautilyaCeresDefaultMode: 'robust_mode' as z.infer<typeof strategyModeSchema>,
  kautilyaCeresComputeMode: 'standard' as z.infer<typeof computeModeSchema>,
};

function maskApiKey(value: string | null | undefined) {
  if (!value) return '';
  if (value.length <= 6) return '*'.repeat(value.length);
  return `${value.slice(0, 4)}${'*'.repeat(Math.max(4, value.length - 6))}${value.slice(-2)}`;
}

function toResponse(record: {
  llm_provider?: string | null;
  llm_model?: string | null;
  llm_api_key?: string | null;
  llm_base_url?: string | null;
  notifications_enabled?: boolean | null;
  realtime_updates_enabled?: boolean | null;
  free_tier_only?: boolean | null;
  default_page_size?: number | null;
  timezone?: string | null;
  preferred_language?: string | null;
  kautilya_ceres_enabled?: boolean | null;
  kautilya_ceres_default_mode?: string | null;
  kautilya_ceres_compute_mode?: string | null;
}) {
  const llmApiKey = record.llm_api_key ?? '';
  const provider = providerSchema.safeParse(record.llm_provider);
  const preferredLanguage = languageSchema.safeParse(record.preferred_language);
  const kautilyaMode = strategyModeSchema.safeParse(record.kautilya_ceres_default_mode);
  const kautilyaCompute = computeModeSchema.safeParse(record.kautilya_ceres_compute_mode);
  const resolvedLlm = resolveRuntimeLlmConfig(record);
  return {
    llmProvider:
      resolvedLlm.provider ?? (provider.success ? provider.data : DEFAULT_SETTINGS.llmProvider),
    llmModel: resolvedLlm.model ?? record.llm_model ?? DEFAULT_SETTINGS.llmModel,
    llmBaseUrl: resolvedLlm.baseUrl ?? record.llm_base_url ?? DEFAULT_SETTINGS.llmBaseUrl,
    notificationsEnabled: record.notifications_enabled ?? DEFAULT_SETTINGS.notificationsEnabled,
    realtimeUpdatesEnabled: record.realtime_updates_enabled ?? DEFAULT_SETTINGS.realtimeUpdatesEnabled,
    freeTierOnly: resolvedLlm.freeTierOnly ?? DEFAULT_SETTINGS.freeTierOnly,
    defaultPageSize: record.default_page_size ?? DEFAULT_SETTINGS.defaultPageSize,
    timezone: record.timezone ?? DEFAULT_SETTINGS.timezone,
    preferredLanguage: preferredLanguage.success
      ? preferredLanguage.data
      : DEFAULT_SETTINGS.preferredLanguage,
    kautilyaCeresEnabled:
      record.kautilya_ceres_enabled ?? DEFAULT_SETTINGS.kautilyaCeresEnabled,
    kautilyaCeresDefaultMode: kautilyaMode.success
      ? kautilyaMode.data
      : DEFAULT_SETTINGS.kautilyaCeresDefaultMode,
    kautilyaCeresComputeMode: kautilyaCompute.success
      ? kautilyaCompute.data
      : DEFAULT_SETTINGS.kautilyaCeresComputeMode,
    hasLlmApiKey: Boolean(llmApiKey),
    llmApiKeyMasked: maskApiKey(llmApiKey),
  };
}

async function getSettingsForUser(userId: string) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('user_settings')
    .select(
      'owner_user_id,llm_provider,llm_model,llm_api_key,llm_base_url,notifications_enabled,realtime_updates_enabled,free_tier_only,default_page_size,timezone,preferred_language,kautilya_ceres_enabled,kautilya_ceres_default_mode,kautilya_ceres_compute_mode'
    )
    .eq('owner_user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[settings] failed to fetch settings:', error.message);
    return null;
  }

  if (data) return data;

  const { data: inserted, error: insertError } = await supabase
    .from('user_settings')
    .upsert(
      {
        owner_user_id: userId,
        llm_provider: DEFAULT_SETTINGS.llmProvider,
        llm_model: DEFAULT_SETTINGS.llmModel,
        llm_base_url: DEFAULT_SETTINGS.llmBaseUrl,
        free_tier_only: DEFAULT_SETTINGS.freeTierOnly,
        default_page_size: DEFAULT_SETTINGS.defaultPageSize,
        timezone: DEFAULT_SETTINGS.timezone,
        preferred_language: DEFAULT_SETTINGS.preferredLanguage,
        kautilya_ceres_enabled: DEFAULT_SETTINGS.kautilyaCeresEnabled,
        kautilya_ceres_default_mode: DEFAULT_SETTINGS.kautilyaCeresDefaultMode,
        kautilya_ceres_compute_mode: DEFAULT_SETTINGS.kautilyaCeresComputeMode,
      },
      { onConflict: 'owner_user_id' }
    )
    .select(
      'owner_user_id,llm_provider,llm_model,llm_api_key,llm_base_url,notifications_enabled,realtime_updates_enabled,free_tier_only,default_page_size,timezone,preferred_language,kautilya_ceres_enabled,kautilya_ceres_default_mode,kautilya_ceres_compute_mode'
    )
    .single();

  if (insertError) {
    console.error('[settings] failed to initialize settings row:', insertError.message);
    return null;
  }

  return inserted;
}

export async function GET() {
  try {
    const user = await requireAppUser();
    await enforceRateLimit(`settings-get:${user.userId}`, 180);
    const record = await getSettingsForUser(user.userId);

    return NextResponse.json({
      ok: true,
      settings: record ? toResponse(record) : { ...DEFAULT_SETTINGS, hasLlmApiKey: false, llmApiKeyMasked: '' },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAppUser();
    await enforceRateLimit(`settings-put:${user.userId}`, 90);

    const payload = updateSchema.parse(await request.json());
    const update: Record<string, unknown> = {
      owner_user_id: user.userId,
      updated_at: new Date().toISOString(),
    };

    if (payload.llmProvider) update.llm_provider = payload.llmProvider;
    if (payload.llmModel !== undefined) update.llm_model = sanitizePlainText(payload.llmModel);
    if (payload.llmBaseUrl !== undefined) update.llm_base_url = sanitizePlainText(payload.llmBaseUrl);
    if (payload.notificationsEnabled !== undefined) {
      update.notifications_enabled = payload.notificationsEnabled;
    }
    if (payload.realtimeUpdatesEnabled !== undefined) {
      update.realtime_updates_enabled = payload.realtimeUpdatesEnabled;
    }
    if (payload.freeTierOnly !== undefined) {
      update.free_tier_only = payload.freeTierOnly;
    }
    if (payload.defaultPageSize !== undefined) update.default_page_size = payload.defaultPageSize;
    if (payload.timezone !== undefined) update.timezone = sanitizePlainText(payload.timezone);
    if (payload.preferredLanguage !== undefined) update.preferred_language = payload.preferredLanguage;
    if (payload.kautilyaCeresEnabled !== undefined) {
      update.kautilya_ceres_enabled = payload.kautilyaCeresEnabled;
    }
    if (payload.kautilyaCeresDefaultMode !== undefined) {
      update.kautilya_ceres_default_mode = payload.kautilyaCeresDefaultMode;
    }
    if (payload.kautilyaCeresComputeMode !== undefined) {
      update.kautilya_ceres_compute_mode = payload.kautilyaCeresComputeMode;
    }
    if (payload.clearLlmApiKey) update.llm_api_key = null;
    if (payload.llmApiKey !== undefined && payload.llmApiKey.trim().length > 0) {
      update.llm_api_key = payload.llmApiKey.trim();
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('user_settings')
      .upsert(update, { onConflict: 'owner_user_id' })
    .select(
      'owner_user_id,llm_provider,llm_model,llm_api_key,llm_base_url,notifications_enabled,realtime_updates_enabled,free_tier_only,default_page_size,timezone,preferred_language,kautilya_ceres_enabled,kautilya_ceres_default_mode,kautilya_ceres_compute_mode'
    )
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Failed to save settings.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, settings: toResponse(data) });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
