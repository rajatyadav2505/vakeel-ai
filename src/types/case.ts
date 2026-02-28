// ─── Enum Types ─────────────────────────────────────────────────────────────────

export type CaseType =
  | 'civil'
  | 'criminal'
  | 'constitutional'
  | 'family'
  | 'labor'
  | 'consumer'
  | 'tax';

export type CaseStatus =
  | 'active'
  | 'pending'
  | 'closed'
  | 'won'
  | 'lost';

export type PartyRole =
  | 'petitioner'
  | 'respondent'
  | 'witness'
  | 'advocate'
  | 'judge';

export type EventType =
  | 'filing'
  | 'hearing'
  | 'order'
  | 'adjournment'
  | 'evidence'
  | 'argument';

export type HearingStatus =
  | 'scheduled'
  | 'completed'
  | 'adjourned';

export type DocType =
  | 'petition'
  | 'affidavit'
  | 'evidence'
  | 'order'
  | 'memo';

// ─── Case Interface ─────────────────────────────────────────────────────────────

export interface Case {
  id: string;
  title: string;
  caseNumber: string | null;
  caseType: CaseType;
  court: string | null;
  judge: string | null;
  status: CaseStatus;
  description: string | null;
  filingDate: string | null;
  nextHearing: string | null;
  opponentName: string | null;
  opponentAdvocate: string | null;
  clientName: string | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

// ─── Case Party ─────────────────────────────────────────────────────────────────

export interface CaseParty {
  id: string;
  caseId: string;
  name: string;
  role: PartyRole;
  contactInfo: string | null;
  notes: string | null;
}

// ─── Timeline Event ─────────────────────────────────────────────────────────────

export interface TimelineEvent {
  id: string;
  caseId: string;
  eventDate: string;
  eventType: EventType;
  title: string;
  description: string | null;
  outcome: string | null;
}

// ─── Hearing ────────────────────────────────────────────────────────────────────

export interface Hearing {
  id: string;
  caseId: string;
  date: string;
  court: string | null;
  judge: string | null;
  purpose: string | null;
  status: HearingStatus;
  notes: string | null;
  outcome: string | null;
}

// ─── Document ───────────────────────────────────────────────────────────────────

export interface Document {
  id: string;
  caseId: string;
  title: string;
  docType: DocType;
  filePath: string | null;
  content: string | null;
  createdAt: number;
}

// ─── Convenience Types ──────────────────────────────────────────────────────────

/** A case with all its related data loaded */
export interface CaseWithDetails extends Case {
  parties: CaseParty[];
  timeline: TimelineEvent[];
  hearings: Hearing[];
  documents: Document[];
}

/** Summary view for case listings */
export interface CaseSummary {
  id: string;
  title: string;
  caseNumber: string | null;
  caseType: CaseType;
  court: string | null;
  status: CaseStatus;
  clientName: string | null;
  nextHearing: string | null;
  updatedAt: number;
}
