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

function mockPrecedent(
  id: string,
  issueTag: string,
  date: string,
  overrides?: Partial<PrecedentAuthority>
): PrecedentAuthority {
  return {
    id,
    authorityType: 'precedent',
    source: 'ecourts',
    sourceUrl: overrides?.sourceUrl ?? `https://example.org/precedent/${id}`,
    title: overrides?.title ?? `Mock precedent ${id}`,
    proposition: overrides?.proposition ?? `Holding for ${issueTag}`,
    issueTags: overrides?.issueTags ?? [issueTag],
    relevanceScore: overrides?.relevanceScore ?? 0.78,
    courtPriorityScore: overrides?.courtPriorityScore ?? 0.87,
    freshnessScore: overrides?.freshnessScore ?? 0.74,
    overallScore: overrides?.overallScore ?? 0.8,
    retrievedAt: overrides?.retrievedAt ?? '2026-02-28T00:00:00.000Z',
    verified: overrides?.verified ?? true,
    caseName: overrides?.caseName ?? `Mock v State (${id})`,
    court: overrides?.court ?? 'Delhi High Court',
    date: overrides?.date ?? date,
    citationText: overrides?.citationText ?? `Mock citation ${id}`,
    forumFitScore: overrides?.forumFitScore ?? 0.6,
    jurisdictionFitScore: overrides?.jurisdictionFitScore ?? 0.6,
    ...(overrides?.neutralCitation ? { neutralCitation: overrides.neutralCitation } : {}),
    ...(overrides?.caseNumber ? { caseNumber: overrides.caseNumber } : {}),
    ...(overrides?.paragraphRefs ? { paragraphRefs: overrides.paragraphRefs } : {}),
    ...(overrides?.pageRefs ? { pageRefs: overrides.pageRefs } : {}),
    ...(overrides?.isDateInferred ? { isDateInferred: overrides.isDateInferred } : {}),
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
    const issueTag = packet.issuesIdentified[0] ?? 'consumer_dispute';

    const claims = verifyLegalClaims({
      claims: [
        { statement: 'Section 10 applies to maintainability in this case.', issueTag },
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

  it('rejects cross-topic statute contamination for injunction and residence disputes', async () => {
    const packet = await buildLegalResearchPacket(
      {
        caseId: crypto.randomUUID(),
        summary:
          'Civil suit for temporary injunction over possession of self-acquired residential property. Defendant claims shared household rights and senior citizen parents seek protection of property.',
        objective: 'Identify the clean statutory framework for interim relief and residence issues.',
        forum: 'District Civil Court',
        jurisdiction: 'State Forum',
      },
      {
        precedentAdapters: [],
      }
    );

    const titles = packet.statutoryAuthorities.map((item) => item.title);
    expect(titles.some((title) => /negotiable instruments/i.test(title))).toBe(false);
    expect(titles.some((title) => /order xxxix|order 39/i.test(title))).toBe(true);
    expect(
      titles.some((title) => /domestic violence act|senior citizens act/i.test(title))
    ).toBe(true);
  });

  it('rejects off-topic precedents while keeping relevant injunction authorities', async () => {
    const mixedPrecedentAdapter: PrecedentSourceAdapter = {
      id: 'mixed-precedents',
      async search() {
        return [
          mockPrecedent('ni-138', 'cheque_bounce', '2024-04-02', {
            title: 'M/s Acme v State - Section 138 Negotiable Instruments Act',
            caseName: 'M/s Acme v State',
            proposition: 'Dishonour of cheque under Section 138 NI Act and notice timelines.',
            citationText: 'Section 138 NI Act',
          }),
          mockPrecedent('inj-1', 'injunction_relief', '2024-08-10', {
            title: 'Dalpat Kumar v Prahlad Singh',
            caseName: 'Dalpat Kumar v Prahlad Singh',
            proposition:
              'Temporary injunction requires prima facie case, balance of convenience, and irreparable injury in possession disputes.',
            citationText: 'Dalpat Kumar v Prahlad Singh',
            court: 'Supreme Court of India',
          }),
        ];
      },
    };

    const packet = await buildLegalResearchPacket(
      {
        caseId: crypto.randomUUID(),
        summary:
          'Plaintiff seeks temporary injunction to protect possession of residential property and maintain status quo pending trial.',
        objective: 'Find the strongest interim injunction authorities.',
        forum: 'District Civil Court',
        jurisdiction: 'State Forum',
      },
      {
        statuteAdapters: [statuteAdapter],
        precedentAdapters: [mixedPrecedentAdapter],
      }
    );

    const titles = packet.leadingPrecedents.map((item) => item.title);
    expect(titles).toContain('Dalpat Kumar v Prahlad Singh');
    expect(titles.some((title) => /negotiable instruments|section 138/i.test(title))).toBe(false);
  });

  it('preserves negotiable-instruments authorities for cheque dishonour matters', async () => {
    const mixedPrecedentAdapter: PrecedentSourceAdapter = {
      id: 'mixed-cheque-precedents',
      async search() {
        return [
          mockPrecedent('ni-138', 'cheque_bounce', '2024-04-02', {
            title: 'M/s Acme v State - Section 138 Negotiable Instruments Act',
            caseName: 'M/s Acme v State',
            proposition: 'Dishonour of cheque under Section 138 NI Act and statutory notice compliance.',
            citationText: 'Section 138 NI Act',
            court: 'Supreme Court of India',
          }),
          mockPrecedent('inj-1', 'injunction_relief', '2024-08-10', {
            title: 'Dalpat Kumar v Prahlad Singh',
            caseName: 'Dalpat Kumar v Prahlad Singh',
            proposition:
              'Temporary injunction requires prima facie case, balance of convenience, and irreparable injury in possession disputes.',
            citationText: 'Dalpat Kumar v Prahlad Singh',
          }),
        ];
      },
    };

    const packet = await buildLegalResearchPacket(
      {
        caseId: crypto.randomUUID(),
        summary:
          'Cheque dishonour complaint under Section 138 of the Negotiable Instruments Act. Statutory notice was issued within time and maintainability is disputed.',
        objective: 'Assess NI Act maintainability and limitation.',
        forum: 'Metropolitan Magistrate',
        jurisdiction: 'Delhi',
      },
      {
        precedentAdapters: [mixedPrecedentAdapter],
      }
    );

    expect(packet.statutoryAuthorities.some((item) => /negotiable instruments/i.test(item.title))).toBe(true);
    expect(packet.leadingPrecedents.some((item) => /section 138/i.test(item.title))).toBe(true);
    expect(packet.leadingPrecedents.some((item) => /dalpat kumar/i.test(item.title))).toBe(false);
  });
});
