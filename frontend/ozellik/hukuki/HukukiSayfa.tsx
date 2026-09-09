import Link from 'next/link';
import { Altbilgi } from '@/ortak/kabuk/components/layout/Altbilgi';
import { HUKUKI_METIN_SURUMU, HUKUKI_METIN_DURUMU, type HukukiMetin } from './metinler';

/**
 * HUKUKİ SAYFA KABUĞU — dört metin de bunu kullanır (FAZ 5.2).
 *
 * ⚠ NEDEN TEK KABUK: dört sayfa aynı iskeleti taşıyor. Her birini ayrı ayrı
 * yazmak, bu depoda tekrarlayan "ikiz" hata sınıfını dörde katlardı —
 * biri güncellenir, diğer üçü geride kalır (giriş↔kayıt ekranı, iki çıktı
 * yolu, malzeme↔işçilik hep bu şekilde ayrıştı).
 *
 * ⚠ TASLAK ŞERİDİ: metinler avukat incelemesinden GEÇMEDİ. Bunu sayfada
 * söylemeden yayına almak, ziyaretçiye onaylanmış bir hukuki metin
 * gösteriyormuş gibi davranmak olurdu. Şerit tek bir sabite bağlı
 * (`HUKUKI_METIN_DURUMU`); inceleme bitince o sabit `onayli` yapılır ve
 * şerit dört sayfadan birden kalkar.
 */
export function HukukiSayfa({ metin }: { metin: HukukiMetin }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-0.5 text-lg font-extrabold tracking-tight text-slate-900">
            MetaPrice<span className="text-blue-600">X</span>
          </Link>
          <Link href="/login" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
            Giriş Yap
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        {HUKUKI_METIN_DURUMU === 'taslak' && (
          <div
            role="note"
            className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[13px] leading-relaxed text-amber-900"
          >
            <strong>Taslak metin.</strong> Bu metin, uygulamanın kodundan ölçülen
            gerçek veri akışına göre hazırlandı ancak <strong>hukuki incelemeden
            geçmedi</strong>. Nihai hâli yayımlanana kadar bağlayıcı bir taahhüt
            olarak değerlendirilmemelidir.
          </div>
        )}

        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{metin.baslik}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{metin.girisNotu}</p>
        <p className="mt-1 text-[11px] text-slate-400">
          Metin sürümü: {HUKUKI_METIN_SURUMU}
        </p>

        <div className="mt-8 space-y-8">
          {metin.bolumler.map((b, i) => (
            <section key={i}>
              <h2 className="text-base font-semibold text-slate-900">{b.baslik}</h2>
              <div className="mt-2 space-y-3">
                {b.paragraflar.map((p, j) => (
                  <p key={j} className="text-sm leading-relaxed text-slate-700">{p}</p>
                ))}
              </div>
              {b.madde && b.madde.length > 0 && (
                <ul className="mt-3 list-disc space-y-1.5 pl-5">
                  {b.madde.map((m, j) => (
                    <li key={j} className="text-sm leading-relaxed text-slate-700">{m}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </main>

      <Altbilgi />
    </div>
  );
}
