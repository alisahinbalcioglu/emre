'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  User, Mail, Calendar, Shield, Crown, Zap,
  Database, Wrench, FileText, LogOut, Loader2,
  CheckCircle, Clock, Package, KeyRound, Building2, ImageIcon, Trash2,
} from 'lucide-react';
import { Button } from '@/ortak/ui/button';
import { ParolaAlani } from '@/ortak/ui/parola-alani';
import { gecerliTokenMi } from '@/ortak/lib/oturum';
import { IkiAdimliGirisKarti } from '@/ozellik/kimlik/IkiAdimliGirisKarti';
import { SirketHesabiKarti, type KurumsalBilgi } from '@/ozellik/kimlik/SirketHesabiKarti';
// Veri imhası turu §8.1: "Hesabımı kapat" metni ARTIK DURUMA GÖRE değişiyor.
// ⚠ Karar burada HESAPLANMAZ — sunucunun `ayrilmaKarari` çıktısı olduğu gibi
// gelir, bu fonksiyon yalnız hangi cümlenin çizileceğini seçer.
import {
  hesapKapatmaMetni,
  type KapatmaOnizlemesi,
} from '@/ozellik/kimlik/kapatma-metinleri';
import { kapatmaOnizlemesiGetir } from '@/ozellik/kimlik/kapatma-onizleme-getir';
import api from '@/ortak/lib/api';
import { cn } from '@/ortak/lib/utils';
import { useCapabilities } from '@/ortak/contexts/CapabilitiesContext';
import { abonelikOzeti } from '@/ozellik/odeme/abonelik-ozeti';
import { toast } from '@/ortak/hooks/use-toast';
import { kalanKotaCumlesi, type CeviriKotaOzeti } from '@/ozellik/teklif/ceviri-kota';
import { sayiYaz } from '@/ozellik/odeme/paket-bicim';
// ⚠ ÇIPLAK SAYI YAZMAYIN: parola uzunluğu TEK sabitten okunur. 21.09'dan önce
// bu sayı ön yüzde dört ayrı yerde elle yazılıydı ve biri (kayıt ekranı) YANLIŞTI
// — kullanıcı 6 karakterle hesap açıp ertesi gün parolasını değiştiremiyordu.
// Sunucu kopyası: `backend/src/altyapi/auth/parola-kurali.ts` (kapı: test:parola-kapisi).
import { PAROLA_MIN } from '@/ortak/lib/parola-kurali';

interface UserProfile {
  id: string;
  email: string;
  role: string;
  tier: string;
  createdAt: string;
  // FAZ 4.1 — `/auth/me` artik KISI ve FIRMA alanlarini da tasiyor.
  // ⚠ Once bunlarin HICBIRI donmuyordu: sayfa firmanin ADINI bile
  //   yazamiyordu (yalniz `firmaId` geliyordu).
  ad?: string | null;
  soyad?: string | null;
  telefon?: string | null;
  firmaRol?: string;
  firma?: {
    id: string; ad: string; unvan: string | null;
    yetkiliEposta: string | null; faturaEposta: string | null;
    vergiNo: string | null; vergiDairesi: string | null; tcKimlikNo: string | null;
    faturaAdresi: string | null; il: string | null; ilce: string | null;
    telefon: string | null; logoMime: string | null; logoVar?: boolean;
    // FAZ 7 F2b: firma geneli iki adimli giris zorunlulugu (sahip anahtari).
    mfaZorunlu?: boolean;
  } | null;
  // FAZ 7 F2b (§4.4): guvenlik karti bu alandan beslenir. Sir ve kod
  // ozetleri BU YANITTA YOKTUR — yalniz durum ve SAYI.
  mfa?: {
    acik: boolean;
    acikAt: string | null;
    kaynak: string | null;
    kalanKurtarmaKodu: number;
    zorunlu: boolean;
    zorunlulukNedeni: 'yonetici' | 'firma' | null;
  };
  // FAZ 7 F3b (§6.7): sirket hesabi karti. `parolaTanimli: false` olan hesap
  // KURUMSAL GIRISLE ACILDI — parola formu yerine aciklama cizilir.
  kurumsal?: KurumsalBilgi;
  capabilities: {
    mechanical: { material: boolean; labor: boolean; dwg: boolean };
    electrical: { material: boolean; labor: boolean; dwg: boolean };
  };
  subscriptions: {
    id: string;
    level: string;
    scope: string;
    startsAt: string;
    endsAt: string | null;
  }[];
}

