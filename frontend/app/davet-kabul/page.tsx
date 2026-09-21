'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/ortak/lib/api';
import { kurumsalGirisiBaslat } from '@/ozellik/kimlik/kurumsal-baslat';
import { oturumuYaz, girisSonrasiYol, girisDaliCoz, type GirisDali } from '@/ortak/lib/oturum';
import { GirisDaliEkrani } from '@/ozellik/kimlik/GirisDaliEkrani';
import { kimlikHataMetni } from '@/ortak/lib/kimlik-hata-metinleri';
import { ParolaAlani } from '@/ortak/ui/parola-alani';
/**
 * ⚠ ELLE YAZILAN 8 KALDIRILDI (Gorunur kusurlar turu, 21.09). Bu dosyanin
 * eski yorumu kusuru ZATEN tespit etmisti: "register/page.tsx hâlâ 6 yaziyor
 * — sunucuyla uyumsuz". Artik uc ekran da AYNI sabiti okuyor ve sabitin
 * sunucudakiyle esitligini `npm run test:parola-kapisi` kapisi olcuyor.
 */
import { PAROLA_MIN } from '@/ortak/lib/parola-kurali';

/**
 * FAZ 7 F1b — DAVET KABUL (§6.4). HERKESE AÇIK sayfa (giriş yapmamış kişi).
 *
 * ⚠ `noindex`: davet bağlantısı kişiye özeldir; arama motoru indekslememeli.
 * Sayfa `HERKESE_ACIK_SAYFALAR`a EKLENMEZ ve sitemap'te görünmez.
 *
 * ⚠ Token URL'den okunur ve `replaceState` ile adres çubuğundan SİLİNİR:
 * ekran görüntüsü, tarayıcı geçmişi ve `Referer` başlığı token'ı taşımasın.
 */
