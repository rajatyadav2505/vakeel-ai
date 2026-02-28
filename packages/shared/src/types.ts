export type Role = 'ADVOCATE' | 'JUNIOR' | 'CLIENT' | 'ADMIN';

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
  disclaimerAccepted: boolean;
  createdAt: string;
}
