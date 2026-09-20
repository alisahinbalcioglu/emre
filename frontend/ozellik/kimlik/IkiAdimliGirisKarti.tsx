'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F2b — PROFIL › IKI ADIMLI GIRIS KARTI (§6.7)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ BU KART HICBIR DURUMDA OTURUMU DUSURMEZ. Arkasindaki uclarin hepsi
 *  yanlis parola/kodda **400** doner (401 degil) — `api.ts:36-52`
 *  yakalayicisi 401 goren her istekte kullaniciyi disari atardi ve "kodu
 *  yanlis yazdim" diye uygulamadan atilmak kullanicinin hatasini
 *  cezalandirmak olurdu.
 *
 *  ⚠ ACARKEN PAROLA ISTENIR (R1-Y1): calinmis bir oturum tek basina iki
 *  adimli giris KURAMAZ — kurabilseydi gercek sahibini hesabindan kilitlerdi.
 *
 *  ⚠ TOKEN YAZIMI: `mfa/kurulum/onayla` ve `mfa/kapat` TAZE token doner
 *  (damga yuzunden). Yazimi cagiran sayfa yapar (`onTokenTazele`) — kaynak
 *  kapisi geregi `localStorage.setItem('token'` bu dosyada GECMEZ.
 */
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import api from '@/ortak/lib/api';
import { kimlikHataMetni } from '@/ortak/lib/kimlik-hata-metinleri';
import { KurulumAnahtari } from './KurulumAnahtari';
import { KurtarmaKodlariEkrani } from './KurtarmaKodlariEkrani';

export type MfaDurumu = {
  acik: boolean;
  acikAt: string | null;
  kaynak: string | null;
  kalanKurtarmaKodu: number;
  zorunlu: boolean;
  zorunlulukNedeni: 'yonetici' | 'firma' | null;
};

type Adim = 'kapali' | 'parola' | 'anahtar' | 'kodlar' | 'acik';

