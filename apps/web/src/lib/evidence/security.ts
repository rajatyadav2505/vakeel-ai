import { createHash } from 'crypto';

export const UPLOAD_POLICY = {
  maxSingleFileBytes: 4_500_000,
  maxCaseTotalBytes: 18_000_000,
  allowedPdfMimeTypes: ['application/pdf'],
  allowedAudioMimeTypes: [
    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/wav',
    'audio/x-wav',
    'audio/webm',
    'audio/ogg',
    'audio/aac',
    'audio/flac',
  ],
};

function fileExtension(name: string) {
  const segments = name.toLowerCase().split('.');
  if (segments.length < 2) return '';
  return segments[segments.length - 1] ?? '';
}

function sanitizeFileName(name: string) {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);
}

function isPdfSignature(bytes: Uint8Array) {
  const signature = '%PDF-';
  if (bytes.length < signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (String.fromCharCode(bytes[i] ?? 0) !== signature[i]) return false;
  }
  return true;
}

function looksExecutable(bytes: Uint8Array) {
  if (bytes.length < 2) return false;
  if (bytes[0] === 0x4d && bytes[1] === 0x5a) return true; // MZ
  if (bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) return true; // ELF
  return false;
}

export type UploadKind = 'pdf' | 'audio';

export async function validateUploadedFile(params: { file: File; kind: UploadKind }) {
  const { file, kind } = params;
  if (file.size <= 0) throw new Error('Uploaded file is empty.');
  if (file.size > UPLOAD_POLICY.maxSingleFileBytes) {
    throw new Error(`File ${file.name} exceeds max size of ${UPLOAD_POLICY.maxSingleFileBytes} bytes.`);
  }

  const extension = fileExtension(file.name);
  if (kind === 'pdf') {
    if (extension !== 'pdf') throw new Error(`File ${file.name} must use .pdf extension.`);
    if (file.type && !UPLOAD_POLICY.allowedPdfMimeTypes.includes(file.type)) {
      throw new Error(`File ${file.name} has unsupported MIME type ${file.type}.`);
    }
  }

  if (kind === 'audio') {
    const audioExtensions = new Set(['mp3', 'mp4', 'wav', 'm4a', 'ogg', 'aac', 'webm', 'flac']);
    if (!audioExtensions.has(extension)) {
      throw new Error(`Audio file ${file.name} has unsupported extension .${extension || 'unknown'}.`);
    }
    if (file.type && !UPLOAD_POLICY.allowedAudioMimeTypes.includes(file.type)) {
      throw new Error(`Audio file ${file.name} has unsupported MIME type ${file.type}.`);
    }
  }

  const bytes = new Uint8Array(await file.slice(0, 24).arrayBuffer());
  if (looksExecutable(bytes)) {
    throw new Error(`File ${file.name} appears to be an executable and was blocked.`);
  }
  if (kind === 'pdf' && !isPdfSignature(bytes)) {
    throw new Error(`File ${file.name} is not a valid PDF binary.`);
  }

  return {
    extension,
    normalizedName: sanitizeFileName(file.name),
  };
}

export async function sha256ForFile(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  return createHash('sha256').update(buffer).digest('hex');
}

export function isPrivilegedDocument(params: { fileName: string; text?: string | null }) {
  const lower = `${params.fileName} ${params.text ?? ''}`.toLowerCase();
  return [
    'privileged',
    'without prejudice',
    'attorney-client',
    'advocate-client',
    'legal opinion',
    'confidential',
  ].some((token) => lower.includes(token));
}

