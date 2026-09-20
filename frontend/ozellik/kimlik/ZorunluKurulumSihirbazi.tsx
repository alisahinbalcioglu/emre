'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F2b — ZORUNLU KURULUM SIHIRBAZI (girisin icinde)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Kullanici parolasini DOGRU girdi ama iki adimli giris ZORUNLU ve hesapta
 *  kurulu degil. Uygulamaya girmeden once kurmak zorunda.
 *
 *  ⚠ Uc adim: anahtar → kod → kurtarma kodlari. Kurtarma kodlari ekrani
 *  GECILEMEZ (onay kutusu) — bkz. `KurtarmaKodlariEkrani`.
 *
 *  ⚠ Token yazimi YUKARIDA (`onOturum`): kaynak kapisi geregi
 *  `localStorage.setItem('token'` bu dosyada GECMEZ.
 */
import { useEffect, useState } from 'react';
import api from '@/ortak/lib/api';
import { kimlikHataMetni } from '@/ortak/lib/kimlik-hata-metinleri';
import { KurulumAnahtari } from './KurulumAnahtari';
import { KurtarmaKodlariEkrani } from './KurtarmaKodlariEkrani';

type Adim = 'yukleniyor' | 'anahtar' | 'kodlar';

export function ZorunluKurulumSihirbazi({
  meydanOkuma,
  neden,
  onOturum,
  onSuresiDoldu,
}: {
  meydanOkuma: string;
  neden: 'yonetici' | 'firma' | null;
  /** Kurtarma kodlari okunduktan SONRA cagrilir. */
  onOturum: (data: unknown) => void;
  onSuresiDoldu: (mesaj: string) => void;
}) {
  const [adim, setAdim] = useState<Adim>('yukleniyor');
  const [kurulum, setKurulum] = useState<{ otpauthUri: string; elleAnahtar: string } | null>(null);
  const [kod, setKod] = useState('');
  const [kodlar, setKodlar] = useState<string[]>([]);
  const [oturumVerisi, setOturumVerisi] = useState<unknown>(null);
  const [hata, setHata] = useState('');
  const [gonderiliyor, setGonderiliyor] = useState(false);

  useEffect(() => {
    let iptal = false;
    (async () => {
      try {
        const { data } = await api.post('/auth/mfa/zorunlu-kurulum/baslat', { meydanOkuma });
        if (iptal) return;
        setKurulum(data);
        setAdim('anahtar');
      } catch (err: any) {
        if (iptal) return;
        if (err?.response?.status === 401) {
          onSuresiDoldu('Süre doldu, lütfen yeniden giriş yapın.');
          return;
        }
        setHata(kimlikHataMetni(err));
        setAdim('anahtar');
      }
    })();
    return () => { iptal = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meydanOkuma]);

  async function onayla(e: React.FormEvent) {
    e.preventDefault();
    setHata('');
    setGonderiliyor(true);
    try {
      const { data } = await api.post('/auth/mfa/zorunlu-kurulum/onayla', {
        meydanOkuma,
        kod: kod.replace(/\s+/g, ''),
      });
      setKodlar(Array.isArray(data?.kurtarmaKodlari) ? data.kurtarmaKodlari : []);
      setOturumVerisi(data);
      setAdim('kodlar');
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

  if (adim === 'kodlar') {
    return (
      <KurtarmaKodlariEkrani
        kodlar={kodlar}
        devamEtiketi="Devam et"
        onDevam={() => onOturum(oturumVerisi)}
      />
    );
  }

  return (
    <form onSubmit={onayla} className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-slate-900">İki adımlı girişi kuralım</h2>
        <p className="mt-1 text-xs text-slate-500">
          {neden === 'yonetici'
            ? 'Yönetici hesaplarında iki adımlı giriş zorunludur.'
            : 'Firmanızda iki adımlı giriş zorunlu kılınmış.'}{' '}
          Bir kez kurduktan sonra her girişte telefonunuzdaki 6 haneli kod istenecek.
        </p>
      </div>

      {adim === 'yukleniyor' && (
        <p className="text-xs text-slate-500">Kurulum hazırlanıyor…</p>
      )}

      {kurulum && (
        <KurulumAnahtari otpauthUri={kurulum.otpauthUri} elleAnahtar={kurulum.elleAnahtar} />
      )}

      {kurulum && (
        <div>
          <label htmlFor="zorunluKod" className="mb-1.5 block text-xs font-semibold text-slate-700">
            Uygulamadaki 6 haneli kod
          </label>
          <input
            id="zorunluKod"
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
        disabled={gonderiliyor || !kurulum}
        className="w-full rounded-xl bg-[#0B1528] px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {gonderiliyor ? 'Doğrulanıyor…' : 'Kurulumu tamamla'}
      </button>
    </form>
  );
}
