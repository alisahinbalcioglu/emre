/**
 * ELLE YAZILMIS SAHTE DEPOLAR ICIN SAHIPLIK SORGUSU (02.10.2026).
 *
 * Servisler kaydin sahipligini artik SORGUDA arar:
 * `findFirst({ where: { id, firmaId } })` ya da iliski suzgeciyle
 * `findFirst({ where: { id, firma: { firmaId } } })` (yabanci kayit DB'den hic
 * donmesin — yanit ve sure olmayan kayitla ayni; P1 takibi, `test:kiraci-siniri`
 * KV). Bu yardimci `findFirst`i Prisma gibi yanitlar:
 *   · `where.id` verilmisse kayit ile id ve DIGER kosullar karsilastirilir
 *     (deger `undefined` ise kosul DUSER — Prisma da oyle yapar; ic ice nesne
 *     iliski suzgecidir: `firma: { firmaId }` → `kayit.firma.firmaId`).
 *   · `id`siz arama (ör. 'auto' yolunun "en son liste" sorgusu) `idsiz` doner.
 * Sahte kosulu YOK SAYSAYDI baska kiracinin kaydi "sahipli" gorunur, kapi
 * testte kor kalirdi.
 * ⚠ BILINEN SAPMA: gercek Prisma `id: undefined` kosulunu DUSURUR ve ilk
 * kaydi dondurur; bu yardimci o durumda `idsiz` doner. Yani "bicimsiz kimlik
 * kosulu dusurur" turu hatalari (save-bulk `priceListId`, inceleme LOW-1)
 * bu sahteyle YAKALANMAZ — onlari bellek-prisma'li `test:kiraci-siniri`
 * KV.19 olcer.
 */
export function sahiplikSorgusu<T extends Record<string, any>>(kayit: T, idsiz: unknown = null) {
  return async (args: any = {}): Promise<T | unknown> => {
    const w = args?.where ?? {};
    if (w.id === undefined) return idsiz;
    if (w.id !== kayit.id) return null;
    for (const [alan, deger] of Object.entries(w)) {
      if (alan === 'id' || deger === undefined) continue;
      if (deger !== null && typeof deger === 'object') {
        const ic = kayit[alan];
        const uymaz = !ic || Object.entries(deger as Record<string, unknown>).some(([k, v]) => v !== undefined && ic[k] !== v);
        if (uymaz) return null;
      } else if (kayit[alan] !== deger) {
        return null;
      }
    }
    return kayit;
  };
}
