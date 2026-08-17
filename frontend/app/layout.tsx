import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/ortak/ui/toaster';
import { ConfirmRoot } from '@/ortak/ui/confirm-dialog';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'MetaPriceX — Teklif ve Metraj Yönetimi',
  description: 'Manage pricing libraries, create quotes, export PDFs',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        <Toaster />
        <ConfirmRoot />
      </body>
    </html>
  );
}
