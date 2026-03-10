import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invokeJsonModel, validateFreeTierPolicy } from './llm';

describe('validateFreeTierPolicy', () => {
  it('allows Sarvam free model and blocks non-free Sarvam models', () => {
    expect(
      validateFreeTierPolicy({
        provider: 'sarvam',
        model: 'sarvam-m',
        freeTierOnly: true,
      }).allowed
    ).toBe(true);

    expect(
      validateFreeTierPolicy({
        provider: 'sarvam',
        model: 'sarvam-x',
        freeTierOnly: true,
      }).allowed
    ).toBe(false);
  });

  it('allows OpenRouter free suffix and blocks non-free model IDs', () => {
    expect(
      validateFreeTierPolicy({
        provider: 'openrouter',
        model: 'deepseek/deepseek-r1-0528:free',
        freeTierOnly: true,
      }).allowed
    ).toBe(true);

    expect(
      validateFreeTierPolicy({
        provider: 'openrouter',
        model: 'openrouter/auto',
        freeTierOnly: true,
      }).allowed
    ).toBe(false);
  });

  it('blocks paid-first providers in free-tier-only mode and allows when disabled', () => {
    expect(
      validateFreeTierPolicy({
        provider: 'openai',
        model: 'gpt-4.1-mini',
        freeTierOnly: true,
      }).allowed
    ).toBe(false);

    expect(
      validateFreeTierPolicy({
        provider: 'openai',
        model: 'gpt-4.1-mini',
        freeTierOnly: false,
      }).allowed
    ).toBe(true);
  });

  it('blocks DeepSeek in free-tier-only mode to avoid overage risk', () => {
    expect(
      validateFreeTierPolicy({
        provider: 'deepseek',
        model: 'deepseek-reasoner',
        freeTierOnly: true,
      }).allowed
    ).toBe(false);
  });
});

describe('invokeJsonModel', () => {
  const originalEnv = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY;
  });

  it('throws when a paid provider is selected without a configured API key', async () => {
    await expect(
      invokeJsonModel({
        systemPrompt: 'Return JSON.',
        userPrompt: 'Return JSON.',
        llmConfig: {
          provider: 'openai',
          freeTierOnly: false,
        },
        schema: z.object({ ok: z.boolean() }),
      })
    ).rejects.toThrow('Missing API key for provider "openai"');
  });

  it('returns null when the model output does not satisfy the requested schema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '{"ok":"yes"}',
                },
              },
            ],
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      )
    );

    const result = await invokeJsonModel({
      systemPrompt: 'Return JSON.',
      userPrompt: 'Return JSON.',
      llmConfig: {
        provider: 'ollama',
      },
      schema: z.object({ ok: z.boolean() }),
    });

    expect(result).toBeNull();
  });
});
