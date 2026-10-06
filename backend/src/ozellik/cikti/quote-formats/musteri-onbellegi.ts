/**
 * MUSTERI FORMULLERININ ONBELLEGI (06.10, P3) — Korumali Gorunum yanlis rakam gostermesin.
 *
 * Musterinin format dosyasindaki KENDI formulleri (ARA TOPLAM, KDV, GENEL TOPLAM,
 * KAPAK'tan basvuru...) ciktida sablonun ESKI onbellegini tasiyordu. Excel normal
 * acilista yeniden hesaplar; ama e-postayla gelen ek Korumali Gorunum'de acilir ve
 * orada HESAPLAMAZ — onbellegi gosterir. Gercek Excel'de olculdu (COM
 * ProtectedViewWindows, 3 bolumlu teklif): KAPAK ve GENEL TOPLAM 180 (sablonun
 * ornek rakami), dogrusu 7236. Onbellegi bosaltilan hucre Korumali Gorunum'de BOS
 * (fullCalcOnLoad orada hesaplatmaz), dogru onbellek dogru rakam.
 *
 * KURAL: yalniz cikti uretiminin DEGISTIRDIGI hucrelere (dogrudan ya da zincirle)
 * dayanan musteri formulleri "etkilenir":
 *  (a) dar degerlendirici (`dar-degerlendirici.ts`) Excel'in rakamini uretebiliyorsa
 *      onbellek o rakamla yazilir;
 *  (b) uretemiyorsa onbellek BOSALTILIR + `fullCalcOnLoad` — bos hucre yanlis
 *      rakamdan iyidir; Excel normal acilista hesaplar.
 * Etkilenmeyen formul (onculleri sablondaki haliyle ayni) DOKUNULMAZ: onbellegi
 * Excel'in kendi hesabidir. Formulsuz format → fotograf yok, cikti bayt bayt ayni.
 *
 * "Degisti" olcusu: cikti uretiminden ONCE alinan fotograf (`onbellekFotografi`) ile
 * son hal, `satirEkle` kaydiyla satir eslenerek. Bizim yazdigimiz (`dolan`), eklenen
 * satirdaki ve yeni (liste) sayfadaki her hucre degismis sayilir; silinen sayfaya
 * (liste yuvasi) ya da onculu formulden okunamayan formul (tanimli ad, tam sutun,
 * INDIRECT, TODAY...) temkinle etkilenmis sayilir.
 */
import * as ExcelJS from 'exceljs';
import { darHesapla, onculler, Desteklenmez, type Basvuru, type Deger } from './dar-degerlendirici';
import { formulDegeri, formulKaydir, satirEklemeleri } from './satir-ekleme';

const buyuk = (s: string) => s.toLocaleUpperCase('tr');
const konum = (r: number, c: number) => `${r}:${c}`;
const T = ExcelJS.ValueType;

/** "E10" / "$E$10" → [satir, sutun]; aralik ("L8:L10") → ilk ve son kose. */
function adresCoz(adres: string): { r1: number; c1: number; r2: number; c2: number } | null {
  const m = /^\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?$/.exec(adres);
  if (!m) return null;
  const kolon = (h: string) => [...h].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const r1 = Number(m[2]); const c1 = kolon(m[1]);
  return { r1, c1, r2: m[4] ? Number(m[4]) : r1, c2: m[3] ? kolon(m[3]) : c1 };
}

/** Hucrenin karsilastirma anahtari ('' = bos, 'f' = formul). */
function degerAnahtari(c: ExcelJS.Cell): string {
  const v: any = c.value;
  switch (c.type) {
    case T.Null: case T.Merge: return '';
    case T.Formula: return 'f';
    case T.Number: return `n${v}`;
    case T.String: return `s${v}`;
    case T.RichText: return `s${(v?.richText ?? []).map((p: any) => p.text ?? '').join('')}`;
    case T.Hyperlink: return `h${v?.text ?? ''}|${v?.hyperlink ?? ''}`;
    case T.Boolean: return `b${v}`;
    case T.Date: return `d${v instanceof Date ? v.getTime() : v}`;
    case T.Error: return `e${v?.error ?? ''}`;
    default: return `?${JSON.stringify(v)}`;
  }
}

