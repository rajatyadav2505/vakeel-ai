import { v4 as uuidv4 } from 'uuid';
import { db, rawDb } from './index';
import { llmConfig } from './schema';
import { eq } from 'drizzle-orm';

/**
 * SQL statements to create all tables.
 * Using IF NOT EXISTS so this is idempotent and safe to call on every startup.
 */
const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    case_number TEXT,
    case_type TEXT NOT NULL CHECK (case_type IN ('civil','criminal','constitutional','family','labor','consumer','tax')),
    court TEXT,
    judge TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','closed','won','lost')),
    description TEXT,
    filing_date TEXT,
    next_hearing TEXT,
    opponent_name TEXT,
    opponent_advocate TEXT,
    client_name TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS case_parties (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('petitioner','respondent','witness','advocate','judge')),
    contact_info TEXT,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS case_timeline (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    event_date TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('filing','hearing','order','adjournment','evidence','argument')),
    title TEXT NOT NULL,
    description TEXT,
    outcome TEXT
  );

  CREATE TABLE IF NOT EXISTS hearings (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    court TEXT,
    judge TEXT,
    purpose TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','adjourned')),
    notes TEXT,
    outcome TEXT
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    doc_type TEXT NOT NULL CHECK (doc_type IN ('petition','affidavit','evidence','order','memo')),
    file_path TEXT,
    content TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS petitions (
    id TEXT PRIMARY KEY,
    case_id TEXT,
    petition_type TEXT NOT NULL CHECK (petition_type IN ('writ','pil','civil_suit','criminal_complaint','bail','appeal','slp','review')),
    court TEXT,
    title TEXT NOT NULL,
    content TEXT,
    citations TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','final')),
    generated_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS war_room_sessions (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    session_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','paused')),
    config TEXT,
    summary TEXT,
    started_at INTEGER NOT NULL,
    completed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS war_room_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES war_room_sessions(id) ON DELETE CASCADE,
    agent_name TEXT NOT NULL,
    agent_role TEXT NOT NULL,
    phase INTEGER NOT NULL,
    content TEXT NOT NULL,
    message_type TEXT NOT NULL CHECK (message_type IN ('analysis','debate','strategy','verdict')),
    timestamp INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS strategy_analyses (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    chanakya_analysis TEXT,
    game_theory_analysis TEXT,
    opponent_predictions TEXT,
    recommended_strategy TEXT,
    confidence REAL NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS llm_config (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL CHECK (provider IN ('openai','anthropic','google','groq','ollama')),
    model_name TEXT NOT NULL,
    api_key TEXT,
    base_url TEXT,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS whatsapp_threads (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    advocate_phone TEXT NOT NULL,
    client_phone TEXT NOT NULL,
    label TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES whatsapp_threads(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
    body TEXT NOT NULL,
    media_url TEXT,
    provider_message_id TEXT,
    status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','sent','delivered','failed')),
    timestamp INTEGER NOT NULL
  );

  -- Indexes for common lookups
  CREATE INDEX IF NOT EXISTS idx_case_parties_case_id ON case_parties(case_id);
  CREATE INDEX IF NOT EXISTS idx_case_timeline_case_id ON case_timeline(case_id);
  CREATE INDEX IF NOT EXISTS idx_hearings_case_id ON hearings(case_id);
  CREATE INDEX IF NOT EXISTS idx_documents_case_id ON documents(case_id);
  CREATE INDEX IF NOT EXISTS idx_petitions_case_id ON petitions(case_id);
  CREATE INDEX IF NOT EXISTS idx_war_room_sessions_case_id ON war_room_sessions(case_id);
  CREATE INDEX IF NOT EXISTS idx_war_room_messages_session_id ON war_room_messages(session_id);
  CREATE INDEX IF NOT EXISTS idx_strategy_analyses_case_id ON strategy_analyses(case_id);
  CREATE INDEX IF NOT EXISTS idx_llm_config_active ON llm_config(is_active);
  CREATE INDEX IF NOT EXISTS idx_whatsapp_threads_case_id ON whatsapp_threads(case_id);
  CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_thread_id ON whatsapp_messages(thread_id);
`;

/**
 * Seeds a default LLM configuration row if none exists.
 * Defaults to OpenAI GPT-4o-mini as a sensible starting point.
 */
async function seedDefaultLlmConfig(): Promise<void> {
  const existing = await db.select().from(llmConfig).limit(1);

  if (existing.length === 0) {
    await db.insert(llmConfig).values({
      id: uuidv4(),
      provider: 'openai',
      modelName: 'gpt-4o-mini',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      isActive: true,
      createdAt: new Date(),
    });
    console.log('[db] Seeded default LLM config (openai / gpt-4o-mini)');
  }
}

/**
 * Ensures the database is ready:
 *  1. Creates all tables if they don't exist
 *  2. Creates indexes for common query patterns
 *  3. Seeds default configuration data
 *
 * Safe to call multiple times (idempotent).
 */
export async function ensureDb(): Promise<void> {
  try {
    rawDb.exec(CREATE_TABLES_SQL);
    console.log('[db] Tables and indexes verified');

    await seedDefaultLlmConfig();
    console.log('[db] Database ready');
  } catch (error) {
    console.error('[db] Failed to initialize database:', error);
    throw error;
  }
}

/**
 * Resets the database by dropping and recreating all tables.
 * USE WITH EXTREME CAUTION - this destroys all data.
 */
export async function resetDb(): Promise<void> {
  const tables = [
    'war_room_messages',
    'war_room_sessions',
    'strategy_analyses',
    'documents',
    'hearings',
    'case_timeline',
    'case_parties',
    'petitions',
    'llm_config',
    'whatsapp_messages',
    'whatsapp_threads',
    'cases',
  ];

  for (const table of tables) {
    rawDb.exec(`DROP TABLE IF EXISTS ${table}`);
  }

  console.log('[db] All tables dropped');
  await ensureDb();
  console.log('[db] Database reset complete');
}
