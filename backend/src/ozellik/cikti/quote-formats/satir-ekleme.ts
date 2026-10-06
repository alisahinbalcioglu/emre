/**
 * MUSTERI FORMATI — SATIR EKLEMESI FORMULLERE YANSITILIR (06.10, P3).
 *
 * `icmalSatirlariniYaz` sablon satirini (T) bolum sayisi kadar cogaltir:
 * `duplicateRow` T'nin ALTINA k = n-1 satir ekler. ExcelJS alttaki hucreleri
 * KAYDIRIR ama hicbir formulun basvurusunu GUNCELLEMEZ (olculdu, 3 bolumlu
 * teklif, gercek Excel): musterinin ARA TOPLAM'i (SUM(E5:E5)) yalniz ilk
 * bolumu, KDV'si (E6*0.2) ikinci bolum satirini, KAPAK'taki 'İCMAL'!E8 ARA
 * TOPLAM'i gosteriyordu — GENEL 5020 / KAPAK 1010, dogrusu 7236.
 *
 * KURAL — Excel'in satir ekleme / kopyalama kurali, sablon satiri = bolum blogu:
 *  - Hedef sayfaya giden (yalin ya da sayfa adli) basvuru: satir > T → +k.
 *  - Aralik: ust ucu > T → +k; alt ucu > T → +k; alt ucu = T ise blogu kapsar
 *    (+k) — SUM(E5:E5) → SUM(E5:E7). ISTISNA (inceleme H1): formul SABLON
 *    SATIRININ KENDISINDEYSE goreli alt uc = T "bu satir" demektir, genislemez
 *    (SUM(C5:D5), birikimli SUM(F$5:F5) her kopyada kendi satirina iner);
 *    mutlak alt uc ($5) blogu kapsar (pay: E5/SUM($E$5:$E$5)).
 *  - Tek hucre basvurusu T'ye → degismez (ilk bolum satiri).
 *  - Mutlak ($) basvuru da kayar (Excel de kaydirir).
 *  - DOKUNULMAZ: tirnak ici metin, islev adi (LOG10( ), XFD otesi "sutun"
 *    (YIL2026 bir tanimli addir), dis kitap ([1]…!), 3B (A:B!E8),
 *    yapilandirilmis ([E8]), yalniz-sutun (E:E). Yalniz-satir aralik (5:5)
 *    TANINMAZ (bilinen sinir).
 *  - Sablon satirinin KOPYALARI (T+i): goreli satir +i, mutlak sabit (Excel'de
 *    satiri kopyalayip yapistirmak). Dizi formulu `ref`iyle birlikte.
 * Kosullu bicim (sablon satirindaki blogu kapsar), veri dogrulama (sablon
 * satirindaki kopyalara gecer), baski alani ve tanimli adlar da kayar.
 */
import * as ExcelJS from 'exceljs';

