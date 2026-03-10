import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const redirect = vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  });

  const revalidatePath = vi.fn();
  const requireAppUser = vi.fn();
  const canCreateCase = vi.fn();
  const createSupabaseServerClient = vi.fn();
  const enforceRateLimit = vi.fn();
  const transcribeVoiceNote = vi.fn();
  const encryptText = vi.fn();
  const buildCaseEvidenceGraph = vi.fn();
  const validateUploadedFile = vi.fn();
  const sha256ForFile = vi.fn();
  const isPrivilegedDocument = vi.fn();
  const extractStructuredTextFromUpload = vi.fn();
  const inferDocumentType = vi.fn();
  const extractTextWithManagedOcr = vi.fn();
  const resolveOcrProviderOrder = vi.fn();

  return {
    redirect,
    revalidatePath,
    requireAppUser,
    canCreateCase,
    createSupabaseServerClient,
    enforceRateLimit,
    transcribeVoiceNote,
    encryptText,
    buildCaseEvidenceGraph,
    validateUploadedFile,
    sha256ForFile,
    isPrivilegedDocument,
    extractStructuredTextFromUpload,
    inferDocumentType,
    extractTextWithManagedOcr,
    resolveOcrProviderOrder,
  };
});

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('@/lib/auth', () => ({
  requireAppUser: mocks.requireAppUser,
  canCreateCase: mocks.canCreateCase,
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));

vi.mock('@/lib/ai/whisper', () => ({
  transcribeVoiceNote: mocks.transcribeVoiceNote,
}));

vi.mock('@/lib/crypto', () => ({
  encryptText: mocks.encryptText,
}));

vi.mock('@nyaya/agents', () => ({
  buildCaseEvidenceGraph: mocks.buildCaseEvidenceGraph,
}));

vi.mock('@/lib/evidence/security', () => ({
  UPLOAD_POLICY: {
    maxCaseTotalBytes: 25_000_000,
  },
  validateUploadedFile: mocks.validateUploadedFile,
  sha256ForFile: mocks.sha256ForFile,
  isPrivilegedDocument: mocks.isPrivilegedDocument,
}));

vi.mock('@/lib/evidence/parsing', () => ({
  extractStructuredTextFromUpload: mocks.extractStructuredTextFromUpload,
  inferDocumentType: mocks.inferDocumentType,
}));

vi.mock('@/lib/evidence/ocr', () => ({
  extractTextWithManagedOcr: mocks.extractTextWithManagedOcr,
  resolveOcrProviderOrder: mocks.resolveOcrProviderOrder,
}));

import { createCaseAction } from './cases';

function createSupabaseMock() {
  const upload = vi.fn(async () => ({ error: null }));
  const storageFrom = vi.fn(() => ({ upload }));
  const casesUpdateEqOwner = vi.fn(async () => ({ error: null }));
  const casesUpdateEqId = vi.fn(() => ({ eq: casesUpdateEqOwner }));
  const casesUpdate = vi.fn(() => ({ eq: casesUpdateEqId }));
  const tables = {
    cases: {
      insert: vi.fn(async () => ({ error: null })),
      update: casesUpdate,
    },
    case_documents: {
      insert: vi.fn(async () => ({ error: null })),
    },
    consent_ledger: {
      insert: vi.fn(async () => ({ error: null })),
    },
    user_settings: {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ error: null, data: null })),
        })),
      })),
    },
  } as const;

  return {
    client: {
      storage: {
        from: storageFrom,
      },
      from: vi.fn((table: keyof typeof tables) => tables[table]),
    },
    tables,
    upload,
    storageFrom,
    casesUpdateEqId,
    casesUpdateEqOwner,
  };
}

