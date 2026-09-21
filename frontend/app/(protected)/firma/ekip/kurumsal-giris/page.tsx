'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F3b — KURUMSAL GİRİŞ AYARI (§1.7 / §6.8) — YALNIZ FİRMA SAHİBİ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ İSTEMCİ ANAHTARI ASLA ÖNCEDEN DOLDURULMAZ: sunucu onu hiçbir yanıtta
 *  döndürmüyor (yalnız `sirVar`). Boş bırakılırsa mevcut anahtar KORUNUR.
 *
 *  ⚠ "Bağlantıyı sına" PAROLA İSTER (R1-O3): çalınmış bir oturum anahtarı tek
 *  başına alan adı doğrulatamamalı — alan adı doğrulaması firmanın kimliğini
 *  belirler ve geri alınması yönetici müdahalesi ister.
 *
 *  ⚠ "Zorunlu kıl" anahtarı, sahibin hesabı bağlı değilken PASİFTİR: sunucu
 *  da reddeder (`ONCE_HESABINIZI_BAGLAYIN`) — ekran sunucuyla aynı kuralı
 *  söyler, iki ayrı gerçek üretmez.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import api from '@/ortak/lib/api';
import { kimlikHataMetni } from '@/ortak/lib/kimlik-hata-metinleri';
import { kurumsalGirisiBaslat } from '@/ozellik/kimlik/kurumsal-baslat';
import {
  DURUM_ROZETI,
  ENTRA_ADIMLARI,
  GOOGLE_ADIMLARI,
  HESAP_BAGLANMADI_METNI,
  SAGLAYICI_GORUNEN_AD,
} from '@/ozellik/firma/kurumsal-giris/kurumsal-giris-metinleri';

type Saglayici = {
  id: string;
  tip: 'entra' | 'google';
  entraKiraciId: string | null;
  clientId: string;
  sirVar: boolean;
  istemciSirriSonGecerlilik: string | null;
  beyanAlanAdlari: string[];
  dogrulanmisAlanAdlari: { alanAdi: string; dogrulandiAt: string }[];
  durum: 'TASLAK' | 'DOGRULANDI' | 'ETKIN' | 'KAPALI';
  jitKatilim: boolean;
  zorunlu: boolean;
  sonSinamaAt: string | null;
  sonHataKodu: string | null;
};
type Durum = { saglayici: Saglayici | null; donusAdresi: string };

