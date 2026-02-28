import type { PetitionType } from '@/types/petition';

export interface StatuteProvision {
  statute: string;
  section: string;
  gist: string;
  tags: string[];
}

export interface IndianPrecedent {
  caseTitle: string;
  citation: string;
  court: string;
  year: number;
  ratio: string;
  tags: string[];
}

export const INDIAN_STATUTES: StatuteProvision[] = [
  {
    statute: 'Constitution of India',
    section: 'Article 14',
    gist: 'Guarantees equality before law and equal protection of laws.',
    tags: ['constitutional', 'arbitrariness', 'state action', 'fairness'],
  },
  {
    statute: 'Constitution of India',
    section: 'Article 19(1)(a)',
    gist: 'Protects freedom of speech and expression.',
    tags: ['speech', 'media', 'publication', 'constitutional'],
  },
  {
    statute: 'Constitution of India',
    section: 'Article 21',
    gist: 'Protects life and personal liberty with due process safeguards.',
    tags: ['liberty', 'criminal', 'bail', 'privacy', 'constitutional'],
  },
  {
    statute: 'Code of Civil Procedure, 1908',
    section: 'Order XXXIX Rules 1-2',
    gist: 'Temporary injunctions to preserve subject matter.',
    tags: ['civil', 'injunction', 'interim relief', 'urgency'],
  },
  {
    statute: 'Code of Criminal Procedure, 1973',
    section: 'Section 438',
    gist: 'Anticipatory bail for apprehended arrest.',
    tags: ['criminal', 'bail', 'liberty'],
  },
  {
    statute: 'Code of Criminal Procedure, 1973',
    section: 'Section 439',
    gist: 'High Court and Sessions Court powers regarding bail.',
    tags: ['criminal', 'bail', 'custody'],
  },
  {
    statute: 'Indian Evidence Act, 1872',
    section: 'Sections 65A-65B',
    gist: 'Admissibility of electronic records.',
    tags: ['evidence', 'digital', 'compliance'],
  },
  {
    statute: 'Specific Relief Act, 1963',
    section: 'Section 38',
    gist: 'Perpetual injunction principles.',
    tags: ['civil', 'injunction', 'property'],
  },
  {
    statute: 'Consumer Protection Act, 2019',
    section: 'Section 2(47)',
    gist: 'Defines unfair trade practice and consumer grievances.',
    tags: ['consumer', 'deficiency', 'unfair trade'],
  },
  {
    statute: 'Information Technology Act, 2000',
    section: 'Section 79',
    gist: 'Intermediary liability and safe harbour framework.',
    tags: ['technology', 'platform', 'compliance'],
  },
];

export const INDIAN_PRECEDENTS: IndianPrecedent[] = [
  {
    caseTitle: 'Maneka Gandhi v. Union of India',
    citation: '(1978) 1 SCC 248',
    court: 'Supreme Court of India',
    year: 1978,
    ratio: 'Article 21 procedure must be just, fair, and reasonable.',
    tags: ['constitutional', 'article 21', 'natural justice'],
  },
  {
    caseTitle: 'K.S. Puttaswamy v. Union of India',
    citation: '(2017) 10 SCC 1',
    court: 'Supreme Court of India',
    year: 2017,
    ratio: 'Recognized privacy as a fundamental right under Article 21.',
    tags: ['privacy', 'constitutional', 'article 21'],
  },
  {
    caseTitle: 'Arnesh Kumar v. State of Bihar',
    citation: '(2014) 8 SCC 273',
    court: 'Supreme Court of India',
    year: 2014,
    ratio: 'Arrest in 498A and similar offences must follow strict necessity tests.',
    tags: ['criminal', 'arrest', 'bail', 'liberty'],
  },
  {
    caseTitle: 'Siddharam Satlingappa Mhetre v. State of Maharashtra',
    citation: '(2011) 1 SCC 694',
    court: 'Supreme Court of India',
    year: 2010,
    ratio: 'Anticipatory bail jurisprudence favors personal liberty.',
    tags: ['criminal', 'anticipatory bail', 'liberty'],
  },
  {
    caseTitle: 'Wander Ltd. v. Antox India Pvt. Ltd.',
    citation: '1990 Supp SCC 727',
    court: 'Supreme Court of India',
    year: 1990,
    ratio: 'Appellate interference in injunction orders is limited.',
    tags: ['civil', 'injunction', 'interim relief'],
  },
  {
    caseTitle: 'Dalpat Kumar v. Prahlad Singh',
    citation: '(1992) 1 SCC 719',
    court: 'Supreme Court of India',
    year: 1992,
    ratio: 'Prima facie case, balance of convenience, and irreparable injury test.',
    tags: ['civil', 'injunction', 'interim relief'],
  },
  {
    caseTitle: 'Anvar P.V. v. P.K. Basheer',
    citation: '(2014) 10 SCC 473',
    court: 'Supreme Court of India',
    year: 2014,
    ratio: '65B certificate requirements for electronic evidence.',
    tags: ['evidence', 'electronic', 'criminal', 'civil'],
  },
  {
    caseTitle: 'Arjun Panditrao Khotkar v. Kailash Kushanrao',
    citation: '(2020) 7 SCC 1',
    court: 'Supreme Court of India',
    year: 2020,
    ratio: 'Reaffirmed strict compliance with Section 65B.',
    tags: ['evidence', 'electronic', 'compliance'],
  },
  {
    caseTitle: 'Indian Medical Association v. V.P. Shantha',
    citation: '(1995) 6 SCC 651',
    court: 'Supreme Court of India',
    year: 1995,
    ratio: 'Medical services can be covered under consumer law in specified contexts.',
    tags: ['consumer', 'service deficiency', 'medical'],
  },
  {
    caseTitle: 'Shreya Singhal v. Union of India',
    citation: '(2015) 5 SCC 1',
    court: 'Supreme Court of India',
    year: 2015,
    ratio: 'Struck down Section 66A IT Act; speech restrictions must be narrowly tailored.',
    tags: ['speech', 'technology', 'constitutional'],
  },
  {
    caseTitle: 'Subramanian Swamy v. Union of India',
    citation: '(2016) 7 SCC 221',
    court: 'Supreme Court of India',
    year: 2016,
    ratio: 'Criminal defamation provisions upheld with balancing of reputation and speech.',
    tags: ['speech', 'criminal', 'reputation'],
  },
  {
    caseTitle: 'M.C. Mehta v. Union of India (Oleum Gas Leak)',
    citation: '(1987) 1 SCC 395',
    court: 'Supreme Court of India',
    year: 1987,
    ratio: 'Absolute liability for hazardous industries.',
    tags: ['constitutional', 'environment', 'public law', 'pil'],
  },
];

function scoreByTags(text: string, tags: string[]): number {
  const normalized = text.toLowerCase();
  return tags.reduce((sum, tag) => {
    return normalized.includes(tag.toLowerCase()) ? sum + 1 : sum;
  }, 0);
}

export function findRelevantAuthorities(params: {
  petitionType: PetitionType;
  caseType?: string;
  facts: string;
  legalGrounds: string;
  limit?: number;
}) {
  const { petitionType, caseType, facts, legalGrounds, limit = 6 } = params;
  const context = `${petitionType} ${caseType ?? ''} ${facts} ${legalGrounds}`;

  const statutes = INDIAN_STATUTES
    .map((item) => ({ item, score: scoreByTags(context, item.tags) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(3, Math.floor(limit / 2)))
    .map(({ item }) => item);

  const precedents = INDIAN_PRECEDENTS
    .map((item) => ({ item, score: scoreByTags(context, item.tags) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => item);

  return { statutes, precedents };
}
