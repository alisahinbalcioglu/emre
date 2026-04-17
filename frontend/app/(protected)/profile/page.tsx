'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  User, Mail, Calendar, Shield, Crown, Zap,
  Database, Wrench, FileText, LogOut, Loader2,
  CheckCircle, Clock, Package,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

interface UserProfile {
  id: string;
  email: string;
  role: string;
  tier: string;
  createdAt: string;
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

      {/* Abonelikler */}
      {profile.subscriptions.length > 0 && (
        <div className="mb-6 rounded-xl border bg-card overflow-hidden">
          <div className="border-b px-5 py-3.5 text-sm font-semibold">Aktif Abonelikler</div>
          <div className="divide-y">
            {profile.subscriptions.map((sub) => (
              <div key={sub.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className={cn(
                    'inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase',
                    sub.level === 'pro' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600',
                  )}>
                    {sub.level}
                  </span>
                  <span className="text-sm font-medium">{SCOPE_LABEL[sub.scope] ?? sub.scope}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {sub.endsAt
                    ? `Bitis: ${new Date(sub.endsAt).toLocaleDateString('tr-TR')}`
                    : 'Suresiz'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
