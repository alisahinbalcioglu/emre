/**
 * Backend port of frontend's build-material-context.ts
 * Used in save-from-sheets endpoints to reconstruct full material names
 * from grid rows (parent group header + current row name).
 *
 * Kept in sync with frontend/ozellik/tablo/excel-grid/build-material-context.ts
 */

export interface ColumnRoles {
  noField?: string;
  nameField?: string;
  brandField?: string;
  quantityField?: string;
  unitField?: string;
  materialUnitPriceField?: string;
  materialTotalField?: string;
  laborUnitPriceField?: string;
  laborTotalField?: string;
  grandUnitPriceField?: string;
  grandTotalField?: string;
}

export interface RowData {
  [key: string]: any;
  _rowIdx?: number;
  _isDataRow?: boolean;
  _isHeaderRow?: boolean;
}

const INCH_TO_DN: Record<string, string> = {
  '1/2': 'dn15', '3/4': 'dn20', '1': 'dn25', '1 1/4': 'dn32',
  '1 1/2': 'dn40', '2': 'dn50', '2 1/2': 'dn65', '3': 'dn80',
  '4': 'dn100', '5': 'dn125', '6': 'dn150', '8': 'dn200',
};

/**
 * BASLIK BAGLAMI CAP OKUYUCUSU — ON YUZ ↔ ARKA UC IKIZ KURALI (P2-ek, 05.10).
 *
 * Bu fonksiyon motorun cap yolu DEGILDIR (o conversion.extractSizeInfo); yalniz
 * baslik birlestirmenin cap korumasi icin "bu metnin ASIL olcusu ne?" sorusunu
 * cevaplar. On yuzdeki canli kopya (ExcelGrid.tsx) AYNI kurali tasimak zorunda —
 * ikiz kapisi iki fonksiyonu gercek kesif kulliyatinda birebir karsilastirir.
 * Ice aktarim YOK ki on yuze satir satir kopyalanabilsin.
 *
 * KURAL (sirayla; olculdu: 21 gercek dosya, 3.850 tekil ad, eski iki taraf 169
 * adda ayrisiyordu):
 *  1. Hazirlik: kucuk harf · tipografik tirnak → ASCII · '' → " · BITISIK
 *     unicode kesir onceki rakamla BILESIKTIR ("1¼" → "1 1/4"; eskiden arka uc
 *     "11/4" yapip hic okumuyordu) · kesirdeki bosluk birlesir ("1 / 2" → "1/2").
 *  2. Acik etiket ("Çap:" / "Çapı :") — ILK etiketin KENDI bolgesindeki (sonraki
 *     etikete dek) ILK olcu; okunamazsa siradaki etiket. Sartname metninde sonraki
 *     etiketler alt parcayi anlatir: "Baskın Vana … Çapı : DN100 … Elle Tahrik
 *     Ünitesi : Çapı : ½”" → dn100, "Giriş Çapı : DN100 / Çıkış Çapı : 2 x DN 65"
 *     → dn100 (P3 kulliyati, 3.142 ad: SON etiket 3 vanada dn15 okuyordu).
 *     ("Boru DN25 (1”) … ancak Çap: DN50" → dn50)
 *  3. Parantez ici IKINCILDIR — disarida olcu varsa yalniz disari okunur.
 *     ("DN150 Kollektör (2xDN100+…+1xDN15)" → dn150; eskiden arka uc dn15)
 *  4. DN incten once; hem DN'de hem incte ILK olcu — redüksiyon / branşman
 *     kelepçesi / inegal te / itfaiye ağzında ilk olcu ASIL hat capidir
 *     ("DN150 x DN50", "4''x3'' Redüksiyon"). Eskiden arka uc SON DN'i, on yuz
 *     ILK DN'i aliyordu; incte ikisi de SONU. "1xDN65" bitisik yazim gecerli.
 *  5. Inc isareti: " her zaman; tek kesme ya da ` YALNIZ arkasinda harf yokken —
 *     "Tehlike sınıfı 1'e uygun", "EN 671-1’e" Turkce ektir, olcu degil
 *     (eskiden arka uc dn25). Sol sinir: rakam, "/" ve NOKTALI ondalik ("1.8\"")
 *     icinden olcu okunmaz (eskiden "1/4\"" → 4", "1.8\"" → 8"). Virgul ondalik
 *     SAYILMAZ, liste ayiracidir: "TS EN 671-1,1\" hortum" → dn25 (olculdu: iki
 *     kulliyatta virgullu ondalik inc 0 ad). Bilinen sinir: "1,5\"" 5" okunur —
 *     eski iki tarafla ayni.
 */