// [1] sayfa oneki (tirnakli ya da yalin) · [2..5] ilk hucre · [6..9] aralik sonu.
// Oncesi: harf/rakam/_/./$/!/'/]/[/: olamaz (ad parcasi, dis kitap, yapilandirilmis, 3B).
const REF_RE = /(?<![\p{L}\p{N}_.$!'\][:])((?:'(?:[^']|'')+'|[\p{L}_][\p{L}\p{N}_.]*)!)?(\$?)([A-Z]{1,3})(\$?)(\d+)(?::(\$?)([A-Z]{1,3})(\$?)(\d+))?(?![\p{L}\p{N}_(!'])/gu;
const SON_SUTUN = 16384; // XFD

const kolonNo = (h: string) => [...h].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
function kolonHarf(n: number): string {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

/** Formulun tirnak ("…", "" kacisli) DISINDAKI parcalarina `fn` uygular. */
function tirnakDisinda(formul: string, fn: (parca: string) => string): string {
  return formul.split(/("(?:[^"]|"")*")/).map((p, i) => (i % 2 ? p : fn(p))).join('');
}

/** Sayfa onekinden ad ("'Bölüm 1'!" → "Bölüm 1"); onek yoksa null. */
function onekAdi(onek: string | undefined): string | null {
  if (!onek) return null;
  const ad = onek.slice(0, -1);
  return ad.startsWith("'") ? ad.slice(1, -1).replace(/''/g, "'") : ad;
}

const buyuk = (s: string) => s.toLocaleUpperCase('tr');

interface Uc { satir: number; satirMutlak: boolean; sutun: number; sutunMutlak: boolean }
type Donustur = (u: Uc, konum: 'tek' | 'ust' | 'alt') => { satir: number; sutun: number };

/** Tirnak disindaki her basvuruyu `donustur` ile yeniden yazar (`sayfaSuzgeci`
 *  false donen basvuruya ve XFD otesi "sutuna" dokunulmaz). */
function basvurulariYaz(formul: string, sayfaSuzgeci: (sayfa: string | null) => boolean, donustur: Donustur): string {
  return tirnakDisinda(formul, (parca) => parca.replace(REF_RE, (m, onek, d1, k1, s1, r1, d2, k2, s2, r2) => {
    if (kolonNo(k1) > SON_SUTUN || (k2 !== undefined && kolonNo(k2) > SON_SUTUN)) return m; // tanimli ad (inceleme M2)
    if (!sayfaSuzgeci(onekAdi(onek))) return m;
    const pre = onek ?? '';
    const yaz = (d: string, k: string, s: string, r: string, konum: 'tek' | 'ust' | 'alt') => {
      const y = donustur({ satir: Number(r), satirMutlak: s === '$', sutun: kolonNo(k), sutunMutlak: d === '$' }, konum);
      return `${d}${kolonHarf(y.sutun)}${s}${y.satir}`;
    };
    if (k2 === undefined) return `${pre}${yaz(d1, k1, s1, r1, 'tek')}`;
    const ustA = Number(r1) <= Number(r2);
    return `${pre}${yaz(d1, k1, s1, r1, ustA ? 'ust' : 'alt')}:${yaz(d2, k2, s2, r2, ustA ? 'alt' : 'ust')}`;
  }));
}

/**
 * Satir eklemesi: `formulSayfasi`ndaki formulde `hedefSayfa`ya giden basvurular
 * (T'nin altina k satir eklendi) kaydirilir. `sablonda`: formul sablon satirinin
 * (hedef sayfa, T) kendisinde — goreli alt uc = T genislemez (inceleme H1).
 */
export function formulSatirEkle(formul: string, formulSayfasi: string, hedefSayfa: string, T: number, k: number, sablonda = false): string {
  if (k <= 0) return formul;
  const hedefB = buyuk(hedefSayfa);
  const formulB = buyuk(formulSayfasi);
  return basvurulariYaz(
    formul,
    (sayfa) => (sayfa === null ? formulB : buyuk(sayfa)) === hedefB,
    (u, konum) => {
      const r = u.satir;
      if (konum === 'alt' && r === T) return { satir: sablonda && !u.satirMutlak ? r : r + k, sutun: u.sutun };
      return { satir: r > T ? r + k : r, sutun: u.sutun };
    },
  );
}

/** Goreli kaydirma (Excel kopyasi): goreli satir +satirOfset, goreli sutun
 *  +sutunOfset, mutlaklar sabit — her sayfa. */
export function formulKaydir(formul: string, satirOfset: number, sutunOfset = 0): string {
  if (satirOfset === 0 && sutunOfset === 0) return formul;
  return basvurulariYaz(formul, () => true, (u) => ({
    satir: u.satirMutlak ? u.satir : u.satir + satirOfset,
    sutun: u.sutunMutlak ? u.sutun : u.sutun + sutunOfset,
  }));
}

/** Sablon kopyasi (T+ofset): goreli satir +ofset, mutlak satir sabit. */
export const formulSatirKopyala = (formul: string, ofset: number) => formulKaydir(formul, ofset, 0);

/** Aralik listesi metni (kosullu bicim / baski alani / dogrulama anahtari) —
 *  yalin ya da hedef sayfa adli araliklar kayar. `blok`: sablon satirindaki
 *  TEK hucre de bolum blogunu kapsar (kosullu bicim: bicim her bolum satirina). */
function aralikMetniEkle(metin: string, hedefAdi: string, T: number, k: number, blok = false): string {
  const hazir = blok
    ? metin.replace(REF_RE, (m, onek, d1, k1, s1, r1, d2) => (d2 === undefined && Number(r1) === T ? `${m}:${d1}${k1}${s1}${r1}` : m))
    : metin;
  return formulSatirEkle(hazir, hedefAdi, hedefAdi, T, k);
}

/** Hucrenin formul metni (paylasimli bagimlida ExcelJS'in cevirisi); yoksa null. */
function formulMetni(c: ExcelJS.Cell): string | null {
  const v: any = c.value;
  if (!v || typeof v !== 'object') return null;
  if (typeof v.formula === 'string') return v.formula;
  if (typeof v.sharedFormula === 'string') return (c as any).formula ?? null;
  return null;
}

/**
 * Paylasimli formul GRUPLARINI duz formule acar — yalniz hedef sayfadakileri ve
 * hedef sayfaya basvuranlari. `duplicateRow`DAN ONCE gerekir: bagimli hucre
 * ananin ADRESINI tasir (`sharedFormula: 'F8'`); ana kayinca bagimli okunamaz
 * (olculdu, SE6). Ceviri BIZIM tirnak bilen kaydiricimizla: ExcelJS'in
 * `slideFormula`si tirnak ici metni de kaydiriyordu ("m2" → "M3", inceleme H2).
 */
function paylasimliGruplariAc(wb: ExcelJS.Workbook, hedef: ExcelJS.Worksheet, T: number, k: number): void {
  const yazilacak: Array<{ c: ExcelJS.Cell; formul: string; sonuc: unknown }> = [];
  wb.eachSheet((ws) => {
    const analar = new Map<string, { c: ExcelJS.Cell; formul: string; bagimlilar: ExcelJS.Cell[] }>();
    const bagimlilar: Array<{ c: ExcelJS.Cell; ana: string }> = [];
    ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => {
      const v: any = c.value;
      if (!v || typeof v !== 'object') return;
      if (v.shareType === 'shared' && typeof v.formula === 'string') analar.set(c.address, { c, formul: v.formula, bagimlilar: [] });
      else if (typeof v.sharedFormula === 'string') bagimlilar.push({ c, ana: v.sharedFormula });
    }));
    for (const b of bagimlilar) analar.get(b.ana)?.bagimlilar.push(b.c);
    for (const g of analar.values()) {
      const cevir = (c: ExcelJS.Cell) => formulKaydir(g.formul, Number(c.row) - Number(g.c.row), Number(c.col) - Number(g.c.col));
      const metinler = [g.formul, ...g.bagimlilar.map(cevir)];
      // Acilir: grubun bir hucresi kayacaksa (hedef sayfada T ve alti — ana
      // adresi degisir) ya da bir formulu kural geregi degisecekse. Aksi halde
      // dokunulmaz: Excel kendi cevirisini yapar, cikti bayti degismez.
      const kayar = ws === hedef && [g.c, ...g.bagimlilar].some((c) => Number(c.row) >= T);
      const degisir = metinler.some((f) => formulSatirEkle(f, ws.name, hedef.name, T, k) !== f);
      if (!kayar && !degisir) continue;
      yazilacak.push({ c: g.c, formul: g.formul, sonuc: (g.c.value as any)?.result });
      for (const b of g.bagimlilar) yazilacak.push({ c: b, formul: cevir(b), sonuc: (b.value as any)?.result });
    }
  });
  for (const y of yazilacak) y.c.value = (y.sonuc === undefined ? { formula: y.formul } : { formula: y.formul, result: y.sonuc }) as any;
}

/**
 * Sablon satirinin (T) ALTINA k kopya ekler ve eklemeyi kitaba yansitir —
 * `icmalSatirlariniYaz`in tek satir ekleme yolu.
 */
export function satirEkle(wb: ExcelJS.Workbook, hedef: ExcelJS.Worksheet, T: number, k: number): number {
  if (k <= 0) return 0;
  // ExcelJS `duplicateRow` tanimli adlari KENDISI kaydirir ama yalniz eklenen
  // satirlarin altindakileri (sablonu iceren aralik genislemez) — ve sonra
  // bizim kural ustune binince ad IKI KEZ kayardi (olculdu, SE4). Adlar
  // eklemeden ONCEKI halinden bu kuralla yeniden kurulur.
  const dn: any = (wb as any).definedNames;
  const adlarOnce = Array.isArray(dn?.model) ? JSON.parse(JSON.stringify(dn.model)) as Array<{ ranges?: unknown }> : [];
  paylasimliGruplariAc(wb, hedef, T, k);
  hedef.duplicateRow(T, k, true);
  const n = satirEklemesiniYansit(wb, hedef, T, k);
  if (adlarOnce.length) {
    // Tanimli ad araliklari hep sayfa adlidir — yalin basvuru kaydirilmaz ('').
    const yeni = adlarOnce.map((a) => ({
      ...a,
      ranges: Array.isArray(a.ranges) ? a.ranges.map((r) => (typeof r === 'string' ? formulSatirEkle(r, '', hedef.name, T, k) : r)) : a.ranges,
    }));
    if (JSON.stringify(yeni) !== JSON.stringify(dn.model)) dn.model = yeni;
  }
  return n;
}

/**
 * `duplicateRow(T, k, true)`TAN SONRA cagrilir: kitaptaki tum formulleri, sablon
 * kopyalarini, kosullu bicim / dogrulama / baski alanini ekleme kuralina getirir.
 * Donen: yeniden yazilan formul hucresi sayisi. Once TUM metinler toplanir,
 * sonra yazilir. YALNIZ degisen yazilir: etkilenmeyen bicim / formul ve
 * formulsuz formatin ciktisi bayt bayt ayni kalir (kapi SE8).
 */
export function satirEklemesiniYansit(wb: ExcelJS.Workbook, hedef: ExcelJS.Worksheet, T: number, k: number): number {
  if (k <= 0) return 0;
  const hedefB = buyuk(hedef.name);
  const yazilacak: Array<{ c: ExcelJS.Cell; deger: any }> = [];
  const sablon: Array<{ col: number; formul: string; deger: any }> = [];
  wb.eachSheet((ws) => {
    ws.eachRow({ includeEmpty: false }, (row, rn) => {
      if (ws === hedef && rn > T && rn <= T + k) return; // sablon kopyalari asagida
      row.eachCell({ includeEmpty: false }, (c) => {
        const f = formulMetni(c);
        if (f === null) return;
        // Hizli eleme (inceleme M3): baska sayfada, hedefin adini anmayan formul
        if (ws !== hedef && !buyuk(f).includes(hedefB)) return;
        const sablonda = ws === hedef && rn === T;
        const yeni = formulSatirEkle(f, ws.name, hedef.name, T, k, sablonda);
        const eski: any = c.value;
        // Dizi formulu `ref`iyle (inceleme M1): duplicateRow hucreyi kaydirir, ref'i degil
        const ref = eski?.shareType === 'array' && typeof eski.ref === 'string' && ws === hedef
          ? aralikMetniEkle(eski.ref, hedef.name, T, k) : eski?.ref;
        const deger = { ...eski, formula: yeni, ...(ref !== undefined ? { ref } : {}) };
        if (sablonda) sablon.push({ col: Number(c.col), formul: yeni, deger });
        if (yeni !== f || ref !== eski?.ref) yazilacak.push({ c, deger });
      });
    });
  });
  // Sablon kopyalari duplicateRow'dan sablonun ESKI metnini tasir — Excel'in
  // kopyalama kuraliyla (goreli satir +i) yeniden kurulur.
  for (const s of sablon) {
    for (let i = 1; i <= k; i++) {
      const c = hedef.getCell(T + i, s.col);
      const ref = s.deger.shareType === 'array' && typeof s.deger.ref === 'string' ? formulSatirKopyala(s.deger.ref, i) : s.deger.ref;
      yazilacak.push({ c, deger: { ...s.deger, formula: formulSatirKopyala(s.formul, i), ...(ref !== undefined ? { ref } : {}) } });
    }
  }
  for (const y of yazilacak) y.c.value = y.deger;

  const formulleriKaydir = (liste: unknown, sayfa: string) => (Array.isArray(liste)
    ? liste.map((f) => (typeof f === 'string' ? formulSatirEkle(f, sayfa, hedef.name, T, k) : f)) : liste);
  const farkli = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);

  // Kosullu bicim: aralik hedef sayfada kayar (sablon satirindaki tek hucre
  // blogu kapsar — bicim her bolum satirina); kural formulleri her sayfada.
  wb.eachSheet((ws) => {
    for (const kb of ((ws as any).conditionalFormattings ?? []) as Array<{ ref: string; rules: any[] }>) {
      const ref = ws === hedef ? aralikMetniEkle(kb.ref, hedef.name, T, k, true) : kb.ref;
      if (ref !== kb.ref) kb.ref = ref;
      for (const kural of kb.rules ?? []) {
        const yeni = formulleriKaydir(kural.formulae, ws.name);
        if (farkli(yeni, kural.formulae)) kural.formulae = yeni;
      }
    }
  });
  // Veri dogrulama (ExcelJS hucre basina tutar): hedef sayfada adres kayar;
  // sablon satirindaki dogrulama kopyalara da gecer (bolum satirlarinda bosluk
  // kalmasin — inceleme: J4:J9 → J4:J5 + J8:J11 oluyordu).
  const dv = (hedef as any).dataValidations;
  if (dv?.model && typeof dv.model === 'object') {
    const yeni: Record<string, any> = {};
    for (const [adres, kural] of Object.entries(dv.model as Record<string, any>)) {
      const formulae = formulleriKaydir(kural?.formulae, hedef.name);
      const k2 = farkli(formulae, kural?.formulae) ? { ...kural, formulae } : kural;
      yeni[aralikMetniEkle(adres, hedef.name, T, k)] = k2;
      const tek = /^\$?([A-Z]{1,3})\$?(\d+)$/.exec(adres);
      if (tek && Number(tek[2]) === T) for (let i = 1; i <= k; i++) yeni[`${tek[1]}${T + i}`] = k2;
    }
    if (farkli(Object.keys(yeni), Object.keys(dv.model)) || farkli(Object.values(yeni), Object.values(dv.model))) dv.model = yeni;
  }
  // Baski alani (hedef sayfa; ExcelJS onu `pageSetup`ta tutar, KAYDIRMAZ —
  // olculdu). Tanimli adlar `satirEkle`de (ExcelJS kendisi de kaydirir).
  const ps: any = hedef.pageSetup;
  if (ps && typeof ps.printArea === 'string') {
    const alan = aralikMetniEkle(ps.printArea, hedef.name, T, k);
    if (alan !== ps.printArea) ps.printArea = alan;
  }
  return yazilacak.length;
}
