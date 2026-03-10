export type LlmProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'groq'
  | 'ollama'
  | 'openrouter'
  | 'cerebras'
  | 'github'
  | 'deepseek'
  | 'sarvam';

export interface StoredLlmSettings {
  llm_provider?: string | null;
  llm_model?: string | null;
  llm_api_key?: string | null;
  llm_base_url?: string | null;
  free_tier_only?: boolean | null;
  preferred_language?: string | null;
}

export interface ResolvedRuntimeLlmConfig {
  provider: LlmProvider;
  model: string;
  apiKey?: string;
  baseUrl: string;
  freeTierOnly: boolean;
  outputLanguage: 'en-IN' | 'hi-IN';
}

export const DEFAULT_LLM_PROVIDER: LlmProvider = 'sarvam';
export const DEFAULT_LLM_MODEL = 'sarvam-m';
export const DEFAULT_LLM_BASE_URL = 'https://api.sarvam.ai/v1';

const LEGACY_SARVAM_MODEL = 'sarvam-m';
const LEGACY_SARVAM_BASE_URL = 'https://api.sarvam.ai/v1';
const LEGACY_OPENAI_MODEL = 'gpt-4.1-mini';
const LEGACY_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const LEGACY_GROQ_MODEL = 'openai/gpt-oss-120b';
const LEGACY_GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

function normalizeOptional(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isLegacyDefaultSelection(settings?: StoredLlmSettings | null) {
  const provider = normalizeOptional(settings?.llm_provider);
  const model = normalizeOptional(settings?.llm_model);
  const apiKey = normalizeOptional(settings?.llm_api_key);
  const baseUrl = normalizeOptional(settings?.llm_base_url);

  if (apiKey) return false;
  if (!provider && !model && !baseUrl) return true;

  if (
    provider === 'sarvam' &&
    (model === null || model === LEGACY_SARVAM_MODEL) &&
    (baseUrl === null || baseUrl === LEGACY_SARVAM_BASE_URL)
  ) {
    return true;
  }

  if (
    provider === 'groq' &&
    (model === null || model === LEGACY_GROQ_MODEL) &&
    (baseUrl === null || baseUrl === LEGACY_GROQ_BASE_URL)
  ) {
    return true;
  }

  if (
    provider === 'openai' &&
    (model === null || model === LEGACY_OPENAI_MODEL) &&
    (baseUrl === null || baseUrl === LEGACY_OPENAI_BASE_URL)
  ) {
    return true;
  }

  return false;
}

export function resolveRuntimeLlmConfig(
  settings?: StoredLlmSettings | null,
): ResolvedRuntimeLlmConfig {
  const useDefaultSelection = isLegacyDefaultSelection(settings);
  const provider = (
    useDefaultSelection
      ? DEFAULT_LLM_PROVIDER
      : (normalizeOptional(settings?.llm_provider) ?? DEFAULT_LLM_PROVIDER)
  ) as LlmProvider;
  const model = useDefaultSelection
    ? DEFAULT_LLM_MODEL
    : (normalizeOptional(settings?.llm_model) ?? DEFAULT_LLM_MODEL);
  const baseUrl = useDefaultSelection
    ? DEFAULT_LLM_BASE_URL
    : (normalizeOptional(settings?.llm_base_url) ?? DEFAULT_LLM_BASE_URL);
  const apiKey = useDefaultSelection ? null : normalizeOptional(settings?.llm_api_key);
  const outputLanguage: 'en-IN' | 'hi-IN' =
    settings?.preferred_language === 'hi-IN' ? 'hi-IN' : 'en-IN';

  return {
    provider,
    model,
    ...(apiKey ? { apiKey } : {}),
    baseUrl,
    freeTierOnly: settings?.free_tier_only ?? true,
    outputLanguage,
  };
}
