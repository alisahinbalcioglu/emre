/**
 * TEKLIF METNI CEVIRISI — TOPLAMA, DOKUNULMAZLAR, UYGULAMA (13.08).
 *
 * ── NEDEN BU MODUL SAF ──────────────────────────────────────────────────────
 * Ceviri akisinin PARA veya OLCU bozma riski tasiyan kismi burasi: hangi
 * hucrenin motora gidecegi ve hangisine ASLA dokunulmayacagi. Backend'de
 * vitest yok (yalniz ts-node script'leri), bu yuzden karar mantigi frontend'de
 * saf bir modulde durur ve birim testle muhurlenir; backend yalnizca
 * "benzersiz metinler → ceviri haritasi" isini yapar.
 *
 * ── OLCEK: NEDEN BENZERSIZLESTIRME ZORUNLU ─────────────────────────────────
 * Gercek teklifler 15.000+ satir olabiliyor (canli ornek: 15.137). Satir
 * basina bir istek hem ekonomik olarak imkansiz hem de gereksiz: malzeme
 * adlari masif tekrar ediyor ("DN 20" her baslik altinda yeniden). Benzersiz
 * kume birkac yuze iner; ustelik kalici onbellekle ikinci teklifte sifira
 * yaklasir.
 *
 * ── DOKUNULMAZLAR: BU MODULUN ASIL GOREVI ──────────────────────────────────
 * Motor "yardimci olup" olcuyu bozabilir: "DN 20" → "DN 20 (nominal
 * diameter)", "6\"" → "6 inches", "Ø110" → "110mm dia". Bunlarin HEPSI
 * eslestirme anahtaridir ve bozulursa fiyat eslesmesi ve musteriye giden
 * teklif birlikte bozulur. Bu yuzden "cevrilecekler" degil, DOKUNULMAZLAR
 * acik kural olarak tanimlidir ve testle muhurlenir.
 */
import type { ColumnRoles, ExcelRowData } from '../tablo/excel-grid/types';

/** Hedef dil — su an yalniz Ingilizce (kullanici karari, 13.08). */
export type HedefDil = 'en';

/** Kaynak metin → ceviri. Backend'den bu sekilde doner. */
export type CeviriHaritasi = Record<string, string>;

/**
 * Metinden OLCU SOZ DAGARINI soyar. Geriye anlamli harf kalmiyorsa metin
 * bir olcu/koddur, cumle degildir.
 *
 * ⚠ SINIR (`\b`) TEK BASINA YETMEZ — testle olculdu: "DN20" ve "9MM" gibi
 * BOSLUKSUZ hallerde harf ile rakam arasinda kelime siniri OLUSMAZ (`n` ve `2`
 * ikisi de kelime karakteri), bu yuzden `\bdn\b` "DN20"yi goremez ve olcu
 * ceviriye SIZAR. Desenler bu yuzden rakam-farkindali (`(?=\s*\d)` /
 * `(?<=\d)`) yazili.
 *
 * ⚠ Ø ve φ acikca listeli: `extractCapFromText` (ExcelGrid) Ø-kordur ve yalniz
 * DN/inc tanir — o kusuru buraya tasimiyoruz.
 */
