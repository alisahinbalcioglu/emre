/**
 * S1 — GRUP ISKONTO GIRISI UYGULAMA ICINDE SORULUR (isletim sistemi kutusu yok)
 *   cd frontend && npx vitest run ozellik/tablo/excel-grid/grup-iskonto-girisi.test.ts
 *
 * ── KUSUR (olculdu) ────────────────────────────────────────────────────────
 * `ExcelGrid.tsx` grup bandindaki "% iskonto uygula" butonu `window.prompt`
 * cagiriyordu. Tarayici bu kutuyu SAYFANIN degil EKRANIN tepesinde,
 * "metapricex.com says" basligiyla ciziyor: kullanicinin tikladigi yerden
 * uzakta, uygulamanin gorsel dilinin disinda, bicimlendirilemez.
 *
 * ── OLCUT NEDEN "SATIR 1441'DE window.prompt YOK" DEGIL ────────────────────
 * Satir numarasi kanit degildir: kod bir satir kayinca olcut sessizce baska
 * bir seyi olcmeye baslar. Iki GENEL eksende olculuyor:
 *   (1) DEGER SORAN AKIS — `promptGroupDiscount` govdesi native diyalog
 *       cagirmayacak, uygulama ici kutuyu (`promptValue`) cagiracak.
 *   (2) CIRCIR — frontend genelinde kalan native diyalog sayisi ARTMAYACAK.
 *       Bugunku bakiye 3 (`ExcelGrid.tsx` icinde: yeni sutun adi sorusu +
 *       iki uyari). Bu tur YALNIZ grup iskontosunu tasidi; kalan uc cagri
 *       kullanicinin karari geregi yerinde birakildi ama ARTMALARI yasak.
 *
 * jsdom KURULU DEGIL (vitest ortami node) — bu yuzden bilesen render
 * edilmez, KAYNAK METIN olculur. Kaynak-tarayan olcutun en buyuk riski
 * "hicbir sey ayristiramadim → hicbir ihlal yok → yesil" yalanidir; bu
 * yuzden asagidaki ilk describe bloguna BOS-KUME KAPILARI konuldu.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const KOK = path.resolve(__dirname, '../../..');           // frontend/
const gridKaynak = fs.readFileSync(path.join(KOK, 'ozellik/tablo/excel-grid/ExcelGrid.tsx'), 'utf-8');
const kancaKaynak = fs.readFileSync(path.join(KOK, 'ortak/hooks/use-confirm.ts'), 'utf-8');
const rendererKaynak = fs.readFileSync(path.join(KOK, 'ortak/ui/confirm-dialog.tsx'), 'utf-8');

// ── yardimcilar ────────────────────────────────────────────────────────────

/** `bas` indeksindeki acilis isaretinden baslayip esleseni bulur, ARASINI dondurur. */
function dengeliBlok(kaynak: string, bas: number, ac: string, kapa: string): string {
  let derinlik = 0;
  for (let i = bas; i < kaynak.length; i++) {
    if (kaynak[i] === ac) derinlik++;
    else if (kaynak[i] === kapa) {
      derinlik--;
      if (derinlik === 0) return kaynak.slice(bas + 1, i);
    }
  }
  return '';
}

/** `const <ad> = useCallback(...)` govdesi — suslu parantez dengesiyle. */
function geriCagriGovdesi(kaynak: string, ad: string): string {
  const im = kaynak.indexOf(`const ${ad} = useCallback(`);
  if (im < 0) return '';
  const suslu = kaynak.indexOf('{', im);
  if (suslu < 0) return '';
  return dengeliBlok(kaynak, suslu, '{', '}');
}

/** `<ad>(` cagrisinin ARGUMAN metni — yuvarlak parantez dengesiyle. */
function cagriArgumani(kaynak: string, ad: string): string {
  const im = kaynak.indexOf(`${ad}(`);
  if (im < 0) return '';
  return dengeliBlok(kaynak, im + ad.length, '(', ')');
}

/**
 * `ConfirmState.resolve` sozlesmesinin PARAMETRE tipi. Tip dogrudan yazilmis
 * olabilir (`resolve?: (v: X) => void`) ya da bir takma ad uzerinden
 * gelebilir (`resolve?: GenelCozucu`); ikinci bicimde bir adim cozulur.
 * Duz metin eslemesi yapip takma adi kacirmak, olcutun "string yok" diye
 * yanlis kirmizi yanmasina yol acardi.
 */
function cozucuParametreTipi(kaynak: string): string {
  const m = kaynak.match(/resolve\?\s*:\s*([^;]+);/);
  if (!m) return '';
  const ham = m[1].trim();
  const dogrudan = ham.match(/^\(([^)]*)\)\s*=>/);
  if (dogrudan) return dogrudan[1];
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(ham)) return '';
  const takma = kaynak.match(new RegExp(`type ${ham}\\s*=\\s*\\(([^)]*)\\)\\s*=>`));
  return takma?.[1] ?? '';
}

