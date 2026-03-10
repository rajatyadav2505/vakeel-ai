import type { DocumentType } from '@nyaya/shared';

export interface KautilyaFixtureDocument {
  id: string;
  name: string;
  documentType: DocumentType;
  text: string;
}

export interface KautilyaFixtureCase {
  caseId: string;
  title: string;
  objective: string;
  summary: string;
  forum: string;
  jurisdiction: string;
  voiceTranscript: string;
  documents: KautilyaFixtureDocument[];
}

export const KAUTILYA_CERES_FIXTURE_CASE: KautilyaFixtureCase = {
  caseId: '11111111-1111-4111-8111-111111111111',
  title: 'Rao v Horizon Habitat Developers',
  objective:
    'Secure interim restraint on third-party transfer, expose contradictions in possession timeline, and preserve settlement leverage.',
  summary: [
    'The petitioner paid Rs 18,50,000 under a builder-buyer agreement dated 05/01/2026 for Flat B-402 in Delhi.',
    'A possession assurance email dated 01/02/2026 states fit-out access was granted.',
    'The respondent later claimed in reply that possession was never offered and that no pre-cancellation notice was served.',
    'The petitioner relies on WhatsApp messages, payment receipts, and a site visit note to seek interim protection.',
    'The dispute also contains a settlement branch because the petitioner is willing to accept possession with delay compensation if title is preserved.',
    'Urgent interim relief is sought before the respondent creates third-party rights.',
  ].join(' '),
  forum: 'Delhi High Court',
  jurisdiction: 'Delhi',
  voiceTranscript:
    'Client states the builder first promised possession in February, then denied handing over access, and now threatens resale unless fresh payment is made.',
  documents: [
    {
      id: 'ev_agreement',
      name: 'builder-buyer-agreement.txt',
      documentType: 'agreement',
      text:
        'Builder Buyer Agreement dated 05/01/2026. Total consideration Rs 18,50,000. Possession target March 2026 subject to final finishing. Clause 14 requires seven-day notice before cancellation.',
    },
    {
      id: 'ev_receipt',
      name: 'payment-receipt.txt',
      documentType: 'receipt',
      text:
        'Receipt acknowledges Rs 18,50,000 received from Petitioner Rao toward Flat B-402 on 06/01/2026.',
    },
    {
      id: 'ev_email',
      name: 'possession-assurance-email.txt',
      documentType: 'evidence',
      text:
        'Email from Horizon Habitat dated 01/02/2026: "Fit-out access for Flat B-402 can commence from Monday. Keys will be issued at site office."',
    },
    {
      id: 'ev_reply',
      name: 'respondent-reply-affidavit.txt',
      documentType: 'affidavit',
      text:
        'Reply affidavit states that possession was never offered, keys were never prepared, and no enforceable notice obligation arose because the petitioner defaulted.',
    },
    {
      id: 'ev_site_note',
      name: 'site-visit-note.txt',
      documentType: 'evidence',
      text:
        'Site visit note records that security permitted entry to Flat B-402 on 03/02/2026 for inspection, but access was later withdrawn.',
    },
  ],
};
