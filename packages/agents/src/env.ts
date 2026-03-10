import { z } from 'zod';

const agentsEnvSchema = z.object({
  OPENAI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  CEREBRAS_API_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OLLAMA_API_KEY: z.string().optional(),
  SARVAM_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  INDIANKANOON_API_TOKEN: z.string().optional(),
  INDIA_CODE_SEARCH_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  APP_BASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  LANGCHAIN_TRACING_V2: z.enum(['true', 'false']).optional(),
});

type AgentsEnv = z.infer<typeof agentsEnvSchema>;

let cachedEnv: AgentsEnv | null = null;

function normalizeOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function formatIssues(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
    .join('; ');
}

export function getAgentsEnv(): AgentsEnv {
  if (cachedEnv) return cachedEnv;

  const parsed = agentsEnvSchema.safeParse({
    OPENAI_API_KEY: normalizeOptional(process.env.OPENAI_API_KEY),
    OPENROUTER_API_KEY: normalizeOptional(process.env.OPENROUTER_API_KEY),
    GROQ_API_KEY: normalizeOptional(process.env.GROQ_API_KEY),
    CEREBRAS_API_KEY: normalizeOptional(process.env.CEREBRAS_API_KEY),
    GITHUB_TOKEN: normalizeOptional(process.env.GITHUB_TOKEN),
    DEEPSEEK_API_KEY: normalizeOptional(process.env.DEEPSEEK_API_KEY),
    ANTHROPIC_API_KEY: normalizeOptional(process.env.ANTHROPIC_API_KEY),
    OLLAMA_API_KEY: normalizeOptional(process.env.OLLAMA_API_KEY),
    SARVAM_API_KEY: normalizeOptional(process.env.SARVAM_API_KEY),
    GEMINI_API_KEY: normalizeOptional(process.env.GEMINI_API_KEY),
    GOOGLE_API_KEY: normalizeOptional(process.env.GOOGLE_API_KEY),
    INDIANKANOON_API_TOKEN: normalizeOptional(process.env.INDIANKANOON_API_TOKEN),
    INDIA_CODE_SEARCH_URL: normalizeOptional(process.env.INDIA_CODE_SEARCH_URL),
    UPSTASH_REDIS_REST_URL: normalizeOptional(process.env.UPSTASH_REDIS_REST_URL),
    UPSTASH_REDIS_REST_TOKEN: normalizeOptional(process.env.UPSTASH_REDIS_REST_TOKEN),
    APP_BASE_URL: normalizeOptional(process.env.APP_BASE_URL),
    NEXT_PUBLIC_APP_URL: normalizeOptional(process.env.NEXT_PUBLIC_APP_URL),
    LANGCHAIN_TRACING_V2: normalizeOptional(process.env.LANGCHAIN_TRACING_V2) as
      | 'true'
      | 'false'
      | undefined,
  });

  if (!parsed.success) {
    throw new Error(`[agents env] Invalid configuration: ${formatIssues(parsed.error)}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}
