// ─── Petition Type ──────────────────────────────────────────────────────────────

export type PetitionType =
  | 'writ'
  | 'pil'
  | 'civil_suit'
  | 'criminal_complaint'
  | 'bail'
  | 'appeal'
  | 'slp'
  | 'review';

export const PETITION_TYPE_LABELS: Record<PetitionType, string> = {
  writ: 'Writ Petition',
  pil: 'Public Interest Litigation',
  civil_suit: 'Civil Suit',
  criminal_complaint: 'Criminal Complaint',
  bail: 'Bail Application',
  appeal: 'Appeal',
  slp: 'Special Leave Petition',
  review: 'Review Petition',
};

// ─── Petition Status ────────────────────────────────────────────────────────────

export type PetitionStatus = 'draft' | 'review' | 'final';

// ─── Petition Section ───────────────────────────────────────────────────────────

export interface PetitionSection {
  heading: string;
  content: string;
  order: number;
}

// ─── Citation ───────────────────────────────────────────────────────────────────

export interface Citation {
  caseTitle: string;
  citation: string;
  court: string;
  year: number;
  relevance: string;
  paragraph: string;
}

// ─── Petition ───────────────────────────────────────────────────────────────────

export interface Petition {
  id: string;
  caseId: string | null;
  petitionType: PetitionType;
  court: string | null;
  title: string;
  content: PetitionContent;
  citations: Citation[];
  status: PetitionStatus;
  generatedAt: number;
  updatedAt: number;
}

// ─── Petition Content ───────────────────────────────────────────────────────────

export interface PetitionContent {
  /** Sections that make up the body of the petition */
  sections: PetitionSection[];

  /** The prayer clause / relief sought */
  prayer: string;

  /** Verification text */
  verification: string;

  /** Raw full-text representation for export */
  fullText: string;
}

// ─── Petition Generation Request ────────────────────────────────────────────────

export interface PetitionGenerationRequest {
  petitionType: PetitionType;
  court: string;
  title: string;
  caseId?: string;
  facts: string;
  legalGrounds: string;
  reliefSought: string;
  additionalContext?: string;
}

// ─── Petition Template ──────────────────────────────────────────────────────────

export interface PetitionTemplate {
  petitionType: PetitionType;
  court: string;
  sections: PetitionTemplateSection[];
}

export interface PetitionTemplateSection {
  heading: string;
  instructions: string;
  order: number;
  required: boolean;
}
