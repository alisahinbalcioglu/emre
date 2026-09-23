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
import { useEffect, useRef, useState } from 'react';
import api from '@/ortak/lib/api';
import { kimlikHataMetni } from '@/ortak/lib/kimlik-hata-metinleri';

export function MfaKodAdimi({
  meydanOkuma,
  yontem = 'uygulama',
  onOturum,
  onSuresiDoldu,
  onGeri,
}: {
  meydanOkuma: string;
  /**
   * 23.09.2026 (Emre karari) — kod NEREDEN geliyor.
   * ⚠ VARSAYILAN `uygulama`: propu gecirmeyi unutan bir cagiran eski
   *   davranisi alir, e-posta akisini YANLISLIKLA acmaz.
   */
  yontem?: 'uygulama' | 'eposta';
  onOturum: (data: unknown) => void;
  onSuresiDoldu: (mesaj: string) => void;
  onGeri: () => void;
}) {
  const epostaYolu = yontem === 'eposta';
  const [kod, setKod] = useState('');
  const [kurtarmaKodu, setKurtarmaKodu] = useState('');
  const [kurtarmaModu, setKurtarmaModu] = useState(false);
  const [hata, setHata] = useState('');
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [kodIsteniyor, setKodIsteniyor] = useState(false);
  const [bilgi, setBilgi] = useState('');

  /**
   * ⚠⚠ KODU ISTEYEN CAGRI BURADA — "mekanizma var, baglanti yok" riski.
   *   Sunucu giris yanitinda YALNIZ meydan okumayi doner; kodu URETMEZ ve
   *   POSTALAMAZ (oturum kapisi posta servisine bagimli olmasin diye). Bu
   *   cagri olmazsa ekran acilir, kullanici bekler ve HICBIR SEY gelmez.
   *   Kapi bu baglantiyi ayrica olcuyor.
   *
   * ⚠ `useRef` KILIDI: React 18 gelistirme kipinde efektler IKI KEZ kosar;
   *   kilit olmasaydi her acilista iki kod uretilir, ilki aninda
   *   gecersizlesirdi — kullanici eline gecen ilk kodu girip "hatali" yerdi.
   */
  const istendi = useRef(false);
  useEffect(() => {
    if (!epostaYolu || istendi.current) return;
    istendi.current = true;
    void kodIste(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epostaYolu]);

  async function kodIste(ilk = false) {
    setKodIsteniyor(true);
    setHata('');
    try {
      await api.post('/auth/mfa/eposta/gonder', { meydanOkuma });
      setBilgi(ilk ? 'Kod e-postanıza gönderildi.' : 'Yeni kod gönderildi.');
    } catch (err: any) {
      if (err?.response?.status === 401) {
        onSuresiDoldu('Süre doldu, lütfen yeniden giriş yapın.');
        return;
      }
      setBilgi('');
      setHata(kimlikHataMetni(err));
    } finally {
      setKodIsteniyor(false);
    }
  }

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
        {epostaYolu
          ? 'E-posta adresinize gönderdiğimiz 6 haneli kodu girin. Gelmediyse spam klasörünü de kontrol edin.'
          : kurtarmaModu
            ? 'Telefonunuza ulaşamıyorsanız kurtarma kodlarınızdan birini girin. Her kod bir kez kullanılır.'
            : 'Doğrulama uygulamanızdaki 6 haneli kodu girin.'}
      </p>

      {kurtarmaModu && !epostaYolu ? (
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

      {bilgi && !hata && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800">
          {bilgi}
        </p>
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
        {epostaYolu ? (
          /* ⚠ KURTARMA KODU SECENEGI E-POSTA YOLUNDA GOSTERILMEZ: bu
             hesapta kurtarma kodu URETILMEDI (kurulum adimi yok), yani
             dugme kullaniciyi asla ilerleyemeyecegi bir ekrana gotururdu. */
          <button
            type="button"
            onClick={() => void kodIste()}
            disabled={kodIsteniyor}
            className="text-blue-600 hover:text-blue-700 disabled:opacity-50"
          >
            {kodIsteniyor ? 'Gönderiliyor…' : 'Kodu yeniden gönder'}
          </button>
        ) : (
        <button
          type="button"
          onClick={() => { setKurtarmaModu(!kurtarmaModu); setHata(''); }}
          className="text-blue-600 hover:text-blue-700"
        >
          {kurtarmaModu ? 'Doğrulama kodu kullan' : 'Kurtarma kodu kullan'}
        </button>
        )}
        <button type="button" onClick={onGeri} className="text-slate-500 hover:text-slate-700">
          Geri
        </button>
      </div>
    </form>
  );
}
