'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PLAN 5.8 §4.4 — GERI DONUS EKRANI (K1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  "Giris sonrasi TEK ekran: 'Hesabiniz kapatildi. Verileriniz [tarih]
 *  tarihinde silinecek.' Uc secenek: Paket sec · Verilerimi indir (JSON) ·
 *  Cikis."
 *
 *  ⚠ `(protected)` ALTINDA DEGIL ve bu bilincli: o kabuk kenar cubugu,
 *  ekmek kirintisi ve pano baglantilari cizer — hepsi kapali hesapta 403
 *  doner. "TEK ekran" talimatinin karsiligi, calismayan baglantilarla dolu
 *  bir kabuk DEGILDIR. Oturum kontrolu bu yuzden burada, elle yapilir.
 *
 *  ⚠ BU SAYFA YALNIZ IZINLI UCLARI CAGIRIR (`@KapaliHesapIzinli`):
 *  `/auth/me` ve `/auth/hesabim/verilerim`. Baska bir uc cagirsaydi 403
 *  `HESAP_KAPALI` alir, `api.ts` yakalayicisi yeniden buraya yonlendirir ve
 *  sonsuz dongu olurdu (koltuk durdurma ekraninda ogrenilmis ders).
 *
 *  ⚠ VERI INDIRME `<a href>` ILE YAPILMAZ ve GOVDESI BURADA DEGIL:
 *  `ozellik/kimlik/verileri-indir.ts` (TEK yer, iki ekran ortak). Gerekce o
 *  dosyanin basliginda olculuyor — duz baglanti `Authorization` basligini
 *  TASIMAZ ve `next.config.js`te `/api` icin REWRITE YOK. 21.09'da
 *  `koltuk-durduruldu` ekranindaki kirik `<a href>` de ayni yardimciya
 *  baglandi; iki ekran kendi `fetch`ini yazsaydi biri gun gelir yine duz
 *  baglantiya donerdi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/ortak/lib/api';
import { gecerliTokenMi } from '@/ortak/lib/oturum';
import { verileriIndir } from '@/ozellik/kimlik/verileri-indir';
import { toast } from '@/ortak/hooks/use-toast';

/** Sunucunun `/auth/me` yanitindaki `kapali` alani (`kapali-hesap.ts`). */
type KapaliDurum = {
  kapali: boolean;
  tip: 'hesap' | 'firma' | null;
  imhaTarihi: string | null;
};

type Erisim = { uyari?: { baslik?: string; metin?: string } | null } | null;

export default function HesapKapaliSayfasi() {
  const router = useRouter();
  const [durum, setDurum] = useState<KapaliDurum | null>(null);
  const [erisim, setErisim] = useState<Erisim>(null);
  const [eposta, setEposta] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [indiriliyor, setIndiriliyor] = useState(false);

  const getir = useCallback(async () => {
    // ⚠ Oturum kontrolu ELLE: bu sayfa `(protected)` kabugunun disinda.
    // Bicim de sinanir — `"undefined"` dizgesi "token var" sayilmasin
    // (`oturum.ts` basligindaki olculmus kusur).
    if (!gecerliTokenMi(localStorage.getItem('token'))) {
      router.replace('/login');
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      setEposta(data?.email ?? null);
      setErisim(data?.erisim ?? null);
      const k = data?.kapali as KapaliDurum | undefined;
      // ⚠ ODEME SONRASI KENDILIGINDEN CIKIS: hesap geri acildiginda
      // (`deletedAt`/`imhaTarihi` temizlenir — ajan D) bir sonraki
      // `/auth/me` `kapali: false` doner ve kullanici panoya gider. Ekran
      // "yenile" demeye birakilsaydi musteri odemesini yaptiktan sonra da
      // "hesabiniz kapatildi" yazisina bakmaya devam ederdi.
      if (k && k.kapali === false) {
        router.replace('/dashboard');
        return;
      }
      setDurum(k ?? null);
    } catch {
      // ⚠ Sessiz DEGIL: yanit alinamazsa ekran en azindan tarihsiz cumleyi
      // yazar. `null` birakmak bos bir sayfa gosterirdi.
      setDurum({ kapali: true, tip: 'hesap', imhaTarihi: null });
    } finally {
      setYukleniyor(false);
    }
  }, [router]);

  useEffect(() => {
    void getir();
  }, [getir]);

  /**
   * KVKK m.11 — verileri JSON olarak indir. ODEMESIZ ve hesap KAPALIYKEN de
   * acik (`auth.controller.ts` `@KapaliHesapIzinli`).
   */
  async function verilerimi() {
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

  function cikis() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }

  // ⚠ CUMLE SUNUCUDAN GELIR (`kapali-hesap.ts` `kapaliHesapMetni`), burada
  // YAZILMAZ: ayni cumle 403 govdesinde de doner. Iki yerde ayri yazilsaydi
  // biri gunun birinde digerinden sapardi.
  const baslik = erisim?.uyari?.baslik ?? 'Hesabınız kapatıldı.';
  const aciklama = erisim?.uyari?.metin ?? '';
  const firmaKapandi = durum?.tip === 'firma';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
      {/* Marka blogu — giris/kayit ekranlariyla birebir ayni kabuk */}
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-2xl font-black text-white shadow-lg shadow-blue-500/30">
          M
        </div>
        <h1 className="flex items-center gap-0.5 text-2xl font-extrabold tracking-tight text-slate-900">
          MetaPrice<span className="text-blue-600">X</span>
        </h1>
      </div>

      <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        {yukleniyor ? (
          <div className="flex justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          </div>
        ) : (
          <>
            <h2 className="text-base font-bold leading-relaxed text-slate-900">
              {baslik}
            </h2>
            {aciklama && (
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {aciklama}
              </p>
            )}
            {eposta && (
              <p className="mt-3 truncate text-xs text-slate-500">{eposta}</p>
            )}

            <div className="mt-6 space-y-2.5">
              {/* ⚠ "Paket sec" YALNIZ kendi hesabini kapatana gosterilir.
                  Firmasi kapanan UYE paket secemez (K2: firmayi SAHIBI geri
                  acar) — dugme calismayan bir soz olurdu. */}
              {!firmaKapandi && (
                <button
                  type="button"
                  onClick={() => router.push('/abonelik')}
                  className="w-full rounded-xl bg-[#0B1528] px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-slate-800 active:scale-[0.99]"
                >
                  Paket seç
                </button>
              )}

              <button
                type="button"
                onClick={() => void verilerimi()}
                disabled={indiriliyor}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {indiriliyor ? 'Hazırlanıyor…' : 'Verilerimi indir (JSON)'}
              </button>

              <button
                type="button"
                onClick={cikis}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition-all hover:bg-slate-50"
              >
                Çıkış
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
