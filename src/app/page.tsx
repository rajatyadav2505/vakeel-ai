import Link from 'next/link';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate, timeAgo } from '@/lib/utils';
import { getCases, getPetitions, getRecentWarSessions } from '@/lib/db/queries';

export default async function DashboardPage() {
  const [allCases, allPetitions, recentSessions] = await Promise.all([
    getCases(),
    getPetitions(),
    getRecentWarSessions(),
  ]);

  const activeCases = allCases.filter((item) => item.status === 'active').length;
  const pendingHearings = allCases.filter((item) => Boolean(item.nextHearing)).length;

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-4">
        <SectionCard title={`${allCases.length}`} subtitle="Total cases">
          <p className="text-sm text-[#59667a]">Includes active, pending, and closed matters.</p>
        </SectionCard>
        <SectionCard title={`${activeCases}`} subtitle="Active cases">
          <p className="text-sm text-[#59667a]">Currently in live litigation or active filing stage.</p>
        </SectionCard>
        <SectionCard title={`${allPetitions.length}`} subtitle="Petitions drafted">
          <p className="text-sm text-[#59667a]">AI-assisted drafts with statutes and precedents.</p>
        </SectionCard>
        <SectionCard title={`${pendingHearings}`} subtitle="Upcoming hearings">
          <p className="text-sm text-[#59667a]">Cases with listed next hearing dates.</p>
        </SectionCard>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Case Control Center"
          subtitle="Track all matters, parties, hearings, and filings in one place."
        >
          <div className="space-y-3">
            {allCases.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e4dfcf] bg-[#fcfbf8] px-3 py-2"
              >
                <div>
                  <p className="font-semibold text-[#213144]">{item.title}</p>
                  <p className="text-xs text-[#667589]">
                    {item.caseType.toUpperCase()} {item.court ? `• ${item.court}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={item.status} />
                  <Link
                    href={`/cases/${item.id}`}
                    className="rounded-lg border border-[#c7c0ab] bg-white px-2 py-1 text-xs font-semibold"
                  >
                    Open
                  </Link>
                </div>
              </div>
            ))}
            {allCases.length === 0 ? (
              <p className="text-sm text-[#667589]">No cases yet. Start by adding your first matter.</p>
            ) : null}
          </div>
          <div className="mt-4 flex gap-2">
            <Link href="/cases/new" className="rounded-xl bg-[#1e334a] px-3 py-2 text-sm font-semibold text-white">
              Add New Case
            </Link>
            <Link href="/cases" className="rounded-xl border border-[#bdb59f] px-3 py-2 text-sm font-semibold">
              View All Cases
            </Link>
          </div>
        </SectionCard>

        <SectionCard
          title="War-Room Pulse"
          subtitle="20-agent simulations with Chanakya + game theory recommendations."
        >
          <div className="space-y-3">
            {recentSessions.slice(0, 5).map((session) => (
              <div
                key={session.id}
                className="rounded-xl border border-[#e4dfcf] bg-[#fcfbf8] px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-[#203245]">{session.sessionName}</p>
                  <StatusBadge status={session.status} />
                </div>
                <p className="mt-1 text-xs text-[#667589]">Started {timeAgo(session.startedAt.getTime())}</p>
                <Link
                  href={`/war-room/${session.id}`}
                  className="mt-2 inline-flex rounded-lg border border-[#c7c0ab] bg-white px-2 py-1 text-xs font-semibold"
                >
                  Review Simulation
                </Link>
              </div>
            ))}
            {recentSessions.length === 0 ? (
              <p className="text-sm text-[#667589]">
                No war-room run yet. Open any case and launch a simulation.
              </p>
            ) : null}
          </div>
        </SectionCard>
      </section>

      <SectionCard title="Recent Petition Drafts" subtitle="Latest AI-generated drafts ready for review and export.">
        <div className="grid gap-3 md:grid-cols-2">
          {allPetitions.slice(0, 6).map((petition) => (
            <Link
              key={petition.id}
              href={`/petitions/${petition.id}`}
              className="rounded-xl border border-[#e1ddcf] bg-[#fcfbf8] px-3 py-3 transition hover:border-[#bdb59f]"
            >
              <p className="font-semibold text-[#243448]">{petition.title}</p>
              <p className="mt-1 text-xs text-[#68778b]">
                {petition.petitionType.replace(/_/g, ' ')} • Updated{' '}
                {formatDate(petition.updatedAt, { dateStyle: 'medium' })}
              </p>
              <div className="mt-2">
                <StatusBadge status={petition.status} />
              </div>
            </Link>
          ))}
          {allPetitions.length === 0 ? (
            <p className="text-sm text-[#667589]">No drafts yet. Use petition generator to create one.</p>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
