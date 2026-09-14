/**
 * CIKTI TEST YARDIMCISI (13.09.2026) — `test:hesap` ve `test:antet` ortak
 * olcutleri ve fixture'lari. Test DEGILDIR (kendi basina kosmaz); iki test
 * dosyasi da `run()` tetiklemeden buradan okur. Olcutun kendisi
 * (degerlendirici) `test:hesap` H0 blogunda sinanir.
 */
import * as zlib from 'zlib';
import * as ExcelJS from 'exceljs';

// Kurus kurali: ekranin TEK hesap modulunden (beklenen degerlerle ayni kaynak)
const FE = require('../../frontend/ozellik/fiyat/pricing');
const K = (v: number): number => FE.kurusTamsayi(v);

// ════════════════════════════════════════════════════════════════════
// FORMUL DEGERLENDIRICISI — ciktinin urettigi alt kume: sayi, + - * / ( ),
// SUM(arg, ...), 'Sayfa'!A1[:B9], A1[:B9]. SUM metni/bosu yok sayar (Excel).
// Hata → { e }. Bilinmeyen fonksiyon/sozdizimi → throw (sessiz 0 YASAK).
// ════════════════════════════════════════════════════════════════════
export type Deger = { v: number; e?: undefined } | { e: string; v?: undefined };
const harfNo = (s: string) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

export function hucreDeger(wb: ExcelJS.Workbook, sayfa: string, r: number, c: number, yigin: string[]): Deger | 'bos' | 'metin' {
  const ws = wb.getWorksheet(sayfa);
  if (!ws) return { e: '#REF!' };
  const anahtar = `${sayfa}!${r},${c}`;
  if (yigin.includes(anahtar)) return { e: '#CYCLE' };
  const v: any = ws.getRow(r).getCell(c).value;
  if (v === null || v === undefined || v === '') return 'bos';
  if (typeof v === 'number') return { v };
  if (typeof v === 'object' && typeof v.formula === 'string') return formulDegerlendir(wb, sayfa, v.formula, [...yigin, anahtar]);
  if (typeof v === 'object' && v.error) return { e: String(v.error) };
  return 'metin';
}

