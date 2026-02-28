import { describe, expect, it } from 'vitest';
import { extractStructuredTextFromUpload, inferDocumentType } from './parsing';

describe('evidence parsing', () => {
  it('extracts plain text files directly', async () => {
    const file = new File(['Notice dated 01/02/2026 and receipt attached.'], 'note.txt', {
      type: 'text/plain',
    });

    const extracted = await extractStructuredTextFromUpload(file);
    expect(extracted.method).toBe('plain_text');
    expect(extracted.needsOcr).toBe(false);
    expect(extracted.text).toContain('Notice dated 01/02/2026');
  });

  it('extracts PDF text-layer content when present', async () => {
    const pdfLike =
      '%PDF-1.4\nBT\n(Agreement dated 05/01/2026 between claimant and respondent for Rs 1,00,000) Tj\nET\n';
    const file = new File([Buffer.from(pdfLike, 'latin1')], 'agreement.pdf', {
      type: 'application/pdf',
    });

    const extracted = await extractStructuredTextFromUpload(file);
    expect(extracted.method).toBe('pdf_text_layer');
    expect(extracted.needsOcr).toBe(false);
    expect(extracted.text).toContain('Agreement dated 05/01/2026');
  });

  it('flags OCR-needed PDFs without readable text layer', async () => {
    const file = new File([Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\n', 'latin1')], 'scan.pdf', {
      type: 'application/pdf',
    });

    const extracted = await extractStructuredTextFromUpload(file);
    expect(extracted.method).toBe('pdf_no_text_layer');
    expect(extracted.needsOcr).toBe(true);
    expect(extracted.text).toBeNull();
  });

  it('infers document type from content cues', () => {
    expect(
      inferDocumentType({
        fileName: 'legal_notice.pdf',
        extractedText: 'Demand notice issued before filing.',
      })
    ).toBe('notice');

    expect(
      inferDocumentType({
        fileName: 'bank_receipt.pdf',
        extractedText: 'UTR and payment proof enclosed.',
      })
    ).toBe('receipt');
  });
});
