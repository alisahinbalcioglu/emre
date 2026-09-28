'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Building2, CheckCircle2, Clock, Lock, ShieldAlert } from 'lucide-react';
import api from '@/ortak/lib/api';
import { kurumsalGirisiBaslat } from '@/ozellik/kimlik/kurumsal-baslat';
import { oturumuYaz, girisSonrasiYol, girisDaliCoz, type GirisDali } from '@/ortak/lib/oturum';
import { GirisDaliEkrani } from '@/ozellik/kimlik/GirisDaliEkrani';
import { KIMLIK_HATA_METINLERI, kimlikHataMetni } from '@/ortak/lib/kimlik-hata-metinleri';
import {
  ULASILAMADI_METNI,
  davetBilgiHataDurumu,
  davetHataMetni,
  gecerlilikMetni,
  girisBaglantisiGosterilirMi,
  hataKodu,
} from '@/ozellik/kimlik/davet-kabul-kurallari';
import { ParolaAlani } from '@/ortak/ui/parola-alani';
import { KimlikKabugu, KimlikDugmesi } from '@/ortak/ui/kimlik-kabugu';
/**
 * ⚠ ELLE YAZILAN 8 KALDIRILDI (Gorunur kusurlar turu, 21.09). Bu dosyanin
 * eski yorumu kusuru ZATEN tespit etmisti: "register/page.tsx hâlâ 6 yaziyor
 * — sunucuyla uyumsuz". Artik uc ekran da AYNI sabiti okuyor ve sabitin
 * sunucudakiyle esitligini `npm run test:parola-kapisi` kapisi olcuyor.
 */
import { PAROLA_IPUCU, PAROLA_MIN } from '@/ortak/lib/parola-kurali';

/**
 * FAZ 7 F1b — DAVET KABUL (§6.4). HERKESE AÇIK sayfa (giriş yapmamış kişi).
 *
 * ⚠ `noindex`: davet bağlantısı kişiye özeldir; arama motoru indekslememeli.
 * Sayfa `HERKESE_ACIK_SAYFALAR`a EKLENMEZ ve sitemap'te görünmez.
 *
 * ⚠ Token URL'den okunur ve `replaceState` ile adres çubuğundan SİLİNİR:
 * ekran görüntüsü, tarayıcı geçmişi ve `Referer` başlığı token'ı taşımasın.
 *
 * ── 27.09.2026 YENİDEN TASARIM (Emre: "ekran tasarımı çok kötü") ──────────
 * Sayfa koyu tema sınıflarıyla yazılmıştı (`text-slate-100` başlık,
 * `bg-slate-950` girdi, `bg-red-950/50` + `text-red-300` hata) ama AÇIK zeminde
 * çiziliyordu: başlık 1,10:1, hata kutusu 1,78:1 kontrastla okunmuyordu.
 * 26.09 canlı vakada sunucu `BASKA_FIRMADA_KAYITLI` döndü (adresin başka
 * firmada hesabı vardı; DB'den ölçüldü) ve kullanıcı bunu "düğmeye
 * basılmıyor" diye yaşadı. Artık kimlik ekranlarının ORTAK kabuğu
 * (`KimlikKabugu`) kullanılıyor — kayıt/sıfırlama ile aynı görünüm. Karar
 * veren saf parçalar `ozellik/kimlik/davet-kabul-kurallari.ts`te.
 */

type DavetBilgisi = {
  firmaAd: string;
  davetEdenEposta: string;
  eposta: string;
  sonGecerlilik?: string;
  // FAZ 7 F3b (§6.4): davetin firmasinda sirket girisi varsa "Sirket
  // hesabimla katil" cizilir; ZORUNLUYSA parola formu HIC cizilmez —
  // sunucu o yolu zaten 400 ile reddediyor (V7 ikizi).
  kurumsalGiris?: {
    var: boolean;
    zorunlu: boolean;
    tip: string | null;
    saglayiciId: string | null;
  };
};

type Hata = { metin: string; kod?: string };

