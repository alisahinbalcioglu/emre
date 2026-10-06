import { Banknote, Ruler, type LucideIcon } from 'lucide-react';
import type { UyeIzni } from './izin-metinleri';

/**
 * 23.09.2026 — izinlerin lucide simgesi (tasarim referansindaki ikonlar).
 * 06.10.2026: iki yetki — fiyat → Banknote (eski "Teklif tutarları"nin
 * simgesi), dwg → Ruler (degismedi).
 *
 * ⚠ `izin-metinleri.ts`e KONMADI: o dosya IMPORT'SUZ kalmali (vitest `@/`
 * ve paket cozmeden dogrudan okuyor). Tasarimin gorsel kurali: emoji yok,
 * yalniz lucide.
 */
export const IZIN_SIMGELERI: Readonly<Record<UyeIzni, LucideIcon>> = {
  fiyat: Banknote,
  dwg: Ruler,
};
