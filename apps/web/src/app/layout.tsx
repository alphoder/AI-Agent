import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { Providers } from '@/components/providers';

// Satoshi — one grotesk across the whole site (body + display). Self-hosted.
const satoshi = localFont({
  src: [
    { path: './fonts/Satoshi-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/Satoshi-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/Satoshi-700.woff2', weight: '700', style: 'normal' },
    { path: './fonts/Satoshi-900.woff2', weight: '900', style: 'normal' },
  ],
  variable: '--font-sans',
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
    <html lang="en" className={satoshi.variable}>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
