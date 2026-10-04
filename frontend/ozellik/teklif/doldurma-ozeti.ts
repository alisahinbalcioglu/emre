/**
 * SURUKLE-DOLDUR OZET TOSTUNUN METNI (Y4, 02.10) — saf.
 *
 * ExcelGrid doldurma bitince `onAutoVariantApplied` ile sayilari bildirir;
 * teklif duzenleme sayfasi bunu tost olarak gosterir. Metin eskiden sayfanin
 * icinde satir-ici yaziliydi ve eksik sayisini HEP "N markada yok" diyordu.
 * Isçilik doldurma ozeti geri gelince (d3402cd'de kaybolmustu) bu yanlis
 * yonlendirme olurdu: kullanici marka menusune bakar, sorun firmadadir.
 *
 * Kural tek yerde; `dal` verilmezse eski (malzeme) dili korunur.
 */
export interface DoldurmaOzeti {
  applied: number;
  waiting: number;
  missing: number;
  hatali?: number;
  dal?: 'malzeme' | 'iscilik';
}

/** Tost aciklamasi; gosterilecek bir sey yoksa `null` (bos tost atilmaz). */
export function doldurmaOzetMetni(o: DoldurmaOzeti): string | null {
  const parca: string[] = [];
  if (o.applied > 0) parca.push(`${o.applied} satır güncellendi`);
  if (o.waiting > 0) parca.push(`${o.waiting} seçim bekliyor`);
  if (o.missing > 0) parca.push(`${o.missing} ${o.dal === 'iscilik' ? 'firmada' : 'markada'} yok`);
  if ((o.hatali ?? 0) > 0) parca.push(`${o.hatali} sorgu hatası — tekrar deneyin`);
  return parca.length > 0 ? parca.join(' · ') : null;
}
