'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F3b — KURUMSAL GİRİŞ AYARI (§1.7 / §6.8) — YALNIZ FİRMA YÖNETİCİSİ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  23.09.2026: Ekip sayfasının ikinci tasarımıyla aynı dil ve sadelik — üç
 *  adım (kaydet → sına → aç), beyaz kartlar, açık alanlar, anahtarlar,
 *  bildirimler. Eski sayfa KOYU tema sınıflarıyla yazılmıştı; açık zeminde
 *  başlıklar OKUNMUYORDU (Emre'nin ekran görüntüsü).
 *
 *  ⚠ İSTEMCİ ANAHTARI ASLA ÖNCEDEN DOLDURULMAZ: sunucu onu hiçbir yanıtta
 *  döndürmüyor (yalnız `sirVar`). Boş bırakılırsa mevcut anahtar KORUNUR.
 *
 *  ⚠ TARAYICI OTOMATİK DOLDURMASI (23.09 canlı ekranda görüldü): anahtar alanı
 *  düz `type="password"` iken tarayıcı sayfayı GİRİŞ formu sanıp "Uygulama
 *  (istemci) kimliği"ne kullanıcının e-postasını, anahtara KAYITLI PAROLASINI
 *  yazıyordu. Kaydedilse MetaPriceX parolası istemci anahtarı diye sunucuya
 *  giderdi. `autoComplete="new-password"` + parola yöneticisi işaretleri.
 *
 *  ⚠ "Bağlantıyı sına" PAROLA İSTER (R1-O3): çalınmış bir oturum anahtarı tek
 *  başına alan adı doğrulatamamalı — alan adı doğrulaması firmanın kimliğini
 *  belirler ve geri alınması yönetici müdahalesi ister.
 *
 *  ⚠ "Parolayla girişi kapat", yöneticinin hesabı bağlı değilken PASİFTİR:
 *  sunucu da reddeder (`ONCE_HESABINIZI_BAGLAYIN`) — ekran sunucuyla aynı
 *  kuralı söyler, iki ayrı gerçek üretmez.
 *
 *  ⚠ AÇMA TEK ANAHTARDA: eski sayfada "Doğrulandı" ayarı açmanın ayrı yolu
 *  yoktu; alt kutucuklardan birine tıklamak ayarı KENDİLİĞİNDEN "Etkin"
 *  yapıyordu. Alt anahtarlar artık yalnız AÇIK ayarda çalışır. Kapatma
 *  parolasız üyelere e-posta gönderir → önce SORULUR.
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronRight, Lock } from 'lucide-react';
import api from '@/ortak/lib/api';
import { confirm } from '@/ortak/hooks/use-confirm';
import { toast } from '@/ortak/hooks/use-toast';
import { kimlikHataMetni } from '@/ortak/lib/kimlik-hata-metinleri';
import { kurumsalGirisiBaslat } from '@/ozellik/kimlik/kurumsal-baslat';
import { Anahtar } from '@/ozellik/firma/ekip/ekip-parcalari';
import {
  DURUM_ROZETI,
  ENTRA_ADIMLARI,
  GOOGLE_ADIMLARI,
  HESABIM_GUVENLIK_ADRESI,
  HESAP_BAGLANMADI_METNI,
  SAGLAYICI_GORUNEN_AD,
  SINAMA_SONUC_METNI,
  acilabilirMi,
  alanAdlariniAyir,
  kurulumIlerlemesi,
  sirBitisYakinMi,
  type SaglayiciDurumu,
  type SaglayiciTipi,
} from '@/ozellik/firma/kurumsal-giris/kurumsal-giris-metinleri';
import {
  ALAN_SINIFI,
  Alan,
  AyarSatiri,
  DurumRozeti,
  Kart,
  KopyalanabilirDeger,
  KurulumIlerlemesi,
  SonucSeridi,
  type Sonuc,
} from '@/ozellik/firma/kurumsal-giris/kurumsal-giris-parcalari';

