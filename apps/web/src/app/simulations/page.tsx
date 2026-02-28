import Link from 'next/link';
import { BrainCircuit } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSimulationsPage, getUserListPreferences } from '@/lib/queries';
import { formatPercent, toOutcomeBand } from '@/lib/utils';
import { SimulationScoringInfo } from '@/components/simulation-scoring-info';
import { PaginationNav } from '@/components/ui/pagination-nav';

export default async function SimulationsPage(props: {
  searchParams: Promise<{ page?: string; pageSize?: string }>;
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

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-[Georgia] text-xl font-semibold">Evidence-based strategy analyses</h1>
        <SimulationScoringInfo />
      </div>
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
