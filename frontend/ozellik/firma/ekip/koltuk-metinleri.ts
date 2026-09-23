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
 * 23.09.2026 — "Kullanıcı hakkı" kartı (Ekip & İzinler, ikinci tasarım).
 *
 * `deger` = "4 / 5": KULLANILAN (aktif + bekleyen davet) / hak. Tasarım:
 * "Bekleyen davetler de hakkı kullanır" — sunucu `koltukKarari` da onları
 * sayar; kart saymasaydı "3/5" görünen firmada davet "koltuk dolu" diye
 * reddedilebilirdi. `oran` çubuğun doluluğu (0–100; abonelik yoksa `null`
 * → çubuk çizilmez). Davet penceresinin alt şeridi AYNI `deger`i basar.
 */
export function koltukKarti(k: {
  aktif: number;
  bekleyen: number;
  hak: number | null;
}): { deger: string; aciklama: string; oran: number | null } {
  const kullanilan = k.aktif + k.bekleyen;
  const oran =
    k.hak === null || k.hak <= 0 ? null : Math.min(100, Math.round((kullanilan / k.hak) * 100));
  return {
    deger: `${kullanilan} / ${k.hak === null ? '—' : k.hak}`,
    aciklama:
      k.hak === null
        ? 'Etkin bir paketin yok; kullanıcı hakkı paketle gelir.'
        : `Planında sen dahil ${k.hak} kullanıcı var. Bekleyen davetler de hakkından düşer.`,
    oran,
  };
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
