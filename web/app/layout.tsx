import type { Metadata, Viewport } from 'next';
import { Poppins, Prompt, Chakra_Petch, Zen_Dots, Kanit } from 'next/font/google';
import './tokens.css';
import './globals.css';

const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-poppins', display: 'swap' });
const prompt = Prompt({ subsets: ['thai'], weight: ['400', '500', '600'], variable: '--font-prompt', display: 'swap' });
const chakra = Chakra_Petch({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-chakra', display: 'swap' });
const zen = Zen_Dots({ subsets: ['latin'], weight: '400', variable: '--font-zen-dots', display: 'swap' });
const kanit = Kanit({ subsets: ['thai'], weight: ['500', '600'], variable: '--font-kanit', display: 'swap' });

export const metadata: Metadata = {
  title: 'Bangkok Ground Watch',
  description: 'NISAR radar view of surface change over Bangkok.',
  icons: { icon: '/icon.svg' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, colorScheme: 'dark', themeColor: '#000000' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${poppins.variable} ${prompt.variable} ${chakra.variable} ${zen.variable} ${kanit.variable}`}>
      <body>{children}</body>
    </html>
  );
}
