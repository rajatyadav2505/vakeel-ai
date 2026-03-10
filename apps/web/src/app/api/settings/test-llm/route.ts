import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invokeJsonModel, validateFreeTierPolicy } from '@nyaya/agents/llm';
import { requireAppUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
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
const llmConnectivitySchema = z.object({
  status: z.string().min(1).optional(),
});

const schema = z.object({
  provider: providerSchema,
  model: z.string().min(2).max(120),
  baseUrl: z.string().max(300).optional(),
  apiKey: z.string().max(500).optional(),
  freeTierOnly: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireAppUser();
    await enforceRateLimit(`settings-llm-test:${user.userId}`, 40);

    const payload = schema.parse(await request.json());
    const supabase = createSupabaseServerClient();

    let apiKey = payload.apiKey?.trim() || '';
    if (!apiKey) {
      const settings = await supabase
        .from('user_settings')
        .select('llm_api_key,free_tier_only')
        .eq('owner_user_id', user.userId)
        .maybeSingle();

      apiKey = settings.data?.llm_api_key?.trim() || '';
      if (payload.freeTierOnly === undefined && typeof settings.data?.free_tier_only === 'boolean') {
        payload.freeTierOnly = settings.data.free_tier_only;
      }
    }

    const freeTierOnly = payload.freeTierOnly ?? true;
    const policy = validateFreeTierPolicy({
      provider: payload.provider,
      model: payload.model,
      freeTierOnly,
    });
    if (!policy.allowed) {
      return NextResponse.json(
        { ok: false, error: policy.reason ?? 'Blocked by free-tier policy.' },
        { status: 400 }
      );
    }

    const startedAt = Date.now();
    const result = await invokeJsonModel({
      systemPrompt:
        'You are a connectivity check endpoint. Return strict JSON only: {"status":"ok"}.',
      userPrompt: 'Respond with {"status":"ok"}',
      temperature: 0,
      maxTokens: 80,
      schema: llmConnectivitySchema,
      llmConfig: {
        provider: payload.provider,
        model: sanitizePlainText(payload.model),
        apiKey,
        freeTierOnly,
        ...(payload.baseUrl ? { baseUrl: sanitizePlainText(payload.baseUrl) } : {}),
      },
    });

    const latencyMs = Date.now() - startedAt;
    if (!result) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'No valid JSON response from provider. Check key/base URL/model or provider free-tier limits.',
          latencyMs,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      provider: payload.provider,
      model: payload.model,
      latencyMs,
      result,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
