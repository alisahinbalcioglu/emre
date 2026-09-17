/**
 * FAZ 7 F1b — KOLTUK SAYACI ve KÜÇÜLTME UYARISI metinleri (saf).
 *
 * ⚠ KARARLAR SUNUCUDA: bu dosya yalnız METİN kurar, izin/ret HESAPLAMAZ.
 * (`erisim-durumu.ts` ikizi bu depoda ölçülmüş bir hata sınıfıdır.)
 */

/** "2 / 3 kullanıcı · 1 bekleyen davet" (+ durdurulan varsa uyarı cümlesi). */
export function koltukSayaciMetni(k: {
  aktif: number;
  bekleyen: number;
  hak: number | null;
  durdurulan: number;
}): { sayac: string; uyari: string | null } {
  const hakMetni = k.hak === null ? '—' : String(k.hak);
  const parcalar = [`${k.aktif} / ${hakMetni} kullanıcı`];
  if (k.bekleyen > 0) parcalar.push(`${k.bekleyen} bekleyen davet`);
  const uyari =
    k.durdurulan > 0
      ? `${k.durdurulan} üye durduruldu. Paketi yükseltin ya da bir üyeyi ekipten çıkarın.`
      : null;
  return { sayac: parcalar.join(' · '), uyari };
}

/**
 * KÜÇÜLTME UYARISI (§6.6, Emre kararı E-3).
 *
 * Sahip daha küçük bir paket seçtiğinde, kaç kişinin duracağını ONAYDAN ÖNCE
 * söyler. Sunucu satın almayı REDDETMEZ (R1-Y4) — bu yalnız bilgilendirmedir.
 *
 * ⚠ `Math.max(hak, 1)`: en eski sahip her zaman çalışır.
 * `null` → uyarı yok (kimse durmaz).
 */
export function kucultmeUyarisi(aktif: number, hak: number): string | null {
  const tavan = Math.max(hak, 1);
  if (aktif <= tavan) return null;
  const m = aktif - tavan;
  return (
    `Bu paket firma sahibi dahil ${hak} kişilik. Ekibinizden ${m} kişi bu pakette ` +
    'durdurulur; verileri silinmez, paketi yükselttiğinizde kaldıkları yerden devam ederler.'
  );
}