export function IkiAdimliGirisKarti({
  mfa,
  sirketGirisiVar = false,
  onTokenTazele,
  onYenile,
}: {
  mfa: MfaDurumu;
  /** F3b: firmanin kurumsal girisi varsa "Sirket girisinde de sor" gorunur. */
  sirketGirisiVar?: boolean;
  onTokenTazele: (token: unknown) => void;
  onYenile: () => void;
}) {
  const [adim, setAdim] = useState<Adim>(mfa.acik ? 'acik' : 'kapali');
  const [parola, setParola] = useState('');
  const [kod, setKod] = useState('');
  const [kapatmaKodu, setKapatmaKodu] = useState('');
  const [kurulum, setKurulum] = useState<{ otpauthUri: string; elleAnahtar: string } | null>(null);
  const [kodlar, setKodlar] = useState<string[]>([]);
  const [hata, setHata] = useState('');
  const [bilgi, setBilgi] = useState('');
  const [mesgul, setMesgul] = useState(false);

  function temizle() {
    setHata('');
    setBilgi('');
  }

  async function calistir(fn: () => Promise<void>) {
    temizle();
    setMesgul(true);
    try {
      await fn();
    } catch (err) {
      setHata(kimlikHataMetni(err));
    } finally {
      setMesgul(false);
    }
  }

  const baslat = () =>
    calistir(async () => {
      const { data } = await api.post('/auth/mfa/kurulum/baslat', { parola });
      setKurulum(data);
      setParola('');
      setAdim('anahtar');
    });

  const onayla = () =>
    calistir(async () => {
      const { data } = await api.post('/auth/mfa/kurulum/onayla', {
        kod: kod.replace(/\s+/g, ''),
      });
      onTokenTazele(data?.token);
      setKodlar(Array.isArray(data?.kurtarmaKodlari) ? data.kurtarmaKodlari : []);
      setKod('');
      setAdim('kodlar');
    });

  const kapat = () =>
    calistir(async () => {
      const govde = kapatmaKodu.replace(/\s+/g, '').length === 6
        ? { kod: kapatmaKodu.replace(/\s+/g, '') }
        : { parola };
      const { data } = await api.post('/auth/mfa/kapat', govde);
      onTokenTazele(data?.token);
      setParola('');
      setKapatmaKodu('');
      setAdim('kapali');
      onYenile();
    });

  const kodlariYenile = () =>
    calistir(async () => {
      const { data } = await api.post('/auth/mfa/kurtarma-kodlari/yenile', {
        kod: kod.replace(/\s+/g, ''),
      });
      setKodlar(Array.isArray(data?.kurtarmaKodlari) ? data.kurtarmaKodlari : []);
      setKod('');
      setAdim('kodlar');
    });

  const sirketGirisindeDeSor = () =>
    calistir(async () => {
      await api.post('/auth/mfa/sirket-girisinde-de-sor', { kod: kod.replace(/\s+/g, '') });
      setKod('');
      setBilgi('Şirket hesabıyla girişte de kod sorulacak.');
      onYenile();
    });

  const kodKutusu = (id: string, deger: string, yaz: (v: string) => void, etiket: string) => (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-slate-700">
        {etiket}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        placeholder="123456"
        value={deger}
        onChange={(e) => yaz(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm tracking-widest text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-none"
      />
    </div>
  );

  return (
    <div className="mb-6 rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2 border-b px-5 py-3.5 text-sm font-semibold">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        İki adımlı giriş
      </div>

      <div className="space-y-4 px-5 py-4">
        {adim === 'kapali' && (
          <>
            <p className="text-xs text-muted-foreground">
              Açtığınızda girişte parolanızın yanında telefonunuzdaki doğrulama
              uygulamasının ürettiği 6 haneli kod istenir.
              {mfa.zorunlu && (
                <>
                  {' '}
                  <strong>
                    {mfa.zorunlulukNedeni === 'yonetici'
                      ? 'Yönetici hesaplarında zorunludur.'
                      : 'Firmanızda zorunlu kılınmıştır.'}
                  </strong>
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => { temizle(); setAdim('parola'); }}
              className="rounded-lg bg-[#0B1528] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Aç
            </button>
          </>
        )}

        {adim === 'parola' && (
          <>
            <p className="text-xs text-muted-foreground">
              Güvenlik için parolanızı yeniden girin.
            </p>
            <div>
              <label htmlFor="mfaParola" className="mb-1.5 block text-xs font-semibold text-slate-700">
                Parolanız
              </label>
              <input
                id="mfaParola"
                type="password"
                autoComplete="current-password"
                value={parola}
                onChange={(e) => setParola(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={mesgul}
                onClick={baslat}
                className="rounded-lg bg-[#0B1528] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                Devam
              </button>
              <button
                type="button"
                onClick={() => { temizle(); setAdim('kapali'); }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Vazgeç
              </button>
            </div>
          </>
        )}

        {adim === 'anahtar' && kurulum && (
          <>
            <KurulumAnahtari otpauthUri={kurulum.otpauthUri} elleAnahtar={kurulum.elleAnahtar} />
            {kodKutusu('mfaKurulumKod', kod, setKod, 'Uygulamadaki 6 haneli kod')}
            <button
              type="button"
              disabled={mesgul}
              onClick={onayla}
              className="rounded-lg bg-[#0B1528] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              Kurulumu tamamla
            </button>
          </>
        )}

        {adim === 'kodlar' && (
          <KurtarmaKodlariEkrani
            kodlar={kodlar}
            devamEtiketi="Tamam"
            onDevam={() => { setAdim('acik'); onYenile(); }}
          />
        )}

        {adim === 'acik' && (
          <>
            <p className="text-xs text-muted-foreground">
              <strong>Açık</strong>
              {mfa.acikAt ? ` · ${new Date(mfa.acikAt).toLocaleDateString('tr-TR')}` : ''}
              {` · ${mfa.kalanKurtarmaKodu} kurtarma kodu kaldı`}
            </p>

            {mfa.kaynak !== 'kisisel' && sirketGirisiVar && (
              <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-muted-foreground">
                  Şirket hesabıyla girişte kod sorulmaz. Yine de sorulmasını
                  isterseniz aşağıdaki kodu girin.
                </p>
                {kodKutusu('mfaSirketKod', kod, setKod, 'Doğrulama kodu')}
                <button
                  type="button"
                  disabled={mesgul}
                  onClick={sirketGirisindeDeSor}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
                >
                  Şirket girişinde de sor
                </button>
              </div>
            )}

            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              {kodKutusu('mfaYenileKod', kod, setKod, 'Kurtarma kodlarını yenilemek için doğrulama kodu')}
              <button
                type="button"
                disabled={mesgul}
                onClick={kodlariYenile}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
              >
                Kurtarma kodlarını yenile
              </button>
            </div>

            {mfa.zorunlu ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                {mfa.zorunlulukNedeni === 'yonetici'
                  ? 'Yönetici hesaplarında iki adımlı giriş zorunludur; kapatılamaz.'
                  : 'Firmanızda iki adımlı giriş zorunlu kılınmış; kapatmak için firma sahibinizle görüşün.'}
              </p>
            ) : (
              <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-muted-foreground">
                  Kapatmak için parolanızı ya da bir doğrulama kodunu girin.
                  Kapattığınızda diğer cihazlardaki oturumlar kapanır.
                </p>
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="Parolanız"
                  value={parola}
                  onChange={(e) => setParola(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
                {kodKutusu('mfaKapatKod', kapatmaKodu, setKapatmaKodu, 'ya da doğrulama kodu')}
                <button
                  type="button"
                  disabled={mesgul}
                  onClick={kapat}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  İki adımlı girişi kapat
                </button>
              </div>
            )}
          </>
        )}

        {hata && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            {hata}
          </p>
        )}
        {bilgi && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800">
            {bilgi}
          </p>
        )}
      </div>
    </div>
  );
}
