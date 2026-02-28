import type { DocumentType } from '@nyaya/shared';

function unescapePdfString(value: string) {
  return value
    .replace(/\\n/g, ' ')
    .replace(/\\r/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTextFromPdfContent(raw: string) {
  const fragments: string[] = [];
  const simpleTextRegex = /\(([^()]*)\)\s*Tj/g;
  for (const match of raw.matchAll(simpleTextRegex)) {
    const candidate = unescapePdfString(match[1] ?? '');
    if (candidate.length >= 2) fragments.push(candidate);
  }

  const arrayTextRegex = /\[(.*?)\]\s*TJ/g;
  for (const match of raw.matchAll(arrayTextRegex)) {
    const block = match[1] ?? '';
    const nested = block.match(/\(([^()]*)\)/g) ?? [];
    for (const part of nested) {
      const content = part.slice(1, -1);
      const candidate = unescapePdfString(content);
      if (candidate.length >= 2) fragments.push(candidate);
    }
  }

  const deduped = Array.from(new Set(fragments.map((item) => item.trim()).filter(Boolean)));
  if (!deduped.length) return null;
  return deduped.join('\n').slice(0, 80_000);
}

export async function extractStructuredTextFromUpload(file: File) {
  const mime = (file.type || '').toLowerCase();
  if (mime.startsWith('text/')) {
    const text = await file.text();
    return {
      text: text.slice(0, 80_000),
      method: 'plain_text' as const,
      needsOcr: false,
    };
  }

  if (mime === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const binary = Buffer.from(await file.arrayBuffer()).toString('latin1');
    const extracted = extractTextFromPdfContent(binary);
    if (extracted && extracted.length >= 40) {
      return {
        text: extracted,
        method: 'pdf_text_layer' as const,
        needsOcr: false,
      };
    }
    return {
      text: null,
      method: 'pdf_no_text_layer' as const,
      needsOcr: true,
    };
  }

  return {
    text: null,
    method: 'unsupported_binary' as const,
    needsOcr: false,
  };
}

export function inferDocumentType(params: { fileName: string; extractedText?: string | null }): DocumentType {
  const lower = `${params.fileName} ${params.extractedText ?? ''}`.toLowerCase();
  if (/\bpetition|plaint|writ|application\b/.test(lower)) return 'petition';
  if (/\baffidavit|verification\b/.test(lower)) return 'affidavit';
  if (/\bnotice|demand notice|legal notice\b/.test(lower)) return 'notice';
  if (/\border|judgment|decree\b/.test(lower)) return 'order';
  if (/\bagreement|contract|lease deed|sale deed\b/.test(lower)) return 'agreement';
  if (/\bpostal|tracking|acknowledgment|ad card|speed post\b/.test(lower)) return 'postal_proof';
  if (/\breceipt|invoice|payment proof|bank statement|utr\b/.test(lower)) return 'receipt';
  if (/\bannexure|appendix\b/.test(lower)) return 'annexure';
  if (/\baudio|voice\b/.test(lower)) return 'audio_note';
  return 'evidence';
}

