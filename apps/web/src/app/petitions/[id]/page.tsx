import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { PetitionReviewConsole } from '@/components/petitions/petition-review-console';
import { getPetitionReviewBundle } from '@/lib/queries';

type PetitionVersionRow = {
  id: string;
  version: number;
  body: string;
  change_summary: string | null;
  review_action: string;
  created_at: string;
  created_by: string;
};

export default async function PetitionReviewPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const bundle = await getPetitionReviewBundle(params.id);
  if (!bundle.petition) return notFound();

  const petition = bundle.petition as {
    id: string;
    petition_type: string;
    court_template: string;
    case_id: string;
    body: string;
    confidence: number | null;
    lawyer_verified: boolean;
    review_status: string;
    current_version: number;
    review_notes: string | null;
    last_reviewed_at: string | null;
  };

  return (
    <div className="space-y-4">
      <Card>
        <h1 className="font-[Georgia] text-xl font-semibold capitalize">
          {petition.petition_type.replace('_', ' ')} review workflow
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Case {petition.case_id.slice(0, 8)}... • versioned advocate review with approval gates.
        </p>
      </Card>

      <PetitionReviewConsole petition={petition} versions={(bundle.versions ?? []) as PetitionVersionRow[]} />
    </div>
  );
}
