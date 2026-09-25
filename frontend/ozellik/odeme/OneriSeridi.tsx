'use client';

import { useEffect, useState } from 'react';
import api from '@/ortak/lib/api';
import type { Paket } from './paket-bicim';
import { GECERSIZ_ONERI_METNI, baglantidakiOneri, oneriSeridi } from './paket-onerisi';

const BILGI_KUTUSU = 'mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  YÖNETİCİ PAKET ÖNERİSİ ŞERİDİ (24.09.2026, A2 Blok 2) — abonelik sayfası
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Karar saf modülde (`paket-onerisi.ts`); bu bileşen çizer ve reddi gönderir.
 *  KABUL burada DEĞİL: "İncele ve onayla" A1'in onay penceresini açar (yeni
 *  paket, ücret, zamanlama ve sözleşme kutusu) — onay orada, aynı uçla
 *  (`POST /abonelik/degistir` + `oneriId`) verilir.
 *
 *  ⚠ `?oneri=` `window.location`tan okunur, `useSearchParams`tan DEĞİL:
 *  sayfa statik ön işlenir ve Next 14 o kancayı Suspense sınırı olmadan
 *  derlemede reddeder (`reset-password` ile aynı gerekçe).
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function OneriSeridi(props: {
  paketler: readonly Paket[];
  /** Paketler yüklenirken "bağlantı geçersiz" YANLIŞLIKLA görünmesin. */
  yukleniyor: boolean;
  sahipMi: boolean;
  mevcutPaketKodu: string | null;
  /** "İncele ve onayla" — A1'in onay penceresini açar (sözleşme kutusuyla). */
  onIncele: (hedef: Paket) => void;
  /** Ret başarılı: sayfa paketleri yeniden yükler (şerit kaybolur). */
  onReddedildi: () => void;
}) {
  const [baglanti, setBaglanti] = useState<string | null>(null);
  const [retSorusu, setRetSorusu] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<string | null>(null);
  // Bu oturumda geçerli öneri GÖRÜLDÜ mü? Kabulden sonra öneri listeden
  // kalkar ama adres çubuğunda `?oneri=` durur — o an "bağlantı geçersiz"
  // demek, az önce onaylayan kişiye yanlış bir şey söylemek olurdu.
  const [gecerliGoruldu, setGecerliGoruldu] = useState(false);

  useEffect(() => {
    setBaglanti(baglantidakiOneri(window.location.search));
  }, []);

  const g = oneriSeridi(props.paketler, {
    sahipMi: props.sahipMi,
    mevcutPaketKodu: props.mevcutPaketKodu,
    baglantidakiOneri: baglanti,
  });

  useEffect(() => {
    if (g.tur === 'sahip' || g.tur === 'uye') setGecerliGoruldu(true);
  }, [g.tur]);

  async function reddet(oneriId: string) {
    setGonderiliyor(true);
    setHata(null);
    try {
      await api.post(`/abonelik/oneri/${oneriId}/reddet`);
      setRetSorusu(false);
      setSonuc('Paket önerisini reddettiniz. Paketiniz değişmedi.');
      props.onReddedildi();
    } catch (e: any) {
      const m = e?.response?.data?.message ?? e?.response?.data?.mesaj;
      setHata(typeof m === 'string' ? m : 'Öneri reddedilemedi. Sayfayı yenileyip yeniden deneyin.');
    } finally {
      setGonderiliyor(false);
    }
  }

  if (sonuc) {
    return (
      <div role="status" className={BILGI_KUTUSU}>
        {sonuc}
      </div>
    );
  }
  // ⚠ Liste BOSSA paketler yuklenemedi (ya da satista paket yok): o anda
  // "baglanti gecersiz" demek, gecerli bir oneriyi olu ilan etmek olurdu
  // (inceleme D3 — `/abonelik/paketler` zaman asiminda liste bos kalir).
  if (props.yukleniyor || props.paketler.length === 0 || g.tur === 'yok') return null;
  if (g.tur === 'gecersiz-baglanti') {
    return gecerliGoruldu ? null : (
      <div role="status" className={BILGI_KUTUSU}>
        {GECERSIZ_ONERI_METNI}
      </div>
    );
  }
  if (g.tur === 'uye') {
    return (
      <div role="status" className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        MetaPriceX ekibi firmanıza <strong>{g.hedefAdi}</strong> paketini önerdi. Öneriyi firma sahibi
        inceleyip onaylayabilir (son gün {g.sonGun}).
      </div>
    );
  }

  return (
    <section
      aria-label="Paket önerisi"
      className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950"
    >
      <p className="font-semibold">MetaPriceX ekibi size {g.hedef.ad} paketini önerdi.</p>
      <p className="mt-1 text-xs">
        Paketiniz siz onaylamadan değişmez. Öneri {g.sonGun} tarihine kadar geçerli.
      </p>
      {g.not && (
        <p className="mt-2 rounded-md bg-white/70 px-3 py-2 text-xs leading-relaxed">
          <span className="font-medium">Ekibin notu:</span> {g.not}
        </p>
      )}
      {!g.kabul.acik && <p className="mt-2 text-xs text-amber-800">{g.kabul.neden}</p>}
      {hata && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {hata}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!g.kabul.acik || gonderiliyor}
          onClick={() => props.onIncele(g.hedef)}
          className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          İncele ve onayla
        </button>
        {retSorusu ? (
          <>
            <span className="text-xs">Öneriyi reddetmek istediğinize emin misiniz?</span>
            <button
              type="button"
              disabled={gonderiliyor}
              onClick={() => void reddet(g.oneriId)}
              className="rounded border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50"
            >
              {gonderiliyor ? 'Reddediliyor…' : 'Evet, reddet'}
            </button>
            <button
              type="button"
              disabled={gonderiliyor}
              onClick={() => setRetSorusu(false)}
              className="rounded border border-border bg-white px-3 py-1.5 text-xs"
            >
              Vazgeç
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              setHata(null);
              setRetSorusu(true);
            }}
            className="rounded border border-border bg-white px-3 py-1.5 text-xs"
          >
            Reddet
          </button>
        )}
      </div>
    </section>
  );
}
