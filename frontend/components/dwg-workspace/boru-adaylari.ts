/**
 * Katman adlari: "Adina gore boru olabilecekler" cipleri + Katmanlar paneli
 * aramasi ve suzgeci (saf; test edilir).
 *
 * TURKCE KATLAMA: DWG katman adlari sik sik BOZUK kodlamayla gelir —
 *  - UTF-8 baytlari Latin-1 okunmus: "SPRÄ°NK", "YAÄžMUR" (CLAUDE.md: LibreDWG
 *    ciktisinda Turkce İ mojibake olur),
 *  - cp1254 baytlari cp1252 okunmus: "PÝS SU", "YAÐMUR", "ÞEBEKE".
 * Arama ve anahtar eslesmesi bunlari da tanimali; aksi halde "a-yağmur"
 * yazan kullanici "YAÄžMUR" katmanini bulamaz. Kucultme `tr-TR` ile yapilir
 * ("İ" → "i", "I" → "ı"), sonra aksanlar katlanir.
 */

export interface KatmanOzeti {
  ad: string;
  /** Katmanin cizim rengi (ACI → hex). */
  renk: string;
  /** Cizimdeki LINE sayisi — "1.284 çizgi". */
  cizgi: number;
}

/** UTF-8 → Latin-1/cp1252 bozulmalari (iki karakterlik diziler). */
const COK_KARAKTERLI: ReadonlyArray<readonly [string, string]> = [
  ['Ä°', 'İ'], ['Ä±', 'ı'], ['Äž', 'Ğ'], ['ÄŸ', 'ğ'], ['Åž', 'Ş'], ['ÅŸ', 'ş'],
  ['Ãœ', 'Ü'], ['Ã¼', 'ü'], ['Ã–', 'Ö'], ['Ã¶', 'ö'], ['Ã‡', 'Ç'], ['Ã§', 'ç'],
  // Ayni baytlarin Latin-1 (kontrol karakteri) okumasi
  ['Ä\u009e', 'Ğ'], ['Ä\u009f', 'ğ'], ['Å\u009e', 'Ş'], ['Å\u009f', 'ş'],
  ['Ã\u009c', 'Ü'], ['Ã\u0096', 'Ö'], ['Ã\u0087', 'Ç'],
];

/** cp1254 → cp1252 bozulmalari (tek karakter). */
const TEK_KARAKTERLI: Record<string, string> = {
  'Ý': 'İ', 'ý': 'ı', 'Þ': 'Ş', 'þ': 'ş', 'Ð': 'Ğ', 'ð': 'ğ',
};

const AKSAN: Record<string, string> = {
  'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u',
};

/** Karsilastirma anahtari: bozuk kodlama onarilir, tr-TR kucultulur, aksan katlanir. */
export function turkceKatla(metin: string): string {
  let s = metin ?? '';
  for (const [bozuk, dogru] of COK_KARAKTERLI) s = s.split(bozuk).join(dogru);
  s = s.replace(/[ÝýÞþÐð]/g, (c) => TEK_KARAKTERLI[c] ?? c);
  s = s.toLocaleLowerCase('tr-TR');
  // Tr disi kucultmeden kalma "i + birlestirici nokta" da "i" olsun
  s = s.replace(/̇/g, '');
  return s.replace(/[çğıöşüâîû]/g, (c) => AKSAN[c] ?? c);
}

/** Tasarim: adinda bunlardan biri gecen layer boru olabilir. */
export const BORU_ANAHTARLARI = ['pis', 'temiz', 'yagmur', 'boru', 'hdpe', 'pvc', 'ppr', 'tesisat'] as const;

export function boruAdayiMi(ad: string): boolean {
  const k = turkceKatla(ad);
  return BORU_ANAHTARLARI.some((a) => k.includes(a));
}

/** Cip listesi: cizgisi olan (yazi/sembol katmani degil) aday layer'lar,
 *  cok cizgiliden aza; en cok `sinir` adet. */
export function boruAdaylari(katmanlar: readonly KatmanOzeti[], sinir = 8): KatmanOzeti[] {
  return katmanlar
    .filter((k) => k.cizgi > 0 && boruAdayiMi(k.ad))
    .sort((a, b) => b.cizgi - a.cizgi || a.ad.localeCompare(b.ad, 'tr'))
    .slice(0, sinir);
}

export type KatmanSuzgeci = 'tumu' | 'gorunen' | 'gizli';

/** Katmanlar paneli listesi: arama (katlanmis) + suzgec, ada gore Turkce sirali. */
export function katmanlariSuz(
  katmanlar: readonly KatmanOzeti[],
  sorgu: string,
  suzgec: KatmanSuzgeci,
  gizliler: ReadonlySet<string>,
): KatmanOzeti[] {
  const q = turkceKatla(sorgu.trim());
  return katmanlar
    .filter((k) => {
      if (suzgec === 'gorunen' && gizliler.has(k.ad)) return false;
      if (suzgec === 'gizli' && !gizliler.has(k.ad)) return false;
      return !q || turkceKatla(k.ad).includes(q);
    })
    .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}
