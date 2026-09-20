'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F2b — GIRISIN IKINCI ADIMI: 6 HANELI KOD ya da KURTARMA KODU
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ TOKEN'I KENDISI YAZMAZ: basariyi `onOturum(data)` ile yukari verir ve
 *  yazimi sayfa `oturumuYaz` ile yapar. Gerekce olculmus bir kaynak
 *  kapisidir (`ortak/lib/oturum.test.ts`): `localStorage.setItem('token'`
 *  YALNIZ iki dosyada gecebilir.
 *
 *  ⚠ 401 → 1. ADIMA DON. Uc `KIMLIK_UCLARI`'nda oldugu icin `api.ts`
 *  yakalayicisi sayfayi yeniden YUKLEMEZ; donusu biz yapariz ve NEDENINI
 *  soyleriz ("Süre doldu").
 */
import { useState } from 'react';
import api from '@/ortak/lib/api';
import { kimlikHataMetni } from '@/ortak/lib/kimlik-hata-metinleri';

export function MfaKodAdimi({
  meydanOkuma,
  onOturum,
  onSuresiDoldu,
  onGeri,
}: {
  meydanOkuma: string;
  onOturum: (data: unknown) => void;
  onSuresiDoldu: (mesaj: string) => void;
  onGeri: () => void;
}) {
  const [kod, setKod] = useState('');
  const [kurtarmaKodu, setKurtarmaKodu] = useState('');
  const [kurtarmaModu, setKurtarmaModu] = useState(false);
  const [hata, setHata] = useState('');
  const [gonderiliyor, setGonderiliyor] = useState(false);

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setHata('');
    setGonderiliyor(true);
    try {
      const govde = kurtarmaModu
        ? { meydanOkuma, kurtarmaKodu: kurtarmaKodu.trim() }
        : { meydanOkuma, kod: kod.replace(/\s+/g, '') };
      const { data } = await api.post('/auth/mfa/dogrula', govde);
      onOturum(data);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        onSuresiDoldu('Süre doldu, lütfen yeniden giriş yapın.');
        return;
      }
      setHata(kimlikHataMetni(err));
    } finally {
      setGonderiliyor(false);
    }
  }

  return (
    <form onSubmit={gonder} className="space-y-4">
      <p className="text-xs text-slate-500">
        {kurtarmaModu
          ? 'Telefonunuza ulaşamıyorsanız kurtarma kodlarınızdan birini girin. Her kod bir kez kullanılır.'
          : 'Doğrulama uygulamanızdaki 6 haneli kodu girin.'}
      </p>

      {kurtarmaModu ? (
        <div>
          <label htmlFor="kurtarmaKodu" className="mb-1.5 block text-xs font-semibold text-slate-700">
            Kurtarma kodu
          </label>
          <input
            id="kurtarmaKodu"
            type="text"
            autoComplete="one-time-code"
            placeholder="ABCDE-FGHJK"
            value={kurtarmaKodu}
            onChange={(e) => setKurtarmaKodu(e.target.value)}
            required
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm tracking-widest text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          />
        </div>
      ) : (
        <div>
          <label htmlFor="mfaKod" className="mb-1.5 block text-xs font-semibold text-slate-700">
            Doğrulama kodu
          </label>
          <input
            id="mfaKod"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            placeholder="123456"
            value={kod}
            onChange={(e) => setKod(e.target.value)}
            required
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-center text-lg tracking-[0.4em] text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          />
        </div>
      )}

      {hata && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
          {hata}
        </p>
      )}

      <button
        type="submit"
        disabled={gonderiliyor}
        className="mt-2 w-full rounded-xl bg-[#0B1528] px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {gonderiliyor ? 'Doğrulanıyor…' : 'Doğrula'}
      </button>

      <div className="flex items-center justify-between text-[11px] font-semibold">
        <button
          type="button"
          onClick={() => { setKurtarmaModu(!kurtarmaModu); setHata(''); }}
          className="text-blue-600 hover:text-blue-700"
        >
          {kurtarmaModu ? 'Doğrulama kodu kullan' : 'Kurtarma kodu kullan'}
        </button>
        <button type="button" onClick={onGeri} className="text-slate-500 hover:text-slate-700">
          Geri
        </button>
      </div>
    </form>
  );
}
