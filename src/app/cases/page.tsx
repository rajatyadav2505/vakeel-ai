import Link from 'next/link';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { getCases } from '@/lib/db/queries';
import { formatDate } from '@/lib/utils';

export default async function CasesPage() {
  const allCases = await getCases();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-[Georgia] text-2xl font-semibold text-[#1e2a39]">Case Management</h1>
          <p className="text-sm text-[#607086]">
            Track hearings, documents, timeline events, and litigation status.
          </p>
        </div>
        <Link href="/cases/new" className="rounded-xl bg-[#1e334a] px-4 py-2 text-sm font-semibold text-white">
          New Case
        </Link>
      </div>

      <SectionCard title="All Cases" subtitle={`${allCases.length} records`}>
        <div className="space-y-3">
          {allCases.map((item) => (
            <Link
              href={`/cases/${item.id}`}
              key={item.id}
              className="grid gap-3 rounded-xl border border-[#dfd9c8] bg-[#fefdf9] p-3 transition hover:border-[#bbb39f] md:grid-cols-[1fr_auto]"
            >
              <div>
                <p className="font-semibold text-[#1e2e40]">{item.title}</p>
                <p className="text-xs text-[#617085]">
                  {item.caseNumber ? `${item.caseNumber} • ` : ''}
                  {item.caseType.toUpperCase()}
                  {item.court ? ` • ${item.court}` : ''}
                </p>
                <p className="mt-1 text-xs text-[#6c7a8d]">
                  Updated {formatDate(item.updatedAt, { dateStyle: 'medium' })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={item.status} />
                <span className="rounded-lg border border-[#cbc4b0] bg-white px-2 py-1 text-xs font-semibold">
                  Open
                </span>
              </div>
            </Link>
          ))}
          {allCases.length === 0 ? (
            <p className="text-sm text-[#617085]">No cases added yet.</p>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
