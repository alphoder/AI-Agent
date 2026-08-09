import type { Metadata } from 'next';
import { Fraunces, Manrope } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';

// Brand register (DESIGN.md): Manrope carries the whole product (body, labels,
// buttons, data); Fraunces (optical-size axis) is the landing display face only.
// Next fetches both at build time and serves them self-hosted — no runtime CDN.
const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  axes: ['opsz'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

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
