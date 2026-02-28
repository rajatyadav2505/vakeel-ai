import { describe, expect, it } from 'vitest';
import { extractTextFromUnknownPayload, resolveOcrProviderOrder } from './ocr';

describe('ocr provider routing', () => {
  it('prefers Sarvam by default and supports Google-first override', () => {
    expect(resolveOcrProviderOrder()).toEqual(['sarvam', 'google']);
    expect(resolveOcrProviderOrder('sarvam')).toEqual(['sarvam', 'google']);
    expect(resolveOcrProviderOrder('google')).toEqual(['google', 'sarvam']);
  });

  it('extracts readable text from nested OCR payload structures', () => {
    const text = extractTextFromUnknownPayload({
      output: {
        pages: [
          { text: 'Notice dated 01/02/2026 served through registered post to respondent.' },
          { content: 'Tracking receipt confirms delivery at registered address on 03/02/2026.' },
        ],
      },
    });

    expect(text).toContain('Notice dated 01/02/2026');
    expect(text).toContain('Tracking receipt confirms delivery');
  });

  it('returns null when payload has no useful textual content', () => {
    expect(extractTextFromUnknownPayload({ job_state: 'Completed' })).toBeNull();
  });
});
