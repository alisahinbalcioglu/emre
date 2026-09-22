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
 *  paketi seçer." O sayfanın yaptığı tek iş "Paket seç" düğmesi göstermekti.
 *
 *  ── KAPALI HESAP NE YAPABİLİR (Emre, 22.09 akşamı, canlı ekrana bakarak) ─
 *  "kaydedilmiş tekliflerini görebilecek, indirebilecek, girebilecek ancak
 *  işlem yapamayacak." Kütüphane için de aynısı: "görünsün ama orada da
 *  işlem yapamasın."
 *
 *  ⚠ İLK YAZIMDA BU YANLIŞ UYGULANDI ve canlıda görüldü: kenar çubuğu tek
 *    maddeye indirilmiş, kişi kaydedilmiş tekliflerine ULAŞAMIYORDU. Emre'nin
 *    düzeltmesi: "kullanıcı neden sayfaya girip göremiyor — sadece
 *    KULLANAMAYACAK dedik." Erişim üç yerde birden açıldı: arka yüzde
 *    `@KapaliHesapIzinli` okuma uçları, `api.ts` yönlendirme süzgeci ve
 *    `erisim-durumu.ts` durdurma listesi.
 *
 *  ── BU ŞERİT TEK ŞERİTTİR ───────────────────────────────────────────────
 *  ⚠ CANLIDA GÖRÜLDÜ: `AbonelikSeridi` ile ALT ALTA iki kırmızı şerit
 *    çiziliyordu ve ikisi de AYNI sunucu cümlesini yazıyordu. Çözüm
 *    `AbonelikSeridi`nin kendi başlığındaki kuralın aynısı: "karar
 *    KOPYALANMAZ" — kapalı hesapta o şerit susar, bu şerit onun `eylem`
 *    düğmesini de taşır.
 *
 *  ⚠ VERİ `/auth/me`DEN TEK KEZ GELİR — bu bileşen KENDİ İSTEĞİNİ ATMAZ.
 *    İlk yazımda burada `useEffect` + `api.get('/auth/me')` vardı; ölçüldü:
 *    `CapabilitiesProvider` zaten aynı ucu çağırıyor. Sağlayıcının kuralı:
 *    "/auth/me ön yüzün TEK besleme noktasıdır."
 *
 *  ⚠ Durum `null` iken HİÇBİR ŞEY çizilmez (null = "henüz yüklenmedi" ya da
 *    "kapalı değil"), yoksa her sayfa açılışında bir an yanıp sönerdi.
 */

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { useCapabilities } from '@/ortak/contexts/CapabilitiesContext';
import { verileriIndir } from '@/ozellik/kimlik/verileri-indir';
import { toast } from '@/ortak/hooks/use-toast';
import { imhaTarihiAyricaYazilsinMi } from './kapali-durum';

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
  const tarihiYaz = imhaTarihiAyricaYazilsinMi(durum, tarih);

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-8 py-2.5 text-sm text-red-900"
    >
      <div className="flex min-w-0 items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="min-w-0">
          <span className="font-semibold">{durum.baslik}</span>{' '}
          {tarihiYaz && (
            <span className="opacity-90">
              Verileriniz <span className="font-semibold">{tarih}</span> tarihinde silinecek.{' '}
            </span>
          )}
          <span className="opacity-90">
            {firmaKapandi
              ? 'Kayıtlı teklifleri görüntüleyip indirebilirsiniz; üzerinde değişiklik yapılamaz. Firmanızı yalnızca sahibi geri açabilir.'
              : 'Kayıtlı tekliflerinizi görüntüleyip indirebilirsiniz; üzerinde değişiklik yapmak veya yeni teklif oluşturmak için bir paket seçin.'}
          </span>
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* KVKK m.11 — ödemesiz ve hesap kapalıyken de açık. */}
        <button
          type="button"
          onClick={() => void indir()}
          disabled={indiriliyor}
          className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 transition hover:bg-red-100 disabled:opacity-60"
        >
          {indiriliyor ? 'Hazırlanıyor…' : 'Verilerimi indir'}
        </button>

        {/* `AbonelikSeridi` kapalı hesapta susuyor; onun eylem düğmesi
            KAYBOLMASIN diye buraya taşındı. */}
        {durum.eylem && !firmaKapandi && (
          <Link
            href={durum.eylem.yol}
            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 transition hover:bg-red-100"
          >
            {durum.eylem.etiket}
          </Link>
        )}
      </div>
    </div>
  );
}
