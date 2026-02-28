'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { caseCreateSchema, type DocumentType } from '@nyaya/shared';
import { buildCaseEvidenceGraph } from '@nyaya/agents';
import { canCreateCase, requireAppUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { sanitizePlainText } from '@/lib/utils';
import { enforceRateLimit } from '@/lib/rate-limit';
import { transcribeVoiceNote } from '@/lib/ai/whisper';
import { encryptText } from '@/lib/crypto';
import {
  UPLOAD_POLICY,
  isPrivilegedDocument,
  sha256ForFile,
  validateUploadedFile,
  type UploadKind,
} from '@/lib/evidence/security';
import { extractStructuredTextFromUpload, inferDocumentType } from '@/lib/evidence/parsing';
import {
  extractTextWithManagedOcr,
  resolveOcrProviderOrder,
  type OcrAttempt,
  type OcrProvider,
} from '@/lib/evidence/ocr';

async function uploadOptionalFile(params: {
  bucket: string;
  file: File | null;
  caseId: string;
  suffix: string;
  normalizedFileName?: string;
}) {
  if (!params.file || params.file.size === 0) return null;
  const supabase = createSupabaseServerClient();
  const path = `${params.caseId}/${params.suffix}-${Date.now()}-${params.normalizedFileName ?? params.file.name}`;

  const upload = await supabase.storage.from(params.bucket).upload(path, params.file, {
    upsert: false,
    ...(params.file.type ? { contentType: params.file.type } : {}),
  });
  if (upload.error) throw upload.error;
  return path;
}

async function getCostPolicy(params: {
  userId: string;
  supabase: ReturnType<typeof createSupabaseServerClient>;
}) {
  const fallback = {
    freeTierOnly: true,
    preferredTranscriptionProvider: 'sarvam' as const,
    preferredOcrProvider: 'sarvam' as OcrProvider,
  };

  const settings = await params.supabase
    .from('user_settings')
    .select('free_tier_only,llm_provider')
    .eq('owner_user_id', params.userId)
    .maybeSingle();

  if (settings.error || !settings.data) return fallback;

  const freeTierOnly = settings.data.free_tier_only ?? true;
  const preferredTranscriptionProvider =
    settings.data.llm_provider === 'openai' && !freeTierOnly ? ('openai' as const) : ('sarvam' as const);
  const preferredOcrProvider = settings.data.llm_provider === 'google' ? ('google' as const) : ('sarvam' as const);

  return {
    freeTierOnly,
    preferredTranscriptionProvider,
    preferredOcrProvider,
  };
}

interface PreparedUpload {
  kind: UploadKind;
  file: File;
  normalizedFileName: string;
  extractedText: string | null;
  needsOcr: boolean;
  parserMethod: string;
  ocrProviderUsed: OcrProvider | null;
  ocrAttempts: OcrAttempt[];
  documentType: DocumentType;
  isPrivileged: boolean;
  sha256: string;
}

async function prepareUpload(params: {
  file: File | null;
  kind: UploadKind;
  ocrProviders?: OcrProvider[];
}): Promise<PreparedUpload | null> {
  if (!params.file || params.file.size === 0) return null;
  const validation = await validateUploadedFile({ file: params.file, kind: params.kind });
  const structured = await extractStructuredTextFromUpload(params.file);
  let extractedText = structured.text;
  let needsOcr = structured.needsOcr;
  let parserMethod: string = structured.method;
  let ocrProviderUsed: OcrProvider | null = null;
  let ocrAttempts: OcrAttempt[] = [];

  if (params.kind === 'pdf' && structured.needsOcr) {
    const ocr = await extractTextWithManagedOcr({
      file: params.file,
      ...(params.ocrProviders ? { providers: params.ocrProviders } : {}),
    });
    ocrAttempts = ocr.attempts;
    if (ocr.text) {
      extractedText = ocr.text;
      needsOcr = false;
      parserMethod = ocr.method;
      ocrProviderUsed = ocr.providerUsed;
    } else {
      parserMethod = 'pdf_no_text_layer';
      ocrProviderUsed = null;
    }
  }

  const documentType =
    params.kind === 'audio'
      ? 'audio_note'
      : inferDocumentType({
          fileName: validation.normalizedName,
          extractedText,
        });
  const sha256 = await sha256ForFile(params.file);
  const isPrivileged = isPrivilegedDocument({
    fileName: validation.normalizedName,
    text: extractedText,
  });

  return {
    kind: params.kind,
    file: params.file,
    normalizedFileName: validation.normalizedName,
    extractedText,
    needsOcr,
    parserMethod,
    ocrProviderUsed,
    ocrAttempts,
    documentType,
    isPrivileged,
    sha256,
  };
}

export async function createCaseAction(formData: FormData) {
  const user = await requireAppUser();
  if (!canCreateCase(user.role)) {
    throw new Error('You do not have permission to create cases.');
  }
  await enforceRateLimit(`case-create:${user.userId}`, 20);

  const parsed = caseCreateSchema.parse({
    title: sanitizePlainText(String(formData.get('title') ?? '')),
    cnrNumber: sanitizePlainText(String(formData.get('cnrNumber') ?? '')),
    caseType: String(formData.get('caseType') ?? ''),
    courtName: sanitizePlainText(String(formData.get('courtName') ?? '')),
    summary: sanitizePlainText(String(formData.get('summary') ?? '')),
    clientName: sanitizePlainText(String(formData.get('clientName') ?? '')),
    opponentName: sanitizePlainText(String(formData.get('opponentName') ?? '')),
    jurisdiction: sanitizePlainText(String(formData.get('jurisdiction') ?? '')),
    lawyerVerifiedForExport: String(formData.get('lawyerVerifiedForExport') ?? '') === 'on',
  });

  const caseId = crypto.randomUUID();
  const supabase = createSupabaseServerClient();
  const costPolicy = await getCostPolicy({ userId: user.userId, supabase });

  const casePdf = formData.get('casePdf');
  const voiceNote = formData.get('voiceNote');
  const preparedPdf = await prepareUpload({
    file: casePdf instanceof File ? casePdf : null,
    kind: 'pdf',
    ocrProviders: resolveOcrProviderOrder(costPolicy.preferredOcrProvider),
  });
  const preparedVoice = await prepareUpload({
    file: voiceNote instanceof File ? voiceNote : null,
    kind: 'audio',
  });

  const totalUploadBytes = (preparedPdf?.file.size ?? 0) + (preparedVoice?.file.size ?? 0);
  if (totalUploadBytes > UPLOAD_POLICY.maxCaseTotalBytes) {
    throw new Error(`Total upload size exceeds ${UPLOAD_POLICY.maxCaseTotalBytes} bytes for one case.`);
  }

  const pdfPath = await uploadOptionalFile({
    bucket: 'case-documents',
    file: preparedPdf?.file ?? null,
    caseId,
    suffix: 'intake',
    ...(preparedPdf?.normalizedFileName
      ? { normalizedFileName: preparedPdf.normalizedFileName }
      : {}),
  });

  const voicePath = await uploadOptionalFile({
    bucket: 'voice-notes',
    file: preparedVoice?.file ?? null,
    caseId,
    suffix: 'voice',
    ...(preparedVoice?.normalizedFileName
      ? { normalizedFileName: preparedVoice.normalizedFileName }
      : {}),
  });

  const transcript = preparedVoice
    ? await transcribeVoiceNote(preparedVoice.file, {
        freeTierOnly: costPolicy.freeTierOnly,
        preferredProvider: costPolicy.preferredTranscriptionProvider,
      })
    : null;
  const voiceText = transcript || preparedVoice?.extractedText || null;
  const caseSensitivity =
    preparedPdf?.isPrivileged ||
    preparedVoice?.isPrivileged ||
    isPrivilegedDocument({ fileName: parsed.title, text: parsed.summary })
      ? 'privileged'
      : 'standard';

  const evidenceGraph = await buildCaseEvidenceGraph({
    caseId,
    summary: parsed.summary,
    ...(voiceText ? { voiceTranscript: voiceText } : {}),
    evidenceSources: [
      ...(preparedPdf
        ? [
            {
              id: crypto.randomUUID(),
              name: preparedPdf.normalizedFileName,
              documentType: preparedPdf.documentType,
              text: preparedPdf.extractedText,
            },
          ]
        : []),
      ...(preparedVoice
        ? [
            {
              id: crypto.randomUUID(),
              name: preparedVoice.normalizedFileName,
              documentType: 'audio_note' as const,
              text: voiceText,
            },
          ]
        : []),
    ],
  });
  const encryptedSummary = await encryptText(parsed.summary);

  const { error } = await supabase.from('cases').insert({
    id: caseId,
    owner_user_id: user.userId,
    title: parsed.title,
    cnr_number: parsed.cnrNumber || null,
    case_type: parsed.caseType,
    stage: 'intake',
    court_name: parsed.courtName || null,
    summary: parsed.summary,
    summary_encrypted: encryptedSummary,
    client_name: parsed.clientName || null,
    opponent_name: parsed.opponentName || null,
    jurisdiction: parsed.jurisdiction || null,
    intake_pdf_path: pdfPath,
    intake_voice_path: voicePath,
    voice_transcript: voiceText,
    lawyer_verified_for_export: parsed.lawyerVerifiedForExport,
  });

  if (error) throw new Error('Failed to create case. Please try again.');

  // Best-effort enterprise evidence graph persistence. Migration-safe by design.
  const evidenceUpdate = await supabase
    .from('cases')
    .update({
      evidence_graph_json: evidenceGraph,
      evidence_extracted_at: new Date().toISOString(),
      case_sensitivity: caseSensitivity,
    })
    .eq('id', caseId)
    .eq('owner_user_id', user.userId);
  if (evidenceUpdate.error) {
    console.warn('[cases] evidence graph update skipped:', evidenceUpdate.error.message);
  }

  const documentRows = [
    ...(preparedPdf && pdfPath
      ? [
          {
            id: crypto.randomUUID(),
            case_id: caseId,
            owner_user_id: user.userId,
            file_name: preparedPdf.normalizedFileName,
            file_path: pdfPath,
            mime_type: preparedPdf.file.type || 'application/pdf',
            size_bytes: preparedPdf.file.size,
            sha256: preparedPdf.sha256,
            document_type: preparedPdf.documentType,
            parser_status: preparedPdf.needsOcr ? 'pending' : 'completed',
            parsed_text: preparedPdf.extractedText,
            parsed_json: {
              parserMethod: preparedPdf.parserMethod,
              ocrProviderUsed: preparedPdf.ocrProviderUsed,
              ocrAttempts: preparedPdf.ocrAttempts,
            },
            is_privileged: preparedPdf.isPrivileged,
          },
        ]
      : []),
    ...(preparedVoice && voicePath
      ? [
          {
            id: crypto.randomUUID(),
            case_id: caseId,
            owner_user_id: user.userId,
            file_name: preparedVoice.normalizedFileName,
            file_path: voicePath,
            mime_type: preparedVoice.file.type || 'audio/mpeg',
            size_bytes: preparedVoice.file.size,
            sha256: preparedVoice.sha256,
            document_type: 'audio_note',
            parser_status: voiceText ? 'completed' : 'pending',
            parsed_text: voiceText,
            parsed_json: {
              parserMethod: transcript ? 'provider_transcription' : 'audio_fallback',
              ocrProviderUsed: null,
              ocrAttempts: [],
            },
            is_privileged: preparedVoice.isPrivileged,
          },
        ]
      : []),
  ];

  if (documentRows.length) {
    const docInsert = await supabase.from('case_documents').insert(documentRows);
    if (docInsert.error) {
      console.warn('[cases] case_documents insert skipped:', docInsert.error.message);
    }
  }

  const consentInsert = await supabase.from('consent_ledger').insert({
    id: crypto.randomUUID(),
    owner_user_id: user.userId,
    case_id: caseId,
    consent_type: 'data_processing',
    purpose: 'case_intake_evidence_graph',
    accepted: true,
    metadata_json: {
      lawyerVerifiedForExport: parsed.lawyerVerifiedForExport,
      hasPdf: Boolean(preparedPdf),
      hasVoice: Boolean(preparedVoice),
      caseSensitivity,
    },
  });
  if (consentInsert.error) {
    console.warn('[cases] consent ledger insert skipped:', consentInsert.error.message);
  }

  revalidatePath('/');
  revalidatePath('/cases');
  redirect(`/cases/${caseId}`);
}
