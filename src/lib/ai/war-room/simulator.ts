import { v4 as uuidv4 } from 'uuid';
import type { AgentMessage, WarRoomConfig, WarRoomPhase } from '@/types/agent';
import type { Case } from '@/types/case';
import type { StrategyAnalysis } from '@/types/strategy';
import { AGENT_ROSTER } from '@/lib/ai/agents/roster';
import { analyzeStrategy } from '@/lib/ai/strategy/analyzer';
import { invokeModel } from '@/lib/ai/shared/llm';

const PHASE_SEQUENCE: WarRoomPhase[] = [1, 2, 3, 4, 5, 6];

const PHASE_INTENT: Record<WarRoomPhase, string> = {
  1: 'fact decomposition and issue framing',
  2: 'legal authority identification',
  3: 'argument architecture and risk mapping',
  4: 'cross-examination and rebuttal simulation',
  5: 'strategy synthesis',
  6: 'final verdict and action plan',
};

function deriveRiskLevel(caseType: Case['caseType']) {
  if (caseType === 'criminal' || caseType === 'constitutional') return 'high';
  if (caseType === 'family' || caseType === 'consumer') return 'low';
  return 'medium';
}

function summarizeCase(caseData: Case, brief: string): string {
  return [
    `Case: ${caseData.title}`,
    `Type: ${caseData.caseType}`,
    `Court: ${caseData.court ?? 'Not set'}`,
    `Status: ${caseData.status}`,
    `Brief: ${brief}`,
  ].join('\n');
}

function deterministicMessage(params: {
  phase: WarRoomPhase;
  agentName: string;
  role: string;
  objective: string;
  caseSummary: string;
}): string {
  const prefix = `[${params.agentName} | ${params.role}]`;
  if (params.phase === 1) {
    return `${prefix} Material fact map completed. Primary fault-line identified around ${params.objective}.`;
  }

  if (params.phase === 2) {
    return `${prefix} Applicable statutes and precedent clusters identified. Authority pack is ready for deployment.`;
  }

  if (params.phase === 3) {
    return `${prefix} Built lead argument chain with fallback routes if maintainability is challenged.`;
  }

  if (params.phase === 4) {
    return `${prefix} Simulated hostile cross. Opponent weak point: internal timeline inconsistency.`;
  }

  if (params.phase === 5) {
    return `${prefix} Recommend converging on the highest-payoff track with procedural tempo control.`;
  }

  return `${prefix} Final verdict: proceed with disciplined filing sequence and evidence-first courtroom narrative.`;
}

async function buildMessage(params: {
  phase: WarRoomPhase;
  agentName: string;
  role: string;
  objective: string;
  summary: string;
}): Promise<string> {
  const fallback = deterministicMessage({
    phase: params.phase,
    agentName: params.agentName,
    role: params.role,
    objective: params.objective,
    caseSummary: params.summary,
  });

  const llm = await invokeModel({
    temperature: 0.25,
    maxTokens: 180,
    prompt: [
      'You are one legal strategy agent in a 20-agent Indian litigation war-room.',
      `Agent: ${params.agentName} (${params.role})`,
      `Phase ${params.phase}: ${PHASE_INTENT[params.phase]}`,
      `Objective: ${params.objective}`,
      `Case Summary:\n${params.summary}`,
      'Return one concise paragraph with tactical recommendation.',
    ].join('\n'),
  });

  return llm || fallback;
}

function pickPhaseForCluster(cluster: 'prosecution' | 'defense' | 'judicial' | 'strategy'): WarRoomPhase {
  if (cluster === 'prosecution') return 3;
  if (cluster === 'defense') return 4;
  if (cluster === 'judicial') return 6;
  return 5;
}

function typeForPhase(phase: WarRoomPhase): AgentMessage['messageType'] {
  if (phase === 4) return 'debate';
  if (phase === 5) return 'strategy';
  if (phase === 6) return 'verdict';
  return 'analysis';
}

function createPhaseBriefings(params: {
  messages: AgentMessage[];
  objective: string;
}): AgentMessage[] {
  const briefings: AgentMessage[] = [];

  for (const phase of PHASE_SEQUENCE) {
    briefings.push({
      id: uuidv4(),
      agentName: 'Command Console',
      agentRole: `Phase ${phase} Briefing`,
      phase,
      content: `Phase ${phase} objective: ${PHASE_INTENT[phase]}. Tactical target: ${params.objective}.`,
      messageType: typeForPhase(phase),
      timestamp: Date.now(),
    });
  }

  return [...briefings, ...params.messages];
}

function buildSummary(strategy: StrategyAnalysis): string {
  const primary = strategy.recommendedStrategy.primary;
  const topPrediction = strategy.opponentPredictions[0];
  return [
    `Primary Track: ${primary.name}`,
    `Reasoning: ${strategy.recommendedStrategy.reasoning}`,
    `Expected Outcome: ${primary.expectedOutcome}`,
    `Opponent Likely Move: ${topPrediction?.move ?? 'Not enough data'} (${Math.round(
      (topPrediction?.probability ?? 0) * 100
    )}%)`,
    `Confidence: ${Math.round(strategy.confidence * 100)}%`,
  ].join('\n');
}

export interface WarGameResult {
  sessionName: string;
  strategy: StrategyAnalysis;
  messages: AgentMessage[];
  summary: string;
}

export async function runWarGameSimulation(params: {
  caseData: Case;
  objective: string;
  caseBrief: string;
  config: WarRoomConfig;
}): Promise<WarGameResult> {
  const summary = summarizeCase(params.caseData, params.caseBrief);
  const strategy = await analyzeStrategy({
    caseData: params.caseData,
    facts: params.caseBrief,
    objective: params.objective,
    riskTolerance: deriveRiskLevel(params.caseData.caseType),
  });

  const activeAgents = AGENT_ROSTER.filter((agent) =>
    params.config.activeClusters.includes(agent.cluster)
  ).slice(0, 20);

  const messages: AgentMessage[] = [];
  for (const agent of activeAgents) {
    const phase = pickPhaseForCluster(agent.cluster);
    const content = await buildMessage({
      phase,
      agentName: `${agent.name} | ${agent.corporation}`,
      role: agent.role,
      objective: params.objective,
      summary,
    });

    messages.push({
      id: uuidv4(),
      agentName: agent.name,
      agentRole: `${agent.role} (${agent.corporation})`,
      phase,
      content,
      messageType: typeForPhase(phase),
      timestamp: Date.now(),
    });
  }

  const orderedMessages = createPhaseBriefings({
    messages: messages.sort((a, b) => a.phase - b.phase),
    objective: params.objective,
  }).sort((a, b) => (a.phase === b.phase ? a.timestamp - b.timestamp : a.phase - b.phase));

  return {
    sessionName: `${params.caseData.title} - War Simulation`,
    strategy,
    messages: orderedMessages,
    summary: buildSummary(strategy),
  };
}
