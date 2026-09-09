import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/ortak/ui/toaster';
import { ConfirmRoot } from '@/ortak/ui/confirm-dialog';
import { DepolamaSeridi } from '@/ortak/kabuk/components/layout/DepolamaSeridi';

// latin-ext ZORUNLU: Turkce'ye ozgu g s I harfleri (U+011E/011F, U+015E/015F,
// U+0130) Google'in 'latin' alt kumesinde YOK. Eksik olunca tarayici o harfleri
// yedek bir sistem fontuyla ciziyor ve metin icinde harf harf bicim bozuluyor.
// Olculdu: bu harfler 25 dosyada, kullaniciya GORUNEN metinlerde geciyor
// (or. giris sayfasindaki 'Giris basarisiz' uyarisi).
const inter = Inter({ subsets: ['latin', 'latin-ext'] });

export const metadata: Metadata = {
  title: 'MetaPriceX — Teklif ve Metraj Yönetimi',
  // NOT: eski metin 'export PDFs' vaat ediyordu; teklif PDF zinciri 27.07'de
  // (64d32fb, ARINMA Faz 2C) kaldirildi. Olmayan bir ozelligi tanitmiyoruz.
  description:
    'Mekanik tesisat metraj ve teklif platformu: DWG projelerinden hat boyu ' +
    'olcumu, Excel metraj eslestirme ve marka fiyat listeleriyle teklif hazirlama.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className={inter.className}>
        {children}
        <Toaster />
        <ConfirmRoot />
        {/* FAZ 5.4 — KOK duzende: ziyaretcinin girdigi ILK sayfada gorunmeli.
            Korumali duzene koymak, pazarlama sayfasini kapsam disi birakirdi. */}
        <DepolamaSeridi />
      </body>
    </html>
  );
}
