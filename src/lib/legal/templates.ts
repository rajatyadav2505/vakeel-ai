import type {
  PetitionType,
  PetitionTemplate,
  PetitionTemplateSection,
} from '@/types/petition';

const COMMON_SECTIONS: PetitionTemplateSection[] = [
  {
    heading: 'Facts in Brief',
    instructions: 'State material facts in chronological and concise form.',
    order: 1,
    required: true,
  },
  {
    heading: 'Questions of Law',
    instructions: 'List specific legal questions that arise for adjudication.',
    order: 2,
    required: true,
  },
  {
    heading: 'Grounds',
    instructions: 'Draft legal grounds supported by statute and precedents.',
    order: 3,
    required: true,
  },
  {
    heading: 'Interim Relief',
    instructions: 'Specify urgency, prima facie case, and irreparable injury.',
    order: 4,
    required: false,
  },
];

function templateForType(petitionType: PetitionType): PetitionTemplateSection[] {
  if (petitionType === 'bail') {
    return [
      {
        heading: 'Maintainability',
        instructions: 'Show jurisdiction and statutory basis under CrPC.',
        order: 0,
        required: true,
      },
      ...COMMON_SECTIONS,
      {
        heading: 'Undertakings',
        instructions: 'Include cooperation, non-tampering and appearance undertakings.',
        order: 5,
        required: true,
      },
    ];
  }

  if (petitionType === 'pil') {
    return [
      {
        heading: 'Public Importance',
        instructions: 'Demonstrate broader public impact and urgency.',
        order: 0,
        required: true,
      },
      ...COMMON_SECTIONS,
      {
        heading: 'Reliefs in Public Interest',
        instructions: 'Seek structured and monitorable reliefs.',
        order: 5,
        required: true,
      },
    ];
  }

  return COMMON_SECTIONS;
}

export function buildPetitionTemplate(petitionType: PetitionType, court: string): PetitionTemplate {
  return {
    petitionType,
    court,
    sections: templateForType(petitionType).sort((a, b) => a.order - b.order),
  };
}
