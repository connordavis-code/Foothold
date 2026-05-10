import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Inter_Tight, Fraunces } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';

// R.1 redesign typography. latin + latin-ext subset for EU multi-tenant
// readiness (locked 2026-05-09, see docs/redesign/r1-foundation/PLAN.md).
const interTight = Inter_Tight({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-sans',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-mono',
  display: 'swap',
});

// Editorial accent — used italic-only as editorial punctuation per redesign
// bundle (page titles, weekly brief, signature footer). Loaded globally;
// components opt in via `font-serif`. Both normal + italic loaded for
// safety; R.6 polish may tighten to italic-only after audit.
const fraunces = Fraunces({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Foothold',
  description:
    'Personal finance — tracking, investments, goals, and recommendations.',
};

// viewport-fit=cover lets safe-area-inset-* env vars resolve on iPhone,
// so the bottom-tab bar can clear the home indicator.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${interTight.variable} ${ibmPlexMono.variable} ${fraunces.variable} font-sans antialiased min-h-screen bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
