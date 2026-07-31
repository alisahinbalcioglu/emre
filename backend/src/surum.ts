/**
 * PK11 — calisan backend'in SURUMU.
 *
 * Oncelik sirasi:
 *   1. `surum.generated.ts` — DERLEME aninda gomulen sha (asil kaynak).
 *   2. `process.env.BUILD_SHA` — Docker imajinda ARG ile gelen deger.
 *   3. `'local'` — hicbiri yoksa. **Bu bir fallback DEGIL, bir ITIRAFTIR:**
 *      surum kapisi `'local'` gorunce koşumu REDDEDER (PK11a). Sessizce
 *      gecilebilen bir varsayilan olsaydi kapi kor olurdu.
 *
 * `require` try/catch icinde, cunku uretilmis dosya git-ignore'ludur ve temiz
 * bir klonda `prebuild` kosmadan once YOKTUR. Bu catch hatayi YUTMUYOR —
 * bilinmeyeni `'local'` olarak ISARETLIYOR ve kapi onu reddediyor.
 */
let gomulu = { BUILD_SHA: '', AGAC_KIRLI: false, DERLEME_ZAMANI: '' };
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  gomulu = require('./surum.generated');
} catch {
  /* prebuild kosmamis — asagida 'local' olur, kapi reddeder */
}

export const BUILD_SHA: string =
  (gomulu.BUILD_SHA && gomulu.BUILD_SHA !== 'local' ? gomulu.BUILD_SHA : '')
  || process.env.BUILD_SHA
  || 'local';

export const AGAC_KIRLI: boolean = !!gomulu.AGAC_KIRLI;
export const DERLEME_ZAMANI: string = gomulu.DERLEME_ZAMANI || '';
