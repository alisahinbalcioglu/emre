import type { Metadata } from 'next';
import Link from 'next/link';
import { KurumsalSayfa } from '@/ozellik/kurumsal/KurumsalSayfa';
import { ILETISIM } from '@/ozellik/kurumsal/sayfalar';
import { GIZLILIK, SATICI } from '@/ozellik/hukuki/metinler';

// ⚠ HİÇBİR KİMLİK BİLGİSİ BU DOSYAYA DÜZ YAZILMAZ — hepsi `SATICI` sabitinden
// okunur (`ozellik/hukuki/metinler.ts`). Unvan/adres/MERSİS'i buraya elle
// yazmak, dört hukuki metinle beşinci bir kopya üretirdi; bu sabitin var olma
// sebebi tam olarak o hata (eskiden aynı bilgi 42 yerde, 19 ayrı yazımla).
export const metadata: Metadata = { title: ILETISIM.sayfaBasligi };

/**
 * İLETİŞİM KANALLARI — `null` alan satırı HİÇ BASMAZ (KEP'in deseni).
 * Boş bir "Telefon:" satırı, olmayan bir kanalı varmış gibi gösterirdi.
 * Telefon bugün `null` (Emre kararı 21.09); bir iş hattı girildiğinde bu satır
 * kendiliğinden görünür — değer tek yerde, `SATICI.telefon`.
 */
const KANALLAR: { etiket: string; deger: string; href?: string }[] = [
  { etiket: 'E-posta', deger: SATICI.eposta, href: `mailto:${SATICI.eposta}` },
  ...(SATICI.telefon
    ? [{ etiket: 'Telefon', deger: SATICI.telefon, href: `tel:${SATICI.telefon.replace(/\s/g, '')}` }]
    : []),
  ...(SATICI.kep ? [{ etiket: 'KEP adresi', deger: SATICI.kep }] : []),
];

/** Şirket künyesi — sıra iyzico "Başvuru Koşulları" sayfasının saydığı sıradır. */
const KUNYE: { etiket: string; deger: string }[] = [
  { etiket: 'Ticari unvan', deger: SATICI.unvan },
  { etiket: 'Merkez adresi', deger: SATICI.adres },
  { etiket: 'MERSİS numarası', deger: SATICI.mersis },
  { etiket: 'Ticaret sicil numarası', deger: SATICI.ticaretSicilNo },
  { etiket: 'Meslek odası', deger: SATICI.meslekOdasi },
  { etiket: 'Vergi dairesi / numarası', deger: `${SATICI.vergiDairesi} / ${SATICI.vergiNo}` },
];

export default function Sayfa() {
  return (
    <KurumsalSayfa sayfa={ILETISIM}>
      <p className="text-sm leading-relaxed text-slate-700">
        Ürün, abonelik, fatura ve kişisel verilerinizle ilgili tüm talepleriniz için bize
        yazabilirsiniz.
      </p>

      <dl className="mt-8 space-y-3">
        {KANALLAR.map((k) => (
          <div key={k.etiket} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
            <dt className="text-sm font-semibold text-slate-900 sm:w-48 sm:shrink-0">{k.etiket}</dt>
            <dd className="text-sm leading-relaxed text-slate-700">
              {k.href ? (
                <a href={k.href} className="font-semibold text-blue-600 hover:text-blue-700">
                  {k.deger}
                </a>
              ) : (
                k.deger
              )}
            </dd>
          </div>
        ))}
      </dl>

      {/* ⚠ YARIM KÜNYE GÖSTERİLMEZ — koruma alt bilgiden BURAYA TAŞINDI (21.09).
          Künye eskiden alt bilgideydi ve orada `SATICI.dolduruldu &&` ile
          korunuyordu: alanlar köşeli parantezli yer tutucu olduğu sürece
          hiç basılmazdı, çünkü "[FİRMA UNVANI]" yazan bir künye boş
          bırakmaktan daha kötüdür. Künye 21.09'da Emre kararıyla alt
          bilgiden kaldırılıp yalnız bu sayfaya alındı; koruma da onunla
          birlikte gelmeliydi. Gelmeseydi kural sessizce kaybolurdu —
          bugün görünmezdi çünkü `SATICI` dolu, ama yarın yeni bir alan
          eklendiğinde yer tutucu doğrudan müşteriye çıkardı.
          Kapı: `faz5-kvkk-hukuki-test.ts` D11. */}
      {SATICI.dolduruldu && (
        <section className="mt-10 border-t pt-8">
          <h2 className="text-base font-semibold text-slate-900">Şirket bilgileri</h2>
          <dl className="mt-3 space-y-3">
            {KUNYE.map((s) => (
              <div key={s.etiket} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <dt className="text-sm font-semibold text-slate-900 sm:w-48 sm:shrink-0">
                  {s.etiket}
                </dt>
                <dd className="text-sm leading-relaxed text-slate-700">{s.deger}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* ⚠ BAŞVURU YOLU BURADA TEKRARLANMAZ: Gizlilik metni (KVKK haklarınız
          bölümü) başvurunun nasıl yapılacağını, hangi tebliğe göre ve hangi
          bilgilerle yapılması gerektiğini zaten anlatıyor. İkinci kez yazmak,
          biri güncellenince ötekinin geride kalacağı bir ikiz üretirdi. */}
      <section className="mt-10 border-t pt-8">
        <h2 className="text-base font-semibold text-slate-900">Kişisel veri başvuruları</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-700">
          Kişisel verilerinizle ilgili KVKK kapsamındaki taleplerinizi de yukarıdaki adreslere
          iletebilirsiniz. Başvurunuzu nasıl yapmanız gerektiği ve hangi haklara sahip olduğunuz{' '}
          <Link href={GIZLILIK.yol} className="font-semibold text-blue-600 hover:text-blue-700">
            {GIZLILIK.kisaAd}
          </Link>{' '}
          sayfasında anlatılmıştır.
        </p>
      </section>
    </KurumsalSayfa>
  );
}