/** Sayfa adi (buyuk) → "r:c" → deger anahtari. */
export interface OnbellekFotografi { readonly sayfalar: ReadonlyMap<string, ReadonlyMap<string, string>> }

/** Cikti uretiminden ONCE (liste yuvalari silindikten sonra) alinir. Kitapta
 *  formul yoksa null: tazeleme hic calismaz, cikti bayt bayt ayni kalir. */
export function onbellekFotografi(wb: ExcelJS.Workbook): OnbellekFotografi | null {
  let formulVar = false;
  const sayfalar = new Map<string, Map<string, string>>();
  for (const ws of wb.worksheets) {
    const m = new Map<string, string>();
    ws.eachRow({ includeEmpty: false }, (row, r) => row.eachCell({ includeEmpty: false }, (c, col) => {
      const a = degerAnahtari(c);
      if (a === 'f') formulVar = true;
      if (a !== '') m.set(konum(r, col), a);
    }));
    sayfalar.set(buyuk(ws.name), m);
  }
  return formulVar ? { sayfalar } : null;
}

interface SayfaDurumu {
  ws: ExcelJS.Worksheet;
  /** Fotografta yok (teklifin liste sayfasi): her hucresi degismis sayilir. */
  yeni: boolean;
  kirli: Set<string>;
  /** Eklenen satir araliklari (cikti koordinati, dahil). */
  eklenen: Array<[number, number]>;
  /** Musteri formulleri (bizim yazmadigimiz) "r:c" → hucre. */
  adaylar: Map<string, ExcelJS.Cell>;
  /** Cok hucreli dizi formulunun cikti hucresi "r:c" → ana formulun "r:c"si. */
  diziCiktisi: Map<string, string>;
}

export interface OnbellekSonucu {
  /** Ciktinin degistirdigi hucrelere dayanan musteri formulu sayisi. */
  etkilenen: number;
  /** Dar degerlendiriciyle yeniden yazilan onbellek. */
  hesaplanan: number;
  /** Degerlendirilemedigi icin bosaltilan onbellek (fullCalcOnLoad eklenir). */
  bosaltilan: number;
}

/** Ekleme kaydindan: cikti satiri → sablon satiri (yeni satirsa null). */
function satirEsleyici(eklemeler: ReadonlyArray<{ T: number; k: number }>) {
  const geri = (r: number): number | null => {
    for (let i = eklemeler.length - 1; i >= 0; i--) {
      const e = eklemeler[i];
      if (r > e.T + e.k) r -= e.k;
      else if (r > e.T) return null;
    }
    return r;
  };
  const ileri = (r: number): number => eklemeler.reduce((x, e) => (x > e.T ? x + e.k : x), r);
  // Eklenen satirlar cikti koordinatinda: her ekleme sonraki eklemelerle kayar
  const eklenen: Array<[number, number]> = [];
  eklemeler.forEach((e, i) => {
    let araliklar: Array<[number, number]> = [[e.T + 1, e.T + e.k]];
    for (const s of eklemeler.slice(i + 1)) {
      araliklar = araliklar.flatMap(([a, b]): Array<[number, number]> => (s.T >= b ? [[a, b]]
        : s.T < a ? [[a + s.k, b + s.k]]
          : [[a, s.T], [s.T + 1 + s.k, b + s.k]]));
    }
    eklenen.push(...araliklar);
  });
  return { geri, ileri, eklenen };
}

/**
 * Etkilenen musteri formullerinin onbellegini yazar ya da bosaltir (kural: dosya
 * basi). `bizim`: cikti motorunun doldurdugu hucreler (`dolan`). Tek cagri,
 * cikti uretiminin EN SONUNDA (override'lar ve bizim onbellek tazelememizden sonra).
 */
