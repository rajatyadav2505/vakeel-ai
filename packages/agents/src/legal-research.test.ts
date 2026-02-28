import { describe, expect, it } from 'vitest';
import type { PrecedentAuthority, StatutoryAuthority } from '@nyaya/shared';
import {
  buildLegalResearchPacket,
  legalGroundingStatus,
  verifyLegalClaims,
  type PrecedentSourceAdapter,
  type StatuteSourceAdapter,
} from './legal-research';

function mockStatute(id: string, issueTag: string): StatutoryAuthority {
  return {
    id,
    authorityType: 'statute',
    source: 'india_code',
    sourceUrl: `https://example.org/statute/${id}`,
    title: `Mock statute ${id}`,
    proposition: `Statutory proposition for ${issueTag}`,
    issueTags: [issueTag],
    relevanceScore: 0.8,
    courtPriorityScore: 1,
    freshnessScore: 0.7,
    overallScore: 0.8,
    retrievedAt: '2026-02-28T00:00:00.000Z',
    verified: true,
    actName: 'Mock Act, 2026',
    sectionRef: 'Section 10',
  };
}

function mockPrecedent(id: string, issueTag: string, date: string): PrecedentAuthority {
  return {
    id,
    authorityType: 'precedent',
    source: 'ecourts',
    sourceUrl: `https://example.org/precedent/${id}`,
    title: `Mock precedent ${id}`,
    proposition: `Holding for ${issueTag}`,
    issueTags: [issueTag],
    relevanceScore: 0.78,
    courtPriorityScore: 0.87,
    freshnessScore: 0.74,
    overallScore: 0.8,
    retrievedAt: '2026-02-28T00:00:00.000Z',
    verified: true,
    caseName: `Mock v State (${id})`,
    court: 'Delhi High Court',
    date,
    citationText: `Mock citation ${id}`,
    forumFitScore: 0.6,
    jurisdictionFitScore: 0.6,
  };
}

const statuteAdapter: StatuteSourceAdapter = {
  id: 'mock-statutes',
  async search(input) {
    return [mockStatute('stat-1', input.issues[0] ?? 'general')];
  },
};

const precedentAdapter: PrecedentSourceAdapter = {
  id: 'mock-precedents',
  async search(input) {
    return [
      mockPrecedent('prec-leading', input.issues[0] ?? 'general', '2024-08-01'),
      mockPrecedent('prec-latest', input.issues[0] ?? 'general', '2025-12-01'),
    ];
  },
};

describe('legal research packet', () => {
  it('returns statute, leading precedent, and latest precedent buckets with timestamp', async () => {
    const packet = await buildLegalResearchPacket(
      {
        caseId: crypto.randomUUID(),
        summary: 'Cheque dishonour dispute under section 138 with notice timeline issue.',
        objective: 'Assess maintainability and recovery strategy.',
        forum: 'Delhi High Court',
        jurisdiction: 'Delhi',
      },
      {
        statuteAdapters: [statuteAdapter],
        precedentAdapters: [precedentAdapter],
        lookbackMonths: 24,
      }
    );

    expect(packet.statutoryAuthorities.length).toBeGreaterThan(0);
    expect(packet.leadingPrecedents.length).toBeGreaterThan(0);
    expect(packet.latestPrecedents.length).toBeGreaterThan(0);
    expect(packet.precedentsCheckedAt.length).toBeGreaterThan(10);
    expect(packet.authorityCoverageScore).toBeGreaterThan(0);
  });

  it('marks unsupported legal propositions as unverified', async () => {
    const packet = await buildLegalResearchPacket(
      {
        caseId: crypto.randomUUID(),
        summary: 'Consumer deficiency claim with jurisdiction dispute.',
        objective: 'Evaluate statutory and precedent support.',
      },
      {
        statuteAdapters: [statuteAdapter],
        precedentAdapters: [precedentAdapter],
      }
    );

    const claims = verifyLegalClaims({
      claims: [
        { statement: 'Section 10 applies to maintainability in this case.', issueTag: packet.issuesIdentified[0] },
        { statement: 'Unrelated tax proposition with no authority in record.', issueTag: 'tax' },
      ],
      packet,
    });

    expect(claims[0]?.verified).toBe(true);
    expect(claims[1]?.verified).toBe(false);
    expect(claims[1]?.unverifiedReason?.length).toBeGreaterThan(5);
  });

  it('surfaces incomplete grounding when coverage is below threshold', async () => {
    const emptyStatuteAdapter: StatuteSourceAdapter = {
      id: 'empty-statute',
      async search() {
        return [];
      },
    };
    const emptyPrecedentAdapter: PrecedentSourceAdapter = {
      id: 'empty-prec',
      async search() {
        return [];
      },
    };

    const packet = await buildLegalResearchPacket(
      {
        caseId: crypto.randomUUID(),
        summary: 'Complex issue with sparse facts and no clear statute references.',
        objective: 'Legal analysis',
      },
      {
        statuteAdapters: [emptyStatuteAdapter],
        precedentAdapters: [emptyPrecedentAdapter],
      }
    );

    expect(legalGroundingStatus(packet, 0.55)).toBe('incomplete');
  });
});
