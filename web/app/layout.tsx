import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Thai, IBM_Plex_Mono } from 'next/font/google';
import './tokens.css';
import './globals.css';

const sans = IBM_Plex_Sans_Thai({ subsets: ['latin', 'thai'], weight: ['400', '500', '600'], variable: '--font-plex-thai', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-plex-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Bangkok Ground Watch',
  description: 'NISAR radar view of surface change over Bangkok.',
  icons: { icon: '/icon.svg' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
