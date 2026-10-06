/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  OTURUM TOKEN'I BAŞLIKTAN — DOĞRUSAL, TEK TANIM (06.10.2026, güvenlik HIGH-1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  passport-jwt'nin `ExtractJwt.fromAuthHeaderAsBearerToken()` çıkarıcısı
 *  başlığı ÇAPASIZ `/(\S+)\s+(\S+)/` ile ayırır (auth_header.js:3): boşluksuz
 *  uzun değerde her başlangıç konumunda geri izler, maliyet O(n²) — ölçüldü
 *  (Node 24, HTTP): 8.000 karakter ~200 ms, 16.000 ~0,7 sn; JwtAuthGuard
 *  taşıyan HER rotada kimliksiz, gövdesiz tek istekle.
 *
 *  Bu işlev AYNI yakalamayı ÇAPALI ifadeyle yapar: `/^\s*(\S+)\s+(\S+)/`.
 *  Eşdeğerlik kanıtı: çapasız ifadenin en soldaki eşleşmesi ilk boşluk-dışı
 *  karakterde başlar (eşleşme \S ile başlamak zorunda), 1. grup ilk kesimin
 *  TAMAMIdır (ardından boşluk gelmek zorunda), 2. grup ikinci kesimin tamamı;
 *  ilk kesimde eşleşme yoksa sonraki hiçbir konumda da yoktur (ikinci kesim
 *  olmadığı içindir). `^\s*` aynı ilk kesime atlar. `\s`/`\S` iki ifadede
 *  aynı sınıflardır (U+00A0 dahil). Kod incelemesi 200 bin rastgele dizgede,
 *  kapı (`test:buyuk-govde` T4) her koşuda rastgele dizgelerde ölçer.
 *  16.000 karakterde < 1 ms.
 *
 *  Kullananlar TEK tanımı paylaşır: `JwtStrategy` (jwtFromRequest) ve büyük
 *  gövde ön denetimi (`altyapi/http/buyuk-govde.ts`) — iki karar yapı gereği
 *  aynı token'ı görür.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const BASLIK = /^\s*(\S+)\s+(\S+)/;

/** `Authorization` başlık değerinden oturum token'ı; şema `bearer` değilse null. */
export function bearerToken(baslik: unknown): string | null {
  if (typeof baslik !== 'string' || baslik === '') return null;
  const eslesme = BASLIK.exec(baslik);
  return eslesme && eslesme[1].toLowerCase() === 'bearer' ? eslesme[2] : null;
}