type Saglayici = {
  id: string;
  tip: SaglayiciTipi;
  entraKiraciId: string | null;
  clientId: string;
  sirVar: boolean;
  istemciSirriSonGecerlilik: string | null;
  beyanAlanAdlari: string[];
  dogrulanmisAlanAdlari: { alanAdi: string; dogrulandiAt: string }[];
  durum: SaglayiciDurumu;
  jitKatilim: boolean;
  zorunlu: boolean;
  sonSinamaAt: string | null;
  sonHataKodu: string | null;
};
type Durum = { saglayici: Saglayici | null; donusAdresi: string };

const BIRINCIL =
  'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#0f172a] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#1e293b] disabled:opacity-50';
const IKINCIL =
  'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#e5e7eb] bg-white px-4 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50 disabled:opacity-50';
/** Parola yöneticileri (1Password, LastPass) bu alanlara DOKUNMASIN. */
const YONETICI_YOK = { 'data-1p-ignore': true, 'data-lpignore': 'true', spellCheck: false } as const;

export default function KurumsalGirisAyariSayfasi() {
  const arama = useSearchParams();
  const [durum, setDurum] = useState<Durum | null>(null);
  const [yuklemeHatasi, setYuklemeHatasi] = useState<string | null>(null);
  const [sinamaSonucu, setSinamaSonucu] = useState<Sonuc | null>(null);
  const [yetkisiz, setYetkisiz] = useState(false);
  const [islemde, setIslemde] = useState(false);
  const [bagliMi, setBagliMi] = useState(false);

  // Form
  const [tip, setTip] = useState<SaglayiciTipi>('entra');
  const [kiraciId, setKiraciId] = useState('');
  const [clientId, setClientId] = useState('');
  const [istemciSirri, setIstemciSirri] = useState('');
  const [sirBitis, setSirBitis] = useState('');
  const [alanAdlari, setAlanAdlari] = useState('');
  const [sinamaParolasi, setSinamaParolasi] = useState('');
  const [silOnayi, setSilOnayi] = useState('');

  const yukle = useCallback(async () => {
    try {
      const [{ data }, me] = await Promise.all([
        api.get<Durum>('/firma/kurumsal-giris'),
        api.get('/auth/me'),
      ]);
      setDurum(data);
      setBagliMi(me.data?.kurumsal?.bagli === true);
      const s = data.saglayici;
      // Ayar silindiyse form da boşalır (eski değerler "kayıtlı" sanılmasın).
      setTip(s?.tip ?? 'entra');
      setKiraciId(s?.entraKiraciId ?? '');
      setClientId(s?.clientId ?? '');
      setSirBitis(s?.istemciSirriSonGecerlilik?.slice(0, 10) ?? '');
      setAlanAdlari(s ? s.beyanAlanAdlari.join(', ') : '');
      setYuklemeHatasi(null);
    } catch (e: any) {
      if (e?.response?.status === 403) setYetkisiz(true);
      else setYuklemeHatasi(kimlikHataMetni(e, 'Kurumsal giriş ayarı okunamadı.'));
    }
  }, []);

  useEffect(() => {
    void yukle();
  }, [yukle]);

  // Sağlayıcıdan dönüş (`/sso/tamam` → `?sonuc=`). Kalıcı şerit: uzun ve
  // önemli metin (hesap bağlanmadı) bildirimle birkaç saniyede kaybolmasın.
  useEffect(() => {
    const sonuc = arama.get('sonuc');
    if (!sonuc) return;
    if (sonuc === 'sinandi') {
      setSinamaSonucu(
        arama.get('hesap') === 'baglanmadi'
          ? { ton: 'uyari', metin: HESAP_BAGLANMADI_METNI }
          : { ton: 'basari', metin: SINAMA_SONUC_METNI.sinandi },
      );
    } else {
      setSinamaSonucu({
        ton: 'hata',
        metin: kimlikHataMetni({ response: { data: { kod: sonuc } } }, 'Sınama başarısız oldu.'),
      });
    }
  }, [arama]);

  /** Tek yazma kalıbı: sonucu BİLDİRİMLE söyler, sonra durumu tazeler. */
  async function calistir(fn: () => Promise<string>, yedekHata: string): Promise<boolean> {
    setIslemde(true);
    try {
      toast({ title: await fn() });
      await yukle();
      return true;
    } catch (e) {
      toast({ variant: 'destructive', title: 'İşlem tamamlanamadı', description: kimlikHataMetni(e, yedekHata) });
      return false;
    } finally {
      setIslemde(false);
    }
  }

  function kaydet(e: FormEvent) {
    e.preventDefault();
    void calistir(async () => {
      await api.put('/firma/kurumsal-giris', {
        tip,
        ...(tip === 'entra' ? { entraKiraciId: kiraciId.trim() } : {}),
        clientId: clientId.trim(),
        ...(istemciSirri ? { istemciSirri } : {}),
        ...(sirBitis ? { istemciSirriSonGecerlilik: new Date(sirBitis).toISOString() } : {}),
        beyanAlanAdlari: alanAdlariniAyir(alanAdlari),
      });
      setIstemciSirri('');
      return 'Ayar kaydedildi. Şimdi "Bağlantıyı sına" ile şirket hesabınla giriş yap.';
    }, 'Ayar kaydedilemedi.');
  }

  /** Başarıda sağlayıcıya YÖNLENİR (sayfa kapanır); hata olursa bildirim. */
  async function sina(e: FormEvent) {
    e.preventDefault();
    setIslemde(true);
    try {
      await kurumsalGirisiBaslat({ tip: 'niyet', amac: 'sinama', parola: sinamaParolasi });
    } catch (hata) {
      toast({ variant: 'destructive', title: 'Sınama başlatılamadı', description: kimlikHataMetni(hata, 'Sınama başlatılamadı.') });
      setIslemde(false);
    }
  }

  function etkinlestir(jitKatilim: boolean, zorunlu: boolean, basariMetni: string) {
    void calistir(async () => {
      await api.post('/firma/kurumsal-giris/etkinlestir', { jitKatilim, zorunlu });
      return basariMetni;
    }, 'Kaydedilemedi.');
  }

  async function girisiDegistir(s: Saglayici, ac: boolean) {
    if (ac) {
      etkinlestir(s.jitKatilim, s.zorunlu, 'Şirket hesabıyla giriş açıldı.');
      return;
    }
    const onay = await confirm({
      title: 'Şirket hesabıyla girişi kapat',
      description: 'Ekibin yeniden parolayla girer. Parolası olmayan üyelere parola belirleme bağlantısı gönderilir.',
      confirmText: 'Kapat',
    });
    if (!onay) return;
    void calistir(async () => {
      const { data } = await api.post('/firma/kurumsal-giris/kapat');
      return data?.parolaSifirlamaGonderilen > 0
        ? `Şirket girişi kapatıldı. Parolası olmayan ${data.parolaSifirlamaGonderilen} üyeye parola belirleme bağlantısı gönderildi.`
        : 'Şirket girişi kapatıldı.';
    }, 'Kapatılamadı.');
  }

  async function zorunluDegistir(s: Saglayici, yeni: boolean) {
    if (yeni) {
      const onay = await confirm({
        title: 'Parolayla girişi kapat',
        description: 'Ekibin yalnız şirket hesabıyla girebilecek; parolayla giriş kapanır.',
        confirmText: 'Parolayla girişi kapat',
      });
      if (!onay) return;
    }
    etkinlestir(
      s.jitKatilim,
      yeni,
      yeni ? 'Parolayla giriş kapatıldı; ekip yalnız şirket hesabıyla girer.' : 'Parolayla giriş yeniden açıldı.',
    );
  }

  function sil() {
    void calistir(async () => {
      const { data } = await api.delete('/firma/kurumsal-giris', { data: { onay: silOnayi } });
      setSilOnayi('');
      return data?.parolaSifirlamaGonderilen > 0
        ? `Ayar silindi. Parolası olmayan ${data.parolaSifirlamaGonderilen} üyeye parola belirleme bağlantısı gönderildi.`
        : 'Şirket girişi ayarı silindi.';
    }, 'Silinemedi.');
  }

  if (yetkisiz) {
    return (
      <div className="mx-auto flex w-full max-w-[480px] flex-col items-center px-4 py-14 text-center">
        <div className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-slate-100 text-slate-600">
          <Lock className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-[22px] font-semibold tracking-tight text-gray-900">
          Bu sayfayı yalnız firma yöneticisi görebilir
        </h1>
        <p className="mt-2 text-sm text-gray-600">Kurumsal giriş ayarlarını firma yöneticin yönetir.</p>
        <Link href="/firma/ekip" className="mt-5 text-[13px] font-medium text-[#1d4ed8] hover:underline">
          Ekip sayfasına dön
        </Link>
      </div>
    );
  }
  if (!durum) {
    return yuklemeHatasi ? (
      <div className="p-6">
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{yuklemeHatasi}</p>
      </div>
    ) : (
      <div className="p-6 text-sm text-gray-500">Yükleniyor…</div>
    );
  }

  const s = durum.saglayici;
  const etkin = s?.durum === 'ETKIN';
  const acilabilir = acilabilirMi(s);
  const adimlar = tip === 'entra' ? ENTRA_ADIMLARI : GOOGLE_ADIMLARI;

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-5 text-gray-900">
      {/* ── Başlık ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Kurumsal giriş</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-gray-500">
            Ekibin Microsoft ya da Google şirket hesabıyla, parola yazmadan giriş yapsın. İstersen
            parolayla girişi tamamen kapatabilirsin.
          </p>
        </div>
        {s && <DurumRozeti durum={s.durum} />}
      </div>

      {sinamaSonucu && <SonucSeridi sonuc={sinamaSonucu} onKapat={() => setSinamaSonucu(null)} />}

      {/* ── Kurulum ilerlemesi + durum ─────────────────────────────────── */}
      <Kart
        baslik="Kurulum"
        aciklama={s ? DURUM_ROZETI[s.durum].aciklama : 'Üç adım: bilgileri kaydet, bağlantıyı sına, aç.'}
      >
        <KurulumIlerlemesi adimlar={kurulumIlerlemesi(s)} />
        {s && s.dogrulanmisAlanAdlari.length > 0 && (
          <p className="mt-3 text-xs text-gray-500">
            Doğrulanmış alan adları:{' '}
            <span className="font-medium text-gray-700">
              {s.dogrulanmisAlanAdlari.map((a) => a.alanAdi).join(', ')}
            </span>
          </p>
        )}
        {s?.sonHataKodu && (
          <p className="mt-2 text-xs font-medium text-amber-700">
            Son hata: {kimlikHataMetni({ response: { data: { kod: s.sonHataKodu } } }, s.sonHataKodu)}
          </p>
        )}
        {s && sirBitisYakinMi(s.istemciSirriSonGecerlilik) && (
          <p className="mt-2 text-xs font-medium text-amber-700">
            İstemci anahtarının süresi yaklaşıyor ({s.istemciSirriSonGecerlilik?.slice(0, 10)}). Süresi
            dolarsa ekibin şirket hesabıyla giriş yapamaz.
          </p>
        )}
      </Kart>

      {/* ── 1 · Bağlantı bilgileri ─────────────────────────────────────── */}
      <form onSubmit={kaydet} autoComplete="off">
        <Kart baslik="1 · Bağlantı bilgileri" aciklama="Kimlik sağlayıcındaki uygulama kaydından alınır.">
          <div className="flex flex-col gap-5">
            <div>
              <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">Sağlayıcı</span>
              <div role="radiogroup" aria-label="Sağlayıcı" className="inline-flex rounded-lg border border-[#e5e7eb] p-1">
                {(['entra', 'google'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={tip === t}
                    onClick={() => setTip(t)}
                    className={`h-8 rounded-md px-3.5 text-[13px] font-semibold transition-colors ${
                      tip === t ? 'bg-[#0f172a] text-white' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {SAGLAYICI_GORUNEN_AD[t]}
                  </button>
                ))}
              </div>
            </div>

            <Alan
              etiket="Dönüş adresi"
              htmlFor="donus-adresi"
              yardim="Sağlayıcıdaki uygulama kaydına yönlendirme adresi olarak bunu yapıştır."
            >
              <KopyalanabilirDeger
                deger={durum.donusAdresi}
                onKopyalandi={() => toast({ title: 'Dönüş adresi kopyalandı.' })}
              />
            </Alan>

            <details className="group rounded-[10px] border border-[#e5e7eb]" open={!s}>
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-3 text-[13px] font-semibold text-gray-900 [&::-webkit-details-marker]:hidden">
                <ChevronRight className="h-4 w-4 text-gray-500 transition-transform group-open:rotate-90" aria-hidden="true" />
                Adım adım kurulum — {SAGLAYICI_GORUNEN_AD[tip]}
              </summary>
              <ol className="space-y-2 border-t border-[#eef0f3] px-3.5 py-3">
                {adimlar.map((a, i) => (
                  <li key={a} className="flex gap-2.5 text-xs leading-relaxed text-gray-600">
                    <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
                      {i + 1}
                    </span>
                    <span>{a}</span>
                  </li>
                ))}
              </ol>
            </details>

            {tip === 'entra' && (
              <Alan etiket="Dizin (kiracı) kimliği" htmlFor="kiraci-kimligi">
                <input
                  id="kiraci-kimligi"
                  name="saglayici-kiraci-kimligi"
                  autoComplete="off"
                  {...YONETICI_YOK}
                  value={kiraciId}
                  onChange={(e) => setKiraciId(e.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  className={`${ALAN_SINIFI} font-mono text-[13px]`}
                />
              </Alan>
            )}
            <Alan etiket="Uygulama (istemci) kimliği" htmlFor="istemci-kimligi">
              <input
                id="istemci-kimligi"
                name="saglayici-istemci-kimligi"
                autoComplete="off"
                {...YONETICI_YOK}
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className={`${ALAN_SINIFI} font-mono text-[13px]`}
              />
            </Alan>
            <div className="grid gap-5 sm:grid-cols-2">
              <Alan
                etiket="İstemci anahtarı (client secret)"
                htmlFor="istemci-anahtari"
                yardim={s?.sirVar ? 'Kayıtlı bir anahtar var; değiştirmeyeceksen boş bırak.' : undefined}
              >
                {/* ⚠ ASLA önceden doldurulmaz; boş bırakılırsa mevcut anahtar korunur.
                    ⚠ `new-password`: tarayıcı buraya KAYITLI PAROLAYI yazmasın. */}
                <input
                  id="istemci-anahtari"
                  type="password"
                  name="saglayici-istemci-anahtari"
                  autoComplete="new-password"
                  {...YONETICI_YOK}
                  value={istemciSirri}
                  onChange={(e) => setIstemciSirri(e.target.value)}
                  placeholder={s?.sirVar ? 'Değiştirmek istemiyorsan boş bırak' : ''}
                  className={ALAN_SINIFI}
                />
              </Alan>
              <Alan etiket="Anahtarın bitiş tarihi" htmlFor="anahtar-bitis">
                <input
                  id="anahtar-bitis"
                  type="date"
                  value={sirBitis}
                  onChange={(e) => setSirBitis(e.target.value)}
                  className={ALAN_SINIFI}
                />
              </Alan>
            </div>
            <Alan
              etiket="E-posta alan adların"
              htmlFor="alan-adlari"
              yardim="Virgülle ayır. Yalnız bu alan adlarındaki şirket hesapları girebilir."
            >
              <input
                id="alan-adlari"
                name="saglayici-alan-adlari"
                autoComplete="off"
                {...YONETICI_YOK}
                value={alanAdlari}
                onChange={(e) => setAlanAdlari(e.target.value)}
                placeholder="firma.com.tr, firma.com"
                className={ALAN_SINIFI}
              />
            </Alan>
          </div>
          <div className="mt-5 flex justify-end">
            <button type="submit" disabled={islemde} className={BIRINCIL}>
              Kaydet
            </button>
          </div>
        </Kart>
      </form>

      {/* ── 2 · Bağlantıyı sına ────────────────────────────────────────── */}
      {s && (
        <form onSubmit={sina}>
          <Kart
            baslik="2 · Bağlantıyı sına"
            aciklama="Kendi şirket hesabınla bir kez giriş yaparak alan adını kanıtla. Güvenlik için MetaPriceX parolan istenir."
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="sinama-parolasi"
                type="password"
                name="password"
                autoComplete="current-password"
                aria-label="MetaPriceX parolan"
                value={sinamaParolasi}
                onChange={(e) => setSinamaParolasi(e.target.value)}
                placeholder="MetaPriceX parolan"
                className={ALAN_SINIFI}
              />
              <button type="submit" disabled={islemde || sinamaParolasi === ''} className={IKINCIL}>
                Bağlantıyı sına
              </button>
            </div>
          </Kart>
        </form>
      )}

      {/* ── 3 · Kullanım ───────────────────────────────────────────────── */}
      {s && (
        <Kart
          baslik="3 · Kullanım"
          aciklama={acilabilir ? undefined : 'Önce bağlantıyı sına; alan adın doğrulanınca açabilirsin.'}
        >
          <div className="-my-1 divide-y divide-[#eef0f3]">
            <AyarSatiri
              baslik="Şirket hesabıyla giriş"
              aciklama="Açıkken giriş ekranında “Şirket hesabımla giriş yap” düğmesi görünür."
            >
              <Anahtar
                acik={etkin}
                etiket="Şirket hesabıyla giriş"
                pasif={islemde || (!etkin && !acilabilir)}
                onDegis={(v) => void girisiDegistir(s, v)}
              />
            </AyarSatiri>
            <AyarSatiri
              baslik="Yeni çalışanlar kendiliğinden katılsın"
              aciklama="Şirket hesabıyla ilk kez gelen çalışan, boş kullanıcı hakkı varsa davetsiz ekibe katılır."
            >
              <Anahtar
                acik={s.jitKatilim}
                etiket="Yeni çalışanlar kendiliğinden katılsın"
                pasif={islemde || !etkin}
                onDegis={(v) =>
                  etkinlestir(v, s.zorunlu, v ? 'Yeni çalışanlar artık kendiliğinden katılır.' : 'Yeni çalışanlar artık davetle katılır.')
                }
              />
            </AyarSatiri>
            <AyarSatiri
              baslik="Parolayla girişi kapat"
              aciklama="Ekibin yalnız şirket hesabıyla girer."
              uyari={
                !s.zorunlu && !bagliMi ? (
                  <>
                    Kapatmadan önce{' '}
                    <Link href={HESABIM_GUVENLIK_ADRESI} className="underline underline-offset-2">
                      Hesabım → Güvenlik
                    </Link>{' '}
                    sekmesindeki “Şirket hesabı” adımından kendi hesabını bağla; aksi hâlde sen de giriş yapamazsın.
                  </>
                ) : undefined
              }
            >
              <Anahtar
                acik={s.zorunlu}
                etiket="Parolayla girişi kapat"
                pasif={islemde || !etkin || (!s.zorunlu && !bagliMi)}
                onDegis={(v) => void zorunluDegistir(s, v)}
              />
            </AyarSatiri>
          </div>
        </Kart>
      )}

      {/* ── Ayarı sil ──────────────────────────────────────────────────── */}
      {s && (
        <Kart
          baslik="Ayarı sil"
          tehlike
          aciklama="Doğrulanmış alan adları da silinir. Parolası olmayan üyelere parola belirleme bağlantısı gönderilir."
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={silOnayi}
              onChange={(e) => setSilOnayi(e.target.value)}
              placeholder="Onaylamak için SİL yaz"
              aria-label="Onaylamak için SİL yaz"
              autoComplete="off"
              className={ALAN_SINIFI}
            />
            <button
              type="button"
              onClick={sil}
              disabled={islemde || silOnayi !== 'SİL'}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              Ayarı sil
            </button>
          </div>
        </Kart>
      )}
    </div>
  );
}
