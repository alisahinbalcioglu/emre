'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  KAPALI HESAP ŞERİDİ (22.09.2026 — Emre kararı)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Bu şerit, SİLİNEN `/hesap-kapali` sayfasının yerini alıyor.
 *
 *  ── NEDEN SAYFA KALDIRILDI ──────────────────────────────────────────────
 *  Emre'nin cümlesi: "ikinci bir arayüze hiç gerek yok — 30 gün boyunca mail
 *  ve şifre kayıtlı kalır, girmek istediğinde sisteme giriş yapar ve istediği
 *  paketi seçer." Doğruydu: kapalı hesabın geri dönmesinin TEK yolu paket
 *  almak, ve o sayfanın yaptığı tek iş "Paket seç" düğmesi göstermekti —
 *  yani kullanıcıyı gideceği yere bir tık uzaktan gösteren fazladan bir adım.
 *
 *  ── AMA SAYFAYLA BİRLİKTE KAYBOLMAMASI GEREKEN İKİ ŞEY VARDI ────────────
 *  1) KAPATMA CÜMLESİ ve İMHA TARİHİ. "Verileriniz 22.10.2026 tarihinde
 *     silinecek" bir söz ve hukuki metinlerde de yazılı; kullanıcı bunu
 *     görmeden 30 günlük pencereyi bilemez.
 *  2) VERİ İNDİRME. KVKK m.11 hakkı. Uç kapalı hesaba AÇIK
 *     (`auth.controller.ts` `@KapaliHesapIzinli`) ama ÖLÇÜLDÜ: kapalı hesap
 *     yalnız `/abonelik` yolunda kalabiliyor, `/profile` ve
 *     `/koltuk-durduruldu` ona kapalı. Yani düğme buradan kalkarsa hak
 *     "mekanizma var, bağlantı yok" hâline düşerdi — bu deponun tekrarlayan
 *     hata sınıfı, üstelik yasal bir hakta.
 *
 *  ── ÜÇÜNCÜ AYRIM: FİRMASI KAPANAN ÜYE PAKET SEÇEMEZ ────────────────────
 *  `tip === 'firma'` ise firmayı SAHİBİ geri açar (K2). O kişiye paket
 *  kartları göstermek yapamayacağı bir şeyi vaat etmek olurdu; şerit bunu
 *  ADIYLA söyler, abonelik sayfası da kartları gizler.
 *
 *  ⚠ VERİ `/auth/me`DEN TEK KEZ GELİR — bu bileşen KENDİ İSTEĞİNİ ATMAZ.
 *    İlk yazımda burada bir `useEffect` + `api.get('/auth/me')` vardı;
 *    ölçüldü: `CapabilitiesProvider` zaten aynı ucu çağırıyor, yani her
 *    kabuk açılışında İKİ istek gidiyor ve iki ayrı gerçek kaynağı
 *    oluşuyordu. Deponun kuralı sağlayıcının kendi başlığında yazılı:
 *    "/auth/me ön yüzün TEK besleme noktasıdır" — `emailVerified` de aynı
 *    gerekçeyle oradan okunuyor.
 *
 *  ⚠ Şerit `emailVerified` şeridiyle AYNI desende: durum `null` iken
 *    HİÇBİR ŞEY çizilmez (null = "henüz yüklenmedi" ya da "kapalı değil"),
 *    yoksa her sayfa açılışında bir an yanıp sönerdi.
 */

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useCapabilities } from '@/ortak/contexts/CapabilitiesContext';
import { verileriIndir } from '@/ozellik/kimlik/verileri-indir';
import { toast } from '@/ortak/hooks/use-toast';

export function KapaliHesapSeridi() {
  const { kapali: durum, loading } = useCapabilities();
  const [indiriliyor, setIndiriliyor] = useState(false);

  async function indir() {
    setIndiriliyor(true);
    try {
      if (!(await verileriIndir())) {
        toast({
          variant: 'destructive',
          title: 'Veriler indirilemedi',
          description: 'Lütfen birazdan tekrar deneyin.',
        });
      }
    } finally {
      setIndiriliyor(false);
    }
  }

  if (loading || !durum) return null;

  const firmaKapandi = durum.tip === 'firma';
  const tarih = durum.imhaTarihi
    ? new Date(durum.imhaTarihi).toLocaleDateString('tr-TR')
    : null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-8 py-2.5 text-sm text-red-900"
    >
      <div className="flex min-w-0 items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="min-w-0">
          <span className="font-semibold">{durum.baslik}</span>{' '}
          {tarih && (
            <span className="opacity-90">
              Verileriniz <span className="font-semibold">{tarih}</span> tarihinde silinecek.
            </span>
          )}{' '}
          <span className="opacity-90">
            {firmaKapandi
              ? 'Firmanızı yalnızca sahibi geri açabilir.'
              : 'Bir paket seçerek hesabınızı geri açabilirsiniz; verileriniz olduğu gibi geri gelir.'}
          </span>
        </span>
      </div>

      {/* KVKK m.11 — ödemesiz ve hesap kapalıyken de açık. Kapalı hesabın
          bu hakka ulaşabildiği TEK yer burası. */}
      <button
        type="button"
        onClick={() => void indir()}
        disabled={indiriliyor}
        className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 transition hover:bg-red-100 disabled:opacity-60"
      >
        {indiriliyor ? 'Hazırlanıyor…' : 'Verilerimi indir'}
      </button>
    </div>
  );
}
