import { env } from '../env';

const SARVAM_BASE_URL = 'https://api.sarvam.ai';
const GOOGLE_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const GOOGLE_DEFAULT_MODEL = 'gemini-2.5-flash';

export type OcrProvider = 'sarvam' | 'google';
export type OcrMethod = 'none' | 'sarvam_document_intelligence' | 'google_gemini_pdf';

export interface OcrAttempt {
  provider: OcrProvider;
  status: 'succeeded' | 'failed' | 'skipped';
  detail: string;
  durationMs: number;
}

export interface OcrExtractionResult {
  text: string | null;
  providerUsed: OcrProvider | null;
  method: OcrMethod;
  attempts: OcrAttempt[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeExtractedText(value: string | null | undefined) {
  if (!value) return null;
  const collapsed = value.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (collapsed.length < 20) return null;
  return collapsed.slice(0, 80_000);
}

function deepCollectStringsByKeys(
  value: unknown,
  keys: Set<string>,
  out: string[],
  depth = 0
): void {
  if (depth > 6) return;
  if (Array.isArray(value)) {
    for (const item of value) deepCollectStringsByKeys(item, keys, out, depth + 1);
    return;
  }

  const record = asRecord(value);
  if (!record) return;
  for (const [key, child] of Object.entries(record)) {
    const normalizedKey = key.toLowerCase();
    if (keys.has(normalizedKey) && typeof child === 'string' && child.trim().length > 0) {
      out.push(child.trim());
    }
    deepCollectStringsByKeys(child, keys, out, depth + 1);
  }
}

function deepFindFirstStringByKeys(value: unknown, keys: Set<string>, depth = 0): string | null {
  if (depth > 6) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = deepFindFirstStringByKeys(item, keys, depth + 1);
      if (nested) return nested;
    }
    return null;
  }

  const record = asRecord(value);
  if (!record) return null;
  for (const [key, child] of Object.entries(record)) {
    const normalizedKey = key.toLowerCase();
    if (keys.has(normalizedKey) && typeof child === 'string' && child.trim()) {
      return child.trim();
    }
    const nested = deepFindFirstStringByKeys(child, keys, depth + 1);
    if (nested) return nested;
  }
  return null;
}

export function extractTextFromUnknownPayload(payload: unknown): string | null {
  const candidates: string[] = [];
  deepCollectStringsByKeys(
    payload,
    new Set([
      'text',
      'transcript',
      'markdown',
      'md',
      'content',
      'output_text',
      'extracted_text',
      'full_text',
      'result_text',
      'page_text',
    ]),
    candidates
  );

  if (!candidates.length) return null;
  return normalizeExtractedText(candidates.join('\n'));
}

