import { describe, expect, it } from 'vitest';
import { validateFreeTierPolicy } from './llm';

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
