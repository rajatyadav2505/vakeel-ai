import { eq } from 'drizzle-orm';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { db } from '@/lib/db';
import { ensureDbReady } from '@/lib/db/init';
import { llmConfig } from '@/lib/db/schema';

export type SupportedProvider = 'openai' | 'anthropic' | 'google' | 'groq' | 'ollama';

export interface ResolvedLlmConfig {
  provider: SupportedProvider;
  modelName: string;
  apiKey: string;
  baseUrl?: string;
}

function fromEnv(provider: SupportedProvider): string {
  if (provider === 'openai') return process.env.OPENAI_API_KEY ?? '';
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY ?? '';
  if (provider === 'google') return process.env.GOOGLE_API_KEY ?? '';
  if (provider === 'groq') return process.env.GROQ_API_KEY ?? '';
  return '';
}

async function resolveLlmConfig(): Promise<ResolvedLlmConfig | null> {
  await ensureDbReady();

  const active = await db
    .select()
    .from(llmConfig)
    .where(eq(llmConfig.isActive, true))
    .limit(1);

  const config = active[0];
  if (!config) return null;

  const apiKey = config.apiKey?.trim() || fromEnv(config.provider);

  return {
    provider: config.provider,
    modelName: config.modelName,
    apiKey,
    baseUrl: config.baseUrl ?? undefined,
  };
}

export async function invokeModel(params: {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string | null> {
  const resolved = await resolveLlmConfig();
  if (!resolved || !resolved.apiKey) {
    return null;
  }

  const temperature = params.temperature ?? 0.35;
  const maxTokens = params.maxTokens ?? 900;

  try {
    if (resolved.provider === 'anthropic') {
      const model = new ChatAnthropic({
        apiKey: resolved.apiKey,
        model: resolved.modelName,
        temperature,
        maxTokens,
      });
      const response = await model.invoke(params.prompt);
      return String(response.content ?? '').trim();
    }

    if (resolved.provider === 'google') {
      const model = new ChatGoogleGenerativeAI({
        apiKey: resolved.apiKey,
        model: resolved.modelName,
        temperature,
        maxOutputTokens: maxTokens,
      });
      const response = await model.invoke(params.prompt);
      return String(response.content ?? '').trim();
    }

    const model = new ChatOpenAI({
      apiKey: resolved.apiKey,
      model: resolved.modelName,
      temperature,
      maxTokens,
      configuration: resolved.baseUrl ? { baseURL: resolved.baseUrl } : undefined,
    });

    const response = await model.invoke(params.prompt);
    return String(response.content ?? '').trim();
  } catch (error) {
    console.warn('[ai] Model invocation failed, using deterministic fallback:', error);
    return null;
  }
}
