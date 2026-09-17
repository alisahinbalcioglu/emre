'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/ortak/lib/api';
import { kimlikHataMetni } from '@/ortak/lib/kimlik-hata-metinleri';
import { koltukSayaciMetni } from '@/ozellik/firma/ekip/koltuk-metinleri';

/**
 * FAZ 7 F1b — EKIP SAYFASI (§6.5).
 *
 * ⚠ `sahipMi` FAIL-CLOSED: `me?.firmaRol === 'sahip'`. `profile/page.tsx`teki
 * eski `(firmaRol ?? 'sahip') === 'sahip'` deseni KOPYALANMADI — alan
 * yanittan dustugunde herkesi sahip sayardi (ayni tur icinde o satir da
 * duzeltildi).
 *
 * ⚠ KOLTUK/YETENEK KARARI ON YUZDE YENIDEN HESAPLANMAZ: sunucu
 * `davet: { acik, nedenKodu }` doner ve metin sozlukten cikar. Ikiz karar,
 * bu depoda olculmus bir hata sinifidir (`erisim-durumu.ts`).
 *
 * ⚠ Sayfa `ErisimGuard` arkasinda DEGIL: odemesi geciken firma listeyi gorur,
 * davet dugmesi sunucu nedeniyle kapalidir.
 */

type Uye = {
  id: string;
  eposta: string;
  ad: string | null;
  soyad: string | null;
  firmaRol: 'sahip' | 'uye';
  durum: string;
  katildi: string;
  durduruldu: boolean;
};

type Davet = {
  id: string;
  eposta: string;
  sonGecerlilik: string;
  gonderimSayisi: number;
};

type EkipYaniti = {
  koltuk: { aktif: number; bekleyen: number; hak: number | null; durdurulan: number };
  uyeler: Uye[];
  bekleyenDavetler: Davet[];
  davet: { acik: boolean; nedenKodu: string | null };
};

const gorunenAd = (u: Uye) =>
  [u.ad, u.soyad].filter(Boolean).join(' ').trim() || u.eposta;

