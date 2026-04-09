import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/components/auth/auth-provider';
import { WelcomeCurtain } from '@/components/auth/welcome-curtain';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'AI Avatar Training Platform',
    template: '%s | Avatar Platform',
  },
  description: 'Practice high-stakes conversations with AI-powered avatars',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>{children}</AuthProvider>
        <WelcomeCurtain />
      </body>
    </html>
  );
}
