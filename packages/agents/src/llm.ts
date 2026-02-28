const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';
const CEREBRAS_CHAT_COMPLETIONS_URL = 'https://api.cerebras.ai/v1/chat/completions';
const GITHUB_MODELS_CHAT_COMPLETIONS_URL = 'https://models.inference.ai.azure.com/chat/completions';
const DEEPSEEK_CHAT_COMPLETIONS_URL = 'https://api.deepseek.com/v1/chat/completions';
const GEMINI_OPENAI_COMPAT_COMPLETIONS_URL =
  'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const GEMINI_NATIVE_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const OLLAMA_CHAT_COMPLETIONS_URL = 'http://localhost:11434/v1/chat/completions';
const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const SARVAM_CHAT_COMPLETIONS_URL = 'https://api.sarvam.ai/v1/chat/completions';

export type SupportedLlmProvider =
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

export interface RuntimeLlmConfig {
  provider?: SupportedLlmProvider;
  model?: string;
  apiKey?: string | null;
  baseUrl?: string | null;
  freeTierOnly?: boolean;
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function parseJsonFromText<T>(value: string): T | null {
  const direct = parseJson<T>(value);
  if (direct) return direct;

  const fenced = value.match(/```json\s*([\s\S]*?)\s*```/i)?.[1];
  if (fenced) {
    const parsedFence = parseJson<T>(fenced.trim());
    if (parsedFence) return parsedFence;
  }

  const firstBrace = value.indexOf('{');
  const lastBrace = value.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return parseJson<T>(value.slice(firstBrace, lastBrace + 1));
  }

  return null;
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  const textParts = content
    .map((part) => {
      if (part && typeof part === 'object' && 'text' in part) {
        const text = (part as { text?: unknown }).text;
        return typeof text === 'string' ? text : '';
      }
      return '';
    })
    .filter(Boolean);

  return textParts.join('\n').trim();
}

function defaultModelForProvider(provider: SupportedLlmProvider) {
  if (provider === 'google') return 'gemini-2.5-flash';
  if (provider === 'openrouter') return 'deepseek/deepseek-r1-0528:free';
  if (provider === 'groq') return 'deepseek-r1-distill-llama-70b';
  if (provider === 'cerebras') return 'gpt-oss-120b';
  if (provider === 'github') return 'DeepSeek-R1';
  if (provider === 'deepseek') return 'deepseek-reasoner';
  if (provider === 'anthropic') return 'claude-3-7-sonnet-latest';
  if (provider === 'ollama') return 'llama3.1:8b';
  if (provider === 'sarvam') return 'sarvam-m';
  return 'gpt-4.1-mini';
}

function defaultCompletionsUrl(provider: SupportedLlmProvider) {
  if (provider === 'openrouter') return OPENROUTER_CHAT_COMPLETIONS_URL;
  if (provider === 'google') return GEMINI_OPENAI_COMPAT_COMPLETIONS_URL;
  if (provider === 'groq') return GROQ_CHAT_COMPLETIONS_URL;
  if (provider === 'cerebras') return CEREBRAS_CHAT_COMPLETIONS_URL;
  if (provider === 'github') return GITHUB_MODELS_CHAT_COMPLETIONS_URL;
  if (provider === 'deepseek') return DEEPSEEK_CHAT_COMPLETIONS_URL;
  if (provider === 'ollama') return OLLAMA_CHAT_COMPLETIONS_URL;
  if (provider === 'sarvam') return SARVAM_CHAT_COMPLETIONS_URL;
  return OPENAI_CHAT_COMPLETIONS_URL;
}

function defaultNonOpenAiUrl(provider: SupportedLlmProvider) {
  if (provider === 'anthropic') return ANTHROPIC_MESSAGES_URL;
  return '';
}

function resolveCompletionsUrl(baseUrl: string) {
  const candidate = baseUrl.trim();
  if (candidate.endsWith('/chat/completions')) return candidate;
  if (candidate.endsWith('/v1')) return `${candidate}/chat/completions`;
  if (candidate.endsWith('/openai')) return `${candidate}/chat/completions`;
  return `${candidate.replace(/\/$/, '')}/chat/completions`;
}

function resolveAnthropicMessagesUrl(baseUrl: string) {
  const candidate = baseUrl.trim();
  if (candidate.endsWith('/messages')) return candidate;
  if (candidate.endsWith('/v1')) return `${candidate}/messages`;
  return `${candidate.replace(/\/$/, '')}/messages`;
}