interface UserStats {
  quoteCount: number;
  libraryCount: number;
}

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: typeof Crown }> = {
  core: { label: 'Basic', color: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-200', icon: Shield },
  pro: { label: 'Pro', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: Crown },
  suite: { label: 'Suite', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200', icon: Zap },
};

// ── SABİT LİMİTLER KALDIRILDI (Faz 6, 14.09.2026) ─────────────────────────
// Burada `CORE_LIMITS { quotes: 10, materials: 500 }` ve `PRO_LIMITS` vardı.
// Hiçbiri sunucuda UYGULANMIYORDU (teklif sınırsız, malzeme sınırı yok) ve
// "AI extraction", "Tek disiplin" gibi paketlerle örtüşmeyen vaatler
// taşıyordu. Paketin GERÇEK tek kotası çeviri kotasıdır; o da sunucudan
// (`GET /ai/translate/kota`) okunur.

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [yonetimAcik, setYonetimAcik] = useState(false);
  const [ceviriKota, setCeviriKota] = useState<
    { durum: 'yukleniyor' } | { durum: 'hata' } | { durum: 'hazir'; kota: CeviriKotaOzeti | null }
  >({ durum: 'yukleniyor' });
  const { erisim, refresh } = useCapabilities();
  /**
   * ── YENİLENME GÜNÜ TEK KAYNAKTAN (21.09.2026) ────────────────────────
   * Bu sayfa aynı anda iki şey söylüyordu: kullanım kutusu "yenilenme
   * 01.10.2026", abonelik kutusu "Yenileme tarihi belirtilmemiş".
   *
   * ÖLÇÜLDÜ: iki ayrı dönem YOK. Kota dönemi `Abonelik.olusturuldu` çapası +
   * paketin periyodudur (`backend/.../ceviri-kotasi.ts` `kotaDonemi`; dosya
   * başlığı: "KOTA DÖNEMİ — abonelik dönemi, TAKVİM AYI DEĞİL"), yani ikisi
   * AYNI dönemdir. Abonelik kutusunun okuduğu `erisim.kalanGun` ise yenileme
   * DEĞİL, deneme/tolerans geri sayımıdır ve AKTIF abonelikte sunucu onu
   * bilerek `null` döndürür — cümle o yüzden hep "belirtilmemiş" diyordu.
   *
   * Artık gün TEK yerden okunur ve iki kutu AYNI biçimleyiciden geçer.
   */
  const donemBitisi =
    ceviriKota.durum === 'hazir' ? (ceviriKota.kota?.donemBitis ?? null) : null;
  // Abonelik ozeti GERCEK kaynaktan (`/auth/me` → `erisim`) turetilir.
  const ozet = abonelikOzeti(erisim, donemBitisi);

  // ── FAZ 4.1/4.3 · KİŞİ ve FİRMA BİLGİLERİ ────────────────────────────
  // Ölçüldü: şemadaki `vergiNo`, `vergiDairesi`, `tcKimlikNo`, `ilce`,
  // `faturaEposta` alanlarını fatura servisi OKUYOR ama hiçbir kod yolu
  // YAZMIYORDU — bu form o yolun ön yüzü.
  const [kisi, setKisi] = useState({ ad: '', soyad: '', telefon: '' });
  const [firma, setFirma] = useState({
    ad: '', unvan: '', vergiNo: '', vergiDairesi: '', tcKimlikNo: '',
    faturaAdresi: '', il: '', ilce: '', telefon: '', faturaEposta: '',
  });
  const [kisiKaydediliyor, setKisiKaydediliyor] = useState(false);
  const [firmaKaydediliyor, setFirmaKaydediliyor] = useState(false);
  const [bilgiSonuc, setBilgiSonuc] = useState<string | null>(null);
  const [bilgiHata, setBilgiHata] = useState<string | null>(null);
  const [logoSurum, setLogoSurum] = useState(0); // <img> önbelleğini kırmak için
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Sunucudan gelen değerleri forma taşı.
  useEffect(() => {
    if (!profile) return;
    setKisi({ ad: profile.ad ?? '', soyad: profile.soyad ?? '', telefon: profile.telefon ?? '' });
    const f = profile.firma;
    if (f) {
      setFirma({
        ad: f.ad ?? '', unvan: f.unvan ?? '', vergiNo: f.vergiNo ?? '',
        vergiDairesi: f.vergiDairesi ?? '', tcKimlikNo: f.tcKimlikNo ?? '',
        faturaAdresi: f.faturaAdresi ?? '', il: f.il ?? '', ilce: f.ilce ?? '',
        telefon: f.telefon ?? '', faturaEposta: f.faturaEposta ?? '',
      });
    }
  }, [profile]);

  async function kisiKaydet(e: React.FormEvent) {
    e.preventDefault();
    setBilgiHata(null); setBilgiSonuc(null); setKisiKaydediliyor(true);
    try {
      const { data } = await api.patch<UserProfile>('/auth/profil', kisi);
      setProfile(data);
      setBilgiSonuc('Kişi bilgileri kaydedildi.');
    } catch (err: any) {
      setBilgiHata(err?.response?.data?.message || 'Kaydedilemedi.');
    } finally { setKisiKaydediliyor(false); }
  }

  async function firmaKaydet(e: React.FormEvent) {
    e.preventDefault();
    setBilgiHata(null); setBilgiSonuc(null); setFirmaKaydediliyor(true);
    try {
      await api.patch('/firma', firma);
      const { data } = await api.get<UserProfile>('/auth/me');
      setProfile(data);
      setBilgiSonuc('Firma bilgileri kaydedildi.');
    } catch (err: any) {
      setBilgiHata(err?.response?.data?.message || 'Kaydedilemedi.');
    } finally { setFirmaKaydediliyor(false); }
  }

  async function logoYukle(dosya: File) {
    setBilgiHata(null); setBilgiSonuc(null);
    try {
      const fd = new FormData();
      fd.append('file', dosya);
      await api.post('/firma/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const { data } = await api.get<UserProfile>('/auth/me');
      setProfile(data);
      setLogoSurum((v) => v + 1);
      setBilgiSonuc('Logo yüklendi.');
    } catch (err: any) {
      setBilgiHata(err?.response?.data?.message || 'Logo yüklenemedi.');
    }
  }

  async function logoSil() {
    setBilgiHata(null); setBilgiSonuc(null);
    try {
      await api.delete('/firma/logo');
      const { data } = await api.get<UserProfile>('/auth/me');
      setProfile(data);
      setLogoSurum((v) => v + 1);
      setBilgiSonuc('Logo kaldırıldı.');
    } catch (err: any) {
      setBilgiHata(err?.response?.data?.message || 'Logo kaldırılamadı.');
    }
  }

  // ── FAZ 5.5 · KVKK m.11 — VERİ İNDİRME ve HESAP KAPATMA ──────────────
  const [veriIndiriliyor, setVeriIndiriliyor] = useState(false);
  const [kapatmaAcik, setKapatmaAcik] = useState(false);
  const [kapatmaParola, setKapatmaParola] = useState('');
  const [kapatiliyor, setKapatiliyor] = useState(false);
  const [kapatmaHata, setKapatmaHata] = useState<string | null>(null);
  // Veri imhası turu §8.1/§3.3.1 — kapatmanın BAŞKALARINI etkileyip
  // etkilemediğini kullanıcı ONAYDAN ÖNCE görmeli. `null` = ölçülemedi;
  // metin o zaman düz hâline düşer, sayı uydurmaz.
  const [kapatmaOnizleme, setKapatmaOnizleme] = useState<KapatmaOnizlemesi | null>(null);

  async function verileriIndir() {
    setVeriIndiriliyor(true);
    try {
      const { data } = await api.get('/auth/hesabim/verilerim');
      // Dosya olarak indir: tarayıcıda JSON göstermek 10 teklifte bile
      // okunamaz bir duvar üretir; kullanıcı dosyayı saklamak ister.
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `metapricex-verilerim-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Veriler indirilemedi',
        description: err?.response?.data?.message || 'Bir sorun oluştu.',
      });
    } finally {
      setVeriIndiriliyor(false);
    }
  }

  async function hesabimiKapat(e: React.FormEvent) {
    e.preventDefault();
    setKapatmaHata(null);
    setKapatiliyor(true);
    try {
      await api.post('/auth/hesabimi-kapat', { parola: kapatmaParola });
      // Oturum sunucuda zaten geçersizleşti (passwordChangedAt damgası);
      // yerelde de temizlenmezse kullanıcı 401 duvarına çarpar.
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      router.replace('/login');
    } catch (err: any) {
      setKapatmaHata(err?.response?.data?.message || 'Hesap kapatılamadı.');
    } finally {
      setKapatiliyor(false);
    }
  }

  // ── FAZ 3.5 · PAROLA DEGISTIRME ──────────────────────────────────────
  const [mevcutParola, setMevcutParola] = useState('');
  const [yeniParola, setYeniParola] = useState('');
  const [yeniTekrar, setYeniTekrar] = useState('');
  const [parolaYukleniyor, setParolaYukleniyor] = useState(false);
  const [parolaSonuc, setParolaSonuc] = useState<string | null>(null);
  const [parolaHata, setParolaHata] = useState<string | null>(null);

  async function parolaDegistir(e: React.FormEvent) {
    e.preventDefault();
    setParolaHata(null);
    setParolaSonuc(null);
    if (yeniParola !== yeniTekrar) {
      setParolaHata('Yeni parolalar eşleşmiyor.');
      return;
    }
    setParolaYukleniyor(true);
    try {
      const { data } = await api.post('/auth/change-password', {
        mevcutParola,
        yeniParola,
      });
      // ⚠ TAZE TOKEN'I SAKLAMAK ZORUNLU. Sunucu `passwordChangedAt`
      // damgaladi; elimizdeki ESKI token artik jwt.strategy'deki `iat`
      // kapisina takilir. Bu satir olmadan kullanici parolasini
      // degistirdikten sonraki ILK istekte 401 alir ve /login'e atilir —
      // yani basarili bir islem, cikis yaptirilmis gibi gorunur.
      // ⚠ FAZ 7 F1b (§6.1): yazim TEK yardimciyla. Parola degistirme yaniti
      // `user` tasimadigi icin yalniz TOKEN tazelenir — `oturumuYaz` iki
      // anahtari birden yazar ve `user`i null'a cevirirdi.
      if (gecerliTokenMi(data?.token)) localStorage.setItem('token', data.token);
      setParolaSonuc(data?.mesaj ?? 'Parolanız güncellendi.');
      setMevcutParola('');
      setYeniParola('');
      setYeniTekrar('');
    } catch (err: any) {
      setParolaHata(
        err.response?.data?.message || 'Parola güncellenemedi, tekrar deneyin.',
      );
    } finally {
      setParolaYukleniyor(false);
    }
  }

  async function iptalEt() {
    if (!confirm('Aboneliğinizi iptal etmek istediğinize emin misiniz? Dönem sonuna kadar erişiminiz sürer.')) return;
    try {
      await api.post('/abonelik/iptal', {});
      await refresh();
      setYonetimAcik(false);
    } catch {
      alert('İptal işlemi tamamlanamadı.');
    }
  }

  useEffect(() => {
    Promise.all([
      api.get<UserProfile>('/auth/me'),
      api.get<any>('/quotes').catch(() => ({ data: [] })),
      // Kota okunamazsa sayfa yine açılır; kutu "okunamadı" der, uydurmaz.
      api.get<CeviriKotaOzeti | null>('/ai/translate/kota').then((r) => ({ ok: true as const, data: r.data })).catch(() => ({ ok: false as const, data: null })),
      // Kapatma ön izlemesi: hata KENDİ İÇİNDE yutulur (uç henüz yok — bkz.
      // `kapatma-onizleme-getir.ts`), bu yüzden `Promise.all`ı düşürmez.
      // Açılışta çekilir ki uyarı, kullanıcı onay formunu açmadan ÖNCE
      // görünür olsun.
      kapatmaOnizlemesiGetir(),
    ]).then(([profileRes, quotesRes, kotaRes, onizleme]) => {
      setProfile(profileRes.data);
      setStats({
        quoteCount: Array.isArray(quotesRes.data) ? quotesRes.data.length : 0,
        libraryCount: 0,
      });
      setCeviriKota(kotaRes.ok ? { durum: 'hazir', kota: kotaRes.data ?? null } : { durum: 'hata' });
      setKapatmaOnizleme(onizleme);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.replace('/login');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Profil bilgileri yüklenemedi.
      </div>
    );
  }

  // ⚠ `firmaRol` bu depoda 09.09.2026 oncesinde YAZILIP HIC OKUNMUYORDU.
  // Backend firma duzenlemeyi `sahip` ile kapiyor; ayni kural burada da
  // gosteriliyor. Amac guvenlik DEGIL (sunucu zaten reddeder), kullaniciyi
  // dolduramayacagi bir formla bosuna ugrastirmamak.
  // ⚠ FAZ 7 F1b: ESKI HAL `(profile.firmaRol ?? 'sahip')` FAIL-OPEN idi —
  // alan yanittan dusunce HERKES sahip sayiliyordu. Cok kisili firmada bu,
  // uyeye firma duzenleme formunu ACARDI (sunucu reddeder ama kullanici
  // dolduramayacagi bir formla ugrasirdi). Artik fail-closed.
  const sahipMi = profile.firmaRol === 'sahip';
  // Veri imhası turu §8.1 — kapatma metni TEK saf fonksiyondan.
  // ⚠ `sahipMi` ile KARIŞTIRMAYIN: "firma sahibi miyim" ekranın form
  // kapısıdır; "firmam kapanıyor mu" ise sunucunun `ayrilmaKarari` kararıdır
  // ve firmada BAŞKA ETKİN SAHİP olup olmadığına bakar. İkisini aynı
  // saymak, iki sahipli firmada ikinci sahibe "firmanız kapanır" derdi.
  const kapatmaMetni = hesapKapatmaMetni(kapatmaOnizleme);
  const tier = profile.tier ?? 'core';
  const tierConfig = TIER_CONFIG[tier] ?? TIER_CONFIG.core;
  const TierIcon = tierConfig.icon;
  const initial = profile.email.charAt(0).toUpperCase();
  const memberSince = new Date(profile.createdAt).toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const quoteUsage = stats?.quoteCount ?? 0;
  const kota = ceviriKota.durum === 'hazir' ? ceviriKota.kota : null;
  const kotaYuzde = kota && kota.kota.satir > 0
    ? Math.min(100, Math.round((kota.kullanilanSatir / kota.kota.satir) * 100))
    : 0;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-xl font-semibold">Hesabım</h1>

      {/* Profile Card */}
      <div className="mb-6 rounded-xl border bg-card overflow-hidden">
        {/* Header with gradient */}
        <div className="relative h-24 bg-gradient-to-r from-blue-600 to-blue-800">
          <div className="absolute -bottom-8 left-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-blue-600 text-xl font-bold text-white shadow-lg">
              {initial}
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 pt-12">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold">{profile.email.split('@')[0]}</h2>
              <p className="text-sm text-muted-foreground">{profile.email}</p>
            </div>
            <span className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold uppercase',
              tierConfig.bg, tierConfig.color, `border ${tierConfig.border}`,
            )}>
              <TierIcon className="h-3.5 w-3.5" />
              {tierConfig.label} Plan
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              {profile.email}
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Üye: {memberSince}
            </span>
            {profile.role === 'admin' && (
              <span className="flex items-center gap-1.5 text-violet-600">
                <Shield className="h-3.5 w-3.5" />
                Admin
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Two-Column: Package + Usage */}
      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Paket Bilgileri */}
        <div className={cn('rounded-xl border-2 p-5', tierConfig.border, tierConfig.bg.replace('50', '50/30'))}>
          <div className="mb-4 flex items-center gap-3">
            <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', tierConfig.bg)}>
              <TierIcon className={cn('h-5 w-5', tierConfig.color)} />
            </div>
            <div>
              <h3 className="text-sm font-semibold">{tierConfig.label} Plan</h3>
              <p className="text-xs text-muted-foreground">
                {tier === 'pro' ? 'Profesyonel özellikler' : 'Başlangıç paketi'}
              </p>
            </div>
          </div>

          <ul className="mb-4 space-y-2">
            <li className="flex items-center gap-2 text-sm">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
              Sınırsız teklif
            </li>
            {kota && (
              <li className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                Dönem başına {sayiYaz(kota.kota.satir)} satır çeviri (en fazla {sayiYaz(kota.kota.dosya)} dosya)
              </li>
            )}
          </ul>

          {tier === 'core' && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="mb-2 text-xs font-medium text-blue-800">Pro pakete geçin</p>
              <p className="text-[11px] text-blue-600">
                İşçilik fiyatlandırması ve DWG/DXF metrajı Pro pakete dâhildir.
              </p>
              <Button
                size="sm"
                className="mt-2 h-7 bg-blue-600 text-xs hover:bg-blue-700"
                onClick={() => router.push('/abonelik')}
              >
                <Crown className="mr-1 h-3 w-3" />
                Paketleri gör
              </Button>
            </div>
          )}
        </div>

        {/* Kullanim */}
        <div className="rounded-xl border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold">Kullanım</h3>

          {/* Çeviri kotası — paketin tek gerçek kotası, sunucudan */}
          <div className="mb-4">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              {/* "bu dönem" belirsizdi: takvim ayı sanılıyordu. Dönem, abonelik
                  dönemidir (sözleşme §"Kota takvim ayına göre değil abonelik
                  döneminize göre yenilenir") ve abonelik kutusundaki yenilenme
                  günüyle AYNI dönemdir. */}
              <span className="text-muted-foreground">Çeviri kotası (bu abonelik dönemi)</span>
              {kota && (
                <span className="font-medium">
                  {sayiYaz(kota.kullanilanSatir)} / {sayiYaz(kota.kota.satir)} satır
                </span>
              )}
            </div>
            {kota ? (
              <>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      kotaYuzde > 95 ? 'bg-red-500' : kotaYuzde > 80 ? 'bg-amber-500' : 'bg-blue-500',
                    )}
                    style={{ width: `${kotaYuzde}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">{kalanKotaCumlesi(kota)}</p>
                {/* Kısıtlı/askıdaki firmada kota görünür ama çeviri 403 alır —
                    "kalan 3.000 satır" yazıp kapalı olduğunu söylememek yanıltır. */}
                {kota.ceviriAcik === false && (
                  <p className="mt-1 text-[11px] font-medium text-amber-700">
                    Aboneliğiniz kısıtlı olduğu için çeviri şu an kapalı.
                  </p>
                )}
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {ceviriKota.durum === 'hata'
                  ? 'Çeviri kotası şu an okunamadı.'
                  : ceviriKota.durum === 'yukleniyor'
                    ? 'Yükleniyor…'
                    : 'Aktif aboneliğiniz olmadığı için çeviri kotası yok.'}
              </p>
            )}
          </div>

          {/* Stat items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                Toplam Teklifler
              </span>
              <span className="text-sm font-semibold">{quoteUsage}</span>
            </div>
            {kota && (
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Database className="h-3.5 w-3.5" />
                  Çevrilen dosya (bu dönem)
                </span>
                <span className="text-sm font-semibold">
                  {sayiYaz(kota.kullanilanDosya)} / {sayiYaz(kota.kota.dosya)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── ABONELIK ────────────────────────────────────────────────────
           ⚠ 03.09: bu blok ESKI `UserSubscription` tablosunu gosteriyordu
           (`auth.service.ts:89`) ve `/abonelik` sayfasindaki GERCEK kayitla
           CELISIYORDU: burada "MEP — Suresiz", orada "miras-pro AKTIF".
           ADIM 2'den beri yetenekler `Abonelik`ten turetiliyor; eski tablo
           KALINTI. Kullanici "abonelik bilgisini komple hesap sayfasina
           tasi" dedigi icin, tasirken DOGRU kaynaga baglandi — yoksa
           yanlis veri TEK kaynak olurdu. */}
      <div className="mb-6 rounded-xl border bg-card overflow-hidden">
        <div className="border-b px-5 py-3.5 text-sm font-semibold">Abonelik</div>
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">
                {ozet.baslik}
                {ozet.durum && (
                  <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                    {ozet.durumEtiketi}
                  </span>
                )}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {ozet.altMetin}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => router.push('/abonelik')}>
              Paketleri gör
            </Button>
          </div>

          {/* ── IPTAL: EN AZ UC TIKLAMA DERINLIKTE ──────────────────────
              03.09 kullanici karari: "Aboneligi iptal et secenegi minimum
              3 tiklama ile gorulebilsin — musterinin gozune sokmayalim."
              1) hesap sayfasi  2) bu bolumu ac  3) bagi tikla  4) onayla

              ⚠ 21.09'DA OLCULDU — SAHIP KAPISI EKLENDI: bu bolum role
              BAKMIYORDU, oysa `POST /abonelik/iptal` sunucuda
              `@FirmaRolu('sahip')` ile kapali (`abonelik.controller.ts`).
              Uye bagi goruyor, basiyor ve "Iptal islemi tamamlanamadi"
              aliyordu — tiklanabilir ama CALISMAYAN bir bag. Sozlesme de
              boyle diyor: "abonelik, odeme ve fatura bilgilerini YALNIZ
              firma sahibi gorur ve yonetir" (`hukuki/metinler.ts`).

              ⚠ UYEYE BOLUM TAMAMEN GIZLENMEZ: gizleseydik uye "iptal
              edemiyorum, nereden edilir?" sorusuyla destege yazardi. Tek
              satir bilgi kalir, DUGME kalmaz — basamayacagi seye bakmaz
              ama ne yapmasi gerektigini bilir. Derinlik kurali sahip icin
              aynen duruyor (dort adim). */}
          {ozet.iptalEdilebilir && !sahipMi && (
            <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
              Aboneliği yalnız firma sahibi iptal edebilir. İptal talebinizi
              firma sahibinize iletin.
            </p>
          )}
          {ozet.iptalEdilebilir && sahipMi && (
            <div className="mt-4 border-t pt-3">
              <button
                type="button"
                onClick={() => setYonetimAcik((a) => !a)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Abonelik yönetimi {yonetimAcik ? '▴' : '▾'}
              </button>
              {yonetimAcik && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    İptal ettiğinizde dönem sonuna kadar erişiminiz sürer.
                  </p>
                  <button
                    type="button"
                    onClick={iptalEt}
                    className="text-xs font-medium text-destructive underline underline-offset-2"
                  >
                    Aboneliği iptal et
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Yetenekler */}
      <div className="mb-6 rounded-xl border bg-card overflow-hidden">
        <div className="border-b px-5 py-3.5 text-sm font-semibold">Erişim Yetenekleri</div>
        <div className="grid grid-cols-2 divide-x">
          {/* Mekanik */}
          <div className="p-5">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Wrench className="h-4 w-4 text-blue-600" />
              Mekanik
            </h4>
            <div className="space-y-2">
              {[
                { label: 'Malzeme', active: profile.capabilities.mechanical.material },
                { label: 'İşçilik', active: profile.capabilities.mechanical.labor },
                { label: 'DWG/PDF', active: profile.capabilities.mechanical.dwg },
              ].map((cap) => (
                <div key={cap.label} className="flex items-center gap-2 text-sm">
                  {cap.active ? (
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <div className="h-3.5 w-3.5 rounded-full border-2 border-slate-200" />
                  )}
                  <span className={cap.active ? '' : 'text-muted-foreground'}>{cap.label}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Elektrik */}
          <div className="p-5">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Zap className="h-4 w-4 text-amber-500" />
              Elektrik
            </h4>
            <div className="space-y-2">
              {[
                { label: 'Malzeme', active: profile.capabilities.electrical.material },
                { label: 'İşçilik', active: profile.capabilities.electrical.labor },
                { label: 'DWG/PDF', active: profile.capabilities.electrical.dwg },
              ].map((cap) => (
                <div key={cap.label} className="flex items-center gap-2 text-sm">
                  {cap.active ? (
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <div className="h-3.5 w-3.5 rounded-full border-2 border-slate-200" />
                  )}
                  <span className={cap.active ? '' : 'text-muted-foreground'}>{cap.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── FAZ 4.1/4.3 · KİŞİ BİLGİLERİ ──────────────────────────────── */}
      <div className="mb-6 rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center gap-2 border-b px-5 py-3.5 text-sm font-semibold">
          <User className="h-4 w-4 text-muted-foreground" />
          Kişi Bilgileri
        </div>
        <form onSubmit={kisiKaydet} className="space-y-4 px-5 py-4">
          <p className="text-xs text-muted-foreground">
            Bu bilgiler teklif çıktısındaki “Hazırlayan” alanında ve iletişimde kullanılır.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Ad</label>
              <input
                value={kisi.ad}
                onChange={(e) => setKisi((o) => ({ ...o, ad: e.target.value }))}
                placeholder=""
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Soyad</label>
              <input
                value={kisi.soyad}
                onChange={(e) => setKisi((o) => ({ ...o, soyad: e.target.value }))}
                placeholder=""
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Telefon</label>
              <input
                value={kisi.telefon}
                onChange={(e) => setKisi((o) => ({ ...o, telefon: e.target.value }))}
                placeholder="0533 000 00 00"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          {/* ⚠ E-posta BİLEREK düzenlenemez: adres değişimi kimliğin kendisini
              değiştirir ve doğrulama zinciri gerektirir (yeni adrese doğrulama,
              eskisine bilgilendirme, emailVerified sıfırlama). Backend DTO’su da
              `email` alanını kabul etmez; `whitelist:true` onu sessizce atar. */}
          <p className="text-[11px] text-muted-foreground">
            E-posta adresi ({profile.email}) buradan değiştirilemez.
          </p>
          <Button type="submit" disabled={kisiKaydediliyor}>
            {kisiKaydediliyor ? 'Kaydediliyor…' : 'Kişi bilgilerini kaydet'}
          </Button>
        </form>
      </div>

      {/* ── FAZ 4.1/4.3 · FİRMA BİLGİLERİ ─────────────────────────────── */}
      <div className="mb-6 rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center gap-2 border-b px-5 py-3.5 text-sm font-semibold">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          Firma Bilgileri
          {!sahipMi && (
            <span className="ml-2 text-[11px] font-normal text-muted-foreground">
              (yalnızca firma sahibi düzenleyebilir · T.C. kimlik no ve yetkili
              e-postası yalnız firma sahibine görünür)
            </span>
          )}
        </div>
        <form onSubmit={firmaKaydet} className="space-y-4 px-5 py-4">
          {/* Ölçüldü: vergiNo / vergiDairesi / tcKimlikNo / ilce / faturaEposta
              alanlarını fatura servisi OKUYOR ama bugüne kadar hiçbir kod yolu
              YAZMIYORDU — bu form o yolun ön yüzü. Sonuç: her kurumsal fatura
              vergi numarasız gidiyor ve müşteri e-postasıyla tekilleşiyordu. */}
          <p className="text-xs text-muted-foreground">
            Faturada ve teklif çıktısının antedinde bu bilgiler kullanılır. Boş
            bırakılan alan faturayı engellemez ama fatura elle işleme düşer.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Görünen ad</label>
              <input
                value={firma.ad}
                onChange={(e) => setFirma((o) => ({ ...o, ad: e.target.value }))}
                placeholder="Kısa ad"
                disabled={!sahipMi}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Resmi unvan (faturada)</label>
              <input
                value={firma.unvan}
                onChange={(e) => setFirma((o) => ({ ...o, unvan: e.target.value }))}
                placeholder="Örn. Acme Mühendislik Ltd. Şti."
                disabled={!sahipMi}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Vergi no</label>
              <input
                value={firma.vergiNo}
                onChange={(e) => setFirma((o) => ({ ...o, vergiNo: e.target.value }))}
                placeholder=""
                disabled={!sahipMi}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Vergi dairesi</label>
              <input
                value={firma.vergiDairesi}
                onChange={(e) => setFirma((o) => ({ ...o, vergiDairesi: e.target.value }))}
                placeholder=""
                disabled={!sahipMi}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">TC kimlik no (şahıs şirketi)</label>
              <input
                value={firma.tcKimlikNo}
                onChange={(e) => setFirma((o) => ({ ...o, tcKimlikNo: e.target.value }))}
                placeholder=""
                disabled={!sahipMi}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Fatura e-postası</label>
              <input
                value={firma.faturaEposta}
                onChange={(e) => setFirma((o) => ({ ...o, faturaEposta: e.target.value }))}
                placeholder=""
                disabled={!sahipMi}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Telefon</label>
              <input
                value={firma.telefon}
                onChange={(e) => setFirma((o) => ({ ...o, telefon: e.target.value }))}
                placeholder="0212 000 00 00"
                disabled={!sahipMi}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">İl</label>
              <input
                value={firma.il}
                onChange={(e) => setFirma((o) => ({ ...o, il: e.target.value }))}
                placeholder=""
                disabled={!sahipMi}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">İlçe</label>
              <input
                value={firma.ilce}
                onChange={(e) => setFirma((o) => ({ ...o, ilce: e.target.value }))}
                placeholder=""
                disabled={!sahipMi}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Fatura adresi</label>
              <input
                value={firma.faturaAdresi}
                onChange={(e) => setFirma((o) => ({ ...o, faturaAdresi: e.target.value }))}
                placeholder=""
                disabled={!sahipMi}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              />
            </div>
          </div>

          {/* ── LOGO ────────────────────────────────────────────────────
              ⚠ Logo ikili verisi JSON yanıtında GELMEZ (Prisma Bytes→base64 her
              sayfa açılışında taşınırdı); varlığı `logoVar` ile bildirilir,
              içeriği ayrı uçtan çekilir. `logoSurum` tarayıcı önbelleğini kırar —
              yoksa yeni yüklenen logo eskisi gibi görünür ve kullanıcı
              “yükleme çalışmadı” sanır. */}
          <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 p-4">
            <div className="flex h-16 w-32 items-center justify-center overflow-hidden rounded border bg-white">
              {profile.firma?.logoVar ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={`${process.env.NEXT_PUBLIC_API_URL || '/api'}/firma/logo?v=${logoSurum}`}
                  alt="Firma logosu"
                  className="max-h-16 max-w-32 object-contain"
                />
              ) : (
                <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-slate-700">Firma logosu</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                PNG, JPEG veya WEBP · en fazla 2 MB. Teklif çıktısının antedinde kullanılır.
              </p>
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) logoYukle(f);
                // Aynı dosyayı ikinci kez seçebilmek için değeri sıfırla.
                e.target.value = '';
              }}
            />
            <Button type="button" variant="outline" disabled={!sahipMi}
              onClick={() => logoInputRef.current?.click()}>
              {profile.firma?.logoVar ? 'Logoyu değiştir' : 'Logo yükle'}
            </Button>
            {profile.firma?.logoVar && (
              <Button type="button" variant="outline" disabled={!sahipMi}
                className="text-destructive" onClick={logoSil}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Kaldır
              </Button>
            )}
          </div>

          {bilgiHata && (
            <p role="alert" className="text-xs text-destructive">{bilgiHata}</p>
          )}
          {bilgiSonuc && (
            <p className="text-xs text-emerald-600">{bilgiSonuc}</p>
          )}
          <Button type="submit" disabled={firmaKaydediliyor || !sahipMi}>
            {firmaKaydediliyor ? 'Kaydediliyor…' : 'Firma bilgilerini kaydet'}
          </Button>
        </form>
      </div>

      {/* ── FAZ 7 F2b · IKI ADIMLI GIRIS ──────────────────────────────── */}
      {profile.mfa && (
        <IkiAdimliGirisKarti
          mfa={profile.mfa}
          onTokenTazele={(token) => {
            // ⚠ Ayni gerekce parola kartindaki satirla BIREBIR AYNI: MFA
            // acma/kapatma `passwordChangedAt` damgalar ve elimizdeki ESKI
            // token o anda gecersizlesir. Yanit `user` TASIMADIGI icin
            // `oturumuYaz` degil, yalniz TOKEN tazelenir.
            if (gecerliTokenMi(token)) localStorage.setItem('token', token);
          }}
          onYenile={() => {
            api.get<UserProfile>('/auth/me').then(({ data }) => setProfile(data)).catch(() => {});
          }}
        />
      )}

      {/* ── FAZ 7 F3b · SIRKET HESABI ─────────────────────────────────── */}
      {profile.kurumsal && (
        <SirketHesabiKarti
          kurumsal={profile.kurumsal}
          onYenile={() => {
            api.get<UserProfile>('/auth/me').then(({ data }) => setProfile(data)).catch(() => {});
          }}
        />
      )}

      {/* ── GUVENLIK · PAROLA (Faz 3.5) ───────────────────────────────── */}
      <div className="mb-6 rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center gap-2 border-b px-5 py-3.5 text-sm font-semibold">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          Parola
        </div>
        <form onSubmit={parolaDegistir} className="space-y-4 px-5 py-4">
          <p className="text-xs text-muted-foreground">
            Parolanızı değiştirdiğinizde diğer cihazlardaki oturumlar kapatılır.
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="mevcutParola" className="mb-1.5 block text-xs font-semibold text-slate-700">
                Mevcut parola
              </label>
              <ParolaAlani
                id="mevcutParola"
                value={mevcutParola}
                onChange={setMevcutParola}
                autoComplete="current-password"
              />
            </div>
            <div>
              <label htmlFor="yeniParola" className="mb-1.5 block text-xs font-semibold text-slate-700">
                Yeni parola
              </label>
              <ParolaAlani
                id="yeniParola"
                value={yeniParola}
                onChange={setYeniParola}
                autoComplete="new-password"
                minLength={PAROLA_MIN}
              />
            </div>
            <div>
              <label htmlFor="yeniTekrar" className="mb-1.5 block text-xs font-semibold text-slate-700">
                Yeni parola (tekrar)
              </label>
              <ParolaAlani
                id="yeniTekrar"
                value={yeniTekrar}
                onChange={setYeniTekrar}
                autoComplete="new-password"
                minLength={PAROLA_MIN}
              />
            </div>
          </div>

          {parolaHata && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
              {parolaHata}
            </p>
          )}
          {parolaSonuc && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800">
              {parolaSonuc}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={parolaYukleniyor}>
              {parolaYukleniyor ? 'Kaydediliyor…' : 'Parolayı değiştir'}
            </Button>
          </div>
        </form>
      </div>

      {/* ── FAZ 5.5 · KVKK m.11 HAKLARI ────────────────────────────────
          ⚠ Bu iki uç ÖDEME KAPISININ ARKASINDA DEĞİL. Mevcut dışa aktarım
          uçlarının hepsi `CIKTI_INDIR` taşıyor ve o yetenek kısıtlı modda
          KAPALI — yani ödemesi geciken kullanıcı kendi verisini
          indiremiyordu. Bir KVKK hakkı ödeme durumuna bağlanamaz. */}
      <div className="mb-6 rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center gap-2 border-b px-5 py-3.5 text-sm font-semibold">
          <Shield className="h-4 w-4 text-muted-foreground" />
          Verileriniz ve Hesabınız
        </div>
        <div className="space-y-5 px-5 py-4">
          <div>
            <p className="text-xs font-semibold text-slate-700">Verilerimi indir</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Hesabınızla ilişkili verilerin makine-okunur (JSON) kopyası. Teklifleriniz,
              kütüphaneniz, firma bilgileriniz ve abonelik kayıtlarınız dahildir.
              Yüklediğiniz orijinal dosyalar ile logo ikili veri olduğu için dosyaya
              gömülmez; adları ve indirme adresleri listelenir.
            </p>
            <Button type="button" variant="outline" className="mt-2"
              disabled={veriIndiriliyor} onClick={verileriIndir}>
              <Database className="mr-2 h-4 w-4" />
              {veriIndiriliyor ? 'Hazırlanıyor…' : 'Verilerimi indir (JSON)'}
            </Button>
          </div>

          <div className="border-t pt-4">
            <p className="text-xs font-semibold text-destructive">Hesabımı kapat</p>
            {/* ⚠ METİN ARTIK TEK SAF FONKSİYONDAN (veri imhası turu §8.1).
                ESKİ HÂL ÜÇ YANLIŞ İDDİA TAŞIYORDU: "sistemde kalmaya devam
                eder" (artık 30 gün sonra imha ediliyor), "ayrıca iletmeniz
                gerekir" (imha kendiliğinden işliyor) ve "aynı e-posta
                adresiyle yeniden kayıt olabilirsiniz" (30 gün boyunca yeni
                kayıt AÇILMIYOR; hesap geri açılıyor — §4.3).
                Cümleyi buraya GERİ YAZMAYIN: `kapatma-metinleri.ts`. */}
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {kapatmaMetni.govde}
            </p>
            {/* Duruma özel ek cümle. `null` gelince kutu HİÇ çizilmez — boş
                çerçeve bırakmaz (`kisi-metinleri.ts` `altSatir` deseni). */}
            {kapatmaMetni.ek && (
              <p
                role={kapatmaMetni.ekTuru === 'uyari' ? 'alert' : undefined}
                className={cn(
                  'mt-2 rounded-lg border p-2.5 text-[11px]',
                  kapatmaMetni.ekTuru === 'uyari'
                    ? 'border-destructive/40 bg-destructive/5 text-destructive'
                    : 'border-slate-200 bg-slate-50 text-slate-700',
                )}
              >
                {kapatmaMetni.ek}
              </p>
            )}
            {!kapatmaAcik ? (
              <Button type="button" variant="outline"
                className="mt-2 text-destructive"
                onClick={() => setKapatmaAcik(true)}>
                Hesabımı kapatmak istiyorum
              </Button>
            ) : (
              <form onSubmit={hesabimiKapat} className="mt-3 space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                {/* ⚠ BURADAKİ ESKİ CÜMLE ("geri alma yolu" olmadığını
                    söyleyen uyarı) K1 kararıyla YANLIŞ OLDU: 30 gün içinde
                    giriş yapıp paket seçerek hesap geri açılıyor. Hemen
                    üstündeki metin bunu söylerken burada tersini yazmak
                    müşteriyi caydırırdı — iki cümle aynı ekranda çelişemez.
                    Cümlenin kendisi testte yasaklı; yorumda da yazmayın. */}
                <p className="text-[11px] text-muted-foreground">
                  Hesabınız hemen kapatılır ve oturumunuz sonlandırılır.
                  Onaylamak için parolanızı girin.
                </p>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={kapatmaParola}
                  onChange={(e) => setKapatmaParola(e.target.value)}
                  placeholder="Parolanız"
                  required
                  className="h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                {kapatmaHata && (
                  <p role="alert" className="text-xs text-destructive">{kapatmaHata}</p>
                )}
                <div className="flex gap-2">
                  <Button type="submit" variant="outline"
                    className="text-destructive" disabled={kapatiliyor}>
                    {kapatiliyor ? 'Kapatılıyor…' : 'Hesabımı kapat'}
                  </Button>
                  <Button type="button" variant="outline"
                    onClick={() => { setKapatmaAcik(false); setKapatmaHata(null); }}>
                    Vazgeç
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Cikis */}
      <div className="flex justify-end">
        <Button variant="outline" className="text-destructive hover:bg-destructive/10" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Çıkış Yap
        </Button>
      </div>
    </div>
  );
}