function DavetKabulIcerik() {
  const router = useRouter();
  const tokenRef = useRef<string | null>(null);
  const [bilgi, setBilgi] = useState<
    {
      firmaAd: string;
      davetEdenEposta: string;
      eposta: string;
      // FAZ 7 F3b (§6.4): davetin firmasinda sirket girisi varsa "Sirket
      // hesabimla katil" cizilir; ZORUNLUYSA parola formu HIC cizilmez —
      // sunucu o yolu zaten 400 ile reddediyor (V7 ikizi).
      kurumsalGiris?: {
        var: boolean;
        zorunlu: boolean;
        tip: string | null;
        saglayiciId: string | null;
      };
    } | null
  >(null);
  const [kurumsalYukleniyor, setKurumsalYukleniyor] = useState(false);
  const [durum, setDurum] = useState<'yukleniyor' | 'hazir' | 'gecersiz'>('yukleniyor');
  const [hata, setHata] = useState<string | null>(null);
  const [parola, setParola] = useState('');
  const [parolaTekrar, setParolaTekrar] = useState('');
  const [sozlesmeOnayi, setSozlesmeOnayi] = useState(false);
  const [ticariIletiOnayi, setTicariIletiOnayi] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  // FAZ 7 F2b: firma zorunlulugu davet kabulunde de gecerli (R1-O1).
  const [dal, setDal] = useState<GirisDali | null>(null);

  async function sirketHesabiylaKatil() {
    const saglayiciId = bilgi?.kurumsalGiris?.saglayiciId;
    if (!saglayiciId) return;
    setKurumsalYukleniyor(true);
    try {
      await kurumsalGirisiBaslat({ tip: 'giris', saglayiciId });
    } catch (e) {
      setKurumsalYukleniyor(false);
      setHata(kimlikHataMetni(e, 'Şirket girişi başlatılamadı.'));
    }
  }

  useEffect(() => {
    const url = new URL(window.location.href);
    const t = url.searchParams.get('token');
    tokenRef.current = t;
    if (t) {
      url.searchParams.delete('token');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
    if (!t) {
      setDurum('gecersiz');
      setHata('Davet bağlantısı eksik. Firma sahibinden yeni davet isteyin.');
      return;
    }
    api
      .post('/auth/davet-bilgi', { token: t })
      .then((r) => {
        setBilgi(r.data);
        setDurum('hazir');
      })
      .catch((e) => {
        setDurum('gecersiz');
        setHata(kimlikHataMetni(e));
      });
  }, []);

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    if (parola !== parolaTekrar) {
      setHata('Parolalar aynı değil.');
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
      router.push(girisSonrasiYol(oturum));
    } catch (err) {
      setHata(kimlikHataMetni(err));
    } finally {
      setGonderiliyor(false);
    }
  }

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold text-slate-100">Ekibe katıl</h1>

      {durum === 'yukleniyor' && <p className="mt-4 text-slate-400">Yükleniyor…</p>}

      {durum === 'gecersiz' && (
        <p className="mt-4 rounded bg-red-950/50 px-3 py-2 text-sm text-red-300">{hata}</p>
      )}

      {dal && (
        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
          <GirisDaliEkrani
            dal={dal}
            onOturum={(data) => {
              const oturum = oturumuYaz(data);
              router.push(girisSonrasiYol(oturum));
            }}
            onSuresiDoldu={(mesaj) => { setDal(null); setHata(mesaj); }}
            onGeri={() => setDal(null)}
          />
        </div>
      )}

      {!dal && durum === 'hazir' && bilgi && (
        <>
          <p className="mt-2 text-sm text-slate-400">
            <span className="text-slate-200">{bilgi.davetEdenEposta}</span>, sizi{' '}
            <span className="text-slate-200">{bilgi.firmaAd}</span> ekibine davet etti.
          </p>
          {bilgi?.kurumsalGiris?.var && (
            <button
              type="button"
              onClick={sirketHesabiylaKatil}
              disabled={kurumsalYukleniyor}
              className="mt-5 w-full rounded border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-100 disabled:opacity-60"
            >
              {kurumsalYukleniyor ? 'Yönlendiriliyor…' : 'Şirket hesabımla katıl'}
            </button>
          )}
          {bilgi?.kurumsalGiris?.zorunlu && (
            <p className="mt-3 text-xs text-slate-300">
              Firmanız kurumsal giriş kullanıyor; parola belirleyerek katılamazsınız.
            </p>
          )}
          {!bilgi?.kurumsalGiris?.zorunlu && (
          <form onSubmit={gonder} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs text-slate-400">E-posta</label>
              {/* ⚠ SALT OKUNUR: hesap davetteki adresle açılır; değiştirilebilseydi
                  davet başkasına devredilebilirdi. */}
              <input
                readOnly
                value={bilgi.eposta}
                className="mt-1 w-full rounded border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-400"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400">Parola</label>
              <ParolaAlani
                id="davet-parola"
                value={parola}
                onChange={setParola}
                autoComplete="new-password"
                minLength={PAROLA_MIN}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400">Parola (tekrar)</label>
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
            <label className="flex items-start gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={sozlesmeOnayi}
                onChange={(e) => setSozlesmeOnayi(e.target.checked)}
                required
              />
              <span>
                <a href="/kullanim-kosullari" target="_blank" className="text-blue-400 underline">
                  Kullanım Koşulları
                </a>{' '}
                ve{' '}
                <a href="/gizlilik" target="_blank" className="text-blue-400 underline">
                  Gizlilik Politikası
                </a>
                &apos;nı okudum, onaylıyorum.
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={ticariIletiOnayi}
                onChange={(e) => setTicariIletiOnayi(e.target.checked)}
              />
              <span>Kampanya ve duyuru e-postaları almak istiyorum (isteğe bağlı).</span>
            </label>

            {hata && <p className="rounded bg-red-950/50 px-3 py-2 text-sm text-red-300">{hata}</p>}

            <button
              type="submit"
              disabled={gonderiliyor}
              className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Ekibe katıl
            </button>
          </form>
          )}
        </>
      )}
    </div>
  );
}

export default function DavetKabulSayfasi() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <meta name="robots" content="noindex" />
      <Suspense fallback={<div className="p-6 text-slate-400">Yükleniyor…</div>}>
        <DavetKabulIcerik />
      </Suspense>
    </>
  );
}
