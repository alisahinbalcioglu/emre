'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/ortak/lib/api';
import { useCapabilities } from '@/ortak/contexts/CapabilitiesContext';
import { KAPSAM_ETIKET, SEVIYE_ETIKET, vitrinFiyati, type Paket } from '@/ozellik/odeme/paket-bicim';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ABONELIK / PAKET SECIMI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ BU SAYFA ERISIM KAPISI TASIMAZ ve bu bir gozden kacma DEGILDIR.
 *  Askidaki bir firmanin odeme yapabilecegi TEK kapi burasidir; kapatilirsa
 *  musteri odeyemez ve askidan CIKAMAZ (kilitlenme). Sunucu tarafinda da
 *  ayni kural var: `Yetenek.ABONELIK_YONET` her durumda true doner.
 *
 *  Kart formu iyzico'nun BARINDIRILAN formudur: `POST /abonelik/basla`
 *  bir HTML parcasi (checkoutFormContent) doner, sayfaya gomulur. Kart
 *  bilgisi BIZIM sunucumuza HIC UGRAMAZ.
 *
 *  DIKKAT — abonelikte 3D Secure YOKTUR (iyzico TR dokumani: "ilk islem
 *  dahil tum islemler NON3D"). mdStatus / 3DS callback beklenmez.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export default function AbonelikSayfasi() {
  const { erisim, refresh } = useCapabilities();
  const [paketler, setPaketler] = useState<Paket[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [secilen, setSecilen] = useState<string | null>(null);
  const [formHtml, setFormHtml] = useState<string | null>(null);

  const paketleriGetir = useCallback(async () => {
    try {
      const { data } = await api.get<Paket[]>('/abonelik/paketler');
      setPaketler(Array.isArray(data) ? data : []);
    } catch {
      setHata('Paketler yuklenemedi. Lutfen sayfayi yenileyin.');
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => {
    paketleriGetir();
  }, [paketleriGetir]);

  async function satinAl(paketSurumuId: string) {
    setSecilen(paketSurumuId);
    setHata(null);
    try {
      // Fatura kimligi zorunlu alanlar iyzico tarafinda isteniyor; bu
      // surumde firmanin kayitli bilgileri kullanilir. Eksikse sunucu
      // aciklayici hata doner — sessizce bos gonderilmez.
      const { data } = await api.post<{ formIcerigi: string }>('/abonelik/basla', {
        paketSurumuId,
      });
      setFormHtml(data.formIcerigi);
    } catch (e: any) {
      const m = e?.response?.data?.message ?? e?.response?.data?.mesaj;
      setHata(typeof m === 'string' ? m : 'Odeme baslatilamadi.');
      setSecilen(null);
    }
  }

  async function iptalEt() {
    if (!confirm('Aboneliginizi iptal etmek istediginize emin misiniz? Donem sonuna kadar erisiminiz surer.')) return;
    try {
      await api.post('/abonelik/iptal', {});
      await refresh();
    } catch {
      setHata('Iptal islemi tamamlanamadi.');
    }
  }

  // ── Kart formu acildiysa yalniz onu goster ──────────────────────────
  if (formHtml) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-1 text-2xl font-bold">Odeme</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Kart bilgileriniz dogrudan iyzico'ya iletilir, sunucularimiza kaydedilmez.
        </p>
        {/* iyzico'nun barindirilan formu — kendi script'ini calistirir. */}
        <div dangerouslySetInnerHTML={{ __html: formHtml }} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 text-2xl font-bold">Abonelik</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Paketinizi secin. Dolar tutarlari referanstir; tahsilat TL olarak,
        KDV dahil yapilir.
      </p>

      {/* Mevcut durum ozeti */}
      {erisim && (
        <div className="mb-6 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Mevcut durum</p>
              <p className="mt-0.5 font-semibold">
                {erisim.paketKodu ? erisim.paketKodu : 'Abonelik yok'}
                <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                  {erisim.durum}
                </span>
              </p>
              {erisim.kalanGun !== null && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Kalan sure: {erisim.kalanGun} gun
                </p>
              )}
            </div>
            {(erisim.durum === 'AKTIF' || erisim.durum === 'DENEME') && (
              <button
                type="button"
                onClick={iptalEt}
                className="rounded-lg border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
              >
                Aboneligi iptal et
              </button>
            )}
          </div>
        </div>
      )}

      {hata && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {hata}
        </div>
      )}

      {yukleniyor ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Paketler yukleniyor…</div>
      ) : paketler.length === 0 ? (
        <div className="rounded-xl border bg-muted/30 py-12 text-center text-sm text-muted-foreground">
          Su anda satista paket bulunmuyor. Lutfen bizimle iletisime gecin.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {paketler.map((p) => (
            <div key={p.paketId} className="flex flex-col rounded-xl border bg-card p-5">
              <div className="mb-3">
                <h2 className="text-lg font-bold">{p.ad}</h2>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                    {KAPSAM_ETIKET[p.kapsam] ?? p.kapsam}
                  </span>
                  <span className="rounded-md bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                    {SEVIYE_ETIKET[p.seviye] ?? p.seviye}
                  </span>
                </div>
              </div>

              {p.aciklama && (
                <p className="mb-3 text-sm text-muted-foreground">{p.aciklama}</p>
              )}

              <div className="mb-4">
                {/* VITRIN: dolar buyuk, TL altinda. Sozlesme tutari TL'dir;
                    ekran hangisinin baglayici oldugunu saklamaz. */}
                <span className="text-2xl font-bold">
                  {vitrinFiyati(p.surum).ana}
                </span>
                <span className="text-sm text-muted-foreground"> / ay</span>
                {vitrinFiyati(p.surum).alt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {vitrinFiyati(p.surum).alt}
                  </p>
                )}
                {p.surum.denemeGunu > 0 && (
                  <p className="mt-1 text-xs text-emerald-700">
                    {p.surum.denemeGunu} gun ucretsiz deneme
                  </p>
                )}
              </div>

              <ul className="mb-5 space-y-1.5 text-sm">
                <li>· {p.kullaniciHakki} kullaniciya kadar</li>
                <li>
                  ·{' '}
                  {p.aylikTeklifHakki === null
                    ? 'Sinirsiz teklif'
                    : `Aylik ${p.aylikTeklifHakki} teklif`}
                </li>
                <li>· DWG metraj {p.dwgAktif ? 'dahil' : 'haric'}</li>
              </ul>

              <button
                type="button"
                disabled={secilen === p.surum.paketSurumuId}
                onClick={() => satinAl(p.surum.paketSurumuId)}
                className="mt-auto rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {secilen === p.surum.paketSurumuId ? 'Hazirlaniyor…' : 'Bu paketi sec'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
