import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import type { CaseEvidenceGraph } from '@nyaya/shared';
import { runMultiAgentAction, runSingleAgentAction } from '@/app/actions/simulations';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { getCaseById } from '@/lib/queries';
import { Badge } from '@/components/ui/badge';
import { formatPercent } from '@/lib/utils';
import { requireAppUser } from '@/lib/auth';

function citizenModeRecommendations(caseType: string) {
  const common = [
    'Consider legal-aid channels (NALSA / DLSA) before high-cost litigation.',
    'Evaluate mediation / Lok Adalat route if the dispute is settlement-friendly.',
    'Prepare a complete pre-litigation document pack before filing.',
  ];
  if (caseType === 'consumer') {
    return [
      ...common,
      'Collect invoice, payment proof, warranty/service records, and written grievance trail.',
    ];
  }
  if (caseType === 'family') {
    return [
      ...common,
      'Use counseling/mediation pathways first where safe and appropriate.',
    ];
  }
  return common;
}

export default async function CaseDetailsPage(props: { params: Promise<{ id: string }> }) {
  const user = await requireAppUser();
  const params = await props.params;
  const data = await getCaseById(params.id);
  if (!data.caseData) return notFound();
  const evidenceGraph = (data.caseData.evidence_graph_json ?? null) as CaseEvidenceGraph | null;
  const recommendations = citizenModeRecommendations(data.caseData.case_type);
  const extractionAt =
    typeof data.caseData.evidence_extracted_at === 'string'
      ? new Date(data.caseData.evidence_extracted_at).toLocaleString()
      : null;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="font-[Georgia] text-xl font-semibold">{data.caseData.title}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {data.caseData.case_type} {data.caseData.court_name ? `\u2022 ${data.caseData.court_name}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge>{data.caseData.stage}</Badge>
            {data.caseData.case_sensitivity && <Badge>{data.caseData.case_sensitivity}</Badge>}
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed">{data.caseData.summary}</p>
      </Card>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-[Georgia] text-base font-semibold">Evidence Operating System</h2>
          {extractionAt && <p className="text-xs text-muted-foreground">Updated {extractionAt}</p>}
        </div>
        {!evidenceGraph ? (
          <p className="text-sm text-muted-foreground">
            Evidence graph is not available yet. Re-run extraction after uploading documents.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-background p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Facts extracted</p>
              <p className="mt-1 text-sm">{evidenceGraph.facts.length} entities with anchors</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Chronology events: {evidenceGraph.chronology.length}
              </p>
              <p className="text-xs text-muted-foreground">
                Contradictions: {evidenceGraph.contradictions.length}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Missing document detector
              </p>
              {(evidenceGraph.missingDocuments ?? []).slice(0, 4).map((item) => (
                <p key={item.id} className="mt-1 text-xs text-muted-foreground">
                  • {item.title} ({item.requiredDocumentType})
                </p>
              ))}
              {(evidenceGraph.missingDocuments ?? []).length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">No obvious document gaps detected.</p>
              )}
            </div>
            <div className="rounded-xl border border-border bg-background p-3 md:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Best next documents to upload
              </p>
              <div className="mt-1 grid gap-1 sm:grid-cols-2">
                {(evidenceGraph.nextDocumentSuggestions ?? []).slice(0, 6).map((item) => (
                  <p key={item.id} className="text-xs text-muted-foreground">
                    • {item.documentType}: {item.reason}
                  </p>
                ))}
                {(evidenceGraph.nextDocumentSuggestions ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground">No pending document suggestions.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

      {user.role === 'CLIENT' ? (
        <Card className="space-y-2">
          <h2 className="font-[Georgia] text-base font-semibold">Citizen Mode (Pre-Litigation First)</h2>
          {recommendations.map((item) => (
            <p key={item} className="text-sm text-muted-foreground">
              • {item}
            </p>
          ))}
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3">
            <h2 className="font-[Georgia] text-base font-semibold">Phase 1: Evidence-based baseline</h2>
            <form action={runSingleAgentAction} className="space-y-3">
              <input type="hidden" name="caseId" value={data.caseData.id} />
              <Label>
                Objective
                <Textarea
                  name="objective"
                  rows={3}
                  required
                  defaultValue="Establish strongest legal route with immediate tactical next steps."
                />
              </Label>
              <Button type="submit">Queue Baseline Analysis</Button>
            </form>
          </Card>

          <Card className="space-y-3">
            <h2 className="font-[Georgia] text-base font-semibold">Phase 2: Evidence-based strategy analysis</h2>
            <form action={runMultiAgentAction} className="space-y-3">
              <input type="hidden" name="caseId" value={data.caseData.id} />
              <Label>
                Objective
                <Textarea
                  name="objective"
                  rows={3}
                  required
                  defaultValue="Stay 5-7 moves ahead, anticipate opponent branches, and optimize courtroom sequence."
                />
              </Label>
              <Label>
                Depth (5-12)
                <Input name="depth" type="number" min={5} max={12} defaultValue={7} />
              </Label>
              <Button type="submit">Queue Strategy Analysis</Button>
            </form>
          </Card>
        </div>
      )}

      <Card>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-[Georgia] text-base font-semibold">Petition drafting</h2>
          <Link href={`/petitions/new?caseId=${data.caseData.id}`}>
            <Button variant="outline" size="sm">
              Open generator <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Court-format draft with Indian Kanoon citations. Lawyer verification is mandatory before export.
        </p>
      </Card>

      {data.latestSimulation && (
        <Card>
          <h2 className="font-[Georgia] text-base font-semibold">Latest strategy analysis</h2>
          <p className="mt-1 text-sm">{data.latestSimulation.headline}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Confidence {formatPercent(data.latestSimulation.confidence ?? 0)}
          </p>
          <Link
            href={`/simulations/${data.latestSimulation.id}`}
            className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline underline-offset-4"
          >
            Open full war-room output <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Card>
      )}
    </div>
  );
}
