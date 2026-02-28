import Link from 'next/link';
import { FileText, Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getPetitionsPage, getUserListPreferences } from '@/lib/queries';
import { formatPercent } from '@/lib/utils';
import { PaginationNav } from '@/components/ui/pagination-nav';

function reviewStatusTone(status: string) {
  if (status === 'approved') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
  if (status === 'changes_requested') {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
  }
  return '';
}

export default async function PetitionsPage(props: {
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
  const petitionsPage = await getPetitionsPage({ page, pageSize });

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="font-[Georgia] text-xl font-semibold">Petitions</h1>
        <Link href="/petitions/new">
          <Button size="sm">
            <Plus className="mr-1 h-3.5 w-3.5" /> New Petition
          </Button>
        </Link>
      </div>
      <div className="space-y-2">
        {petitionsPage.items.map((petition) => (
          <Link
            key={petition.id}
            href={`/petitions/${petition.id}`}
            className="block rounded-xl border border-border bg-background p-3 hover:border-primary/20 hover:bg-muted/50"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium capitalize">{petition.petition_type.replace('_', ' ')}</p>
              <div className="flex items-center gap-1.5">
                <Badge className={reviewStatusTone(petition.review_status)}>
                  {petition.review_status.replace('_', ' ')}
                </Badge>
                <Badge>{petition.court_template.replace('_', ' ')}</Badge>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Confidence {formatPercent(petition.confidence ?? 0)} \u2022 Version v{petition.current_version}{' '}
              \u2022 Case {petition.case_id.slice(0, 8)}...
            </p>
          </Link>
        ))}
        {petitionsPage.items.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No petitions generated yet.</p>
            <Link href="/petitions/new">
              <Button variant="outline" size="sm">
                <Plus className="mr-1 h-3.5 w-3.5" /> Create Petition
              </Button>
            </Link>
          </div>
        )}
      </div>
      <PaginationNav
        pathname="/petitions"
        page={petitionsPage.page}
        totalPages={petitionsPage.totalPages}
        query={{ pageSize }}
      />
    </Card>
  );
}
