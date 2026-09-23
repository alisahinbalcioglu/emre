'use client';

import { Check, Lock, Shield } from 'lucide-react';
import type { IzinTanimi } from './izin-metinleri';

/**
 * 23.09.2026 — Ekip & İzinler tasarımının küçük görsel parçaları (liste,
 * davet penceresi ve izin paneli ORTAK kullanır; renkler tasarımdan birebir).
 *
 * ⚠ Bu dosya KARAR VERMEZ: hangi rozetin çizileceği çağırana sunucunun
 * verdiği alanlardan (`firmaRol`, `durduruldu`, `durum`, `izinler`) gelir.
 */

/** Baş harf avatarı — yönetici mavi dolu, üye/davet açık çivit. */
export function Avatar({
  metin,
  yonetici = false,
  buyuk = false,
}: {
  metin: string;
  yonetici?: boolean;
  buyuk?: boolean;
}) {
  const boyut = buyuk ? 'h-12 w-12 text-base' : 'h-10 w-10 text-[14px]';
  const renk = yonetici ? 'bg-[#2563eb] text-white' : 'bg-[#eef2ff] text-[#3730a3]';
  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${boyut} ${renk}`}
    >
      {metin}
    </div>
  );
}

export type UyeDurumu = 'aktif' | 'davet' | 'durduruldu' | 'askida';

const DURUM_GORUNUMU: Record<UyeDurumu, { metin: string; zemin: string; nokta: string }> = {
  aktif: { metin: 'Aktif', zemin: 'bg-[#f0fdf4] text-[#166534]', nokta: 'bg-[#16a34a]' },
  davet: { metin: 'Davet bekliyor', zemin: 'bg-[#fffbeb] text-[#92400e]', nokta: 'bg-[#f59e0b]' },
  // Tasarımda yalnız Aktif/Davet bekliyor var; iki durum da sunucudan gelir
  // ve KAYBOLMAMALI: paket sınırıyla durdurulan üye (FAZ 7 F1b §3.12) ve askı.
  durduruldu: { metin: 'Durduruldu (paket sınırı)', zemin: 'bg-slate-100 text-slate-600', nokta: 'bg-slate-400' },
  askida: { metin: 'Askıda', zemin: 'bg-red-50 text-red-700', nokta: 'bg-red-500' },
};

/** Sunucu alanlarından durum — `durduruldu` sunucunun hesapladığı değerdir. */
export function uyeDurumu(u: { durduruldu: boolean; durum: string }): UyeDurumu {
  if (u.durduruldu) return 'durduruldu';
  if (u.durum === 'banned') return 'askida';
  return 'aktif';
}

export function DurumRozeti({ durum }: { durum: UyeDurumu }) {
  const g = DURUM_GORUNUMU[durum];
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[11px] font-semibold ${g.zemin}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${g.nokta}`} />
      {g.metin}
    </span>
  );
}

export function YoneticiRozeti() {
  return (
    <span className="inline-flex h-[26px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#eff6ff] px-2.5 text-xs font-semibold text-[#1d4ed8]">
      <Shield className="h-3.5 w-3.5" aria-hidden="true" />
      Yönetici
    </span>
  );
}

export function SenRozeti() {
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-gray-100 px-2 text-[11px] font-semibold text-gray-700">
      Sen
    </span>
  );
}

/** Üye satırındaki izin etiketi: açık = yeşil tik, kapalı = gri kilit. */
export function IzinEtiketi({ tanim, acik }: { tanim: IzinTanimi; acik: boolean }) {
  return (
    <span
      // `relative`: içteki `sr-only` metin mutlak konumludur; kap konumlanmamışsa
      // sayfanın başka bir yerine göre yerleşip yatay taşma üretebilir
      // (23.09 önizlemede tabloda ölçüldü).
      className={`relative inline-flex h-6 items-center gap-[5px] whitespace-nowrap rounded-full border px-[9px] text-xs font-medium ${
        acik
          ? 'border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]'
          : 'border-[#e5e7eb] bg-[#f8fafc] text-[#64748b]'
      }`}
    >
      {acik ? (
        <Check className="h-3 w-3" aria-hidden="true" />
      ) : (
        <Lock className="h-3 w-3" aria-hidden="true" />
      )}
      {tanim.etiket}
      <span className="sr-only">{acik ? ' — açık' : ' — kapalı'}</span>
    </span>
  );
}

/** "Fiyat bilgisi" rozeti (Son teklifler · Kütüphanem). */
export function FiyatBilgisiRozeti() {
  return (
    <span className="inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full bg-[#fff7ed] px-[7px] text-[11px] font-semibold text-[#9a3412]">
      Fiyat bilgisi
    </span>
  );
}

/**
 * Açma/kapama anahtarı — `role="switch"` + `aria-checked` (tasarımdaki
 * işaretleme). 40×24 iz, 20 px düğme; açık `#2563eb`, kapalı `#d1d5db`.
 */
export function Anahtar({
  acik,
  etiket,
  pasif = false,
  onDegis,
}: {
  acik: boolean;
  etiket: string;
  pasif?: boolean;
  onDegis: (yeni: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={acik}
      aria-label={etiket}
      disabled={pasif}
      onClick={() => onDegis(!acik)}
      className="flex shrink-0 rounded-full py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        className={`flex h-6 w-10 rounded-full p-0.5 transition-colors ${
          acik ? 'justify-end bg-[#2563eb]' : 'justify-start bg-[#d1d5db]'
        }`}
      >
        <span className="block h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,0.25)]" />
      </span>
    </button>
  );
}
