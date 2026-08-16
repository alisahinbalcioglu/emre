/**
 * TEKLIF TASLAGI — Duzenle ekraninin sessionStorage sozlesmesi (14.08).
 *
 * ── NEDEN AYRI MODUL ────────────────────────────────────────────────────────
 * Taslak anahtari ve surumu `quotes/new/page.tsx`in ICINDE sabit duruyordu;
 * baska hicbir ekran taslak yazamiyordu. Revizyon yolu tam da bunu gerektirdi:
 * KAYITLI teklifi Duzenle ekraninda acmak icin detay sayfasinin ayni anahtara,
 * ayni surumle yazabilmesi lazim. Sabitler burada ortaklandi — iki taraf ayni
 * anahtari kullandigini KODDAN goruyor, tahmin etmiyor.
 *
 * ── SURUM NEDEN ONEMLI ──────────────────────────────────────────────────────
 * Duzenle ekrani `v !== TASLAK_SURUMU` olan taslagi ATAR. Sekil degistiginde
 * surum artmazsa eski taslak yeni koda beslenir ve ekran yarim/bozuk acilir.
 * Buraya alan EKLEMEK surum artirmaz (eski taslakta alan `undefined` gelir ve
 * okuyan taraf varsayilanina duser); alan KALDIRMAK ya da ANLAMINI degistirmek
 * artirir.
 */

/** sessionStorage anahtari — Duzenle ekrani bu anahtardan okur. */
export const TASLAK_ANAHTARI = 'metaprice_quote_draft';

/** Taslak sekil surumu. Uyusmayan taslak SESSIZCE atilir (bayat state yasagi). */
export const TASLAK_SURUMU = 4;

export interface TeklifTaslagi {
  v: number;
  multiSheet: { sheets: any[]; brands?: any[] };
  activeSheetIndex: number;
  sheetDisciplines: Record<number, string>;
  title: string;
  allBrands: any[];
  colHiddenBySheet: Record<number, string[]>;
  colWidthsBySheet: Record<number, Record<string, number>>;
  colFloorsBySheet: Record<number, any[]>;
  /**
   * REVIZYON KIMLIGI — doluysa "Teklifi Kaydet" YENI kayit acmaz, BU teklifi
   * gunceller (`PUT /quotes/:id`). Bos/yok ise davranis eskisi gibi: yeni kayit.
   */
  quoteId?: string;
}

/**
 * Kayitli teklifi (GET /quotes/:id govdesi) Duzenle ekraninin anlayacagi
 * taslaga cevirir.
 *
 * ⚠ `quoteId` SET EDILIR — bu, taslagi "yeni teklif" degil "revizyon" yapar.
 * Ayrilmasaydi kullanici revize ettigi her teklifin KOPYASINI olustururdu ve
 * teklif listesi ayni isimli kayitlarla dolardi.
 *
 * ⚠ Bos sayfalar ELENMEZ: detay sayfasi onlari gizler ama Duzenle ekrani sayfa
 * SIRASINI `index` uzerinden kurar. Filtrelenseydi kayitli `index` degerleri
 * ile dizi konumlari ayrisir ve kolon genislikleri/gizli sutunlar YANLIS
 * sayfaya uygulanirdi.
 */
export function kayittanTaslak(
  quote: { id: string; title?: string; sheets?: any[] },
  allBrands: any[],
): TeklifTaslagi {
  const sheets = Array.isArray(quote.sheets) ? quote.sheets : [];

  const sheetDisciplines: Record<number, string> = {};
  const colHiddenBySheet: Record<number, string[]> = {};
  const colWidthsBySheet: Record<number, Record<string, number>> = {};
  const colFloorsBySheet: Record<number, any[]> = {};

  sheets.forEach((s: any, i: number) => {
    // `index` kayitta olmayabilir (eski kayitlar) — dizi konumuna duser.
    const idx = typeof s?.index === 'number' ? s.index : i;
    if (s?.discipline) sheetDisciplines[idx] = s.discipline;
    const cfg = s?.columnConfig ?? {};
    if (Array.isArray(cfg.hidden)) colHiddenBySheet[idx] = cfg.hidden;
    if (cfg.widths && typeof cfg.widths === 'object') colWidthsBySheet[idx] = cfg.widths;
    if (Array.isArray(cfg.floors)) colFloorsBySheet[idx] = cfg.floors;
  });

  // Ilk DOLU sayfa acilsin — detay sayfasinin actigi sayfayla ayni davranis.
  const ilkDolu = sheets.findIndex((s: any) => !s?.isEmpty);

  return {
    v: TASLAK_SURUMU,
    multiSheet: {
      sheets: sheets.map((s: any, i: number) => ({
        ...s,
        index: typeof s?.index === 'number' ? s.index : i,
      })),
      brands: allBrands,
    },
    activeSheetIndex: ilkDolu >= 0 ? ilkDolu : 0,
    sheetDisciplines,
    title: quote.title ?? '',
    allBrands,
    colHiddenBySheet,
    colWidthsBySheet,
    colFloorsBySheet,
    quoteId: quote.id,
  };
}
