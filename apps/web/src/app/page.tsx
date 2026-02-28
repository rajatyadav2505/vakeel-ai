import Link from 'next/link';
import { BriefcaseBusiness, BrainCircuit, FileText, Shield, Plus, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getDashboardSnapshot } from '@/lib/queries';
import { formatPercent, toOutcomeBand } from '@/lib/utils';

const stats = [
  { key: 'cases', label: 'Cases', icon: BriefcaseBusiness, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40' },
  { key: 'simulations', label: 'Simulations', icon: BrainCircuit, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/40' },
  { key: 'petitions', label: 'Petitions', icon: FileText, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
  { key: 'role', label: 'Role', icon: Shield, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40' },
] as const;

export default async function DashboardPage() {
  const snapshot = await getDashboardSnapshot();

  const counts: Record<string, number | string> = {
    cases: snapshot.cases.length,
    simulations: snapshot.simulations.length,
    petitions: snapshot.petitions.length,
    role: snapshot.role,
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-[Georgia] text-xl font-semibold">Welcome back{snapshot.user.fullName !== 'Unknown User' ? `, ${snapshot.user.fullName.split(' ')[0]}` : ''}</h1>
        <p className="text-sm text-muted-foreground">Here&apos;s your case overview.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.key} className="flex items-center gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${stat.bg}`}>
                <Icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-xl font-semibold leading-tight">{counts[stat.key]}</p>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-[Georgia] text-base font-semibold">Case command center</h2>
            <Link href="/cases/new">
              <Button variant="outline" size="sm">
                <Plus className="mr-1 h-3.5 w-3.5" /> New Case
              </Button>
            </Link>
          </div>
          <div className="space-y-2">
            {snapshot.cases.map((item) => (
              <Link
                href={`/cases/${item.id}`}
                key={item.id}
                className="group block rounded-xl border border-border bg-background p-3 hover:border-primary/20 hover:bg-muted/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium group-hover:text-primary">{item.title}</p>
                  <Badge>{item.stage}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{item.case_type} {item.court_name ? `\u2022 ${item.court_name}` : ''}</p>
              </Link>
            ))}
            {snapshot.cases.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                  <BriefcaseBusiness className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No cases yet. Create one to start strategy simulations.</p>
                <Link href="/cases/new">
                  <Button size="sm">
                    <Plus className="mr-1 h-3.5 w-3.5" /> Create Case
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-[Georgia] text-base font-semibold">Latest strategy analyses</h2>
            <Link href="/simulations" className="flex items-center gap-1 text-sm text-primary hover:underline underline-offset-4">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="space-y-2">
            {snapshot.simulations.map((item) => (
              <Link
                href={`/simulations/${item.id}`}
                key={item.id}
                className="group block rounded-xl border border-border bg-background p-3 hover:border-primary/20 hover:bg-muted/50"
              >
                <p className="text-sm font-medium group-hover:text-primary">{item.headline}</p>
                <p className="text-xs text-muted-foreground">
                  {item.mode} \u2022 Confidence {formatPercent(item.confidence ?? 0)}
                  {typeof item.win_probability === 'number'
                    ? ` \u2022 Outcome ${toOutcomeBand(item.win_probability)}`
                    : ''}
                </p>
              </Link>
            ))}
            {snapshot.simulations.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                  <BrainCircuit className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No simulations yet. Run one from any case page.</p>
                <Link href="/cases">
                  <Button variant="outline" size="sm">
                    Go to Cases <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
