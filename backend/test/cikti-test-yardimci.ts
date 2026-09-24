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
// FORMUL DEGERLENDIRICISI — ciktinin urettigi alt kume: sayi, "metin",
// + - * / ( ), karsilastirma (= <> < > <= >=), SUM/COUNT(arg, ...),
// IF(k, a, b), ROUND/ROUNDUP(x, n), 'Sayfa'!A1[:B9], A1[:B9].
// SUM/COUNT metni/bosu yok sayar (Excel). Hata → { e }. Bilinmeyen
// fonksiyon/sozdizimi → throw (sessiz 0 YASAK).
// 23.09 (yeni tasarim): kalem satiri formulleri `IF(E7="","",ROUND(C7*E7,2))`
// ve `IF(COUNT(F7,H7)=0,"",SUM(F7,H7))` — METIN sonuc ("") uretebilir.
// ════════════════════════════════════════════════════════════════════
export type Deger = { v: number; e?: undefined; m?: undefined } | { e: string; v?: undefined; m?: undefined };
/** Formulun kendi sonucu METIN de olabilir (`""` — fiyatsiz satir). */
export type FormulSonucu = Deger | { m: string; v?: undefined; e?: undefined };
type Ic = { v: number; e?: undefined; m?: undefined; bos?: undefined }
  | { e: string; v?: undefined; m?: undefined; bos?: undefined }
  | { m: string; v?: undefined; e?: undefined; bos?: undefined }
  | { bos: true; v?: undefined; e?: undefined; m?: undefined };
const harfNo = (s: string) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

export function hucreDeger(wb: ExcelJS.Workbook, sayfa: string, r: number, c: number, yigin: string[]): Deger | 'bos' | 'metin' {
  const h = hucreIc(wb, sayfa, r, c, yigin);
  if (h.bos) return 'bos';
  if (h.m !== undefined) return 'metin';
  return h.e !== undefined ? { e: h.e } : { v: h.v as number };
}

function hucreIc(wb: ExcelJS.Workbook, sayfa: string, r: number, c: number, yigin: string[]): Ic {
  const ws = wb.getWorksheet(sayfa);
  if (!ws) return { e: '#REF!' };
  const anahtar = `${sayfa}!${r},${c}`;
  if (yigin.includes(anahtar)) return { e: '#CYCLE' };
  const v: any = ws.getRow(r).getCell(c).value;
  if (v === null || v === undefined || v === '') return { bos: true };
  if (typeof v === 'number') return { v };
  if (typeof v === 'object' && typeof v.formula === 'string') return formulDegerlendir(wb, sayfa, v.formula, [...yigin, anahtar]);
  if (typeof v === 'object' && v.error) return { e: String(v.error) };
  if (typeof v === 'string') return { m: v };
  const metin = Array.isArray(v?.richText) ? v.richText.map((x: any) => x.text).join('') : String(v?.text ?? '');
  return { m: metin };
}

/** Excel ROUND/ROUNDUP: 15 anlamli haneye kirpilip yuvarlanir (ROUND(2.675,2) = 2,68). */
function yuvarla(x: number, n: number, yukari: boolean): number {
  const k = 10 ** n;
  const mutlak = Number((Math.abs(x) * k).toPrecision(15));
  const r = (yukari ? Math.ceil(mutlak) : Math.round(mutlak)) / k;
  return x < 0 ? -r : r;
}

