import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  CLERK_SECRET_KEY: z.string().optional(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
  INDIANKANOON_API_TOKEN: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  GUPSHUP_APP_NAME: z.string().optional(),
  GUPSHUP_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  CEREBRAS_API_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  SARVAM_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OLLAMA_API_KEY: z.string().optional(),
  INDIA_CODE_SEARCH_URL: z.string().url().optional(),
  ECOURTS_JUDGMENTS_SEARCH_URL: z.string().url().optional(),
  ECOURTS_CASE_STATUS_URL: z.string().url().optional(),
  ECOURTS_API_KEY: z.string().optional(),
  SUPREME_COURT_SEARCH_URL: z.string().url().optional(),
  VERDICTUM_SEARCH_URL: z.string().url().optional(),
  SCC_ONLINE_SEARCH_URL: z.string().url().optional(),
  DATA_ENCRYPTION_KEY: z.string().optional(),
  SIMULATION_WORKER_TOKEN: z.string().optional(),
  WHATSAPP_WEBHOOK_SECRET: z.string().optional(),
}).superRefine((value, ctx) => {
  if ((value.GUPSHUP_API_KEY || value.GUPSHUP_APP_NAME) && !value.WHATSAPP_WEBHOOK_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['WHATSAPP_WEBHOOK_SECRET'],
      message: 'WHATSAPP_WEBHOOK_SECRET is required when WhatsApp integration is configured.',
    });
  }
});

type Env = z.infer<typeof envSchema>;

const allowPlaceholderDefaults = process.env.NODE_ENV !== 'production';

const raw = {
  NEXT_PUBLIC_SUPABASE_URL:
    process.env.NEXT_PUBLIC_SUPABASE_URL
    ?? (allowPlaceholderDefaults ? 'https://example.supabase.co' : undefined),
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ?? (allowPlaceholderDefaults ? 'replace-with-real-anon-key-0000000000' : undefined),
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? (allowPlaceholderDefaults ? 'replace-with-real-service-key-0000000000' : undefined),
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  INDIANKANOON_API_TOKEN: process.env.INDIANKANOON_API_TOKEN,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  GUPSHUP_APP_NAME: process.env.GUPSHUP_APP_NAME,
  GUPSHUP_API_KEY: process.env.GUPSHUP_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY,
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  SARVAM_API_KEY: process.env.SARVAM_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  OLLAMA_API_KEY: process.env.OLLAMA_API_KEY,
  INDIA_CODE_SEARCH_URL: process.env.INDIA_CODE_SEARCH_URL,
  ECOURTS_JUDGMENTS_SEARCH_URL: process.env.ECOURTS_JUDGMENTS_SEARCH_URL,
  ECOURTS_CASE_STATUS_URL: process.env.ECOURTS_CASE_STATUS_URL,
  ECOURTS_API_KEY: process.env.ECOURTS_API_KEY,
  SUPREME_COURT_SEARCH_URL: process.env.SUPREME_COURT_SEARCH_URL,
  VERDICTUM_SEARCH_URL: process.env.VERDICTUM_SEARCH_URL,
  SCC_ONLINE_SEARCH_URL: process.env.SCC_ONLINE_SEARCH_URL,
  DATA_ENCRYPTION_KEY: process.env.DATA_ENCRYPTION_KEY,
  SIMULATION_WORKER_TOKEN: process.env.SIMULATION_WORKER_TOKEN,
  WHATSAPP_WEBHOOK_SECRET: process.env.WHATSAPP_WEBHOOK_SECRET,
};

function formatEnvIssues(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
    .join('; ');
}

const parsed = envSchema.safeParse(raw);
if (!parsed.success) {
  const message = `[env] Invalid env configuration: ${formatEnvIssues(parsed.error)}`;
  if (!allowPlaceholderDefaults) {
    throw new Error(message);
  }
  console.warn(`${message}. Using placeholder defaults for local scaffolding.`);
}

export const env: Env = parsed.success ? parsed.data : (raw as Env);
