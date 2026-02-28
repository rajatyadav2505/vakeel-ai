export const LEGAL_DISCLAIMER =
  'AI-generated content is assistive only. A licensed advocate must independently verify facts, citations, and filings before use in court.';

export const DPDP_CONSENT_TEXT =
  'By continuing, you confirm informed consent for processing personal and case data under applicable DPDP obligations.';

export function requireLawyerVerification(checked: boolean) {
  if (!checked) {
    throw new Error('Lawyer verification is mandatory before export.');
  }
}
