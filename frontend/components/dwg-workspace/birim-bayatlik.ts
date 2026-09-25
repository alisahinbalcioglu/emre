/**
 * Cizim birimi bayatligi (saf).
 *
 * Hesaplanmis layer'in uzunluklari METRE cinsinden DONDURULMUS sayilardir.
 * Birim (metre carpani) sonradan degisirse eski satirlar ile yenileri ayni
 * teklifte 10x farkla UYARISIZ toplanirdi. 25.09'a dek cozum hesaplanan
 * layer'lari TAMAMEN dusurmekti (etiketlerle birlikte). Artik her layer kendi
 * birimini tasir (`scaleUsed`); birimi uyusmayan layer BAYATTIR: onaylanamaz,
 * fiyatlandirmaya gitmez, "Yeniden ayir" ister — etiketler aktarilir.
 */

/** Iki metre carpani ayni mi — goreli tolerans (eski `_loadState` kurali). */
export function ayniOlcek(a: number, b: number): boolean {
  if (!(a > 0) || !(b > 0)) return false;
  return Math.abs(a - b) / b <= 1e-6;
}

/** Hesap, SIMDIKI birimle yapilmamis mi? `scaleUsed` yoksa bayat SAYILMAZ:
 *  eski kayitlara yukleme aninda kaydin kendi birimi yazilir. */
export function birimBayatMi(cl: { scaleUsed?: number }, scale: number): boolean {
  if (cl.scaleUsed === undefined) return false;
  return !ayniOlcek(cl.scaleUsed, scale);
}

/** "Bolmeden" hesapta motor her cizgiyi TEK parca alir; parcalama birimden
 *  BAGIMSIZDIR (dugum toleransi hic kullanilmaz). Birim degisince yeniden
 *  ayirmaya gerek yok — uzunluklar yerelde olceklenir. */
export function yerelOlceklenebilir(cl: { splitMode?: 't' | 'none' }): boolean {
  return cl.splitMode === 'none';
}