function olcuyuSoy(ham: string): string {
  return ham
    .replace(/\bdn\b|dn(?=\s*\d)/gi, ' ')        // "DN 20" ve "DN20"
    .replace(/\bpn\b|pn(?=\s*\d)/gi, ' ')        // "PN 20" — basinc sinifi
    .replace(/\bnb\b|nb(?=\s*\d)/gi, ' ')        // "NB 50"
    .replace(/(?<=\d)\s*(?:mm|cm|mt)\b/gi, ' ')  // "9MM", "110 mm"
    .replace(/\b(?:mm|cm|mt|m)\b/gi, ' ')        // bagimsiz birim ("m³" dahil)
    .replace(/(?<=\d)\s*[x×]\s*(?=\d)/gi, ' ')   // "2x9" — carpim isareti
    .replace(/[øφ"'/½¼¾⅜⅝⅞]/gi, ' ')             // cap ve kesir isaretleri
    .replace(/[\d.,\-–—]/g, ' ');                // sayilar ve ayraclar
}

/**
 * Metin cevrilmemeli mi?
 *
 * KURAL: olcu soz dagari ve sayilar cikarildiginda geriye EN AZ IKI harf
 * kalmiyorsa metin bir olcu/kod'dur, cumle degildir.
 *
 * Ornekler (testle muhurlu):
 *   "DN 20"      → dokunulmaz (DN + sayi)
 *   "Ø110"       → dokunulmaz
 *   "6\""        → dokunulmaz
 *   "1 1/4\""    → dokunulmaz
 *   "25"         → dokunulmaz
 *   "9MM"        → dokunulmaz (sayi + birim)
 *   "PVC BORU"   → CEVRILIR
 *   "9MM ALUMINYUM FOLYO" → CEVRILIR (olcu cikinca "ALUMINYUM FOLYO" kalir)
 */
export function dokunulmazMi(metin: unknown): boolean {
  const ham = String(metin ?? '').trim();
  if (!ham) return true; // bos hucre — cevrilecek bir sey yok
  // ⚠ `\p{L}` + `u` bayragi KULLANILMAZ: frontend tsconfig hedefi onu kabul
  // etmiyor (TS1501) ve vitest'te calisip tsc'de patlayan bir kural olurdu.
  // Turkce harfler ACIKCA listeli — Ø/φ zaten olcuyuSoy'da soyuluyor.
  const harfler = olcuyuSoy(ham).replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '');
  return harfler.length < 2;
}

/** Grid hucresinden ceviri anahtarina giden TEK normalizasyon.
 *  Onbellek anahtari da bu — yoksa "PVC BORU" ile "PVC BORU " ayri satir olur. */
export function ceviriAnahtari(metin: unknown): string {
  return String(metin ?? '').trim().replace(/\s+/g, ' ');
}

/** Ceviriye girecek sayfa kesiti (SheetData uyumlu). */
export interface CeviriSayfasi {
  index: number;
  isEmpty?: boolean;
  rowData?: ExcelRowData[];
  columnRoles?: ColumnRoles;
}

/**
 * Sayfalardan CEVRILECEK BENZERSIZ metinleri toplar.
 *
 * Toplanan: yalniz `nameField` (malzeme/is adi) ve grup bandi basliklari —
 * yani insanin okudugu metin. Toplanmayan: cap kolonu (olcu), miktar, birim,
 * fiyat, marka/firma (kimlik), sistem alanlari.
 *
 * ⚠ Grup bantlari da toplanir: fotograftaki "SIHHI TESISAT ISLERI",
 * "TEMIZ SU BORULARI" gibi basliklar musteriye giden teklifte gorunur;
 * yalniz veri satirlarini cevirmek yarim is olurdu.
 */
export function cevrilecekMetinler(
  sayfalar: CeviriSayfasi[],
  live?: Record<number, ExcelRowData[]>,
): string[] {
  const kume = new Set<string>();
  for (const sayfa of sayfalar) {
    if (sayfa.isEmpty) continue;
    const roles = sayfa.columnRoles ?? {};
    const adAlan = roles.nameField;
    if (!adAlan) continue;
    const rows = live?.[sayfa.index] ?? sayfa.rowData ?? [];
    for (const row of rows) {
      if (!row) continue;
      const anahtar = ceviriAnahtari(row[adAlan]);
      if (!anahtar || dokunulmazMi(anahtar)) continue;
      kume.add(anahtar);
    }
  }
  return Array.from(kume);
}

/**
 * Ceviri haritasini satirlara uygular. Yazilan hucre sayisini doner.
 *
 * ⚠ ORIJINAL METIN KORUNUR (`_ceviriKaynak`): dil "Türkçe"ye alindiginda geri
 * donebilmek icin. Ceviriyi tek yon uygulayip orijinali kaybetmek, kullanicinin
 * emegini (elle duzelttigi adlari) geri alinamaz sekilde silerdi.
 *
 * Satirlar YERINDE guncellenir — cagiran taraf degisiklik varsa state'i
 * yeniden spread eder (ExcelGrid yazim yollari da node.data'yi dogrudan yazar).
 */
export function ceviriUygula(
  sayfalar: CeviriSayfasi[],
  harita: CeviriHaritasi,
  live?: Record<number, ExcelRowData[]>,
): number {
  let yazilan = 0;
  for (const sayfa of sayfalar) {
    if (sayfa.isEmpty) continue;
    const roles = sayfa.columnRoles ?? {};
    const adAlan = roles.nameField;
    if (!adAlan) continue;
    const rows = live?.[sayfa.index] ?? sayfa.rowData ?? [];
    for (const row of rows) {
      if (!row) continue;
      const anahtar = ceviriAnahtari(row[adAlan]);
      const ceviri = harita[anahtar];
      if (!ceviri || ceviri === row[adAlan]) continue;
      // Orijinali BIR KEZ sakla — ikinci ceviride ceviriyi orijinal sanmayalim.
      if (row._ceviriKaynak === undefined) row._ceviriKaynak = row[adAlan];
      row[adAlan] = ceviri;
      yazilan++;
    }
  }
  return yazilan;
}

/**
 * Ceviriyi geri alir — `_ceviriKaynak`teki orijinal metni yerine koyar.
 * Dil seciciyi "Türkçe"ye almak bunu cagirir.
 */
export function ceviriGeriAl(
  sayfalar: CeviriSayfasi[],
  live?: Record<number, ExcelRowData[]>,
): number {
  let geri = 0;
  for (const sayfa of sayfalar) {
    if (sayfa.isEmpty) continue;
    const adAlan = sayfa.columnRoles?.nameField;
    if (!adAlan) continue;
    const rows = live?.[sayfa.index] ?? sayfa.rowData ?? [];
    for (const row of rows) {
      if (!row || row._ceviriKaynak === undefined) continue;
      row[adAlan] = row._ceviriKaynak;
      delete row._ceviriKaynak;
      geri++;
    }
  }
  return geri;
}
