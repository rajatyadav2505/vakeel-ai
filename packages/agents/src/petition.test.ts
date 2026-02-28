import { describe, expect, it } from 'vitest';
import { generateFormattedPetition } from './petition';

describe('generateFormattedPetition', () => {
  it('includes legal research packet and separated authority buckets', async () => {
    const output = await generateFormattedPetition({
      caseId: crypto.randomUUID(),
      petitionType: 'civil_suit',
      courtTemplate: 'high_court',
      facts: 'Cheque dishonour with notice and payment default by respondent.',
      legalGrounds:
        'Section 138 NI Act ingredients are satisfied and limitation requirements are met.',
      reliefSought: 'Issue directions for recovery and interim protection.',
      lawyerVerified: true,
    });

    expect(output.legalResearchPacket).toBeDefined();
    expect(output.statutoryAuthorities).toBeDefined();
    expect(output.leadingPrecedents).toBeDefined();
    expect(output.latestPrecedents).toBeDefined();
    expect(output.legalGroundingStatus === 'complete' || output.legalGroundingStatus === 'incomplete').toBe(
      true
    );
    expect(output.body.includes('VERIFICATION')).toBe(true);
  });
});
