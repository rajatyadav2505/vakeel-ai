import { describe, expect, it } from 'vitest';
import {
  isPrivilegedDocument,
  sha256ForFile,
  UPLOAD_POLICY,
  validateUploadedFile,
} from './security';

describe('upload security policy', () => {
  it('accepts valid PDF uploads and normalizes filename', async () => {
    const file = new File(
      [Buffer.from('%PDF-1.4\nBT\n(Notice dated 01/02/2026) Tj\nET\n', 'utf8')],
      'Legal Notice (Final).pdf',
      {
        type: 'application/pdf',
      }
    );

    const result = await validateUploadedFile({ file, kind: 'pdf' });
    expect(result.extension).toBe('pdf');
    expect(result.normalizedName).toBe('Legal_Notice_Final_.pdf');
  });

  it('blocks executable signatures even when extension appears safe', async () => {
    const file = new File([Uint8Array.from([0x4d, 0x5a, 0x90, 0x00])], 'voice.mp3', {
      type: 'audio/mpeg',
    });

    await expect(validateUploadedFile({ file, kind: 'audio' })).rejects.toThrow(/executable/i);
  });

  it('enforces max file size limits', async () => {
    const oversized = new File([new Uint8Array(UPLOAD_POLICY.maxSingleFileBytes + 1)], 'large.pdf', {
      type: 'application/pdf',
    });

    await expect(validateUploadedFile({ file: oversized, kind: 'pdf' })).rejects.toThrow(/max size/i);
  });

  it('hashes files and detects privilege markers', async () => {
    const file = new File([Buffer.from('abc', 'utf8')], 'memo.txt', { type: 'text/plain' });
    const digest = await sha256ForFile(file);
    expect(digest).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

    expect(
      isPrivilegedDocument({
        fileName: 'opinion.txt',
        text: 'Attorney-client communication. Confidential.',
      })
    ).toBe(true);
  });
});
