import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LLM_BASE_URL,
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_PROVIDER,
  resolveRuntimeLlmConfig,
} from './llm-settings';

describe('resolveRuntimeLlmConfig', () => {
  it('uses the Sarvam zero-cost defaults when settings are absent', () => {
    expect(resolveRuntimeLlmConfig()).toEqual({
      provider: DEFAULT_LLM_PROVIDER,
      model: DEFAULT_LLM_MODEL,
      baseUrl: DEFAULT_LLM_BASE_URL,
      freeTierOnly: true,
      outputLanguage: 'en-IN',
    });
  });

  it('migrates legacy Groq defaults without an API key back to the Sarvam default selection', () => {
    expect(
      resolveRuntimeLlmConfig({
        llm_provider: 'groq',
        llm_model: 'openai/gpt-oss-120b',
        llm_base_url: 'https://api.groq.com/openai/v1',
        llm_api_key: null,
      }),
    ).toEqual({
      provider: DEFAULT_LLM_PROVIDER,
      model: DEFAULT_LLM_MODEL,
      baseUrl: DEFAULT_LLM_BASE_URL,
      freeTierOnly: true,
      outputLanguage: 'en-IN',
    });
  });

  it('preserves an explicit non-default provider when credentials are configured', () => {
    expect(
      resolveRuntimeLlmConfig({
        llm_provider: 'groq',
        llm_model: 'openai/gpt-oss-120b',
        llm_base_url: 'https://api.groq.com/openai/v1',
        llm_api_key: 'groq-key',
        free_tier_only: false,
        preferred_language: 'hi-IN',
      }),
    ).toEqual({
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      apiKey: 'groq-key',
      baseUrl: 'https://api.groq.com/openai/v1',
      freeTierOnly: false,
      outputLanguage: 'hi-IN',
    });
  });
});
