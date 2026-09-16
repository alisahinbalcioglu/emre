'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import api from '@/ortak/lib/api';
import { useCapabilities } from '@/ortak/contexts/CapabilitiesContext';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ODEME DONUSU
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  iyzico bu adrese YALNIZCA opak bir `token` gonderir ve bu POST'un imzasi
 *  DOKUMANTE EDILMEMISTIR. Bu yuzden donus govdesine ASLA guvenilmez —
 *  yalnizca "git ve sor" tetigidir. Gercek sonuc sunucunun iyzico'ya
 *  sordugu cevaptir (`POST /abonelik/donus` → `formSonucu`).
 *
 *  Token→firma baglantisi da istekten DEGIL, sunucudaki `AbonelikBaslatma`
 *  niyet kaydindan gelir; boylece baskasinin token'iyla kendine abonelik
 *  acma yolu kapalidir.
 *
 *  ── SEKMEYI KAPATAN MUSTERI ────────────────────────────────────────────
 *  Bu sayfa HIC acilmasa bile abonelik acilir: sunucudaki kurtarma taramasi
 *  (10 dk) donusu gelmemis niyetleri iyzico'ya sorar. Yani erisim,
 *  musterinin tarayicisini acik tutmasina BAGLI DEGILDIR. Buradaki akis
 *  yalnizca kullaniciya ANINDA geri bildirim vermek icindir.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export default function OdemeDonusuSayfasi() {
  const { refresh } = useCapabilities();
  const [durum, setDurum] = useState<'sorgulaniyor' | 'tamam' | 'bekliyor' | 'hata'>('sorgulaniyor');
  const [mesaj, setMesaj] = useState<string>('Ödemeniz doğrulanıyor…');
  const kosuldu = useRef(false);

  useEffect(() => {
    // Sıkı mod (React 18 dev) effect'i iki kez kosar; sunucuya iki kez
    // sormanin faydasi yok — niyet zaten tekil.
    if (kosuldu.current) return;
    kosuldu.current = true;

    const q = new URLSearchParams(window.location.search);

    // ── ⭐ ASIL YOL: sunucunun yazdigi SONUC ────────────────────────────
    // 06.09'da olculdu: iyzico token'i POST GOVDESINDE gonderiyor ve
    // tarayici bu sayfaya POST ile dustugunde istemci JavaScript'i govdeyi
    // OKUYAMIYOR — asagidaki token okumasi HER SEFERINDE bos donuyordu ve
    // musteri odemesini yaptiktan sonra "Odeme bilgisi bulunamadi" goruyordu.
    // Artik POST'u sunucu karsiliyor (`/api/abonelik/iyzico-donus`), isi
    // bitiriyor ve buraya `?sonuc=` ile yonlendiriyor.
    const sonuc = q.get('sonuc');
    if (sonuc) {
      if (sonuc === 'tamam') {
        setDurum('tamam');
        setMesaj('Aboneliğiniz başlatıldı. İyi çalışmalar!');
        refresh();
      } else if (sonuc === 'bekliyor') {
        setDurum('bekliyor');
        setMesaj(
          'Ödemeniz henüz doğrulanmadı. Tahsilat tamamlandıysa hesabınız ' +
            'birkaç dakika içinde otomatik olarak açılır — bu sayfayı kapatabilirsiniz.',
        );
      } else {
        setDurum('hata');
        setMesaj('Ödeme bilgisi bulunamadı. Abonelik sayfasından tekrar deneyin.');
      }
      return;
    }

    // ── YEDEK YOL: token sorgu dizesinde gelirse ───────────────────────
    // Uzak ucun davranisi degisirse (GET + query) bu yol calisir. Tek
    // basina GUVENILMEZ oldugu icin ASIL yol degildir.
    const token = q.get('token') ?? '';

    if (!token) {
      setDurum('hata');
      setMesaj('Ödeme bilgisi bulunamadı. Abonelik sayfasından tekrar deneyin.');
      return;
    }

    (async () => {
      try {
        const { data } = await api.post<{ durum: string }>('/abonelik/donus', { token });
        if (data?.durum === 'TAMAMLANDI') {
          setDurum('tamam');
          setMesaj('Aboneliğiniz başlatıldı. İyi çalışmalar!');
          await refresh();
        } else {
          setDurum('bekliyor');
          setMesaj(
            'Ödemeniz henüz doğrulanmadı. Tahsilat tamamlandıysa hesabınız ' +
              'birkaç dakika içinde otomatik olarak açılır — bu sayfayı kapatabilirsiniz.',
          );
        }
      } catch {
        setDurum('hata');
        setMesaj(
          'Ödeme durumu sorgulanamadı. Tahsilat geçtiyse hesabınız kısa süre ' +
            'içinde otomatik açılır; sorun sürerse bizimle iletişime geçin.',
        );
      }
    })();
  }, [refresh]);

  const renk =
    durum === 'tamam'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : durum === 'hata'
        ? 'border-red-200 bg-red-50 text-red-900'
        : 'border-blue-200 bg-blue-50 text-blue-900';

  return (
    <div className="mx-auto max-w-lg py-12 text-center">
      <div className={`rounded-xl border px-6 py-8 ${renk}`}>
        {durum === 'sorgulaniyor' && (
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-current border-t-transparent" />
        )}
        <h1 className="text-lg font-bold">
          {durum === 'tamam'
            ? 'Ödeme alındı'
            : durum === 'hata'
              ? 'Bir sorun oluştu'
              : 'Ödemeniz işleniyor'}
        </h1>
        <p className="mt-2 text-sm">{mesaj}</p>
      </div>

      <div className="mt-6 flex justify-center gap-3">
        <Link href="/dashboard" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          Panele dön
        </Link>
        <Link href="/abonelik" className="rounded-lg border px-4 py-2 text-sm font-semibold">
          Abonelik sayfası
        </Link>
      </div>
    </div>
  );
}