export function formulDegerlendir(wb: ExcelJS.Workbook, sayfa: string, formul: string, yigin: string[] = []): Deger {
  const t: any[] = [];
  for (let i = 0; i < formul.length;) {
    const c = formul[i]; const kalan = formul.slice(i);
    if (c === ' ') { i++; continue; }
    if ('+-*/(),'.includes(c)) { t.push({ t: c }); i++; continue; }
    if (c === "'") {
      let j = i + 1; let s = '';
      for (; j < formul.length; j++) {
        if (formul[j] === "'" && formul[j + 1] === "'") { s += "'"; j++; continue; }
        if (formul[j] === "'") break;
        s += formul[j];
      }
      if (formul[j + 1] !== '!') throw new Error(`sayfa referansi bozuk: ${formul}`);
      t.push({ t: 'sayfa', v: s }); i = j + 2; continue;
    }
    const fn = /^([A-Z]+)\(/.exec(kalan);
    if (fn) { t.push({ t: 'fn', v: fn[1] }); i += fn[1].length; continue; }
    const ref = /^\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?/.exec(kalan);
    if (ref) {
      t.push({ t: 'ref', c1: harfNo(ref[1]), r1: +ref[2], c2: harfNo(ref[3] ?? ref[1]), r2: +(ref[4] ?? ref[2]) });
      i += ref[0].length; continue;
    }
    const sayi = /^\d+(\.\d+)?([eE][-+]?\d+)?/.exec(kalan);
    if (sayi) { t.push({ t: 'sayi', v: parseFloat(sayi[0]) }); i += sayi[0].length; continue; }
    throw new Error(`taninmayan formul parcasi: "${kalan}" (${formul})`);
  }
  let p = 0;
  const bak = () => t[p];
  const al = () => t[p++];
  const topla = (sf: string, r: any): Deger => {
    let s = 0;
    for (let rr = r.r1; rr <= r.r2; rr++) {
      for (let cc = r.c1; cc <= r.c2; cc++) {
        const h = hucreDeger(wb, sf, rr, cc, yigin);
        if (h === 'bos' || h === 'metin') continue;
        if (h.e) return h;
        s += h.v as number;
      }
    }
    return { v: s };
  };
  const tek = (sf: string, r: any): Deger => {
    if (r.r1 !== r.r2 || r.c1 !== r.c2) return { e: '#VALUE!(aralik)' };
    const h = hucreDeger(wb, sf, r.r1, r.c1, yigin);
    if (h === 'bos') return { v: 0 };
    if (h === 'metin') return { e: '#VALUE!(metin)' };
    return h;
  };
  const islem = (a: Deger, b: Deger, op: string): Deger => {
    if (a.e) return a; if (b.e) return b;
    const x = a.v as number; const y = b.v as number;
    return op === '+' ? { v: x + y } : op === '-' ? { v: x - y } : op === '*' ? { v: x * y } : y === 0 ? { e: '#DIV/0!' } : { v: x / y };
  };
  function ifade(): Deger {
    let a = terim();
    while (bak() && (bak().t === '+' || bak().t === '-')) { const op = al().t; a = islem(a, terim(), op); }
    return a;
  }
  function terim(): Deger {
    let a = etken();
    while (bak() && (bak().t === '*' || bak().t === '/')) { const op = al().t; a = islem(a, etken(), op); }
    return a;
  }
  function arguman(): Deger {
    const x = bak(); const sonra = (k: number) => !t[k] || t[k].t === ',' || t[k].t === ')';
    if (x?.t === 'sayfa' && t[p + 1]?.t === 'ref' && sonra(p + 2)) { al(); return topla(x.v, al()); }
    if (x?.t === 'ref' && sonra(p + 1)) { al(); return topla(sayfa, x); }
    return ifade();
  }
  function etken(): Deger {
    const x = al();
    if (!x) throw new Error(`beklenmedik son: ${formul}`);
    if (x.t === '-') { const a = etken(); return a.e ? a : { v: -(a.v as number) }; }
    if (x.t === 'sayi') return { v: x.v };
    if (x.t === '(') { const a = ifade(); if (al()?.t !== ')') throw new Error(`")" yok: ${formul}`); return a; }
    if (x.t === 'fn') {
      if (x.v !== 'SUM') throw new Error(`desteklenmeyen fonksiyon ${x.v}: ${formul}`);
      al(); // (
      const args: Deger[] = [];
      if (bak()?.t !== ')') { args.push(arguman()); while (bak()?.t === ',') { al(); args.push(arguman()); } }
      if (al()?.t !== ')') throw new Error(`SUM ")" yok: ${formul}`);
      let s = 0;
      for (const a of args) { if (a.e) return a; s += a.v as number; }
      return { v: s };
    }
    if (x.t === 'sayfa') return tek(x.v, al());
    if (x.t === 'ref') return tek(sayfa, x);
    throw new Error(`etken? ${JSON.stringify(x)} — ${formul}`);
  }
  const s = ifade();
  if (p !== t.length) throw new Error(`artik parca: ${formul}`);
  return s;
}

/** Hucrenin GERCEK degeri (formulse hucrelerden yeniden hesaplanmis). */
export function gercek(wb: ExcelJS.Workbook, sayfa: string, addr: string): Deger {
  const ws = wb.getWorksheet(sayfa)!;
  const cell = ws.getCell(addr);
  const h = hucreDeger(wb, sayfa, Number(cell.row), Number(cell.col), []);
  if (h === 'bos') return { v: 0 };
  if (h === 'metin') return { e: `metin:${String(cell.value).slice(0, 20)}` };
  return h;
}

/** Tum formul hucreleri: onbellek (result) = hucrelerden yeniden hesap, hatasiz. */
export function formulDenetimi(wb: ExcelJS.Workbook): { sayi: number; sorun: string[] } {
  const sorun: string[] = []; let sayi = 0;
  wb.eachSheet((ws) => ws.eachRow({ includeEmpty: false }, (row, rn) => row.eachCell({ includeEmpty: false }, (cell, cn) => {
    const v: any = cell.value;
    if (!(v && typeof v === 'object' && typeof v.formula === 'string')) return;
    sayi++;
    // EXCEL SINIRLARI (13.09, gercek Excel'de olculdu): formul metni en fazla
    // 8192 karakter, bir fonksiyon en fazla 255 arguman. Asan formul iceren
    // dosyayi Excel HIC ACMAZ ("Workbooks.Open ozelligi alinamiyor") — bu
    // degerlendirici formulu yine de hesaplayabildigi icin sinir AYRICA olculur.
    if (v.formula.length > 8192) sorun.push(`${ws.name}!${cell.address} formul ${v.formula.length} karakter > Excel siniri 8192`);
    for (const m of v.formula.match(/SUM\(([^()]*)\)/g) ?? []) {
      const arg = m.split(',').length;
      if (arg > 255) sorun.push(`${ws.name}!${cell.address} SUM ${arg} arguman > Excel siniri 255`);
    }
    const h = hucreDeger(wb, ws.name, rn, cn, []);
    if (h === 'bos' || h === 'metin' || h.e) { sorun.push(`${ws.name}!${cell.address} ${v.formula} → ${h === 'bos' || h === 'metin' ? h : h.e}`); return; }
    // ⚠ ExcelJS `value` okuyucusu `result: 0`'i DUSURUR ama dosyaya `<v>0</v>`
    // yazar (13.09 XML'de olculdu) — okunamayan onbellek 0 sayilir. Sifir
    // OLMAYAN gercek degerin onbellegi eksikse yine KIRMIZI (0 ≠ gercek).
    const onbellek = v.result === undefined ? 0 : v.result;
    if (typeof onbellek !== 'number' || K(onbellek) !== K(h.v as number)) {
      sorun.push(`${ws.name}!${cell.address} onbellek=${v.result} gercek=${h.v} [${v.formula.slice(0, 70)}]`);
    }
  })));
  return { sayi, sorun };
}



/** CRC-32 (PNG parca saglamasi) — Node surumune bagli olmamak icin elle. */
function crc32(b: Buffer): number {
  let c = ~0;
  for (let i = 0; i < b.length; i++) {
    c ^= b[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

/** Gecerli, duz renkli bir PNG uretir (genislik × yukseklik, RGB). */
export function pngUret(genislik: number, yukseklik: number, rgb: [number, number, number] = [30, 64, 175]): Buffer {
  const parca = (tur: string, veri: Buffer) => {
    const uz = Buffer.alloc(4); uz.writeUInt32BE(veri.length);
    const tv = Buffer.concat([Buffer.from(tur, 'ascii'), veri]);
    const cs = Buffer.alloc(4); cs.writeUInt32BE(crc32(tv));
    return Buffer.concat([uz, tv, cs]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(genislik, 0); ihdr.writeUInt32BE(yukseklik, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const satir = Buffer.alloc(1 + genislik * 3);
  for (let x = 0; x < genislik; x++) satir.set(rgb, 1 + x * 3);
  const ham = Buffer.concat(Array.from({ length: yukseklik }, () => satir));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    parca('IHDR', ihdr), parca('IDAT', zlib.deflateSync(ham)), parca('IEND', Buffer.alloc(0)),
  ]);
}

/** 1×1 JPEG (SOF2, gecerli basliklar). */
export const JPEG_1PX = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);

/** RIFF....WEBPVP8 imzali (magic-number kapisini gecen) webp basligi. */
export const WEBP_BASLIK = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(24)]);

/** Tum antet alanlari dolu firma — logo 300×100 PNG. */
export const TAM_FIRMA = {
  unvan: 'Örnek Mühendislik Tesisat Ltd. Şti.',
  faturaAdresi: 'Atatürk Cad. No: 12/3',
  ilce: 'Kadıköy',
  il: 'İstanbul',
  telefon: '0216 555 12 34',
  faturaEposta: 'teklif@ornekmuhendislik.com.tr',
  vergiDairesi: 'Kozyatağı',
  vergiNo: '1234567890',
  logoBytes: pngUret(300, 100),
  logoMime: 'image/png',
};
