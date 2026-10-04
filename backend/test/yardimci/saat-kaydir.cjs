// SAAT KAYDIRMA ON YUKLEYICISI (saatli bomba taramasi 02.10.2026; CI isi
// `backend-saat-30` 04.10.2026 — .github/workflows/regression.yml).
//
// NE YAPAR: argumansiz `new Date()`, `Date()` ve `Date.now()` GERCEK saat +
// SAAT_KAYMA_GUN gun doner; argumanli `new Date(x)`, `Date.parse`, `Date.UTC`
// DEGISMEZ. NODE_OPTIONS="--require <bu dosyanin MUTLAK yolu>" ile verilince
// ortami miras alan HER Node alt surecine gecer (regresyon kosucusu her paketi
// `npm run` ile, ortami miras alarak baslatir). Goreli yol VERME: alt surec
// baska dizinde acilirsa bulunamaz.
//
// NEDEN: sabit tarihli fikstur + gercek saati okuyan kod = SAATLI BOMBA. Bugun
// yesil, fikstur tarihi gecince kod degismeden kirmizi (0e5173f abonelik-erisim
// I blogu 02.10'da patladi; 3edc5e9 geri-donus 11.10'da patlayacakti). Kayma o
// gunu bugune getirir: +30 gunde yesil paket, onumuzdeki 30 gun icinde SURESI
// DOLAN fikstur yuzunden patlamaz. Belirli bir takvim gunune bagli hata (ay
// sonu, yil donumu) tek bir T+30 olcumunde gorunmez.
//
// SINIRLAR: yalniz Node surecleri (DWG motoru Python, gercek saatte);
// `performance.timeOrigin` / `performance.now()` ve isletim sistemi saati
// (dosya zaman damgasi, `date`) kaymaz; ortami SIFIRDAN kurulan alt surec
// (`env: { PATH }`) kaymayi almaz.
//
// SAAT_KAYMA_GUN tanimsiz ya da bossa hicbir sey yapmaz. Sayi degilse FIRLATIR:
// her Node sureci acilista duser — kayma sessizce dusup paket "yesil" demesin.
'use strict';

const ham = process.env.SAAT_KAYMA_GUN;
const gun = ham === undefined || ham.trim() === '' ? 0 : Number(ham);
if (!Number.isFinite(gun)) {
  throw new Error(`SAAT_KAYMA_GUN sayi degil: ${JSON.stringify(ham)}`);
}
const KAYMA = gun * 86400000;

if (KAYMA !== 0) {
  const AsilDate = Date;
  function KaymisDate(...args) {
    // `Date()` islev cagrisi argumanlari yok sayar, simdiyi metin olarak doner.
    if (!new.target) return new AsilDate(AsilDate.now() + KAYMA).toString();
    // Reflect.construct: alt sinif (`class X extends Date`) kendi prototipini alir.
    return Reflect.construct(AsilDate, args.length === 0 ? [AsilDate.now() + KAYMA] : args, new.target);
  }
  // Her tarihte `instanceof Date` ve `d.constructor === Date` dogru kalsin; ad
  // 'Date' kalsin (util.inspect "KaymisDate 2026-..." yazmasin). Statikler
  // asli gibi SAYILAMAZ: `Object.keys(Date)` bos, util.inspect(Date) ayni.
  KaymisDate.prototype = AsilDate.prototype;
  AsilDate.prototype.constructor = KaymisDate;
  const statik = (value) => ({ value, writable: true, enumerable: false, configurable: true });
  Object.defineProperties(KaymisDate, {
    name: { value: 'Date' },
    length: { value: 7 },
    now: statik(function now() { return AsilDate.now() + KAYMA; }),
    parse: statik(AsilDate.parse),
    UTC: statik(AsilDate.UTC),
  });
  globalThis.Date = KaymisDate;
}
