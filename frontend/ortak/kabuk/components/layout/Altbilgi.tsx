import Link from 'next/link';
import { HUKUKI_SAYFALAR, SATICI } from '@/ozellik/hukuki/metinler';

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
 */
export function Altbilgi({ koyu = false }: { koyu?: boolean }) {
  const yil = 2026;
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
          {HUKUKI_SAYFALAR.map((s) => (
            <Link
              key={s.yol}
              href={s.yol}
              className={
                koyu
                  ? 'hover:text-slate-300 transition-colors'
                  : 'hover:text-foreground transition-colors'
              }
            >
              {s.kisaAd}
            </Link>
          ))}
        </div>
        <div className="flex flex-col gap-0.5 sm:items-end">
          <p>© {yil} {SATICI.gorunenAd}. Tüm hakları saklıdır.</p>
          {/* ⚠ Satıcı kimliği HENÜZ DOLDURULMADI: `SATICI` sabitindeki alanlar
              köşeli parantezli yer tutucu olduğu sürece BURADA GÖSTERİLMEZ —
              "[FİRMA UNVANI]" yazan bir altbilgi, boş bırakmaktan daha kötüdür. */}
          {SATICI.dolduruldu && (
            <p className="text-[11px] opacity-80">
              {SATICI.unvan} · {SATICI.adres}
              {SATICI.mersis ? ` · MERSİS: ${SATICI.mersis}` : ''}
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}
