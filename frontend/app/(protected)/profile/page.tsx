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
import api from '@/ortak/lib/api';
import { cn } from '@/ortak/lib/utils';
import { useCapabilities } from '@/ortak/contexts/CapabilitiesContext';
import { abonelikOzeti } from '@/ozellik/odeme/abonelik-ozeti';
import { toast } from '@/ortak/hooks/use-toast';

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
  } | null;
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

const SCOPE_LABEL: Record<string, string> = {
  mechanical: 'Mekanik',
  electrical: 'Elektrik',
  mep: 'MEP (Her Ikisi)',
};

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: typeof Crown }> = {
  core: { label: 'Core', color: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-200', icon: Shield },
  pro: { label: 'Pro', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: Crown },
  suite: { label: 'Suite', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200', icon: Zap },
};

const CORE_LIMITS = {
  quotes: 10,
  materials: 500,
  features: ['Malzeme eslestirme', 'Tek disiplin', 'Excel upload'],
};

const PRO_LIMITS = {
  quotes: 100,
  materials: 5000,
  features: ['Malzeme + Iscilik eslestirme', 'PDF / DWG upload', 'AI extraction', 'MEP destegi'],
};

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [yonetimAcik, setYonetimAcik] = useState(false);
  const { erisim, refresh } = useCapabilities();
  // Abonelik ozeti GERCEK kaynaktan (`/auth/me` → `erisim`) turetilir.
  const ozet = abonelikOzeti(erisim);

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
      setParolaHata('Yeni parolalar eslesmiyor.');
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
      if (data?.token) localStorage.setItem('token', data.token);
      setParolaSonuc(data?.mesaj ?? 'Parolaniz guncellendi.');
      setMevcutParola('');
      setYeniParola('');
      setYeniTekrar('');
    } catch (err: any) {
      setParolaHata(
        err.response?.data?.message || 'Parola guncellenemedi, tekrar deneyin.',
      );
    } finally {
      setParolaYukleniyor(false);
    }
  }

  async function iptalEt() {
    if (!confirm('Aboneliginizi iptal etmek istediginize emin misiniz? Donem sonuna kadar erisiminiz surer.')) return;
    try {
      await api.post('/abonelik/iptal', {});
      await refresh();
      setYonetimAcik(false);
    } catch {
      alert('Iptal islemi tamamlanamadi.');
    }
  }

  useEffect(() => {
    Promise.all([
      api.get<UserProfile>('/auth/me'),
      api.get<any>('/quotes').catch(() => ({ data: [] })),
    ]).then(([profileRes, quotesRes]) => {
      setProfile(profileRes.data);
      setStats({
        quoteCount: Array.isArray(quotesRes.data) ? quotesRes.data.length : 0,
        libraryCount: 0,
      });
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
        Profil bilgileri yuklenemedi.
      </div>
    );
  }

  // ⚠ `firmaRol` bu depoda 09.09.2026 oncesinde YAZILIP HIC OKUNMUYORDU.
  // Backend firma duzenlemeyi `sahip` ile kapiyor; ayni kural burada da
  // gosteriliyor. Amac guvenlik DEGIL (sunucu zaten reddeder), kullaniciyi
  // dolduramayacagi bir formla bosuna ugrastirmamak.
  const sahipMi = (profile.firmaRol ?? 'sahip') === 'sahip';
  const tier = profile.tier ?? 'core';
  const tierConfig = TIER_CONFIG[tier] ?? TIER_CONFIG.core;
  const TierIcon = tierConfig.icon;
  const limits = tier === 'pro' ? PRO_LIMITS : CORE_LIMITS;
  const initial = profile.email.charAt(0).toUpperCase();
  const memberSince = new Date(profile.createdAt).toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  // Kullanim orani (tahmini)
  const quoteUsage = stats?.quoteCount ?? 0;
  const quotePercent = Math.min(100, Math.round((quoteUsage / limits.quotes) * 100));

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-xl font-semibold">Hesabim</h1>

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
              Uye: {memberSince}
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
                {tier === 'pro' ? 'Profesyonel ozellikler' : 'Baslangic paketi'}
              </p>
            </div>
          </div>

          <ul className="mb-4 space-y-2">
            {limits.features.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                {f}
              </li>
            ))}
          </ul>

          {tier === 'core' && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="mb-2 text-xs font-medium text-blue-800">PRO'ya yukselt</p>
              <p className="text-[11px] text-blue-600">
                Iscilik eslestirme, PDF/DWG upload, MEP destegi ve daha fazlasi.
              </p>
              <Button size="sm" className="mt-2 h-7 bg-blue-600 text-xs hover:bg-blue-700">
                <Crown className="mr-1 h-3 w-3" />
                Yukselt
              </Button>
            </div>
          )}
        </div>

        {/* Kullanim */}
        <div className="rounded-xl border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold">Kullanim</h3>

          {/* Teklif kullanimi */}
          <div className="mb-4">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Teklifler (bu ay)</span>
              <span className="font-medium">{quoteUsage} / {limits.quotes}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  quotePercent > 80 ? 'bg-amber-500' : quotePercent > 95 ? 'bg-red-500' : 'bg-blue-500',
                )}
                style={{ width: `${quotePercent}%` }}
              />
            </div>
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
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Database className="h-3.5 w-3.5" />
                Malzeme Limiti
              </span>
              <span className="text-sm font-semibold">{limits.materials.toLocaleString('tr-TR')}</span>
            </div>
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
                    {ozet.durum}
                  </span>
                )}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {ozet.altMetin}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => router.push('/abonelik')}>
              Paketleri gor
            </Button>
          </div>

          {/* ── IPTAL: EN AZ UC TIKLAMA DERINLIKTE ──────────────────────
              03.09 kullanici karari: "Aboneligi iptal et secenegi minimum
              3 tiklama ile gorulebilsin — musterinin gozune sokmayalim."
              1) hesap sayfasi  2) bu bolumu ac  3) bagi tikla  4) onayla */}
          {ozet.iptalEdilebilir && (
            <div className="mt-4 border-t pt-3">
              <button
                type="button"
                onClick={() => setYonetimAcik((a) => !a)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Abonelik yonetimi {yonetimAcik ? '▴' : '▾'}
              </button>
              {yonetimAcik && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Iptal ettiginizde donem sonuna kadar erisiminiz surer.
                  </p>
                  <button
                    type="button"
                    onClick={iptalEt}
                    className="text-xs font-medium text-destructive underline underline-offset-2"
                  >
                    Aboneligi iptal et
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Yetenekler */}
      <div className="mb-6 rounded-xl border bg-card overflow-hidden">
        <div className="border-b px-5 py-3.5 text-sm font-semibold">Erisim Yetenekleri</div>
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
                { label: 'Iscilik', active: profile.capabilities.mechanical.labor },
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
                { label: 'Iscilik', active: profile.capabilities.electrical.labor },
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
              (yalnızca firma sahibi düzenleyebilir)
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

      {/* ── GUVENLIK · PAROLA (Faz 3.5) ───────────────────────────────── */}
      <div className="mb-6 rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center gap-2 border-b px-5 py-3.5 text-sm font-semibold">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          Parola
        </div>
        <form onSubmit={parolaDegistir} className="space-y-4 px-5 py-4">
          <p className="text-xs text-muted-foreground">
            Parolanizi degistirdiginizde diger cihazlardaki oturumlar kapatilir.
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
                minLength={8}
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
                minLength={8}
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
              {parolaYukleniyor ? 'Kaydediliyor...' : 'Parolayi degistir'}
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
            {/* ⚠ DÜRÜSTLÜK: "verileriniz silinir" DEMİYORUZ, çünkü silinmiyor.
                Kapatma erişimi keser; veri imhası ayrı bir taleptir. */}
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Hesabınız kapatılır, oturumunuz sonlandırılır ve varsa aboneliğiniz iptal
              edilir. Teklifleriniz ve kütüphaneniz sistemde kalmaya devam eder;
              tamamen imha edilmesini istiyorsanız bunu ayrıca iletmeniz gerekir.
              Aynı e-posta adresiyle yeniden kayıt olabilirsiniz.
            </p>
            {!kapatmaAcik ? (
              <Button type="button" variant="outline"
                className="mt-2 text-destructive"
                onClick={() => setKapatmaAcik(true)}>
                Hesabımı kapatmak istiyorum
              </Button>
            ) : (
              <form onSubmit={hesabimiKapat} className="mt-3 space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-[11px] text-muted-foreground">
                  Bu işlemin geri alma yolu yoktur. Onaylamak için parolanızı girin.
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
          Cikis Yap
        </Button>
      </div>
    </div>
  );
}