export default function KurumsalGirisAyariSayfasi() {
  const arama = useSearchParams();
  const [durum, setDurum] = useState<Durum | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const [yetkisiz, setYetkisiz] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [baglıMi, setBagliMi] = useState(false);

  // Form
  const [tip, setTip] = useState<'entra' | 'google'>('entra');
  const [kiraciId, setKiraciId] = useState('');
  const [clientId, setClientId] = useState('');
  const [istemciSirri, setIstemciSirri] = useState('');
  const [sirBitis, setSirBitis] = useState('');
  const [alanAdlari, setAlanAdlari] = useState('');
  const [sinamaParolasi, setSinamaParolasi] = useState('');
  const [silOnayi, setSilOnayi] = useState('');

  async function yukle() {
    try {
      const [{ data }, me] = await Promise.all([
        api.get<Durum>('/firma/kurumsal-giris'),
        api.get('/auth/me'),
      ]);
      setDurum(data);
      setBagliMi(me.data?.kurumsal?.bagli === true);
      if (data.saglayici) {
        setTip(data.saglayici.tip);
        setKiraciId(data.saglayici.entraKiraciId ?? '');
        setClientId(data.saglayici.clientId);
        setSirBitis(data.saglayici.istemciSirriSonGecerlilik?.slice(0, 10) ?? '');
        setAlanAdlari(data.saglayici.beyanAlanAdlari.join(', '));
      }
    } catch (e: any) {
      if (e?.response?.status === 403) setYetkisiz(true);
      else setHata(kimlikHataMetni(e, 'Kurumsal giriş ayarı okunamadı.'));
    }
  }

  useEffect(() => {
    yukle();
  }, []);

  useEffect(() => {
    const sonuc = arama.get('sonuc');
    if (!sonuc) return;
    if (sonuc === 'sinandi') {
      setBilgi(
        arama.get('hesap') === 'baglanmadi'
          ? HESAP_BAGLANMADI_METNI
          : 'Bağlantı sınandı ve alan adınız doğrulandı.',
      );
    } else {
      setHata(kimlikHataMetni({ response: { data: { kod: sonuc } } }, 'Sınama başarısız oldu.'));
    }
  }, [arama]);

  async function kaydet(e: React.FormEvent) {
    e.preventDefault();
    setKaydediliyor(true);
    setHata(null);
    try {
      await api.put('/firma/kurumsal-giris', {
        tip,
        ...(tip === 'entra' ? { entraKiraciId: kiraciId.trim() } : {}),
        clientId: clientId.trim(),
        ...(istemciSirri ? { istemciSirri } : {}),
        ...(sirBitis ? { istemciSirriSonGecerlilik: new Date(sirBitis).toISOString() } : {}),
        beyanAlanAdlari: alanAdlari.split(',').map((a) => a.trim()).filter(Boolean),
      });
      setIstemciSirri('');
      setBilgi('Ayar kaydedildi. Şimdi "Bağlantıyı sına" ile şirket hesabınızla giriş yapın.');
      await yukle();
    } catch (e) {
      setHata(kimlikHataMetni(e, 'Ayar kaydedilemedi.'));
    } finally {
      setKaydediliyor(false);
    }
  }

  async function sina() {
    setHata(null);
    try {
      await kurumsalGirisiBaslat({ tip: 'niyet', amac: 'sinama', parola: sinamaParolasi });
    } catch (e) {
      setHata(kimlikHataMetni(e, 'Sınama başlatılamadı.'));
    }
  }

  async function etkinlestir(jitKatilim: boolean, zorunlu: boolean) {
    setHata(null);
    try {
      await api.post('/firma/kurumsal-giris/etkinlestir', { jitKatilim, zorunlu });
      await yukle();
    } catch (e) {
      setHata(kimlikHataMetni(e, 'Etkinleştirilemedi.'));
    }
  }

  async function kapat() {
    setHata(null);
    try {
      const { data } = await api.post('/firma/kurumsal-giris/kapat');
      setBilgi(
        data?.parolaSifirlamaGonderilen > 0
          ? `Şirket girişi kapatıldı. Parolası olmayan ${data.parolaSifirlamaGonderilen} üyeye parola belirleme bağlantısı gönderildi.`
          : 'Şirket girişi kapatıldı.',
      );
      await yukle();
    } catch (e) {
      setHata(kimlikHataMetni(e, 'Kapatılamadı.'));
    }
  }

  async function sil() {
    setHata(null);
    try {
      await api.delete('/firma/kurumsal-giris', { data: { onay: silOnayi } });
      setSilOnayi('');
      setBilgi('Şirket girişi ayarı silindi.');
      await yukle();
    } catch (e) {
      setHata(kimlikHataMetni(e, 'Silinemedi.'));
    }
  }

  if (yetkisiz) {
    return (
      <main className="p-6">
        <p className="text-slate-300">Bu sayfayı yalnız firma sahibi görebilir.</p>
        <Link href="/firma/ekip" className="text-blue-400 underline">
          Ekip sayfasına dön
        </Link>
      </main>
    );
  }
  if (!durum) {
    return (
      <main className="p-6">
        <p className="text-slate-400">{hata ?? 'Yükleniyor…'}</p>
      </main>
    );
  }

  const s = durum.saglayici;
  const adimlar = tip === 'entra' ? ENTRA_ADIMLARI : GOOGLE_ADIMLARI;
  const sirBitisYakin =
    s?.istemciSirriSonGecerlilik &&
    new Date(s.istemciSirriSonGecerlilik).getTime() - Date.now() < 14 * 24 * 3600_000;

  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Kurumsal giriş</h1>
        <p className="mt-1 text-sm text-slate-400">
          Ekibiniz şirket hesabıyla (Microsoft ya da Google) giriş yapsın.
        </p>
      </div>

      {bilgi && <p className="rounded border border-emerald-800 bg-emerald-950/40 p-3 text-sm text-emerald-200">{bilgi}</p>}
      {hata && <p className="rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">{hata}</p>}

      {s && (
        <section className="rounded border border-slate-800 p-4">
          <p className="text-sm text-slate-200">
            Durum: <strong>{DURUM_ROZETI[s.durum]?.etiket ?? s.durum}</strong>
          </p>
          <p className="mt-1 text-xs text-slate-400">{DURUM_ROZETI[s.durum]?.aciklama}</p>
          {s.dogrulanmisAlanAdlari.length > 0 && (
            <p className="mt-2 text-xs text-slate-300">
              Doğrulanmış alan adları: {s.dogrulanmisAlanAdlari.map((a) => a.alanAdi).join(', ')}
            </p>
          )}
          {s.sonHataKodu && (
            <p className="mt-2 text-xs text-amber-300">
              Son hata: {kimlikHataMetni({ response: { data: { kod: s.sonHataKodu } } }, s.sonHataKodu)}
            </p>
          )}
          {sirBitisYakin && (
            <p className="mt-2 text-xs text-amber-300">
              İstemci anahtarınızın süresi yaklaşıyor ({s.istemciSirriSonGecerlilik?.slice(0, 10)}).
              Süresi dolarsa ekibiniz şirket hesabıyla giriş yapamaz.
            </p>
          )}
        </section>
      )}

      <section className="rounded border border-slate-800 p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-100">Dönüş adresi</h2>
        <p className="mb-2 text-xs text-slate-400">
          Kimlik sağlayıcınızın uygulama kaydına bu adresi yazın.
        </p>
        <code className="block break-all rounded bg-slate-900 p-2 text-xs text-slate-200">
          {durum.donusAdresi}
        </code>
      </section>

      <section className="rounded border border-slate-800 p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-100">
          {SAGLAYICI_GORUNEN_AD[tip]} kurulumu
        </h2>
        <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-300">
          {adimlar.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ol>
      </section>

      <form onSubmit={kaydet} className="space-y-3 rounded border border-slate-800 p-4">
        <h2 className="text-sm font-semibold text-slate-100">Bilgiler</h2>
        <label className="block text-xs text-slate-300">
          Sağlayıcı
          <select
            value={tip}
            onChange={(e) => setTip(e.target.value as 'entra' | 'google')}
            className="mt-1 block w-full rounded bg-slate-900 p-2 text-sm text-slate-100"
          >
            <option value="entra">Microsoft Entra ID</option>
            <option value="google">Google Workspace</option>
          </select>
        </label>
        {tip === 'entra' && (
          <label className="block text-xs text-slate-300">
            Dizin (kiracı) kimliği
            <input
              value={kiraciId}
              onChange={(e) => setKiraciId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="mt-1 block w-full rounded bg-slate-900 p-2 text-sm text-slate-100"
            />
          </label>
        )}
        <label className="block text-xs text-slate-300">
          Uygulama (istemci) kimliği
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="mt-1 block w-full rounded bg-slate-900 p-2 text-sm text-slate-100"
          />
        </label>
        <label className="block text-xs text-slate-300">
          İstemci anahtarı (client secret)
          {/* ⚠ ASLA onceden doldurulmaz; bos birakilirsa mevcut anahtar korunur. */}
          <input
            type="password"
            value={istemciSirri}
            onChange={(e) => setIstemciSirri(e.target.value)}
            placeholder={s?.sirVar ? 'Değiştirmek istemiyorsanız boş bırakın' : ''}
            className="mt-1 block w-full rounded bg-slate-900 p-2 text-sm text-slate-100"
          />
        </label>
        <label className="block text-xs text-slate-300">
          Anahtarın bitiş tarihi
          <input
            type="date"
            value={sirBitis}
            onChange={(e) => setSirBitis(e.target.value)}
            className="mt-1 block w-full rounded bg-slate-900 p-2 text-sm text-slate-100"
          />
        </label>
        <label className="block text-xs text-slate-300">
          E-posta alan adlarınız (virgülle)
          <input
            value={alanAdlari}
            onChange={(e) => setAlanAdlari(e.target.value)}
            placeholder="firma.com.tr, firma.com"
            className="mt-1 block w-full rounded bg-slate-900 p-2 text-sm text-slate-100"
          />
        </label>
        <button
          type="submit"
          disabled={kaydediliyor}
          className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </form>

      {s && (
        <section className="space-y-3 rounded border border-slate-800 p-4">
          <h2 className="text-sm font-semibold text-slate-100">Bağlantıyı sına</h2>
          <p className="text-xs text-slate-400">
            Kendi şirket hesabınızla giriş yaparak alan adınızı kanıtlayın.
          </p>
          <input
            type="password"
            value={sinamaParolasi}
            onChange={(e) => setSinamaParolasi(e.target.value)}
            placeholder="Parolanız"
            className="block w-full rounded bg-slate-900 p-2 text-sm text-slate-100"
          />
          <button
            type="button"
            onClick={sina}
            className="rounded border border-slate-600 px-3 py-2 text-sm text-slate-100"
          >
            Bağlantıyı sına
          </button>
        </section>
      )}

      {s && (
        <section className="space-y-3 rounded border border-slate-800 p-4">
          <h2 className="text-sm font-semibold text-slate-100">Etkinleştirme</h2>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={s.jitKatilim}
              onChange={(e) => etkinlestir(e.target.checked, s.zorunlu)}
              disabled={s.durum === 'TASLAK'}
            />
            Şirket hesabıyla ilk kez gelen çalışan (boş kullanıcı hakkı varsa) ekibe katılsın
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={s.zorunlu}
              onChange={(e) => etkinlestir(s.jitKatilim, e.target.checked)}
              disabled={s.durum === 'TASLAK' || (!s.zorunlu && !baglıMi)}
            />
            Parolayla girişi kapat (yalnızca şirket hesabı)
          </label>
          {!s.zorunlu && !baglıMi && (
            <p className="text-xs text-amber-300">
              Zorunlu kılmadan önce Profil → Şirket hesabı adımından kendi hesabınızı bağlayın;
              aksi hâlde siz de giriş yapamazsınız.
            </p>
          )}
          {s.durum !== 'KAPALI' && (
            <button
              type="button"
              onClick={kapat}
              className="rounded border border-slate-600 px-3 py-2 text-sm text-slate-100"
            >
              Şirket girişini kapat
            </button>
          )}
        </section>
      )}

      {s && (
        <section className="space-y-2 rounded border border-red-900 p-4">
          <h2 className="text-sm font-semibold text-red-200">Ayarı sil</h2>
          <p className="text-xs text-slate-400">
            Doğrulanmış alan adları da silinir. Parolası olmayan üyelere parola belirleme
            bağlantısı gönderilir.
          </p>
          <input
            value={silOnayi}
            onChange={(e) => setSilOnayi(e.target.value)}
            placeholder="Onaylamak için SİL yazın"
            className="block w-full rounded bg-slate-900 p-2 text-sm text-slate-100"
          />
          <button
            type="button"
            onClick={sil}
            disabled={silOnayi !== 'SİL'}
            className="rounded bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Sil
          </button>
        </section>
      )}
    </main>
  );
}
