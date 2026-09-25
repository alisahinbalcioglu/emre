'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import api from '@/ortak/lib/api';
import { useCapabilities } from '@/ortak/contexts/CapabilitiesContext';
import { IyzicoFormu } from '@/ozellik/odeme/IyzicoFormu';
import {
  KART_METINLERI,
  guncellendiMetni,
  kartHatasi,
  kartIstekGovdesi,
  kartSayfasiGirdisi,
  yenidenAcmaAdresi,
} from '@/ozellik/odeme/kart-guncelleme';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  KART GÜNCELLEME (25.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Dunning e-postalarının "Kartımı güncelle" düğmesi (`?a=<abonelik id>`) ve
 *  uygulama içi şeridin "Kartı güncelle" / "Ödemeyi tamamla" eylemi buraya
 *  gelir; sayfa yokken hepsi 404'tü (canlıda ölçüldü). Kurallar ve metinler
 *  `ozellik/odeme/kart-guncelleme.ts`te.
 *
 *  `/abonelik/*` erişimi kapalı firmada da AÇIK (`erisim-durumu.ts`
 *  `DURDURULMAYAN_YOL`) ve sunucu ucu erişim kapısı taşımaz: askıdaki
 *  firmanın kartını değiştirebileceği yer burası. Oturumsuz gelen kullanıcı
 *  girişten sonra `?a=` (ya da `?sonuc=`) ile birlikte buraya döner: korumalı
 *  kabuk `girisDonusunuSakla`, izin listesi `ortak/lib/oturum.ts`
 *  `IZINLI_DONUS`.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export default function KartGuncellemeSayfasi() {
  // Başarı metni abonelik durumuna göre: bekleyen ödeme kart güncellemesiyle
  // ÇEKİLMEZ, ekran bunu söyler (`guncellendiMetni`).
  const { erisim } = useCapabilities();
  const [kip, setKip] = useState<'hazirlaniyor' | 'form' | 'guncellendi' | 'donusHatasi' | 'formHatasi'>(
    'hazirlaniyor',
  );
  const [formHtml, setFormHtml] = useState('');
  const [retMetni, setRetMetni] = useState<string | null>(null);
  const [yenidenAcYolu, setYenidenAcYolu] = useState<string | null>(null);
  const kosuldu = useRef(false);

  useEffect(() => {
    // Sıkı mod (React 18 dev) effect'i iki kez koşar; iyzico'dan iki form
    // istemenin anlamı yok — ikincisi ilk token'ı geçersiz kılar.
    if (kosuldu.current) return;
    kosuldu.current = true;

    const girdi = kartSayfasiGirdisi(window.location.search);
    if (girdi.sonuc === 'guncellendi') {
      setKip('guncellendi');
      return;
    }
    if (girdi.sonuc === 'hata') {
      setYenidenAcYolu(yenidenAcmaAdresi(girdi, 'baglantisiz'));
      setKip('donusHatasi');
      return;
    }

    (async () => {
      try {
        const { data } = await api.post<{ formIcerigi: string }>(
          '/abonelik/kart-guncelle',
          kartIstekGovdesi(girdi),
        );
        setFormHtml(data.formIcerigi);
        setKip('form');
      } catch (e) {
        const ret = kartHatasi(e);
        setRetMetni(ret.metin);
        setYenidenAcYolu(yenidenAcmaAdresi(girdi, ret.yenidenAcma));
        setKip('formHatasi');
      }
    })();
  }, []);

  if (kip === 'form') {
    return (
      // Satın almanın ödeme ekranıyla aynı genişlik: iyzico formu responsive
      // kipte kabın genişliğini alır, dar bir kutuda sıkışmaz.
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-1 text-2xl font-bold">{KART_METINLERI.formBaslik}</h1>
        <p className="mb-6 text-sm text-muted-foreground">{KART_METINLERI.formNotu}</p>
        {/* `dangerouslySetInnerHTML` DEĞİL: iyzico içeriği bir betiktir ve
            innerHTML ile eklenen <script> yürütülmez — bkz. IyzicoFormu. */}
        <IyzicoFormu html={formHtml} />
      </div>
    );
  }

  const basarili = kip === 'guncellendi';
  const hatali = kip === 'donusHatasi' || kip === 'formHatasi';
  const renk = basarili
    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : hatali
      ? 'border-red-200 bg-red-50 text-red-900'
      : 'border-blue-200 bg-blue-50 text-blue-900';
  const baslik = basarili
    ? KART_METINLERI.guncellendiBaslik
    : kip === 'donusHatasi'
      ? KART_METINLERI.donusHatasiBaslik
      : kip === 'formHatasi'
        ? KART_METINLERI.formHatasiBaslik
        : KART_METINLERI.formBaslik;
  const metin = basarili
    ? guncellendiMetni(erisim?.durum)
    : kip === 'donusHatasi'
      ? KART_METINLERI.donusHatasiMetin
      : kip === 'formHatasi'
        ? retMetni ?? KART_METINLERI.genel
        : KART_METINLERI.hazirlaniyor;

  return (
    <div className="mx-auto max-w-lg py-12 text-center">
      <div role={hatali ? 'alert' : 'status'} className={`rounded-xl border px-6 py-8 ${renk}`}>
        {kip === 'hazirlaniyor' && (
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-current border-t-transparent" />
        )}
        <h1 className="text-lg font-bold">{baslik}</h1>
        <p className="mt-2 text-sm">{metin}</p>
      </div>

      {kip !== 'hazirlaniyor' && (
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {yenidenAcYolu && (
            // `<a>`: aynı yolda `Link` sayfayı yeniden kurmaz, form istenmezdi.
            <a href={yenidenAcYolu} className="rounded-lg border px-4 py-2 text-sm font-semibold">
              Formu yeniden aç
            </a>
          )}
          <Link href="/dashboard" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            Panele dön
          </Link>
          <Link href="/abonelik" className="rounded-lg border px-4 py-2 text-sm font-semibold">
            Abonelik sayfası
          </Link>
        </div>
      )}
    </div>
  );
}
