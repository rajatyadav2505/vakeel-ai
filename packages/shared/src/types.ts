export type Role = 'ADVOCATE' | 'JUNIOR' | 'CLIENT' | 'ADMIN';

export type StrategyEngineName = 'legacy' | 'KAUTILYA_CERES';
export type StrategyMode = 'robust_mode' | 'exploit_mode';
export type StrategyComputeMode = 'fast' | 'standard' | 'full';
export type KautilyaRole =
  | 'petitioner_or_plaintiff'
  | 'respondent_or_defendant'
  | 'judge_merits'
  | 'judge_procedure'
  | 'judge_citations'
  | 'appellate_reviewer'
  | 'clerk_verifier'
  | 'strategist';
export type KautilyaTactic = 'SAMA' | 'DANA' | 'BHEDA' | 'DANDA';
export type KautilyaPhase =
  | 'pre_litigation'
  | 'interim_relief'
  | 'pleadings'
  | 'discovery'
  | 'evidence'
  | 'hearing'
  | 'settlement'
  | 'appeal';
export type KautilyaMoveType =
  | 'claim'
  | 'rebuttal'
  | 'application'
  | 'cross_examination'
  | 'evidence_request'
  | 'settlement_offer'
  | 'procedural_push'
  | 'concession'
  | 'order_draft';

export type CaseType =
  | 'civil'
  | 'criminal'
  | 'constitutional'
  | 'family'
  | 'labor'
  | 'consumer'
  | 'tax';

export type CaseStage = 'intake' | 'analysis' | 'filing' | 'hearing' | 'closed';

export type ClaimSupportClass = 'evidence' | 'law' | 'assumption';

export type DocumentType =
  | 'unknown'
  | 'petition'
  | 'affidavit'
  | 'notice'
  | 'order'
  | 'agreement'
  | 'postal_proof'
  | 'receipt'
  | 'annexure'
  | 'evidence'
  | 'audio_note';

export interface EvidenceAnchor {
  sourceType: 'uploaded_document' | 'voice_transcript' | 'case_summary' | 'legal_retrieval';
  sourceId?: string;
  sourceName?: string;
  page?: number;
  paragraph?: number;
  excerpt: string;
  confidence: number;
}

export interface CaseFact {
  id: string;
  kind:
    | 'party'
    | 'date'
    | 'amount'
    | 'section'
    | 'court'
    | 'judge'
    | 'case_number'
    | 'cnr'
    | 'address'
    | 'exhibit';
  label: string;
  value: string;
  confidence: number;
  anchors: EvidenceAnchor[];
}

export interface ChronologyEvent {
  id: string;
  title: string;
  date: string | null;
  details: string;
  confidence: number;
  anchors: EvidenceAnchor[];
}

export interface ContradictionIssue {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  anchors: EvidenceAnchor[];
}

export interface MissingDocumentIssue {
  id: string;
  title: string;
  requiredDocumentType: DocumentType;
  reason: string;
  confidence: number;
}

