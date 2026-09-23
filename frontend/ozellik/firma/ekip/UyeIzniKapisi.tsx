'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock, Mail } from 'lucide-react';
import { useCapabilities } from '@/ortak/contexts/CapabilitiesContext';
import { izinTanimi, yoneticiyeYazBaglantisi } from './izin-metinleri';
import { basHarfler } from './kisi-metinleri';
import { uyeIzniDurdurulsunMu } from './uye-izni-kapisi';
import { useFirmaYoneticisi } from './useFirmaYoneticisi';

/**
 * 23.09.2026 — UYE IZNI KAPISI (kabukta, `ErisimKapisi`nin ICINDE).
 *
 * Izni kapali alt kullanici `/library`, `/labor-firms` ya da `/dwg-workspace`e
 * girerse sayfa icerigi yerine "<Bölüm>'e erişimin yok" sayfasi cizilir
 * (ikinci tasarim · ekran 5); sayfa hic mount olmaz, yani 403 alacak istekler
 * YOLA CIKMAZ (kirmizi bildirim olmaz).
 *
 * ⚠ BEKLEME `ErisimKapisi`nde: o `/auth/me` gelene kadar cocuklari cizmez,
 * bu bilesen de onun ICINDE durdugu icin izin listesi burada artik bellidir.
 */
export function UyeIzniKapisi({ children }: { children: ReactNode }) {
  const { izinVar } = useCapabilities();
  const yol = usePathname() ?? '';
  const izin = uyeIzniDurdurulsunMu(yol, izinVar);
  if (!izin) return <>{children}</>;
  return <KapaliBolum izin={izin} />;
}

function KapaliBolum({ izin }: { izin: NonNullable<ReturnType<typeof uyeIzniDurdurulsunMu>> }) {
  const tanim = izinTanimi(izin);
  const yonetici = useFirmaYoneticisi(true);

  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col items-center px-4 py-14 text-center">
      <div className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-slate-100 text-slate-600">
        <Lock className="h-6 w-6" aria-hidden="true" />
      </div>
      <h1 className="mt-5 text-[22px] font-semibold tracking-tight text-gray-900">
        {tanim?.erisimYokBasligi ?? 'Bu bölüme erişimin yok'}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">
        {tanim?.erisimYokAciklamasi ?? 'Firma yöneticin bu bölümü senin için kapalı tuttu.'}
      </p>

      <div className="mt-7 flex w-full flex-wrap items-center gap-3 rounded-xl border border-[#e5e7eb] bg-white px-4 py-3.5 text-left">
        <div
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2563eb] text-sm font-bold text-white"
        >
          {yonetici ? basHarfler({ eposta: yonetici }, 1) : '?'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-gray-500">Firma yöneticin</div>
          <div className="mt-0.5 truncate text-sm font-semibold text-gray-900">
            {yonetici === undefined ? 'Yükleniyor…' : (yonetici ?? 'Adresi şu an alınamadı')}
          </div>
        </div>
        {yonetici && (
          <a
            href={yoneticiyeYazBaglantisi(yonetici, izin)}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-[#e5e7eb] bg-white px-3.5 text-[13px] font-semibold text-gray-900 transition-colors hover:bg-gray-50"
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            E-posta gönder
          </a>
        )}
      </div>

      {/* Üyenin kendi erişim etiketleri bugün Ekip sayfasındaki KENDİ
          satırında görünür (Hesabım'daki "Ekip erişimim" kartı ayrı turda). */}
      <Link href="/firma/ekip" className="mt-[18px] text-[13px] font-medium text-[#1d4ed8] hover:underline">
        Hangi bölümlere erişebildiğimi gör
      </Link>
    </div>
  );
}
