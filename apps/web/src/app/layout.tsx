import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Analytics } from '@vercel/analytics/react';
import { AppShell } from '@/components/layout/app-shell';
import { ThemeProvider } from '@/components/providers/theme-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nyaya Mitra Command',
  description:
    'Production-grade legal strategy platform with multi-agent war-room, petition drafting, case lifecycle tracking, and WhatsApp integration.',
};

export default function RootLayout(props: { children: React.ReactNode }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const app = (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AppShell>{props.children}</AppShell>
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );

  if (!publishableKey) return app;
  return <ClerkProvider publishableKey={publishableKey}>{app}</ClerkProvider>;
}
