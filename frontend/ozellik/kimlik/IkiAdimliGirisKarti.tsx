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
 *
 *  23.09.2026 — Hesabim tasarimi: kart basligi durum rozeti ("Açık"/"Kapalı")
 *  ve sagda "Aç" dugmesiyle tek satir; kurulum adimlari basligin ALTINDA acilir.
 */
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import api from '@/ortak/lib/api';
import { cn } from '@/ortak/lib/utils';
import { kimlikHataMetni } from '@/ortak/lib/kimlik-hata-metinleri';
import { KurulumAnahtari } from './KurulumAnahtari';
import { KurtarmaKodlariEkrani } from './KurtarmaKodlariEkrani';
import { ANA_DUGME, GIRDI, IKINCIL_DUGME, TEHLIKE_DUGME } from './hesabim/hesabim-ui';

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

  /**
   * ── 23.09.2026: YONETICIDE KOD E-POSTAYA GELIR ──────────────────────────
   * `girisKarariSaf` yoneticiyi parola girisinde `acik` denetiminden ONCE
   * `mfa-eposta` dalina alir: telefon uygulamasi (TOTP) HIC sorulmaz
   * (`backend/.../mfa/mfa-karari.ts`). Kart eskisi gibi "Kapalı · Aç" deseydi
   * yonetici her giriste kod aldigi halde korumasiz oldugunu sanir, "Aç"a
   * basip hic kullanilmayacak bir uygulama kurardi.
   */
  const epostaKodu = mfa.zorunlulukNedeni === 'yonetici';
  const acikGorunur = epostaKodu || adim === 'acik' || adim === 'kodlar';

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
      // 23.09: profil HEMEN tazelenir ("Tamam"ı beklemez). Beklenseydi kişi
      // kodlar ekrandayken sayfayı yenilediğinde kart "Kapalı · Aç" der, "Aç"
      // `MFA_ZATEN_ACIK` hatası verirdi (kod incelemesi ölçtü).
      onYenile();
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
      onYenile(); // kalan kurtarma kodu sayısı hemen doğru olsun
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
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-gray-900">
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
        className={cn(GIRDI, 'max-w-xs tracking-widest')}
      />
    </div>
  );

  const aciklama = epostaKodu
    ? 'Yönetici hesabında her girişte e-posta adresinize 6 haneli bir kod gönderilir; telefon uygulaması kullanılmaz. Bu ayar değiştirilemez.'
    : adim === 'acik'
      ? `Girişte telefonunuzdaki doğrulama uygulamasının ürettiği kod istenir${
          mfa.acikAt ? ` · açılış ${new Date(mfa.acikAt).toLocaleDateString('tr-TR')}` : ''
        } · ${mfa.kalanKurtarmaKodu} kurtarma kodu kaldı.`
      : `Açtığınızda girişte parolanızın yanında telefonunuzdaki doğrulama uygulamasının ürettiği 6 haneli kod istenir.${
          mfa.zorunlu ? ' Firmanızda zorunlu kılınmıştır.' : ''
        }`;

  return (
    <section aria-labelledby="iki-adim-baslik" className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex flex-wrap items-start gap-3.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-slate-100 text-slate-700">
          <ShieldCheck className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 id="iki-adim-baslik" className="text-base font-semibold text-gray-900">
              İki adımlı giriş
            </h2>
            <span
              className={cn(
                'inline-flex h-[22px] items-center rounded-full px-2 text-xs font-semibold',
                acikGorunur ? 'bg-green-50 text-green-800' : 'bg-gray-100 text-gray-700',
              )}
            >
              {acikGorunur ? 'Açık' : 'Kapalı'}
            </span>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500">{aciklama}</p>
        </div>
        {!epostaKodu && adim === 'kapali' && (
          <button
            type="button"
            onClick={() => { temizle(); setAdim('parola'); }}
            className={ANA_DUGME}
          >
            Aç
          </button>
        )}
      </div>

      {!epostaKodu && adim !== 'kapali' && (
        <div className="mt-5 space-y-4 border-t border-[#eef0f3] pt-5">
          {adim === 'parola' && (
            <>
              <div>
                <label htmlFor="mfaParola" className="mb-1.5 block text-[13px] font-semibold text-gray-900">
                  Güvenlik için parolanızı yeniden girin
                </label>
                <input
                  id="mfaParola"
                  type="password"
                  autoComplete="current-password"
                  value={parola}
                  onChange={(e) => setParola(e.target.value)}
                  className={cn(GIRDI, 'max-w-sm')}
                />
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={mesgul} onClick={baslat} className={ANA_DUGME}>
                  Devam
                </button>
                <button
                  type="button"
                  onClick={() => { temizle(); setAdim('kapali'); }}
                  className={IKINCIL_DUGME}
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
              <button type="button" disabled={mesgul} onClick={onayla} className={ANA_DUGME}>
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
              {mfa.kaynak !== 'kisisel' && sirketGirisiVar && (
                <div className="space-y-3 rounded-[10px] border border-[#eef0f3] p-4">
                  <p className="text-[13px] text-gray-500">
                    Şirket hesabıyla girişte kod sorulmaz. Yine de sorulmasını
                    isterseniz aşağıdaki kodu girin.
                  </p>
                  {kodKutusu('mfaSirketKod', kod, setKod, 'Doğrulama kodu')}
                  <button type="button" disabled={mesgul} onClick={sirketGirisindeDeSor} className={IKINCIL_DUGME}>
                    Şirket girişinde de sor
                  </button>
                </div>
              )}

              <div className="space-y-3 rounded-[10px] border border-[#eef0f3] p-4">
                {kodKutusu('mfaYenileKod', kod, setKod, 'Kurtarma kodlarını yenilemek için doğrulama kodu')}
                <button type="button" disabled={mesgul} onClick={kodlariYenile} className={IKINCIL_DUGME}>
                  Kurtarma kodlarını yenile
                </button>
              </div>

              {mfa.zorunlu ? (
                <p className="rounded-[10px] border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-800">
                  Firmanızda iki adımlı giriş zorunlu kılınmış; kapatılamaz. Kaldırılması
                  için firma sahibinizle görüşün.
                </p>
              ) : (
                <div className="space-y-3 rounded-[10px] border border-[#eef0f3] p-4">
                  <p className="text-[13px] text-gray-500">
                    Kapatmak için parolanızı ya da bir doğrulama kodunu girin.
                    Kapattığınızda diğer cihazlardaki oturumlar kapanır.
                  </p>
                  <input
                    type="password"
                    autoComplete="current-password"
                    placeholder="Parolanız"
                    aria-label="Parolanız"
                    value={parola}
                    onChange={(e) => setParola(e.target.value)}
                    className={cn(GIRDI, 'max-w-sm')}
                  />
                  {kodKutusu('mfaKapatKod', kapatmaKodu, setKapatmaKodu, 'ya da doğrulama kodu')}
                  <button type="button" disabled={mesgul} onClick={kapat} className={TEHLIKE_DUGME}>
                    İki adımlı girişi kapat
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {hata && (
        <p role="alert" className="mt-4 rounded-[10px] border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
          {hata}
        </p>
      )}
      {bilgi && (
        <p role="status" className="mt-4 rounded-[10px] border border-emerald-200 bg-emerald-50 p-3 text-[13px] text-emerald-800">
          {bilgi}
        </p>
      )}
    </section>
  );
}