export default function EkipSayfasi() {
  const [veri, setVeri] = useState<EkipYaniti | null>(null);
  const [firmaRol, setFirmaRol] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const [davetEpostasi, setDavetEpostasi] = useState('');
  const [cikarilan, setCikarilan] = useState<Uye | null>(null);
  const [cikarmaOnayi, setCikarmaOnayi] = useState('');
  const [islemde, setIslemde] = useState(false);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    try {
      const [ekip, me] = await Promise.all([
        api.get('/firma/uyeler'),
        api.get('/auth/me'),
      ]);
      setVeri(ekip.data);
      setFirmaRol(me.data?.firmaRol ?? null);
      setHata(null);
    } catch (e) {
      setHata(kimlikHataMetni(e, 'Ekip bilgisi alınamadı.'));
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => {
    void yukle();
  }, [yukle]);

  const sahipMi = firmaRol === 'sahip';

  async function calistir(fn: () => Promise<unknown>, basariMetni: string) {
    setIslemde(true);
    setHata(null);
    setBilgi(null);
    try {
      await fn();
      setBilgi(basariMetni);
      await yukle();
    } catch (e) {
      setHata(kimlikHataMetni(e));
    } finally {
      setIslemde(false);
    }
  }

  if (yukleniyor) return <div className="p-6 text-slate-400">Yükleniyor…</div>;
  if (!veri) {
    return (
      <div className="p-6">
        <p className="text-red-400">{hata ?? 'Ekip bilgisi alınamadı.'}</p>
      </div>
    );
  }

  const { sayac, uyari } = koltukSayaciMetni(veri.koltuk);
  const davetKapaliMetni = veri.davet.nedenKodu
    ? kimlikHataMetni({ response: { data: { kod: veri.davet.nedenKodu } } })
    : null;

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-100">Ekip</h1>
        <p className="mt-1 text-sm text-slate-400">{sayac}</p>
        {uyari && (
          <p className="mt-2 rounded border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-sm text-amber-300">
            {uyari}
          </p>
        )}
      </header>

      {hata && <p className="rounded bg-red-950/50 px-3 py-2 text-sm text-red-300">{hata}</p>}
      {bilgi && <p className="rounded bg-emerald-950/50 px-3 py-2 text-sm text-emerald-300">{bilgi}</p>}

      {/* ── DAVET FORMU (yalnız sahip) ───────────────────────────────── */}
      {sahipMi && (
        <section className="rounded border border-slate-800 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Ekibe davet et</h2>
          {veri.davet.acik ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void calistir(
                  () => api.post('/firma/davetler', { eposta: davetEpostasi }),
                  'Davet gönderildi.',
                ).then(() => setDavetEpostasi(''));
              }}
            >
              <input
                type="email"
                required
                value={davetEpostasi}
                onChange={(e) => setDavetEpostasi(e.target.value)}
                placeholder="ekip@firma.com"
                className="flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              />
              <button
                type="submit"
                disabled={islemde}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Davet gönder
              </button>
            </form>
          ) : (
            /* ⚠ Metin SUNUCUNUN neden kodundan gelir; ön yüz karar vermez. */
            <p className="text-sm text-slate-400">{davetKapaliMetni}</p>
          )}
        </section>
      )}

      {/* ── ÜYE LİSTESİ ───────────────────────────────────────────────── */}
      <section className="rounded border border-slate-800">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-800 text-left text-slate-400">
            <tr>
              <th className="px-4 py-2">Kişi</th>
              <th className="px-4 py-2">Rol</th>
              <th className="px-4 py-2">Katıldı</th>
              <th className="px-4 py-2">Durum</th>
              {sahipMi && <th className="px-4 py-2 text-right">İşlem</th>}
            </tr>
          </thead>
          <tbody>
            {veri.uyeler.map((u) => (
              <tr key={u.id} className="border-b border-slate-900">
                <td className="px-4 py-2 text-slate-200">
                  {gorunenAd(u)}
                  <span className="ml-2 text-xs text-slate-500">{u.eposta}</span>
                </td>
                <td className="px-4 py-2 text-slate-300">
                  {u.firmaRol === 'sahip' ? 'Sahip' : 'Üye'}
                </td>
                <td className="px-4 py-2 text-slate-400">
                  {new Date(u.katildi).toLocaleDateString('tr-TR')}
                </td>
                <td className="px-4 py-2">
                  {u.durduruldu ? (
                    <span className="rounded bg-amber-900/60 px-2 py-0.5 text-xs text-amber-300">
                      Durduruldu (paket sınırı)
                    </span>
                  ) : u.durum === 'banned' ? (
                    <span className="text-xs text-red-400">Askıda</span>
                  ) : (
                    <span className="text-xs text-emerald-400">Etkin</span>
                  )}
                </td>
                {sahipMi && (
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      disabled={islemde}
                      onClick={() =>
                        void calistir(
                          () =>
                            api.patch(`/firma/uyeler/${u.id}/rol`, {
                              firmaRol: u.firmaRol === 'sahip' ? 'uye' : 'sahip',
                            }),
                          'Rol güncellendi.',
                        )
                      }
                      className="mr-3 text-xs text-blue-400 hover:underline disabled:opacity-50"
                    >
                      {u.firmaRol === 'sahip' ? 'Üye yap' : 'Sahip yap'}
                    </button>
                    <button
                      type="button"
                      disabled={islemde}
                      onClick={() => {
                        setCikarilan(u);
                        setCikarmaOnayi('');
                      }}
                      className="text-xs text-red-400 hover:underline disabled:opacity-50"
                    >
                      Ekipten çıkar
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ── BEKLEYEN DAVETLER (yalnız sahip) ──────────────────────────── */}
      {sahipMi && veri.bekleyenDavetler.length > 0 && (
        <section className="rounded border border-slate-800 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Bekleyen davetler</h2>
          <ul className="space-y-2">
            {veri.bekleyenDavetler.map((d) => (
              <li key={d.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-300">
                  {d.eposta}
                  <span className="ml-2 text-xs text-slate-500">
                    son gün {new Date(d.sonGecerlilik).toLocaleDateString('tr-TR')}
                  </span>
                </span>
                <span>
                  <button
                    type="button"
                    disabled={islemde}
                    onClick={() =>
                      void calistir(
                        () => api.post(`/firma/davetler/${d.id}/yeniden-gonder`),
                        'Davet yeniden gönderildi.',
                      )
                    }
                    className="mr-3 text-xs text-blue-400 hover:underline disabled:opacity-50"
                  >
                    Yeniden gönder
                  </button>
                  <button
                    type="button"
                    disabled={islemde}
                    onClick={() =>
                      void calistir(
                        () => api.delete(`/firma/davetler/${d.id}`),
                        'Davet iptal edildi.',
                      )
                    }
                    className="text-xs text-red-400 hover:underline disabled:opacity-50"
                  >
                    İptal et
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!sahipMi && (
        <p className="text-sm text-slate-400">
          Ekibi firma sahibi yönetir. Ekipten ayrılmak için{' '}
          <a href="/profile#hesabi-kapat" className="text-blue-400 hover:underline">
            Hesabım → Hesabımı kapat
          </a>{' '}
          adımını kullanın.
        </p>
      )}

      {/* ── ÇIKARMA ONAY DİYALOĞU ─────────────────────────────────────── */}
      {cikarilan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded border border-slate-700 bg-slate-900 p-5">
            <h3 className="text-sm font-semibold text-slate-100">Üyeyi ekipten çıkar</h3>
            <p className="mt-2 text-sm text-slate-400">
              {gorunenAd(cikarilan)} ekipten çıkarılacak ve hesabına erişim kapanacak.
              Hazırladığı teklifler firmada kalır ve &quot;ayrıldı&quot; notuyla görünür.
            </p>
            <p className="mt-3 text-xs text-slate-400">
              Onaylamak için üyenin e-posta adresini yazın:{' '}
              <span className="text-slate-200">{cikarilan.eposta}</span>
            </p>
            <input
              value={cikarmaOnayi}
              onChange={(e) => setCikarmaOnayi(e.target.value)}
              className="mt-2 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCikarilan(null)}
                className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-300"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={islemde}
                onClick={() => {
                  const hedef = cikarilan;
                  setCikarilan(null);
                  void calistir(
                    () =>
                      api.delete(`/firma/uyeler/${hedef.id}`, {
                        data: { epostaOnayi: cikarmaOnayi },
                      }),
                    'Üye ekipten çıkarıldı.',
                  );
                }}
                className="rounded bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                Ekipten çıkar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
