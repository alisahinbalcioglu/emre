/**
 * DAR FORMUL DEGERLENDIRICISI (06.10, P3) — musteri formullerinin onbellegi icin.
 *
 * Excel'in hesapladigi rakami BIREBIR uretebildigi dilbilgisini degerlendirir;
 * gerisinde `Desteklenmez` atar ve cagiran o hucrenin onbellegini BOSALTIR
 * (`musteri-onbellegi.ts`). Ilke: bos hucre yanlis rakamdan iyidir — tahmin yok.
 *
 * DESTEKLENEN: sayi, "metin", TRUE/FALSE, hucre/aralik (sayfa adli: tirnakli ya
 * da yalin), + - * / ^ % & (yalniz metin & metin), = <> < > <= >=, parantez,
 * SUM MIN MAX ABS ROUND ROUNDUP ROUNDDOWN IF.
 * DESTEKLENMEYEN (bilerek): yerele bagli her sey — TEXT, sayi & metin ("7236,000"
 * mi "7.236,00" mi Excel'in diline bagli; gercek Excel'de olculdu), metinden
 * sayiya cevrim ("1,5"), metin buyukluk karsilastirmasi (Turkce siralama);
 * hata degeri (#DIV/0! vb.), tanimli ad, tam sutun/satir, 3B, dis kitap,
 * yapilandirilmis basvuru, dizi sabiti, kesisim (bosluk), diger her islev.
 * Kenar durumlar `Desteklenmez`: 15. hanede esit sayilarin karsilastirmasi ve
 * birbirini goturen toplama/cikarma (0,1+0,2-0,3: Excel sonucu sifira yaslayabilir)
 * — Excel'in secimi bilinmeyen yerde tahmin edilmez. Yuvarlama Excel'in 15 hane
 * kuralidir (`excelYuvarla`, olculdu).
 */

export type Deger = number | string | boolean | null; // null = bos hucre

export class Desteklenmez extends Error {}

/** Hucre ve aralik okuyucusu; `sayfa` null = formulun kendi sayfasi. */
export interface FormulOrtami {
  /** Tek hucre degeri (bos → null). Bilinmiyorsa `Desteklenmez` atar. */
  hucre(sayfa: string | null, r: number, c: number): Deger;
  /** Araliktaki DOLU hucrelerin degerleri (bos hucre atlanir). */
  aralik(sayfa: string | null, r1: number, c1: number, r2: number, c2: number): Deger[];
}

export interface Basvuru { sayfa: string | null; r1: number; c1: number; r2: number; c2: number; aralik: boolean }

type Jeton =
  | { t: 'sayi'; v: number }
  | { t: 'metin'; v: string }
  | { t: 'mantik'; v: boolean }
  | { t: 'ref'; b: Basvuru }
  | { t: 'islev'; ad: string }
  | { t: 'op'; v: string }
  | { t: '(' } | { t: ')' } | { t: ',' };

const SON_SUTUN = 16384; // XFD
const SON_SATIR = 1048576;
const kolonNo = (h: string) => [...h].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

// Kaynagi baska hucreler olmayan / basvurusu metinden kurulan islevler: onculleri
// formulden okunamaz → "etkilendi" sayilir (temkinli).
const SAYILAMAYAN_ISLEVLER = new Set(['INDIRECT', 'OFFSET', 'NOW', 'TODAY', 'RAND', 'RANDBETWEEN', 'RANDARRAY', 'CELL', 'INFO']);
const DESTEKLENEN_ISLEVLER = new Set(['SUM', 'MIN', 'MAX', 'ABS', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'IF']);