function resolveApiKey(provider: SupportedLlmProvider, configuredApiKey?: string | null) {
  const explicit = configuredApiKey?.trim();
  if (explicit) return explicit;

  if (provider === 'openrouter') return process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '';
  if (provider === 'google') {
    return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.OPENAI_API_KEY || '';
  }
  if (provider === 'groq') return process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || '';
  if (provider === 'cerebras') return process.env.CEREBRAS_API_KEY || process.env.OPENAI_API_KEY || '';
  if (provider === 'github') return process.env.GITHUB_TOKEN || process.env.OPENAI_API_KEY || '';
  if (provider === 'deepseek') return process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || '';
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY || '';
  if (provider === 'ollama') return process.env.OLLAMA_API_KEY || '';
  if (provider === 'sarvam') return process.env.SARVAM_API_KEY || '';

  return process.env.OPENAI_API_KEY || '';
}

function providerRequiresApiKey(provider: SupportedLlmProvider) {
  return provider !== 'ollama';
}

function isGoogleFreeModel(model: string) {
  return [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-3-flash-preview',
    'gemini-3.1-pro-preview',
  ].includes(model);
}

function isGroqFreeModel(model: string) {
  return ['deepseek-r1-distill-llama-70b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'].includes(
    model
  );
}

function isCerebrasFreeModel(model: string) {
  return ['gpt-oss-120b', 'qwen3-235b'].includes(model);
}

function isGithubFreeModel(model: string) {
  return ['DeepSeek-R1', 'DeepSeek-R1-0528', 'o3-mini', 'Grok-3-Mini'].includes(model);
}

export function validateFreeTierPolicy(params: {
  provider: SupportedLlmProvider;
  model: string;
  freeTierOnly: boolean;
}): { allowed: boolean; reason?: string } {
  if (!params.freeTierOnly) {
    return { allowed: true };
  }

  const model = params.model.trim();
  if (!model) {
    return { allowed: false, reason: 'Model is required.' };
  }

  if (params.provider === 'sarvam') {
    if (model === 'sarvam-m') return { allowed: true };
    return { allowed: false, reason: 'Sarvam free-tier allows model "sarvam-m" only.' };
  }

  if (params.provider === 'google') {
    if (isGoogleFreeModel(model)) return { allowed: true };
    return { allowed: false, reason: `Model "${model}" is not in the Google free-tier allowlist.` };
  }

  if (params.provider === 'openrouter') {
    if (model === 'openrouter/free' || model.endsWith(':free')) return { allowed: true };
    return { allowed: false, reason: 'OpenRouter free-tier requires model suffix ":free" or "openrouter/free".' };
  }

  if (params.provider === 'groq') {
    if (isGroqFreeModel(model)) return { allowed: true };
    return { allowed: false, reason: `Model "${model}" is not in the Groq free-tier allowlist.` };
  }

  if (params.provider === 'cerebras') {
    if (isCerebrasFreeModel(model)) return { allowed: true };
    return { allowed: false, reason: `Model "${model}" is not in the Cerebras free-tier allowlist.` };
  }

  if (params.provider === 'github') {
    if (isGithubFreeModel(model)) return { allowed: true };
    return { allowed: false, reason: `Model "${model}" is not in the GitHub Models free-tier allowlist.` };
  }

  if (params.provider === 'ollama') {
    return { allowed: true };
  }

  if (params.provider === 'deepseek') {
    return {
      allowed: false,
      reason:
        'DeepSeek may incur charges after free credits are exhausted. Disable free-tier-only to use it.',
    };
  }

  if (params.provider === 'openai' || params.provider === 'anthropic') {
    return {
      allowed: false,
      reason: `Provider "${params.provider}" is blocked while free-tier-only mode is enabled.`,
    };
  }

  return { allowed: false, reason: 'Provider/model combination is not approved for free-tier-only mode.' };
}