/** Satir ve blok yorumlarini siler — yorumda ANILAN cagri, cagri degildir. */
function yorumsuz(kaynak: string): string {
  return kaynak.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** frontend altindaki urun kaynaklari (.ts/.tsx). Test dosyalari HARIC:
 *  onlar olcum aracidir, urun kodu degil — ve olcut metinlerinde native
 *  diyalog adlarini string olarak tasirlar. */
function urunKaynaklari(dizin: string, birikim: string[] = []): string[] {
  for (const ad of fs.readdirSync(dizin)) {
    if (['node_modules', '.next', 'e2e', 'e2e-golden', 'dist', 'coverage'].includes(ad)) continue;
    const tam = path.join(dizin, ad);
    if (fs.statSync(tam).isDirectory()) { urunKaynaklari(tam, birikim); continue; }
    if (!/\.tsx?$/.test(ad)) continue;
    if (/\.(test|spec)\.tsx?$/.test(ad)) continue;
    birikim.push(tam);
  }
  return birikim;
}

const NATIVE = /window\s*\.\s*(?:prompt|alert|confirm)\s*\(/g;

const dosyalar = urunKaynaklari(KOK);
const nativeBulgular: string[] = [];
for (const y of dosyalar) {
  const metin = yorumsuz(fs.readFileSync(y, 'utf-8'));
  const adet = (metin.match(NATIVE) ?? []).length;
  for (let i = 0; i < adet; i++) nativeBulgular.push(path.relative(KOK, y).replace(/\\/g, '/'));
}

const govde = geriCagriGovdesi(gridKaynak, 'promptGroupDiscount');

// ── ÖLÇÜTÜN KENDİSİNİ DOĞRULA (bos kume yalanci yesil kapilari) ────────────
describe('★ BOS-KUME KAPISI — olcut gercekten bir sey olcuyor mu', () => {
  it('ExcelGrid kaynagi bos degil', () => {
    expect(gridKaynak.length).toBeGreaterThan(1000);
  });
  it('use-confirm kaynagi bos degil', () => {
    expect(kancaKaynak.length).toBeGreaterThan(500);
  });
  it('confirm-dialog renderer kaynagi bos degil', () => {
    expect(rendererKaynak.length).toBeGreaterThan(500);
  });
  it('`promptGroupDiscount` govdesi ayristirildi (bos degil)', () => {
    expect(govde.length).toBeGreaterThan(50);
  });
  it('ayristirilan govde DOGRU fonksiyona ait (`applyDiscountBulk` capasi)', () => {
    expect(govde).toContain('applyDiscountBulk');
  });
  it('`resolve` sozlesmesinin parametre tipi cozulebildi (bos degil)', () => {
    // Takma ad cozulemezse asagidaki KRITER 6 "string yok" diye YANLIS
    // kirmizi yanardi; bu assert olcutun kendisini olcer.
    expect(cozucuParametreTipi(kancaKaynak).length).toBeGreaterThan(0);
  });
  it('native diyalog taramasi dosya goruyor', () => {
    expect(dosyalar.length).toBeGreaterThan(50);
  });
  it('native diyalog dedektoru olu degil — en az bir cagri buluyor', () => {
    // Bakiye 0'a inerse bu assert kirmiziya doner ve CIRCIR olcutunun artik
    // hicbir sey olcmedigi ANINDA gorunur; sessizce yesil kalmaz.
    expect(nativeBulgular.length).toBeGreaterThan(0);
  });
});

// ── KRİTERLER (bir assert = bir kriter) ────────────────────────────────────
describe('S1 — grup iskontosu uygulama ici kutucukla sorulur', () => {
  it('KRITER 1 — `promptGroupDiscount` native diyalog CAGIRMIYOR', () => {
    expect(yorumsuz(govde)).not.toMatch(NATIVE);
  });

  it('KRITER 2 — `promptGroupDiscount` uygulama ici `promptValue` cagiriyor', () => {
    expect(yorumsuz(govde)).toContain('promptValue(');
  });

  it('KRITER 3 — cagri `ConfirmOptions.input` alanini geciriyor', () => {
    expect(cagriArgumani(yorumsuz(govde), 'promptValue')).toMatch(/\binput\s*:/);
  });

  it('KRITER 4 — `promptValue` use-confirm`ten disari aciliyor', () => {
    expect(kancaKaynak).toMatch(/export function promptValue\s*\(/);
  });

  it('KRITER 5 — `ConfirmOptions` `input` alanini ilan ediyor', () => {
    const blok = kancaKaynak.match(/export interface ConfirmOptions\s*\{([\s\S]*?)\n\}/);
    expect(blok?.[1] ?? '').toMatch(/^\s*input\?\s*:/m);
  });

  it('KRITER 6 — `resolve` sozlesmesi metin degeri de kabul ediyor', () => {
    expect(cozucuParametreTipi(kancaKaynak)).toContain('string');
  });

  it('KRITER 7 — renderer `opts.input` alanini OKUYOR', () => {
    expect(rendererKaynak).toContain('opts.input');
  });

  it('KRITER 8 — CIRCIR: frontend genelinde kalan native diyalog en fazla 3', () => {
    // Bakiye yalniz KISALIR. Uzarsa yeni bir isletim sistemi kutusu eklenmis
    // demektir. Kirmizi yanarsa bulgu listesi konsola basilir (asagidaki log).
    if (nativeBulgular.length > 3) console.log('  native diyalog bulgulari:', nativeBulgular.join(' · '));
    expect(nativeBulgular.length).toBeLessThanOrEqual(3);
  });
});
