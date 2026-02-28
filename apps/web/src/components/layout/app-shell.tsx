'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import { BriefcaseBusiness, BrainCircuit, FileText, MessageSquare, Scale, Settings } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { DisclaimerBanner } from '@/components/disclaimer-banner';
import { cn } from '@/lib/utils';

const links = [
  { href: '/', label: 'Dashboard', icon: Scale },
  { href: '/cases', label: 'Cases', icon: BriefcaseBusiness },
  { href: '/simulations', label: 'War Room', icon: BrainCircuit },
  { href: '/petitions', label: 'Petitions', icon: FileText },
  { href: '/whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname.startsWith(href);
}

export function AppShell(props: { children: React.ReactNode }) {
  const pathname = usePathname();
  const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f6fbff] via-[#f9fafc] to-[#f1f5f9] text-foreground dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-4">
        <header className="mb-3 rounded-2xl border border-border bg-card/80 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" className="group flex items-center gap-2.5">
              <Scale className="h-5 w-5 text-primary" />
              <div>
                <p className="font-[Georgia] text-lg font-semibold text-primary leading-tight">Nyaya Mitra</p>
                <p className="text-[11px] text-muted-foreground leading-tight">Legal Strategy Platform</p>
              </div>
            </Link>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              {clerkEnabled ? (
                <UserButton afterSignOutUrl="/" />
              ) : (
                <span className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground">
                  auth off
                </span>
              )}
            </div>
          </div>
        </header>

        <DisclaimerBanner />

        {/* Mobile navigation — horizontal scroll */}
        <nav className="mb-3 flex gap-1 overflow-x-auto py-1 lg:hidden">
          {links.map((link) => {
            const Icon = link.icon;
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          {/* Desktop sidebar */}
          <aside className="hidden h-fit rounded-2xl border border-border bg-card/75 p-1.5 lg:block">
            <nav className="space-y-0.5">
              {links.map((link) => {
                const Icon = link.icon;
                const active = isActive(pathname, link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      'flex items-center gap-2 rounded-xl px-3 py-2 text-sm',
                      active
                        ? 'bg-primary/10 font-medium text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'text-muted-foreground')} />
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
          <main className="min-w-0 space-y-4">{props.children}</main>
        </div>
      </div>
    </div>
  );
}
