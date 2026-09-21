import Link from 'next/link';
import { Altbilgi } from '@/ortak/kabuk/components/layout/Altbilgi';
import type { KurumsalSayfa as KurumsalSayfaTanimi } from './sayfalar';

/**
 * KURUMSAL SAYFA KABUĞU — `/hakkimizda` ve `/iletisim` bunu kullanır (t.21).
 *
 * ⚠ NEDEN TEK KABUK: iki sayfa aynı iskeleti taşıyor. Ayrı ayrı yazmak, bu
 * deponun tekrarlayan "ikiz" hatasını üretirdi — biri güncellenir, öteki
 * geride kalır.
 *
 * ⚠ TASLAK ŞERİDİ YOK ve olmamalı: şerit `HUKUKI_METIN_DURUMU`ya bağlıdır ve
 * "bu metin avukat onayı bekliyor" demektir. Bu iki sayfa hukuki metin değil;
 * şeridi buraya kopyalamak, taahhüt olmayan bir tanıtım/iletişim sayfasını
 * onay bekleyen bir sözleşme gibi gösterirdi.
 *
 * ⚠ BAŞLIK `HukukiSayfa`nınkiyle AYNI GÖRÜNÜR ama paylaşılmıyor: başlığı ortak
 * bir bileşene çıkarmak `telefon-menusu.test.ts:222`yi kırar — o kapı
 * `/fiyatlar` bağlantısının `HukukiSayfa.tsx`in KENDİ ağacında ve her
 * genişlikte görünür olduğunu ölçüyor (telefonda satış yolu). Aynı ölçüt bu
 * kabuk için `kurumsal-sayfalar.test.ts`te ayrıca kuruldu.
 */
export function KurumsalSayfa({
  sayfa,
  children,
}: {
  sayfa: KurumsalSayfaTanimi;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="flex items-center gap-0.5 text-lg font-extrabold tracking-tight text-slate-900"
          >
            MetaPrice<span className="text-blue-600">X</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/fiyatlar" className="text-xs font-semibold text-slate-700 hover:text-blue-600">
              Fiyatlar
            </Link>
            <Link href="/login" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
              Giriş Yap
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{sayfa.baslik}</h1>
        <div className="mt-8">{children}</div>
      </main>

      <Altbilgi />
    </div>
  );
}