function HataKutusu({ hata }: { hata: Hata }) {
  // Kutu dugmenin USTUNDE acilir; kisa ekranda gorunur alanin altinda kalip
  // "bir sey olmadi" hissini geri getirmesin diye goruse kaydirilir.
  const kutuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    kutuRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [hata]);
  return (
    <div ref={kutuRef} role="alert" className="flex gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
      <div className="text-xs leading-relaxed text-red-800">
        <p>{hata.metin}</p>
        {girisBaglantisiGosterilirMi(hata.kod) && (
          <Link
            href="/login"
            className="mt-2 inline-block font-semibold text-red-900 underline underline-offset-2 hover:text-red-950"
          >
            Mevcut hesabınızla giriş yapın
          </Link>
        )}
      </div>
    </div>
  );
}

function YukleniyorEkrani() {
  return (
    <KimlikKabugu baslik="Davetiniz açılıyor…">
      <div aria-busy="true" className="space-y-3">
        <span className="sr-only">Davet bilgileri yükleniyor.</span>
        <div className="h-[74px] animate-pulse rounded-xl bg-slate-100" />
        <div className="h-10 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-10 animate-pulse rounded-xl bg-slate-100" />
      </div>
    </KimlikKabugu>
  );
}

/**
 * Iki adimli giris kurulumundan cikildiginda (sure doldu). Hesap ACILDI ve
 * davet TUKETILDI; kisiye giris yolu gosterilir, form DEGIL.
 */
function HesapAcildiEkrani({ mesaj }: { mesaj: string }) {
  return (
    <KimlikKabugu baslik="Hesabınız açıldı">
      <div role="status" className="flex gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-emerald-900">
          Ekibe katıldınız. Devam etmek için giriş yapın; iki adımlı giriş kurulumunu orada
          tamamlayabilirsiniz.
        </p>
      </div>
      {mesaj && <p className="mt-3 text-xs leading-relaxed text-slate-600">{mesaj}</p>}
      <Link
        href="/login"
        className="mt-5 block w-full rounded-xl bg-[#0B1528] px-4 py-2.5 text-center text-sm font-semibold text-white shadow-md transition-all hover:bg-slate-800"
      >
        Giriş yap
      </Link>
    </KimlikKabugu>
  );
}