function extractTextFromGemini(payload: unknown): string | null {
  const root = asRecord(payload);
  if (!root) return null;
  const candidates = Array.isArray(root.candidates) ? root.candidates : [];
  const textParts: string[] = [];

  for (const candidate of candidates) {
    const candidateRecord = asRecord(candidate);
    const content = asRecord(candidateRecord?.content);
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    for (const part of parts) {
      const partRecord = asRecord(part);
      if (typeof partRecord?.text === 'string' && partRecord.text.trim()) {
        textParts.push(partRecord.text.trim());
      }
    }
  }

  if (!textParts.length) return null;
  return normalizeExtractedText(textParts.join('\n'));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

async function extractSarvamDocumentText(params: {
  file: File;
  languageCode: string;
  maxPollAttempts: number;
  pollIntervalMs: number;
}): Promise<string | null> {
  const apiKey = env.SARVAM_API_KEY?.trim();
  if (!apiKey) return null;

  const authHeaders = {
    'Content-Type': 'application/json',
    'api-subscription-key': apiKey,
  };

  const createResponse = await fetchWithTimeout(
    `${SARVAM_BASE_URL}/document-intelligence/create`,
    {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        language: params.languageCode,
        output_format: 'md',
      }),
    },
    20_000
  );
  if (!createResponse.ok) return null;
  const createPayload = await safeJson(createResponse);

  const jobId = deepFindFirstStringByKeys(createPayload, new Set(['job_id', 'jobid', 'id']));
  if (!jobId) return null;

  let uploadUrl = deepFindFirstStringByKeys(
    createPayload,
    new Set(['upload_url', 'uploadurl', 'presigned_url', 'presignedurl'])
  );

  if (!uploadUrl) {
    const uploadUrlResponse = await fetchWithTimeout(
      `${SARVAM_BASE_URL}/document-intelligence/${encodeURIComponent(jobId)}/upload-urls?file_name=${encodeURIComponent(params.file.name)}`,
      {
        method: 'GET',
        headers: {
          'api-subscription-key': apiKey,
        },
      },
      20_000
    );
    if (!uploadUrlResponse.ok) return null;
    const uploadPayload = await safeJson(uploadUrlResponse);
    uploadUrl = deepFindFirstStringByKeys(
      uploadPayload,
      new Set(['upload_url', 'uploadurl', 'presigned_url', 'presignedurl', 'url'])
    );
  }

  if (!uploadUrl) return null;

  const uploadResponse = await fetchWithTimeout(
    uploadUrl,
    {
      method: 'PUT',
      headers: {
        'Content-Type': params.file.type || 'application/pdf',
      },
      body: params.file,
    },
    40_000
  );
  if (!uploadResponse.ok) return null;

  const startResponse = await fetchWithTimeout(
    `${SARVAM_BASE_URL}/document-intelligence/${encodeURIComponent(jobId)}/start`,
    {
      method: 'POST',
      headers: {
        'api-subscription-key': apiKey,
      },
    },
    20_000
  );
  if (!startResponse.ok) return null;

  let finalStatusPayload: unknown = null;
  for (let attempt = 0; attempt < params.maxPollAttempts; attempt += 1) {
    const statusResponse = await fetchWithTimeout(
      `${SARVAM_BASE_URL}/document-intelligence/${encodeURIComponent(jobId)}/status`,
      {
        method: 'GET',
        headers: {
          'api-subscription-key': apiKey,
        },
      },
      20_000
    );
    if (!statusResponse.ok) {
      await sleep(params.pollIntervalMs);
      continue;
    }

    const statusPayload = await safeJson(statusResponse);
    finalStatusPayload = statusPayload;
    const statusRecord = asRecord(statusPayload);
    const stateValue = String(
      statusRecord?.job_state ?? statusRecord?.jobState ?? statusRecord?.state ?? 'unknown'
    ).toLowerCase();

    if (stateValue === 'completed' || stateValue === 'partiallycompleted') {
      break;
    }
    if (stateValue === 'failed') {
      return null;
    }
    await sleep(params.pollIntervalMs);
  }

  const directText = extractTextFromUnknownPayload(finalStatusPayload);
  if (directText) return directText;

  const outputUrl = deepFindFirstStringByKeys(
    finalStatusPayload,
    new Set([
      'output_download_url',
      'outputdownloadurl',
      'download_url',
      'downloadurl',
      'output_url',
      'outputurl',
      'result_url',
      'resulturl',
    ])
  );

  const candidateUrls = [
    ...(outputUrl ? [outputUrl] : []),
    `${SARVAM_BASE_URL}/document-intelligence/${encodeURIComponent(jobId)}/output`,
    `${SARVAM_BASE_URL}/document-intelligence/${encodeURIComponent(jobId)}/download`,
    `${SARVAM_BASE_URL}/document-intelligence/${encodeURIComponent(jobId)}/result`,
  ];

  for (const candidateUrl of candidateUrls) {
    const response = await fetchWithTimeout(
      candidateUrl,
      {
        method: 'GET',
        ...(candidateUrl.startsWith(SARVAM_BASE_URL)
          ? {
              headers: {
                'api-subscription-key': apiKey,
              },
            }
          : {}),
      },
      20_000
    ).catch(() => null);
    if (!response || !response.ok) continue;

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const payload = await safeJson(response);
      const text = extractTextFromUnknownPayload(payload);
      if (text) return text;
      continue;
    }

    if (contentType.includes('text/') || contentType.includes('markdown')) {
      const text = normalizeExtractedText(await response.text());
      if (text) return text;
      continue;
    }
  }

  return null;
}

