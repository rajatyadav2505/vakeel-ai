import Link from 'next/link';
import { Scale, FolderKanban, FilePenLine, Swords, BrainCircuit, Settings } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: Scale },
  { href: '/cases', label: 'Cases', icon: FolderKanban },
  { href: '/petitions', label: 'Petitions', icon: FilePenLine },
  { href: '/strategy', label: 'Strategy', icon: BrainCircuit },
  { href: '/war-room', label: 'War Room', icon: Swords },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell(props: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f9fbf6,_#f2f0e8_45%,_#e8e5d9)] text-[#1f2a37]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 md:px-6">
        <header className="mb-5 rounded-2xl border border-[#d8d2bf] bg-[#f8f6ee]/90 px-5 py-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-[Georgia] text-2xl font-semibold tracking-tight text-[#162031]">
                Nyaya Mitra
              </p>
              <p className="text-sm text-[#516075]">
                Multi-agent legal intelligence for Indian litigation strategy
              </p>
            </div>
            <div className="rounded-full border border-[#c8c1ad] bg-white px-3 py-1 text-xs font-medium uppercase tracking-wide text-[#516075]">
              Case Ops + War Gaming
            </div>
          </div>
        </header>

        <div className="grid flex-1 gap-5 md:grid-cols-[220px_1fr]">
          <aside className="h-fit rounded-2xl border border-[#d8d2bf] bg-[#f8f6ee]/80 p-3 shadow-sm">
            <nav className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[#344256] transition hover:bg-[#e9e4d4]"
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>

          <main className="rounded-2xl border border-[#d8d2bf] bg-[#fcfbf8]/95 p-4 shadow-sm md:p-6">
            {props.children}
          </main>
        </div>
      </div>
    </div>
  );
}
