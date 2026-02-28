import { env } from '@/lib/env';

type TranscriptionProvider = 'sarvam' | 'openai';

interface TranscriptionOptions {
  freeTierOnly?: boolean;
  preferredProvider?: TranscriptionProvider;
  sourceLanguage?: string;
}

function parseTranscriptFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;

  const known = payload as {
    text?: unknown;
    transcript?: unknown;
    output?: unknown;
    results?: unknown;
  };

  if (typeof known.text === 'string' && known.text.trim()) return known.text.trim();
  if (typeof known.transcript === 'string' && known.transcript.trim()) return known.transcript.trim();
  if (typeof known.output === 'string' && known.output.trim()) return known.output.trim();

  if (Array.isArray(known.results)) {
    const merged = known.results
      .map((item) => {
        if (!item || typeof item !== 'object') return '';
        const text =
          (item as { text?: unknown; transcript?: unknown }).text ??
          (item as { text?: unknown; transcript?: unknown }).transcript;
        return typeof text === 'string' ? text.trim() : '';
      })
      .filter(Boolean)
      .join(' ');
    if (merged) return merged;
  }

  return null;
}

async function transcribeWithSarvam(file: File, language: string): Promise<string | null> {
  if (!env.SARVAM_API_KEY) return null;

  const form = new FormData();
  form.set('file', file);
  form.set('language_code', language);

  const response = await fetch('https://api.sarvam.ai/speech-to-text', {
    method: 'POST',
    headers: {
      'api-subscription-key': env.SARVAM_API_KEY,
    },
    body: form,
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as unknown;
  return parseTranscriptFromPayload(payload);
}

async function transcribeWithOpenAi(file: File): Promise<string | null> {
  if (!env.OPENAI_API_KEY) return null;
  const form = new FormData();
  form.set('model', 'gpt-4o-mini-transcribe');
  form.set('file', file);

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: form,
  });

  if (!response.ok) return null;
  const data = (await response.json()) as { text?: string };
  return typeof data.text === 'string' && data.text.trim() ? data.text.trim() : null;
}

export async function transcribeVoiceNote(
  file: File,
  options?: TranscriptionOptions
): Promise<string | null> {
  if (file.size === 0) return null;

  const freeTierOnly = options?.freeTierOnly ?? true;
  const preferredProvider: TranscriptionProvider = options?.preferredProvider ?? 'sarvam';
  const providers: TranscriptionProvider[] =
    preferredProvider === 'openai' ? ['openai', 'sarvam'] : ['sarvam', 'openai'];

  for (const provider of providers) {
    if (provider === 'openai' && freeTierOnly) continue;

    const transcript =
      provider === 'sarvam'
        ? await transcribeWithSarvam(file, options?.sourceLanguage ?? 'unknown')
        : await transcribeWithOpenAi(file);
    if (transcript) return transcript;
  }

  return null;
}
