import Link from 'next/link';
import { HUKUKI_SAYFALAR, SATICI } from '@/ozellik/hukuki/metinler';
import { KURUMSAL_SAYFALAR } from '@/ozellik/kurumsal/sayfalar';

/**
 * ALTBİLGİ — hukuki sayfalara ve satıcı kimliğine giden TEK bileşen (FAZ 5.2/5.7).
 *
 * ⚠ NEDEN TEK BİLEŞEN ve ÜÇ YERE MOUNT EDİLİYOR:
 * Ölçüldü (09.09) — `<footer>` etiketi TÜM frontend'de yalnız BİR dosyada
 * vardı (`app/page.tsx`, pazarlama sayfası) ve içinde SIFIR bağlantı vardı:
 * sadece "© 2026 MetaPriceX". Yani 32 rotanın 31'inde altbilgi ETİKETİ BİLE
 * yoktu. Uygulamada ÜÇ ayrı düzen var (`app/layout.tsx` kökü,
 * `app/(protected)/layout.tsx`, `app/admin/layout.tsx`); yalnız ikisine
 * eklenen bir altbilgi üçüncüsünde GÖRÜNMEZ.
 *
 * ⚠ BAĞLANTI VERİLEN HER SAYFA GERÇEKTEN VAR OLMALI. Bu deponun kendi
 * kuralı (`app/page.tsx:414` ve giriş ekranındaki "Parolamı unuttum" notu):
 * tıklanınca hiçbir şey yapmayan bağlantı, var olmayan bir şey vaat eder.
 * Bu yüzden liste `HUKUKI_SAYFALAR` sabitinden türetiliyor — sayfa
 * silinirse bağlantı da düşer, elle senkron tutulmaz.
 *
 * ⚠ KURUMSAL SAYFALAR AYRI LİSTEDEN (21.09, t.21): `/hakkimizda` ve
 * `/iletisim` hukuki metin DEĞİL, bu yüzden `HUKUKI_SAYFALAR`a karıştırılmadı
 * — o liste taslak şeridine, metin sürümüne ve "liste dört metindir"
 * ölçütüne bağlı. Aynı kural ikisi için de geçerli: bağlantılar
 * `KURUMSAL_SAYFALAR`dan TÜRER, elle yazılmış `<Link>` yok.
 * iyzico'nun "ana sayfadan doğrudan erişilebilen İletişim" şartı buradan
 * karşılanıyor: altbilgi ÜÇ düzende birden, ana sayfa dahil görünür.
 */
export function Altbilgi({ koyu = false }: { koyu?: boolean }) {
  const yil = 2026;
  const baglantiSinifi = koyu
    ? 'hover:text-slate-300 transition-colors'
    : 'hover:text-foreground transition-colors';
  return (
    <footer
      className={
        koyu
          ? 'border-t border-slate-900 bg-slate-950 py-8 text-xs text-slate-500'
          : 'border-t bg-muted/30 py-6 text-xs text-muted-foreground'
      }
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {/* İKİ AYRI `.map()`, TEK ŞERİT: listeleri birleştirmek `HUKUKI_SAYFALAR`
              adını bu dosyadan silerdi ve `faz5-kvkk-hukuki-test.ts` D10 kapısı
              ("bağlantılar LİSTEDEN türüyor") kaynağı orada arıyor. Ölçtüğü
              davranış zaten aynı — iki liste de elle senkron tutulmuyor. */}
          {KURUMSAL_SAYFALAR.map((s) => (
            <Link key={s.yol} href={s.yol} className={baglantiSinifi}>
              {s.kisaAd}
            </Link>
          ))}
          {HUKUKI_SAYFALAR.map((s) => (
            <Link key={s.yol} href={s.yol} className={baglantiSinifi}>
              {s.kisaAd}
            </Link>
          ))}
        </div>
        <div className="flex flex-col gap-0.5 sm:items-end">
          {/* ── KÜNYE BURADA DEĞİL, /iletisim SAYFASINDA (Emre kararı, 21.09) ──
              Alt bilgide unvan + tam adres + MERSİS + meslek odası tek satırda
              basılıyordu; canlıda gözle bakılınca fazla ağır durduğu görüldü ve
              ticari sitelerin alışkanlığına da aykırı. Bilgi KAYBOLMUYOR:
              `KURUMSAL_SAYFALAR`den türeyen "İletişim" bağlantısı bu alt
              bilgide duruyor ve o sayfa altı alanın altısını da `SATICI`
              sabitinden basıyor (kapısı: `kurumsal-sayfalar.test.ts`).
              ⚠ iyzico'nun şartı "ana sayfadan DOĞRUDAN ERİŞİLEBİLEN bir
              İletişim başlığı" — satırın kendisi değil, erişilebilirliği.
              O yüzden bağlantı kaldırılamaz; künye satırı kaldırılabilir. */}
          <p>© {yil} {SATICI.gorunenAd}. Tüm hakları saklıdır.</p>
        </div>
      </div>
    </footer>
  );
}
