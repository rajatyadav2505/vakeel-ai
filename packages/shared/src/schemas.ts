import { z } from 'zod';

export const roleSchema = z.enum(['ADVOCATE', 'JUNIOR', 'CLIENT', 'ADMIN']);
export const caseTypeSchema = z.enum([
  'civil',
  'criminal',
  'constitutional',
  'family',
  'labor',
  'consumer',
  'tax',
]);
export const documentTypeSchema = z.enum([
  'unknown',
  'petition',
  'affidavit',
  'notice',
  'order',
  'agreement',
  'postal_proof',
  'receipt',
  'annexure',
  'evidence',
  'audio_note',
]);
export const strategyEngineSchema = z.enum(['legacy', 'KAUTILYA_CERES']);
export const strategyModeSchema = z.enum(['robust_mode', 'exploit_mode']);
export const strategyComputeModeSchema = z.enum(['fast', 'standard', 'full']);
export const kautilyaRoleSchema = z.enum([
  'petitioner_or_plaintiff',
  'respondent_or_defendant',
  'judge_merits',
  'judge_procedure',
  'judge_citations',
  'appellate_reviewer',
  'clerk_verifier',
  'strategist',
]);
export const kautilyaTacticSchema = z.enum(['SAMA', 'DANA', 'BHEDA', 'DANDA']);
export const kautilyaPhaseSchema = z.enum([
  'pre_litigation',
  'interim_relief',
  'pleadings',
  'discovery',
  'evidence',
  'hearing',
  'settlement',
  'appeal',
]);
export const kautilyaMoveTypeSchema = z.enum([
  'claim',
  'rebuttal',
  'application',
  'cross_examination',
  'evidence_request',
  'settlement_offer',
  'procedural_push',
  'concession',
  'order_draft',
]);

export const caseCreateSchema = z.object({
  title: z.string().min(5).max(180),
  cnrNumber: z.string().trim().max(64).optional(),
  caseType: caseTypeSchema,
  courtName: z.string().trim().max(180).optional(),
  summary: z.string().min(20).max(6000),
  clientName: z.string().trim().max(120).optional(),
  opponentName: z.string().trim().max(120).optional(),
  jurisdiction: z.string().trim().max(120).optional(),
  lawyerVerifiedForExport: z.boolean().default(false),
});

export const simulationRequestSchema = z.object({
  caseId: z.string().uuid(),
  objective: z.string().min(10).max(500),
  depth: z.number().int().min(5).max(12).default(7),
  includeMonteCarlo: z.boolean().default(true),
  includeChanakyaOverlay: z.boolean().default(true),
  engineName: strategyEngineSchema.default('legacy'),
  strategyMode: strategyModeSchema.default('robust_mode'),
  computeMode: strategyComputeModeSchema.default('standard'),
});

export const petitionRequestSchema = z.object({
  caseId: z.string().uuid(),
  petitionType: z.enum(['writ', 'pil', 'civil_suit', 'criminal_complaint', 'bail', 'appeal']),
  courtTemplate: z.enum(['district', 'high_court', 'supreme_court']),
  facts: z.string().min(20).max(8000),
  legalGrounds: z.string().min(20).max(8000),
  reliefSought: z.string().min(10).max(3000),
  lawyerVerified: z.boolean(),
});

export const whatsappWebhookSchema = z.object({
  from: z.string().min(8),
  body: z.string().min(1),
  messageId: z.string().min(1),
  mediaUrl: z.string().url().optional(),
});

export type CaseCreateInput = z.infer<typeof caseCreateSchema>;
export type SimulationRequestInput = z.infer<typeof simulationRequestSchema>;
export type PetitionRequestInput = z.infer<typeof petitionRequestSchema>;
export type WhatsAppWebhookInput = z.infer<typeof whatsappWebhookSchema>;