const HUCRE_RE = /^\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?(?![\p{L}\p{N}_.(!:])/u;
const TAM_SUTUN_RE = /^\$?[A-Z]{1,3}:\$?[A-Z]{1,3}(?![\p{L}\p{N}_(])/u;
const TAM_SATIR_RE = /^\$?\d+:\$?\d+/;
const AD_RE = /^[\p{L}_\\][\p{L}\p{N}_.\\]*/u;
const YALIN_SAYFA_RE = /^([\p{L}_][\p{L}\p{N}_.]*)!/u;
const SAYI_RE = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;

/** Formulu jetonlara ayirir; cozulemeyen yapi gorurse `null`. */
function jetonla(formul: string): Jeton[] | null {
  const j: Jeton[] = [];
  let i = 0;
  const hucreOku = (sayfa: string | null): boolean => {
    const m = HUCRE_RE.exec(formul.slice(i));
    if (!m) return false;
    const c1 = kolonNo(m[1]); const r1 = Number(m[2]);
    const c2 = m[3] ? kolonNo(m[3]) : c1; const r2 = m[4] ? Number(m[4]) : r1;
    if (Math.max(c1, c2) > SON_SUTUN || Math.max(r1, r2) > SON_SATIR || Math.min(r1, r2) < 1) return false;
    j.push({ t: 'ref', b: { sayfa, r1: Math.min(r1, r2), c1: Math.min(c1, c2), r2: Math.max(r1, r2), c2: Math.max(c1, c2), aralik: m[3] !== undefined } });
    i += m[0].length;
    return true;
  };
  while (i < formul.length) {
    const ch = formul[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '"') {
      let s = ''; i++;
      for (;;) {
        if (i >= formul.length) return null;
        if (formul[i] === '"') { if (formul[i + 1] === '"') { s += '"'; i += 2; continue; } i++; break; }
        s += formul[i++];
      }
      j.push({ t: 'metin', v: s });
      continue;
    }
    if (ch === "'") {
      let ad = ''; i++;
      for (;;) {
        if (i >= formul.length) return null;
        if (formul[i] === "'") { if (formul[i + 1] === "'") { ad += "'"; i += 2; continue; } i++; break; }
        ad += formul[i++];
      }
      if (formul[i] !== '!' || ad.includes(':') || ad.startsWith('[')) return null; // 3B / dis kitap
      i++;
      if (!hucreOku(ad)) return null;
      continue;
    }
    if (TAM_SATIR_RE.test(formul.slice(i))) return null;
    if (/[\d.]/.test(ch)) {
      const m = SAYI_RE.exec(formul.slice(i));
      if (!m) return null;
      j.push({ t: 'sayi', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (ch === '$' || /[\p{L}_\\]/u.test(ch)) {
      const sm = YALIN_SAYFA_RE.exec(formul.slice(i));
      if (sm) { i += sm[0].length; if (!hucreOku(sm[1])) return null; continue; }
      if (hucreOku(null)) continue;
      if (TAM_SUTUN_RE.test(formul.slice(i))) return null;
      const am = AD_RE.exec(formul.slice(i));
      if (!am) return null;
      i += am[0].length;
      let k = i; while (k < formul.length && /\s/.test(formul[k])) k++;
      if (formul[k] === '(') { j.push({ t: 'islev', ad: am[0] }); i = k + 1; continue; }
      if (am[0] === 'TRUE' || am[0] === 'FALSE') { j.push({ t: 'mantik', v: am[0] === 'TRUE' }); continue; }
      return null; // tanimli ad
    }
    const iki = formul.slice(i, i + 2);
    if (iki === '<>' || iki === '<=' || iki === '>=') { j.push({ t: 'op', v: iki }); i += 2; continue; }
    if ('+-*/^&=<>%'.includes(ch)) { j.push({ t: 'op', v: ch }); i++; continue; }
    if (ch === '(' || ch === ')' || ch === ',') { j.push({ t: ch } as Jeton); i++; continue; }
    return null; // [ { # ; : ! ve digerleri
  }
  return j;
}

/** Formulun oncul basvurulari; `cozulmez` = onculleri formulden okunamaz
 *  (tanimli ad, tam sutun, 3B, dis kitap, INDIRECT/OFFSET, oynak islev...). */
export function onculler(formul: string): { basvurular: Basvuru[]; cozulmez: boolean } {
  const j = jetonla(formul);
  if (!j) return { basvurular: [], cozulmez: true };
  const cozulmez = j.some((x) => x.t === 'islev' && SAYILAMAYAN_ISLEVLER.has(x.ad.replace(/^_xl(?:fn|ws)\./, '')));
  return { basvurular: j.flatMap((x) => (x.t === 'ref' ? [x.b] : [])), cozulmez };
}

type Dugum =
  | { t: 'sabit'; v: Deger }
  | { t: 'ref'; b: Basvuru }
  | { t: 'tekli'; op: string; a: Dugum }
  | { t: 'yuzde'; a: Dugum }
  | { t: 'ikili'; op: string; a: Dugum; b: Dugum }
  | { t: 'islev'; ad: string; arg: Dugum[] };

/** Excel oncelik sirasi: karsilastirma < & < + - < * / < ^ < % < tekli -. */
function ayristir(j: Jeton[]): Dugum {
  let i = 0;
  const bak = () => j[i];
  const op = (...ops: string[]) => { const x = j[i]; return x && x.t === 'op' && ops.includes(x.v) ? (i++, x.v) : null; };
  const ikiliZincir = (alt: () => Dugum, ops: string[]) => () => {
    let a = alt();
    for (let o = op(...ops); o; o = op(...ops)) a = { t: 'ikili', op: o, a, b: alt() };
    return a;
  };
  const birincil = (): Dugum => {
    const x = j[i++];
    if (!x) throw new Desteklenmez('eksik ifade');
    if (x.t === 'sayi' || x.t === 'metin' || x.t === 'mantik') return { t: 'sabit', v: x.v };
    if (x.t === 'ref') return { t: 'ref', b: x.b };
    if (x.t === '(') {
      const a = karsilastirma();
      if (bak()?.t !== ')') throw new Desteklenmez('parantez');
      i++;
      return a;
    }
    if (x.t === 'islev') {
      if (!DESTEKLENEN_ISLEVLER.has(x.ad)) throw new Desteklenmez(`islev ${x.ad}`);
      const arg: Dugum[] = [];
      if (bak()?.t === ')') { i++; return { t: 'islev', ad: x.ad, arg }; }
      for (;;) {
        if (bak()?.t === ',' || bak()?.t === ')') throw new Desteklenmez('bos arguman');
        arg.push(karsilastirma());
        const s = j[i++];
        if (s?.t === ',') continue;
        if (s?.t === ')') return { t: 'islev', ad: x.ad, arg };
        throw new Desteklenmez('arguman listesi');
      }
    }
    throw new Desteklenmez('beklenmeyen jeton');
  };
  const tekli = (): Dugum => {
    const o = op('-', '+');
    return o ? { t: 'tekli', op: o, a: tekli() } : birincil();
  };
  const yuzde = (): Dugum => {
    let a = tekli();
    while (op('%')) a = { t: 'yuzde', a };
    return a;
  };
  const us = ikiliZincir(yuzde, ['^']);
  const carpim = ikiliZincir(us, ['*', '/']);
  const toplam = ikiliZincir(carpim, ['+', '-']);
  const birlestir = ikiliZincir(toplam, ['&']);
  const karsilastirma = ikiliZincir(birlestir, ['=', '<>', '<', '>', '<=', '>=']);
  const kok = karsilastirma();
  if (i !== j.length) throw new Desteklenmez('fazla jeton');
  return kok;
}

const sonlu = (v: number): number => {
  if (!Number.isFinite(v)) throw new Desteklenmez('sonsuz/NaN');
  return v;
};

/** Toplama sonucu: terimlere gore sifira cok yakin (birbirini goturme) ise belirsiz. */
const toplamSonucu = (sonuc: number, terimler: readonly number[]): number => {
  const olcek = terimler.reduce((m, t) => Math.max(m, Math.abs(t)), 0); // yayma yok: buyuk aralik
  if (sonuc !== 0 && Math.abs(sonuc) <= 1e-13 * olcek) throw new Desteklenmez('birbirini goturen toplam');
  return sonlu(sonuc);
};

/**
 * Excel'in ROUND / ROUNDUP / ROUNDDOWN'u: degerin 15 ANLAMLI HANELI ondalik
 * okumasi `d` haneye yuvarlanir (yakin: yarim sifirdan uzaga). Gercek Excel'de
 * olculdu (06.10, COM, 10.410 deger × 6 formul: x.xx5 sinirlari, carpim, toplam,
 * negatif): 62.460'in TAMAMI ayni rakam (57.109 birebir, 5.351 son bitte — Excel
 * sonucu kendi carpimiyla kurar, gorunur fark yok). Tam double okumasi (17 hane)
 * 2.676'sinda AYRISIYOR — ROUND(2.675;2) Excel'de 2,68: Math.round yanlis olurdu.
 */
export function excelYuvarla(x: number, d: number, kip: 'yakin' | 'yukari' | 'asagi'): number {
  return haneyleYuvarla(x, d, kip, 15);
}

/** `x`in `hassasiyet` anlamli haneli ondalik okumasini `d` haneye yuvarlar
 *  (olcum araci 17 haneyi de dener; uretim yolu yalniz 15). */
export function haneyleYuvarla(x: number, d: number, kip: 'yakin' | 'yukari' | 'asagi', hassasiyet: number): number {
  if (x === 0) return 0;
  const [mant, us] = Math.abs(x).toExponential(hassasiyet - 1).split('e');
  const M = BigInt(mant.replace('.', '')); // hassasiyet haneli tamsayi
  const q = Number(us) - (hassasiyet - 1) + d;
  // istenen haneden ince parca yok: deger, o hassasiyetteki okumasidir
  if (q >= 0) return Math.sign(x) * Number(`${mant}e${us}`);
  const p = 10n ** BigInt(-q);
  let Q = M / p;
  const kalan = M % p;
  if (kip === 'yakin' ? kalan * 2n >= p : kip === 'yukari' ? kalan > 0n : false) Q += 1n;
  return Math.sign(x) * Number(`${Q}e${-d}`);
}

const karsilastir = (op: string, a: Deger, b: Deger): boolean => {
  // Bos hucre karsisindakinin tipine doner (Excel): sayi → 0, metin → "", mantik → FALSE
  const bosu = (x: Deger, diger: Deger): Deger => (x !== null ? x : typeof diger === 'string' ? '' : typeof diger === 'boolean' ? false : 0);
  const x = bosu(a, b); const y = bosu(b, a);
  if (typeof x === 'number' && typeof y === 'number') {
    if (x !== y && Math.abs(x - y) <= 1e-12 * Math.max(Math.abs(x), Math.abs(y))) throw new Desteklenmez('15 hane esitligi');
    switch (op) {
      case '=': return x === y; case '<>': return x !== y;
      case '<': return x < y; case '>': return x > y; case '<=': return x <= y; default: return x >= y;
    }
  }
  if (typeof x === typeof y && (op === '=' || op === '<>')) {
    let esit = x === y;
    if (!esit && typeof x === 'string' && typeof y === 'string') {
      // Excel buyuk/kucuk harf duyarsiz; Turkce i/İ katlamasi dile bagli → belirsiz
      const katla = [(s: string) => s.toUpperCase(), (s: string) => s.toLowerCase(), (s: string) => s.toLocaleUpperCase('tr'), (s: string) => s.toLocaleLowerCase('tr')];
      if (katla.some((f) => f(x) === f(y))) throw new Desteklenmez('harf katlamasi');
    }
    return op === '=' ? esit : !esit;
  }
  throw new Desteklenmez('karsilastirma tipi');
};

/** Formulu degerlendirir; Excel'in rakamindan emin olunamazsa `Desteklenmez`. */
export function darHesapla(formul: string, ortam: FormulOrtami): Deger {
  const j = jetonla(formul);
  if (!j) throw new Desteklenmez('jeton');
  const kok = ayristir(j);

  const skaler = (d: Dugum): Deger => {
    switch (d.t) {
      case 'sabit': return d.v;
      case 'ref':
        if (d.b.aralik) throw new Desteklenmez('skaler baglamda aralik');
        return ortam.hucre(d.b.sayfa, d.b.r1, d.b.c1);
      case 'tekli': { const v = sayi(d.a); return d.op === '-' ? -v : v; }
      case 'yuzde': return sayi(d.a) / 100;
      case 'ikili': return ikili(d.op, d.a, d.b);
      case 'islev': return islev(d.ad, d.arg);
    }
  };
  const sayi = (d: Dugum): number => {
    const v = skaler(d);
    if (v === null) return 0;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'number') return sonlu(v);
    throw new Desteklenmez('metin aritmetikte');
  };
  const ikili = (op: string, a: Dugum, b: Dugum): Deger => {
    switch (op) {
      case '+': { const x = sayi(a); const y = sayi(b); return toplamSonucu(x + y, [x, y]); }
      case '-': { const x = sayi(a); const y = sayi(b); return toplamSonucu(x - y, [x, y]); }
      case '*': return sonlu(sayi(a) * sayi(b));
      case '/': { const x = sayi(a); const y = sayi(b); if (y === 0) throw new Desteklenmez('sifira bolme'); return sonlu(x / y); }
      case '^': { const x = sayi(a); const y = sayi(b); if (x === 0 && y <= 0) throw new Desteklenmez('0^0'); return sonlu(x ** y); }
      case '&': {
        const metin = (v: Deger) => { if (v === null) return ''; if (typeof v === 'string') return v; throw new Desteklenmez('sayi & metin (dile bagli)'); };
        return metin(skaler(a)) + metin(skaler(b));
      }
      default: return karsilastir(op, skaler(a), skaler(b));
    }
  };
  /** SUM/MIN/MAX: basvuru argumaninda yalniz SAYI hucreler; dogrudan argumanda sayi/mantik. */
  const sayilar = (arg: Dugum[]): number[] => {
    if (arg.length === 0) throw new Desteklenmez('argumansiz');
    const out: number[] = [];
    for (const a of arg) {
      if (a.t === 'ref') {
        for (const v of ortam.aralik(a.b.sayfa, a.b.r1, a.b.c1, a.b.r2, a.b.c2)) if (typeof v === 'number') out.push(sonlu(v));
      } else out.push(sayi(a));
    }
    return out;
  };
  const islev = (ad: string, arg: Dugum[]): Deger => {
    switch (ad) {
      case 'SUM': { const s = sayilar(arg); return toplamSonucu(s.reduce((t, v) => t + v, 0), s); }
      case 'MIN': { const s = sayilar(arg); return s.length ? s.reduce((m, v) => Math.min(m, v)) : 0; }
      case 'MAX': { const s = sayilar(arg); return s.length ? s.reduce((m, v) => Math.max(m, v)) : 0; }
      case 'ABS': if (arg.length !== 1) throw new Desteklenmez('ABS'); return Math.abs(sayi(arg[0]));
      case 'ROUND': case 'ROUNDUP': case 'ROUNDDOWN': {
        if (arg.length !== 2) throw new Desteklenmez(ad);
        const kip = ad === 'ROUND' ? 'yakin' : ad === 'ROUNDUP' ? 'yukari' : 'asagi';
        return excelYuvarla(sayi(arg[0]), Math.trunc(sayi(arg[1])), kip);
      }
      case 'IF': {
        if (arg.length < 2 || arg.length > 3) throw new Desteklenmez('IF');
        const k = skaler(arg[0]);
        if (typeof k === 'string') throw new Desteklenmez('IF kosulu metin');
        const dogru = k === null ? false : typeof k === 'boolean' ? k : sonlu(k) !== 0;
        if (dogru) return skaler(arg[1]);
        return arg.length === 3 ? skaler(arg[2]) : false;
      }
      default: throw new Desteklenmez(`islev ${ad}`);
    }
  };
  const v = skaler(kok);
  return v === null ? 0 : v; // bos hucreye basvuran formul Excel'de 0 gosterir
}