export function musteriOnbellekleriniTazele(
  wb: ExcelJS.Workbook, foto: OnbellekFotografi, bizim: ReadonlyArray<{ sheet: string; addr: string }>,
): OnbellekSonucu {
  const bizimKonum = new Map<string, Set<string>>();
  for (const d of bizim) {
    const a = adresCoz(d.addr);
    if (!a) continue;
    const ad = buyuk(d.sheet);
    if (!bizimKonum.has(ad)) bizimKonum.set(ad, new Set());
    bizimKonum.get(ad)!.add(konum(a.r1, a.c1));
  }

  // ── 1. Degisen hucreler ve aday formuller ────────────────────────────
  const durumlar = new Map<string, SayfaDurumu>();
  for (const ws of wb.worksheets) {
    const ad = buyuk(ws.name);
    const snap = foto.sayfalar.get(ad);
    const d: SayfaDurumu = { ws, yeni: !snap, kirli: new Set(), eklenen: [], adaylar: new Map(), diziCiktisi: new Map() };
    durumlar.set(ad, d);
    if (!snap) continue;
    const es = satirEsleyici(satirEklemeleri(wb).filter((e) => buyuk(e.sayfa) === ad));
    d.eklenen = es.eklenen;
    const bz = bizimKonum.get(ad) ?? new Set<string>();
    ws.eachRow({ includeEmpty: false }, (row, r) => row.eachCell({ includeEmpty: false }, (c, col) => {
      const a = degerAnahtari(c);
      if (a === '') return;
      const k = konum(r, col);
      if (bz.has(k)) { d.kirli.add(k); return; }
      if (a === 'f') d.adaylar.set(k, c);
      const o = es.geri(r);
      if (o === null) { d.kirli.add(k); return; } // eklenen satir
      if (snap.get(konum(o, col)) !== a) d.kirli.add(k);
    }));
    // Fotografta dolu olup simdi BOS kalan hucreler (degeri silindi)
    for (const [k0, a0] of snap) {
      const [r0, c0] = k0.split(':').map(Number);
      const r = es.ileri(r0);
      const c = ws.findCell(r, c0);
      if (a0 !== '' && (!c || degerAnahtari(c) === '')) d.kirli.add(konum(r, c0));
    }
    // Cok hucreli DIZI formulunun cikti hucreleri (ExcelJS'te duz deger): ana
    // formul etkilenirse bunlar da bayattir — degerleri okunmaz, yazimda silinir.
    for (const [k, c] of d.adaylar) {
      const v = formulDegeri(c);
      const a = v.shareType === 'array' && typeof v.ref === 'string' ? adresCoz(v.ref) : null;
      if (!a) continue;
      for (let r = a.r1; r <= a.r2; r++) {
        for (let col = a.c1; col <= a.c2; col++) if (konum(r, col) !== k) d.diziCiktisi.set(konum(r, col), k);
      }
    }
  }

  const sayfa = (ad: string | null, varsayilan: string) => durumlar.get(ad === null ? varsayilan : buyuk(ad));
  const kapsar = (b: Basvuru, r: number, c: number) => r >= b.r1 && r <= b.r2 && c >= b.c1 && c <= b.c2;
  const parca = (k: string) => k.split(':').map(Number) as [number, number];

  /** Formul metni: paylasimli bagimli ananin metninden (tirnak bilen ceviri). */
  const metin = (d: SayfaDurumu, c: ExcelJS.Cell): string | null => {
    const v = formulDegeri(c);
    if (v.shareType === 'array') return null;
    if (typeof v.formula === 'string') return v.formula;
    if (typeof v.sharedFormula === 'string') {
      const a = adresCoz(v.sharedFormula);
      const ana = a ? d.ws.findCell(a.r1, a.c1) : undefined;
      const af = ana ? formulDegeri(ana).formula : undefined;
      return a && typeof af === 'string' ? formulKaydir(af, Number(c.row) - a.r1, Number(c.col) - a.c1) : null;
    }
    return null;
  };

  // ── 2. Etkilenme (zincirle; dongu temkinle "etkilendi") ──────────────
  const etki = new Map<SayfaDurumu, Map<string, boolean | 'bakiliyor'>>();
  const adayEtkilendi = (d: SayfaDurumu, k: string): boolean => {
    if (!etki.has(d)) etki.set(d, new Map());
    const m = etki.get(d)!;
    const onceki = m.get(k);
    if (onceki === 'bakiliyor') return true;
    if (onceki !== undefined) return onceki;
    m.set(k, 'bakiliyor');
    const sonuc = ((): boolean => {
      if (d.kirli.has(k)) return true;
      const c = d.adaylar.get(k)!;
      const v = formulDegeri(c);
      // Dizi formulu ve okunamayan paylasimli bagimli: onculleri ayrica okunur
      const f = v.shareType === 'array' && typeof v.formula === 'string' ? v.formula : metin(d, c);
      if (f === null) return true;
      const o = onculler(f);
      if (o.cozulmez) return true;
      return o.basvurular.some((b) => basvuruEtkilendi(b, d.ws.name));
    })();
    m.set(k, sonuc);
    return sonuc;
  };
  const basvuruEtkilendi = (b: Basvuru, formulSayfasi: string): boolean => {
    const d = sayfa(b.sayfa, buyuk(formulSayfasi));
    if (!d || d.yeni) return true; // silinmis (liste yuvasi) ya da yeni sayfa
    if (d.eklenen.some(([a, z]) => a <= b.r2 && z >= b.r1)) return true;
    for (const k of d.kirli) { const [r, c] = parca(k); if (kapsar(b, r, c)) return true; }
    for (const k of d.adaylar.keys()) { const [r, c] = parca(k); if (kapsar(b, r, c) && adayEtkilendi(d, k)) return true; }
    for (const [k, ana] of d.diziCiktisi) { const [r, c] = parca(k); if (kapsar(b, r, c) && adayEtkilendi(d, ana)) return true; }
    return false;
  };

  // ── 3. Deger: etkilenmeyen formul onbellegi, etkilenen yeniden hesaplanir ──
  const onbellek = (c: ExcelJS.Cell): Deger => {
    const r = formulDegeri(c).result;
    if (typeof r === 'number') { if (!Number.isFinite(r)) throw new Desteklenmez('onbellek'); return r; }
    if (typeof r === 'string' || typeof r === 'boolean') return r;
    throw new Desteklenmez('onbellek yok ya da hata/tarih');
  };
  const hesap = new Map<ExcelJS.Cell, Deger | Desteklenmez | 'hesaplaniyor'>();
  const adayDegeri = (d: SayfaDurumu, k: string): Deger => {
    const c = d.adaylar.get(k)!;
    if (!adayEtkilendi(d, k)) return onbellek(c);
    const onceki = hesap.get(c);
    if (onceki === 'hesaplaniyor') throw new Desteklenmez('dongusel basvuru');
    if (onceki instanceof Desteklenmez) throw onceki;
    if (onceki !== undefined) return onceki;
    hesap.set(c, 'hesaplaniyor');
    try {
      const f = metin(d, c);
      if (f === null) throw new Desteklenmez('dizi formulu / okunamayan paylasimli');
      const v = darHesapla(f, ortam(d));
      hesap.set(c, v);
      return v;
    } catch (e) {
      if (!(e instanceof Desteklenmez)) throw e;
      hesap.set(c, e);
      throw e;
    }
  };
  const hucreDegeri = (d: SayfaDurumu, r: number, col: number): Deger => {
    const k = konum(r, col);
    if (d.adaylar.has(k)) return adayDegeri(d, k);
    const dizi = d.diziCiktisi.get(k);
    if (dizi !== undefined && adayEtkilendi(d, dizi)) throw new Desteklenmez('bayat dizi ciktisi');
    const c = d.ws.findCell(r, col);
    if (!c) return null;
    const v: any = c.value;
    switch (c.type) {
      case T.Null: case T.Merge: return null; // birlesik hucrenin kolesi Excel'de BOS
      case T.Number: return Number.isFinite(v) ? v : (() => { throw new Desteklenmez('sayi'); })();
      case T.String: return v;
      case T.RichText: return (v?.richText ?? []).map((p: any) => p.text ?? '').join('');
      case T.Boolean: return v;
      case T.Formula: return onbellek(c); // bizim formulumuz: onbellegi dogru
      default: throw new Desteklenmez('tarih/hata/baglanti hucresi');
    }
  };
  const ortam = (d: SayfaDurumu) => ({
    hucre: (s: string | null, r: number, c: number): Deger => {
      const h = sayfa(s, buyuk(d.ws.name));
      if (!h) throw new Desteklenmez('silinmis sayfa');
      return hucreDegeri(h, r, c);
    },
    aralik: (s: string | null, r1: number, c1: number, r2: number, c2: number): Deger[] => {
      const h = sayfa(s, buyuk(d.ws.name));
      if (!h) throw new Desteklenmez('silinmis sayfa');
      if ((r2 - r1 + 1) * (c2 - c1 + 1) > 2_000_000) throw new Desteklenmez('cok buyuk aralik');
      const out: Deger[] = [];
      for (let r = r1; r <= r2; r++) {
        if (!h.ws.findRow(r)) continue;
        for (let c = c1; c <= c2; c++) { const v = hucreDegeri(h, r, c); if (v !== null) out.push(v); }
      }
      return out;
    },
  });

  // ── 4. Yaz: once hepsi hesaplanir, sonra yazilir ─────────────────────
  const yazilacak: Array<{ c: ExcelJS.Cell; sonuc: Deger | undefined }> = [];
  const silinecek: ExcelJS.Cell[] = [];
  let etkilenen = 0; let hesaplanan = 0; let bosaltilan = 0;
  for (const d of durumlar.values()) {
    if (d.yeni) continue;
    for (const [k, ana] of d.diziCiktisi) {
      const [r, col] = parca(k);
      const c = d.ws.findCell(r, col);
      if (c && c.type !== T.Formula && c.type !== T.Null && adayEtkilendi(d, ana)) silinecek.push(c);
    }
    for (const [k, c] of d.adaylar) {
      if (!adayEtkilendi(d, k)) continue;
      etkilenen++;
      const eski = formulDegeri(c).result;
      let sonuc: Deger | undefined;
      try { sonuc = adayDegeri(d, k); } catch (e) { if (!(e instanceof Desteklenmez)) throw e; sonuc = undefined; }
      if (sonuc === undefined) {
        bosaltilan++;
        if (eski !== undefined) yazilacak.push({ c, sonuc });
      } else if (!ayni(eski, sonuc)) {
        hesaplanan++;
        yazilacak.push({ c, sonuc });
      }
    }
  }
  for (const y of yazilacak) {
    const v = formulDegeri(y.c);
    delete v.result;
    y.c.value = (y.sonuc === undefined ? v : { ...v, result: y.sonuc }) as any;
  }
  for (const c of silinecek) c.value = null;
  if (bosaltilan > 0) (wb as any).calcProperties = { ...(wb as any).calcProperties, fullCalcOnLoad: true };
  return { etkilenen, hesaplanan, bosaltilan };
}

/** Onbellek ayni mi (sayida son bit gurultusu yazdirmaz — bayt korunur). */
function ayni(eski: unknown, yeni: Deger): boolean {
  if (typeof eski === 'number' && typeof yeni === 'number') {
    return eski === yeni || Math.abs(eski - yeni) <= 1e-12 * Math.max(1, Math.abs(eski), Math.abs(yeni));
  }
  return eski === yeni;
}
