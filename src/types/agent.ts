// ─── Agent Cluster ───────────────────────────────────────────────────────────────

export type AgentCluster =
  | 'prosecution'
  | 'defense'
  | 'judicial'
  | 'strategy';

// ─── Agent Definition ───────────────────────────────────────────────────────────

export interface AgentDefinition {
  id: string;
  name: string;
  corporation: string;
  role: string;
  cluster: AgentCluster;
  systemPrompt: string;
  tools: string[];
}

// ─── Agent Message ──────────────────────────────────────────────────────────────

export type MessageType = 'analysis' | 'debate' | 'strategy' | 'verdict';

export interface AgentMessage {
  id: string;
  agentName: string;
  agentRole: string;
  phase: WarRoomPhase;
  content: string;
  messageType: MessageType;
  timestamp: number;
}

// ─── War Room Phases ────────────────────────────────────────────────────────────

/**
 * War Room operates in 6 phases:
 *  1 - Case Analysis: Initial review of facts and evidence
 *  2 - Legal Research: Identification of applicable laws and precedents
 *  3 - Argument Construction: Building prosecution and defense arguments
 *  4 - Cross-Examination: Adversarial debate between clusters
 *  5 - Strategy Synthesis: Combining insights into strategy
 *  6 - Final Verdict: Judicial cluster delivers assessment
 */
export type WarRoomPhase = 1 | 2 | 3 | 4 | 5 | 6;

export const WAR_ROOM_PHASE_NAMES: Record<WarRoomPhase, string> = {
  1: 'Case Analysis',
  2: 'Legal Research',
  3: 'Argument Construction',
  4: 'Cross-Examination',
  5: 'Strategy Synthesis',
  6: 'Final Verdict',
};

// ─── War Room Session ───────────────────────────────────────────────────────────

export type WarRoomStatus = 'running' | 'completed' | 'paused';

export interface WarRoomSession {
  id: string;
  caseId: string;
  sessionName: string;
  status: WarRoomStatus;
  config: WarRoomConfig;
  summary: string | null;
  startedAt: number;
  completedAt: number | null;
  messages: AgentMessage[];
}

// ─── War Room Config ────────────────────────────────────────────────────────────

export interface WarRoomConfig {
  /** Which agent clusters to activate for this session */
  activeClusters: AgentCluster[];

  /** Maximum number of debate rounds during cross-examination */
  maxDebateRounds: number;

  /** Whether to include Chanakya Niti strategy analysis */
  enableChanakyaStrategy: boolean;

  /** Whether to include game theory analysis */
  enableGameTheory: boolean;

  /** Temperature setting for LLM calls (0.0 - 1.0) */
  temperature: number;

  /** Custom focus areas or specific questions to address */
  focusAreas: string[];

  /** The LLM provider/model to use for this session */
  llmProvider: string;
  llmModel: string;
}

// ─── Default Config ─────────────────────────────────────────────────────────────

export const DEFAULT_WAR_ROOM_CONFIG: WarRoomConfig = {
  activeClusters: ['prosecution', 'defense', 'judicial', 'strategy'],
  maxDebateRounds: 3,
  enableChanakyaStrategy: true,
  enableGameTheory: true,
  temperature: 0.7,
  focusAreas: [],
  llmProvider: 'openai',
  llmModel: 'gpt-4o-mini',
};
