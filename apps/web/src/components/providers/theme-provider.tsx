'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

export function ThemeProvider(props: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem>
      {props.children}
    </NextThemesProvider>
  );
}
