import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getCasesPage, getUserListPreferences } from '@/lib/queries';
import { requireAppUser } from '@/lib/auth';
import { PaginationNav } from '@/components/ui/pagination-nav';
import { CasesKanbanBoard } from '@/components/cases/cases-kanban-board';

export default async function CasesKanbanPage(props: {
  searchParams: Promise<{ page?: string; pageSize?: string }>;
}) {
  const user = await requireAppUser();
  const preferences = await getUserListPreferences();
  const searchParams = await props.searchParams;
  const parsedPage = Number(searchParams.page ?? '1');
  const page = Number.isFinite(parsedPage) ? Math.max(1, Math.floor(parsedPage)) : 1;
  const parsedPageSize = Number(searchParams.pageSize ?? preferences.defaultPageSize);
  const pageSize = Number.isFinite(parsedPageSize)
    ? Math.min(50, Math.max(5, Math.floor(parsedPageSize)))
    : preferences.defaultPageSize;

  const casePage = await getCasesPage({ page, pageSize });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-[Georgia] text-xl font-semibold">Case Lifecycle Board</h1>
        <Link href="/cases/new">
          <Button size="sm">
            <Plus className="mr-1 h-3.5 w-3.5" /> Add case
          </Button>
        </Link>
      </div>
      <CasesKanbanBoard
        userId={user.userId}
        initialCases={casePage.items}
        realtimeEnabled={preferences.realtimeUpdatesEnabled}
      />
      <PaginationNav
        pathname="/cases"
        page={casePage.page}
        totalPages={casePage.totalPages}
        query={{ pageSize }}
      />
    </div>
  );
}
