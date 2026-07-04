/**
 * Merkezi cap sentinel'leri. Backend ve frontend arasi label/encoding
 * tutarsizligini onler.
 *
 * Backend segment cikariminda cap atamasi YOK (otomatik motor kaldirildi,
 * cap %100 manuel etiketleme) — `diameter = ""` (bos) doner; bazi eski kod
 * yollari "Belirtilmemis" (ASCII s) yaziyor. Frontend hicbir zaman bunlardan
 * birini hardcode etmesin — `isUnassignedDiameter()` ikisini de yakalar.
 */

/** Backend'in atanmamis cap icin yazdigi sentinel'ler (case-sensitive). */
export const UNASSIGNED_SENTINELS = ['', 'Belirtilmemis'] as const;

/** UI'da gosterilecek atanmamis cap etiketi (PRD §4 terminolojisi). */
export const UNASSIGNED_LABEL = 'Çapı Belirlenemeyenler';

/** Cap string'i atanmamis sayilsin mi? Backend'in tum sentinel'lerini yakalar. */
export function isUnassignedDiameter(diameter: string | null | undefined): boolean {
  if (!diameter) return true;
  const trimmed = diameter.trim();
  return (UNASSIGNED_SENTINELS as readonly string[]).includes(trimmed);
}

/** Cap string'ini display label'ina cevir: atanmamis -> UNASSIGNED_LABEL, diger -> kendisi. */
export function diameterDisplayLabel(diameter: string | null | undefined): string {
  return isUnassignedDiameter(diameter) ? UNASSIGNED_LABEL : (diameter as string);
}
