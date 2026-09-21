import type { Metadata } from 'next';
import Link from 'next/link';
import { KurumsalSayfa } from '@/ozellik/kurumsal/KurumsalSayfa';
import { HAKKIMIZDA, HAKKIMIZDA_METNI, ILETISIM } from '@/ozellik/kurumsal/sayfalar';

// ⚠ Metin BU DOSYADA DEĞİL: gövde `ozellik/kurumsal/sayfalar.ts`te, unvan ve
// merkez ili orada `SATICI`dan okunuyor. İçeriği sayfaya gömmek, unvan
// değiştiğinde sessizce eski firmadan söz eden bir sayfa bırakırdı.
export const metadata: Metadata = { title: HAKKIMIZDA.sayfaBasligi };

export default function Sayfa() {
  return (
    <KurumsalSayfa sayfa={HAKKIMIZDA}>
      <div className="space-y-4">
        {HAKKIMIZDA_METNI.girisParagraflari.map((p, i) => (
          <p key={i} className="text-sm leading-relaxed text-slate-700">
            {p}
          </p>
        ))}
      </div>

      <section className="mt-10">
        <h2 className="text-base font-semibold text-slate-900">{HAKKIMIZDA_METNI.ilkeBasligi}</h2>
        <div className="mt-2 space-y-3">
          {HAKKIMIZDA_METNI.ilkeParagraflari.map((p, i) => (
            <p key={i} className="text-sm leading-relaxed text-slate-700">
              {p}
            </p>
          ))}
        </div>
      </section>

      <p className="mt-10 border-t pt-6 text-sm font-semibold text-slate-900">
        {HAKKIMIZDA_METNI.imza}
      </p>

      <p className="mt-6 text-sm leading-relaxed text-slate-700">
        Sorularınız için{' '}
        <Link href={ILETISIM.yol} className="font-semibold text-blue-600 hover:text-blue-700">
          {ILETISIM.kisaAd}
        </Link>{' '}
        sayfamızdan bize ulaşabilirsiniz.
      </p>
    </KurumsalSayfa>
  );
}
