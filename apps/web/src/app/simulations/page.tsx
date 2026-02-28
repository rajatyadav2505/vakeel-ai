import Link from 'next/link';
import { AlertCircle, BrainCircuit, LoaderCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSimulationJobsOverview, getSimulationsPage, getUserListPreferences } from '@/lib/queries';
import { formatPercent, toOutcomeBand } from '@/lib/utils';
import { SimulationScoringInfo } from '@/components/simulation-scoring-info';
import { PaginationNav } from '@/components/ui/pagination-nav';

export default async function SimulationsPage(props: {
  searchParams: Promise<{ page?: string; pageSize?: string; queuedJob?: string }>;
}) {
  const preferences = await getUserListPreferences();
  const searchParams = await props.searchParams;
  const parsedPage = Number(searchParams.page ?? '1');
  const page = Number.isFinite(parsedPage) ? Math.max(1, Math.floor(parsedPage)) : 1;
  const parsedPageSize = Number(searchParams.pageSize ?? preferences.defaultPageSize);
  const pageSize = Number.isFinite(parsedPageSize)
    ? Math.min(50, Math.max(5, Math.floor(parsedPageSize)))
    : preferences.defaultPageSize;

  const simulationsPage = await getSimulationsPage({ page, pageSize });
  const jobs = await getSimulationJobsOverview(8);

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-[Georgia] text-xl font-semibold">Evidence-based strategy analyses</h1>
        <SimulationScoringInfo />
      </div>
      {searchParams.queuedJob && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-900/30 dark:text-emerald-300">
          Simulation job queued: <span className="font-mono">{searchParams.queuedJob}</span>. Run
          <code className="ml-1 rounded bg-background px-1 py-0.5">POST /api/simulations/worker</code> to process queued jobs.
        </div>
      )}
      {jobs.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Queue-backed worker jobs</p>
          {jobs.map((job) => (
            <div key={job.id} className="rounded-xl border border-border bg-background p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {job.mode} • {job.objective}
                </p>
                <Badge
                  className={
                    job.status === 'completed'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : job.status === 'failed'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                        : ''
                  }
                >
                  {job.status}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Attempts {job.attempts}
                {job.status === 'processing' && (
                  <span className="inline-flex items-center gap-1 pl-2">
                    <LoaderCircle className="h-3 w-3 animate-spin" /> processing
                  </span>
                )}
              </p>
              {job.status === 'completed' && job.result_simulation_id && (
                <Link
                  href={`/simulations/${job.result_simulation_id}`}
                  className="mt-1 inline-block text-xs text-primary underline-offset-4 hover:underline"
                >
                  Open completed simulation
                </Link>
              )}
              {job.status === 'failed' && (
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-300">
                  <AlertCircle className="h-3 w-3" />
                  {job.last_error ?? 'Worker failed without an explicit error message.'}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {simulationsPage.items.map((sim) => (
          <Link
            href={`/simulations/${sim.id}`}
            key={sim.id}
            className="group block rounded-xl border border-border bg-background p-3 hover:border-primary/20 hover:bg-muted/50"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium group-hover:text-primary">{sim.headline}</p>
              <Badge>{sim.mode}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Confidence {formatPercent(sim.confidence ?? 0)}
              {typeof sim.win_probability === 'number'
                ? ` \u2022 Outcome ${toOutcomeBand(sim.win_probability)}`
                : ''}
            </p>
          </Link>
        ))}
        {simulationsPage.items.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <BrainCircuit className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No simulations yet. Start from a case page.</p>
            <Link href="/cases">
              <Button variant="outline" size="sm">Go to Cases</Button>
            </Link>
          </div>
        )}
      </div>
      <PaginationNav
        pathname="/simulations"
        page={simulationsPage.page}
        totalPages={simulationsPage.totalPages}
        query={{ pageSize }}
      />
    </Card>
  );
}
