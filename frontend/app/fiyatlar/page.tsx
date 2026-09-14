import type { Metadata } from 'next';
import Link from 'next/link';
import { Altbilgi } from '@/ortak/kabuk/components/layout/Altbilgi';
import { FiyatKartlari } from '@/ozellik/odeme/FiyatKartlari';
import { sayfaMetaverisi } from '@/ortak/seo/arama-paylasim';

/**
 * FİYATLAR — `/fiyatlar` (Faz 6.1, 13.09.2026). Girişsiz ziyaretçiye açık.
 *
 * Bu dosyada RAKAM YOK: tutar, deneme günü ve kota `FiyatKartlari` içinde
 * `GET /api/fiyatlar`'dan okunur. Burada yalnız kotanın NASIL sayıldığını
 * anlatan metin durur — o metin kural değiştiğinde elle güncellenir ve
 * `fiyat-sayfasi.test.ts` zorunlu cümlelerin yerinde olduğunu ölçer.
 *
 * ⚠ SUITE BU SAYFADA YOK (karar 13.09): `PackageLevel` enum'unda suite değeri
 * olmadığı için suite aboneliği kaydedilemiyor ve satır tavanı belirlenmedi.
 * Satılamayan paket ilan edilmez.
 *
 * ⚠ "SATIR" TANIMI SAYFADA ZORUNLU (karar 13.09, tanım a): ölçülen bir dosya
 * bu tanımla 1.766, dar tanımla 527 satır — 3,35 kat. Tanımsız rakam anlam
 * taşımaz.
 */
// Plan 6.5: paylasim karti bu baslik/aciklamayi tasir; gorsel satis sayfasi
// gorunumunde ve RAKAMSIZ (fiyat veritabanindan, gorsele gomulmez).
export const metadata: Metadata = sayfaMetaverisi({
  baslik: 'Fiyatlar — MetaPriceX',
  aciklama:
    'MetaPriceX paketleri ve fiyatları. Teklif sayısı sınırsız; İngilizce çeviri paketinizin satır ve dosya kotasıyla yapılır.',
  yol: '/fiyatlar',
  gorsel: 'fiyatlar',
});

const KOTA_KURALLARI: { vurgu?: boolean; metin: string }[] = [
  { vurgu: true, metin: 'Satır = çevrilecek metin içeren satır. Şartname ve açıklama satırları dâhildir.' },
  { metin: 'Yalnız çap, ölçü ya da koddan oluşan satırlar (ör. “DN 20”) çevrilmez ve sayılmaz.' },
  {
    metin:
      'Satır ve dosya tavanı birlikte işler: hangisi önce dolarsa o dönemin çeviri kotası biter.',
  },
  { vurgu: true, metin: 'Aynı dosyayı tekrar çevirmek kotadan yeniden düşer.' },
  {
    // ⚠ "10 dakika" sunucudaki TEKRAR_PENCERESI_DK ile aynı olmak zorunda ve
    // pencere çevirinin BİTİŞİNDEN ölçülür — `test:ceviri-kota-uygulama` W45.
    metin:
      'Tek istisna: çeviri tamamlandıktan sonraki 10 dakika içinde aynı içerik için gelen tekrar istek (çift tıklama, bağlantı kopması) tek çeviri sayılır. İçerik değiştiyse yeni çeviridir.',
  },
  {
    // 14.09: kısmi çeviride harita kullanıcıya teslim edilir; "hiç düşmez"
    // demek teslim edilen satırı kotasız bırakırdı (inceleme Y1).
    metin:
      'Hata alan çeviri kotadan düşmez. Kısmen tamamlanan çeviride yalnız çevrilen satırlar düşer; 10 dakika içinde yeniden denerseniz kalan satırlar çevrilir, çevrilmiş olanlar yeniden düşmez.',
  },
  { metin: 'Kota takvim ayına göre değil, abonelik döneminize göre yenilenir.' },
  {
    metin:
      'Dönemlik satır tavanınızdan büyük tek bir dosya o pakette hiçbir dönem çevrilemez; bunun için daha yüksek kotalı bir paket gerekir.',
  },
];

export default function FiyatlarSayfasi() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-0.5 text-lg font-extrabold tracking-tight text-slate-900">
            MetaPrice<span className="text-blue-600">X</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-xs font-semibold text-slate-700 hover:text-blue-600">
              Giriş Yap
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-[#0B1528] px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Hesap Oluştur
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Paketler ve fiyatlar</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Teklif sayısı sınırsızdır. Paketler disipline (mekanik, elektrik ya da ikisi) ve kapsama
            göre ayrılır; İngilizce çeviri paketinizin kotasıyla yapılır. Paketinizi hesabınızı açtıktan
            sonra seçersiniz; ücretsiz deneme kart bilgisiyle başlar.
          </p>
        </div>

        <div className="mt-10">
          <FiyatKartlari />
        </div>

        <section className="mt-14 max-w-3xl" aria-labelledby="kota-baslik">
          <h2 id="kota-baslik" className="text-xl font-bold text-slate-900">
            Çeviri kotası nasıl sayılır
          </h2>
          <ul className="mt-4 space-y-2.5">
            {KOTA_KURALLARI.map((k) => (
              <li
                key={k.metin}
                className={
                  k.vurgu
                    ? 'rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-900'
                    : 'px-4 text-sm leading-relaxed text-slate-700'
                }
              >
                {k.metin}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-xs leading-relaxed text-slate-500">
            Dolar tutarı gösterim içindir; tahsilat, her paketin altında “≈” ile gösterilen KDV dahil Türk
            lirası tutarı üzerinden yapılır.
          </p>
        </section>
      </main>

      <Altbilgi />
    </div>
  );
}