export function formulDegerlendir(wb: ExcelJS.Workbook, sayfa: string, formul: string, yigin: string[] = []): FormulSonucu {
  const t: any[] = [];
  for (let i = 0; i < formul.length;) {
    const c = formul[i]; const kalan = formul.slice(i);
    if (c === ' ') { i++; continue; }
    const kar = /^(<>|<=|>=|=|<|>)/.exec(kalan);
    if (kar) { t.push({ t: 'kar', v: kar[1] }); i += kar[1].length; continue; }
    if ('+-*/(),'.includes(c)) { t.push({ t: c }); i++; continue; }
    if (c === '"') {
      let j = i + 1; let s = '';
      for (; j < formul.length; j++) {
        if (formul[j] === '"' && formul[j + 1] === '"') { s += '"'; j++; continue; }
        if (formul[j] === '"') break;
        s += formul[j];
      }
      if (j >= formul.length) throw new Error(`metin kapanmadi: ${formul}`);
      t.push({ t: 'metin', v: s }); i = j + 1; continue;
    }
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
  /** Aralik hucreleri (SUM/COUNT argumani). */
  const hucreler = (sf: string, r: any): Ic[] => {
    const l: Ic[] = [];
    for (let rr = r.r1; rr <= r.r2; rr++) for (let cc = r.c1; cc <= r.c2; cc++) l.push(hucreIc(wb, sf, rr, cc, yigin));
    return l;
  };
  const tek = (sf: string, r: any): Ic => {
    if (r.r1 !== r.r2 || r.c1 !== r.c2) return { e: '#VALUE!(aralik)' };
    return hucreIc(wb, sf, r.r1, r.c1, yigin);
  };
  /** Aritmetik icin sayi: bos → 0, metin → #VALUE! (Excel: ""*5). */
  const sayiya = (a: Ic): Deger => {
    if (a.bos) return { v: 0 };
    if (a.m !== undefined) return { e: '#VALUE!(metin)' };
    return a.e !== undefined ? { e: a.e } : { v: a.v as number };
  };
  const islem = (a0: Ic, b0: Ic, op: string): Ic => {
    const a = sayiya(a0); const b = sayiya(b0);
    if (a.e !== undefined) return a;
    if (b.e !== undefined) return b;
    const x = a.v as number; const y = b.v as number;
    return op === '+' ? { v: x + y } : op === '-' ? { v: x - y } : op === '*' ? { v: x * y } : y === 0 ? { e: '#DIV/0!' } : { v: x / y };
  };
  /** Excel karsilastirmasi: bos hucre "" ve 0'a esittir; sayi ile metin esit degildir (metin > sayi). */
  const karsilastir = (a: Ic, b: Ic, op: string): Ic => {
    if (a.e !== undefined) return a;
    if (b.e !== undefined) return b;
    const tur = (x: Ic): 'bos' | 'm' | 'v' => (x.bos ? 'bos' : x.m !== undefined ? 'm' : 'v');
    const ta = tur(a); const tb = tur(b);
    let fark: number;
    if (ta === 'bos' && tb === 'bos') fark = 0;
    else if (ta === 'bos' || tb === 'bos') {
      const dolu = ta === 'bos' ? b : a;
      const f = dolu.m !== undefined ? (dolu.m === '' ? 0 : 1) : Math.sign(dolu.v as number);
      fark = ta === 'bos' ? -f : f;
    } else if (ta === 'v' && tb === 'v') fark = Math.sign((a.v as number) - (b.v as number));
    else if (ta === 'm' && tb === 'm') fark = Math.sign((a.m as string).toLocaleLowerCase('tr').localeCompare((b.m as string).toLocaleLowerCase('tr')));
    else fark = ta === 'm' ? 1 : -1;
    const d = op === '=' ? fark === 0 : op === '<>' ? fark !== 0 : op === '<' ? fark < 0 : op === '>' ? fark > 0 : op === '<=' ? fark <= 0 : fark >= 0;
    return { v: d ? 1 : 0 };
  };
  function karsilastirma(): Ic {
    let a = ifade();
    while (bak()?.t === 'kar') { const op = al().v; a = karsilastir(a, ifade(), op); }
    return a;
  }
  function ifade(): Ic {
    let a = terim();
    while (bak() && (bak().t === '+' || bak().t === '-')) { const op = al().t; a = islem(a, terim(), op); }
    return a;
  }
  function terim(): Ic {
    let a = etken();
    while (bak() && (bak().t === '*' || bak().t === '/')) { const op = al().t; a = islem(a, etken(), op); }
    return a;
  }
  /** SUM/COUNT argumani: tek basina aralik ise hucre listesi, degilse tek deger. */
  function arguman(): Ic[] {
    const x = bak(); const sonra = (k: number) => !t[k] || t[k].t === ',' || t[k].t === ')';
    if (x?.t === 'sayfa' && t[p + 1]?.t === 'ref' && sonra(p + 2)) { al(); return hucreler(x.v, al()); }
    if (x?.t === 'ref' && sonra(p + 1)) { al(); return hucreler(sayfa, x); }
    return [karsilastirma()];
  }
  function argumanlar(ad: string): Ic[][] {
    if (al()?.t !== '(') throw new Error(`${ad} "(" yok: ${formul}`);
    const args: Ic[][] = [];
    if (bak()?.t !== ')') { args.push(arguman()); while (bak()?.t === ',') { al(); args.push(arguman()); } }
    if (al()?.t !== ')') throw new Error(`${ad} ")" yok: ${formul}`);
    return args;
  }
  /** IF/ROUND argumanlari tek degerdir; aralik → #VALUE!. */
  function tekArgumanlar(ad: string): Ic[] {
    return argumanlar(ad).map((l) => (l.length === 1 ? l[0] : { e: '#VALUE!(aralik)' }));
  }
  function etken(): Ic {
    const x = al();
    if (!x) throw new Error(`beklenmedik son: ${formul}`);
    if (x.t === '-') { const a = sayiya(etken()); return a.e !== undefined ? a : { v: -(a.v as number) }; }
    if (x.t === 'sayi') return { v: x.v };
    if (x.t === 'metin') return { m: x.v };
    if (x.t === '(') { const a = karsilastirma(); if (al()?.t !== ')') throw new Error(`")" yok: ${formul}`); return a; }
    if (x.t === 'fn') {
      if (x.v === 'SUM') {
        let s = 0;
        for (const l of argumanlar('SUM')) {
          for (const a of l) {
            if (a.e !== undefined) return a;
            if (a.v !== undefined) s += a.v; // SUM metni/bosu yok sayar
          }
        }
        return { v: s };
      }
      if (x.v === 'COUNT') {
        let n = 0;
        for (const l of argumanlar('COUNT')) for (const a of l) if (a.v !== undefined) n++; // hata/metin/bos sayilmaz
        return { v: n };
      }
      if (x.v === 'IF') {
        const a = tekArgumanlar('IF');
        if (a.length !== 3) throw new Error(`IF 3 arguman ister: ${formul}`);
        const k = a[0];
        if (k.e !== undefined) return k;
        if (k.m !== undefined) return { e: '#VALUE!(IF metin)' };
        const dogru = k.bos ? false : (k.v as number) !== 0;
        return dogru ? a[1] : a[2];
      }
      if (x.v === 'ROUND' || x.v === 'ROUNDUP') {
        const a = tekArgumanlar(x.v);
        if (a.length !== 2) throw new Error(`${x.v} 2 arguman ister: ${formul}`);
        const d = sayiya(a[0]); const n = sayiya(a[1]);
        if (d.e !== undefined) return d;
        if (n.e !== undefined) return n;
        return { v: yuvarla(d.v as number, n.v as number, x.v === 'ROUNDUP') };
      }
      throw new Error(`desteklenmeyen fonksiyon ${x.v}: ${formul}`);
    }
    if (x.t === 'sayfa') return tek(x.v, al());
    if (x.t === 'ref') return tek(sayfa, x);
    throw new Error(`etken? ${JSON.stringify(x)} — ${formul}`);
  }
  const s = karsilastirma();
  if (p !== t.length) throw new Error(`artik parca: ${formul}`);
  // Formulun SONUCU bos olamaz: bos hucreye bakan formul (=A1) 0 verir (Excel)
  if (s.bos) return { v: 0 };
  if (s.m !== undefined) return { m: s.m };
  return s.e !== undefined ? { e: s.e } : { v: s.v as number };
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
    // ONBELLEK MODELDEN okunur: ExcelJS `value` okuyucusu `result`in 0 ve "" degerlerini
    // DUSURUR (cell.js `_copyModel` yalniz dogru-degerlileri kopyalar), model ikisini de
    // tutar ve dosyaya dogru yazar (23.09 olculdu). Dosyadan yuklenince `<v>0</v>` → 0,
    // bos metin `<v></v>` → yok (undefined).
    const onbellekHam: unknown = (cell as any).model?.result;
    // METIN sonuclu formul (23.09: fiyatsiz kalemin `IF(E7="","",…)` → ""): onbellek de
    // metin olmali (ya da dosyadan yuklenmis bos metin → yok). Sayi onbellek KIRMIZI.
    const ham = formulDegerlendir(wb, ws.name, v.formula, [`${ws.name}!${rn},${cn}`]);
    if (ham.m !== undefined) {
      if (!(onbellekHam === ham.m || (onbellekHam === undefined && ham.m === ''))) {
        sorun.push(`${ws.name}!${cell.address} onbellek=${JSON.stringify(onbellekHam)} gercek=metin ${JSON.stringify(ham.m)} [${v.formula.slice(0, 70)}]`);
      }
      return;
    }
    const h = hucreDeger(wb, ws.name, rn, cn, []);
    if (h === 'bos' || h === 'metin' || h.e) { sorun.push(`${ws.name}!${cell.address} ${v.formula} → ${h === 'bos' || h === 'metin' ? h : h.e}`); return; }
    // Onbelleksiz formul (yok) 0 sayilir — Sifir OLMAYAN gercek degerin onbellegi
    // eksikse yine KIRMIZI (0 ≠ gercek). Metin onbellek ("") sayi formulde KIRMIZI.
    const onbellek = onbellekHam === undefined ? 0 : onbellekHam;
    if (typeof onbellek !== 'number' || K(onbellek) !== K(h.v as number)) {
      sorun.push(`${ws.name}!${cell.address} onbellek=${JSON.stringify(onbellekHam)} gercek=${h.v} [${v.formula.slice(0, 70)}]`);
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
