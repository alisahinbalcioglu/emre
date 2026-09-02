'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/ortak/lib/api';
import { useCapabilities } from '@/ortak/contexts/CapabilitiesContext';
import { KAPSAM_ETIKET, SEVIYE_ETIKET, vitrinFiyati, type Paket } from '@/ozellik/odeme/paket-bicim';
import {
  ALAN_ETIKET,
  ZORUNLU_ALANLAR,
  bosFaturaKimligi,
  eksikAlanlar,
  govdeyeCevir,
  type FaturaKimligi,
} from '@/ozellik/odeme/fatura-kimligi';
import { IyzicoFormu } from '@/ozellik/odeme/IyzicoFormu';
import {
  bicimle as telefonBicimle,
  haneleriAl as telefonHaneleri,
  telefonHatasi,
} from '@/ozellik/odeme/telefon-bicim';

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
  const [faturaAcik, setFaturaAcik] = useState(false);
  const [fatura, setFatura] = useState<FaturaKimligi>(bosFaturaKimligi());
  const [gonderiliyor, setGonderiliyor] = useState(false);

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

  /**
   * Paket secildi — ONCE fatura kimligi toplanir, SONRA kart formu acilir.
   *
   * ⚠ 02.09'DA OLCULDU: burasi dogrudan `/abonelik/basla`ya YALNIZ
   * `paketSurumuId` gonderiyordu. Sunucu `p.musteri.ad` diye acıyor ve
   * TypeError firlatiyordu → 500 → ekranda "Odeme baslatilamadi". Yani
   * HICBIR musteri odeme yapamiyordu. Fatura alanlari iyzico tarafinda
   * zorunlu; sunucuda otomatik doldurulamiyor cunku `Firma` semasinda
   * TELEFON alani hic yok.
   */
  function paketiSec(paketSurumuId: string) {
    setHata(null);
    setSecilen(paketSurumuId);
    setFaturaAcik(true);
  }

  async function odemeyeGec() {
    if (!secilen) return;
    const eksik = eksikAlanlar(fatura);
    if (eksik.length) {
      setHata(`Su alanlar zorunlu: ${eksik.join(', ')}`);
      return;
    }
    // Bicim hatasi AYRI mesaj alir: "eksik" ile "yarim" ayni sey degil.
    const telHata = telefonHatasi(fatura.telefon);
    if (telHata) {
      setHata(telHata);
      return;
    }
    setHata(null);
    setGonderiliyor(true);
    try {
      const { data } = await api.post<{ formIcerigi: string }>('/abonelik/basla', {
        paketSurumuId: secilen,
        musteri: govdeyeCevir(fatura),
      });
      setFormHtml(data.formIcerigi);
    } catch (e: any) {
      const m = e?.response?.data?.message ?? e?.response?.data?.mesaj;
      setHata(typeof m === 'string' ? m : 'Odeme baslatilamadi.');
    } finally {
      setGonderiliyor(false);
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

  // ── Fatura kimligi adimi (kart formundan ONCE) ──────────────────────
  // iyzico abonelik formu bu alanlari ZORUNLU tutar. `Firma` semasinda
  // telefon alani olmadigi icin sunucu tarafinda otomatik doldurulamaz.
  if (faturaAcik && !formHtml) {
    const secilenPaket = paketler.find((p) => p.surum.paketSurumuId === secilen);
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-1 text-2xl font-bold">Fatura bilgileri</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {secilenPaket ? `${secilenPaket.ad} — ` : ''}
          Faturanizin kesilebilmesi icin bu bilgiler gerekli. Kart bilgisi bir
          sonraki adimda, dogrudan iyzico formunda alinir.
        </p>

        {hata && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {hata}
          </div>
        )}

        <div className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2">
          {ZORUNLU_ALANLAR.map((alan) => (
            <div key={alan} className={alan === 'adres' ? 'sm:col-span-2' : ''}>
              <label htmlFor={`fatura-${alan}`} className="mb-1 block text-xs font-medium">
                {ALAN_ETIKET[alan]} <span className="text-red-600">*</span>
              </label>
              <input
                id={`fatura-${alan}`}
                type={alan === 'eposta' ? 'email' : alan === 'telefon' ? 'tel' : 'text'}
                value={alan === 'telefon' ? telefonBicimle(fatura.telefon) : fatura[alan]}
                onChange={(e) =>
                  setFatura({
                    ...fatura,
                    // ⚠ Telefonda durumda MASKELI METIN DEGIL, YALNIZ HANELER
                    // tutulur. Maske daima "+90 " ile basladigi icin maskeli
                    // metni saklasaydik BOS alan DOLU gorunur ve zorunlu-alan
                    // kapisi (`eksikAlanlar`, bos-dize kontrolu) sessizce
                    // delinirdi.
                    [alan]:
                      alan === 'telefon'
                        ? telefonHaneleri(e.target.value)
                        : e.target.value,
                  })
                }
                placeholder={
                  alan === 'telefon'
                    ? '+90 (5xx) (xxx) (xx) (xx)'
                    : alan === 'kimlikNo'
                      ? '11 haneli TC veya vergi no'
                      : undefined
                }
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
          ))}
          <div>
            <label htmlFor="fatura-postaKodu" className="mb-1 block text-xs font-medium">
              {ALAN_ETIKET.postaKodu}{' '}
              <span className="text-muted-foreground">(istege bagli)</span>
            </label>
            <input
              id="fatura-postaKodu"
              type="text"
              value={fatura.postaKodu ?? ''}
              onChange={(e) => setFatura({ ...fatura, postaKodu: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => {
              setFaturaAcik(false);
              setSecilen(null);
              setHata(null);
            }}
            className="rounded-lg border px-4 py-2 text-sm font-medium"
          >
            Geri
          </button>
          <button
            type="button"
            disabled={gonderiliyor}
            onClick={odemeyeGec}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {gonderiliyor ? 'Hazirlaniyor…' : 'Odemeye gec'}
          </button>
        </div>
      </div>
    );
  }

  // ── Kart formu acildiysa yalniz onu goster ──────────────────────────
  if (formHtml) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-1 text-2xl font-bold">Odeme</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Kart bilgileriniz dogrudan iyzico'ya iletilir, sunucularimiza kaydedilmez.
        </p>
        {/*
          ⚠ `dangerouslySetInnerHTML` KULLANILAMAZ. 02.09'da olculdu: bu ekran
          bombos kaliyordu. HTML spesifikasyonu geregi `innerHTML` ile eklenen
          `<script>` ASLA YURUTULMEZ; iyzico'nun donen icerigi ise neredeyse
          tamamen bir betiktir — formu o cizer. `IyzicoFormu` betikleri
          `createElement` ile YENIDEN uretir, boylece calisirlar.
        */}
        <IyzicoFormu html={formHtml} />
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
                onClick={() => paketiSec(p.surum.paketSurumuId)}
                className="mt-auto rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Bu paketi sec
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
