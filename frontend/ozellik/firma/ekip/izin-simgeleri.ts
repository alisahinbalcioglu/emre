import { Banknote, BookOpen, FileSpreadsheet, Ruler, type LucideIcon } from 'lucide-react';
import type { UyeIzni } from './izin-metinleri';

/**
 * 23.09.2026 — dort iznin lucide simgesi (tasarim referansindaki ikonlar).
 *
 * ⚠ `izin-metinleri.ts`e KONMADI: o dosya IMPORT'SUZ kalmali (vitest `@/`
 * ve paket cozmeden dogrudan okuyor). Tasarimin gorsel kurali: emoji yok,
 * yalniz lucide.
 */
export const IZIN_SIMGELERI: Readonly<Record<UyeIzni, LucideIcon>> = {
  excel: FileSpreadsheet,
  dwg: Ruler,
  firmaTeklifleri: Banknote,
  kutuphane: BookOpen,
};
