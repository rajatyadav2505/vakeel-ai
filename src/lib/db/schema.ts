import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// ─── Cases ──────────────────────────────────────────────────────────────────────

export const cases = sqliteTable('cases', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  caseNumber: text('case_number'),
  caseType: text('case_type', {
    enum: ['civil', 'criminal', 'constitutional', 'family', 'labor', 'consumer', 'tax'],
  }).notNull(),
  court: text('court'),
  judge: text('judge'),
  status: text('status', {
    enum: ['active', 'pending', 'closed', 'won', 'lost'],
  }).notNull().default('active'),
  description: text('description'),
  filingDate: text('filing_date'),
  nextHearing: text('next_hearing'),
  opponentName: text('opponent_name'),
  opponentAdvocate: text('opponent_advocate'),
  clientName: text('client_name'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Case Parties ───────────────────────────────────────────────────────────────

export const caseParties = sqliteTable('case_parties', {
  id: text('id').primaryKey(),
  caseId: text('case_id')
    .notNull()
    .references(() => cases.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  role: text('role', {
    enum: ['petitioner', 'respondent', 'witness', 'advocate', 'judge'],
  }).notNull(),
  contactInfo: text('contact_info'),
  notes: text('notes'),
});

// ─── Case Timeline ──────────────────────────────────────────────────────────────

export const caseTimeline = sqliteTable('case_timeline', {
  id: text('id').primaryKey(),
  caseId: text('case_id')
    .notNull()
    .references(() => cases.id, { onDelete: 'cascade' }),
  eventDate: text('event_date').notNull(),
  eventType: text('event_type', {
    enum: ['filing', 'hearing', 'order', 'adjournment', 'evidence', 'argument'],
  }).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  outcome: text('outcome'),
});

// ─── Hearings ───────────────────────────────────────────────────────────────────

export const hearings = sqliteTable('hearings', {
  id: text('id').primaryKey(),
  caseId: text('case_id')
    .notNull()
    .references(() => cases.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  court: text('court'),
  judge: text('judge'),
  purpose: text('purpose'),
  status: text('status', {
    enum: ['scheduled', 'completed', 'adjourned'],
  }).notNull().default('scheduled'),
  notes: text('notes'),
  outcome: text('outcome'),
});

// ─── Documents ──────────────────────────────────────────────────────────────────

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  caseId: text('case_id')
    .notNull()
    .references(() => cases.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  docType: text('doc_type', {
    enum: ['petition', 'affidavit', 'evidence', 'order', 'memo'],
  }).notNull(),
  filePath: text('file_path'),
  content: text('content'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Petitions ──────────────────────────────────────────────────────────────────

export const petitions = sqliteTable('petitions', {
  id: text('id').primaryKey(),
  caseId: text('case_id'),
  petitionType: text('petition_type', {
    enum: ['writ', 'pil', 'civil_suit', 'criminal_complaint', 'bail', 'appeal', 'slp', 'review'],
  }).notNull(),
  court: text('court'),
  title: text('title').notNull(),
  content: text('content'),
  citations: text('citations'),
  status: text('status', {
    enum: ['draft', 'review', 'final'],
  }).notNull().default('draft'),
  generatedAt: integer('generated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── War Room Sessions ──────────────────────────────────────────────────────────

export const warRoomSessions = sqliteTable('war_room_sessions', {
  id: text('id').primaryKey(),
  caseId: text('case_id')
    .notNull()
    .references(() => cases.id, { onDelete: 'cascade' }),
  sessionName: text('session_name').notNull(),
  status: text('status', {
    enum: ['running', 'completed', 'paused'],
  }).notNull().default('running'),
  config: text('config'),
  summary: text('summary'),
  startedAt: integer('started_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
});

// ─── War Room Messages ──────────────────────────────────────────────────────────

export const warRoomMessages = sqliteTable('war_room_messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => warRoomSessions.id, { onDelete: 'cascade' }),
  agentName: text('agent_name').notNull(),
  agentRole: text('agent_role').notNull(),
  phase: integer('phase').notNull(),
  content: text('content').notNull(),
  messageType: text('message_type', {
    enum: ['analysis', 'debate', 'strategy', 'verdict'],
  }).notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Strategy Analyses ──────────────────────────────────────────────────────────

export const strategyAnalyses = sqliteTable('strategy_analyses', {
  id: text('id').primaryKey(),
  caseId: text('case_id')
    .notNull()
    .references(() => cases.id, { onDelete: 'cascade' }),
  chanakyaAnalysis: text('chanakya_analysis'),
  gameTheoryAnalysis: text('game_theory_analysis'),
  opponentPredictions: text('opponent_predictions'),
  recommendedStrategy: text('recommended_strategy'),
  confidence: real('confidence').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── LLM Config ─────────────────────────────────────────────────────────────────

export const llmConfig = sqliteTable('llm_config', {
  id: text('id').primaryKey(),
  provider: text('provider', {
    enum: ['openai', 'anthropic', 'google', 'groq', 'ollama'],
  }).notNull(),
  modelName: text('model_name').notNull(),
  apiKey: text('api_key'),
  baseUrl: text('base_url'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── WhatsApp Threads ──────────────────────────────────────────────────────────

export const whatsappThreads = sqliteTable('whatsapp_threads', {
  id: text('id').primaryKey(),
  caseId: text('case_id')
    .notNull()
    .references(() => cases.id, { onDelete: 'cascade' }),
  advocatePhone: text('advocate_phone').notNull(),
  clientPhone: text('client_phone').notNull(),
  label: text('label'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── WhatsApp Messages ─────────────────────────────────────────────────────────

export const whatsappMessages = sqliteTable('whatsapp_messages', {
  id: text('id').primaryKey(),
  threadId: text('thread_id')
    .notNull()
    .references(() => whatsappThreads.id, { onDelete: 'cascade' }),
  direction: text('direction', {
    enum: ['inbound', 'outbound'],
  }).notNull(),
  body: text('body').notNull(),
  mediaUrl: text('media_url'),
  providerMessageId: text('provider_message_id'),
  status: text('status', {
    enum: ['received', 'sent', 'delivered', 'failed'],
  }).notNull().default('received'),
  timestamp: integer('timestamp', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Type Exports (inferred from schema) ────────────────────────────────────────

export type CaseRow = typeof cases.$inferSelect;
export type NewCaseRow = typeof cases.$inferInsert;

export type CasePartyRow = typeof caseParties.$inferSelect;
export type NewCasePartyRow = typeof caseParties.$inferInsert;

export type CaseTimelineRow = typeof caseTimeline.$inferSelect;
export type NewCaseTimelineRow = typeof caseTimeline.$inferInsert;

export type HearingRow = typeof hearings.$inferSelect;
export type NewHearingRow = typeof hearings.$inferInsert;

export type DocumentRow = typeof documents.$inferSelect;
export type NewDocumentRow = typeof documents.$inferInsert;

export type PetitionRow = typeof petitions.$inferSelect;
export type NewPetitionRow = typeof petitions.$inferInsert;

export type WarRoomSessionRow = typeof warRoomSessions.$inferSelect;
export type NewWarRoomSessionRow = typeof warRoomSessions.$inferInsert;

export type WarRoomMessageRow = typeof warRoomMessages.$inferSelect;
export type NewWarRoomMessageRow = typeof warRoomMessages.$inferInsert;

export type StrategyAnalysisRow = typeof strategyAnalyses.$inferSelect;
export type NewStrategyAnalysisRow = typeof strategyAnalyses.$inferInsert;

export type LlmConfigRow = typeof llmConfig.$inferSelect;
export type NewLlmConfigRow = typeof llmConfig.$inferInsert;

export type WhatsappThreadRow = typeof whatsappThreads.$inferSelect;
export type NewWhatsappThreadRow = typeof whatsappThreads.$inferInsert;

export type WhatsappMessageRow = typeof whatsappMessages.$inferSelect;
export type NewWhatsappMessageRow = typeof whatsappMessages.$inferInsert;