export interface NextDocumentSuggestion {
  id: string;
  documentType: DocumentType;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

export interface EvidenceBackedClaim {
  id: string;
  statement: string;
  supportClass: ClaimSupportClass;
  requiresHumanConfirmation: boolean;
  anchors: EvidenceAnchor[];
}

export interface KautilyaIssueNode {
  id: string;
  label: string;
  phase: KautilyaPhase;
  status: 'open' | 'contested' | 'gated' | 'resolved';
  severity: 'low' | 'medium' | 'high';
  confidence: number;
  supportingEvidenceIds: string[];
  authorityIds: string[];
}

export interface KautilyaEvidenceNode {
  id: string;
  label: string;
  sourceName: string;
  documentType: DocumentType | 'voice_transcript' | 'case_summary';
  excerpt: string;
  confidence: number;
  issueIds: string[];
}

export interface KautilyaAuthorityNode {
  id: string;
  title: string;
  authorityType: AuthorityType;
  proposition: string;
  issueTags: string[];
  sourceUrl: string;
  score: number;
}

export interface KautilyaProcedureGate {
  id: string;
  label: string;
  phase: KautilyaPhase;
  status: 'clear' | 'watch' | 'blocked';
  reason: string;
  requiredEvidenceIds: string[];
}

export interface KautilyaStakeholderNode {
  id: string;
  label: string;
  kind:
    | 'party'
    | 'witness'
    | 'expert'
    | 'regulator'
    | 'insurer'
    | 'auditor'
    | 'court'
    | 'other';
  stance: 'ally' | 'adversary' | 'neutral' | 'convertible' | 'constrained';
  credibility: number;
  notes: string;
}

export interface KautilyaMandalaEdge {
  id: string;
  fromStakeholderId: string;
  toStakeholderId: string;
  relation: 'ally' | 'adversary' | 'neutral' | 'convertible' | 'constrained';
  weight: number;
  rationale: string;
}

export interface KautilyaUncertaintyNode {
  id: string;
  proposition: string;
  level: number;
  blocker: string;
  linkedIssueIds: string[];
}

export interface KautilyaHistoryEvent {
  id: string;
  actor: KautilyaRole | 'system';
  phase: KautilyaPhase;
  summary: string;
  linkedMoveIds: string[];
}

export interface KautilyaCaseGraph {
  issueGraph: KautilyaIssueNode[];
  evidenceGraph: KautilyaEvidenceNode[];
  authorityGraph: KautilyaAuthorityNode[];
  proceduralState: KautilyaProcedureGate[];
  mandalaGraph: {
    stakeholders: KautilyaStakeholderNode[];
    edges: KautilyaMandalaEdge[];
  };
  historyLog: KautilyaHistoryEvent[];
  uncertaintyMap: KautilyaUncertaintyNode[];
}

export interface CaseEvidenceGraph {
  caseId: string;
  extractionStatus: 'pending' | 'processing' | 'completed' | 'failed';
  facts: CaseFact[];
  chronology: ChronologyEvent[];
  contradictions: ContradictionIssue[];
  missingDocuments: MissingDocumentIssue[];
  nextDocumentSuggestions: NextDocumentSuggestion[];
  generatedAt: string;
}

export type AgentCluster =
  | 'orchestrator'
  | 'litigation'
  | 'research'
  | 'forensics'
  | 'negotiation'
  | 'judicial'
  | 'strategy'
  | 'compliance';

export interface CaseRecord {
  id: string;
  ownerUserId: string;
  title: string;
  cnrNumber: string | null;
  caseType: CaseType;
  stage: CaseStage;
  courtName: string | null;
  summary: string;
  clientName: string | null;
  opponentName: string | null;
  jurisdiction: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Citation {
  id: string;
  title: string;
  source: 'indiankanoon' | 'bare_act' | 'internal';
  url: string;
  excerpt: string;
  confidence: number;
}

export type AuthorityType = 'statute' | 'rule' | 'regulation' | 'notification' | 'circular' | 'precedent';

export type AuthoritySource =
  | 'india_code'
  | 'ecourts'
  | 'supreme_court'
  | 'indiankanoon'
  | 'verdictum'
  | 'scc_online'
  | 'internal'
  | 'unknown';

export interface AuthorityBase {
  id: string;
  authorityType: AuthorityType;
  source: AuthoritySource;
  sourceUrl: string;
  title: string;
  proposition: string;
  issueTags: string[];
  relevanceScore: number;
  courtPriorityScore: number;
  freshnessScore: number;
  overallScore: number;
  retrievedAt: string;
  verified: boolean;
}

export interface StatutoryAuthority extends AuthorityBase {
  authorityType: Exclude<AuthorityType, 'precedent'>;
  actName: string;
  sectionRef?: string;
  ruleRef?: string;
  clauseRef?: string;
  notificationRef?: string;
  jurisdiction?: string;
  state?: string;
}

export interface PrecedentAuthority extends AuthorityBase {
  authorityType: 'precedent';
  caseName: string;
  court: string;
  bench?: string;
  date: string;
  citationText: string;
  neutralCitation?: string;
  caseNumber?: string;
  paragraphRefs?: number[];
  pageRefs?: number[];
  forumFitScore: number;
  jurisdictionFitScore: number;
  isDateInferred?: boolean;
}

export interface ConflictAuthority {
  id: string;
  issueTag: string;
  summary: string;
  conflictingAuthorityIds: string[];
  severity: 'low' | 'medium' | 'high';
}

export interface LegalResearchCacheSliceMeta {
  status: 'fresh' | 'cache' | 'miss';
  ageMs: number;
  ttlMs: number;
}

export interface LegalResearchPacket {
  queryHash: string;
  issuesIdentified: string[];
  jurisdictionUsed: string | null;
  forumUsed: string | null;
  proceduralPosture: string | null;
  reliefType: string | null;
  statutoryAuthorities: StatutoryAuthority[];
  leadingPrecedents: PrecedentAuthority[];
  latestPrecedents: PrecedentAuthority[];
  conflictsDetected: ConflictAuthority[];
  authorityCoverageScore: number;
  precedentsCheckedAt: string;
  unresolvedIssues: string[];
  cacheMeta: {
    statutes: LegalResearchCacheSliceMeta;
    leadingPrecedents: LegalResearchCacheSliceMeta;
    latestPrecedents: LegalResearchCacheSliceMeta;
  };
}

export interface GroundedLegalClaim {
  id: string;
  statement: string;
  issueTag: string;
  supportType: 'statute' | 'precedent' | 'mixed' | 'none';
  authorityIds: string[];
  verified: boolean;
  unverifiedReason?: string;
}

export interface AgentPersona {
  id: string;
  name: string;
  corporation: string;
  cluster: AgentCluster;
  role: string;
  tools: string[];
}

export interface KautilyaExpectedUtility {
  merits_delta: number;
  leverage_delta: number;
  credibility_delta: number;
  settlement_value: number;
  sanction_risk: number;
  reversal_risk: number;
  unsupported_claim_risk: number;
  overall: number;
}

export interface KautilyaVerifierResult {
  verifier: string;
  status: 'approved' | 'abstained' | 'rejected';
  score: number;
  reason: string;
}

export interface KautilyaStructuredMove {
  id: string;
  role: KautilyaRole;
  phase: KautilyaPhase;
  tactic: KautilyaTactic;
  move_type: KautilyaMoveType;
  target_issue_id: string;
  claim: string;
  evidence_ids: string[];
  authority_ids: string[];
  expected_utility: KautilyaExpectedUtility;
  confidence: number;
  verifier_status: 'approved' | 'abstained' | 'rejected';
  verifier_results: KautilyaVerifierResult[];
  support_spans: string[];
}

export interface KautilyaJudgeScore {
  judgeRole:
    | 'judge_merits'
    | 'judge_procedure'
    | 'judge_citations'
    | 'appellate_reviewer'
    | 'neutrality_auditor';
  orderVariant: 'original' | 'swapped';
  legalCorrectness: number;
  citationGrounding: number;
  proceduralCompliance: number;
  consistency: number;
  fairness: number;
  appealSurvival: number;
  overall: number;
  notes: string;
}

export interface KautilyaJudgeAggregate {
  scores: KautilyaJudgeScore[];
  aggregateOverall: number;
  disagreementIndex: number;
  appealSurvival: number;
  orderSwapDelta: number;
}

export interface KautilyaContradictionTarget {
  id: string;
  issueId: string;
  label: string;
  supportingEvidenceIds: string[];
  acceptanceScoreDrop: number;
  minCutCost: number;
  rationale: string;
}

export interface KautilyaPolicySnapshot {
  role: Extract<KautilyaRole, 'petitioner_or_plaintiff' | 'respondent_or_defendant'>;
  bundleId: string;
  evidenceIds: string[];
  tactic: KautilyaTactic;
  cumulativeRegret: number;
  probability: number;
}

export interface KautilyaIracBlock {
  id: string;
  issue: string;
  rule: string;
  application: string;
  conclusion: string;
  evidenceIds: string[];
  authorityIds: string[];
}

export interface KautilyaSettlementOption {
  id: string;
  title: string;
  concession: string;
  trigger: string;
  leverageNote: string;
  settlementValue: number;
}

export interface KautilyaAppealRisk {
  id: string;
  strategyId: string;
  severity: 'low' | 'medium' | 'high';
  risk: string;
  mitigation: string;
  authorityIds: string[];
}

export interface KautilyaLikelyOrder {
  prevailingSide: 'petitioner_or_plaintiff' | 'respondent_or_defendant' | 'split';
  summary: string;
  proceduralNote: string;
  reasoning: string[];
}

export interface KautilyaStrategyCard {
  id: string;
  role: 'petitioner_or_plaintiff' | 'respondent_or_defendant';
  mode: StrategyMode;
  title: string;
  summary: string;
  structuredMoves: KautilyaStructuredMove[];
  judgeAggregate: KautilyaJudgeAggregate;
  contradictionTargetIds: string[];
  citedEvidenceIds: string[];
  citedAuthorityIds: string[];
  expectedValue: number;
  appealSurvival: number;
  settlementSignal: number;
  iracBlocks: KautilyaIracBlock[];
}

export interface KautilyaDistillationTrace {
  role: KautilyaRole;
  qualityScore: number;
  approvalState: 'candidate' | 'approved' | 'rejected';
  judgeAgreement: number;
  groundingScore: number;
  unsupportedClaimRate: number;
  reversalRisk: number;
  prompt: string;
  completion: string;
  traceSummary: string;
}

export interface KautilyaCeresOutput {
  engine: 'KAUTILYA_CERES';
  requestedMode: StrategyMode;
  computeMode: StrategyComputeMode;
  escalationTriggered: boolean;
  caseGraph: KautilyaCaseGraph;
  petitionerStrategies: Record<StrategyMode, KautilyaStrategyCard[]>;
  respondentStrategies: Record<StrategyMode, KautilyaStrategyCard[]>;
  likelyJudgeOrder: KautilyaLikelyOrder;
  contradictionTargets: KautilyaContradictionTarget[];
  missingEvidenceChecklist: MissingDocumentIssue[];
  settlementLadder: KautilyaSettlementOption[];
  appealRiskMap: KautilyaAppealRisk[];
  policySnapshots: KautilyaPolicySnapshot[];
  distillationTrace: KautilyaDistillationTrace;
}

export interface SimulationProposal {
  id: string;
  agentId: string;
  move: string;
  rationale: string;
  expectedPayoff: number;
  riskScore: number;
  citations: Citation[];
}

export interface SimulationStep {
  step: number;
  opponentLikelyMove: string;
  recommendedCounterMove: string;
  chanakyaTag: 'saam' | 'daam' | 'dand' | 'bhed';
  confidence: number;
}

export interface StrategyOutput {
  id: string;
  caseId: string;
  engineName?: StrategyEngineName;
  strategyMode?: StrategyMode;
  computeMode?: StrategyComputeMode;
  headline: string;
  confidence: number;
  winProbability: number;
  winProbabilityBand?: 'low' | 'medium' | 'high';
  payOffMatrix: number[][];
  rankedPlan: SimulationStep[];
  proposals: SimulationProposal[];
  citations: Citation[];
  claims?: EvidenceBackedClaim[];
  legalResearchPacket?: LegalResearchPacket;
  legalAuthorities?: Array<StatutoryAuthority | PrecedentAuthority>;
  groundedLegalClaims?: GroundedLegalClaim[];
  unverifiedClaims?: GroundedLegalClaim[];
  conflictingAuthorities?: ConflictAuthority[];
  precedentsCheckedAt?: string;
  legalGroundingStatus?: 'complete' | 'incomplete';
  kautilyaCeres?: KautilyaCeresOutput;
  disclaimerAccepted: boolean;
  createdAt: string;
}
