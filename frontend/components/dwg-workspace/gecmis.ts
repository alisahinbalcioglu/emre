/**
 * GERI AL / YINELE yigini (saf — React'siz, DOM'suz; test edilir).
 *
 * 25.09 tasarimi "mevcut geri alma davranislari aynen kalir" diyordu; olculen
 * durum: kodda yalniz GORSEL silginin (sekil gizleme) geri almasi vardi. Cap
 * atama, parcalara ayirma, ayirmayi kaldirma ve onay icin hicbir geri alma
 * yoktu. Bu yigin o bosluk icin yazildi.
 *
 * Adimda "belge"nin (layer secimi + hesaplanmis layer'lar) ISLEMDEN ONCEKI
 * hali tutulur. Durum degismez (immutable) nesnelerden kuruldugu icin adim
 * basina maliyet yalniz degisen layer'in segment dizisidir — 100 adimlik
 * sinir bellek icin yeterince dar.
 */

export interface GecmisAdimi<B> {
  /** Adimi ureten islemin kimligi — bildirimdeki "Geri al" yalniz bu adim
   *  hala TEPEDEYSE calisir (sonradan yapilan islemi geri almasin). */
  id: number;
  /** Arac cubugu ipucu: "Geri al: Cap atama". */
  etiket: string;
  belge: B;
}

export interface Gecmis<B> {
  geri: GecmisAdimi<B>[];
  ileri: GecmisAdimi<B>[];
}

export const GECMIS_SINIRI = 100;

export function bosGecmis<B>(): Gecmis<B> {
  return { geri: [], ileri: [] };
}

/** Yeni islem: onceki belge geri yiginina girer, YINELEME LISTESI SILINIR
 *  (dallanan gecmis tutulmaz — tasarim kurali). Sinir asilirsa en eski duser. */
export function gecmiseEkle<B>(
  g: Gecmis<B>,
  adim: GecmisAdimi<B>,
  sinir: number = GECMIS_SINIRI,
): Gecmis<B> {
  const geri = [...g.geri, adim];
  return {
    geri: geri.length > sinir ? geri.slice(geri.length - sinir) : geri,
    ileri: [],
  };
}

export interface GecmisGecisi<B> {
  gecmis: Gecmis<B>;
  /** Uygulanacak belge. */
  belge: B;
  /** Geri alinan / yinelenen adim (etiket bildirim icin). */
  adim: GecmisAdimi<B>;
}

/** Tepedeki adimi geri alir: o adimin belgesi doner, SIMDIKI belge yineleme
 *  listesine girer. Geri alinacak bir sey yoksa `null`. */
export function geriAl<B>(g: Gecmis<B>, simdiki: B): GecmisGecisi<B> | null {
  const tepe = g.geri[g.geri.length - 1];
  if (!tepe) return null;
  return {
    gecmis: {
      geri: g.geri.slice(0, -1),
      ileri: [...g.ileri, { id: tepe.id, etiket: tepe.etiket, belge: simdiki }],
    },
    belge: tepe.belge,
    adim: tepe,
  };
}

/** Son geri alinani yineler. Yinelenecek bir sey yoksa `null`. */
export function yinele<B>(g: Gecmis<B>, simdiki: B): GecmisGecisi<B> | null {
  const tepe = g.ileri[g.ileri.length - 1];
  if (!tepe) return null;
  return {
    gecmis: {
      geri: [...g.geri, { id: tepe.id, etiket: tepe.etiket, belge: simdiki }],
      ileri: g.ileri.slice(0, -1),
    },
    belge: tepe.belge,
    adim: tepe,
  };
}

/** Geri alinacak ilk adim (arac cubugu ipucu + bildirimdeki "Geri al"). */
export function tepedekiAdim<B>(g: Gecmis<B>): GecmisAdimi<B> | null {
  return g.geri[g.geri.length - 1] ?? null;
}

/** Yinelenecek ilk adim. */
export function yinelenecekAdim<B>(g: Gecmis<B>): GecmisAdimi<B> | null {
  return g.ileri[g.ileri.length - 1] ?? null;
}
