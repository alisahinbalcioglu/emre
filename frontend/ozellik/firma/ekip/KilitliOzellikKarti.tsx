'use client';

import { Lock } from 'lucide-react';
import { yoneticiyeYazBaglantisi, type UyeIzni } from './izin-metinleri';

/**
 * 23.09.2026 — İZNİ KAPALI ÖZELLİĞİN GİRİŞ NOKTASI (ikinci tasarım · ekran 6
 * "Özellik kartı"): kesikli çerçeve, kilit, "Yöneticin bu özelliği senin
 * için kapattı." ve "Yöneticine yaz".
 *
 * ⚠ PAKET ÖNERMEZ: alt kullanıcı paket alamaz; izni yönetici açar. Kapı
 *   sunucuda (`UYE_IZNI_YOK`); bu kart yalnız yolu dürüstçe gösterir.
 * ⚠ Yönetici adresi bilinmiyorsa (`null`/`undefined`) bağlantı ÇİZİLMEZ —
 *   boş `mailto:` tıklanınca hiçbir yere gitmeyen bir e-posta açardı.
 */
export function KilitliOzellikKarti({
  baslik,
  izin,
  yonetici,
}: {
  baslik: string;
  izin: UyeIzni;
  yonetici: string | null | undefined;
}) {
  return (
    <div
      aria-disabled="true"
      className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[#cbd5e1] bg-[#f8fafc] p-8 text-center"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#e2e8f0] text-[#475569]">
        <Lock className="h-5 w-5" aria-hidden="true" />
      </div>
      <div>
        <h3 className="text-sm font-bold text-gray-700">{baslik}</h3>
        <p className="mt-1 text-xs leading-normal text-gray-500">Yöneticin bu özelliği senin için kapattı.</p>
      </div>
      {yonetici && (
        <a
          href={yoneticiyeYazBaglantisi(yonetici, izin)}
          className="text-xs font-semibold text-[#1d4ed8] hover:underline"
        >
          Yöneticine yaz
        </a>
      )}
    </div>
  );
}