async function invokeOpenAiCompatible<T>(params: {
  provider: SupportedLlmProvider;
  apiKey: string;
  model: string;
  endpoint: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
  signal: AbortSignal;
}): Promise<T | null> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (params.provider === 'sarvam') {
    headers['api-subscription-key'] = params.apiKey;
  } else if (params.apiKey) {
    headers.Authorization = `Bearer ${params.apiKey}`;
  }

  if (params.provider === 'openrouter') {
    const referer = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
    if (referer) headers['HTTP-Referer'] = referer;
    headers['X-Title'] = 'Nyaya Mitra';
  }

  const body: Record<string, unknown> = {
    model: params.model,
    temperature: params.temperature,
    max_tokens: params.maxTokens,
    messages: [
      { role: 'system', content: params.systemPrompt },
      { role: 'user', content: params.userPrompt },
    ],
  };

  if (params.provider === 'sarvam') {
    body.reasoning_effort = 'medium';
    body.wiki_grounding = true;
  }

  const response = await fetch(params.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: params.signal,
  });

  if (!response.ok) return null;

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: unknown;
      };
    }>;
  };

  const content = data.choices?.[0]?.message?.content;
  const text = extractTextContent(content);
  if (!text) return null;

  return parseJsonFromText<T>(text.trim());
}

async function invokeAnthropic<T>(params: {
  apiKey: string;
  model: string;
  endpoint: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
  signal: AbortSignal;
}): Promise<T | null> {
  const response = await fetch(params.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': params.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: params.model,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      system: params.systemPrompt,
      messages: [{ role: 'user', content: params.userPrompt }],
    }),
    signal: params.signal,
  });

  if (!response.ok) return null;

  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };

  const text =
    data.content
      ?.map((item) => (item.type === 'text' && typeof item.text === 'string' ? item.text : ''))
      .filter(Boolean)
      .join('\n')
      .trim() ?? '';

  if (!text) return null;
  return parseJsonFromText<T>(text);
}

async function invokeGeminiNative<T>(params: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
  signal: AbortSignal;
}): Promise<T | null> {
  const endpoint = `${GEMINI_NATIVE_BASE_URL}/models/${encodeURIComponent(params.model)}:generateContent?key=${encodeURIComponent(params.apiKey)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': params.apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${params.systemPrompt}\n\n${params.userPrompt}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: params.temperature,
        maxOutputTokens: params.maxTokens,
        responseMimeType: 'application/json',
      },
    }),
    signal: params.signal,
  });

  if (!response.ok) return null;

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
        }>;
      };
    }>;
  };

  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('\n')
      .trim() ?? '';

  if (!text) return null;
  return parseJsonFromText<T>(text);
}

export async function invokeJsonModel<T>(params: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  llmConfig?: RuntimeLlmConfig;
}): Promise<T | null> {
  const provider = params.llmConfig?.provider ?? 'sarvam';
  const model = params.llmConfig?.model?.trim() || defaultModelForProvider(provider);
  const freeTierOnly = params.llmConfig?.freeTierOnly ?? true;

  const policy = validateFreeTierPolicy({ provider, model, freeTierOnly });
  if (!policy.allowed) {
    console.warn(`[llm] blocked by free-tier policy: provider=${provider}, model=${model}. ${policy.reason ?? ''}`);
    return null;
  }

  const apiKey = resolveApiKey(provider, params.llmConfig?.apiKey);
  if (providerRequiresApiKey(provider) && !apiKey) return null;

  const temperature = params.temperature ?? 0.35;
  const maxTokens = params.maxTokens ?? 900;

  const timeoutMs = 15_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (provider === 'anthropic') {
      const endpoint = resolveAnthropicMessagesUrl(
        params.llmConfig?.baseUrl?.trim() || defaultNonOpenAiUrl(provider)
      );
      return await invokeAnthropic<T>({
        apiKey,
        model,
        endpoint,
        systemPrompt: params.systemPrompt,
        userPrompt: params.userPrompt,
        temperature,
        maxTokens,
        signal: controller.signal,
      });
    }

    const endpoint = resolveCompletionsUrl(
      params.llmConfig?.baseUrl?.trim() || defaultCompletionsUrl(provider)
    );

    const compatResult = await invokeOpenAiCompatible<T>({
      provider,
      apiKey,
      model,
      endpoint,
      systemPrompt: params.systemPrompt,
      userPrompt: params.userPrompt,
      temperature,
      maxTokens,
      signal: controller.signal,
    });

    if (compatResult) return compatResult;

    if (provider === 'google' && apiKey) {
      return await invokeGeminiNative<T>({
        apiKey,
        model,
        systemPrompt: params.systemPrompt,
        userPrompt: params.userPrompt,
        temperature,
        maxTokens,
        signal: controller.signal,
      });
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
