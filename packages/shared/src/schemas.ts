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
  engineName: z.enum(['legacy', 'KAUTILYA_CERES']).default('legacy'),
  strategyMode: z.enum(['robust_mode', 'exploit_mode']).default('robust_mode'),
  computeMode: z.enum(['fast', 'standard', 'full']).default('standard'),
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