async function extractGoogleGeminiPdfText(params: { file: File; model: string }): Promise<string | null> {
  const apiKey = env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim();
  if (!apiKey) return null;

  const binary = Buffer.from(await params.file.arrayBuffer());
  const encoded = binary.toString('base64');
  if (!encoded) return null;

  const endpoint =
    `${GOOGLE_BASE_URL}/models/${encodeURIComponent(params.model)}:generateContent?key=` +
    encodeURIComponent(apiKey);

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text:
                  'Extract the full readable text from this PDF. Keep structure and headings. Return only extracted text.',
              },
              {
                inline_data: {
                  mime_type: params.file.type || 'application/pdf',
                  data: encoded,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 8192,
        },
      }),
    },
    40_000
  );

  if (!response.ok) return null;
  const payload = await safeJson(response);
  return extractTextFromGemini(payload);
}

export function resolveOcrProviderOrder(preferredProvider?: OcrProvider | string | null): OcrProvider[] {
  if (preferredProvider === 'google') return ['google', 'sarvam'];
  return ['sarvam', 'google'];
}

export async function extractTextWithManagedOcr(params: {
  file: File;
  providers?: OcrProvider[];
  languageCode?: string;
  googleModel?: string;
  maxPollAttempts?: number;
  pollIntervalMs?: number;
}): Promise<OcrExtractionResult> {
  const order = params.providers?.length ? params.providers : resolveOcrProviderOrder(null);
  const attempts: OcrAttempt[] = [];

  for (const provider of order) {
    const started = Date.now();
    if (provider === 'sarvam' && !env.SARVAM_API_KEY?.trim()) {
      attempts.push({
        provider,
        status: 'skipped',
        detail: 'SARVAM_API_KEY is not configured.',
        durationMs: Date.now() - started,
      });
      continue;
    }
    if (provider === 'google' && !(env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim())) {
      attempts.push({
        provider,
        status: 'skipped',
        detail: 'GEMINI_API_KEY or GOOGLE_API_KEY is not configured.',
        durationMs: Date.now() - started,
      });
      continue;
    }

    try {
      const text =
        provider === 'sarvam'
          ? await extractSarvamDocumentText({
              file: params.file,
              languageCode: params.languageCode ?? 'en-IN',
              maxPollAttempts: params.maxPollAttempts ?? 10,
              pollIntervalMs: params.pollIntervalMs ?? 1_500,
            })
          : await extractGoogleGeminiPdfText({
              file: params.file,
              model: params.googleModel ?? GOOGLE_DEFAULT_MODEL,
            });

      if (text) {
        attempts.push({
          provider,
          status: 'succeeded',
          detail: 'OCR text extracted successfully.',
          durationMs: Date.now() - started,
        });
        return {
          text,
          providerUsed: provider,
          method: provider === 'sarvam' ? 'sarvam_document_intelligence' : 'google_gemini_pdf',
          attempts,
        };
      }

      attempts.push({
        provider,
        status: 'failed',
        detail: 'OCR provider returned no extractable text.',
        durationMs: Date.now() - started,
      });
    } catch (error) {
      attempts.push({
        provider,
        status: 'failed',
        detail: String(error),
        durationMs: Date.now() - started,
      });
    }
  }

  return {
    text: null,
    providerUsed: null,
    method: 'none',
    attempts,
  };
}
