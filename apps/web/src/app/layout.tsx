import type { Metadata } from 'next';
import { Manrope, Fraunces } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';

// Premium pairing: a refined grotesk for body + an editorial serif for display.
const manrope = Manrope({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-serif', display: 'swap', axes: ['opsz'] });

export const metadata: Metadata = {
  title: {
    default: 'SpeakCoach — Practice speaking with an AI coach',
    template: '%s | SpeakCoach',
  },
  description: 'Practice real-world conversations out loud with a voice AI coach that scores your speaking and body language.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${fraunces.variable}`}>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