describe('createCaseAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAppUser.mockResolvedValue({ userId: 'user_123', role: 'ADVOCATE' });
    mocks.canCreateCase.mockReturnValue(true);
    mocks.enforceRateLimit.mockResolvedValue(undefined);
    mocks.transcribeVoiceNote.mockResolvedValue(null);
    mocks.encryptText.mockResolvedValue('encrypted-summary');
    mocks.buildCaseEvidenceGraph.mockResolvedValue({ facts: [], chronology: [] });
    mocks.validateUploadedFile.mockResolvedValue({ normalizedName: 'intake.pdf' });
    mocks.sha256ForFile.mockResolvedValue('sha256-hash');
    mocks.isPrivilegedDocument.mockReturnValue(false);
    mocks.extractStructuredTextFromUpload.mockResolvedValue({
      text: 'Readable extracted content from the filing bundle.',
      needsOcr: false,
      method: 'text_layer',
    });
    mocks.inferDocumentType.mockReturnValue('notice');
    mocks.extractTextWithManagedOcr.mockResolvedValue({
      text: 'OCR extracted text',
      providerUsed: 'google',
      method: 'google_gemini_pdf',
      attempts: [{ provider: 'google', status: 'succeeded', detail: 'ok', durationMs: 11 }],
    });
    mocks.resolveOcrProviderOrder.mockReturnValue(['google', 'sarvam']);
  });

  it('creates a case, updates evidence metadata, and redirects', async () => {
    const supabase = createSupabaseMock();
    mocks.createSupabaseServerClient.mockReturnValue(supabase.client);

    const formData = new FormData();
    formData.set('title', 'Acme Builders v Rao');
    formData.set('caseType', 'civil');
    formData.set('summary', 'This is a sufficiently detailed summary of the case facts for intake processing.');
    formData.set('courtName', 'High Court');
    formData.set('lawyerVerifiedForExport', 'on');

    await expect(createCaseAction(formData)).rejects.toThrow(/^REDIRECT:\/cases\//);

    expect(mocks.enforceRateLimit).toHaveBeenCalledWith('case-create:user_123', 20);
    expect(mocks.buildCaseEvidenceGraph).toHaveBeenCalledWith({
      caseId: expect.any(String),
      summary: 'This is a sufficiently detailed summary of the case facts for intake processing.',
      evidenceSources: [],
    });
    expect(supabase.tables.cases.insert).toHaveBeenCalledTimes(1);
    expect(supabase.tables.case_documents.insert).not.toHaveBeenCalled();
    expect(supabase.tables.consent_ledger.insert).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/cases');
  });

  it('stores uploaded PDF metadata and OCR attempts when a PDF is attached', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_710_000_000_000);
    const supabase = createSupabaseMock();
    mocks.createSupabaseServerClient.mockReturnValue(supabase.client);
    mocks.extractStructuredTextFromUpload.mockResolvedValue({
      text: null,
      needsOcr: true,
      method: 'binary_pdf',
    });

    const formData = new FormData();
    formData.set('title', 'Rao v Transit Authority');
    formData.set('caseType', 'consumer');
    formData.set('summary', 'The client seeks relief for delayed possession and repeated service deficiency.');
    formData.set('casePdf', new File(['pdf-content'], 'bundle.pdf', { type: 'application/pdf' }));

    await expect(createCaseAction(formData)).rejects.toThrow(/^REDIRECT:\/cases\//);

    expect(mocks.extractTextWithManagedOcr).toHaveBeenCalledTimes(1);
    expect(supabase.storageFrom).toHaveBeenCalledWith('case-documents');
    expect(supabase.upload).toHaveBeenCalledTimes(1);
    expect(supabase.tables.case_documents.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        file_name: 'intake.pdf',
        parser_status: 'completed',
        document_type: 'notice',
        parsed_text: 'OCR extracted text',
        parsed_json: expect.objectContaining({
          parserMethod: 'google_gemini_pdf',
          ocrProviderUsed: 'google',
          ocrAttempts: [{ provider: 'google', status: 'succeeded', detail: 'ok', durationMs: 11 }],
        }),
      }),
    ]);
  });
});