function DavetKabulIcerik() {
  const router = useRouter();
  const tokenRef = useRef<string | null>(null);
  const [bilgi, setBilgi] = useState<DavetBilgisi | null>(null);
  const [kurumsalYukleniyor, setKurumsalYukleniyor] = useState(false);
  const [durum, setDurum] = useState<'yukleniyor' | 'hazir' | 'gecersiz' | 'ulasilamadi'>('yukleniyor');
  const [hata, setHata] = useState<Hata | null>(null);
  // Her yeni hata kutuyu YENIDEN baglar (`key`): ayni metin ikinci kez
  // gelse de ekran okuyucu `role=alert`i yeniden okur, kutu goruse kayar.
  const [hataNo, setHataNo] = useState(0);
  const [parola, setParola] = useState('');
  const [parolaTekrar, setParolaTekrar] = useState('');
  const [sozlesmeOnayi, setSozlesmeOnayi] = useState(false);
  const [ticariIletiOnayi, setTicariIletiOnayi] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  // Basarida sayfa yonlenene dek dugme KAPALI kalir: token tuketildi, ikinci
  // tik "baglanti gecersiz" alip yonlenen kullaniciya hata gosterirdi.
  const [yonlendiriliyor, setYonlendiriliyor] = useState(false);
  // FAZ 7 F2b: firma zorunlulugu davet kabulunde de gecerli (R1-O1).
  const [dal, setDal] = useState<GirisDali | null>(null);
  // ⚠ Dal acildiginda hesap ZATEN acilmis ve davet TUKETILMISTIR. Kurulumdan
  // cikis formu GERI ACMAZ: form yeniden gonderilse davet "gecersiz" doner,
  // sahip yeniden davet etse ZATEN_EKIPTE — kisi dongude kalirdi (kod
  // incelemesi, 28.09). Dolu deger = "hesap acildi, giris yap" ekrani.
  const [hesapAcildi, setHesapAcildi] = useState<string | null>(null);

  function hataGoster(h: Hata) {
    setHata(h);
    setHataNo((n) => n + 1);
  }

  async function sirketHesabiylaKatil() {
    const saglayiciId = bilgi?.kurumsalGiris?.saglayiciId;
    if (!saglayiciId) return;
    setKurumsalYukleniyor(true);
    setHata(null);
    try {
      await kurumsalGirisiBaslat({ tip: 'giris', saglayiciId });
    } catch (e) {
      setKurumsalYukleniyor(false);
      hataGoster({ metin: kimlikHataMetni(e, 'Şirket girişi başlatılamadı.'), kod: hataKodu(e) });
    }
  }

  const bilgiGetir = useCallback((t: string) => {
    setDurum('yukleniyor');
    api
      .post('/auth/davet-bilgi', { token: t })
      .then((r) => {
        setBilgi(r.data);
        setHata(null);
        setDurum('hazir');
      })
      .catch((e) => {
        // Yalniz sunucunun VERDIGI ret "davet acilamadi"dir; ag hatasi, 5xx
        // ve 429 "Tekrar dene"ye gider (`davetBilgiHataDurumu`).
        setDurum(davetBilgiHataDurumu(e));
        setHata({ metin: davetHataMetni(e), kod: hataKodu(e) });
      });
  }, []);

  useEffect(() => {
    // ⚠ IDEMPOTENT (27.09): React gelistirme kipinde etki IKI KEZ kosar.
    // Eskiden ikinci kosu, ilk kosunun adres cubugundan sildigi token'i
    // bulamayip `tokenRef`e null yaziyordu → form cizildigi halde "Ekibe
    // katil" bos token gonderip "baglanti gecersiz" aliyordu (onizlemede
    // olculdu). Token bir kez okunur, sonra ref'ten gelir.
    const url = new URL(window.location.href);
    const t = tokenRef.current ?? url.searchParams.get('token');
    tokenRef.current = t;
    if (url.searchParams.has('token')) {
      url.searchParams.delete('token');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
    if (!t) {
      setDurum('gecersiz');
      setHata({ metin: 'Davet bağlantısı eksik. Firma sahibinden yeni davet isteyin.' });
      return;
    }
    bilgiGetir(t);
  }, [bilgiGetir]);

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    if (parola !== parolaTekrar) {
      hataGoster({ metin: 'Parolalar aynı değil.' });
      return;
    }
    setGonderiliyor(true);
    setHata(null);
    try {
      const { data } = await api.post('/auth/davet-kabul', {
        token: tokenRef.current,
        parola,
        sozlesmeOnayi,
        ticariIletiOnayi,
      });
      // FAZ 7 F2b (R1-O1): firma iki adimli girisi ZORUNLU kildiysa yeni uye
      // token yerine kurulum meydan okumasi alir ve sihirbaza duser.
      const karar = girisDaliCoz(data);
      if (karar.tip !== 'oturum') {
        setDal(karar);
        return;
      }
      const oturum = oturumuYaz(data);
      setYonlendiriliyor(true);
      router.push(girisSonrasiYol(oturum));
    } catch (err) {
      hataGoster({ metin: davetHataMetni(err), kod: hataKodu(err) });
    } finally {
      setGonderiliyor(false);
    }
  }

  if (durum === 'yukleniyor') return <YukleniyorEkrani />;

  if (durum === 'ulasilamadi') {
    return (
      <KimlikKabugu baslik="Davet bilgisi alınamadı">
        <div role="alert" className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-amber-900">{hata?.metin ?? ULASILAMADI_METNI}</p>
        </div>
        <button
          type="button"
          onClick={() => tokenRef.current && bilgiGetir(tokenRef.current)}
          className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Tekrar dene
        </button>
      </KimlikKabugu>
    );
  }

  if (durum === 'gecersiz' || !bilgi) {
    return (
      <KimlikKabugu
        baslik="Davet açılamadı"
        altBaglanti={{ metin: 'Zaten bir hesabınız var mı?', baglantiMetni: 'Giriş yapın', href: '/login' }}
      >
        <div role="alert" className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-amber-900">
            {hata?.metin ?? KIMLIK_HATA_METINLERI.DAVET_GECERSIZ}
          </p>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-slate-600">
          Bir davet yeniden gönderildiğinde önceki bağlantı geçersiz olur. Birden
          fazla davet e-postası aldıysanız en son gelendeki bağlantıyı kullanın.
        </p>
      </KimlikKabugu>
    );
  }

  if (hesapAcildi !== null) return <HesapAcildiEkrani mesaj={hesapAcildi} />;

  if (dal) {
    // Kurulum sihirbazi kendi basligini tasir; kart ikinci baslik cizmez.
    return (
      <KimlikKabugu>
        <GirisDaliEkrani
          dal={dal}
          onOturum={(data) => {
            const oturum = oturumuYaz(data);
            router.push(girisSonrasiYol(oturum));
          }}
          onSuresiDoldu={(mesaj) => { setDal(null); setHesapAcildi(mesaj); }}
          onGeri={() => { setDal(null); setHesapAcildi(''); }}
        />
      </KimlikKabugu>
    );
  }

  const firmaAdi = bilgi.firmaAd?.trim() || 'Ekip';
  const basHarf = firmaAdi.charAt(0).toLocaleUpperCase('tr-TR');
  const gecerlilik = gecerlilikMetni(bilgi.sonGecerlilik);
  // Zorunlu kurumsal giriste parola formu YOK — aciklama onu vaat etmemeli.
  const aciklama = bilgi.kurumsalGiris?.zorunlu
    ? 'Şirket hesabınızla giriş yaparak ekibe katılın.'
    : bilgi.kurumsalGiris?.var
      ? 'Şirket hesabınızla ya da bir parola belirleyerek ekibe katılın.'
      : 'Parolanızı belirleyin; hesabınız açılır ve ekibe katılırsınız.';

  return (
    <KimlikKabugu baslik="Ekibe katılın" aciklama={aciklama}>
      {/* Davet ozeti — kim, hangi ekip, ne zamana kadar. */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3.5">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-base font-bold text-white"
          >
            {basHarf}
          </div>
          <div className="min-w-0">
            <p className="break-words text-sm font-bold text-slate-900">{firmaAdi}</p>
            <p className="break-words text-xs text-slate-600">
              Davet eden: <span className="font-medium text-slate-800">{bilgi.davetEdenEposta}</span>
            </p>
          </div>
        </div>
        {gecerlilik && (
          <p className="mt-3 flex items-center gap-1.5 border-t border-blue-100 pt-2.5 text-[11px] text-slate-600">
            <Clock className="h-3.5 w-3.5 shrink-0 text-blue-600" aria-hidden="true" />
            Davet {gecerlilik} tarihine kadar geçerli.
          </p>
        )}
      </div>

      {bilgi?.kurumsalGiris?.var && (
        <button
          type="button"
          onClick={sirketHesabiylaKatil}
          disabled={kurumsalYukleniyor}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Building2 className="h-4 w-4" aria-hidden="true" />
          {kurumsalYukleniyor ? 'Yönlendiriliyor…' : 'Şirket hesabımla katıl'}
        </button>
      )}
      {bilgi?.kurumsalGiris?.zorunlu && (
        <div className="mt-3 space-y-3">
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            Firmanız kurumsal giriş kullanıyor; parola belirleyerek katılamazsınız.
          </p>
          {/* Parola formu cizilmedigi icin sirket girisi hatasi BURADA gorunur. */}
          {hata && <HataKutusu key={hataNo} hata={hata} />}
        </div>
      )}
      {bilgi?.kurumsalGiris?.var && !bilgi.kurumsalGiris.zorunlu && (
        <div className="mt-5 flex items-center gap-3 text-[11px] font-medium text-slate-500">
          <span className="h-px flex-1 bg-slate-200" />
          ya da parola belirleyin
          <span className="h-px flex-1 bg-slate-200" />
        </div>
      )}

      {!bilgi?.kurumsalGiris?.zorunlu && (
      <form onSubmit={gonder} className="mt-5 space-y-4">
        <div>
          <label htmlFor="davet-eposta" className="mb-1.5 block text-xs font-semibold text-slate-700">
            E-posta adresi
          </label>
          {/* ⚠ SALT OKUNUR: hesap davetteki adresle açılır; değiştirilebilseydi
              davet başkasına devredilebilirdi. `username` parola yöneticisinin
              yeni parolayı bu adrese bağlamasını sağlar. */}
          <div className="relative">
            <input
              id="davet-eposta"
              type="email"
              readOnly
              aria-readonly="true"
              autoComplete="username"
              value={bilgi.eposta}
              className="w-full cursor-default rounded-xl border border-slate-200 bg-slate-100 py-2.5 pl-3.5 pr-10 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
            <Lock
              className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">Hesabınız davetin gönderildiği bu adresle açılır.</p>
        </div>

        <div>
          <label htmlFor="davet-parola" className="mb-1.5 block text-xs font-semibold text-slate-700">
            Parola
          </label>
          <ParolaAlani
            id="davet-parola"
            value={parola}
            onChange={setParola}
            autoComplete="new-password"
            minLength={PAROLA_MIN}
          />
          <p className="mt-1.5 text-[11px] text-slate-500">{PAROLA_IPUCU}</p>
        </div>
        <div>
          <label htmlFor="davet-parola-tekrar" className="mb-1.5 block text-xs font-semibold text-slate-700">
            Parola (tekrar)
          </label>
          <ParolaAlani
            id="davet-parola-tekrar"
            value={parolaTekrar}
            onChange={setParolaTekrar}
            autoComplete="new-password"
            minLength={PAROLA_MIN}
          />
        </div>

        {/* ⚠ İKİ AYRI KUTU (ETK/İYS): pazarlama izni sözleşme onayına
            yedirilemez ve önceden işaretli olamaz. */}
        <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={sozlesmeOnayi}
              onChange={(e) => setSozlesmeOnayi(e.target.checked)}
              required
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-600/30"
            />
            <span className="text-[11px] leading-relaxed text-slate-600">
              <Link href="/kullanim-kosullari" target="_blank" className="font-semibold text-blue-600 hover:text-blue-700">
                Kullanım Koşulları
              </Link>{' '}
              ve{' '}
              <Link href="/gizlilik" target="_blank" className="font-semibold text-blue-600 hover:text-blue-700">
                Gizlilik Politikası
              </Link>
              &apos;nı okudum, onaylıyorum.
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={ticariIletiOnayi}
              onChange={(e) => setTicariIletiOnayi(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-600/30"
            />
            <span className="text-[11px] leading-relaxed text-slate-600">
              Kampanya ve duyuru e-postaları almak istiyorum.{' '}
              <span className="text-slate-500">(isteğe bağlı)</span>
            </span>
          </label>
        </div>

        {hata && <HataKutusu key={hataNo} hata={hata} />}

        <KimlikDugmesi yukleniyor={gonderiliyor || yonlendiriliyor}>
          {yonlendiriliyor ? 'Yönlendiriliyorsunuz…' : gonderiliyor ? 'Hesabınız açılıyor…' : 'Ekibe katıl'}
        </KimlikDugmesi>
      </form>
      )}

      <p className="mt-5 text-center text-[11px] leading-relaxed text-slate-500">
        Bu daveti beklemiyorsanız sayfayı kapatabilirsiniz; hesap açılmaz.
      </p>
    </KimlikKabugu>
  );
}

export default function DavetKabulSayfasi() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <meta name="robots" content="noindex" />
      <Suspense fallback={<YukleniyorEkrani />}>
        <DavetKabulIcerik />
      </Suspense>
    </>
  );
}