const INC_ISARETI = String.raw`(?:"|['\x60](?![a-zçğıöşü]))`;
const BILESIK_RE = new RegExp(String.raw`(?<![\d/])(\d+)\s+(\d+)\/(\d+)(?:${INC_ISARETI})?`, 'g');
const KESIR_RE = new RegExp(String.raw`(?<![\d/])(\d+)\/(\d+)(?:${INC_ISARETI})?`, 'g');
const TAM_RE = new RegExp(String.raw`(?<![\d/])(?<!\d\.)(\d+)${INC_ISARETI}`, 'g');

function capHazirla(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019\u02BC\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/'{2}/g, '"')
    .replace(/(\d)\s*\u00BD/g, '$1 1/2').replace(/(\d)\s*\u00BC/g, '$1 1/4').replace(/(\d)\s*\u00BE/g, '$1 3/4')
    .replace(/\u00BD/g, '1/2').replace(/\u00BC/g, '1/4').replace(/\u00BE/g, '3/4')
    .replace(/(\d)\s*\/\s*(\d)/g, '$1/$2');
}

function ilkCap(n: string): string | null {
  const dn = n.match(/(?:(?<![a-z])|(?<=\dx))dn\s*(\d+)/);
  if (dn) return `dn${dn[1]}`;
  const bulunan: { deger: string; bas: number; son: number }[] = [];
  const cakisir = (i: number) => bulunan.some((x) => x.bas <= i && i < x.son);
  let m: RegExpExecArray | null;
  BILESIK_RE.lastIndex = 0;
  while ((m = BILESIK_RE.exec(n)) !== null) bulunan.push({ deger: `${m[1]} ${m[2]}/${m[3]}`, bas: m.index, son: m.index + m[0].length });
  KESIR_RE.lastIndex = 0;
  while ((m = KESIR_RE.exec(n)) !== null) if (!cakisir(m.index)) bulunan.push({ deger: `${m[1]}/${m[2]}`, bas: m.index, son: m.index + m[0].length });
  TAM_RE.lastIndex = 0;
  while ((m = TAM_RE.exec(n)) !== null) if (!cakisir(m.index)) bulunan.push({ deger: m[1], bas: m.index, son: m.index + m[0].length });
  if (bulunan.length === 0) return null;
  bulunan.sort((a, b) => a.bas - b.bas);
  return INCH_TO_DN[bulunan[0].deger] ?? null;
}

export function extractCapFromText(text: string): string | null {
  if (!text) return null;
  const n = capHazirla(text);
  const etiketler = Array.from(n.matchAll(/(?:^|[^a-zçğıöşü])[cç]ap[ıi]?\s*[:=]\s*/g));
  for (let i = 0; i < etiketler.length; i++) {
    const bas = (etiketler[i].index ?? 0) + etiketler[i][0].length;
    const son = i + 1 < etiketler.length ? (etiketler[i + 1].index ?? n.length) : n.length;
    const etiketli = ilkCap(n.slice(bas, son));
    if (etiketli) return etiketli;
  }
  return ilkCap(n.replace(/\([^)]*\)/g, ' ')) ?? ilkCap(n);
}

/**
 * Bir rowData dizisinden, verilen satirin tam malzeme adini uretir.
 * Ust satirlardaki grup basligi (ornek: "GALVANIZ BORU") bulunur ve
 * mevcut satir adi ("1 1/4\"") ile birlestirilir → "GALVANIZ BORU 1 1/4\""
 *
 * Cap sanity check: parent'in cap'i current'un cap'inden farkliysa,
 * guvenli yol olarak sadece currentName donulur (felaket koruma).
 */
export function buildMaterialContextFromRows(
  rows: RowData[],
  rowIdx: number,
  roles: ColumnRoles,
): string {
  const nameField = roles.nameField;
  const noField = roles.noField;
  const brandField = roles.brandField;
  if (!nameField) return '';

  const current = rows[rowIdx];
  if (!current) return '';
  const currentName = String(current[nameField] ?? '').trim();
  if (!currentName) return '';
  if (!noField) return currentName;

  let foundParent: string | null = null;
  for (let i = rowIdx - 1; i >= 0; i--) {
    const prev = rows[i];
    if (!prev) continue;
    if (prev._isDataRow) continue;

    const prevNo = String(prev[noField] ?? '').trim();
    const prevName = String(prev[nameField] ?? '').trim();
    const prevBrand = brandField ? String(prev[brandField] ?? '').trim() : '';
    if (prevBrand.length > 0) continue;
    if (prevNo.length > 0 && prevName.length > 2) {
      foundParent = prevName;
      break;
    }
  }

  if (!foundParent) return currentName;

  const fullName = `${foundParent} ${currentName}`;
  const currentCap = extractCapFromText(currentName);
  const fullCap = extractCapFromText(fullName);
  const parentCap = extractCapFromText(foundParent);

  if (parentCap && currentCap && parentCap !== currentCap) {
    return currentName;
  }
  if (currentCap && fullCap && currentCap !== fullCap) {
    return currentName;
  }
  return fullName;
}
