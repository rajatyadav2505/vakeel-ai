import type { Metadata } from 'next';
import { AppShell } from '@/components/layout/app-shell';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nyaya Mitra',
  description:
    'AI-driven legal war-room for Indian advocates with multi-agent strategy, petition drafting, and case tracking.',
};

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AppShell>{props.children}</AppShell>
      </body>
    </html>
  );
}
