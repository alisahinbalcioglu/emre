/**
 * DRAFT RESTORE SONRASI OTOMATIK YENIDEN ESLESTIRME — malzeme + ISCILIK (ikiz).
 *
 * NEDEN AYRI MODUL: Bu blok quotes/new restore efektinin icinde elle
 * yazilmisken ISCILIK tarafi UNUTULMUSTU — _marka atanmis satirlar sayfa
 * yenilenince yeniden eslesirken _firma atanmis satirlarin iscilik fiyati
 * sessizce bos kaliyordu (ikizi unutma; dwg-teklif-sema ile ayni hata sinifi,
 * ayni cozum: iki taraf TEK MEKANIZMADAN gecer, testle muhurlu —
 * restore-rematch.test.ts).
 *
 * ── SORGU ADI: CAPSIZ nameField (CANLI ETKILESIMLI YOLLA BIREBIR) ──────────
 * ⚠ Bu modulun ilk hali sorguyu joinMaterialText(cap, cins) ile kuruyor ve
 * yorumunda "interaktif akisla ayni" DIYORDU. OLCULDU, YANLISMIS: etkilesimli
 * yol sorguyu `ctxDetail.name || currentName` ile kurar (ExcelGrid.tsx:358) ve
 * `buildMaterialContextDetailed` (ExcelGrid.tsx:1234) imzasinda diameterField
 * YOKTUR — ad hucresi doluyken `name` HER daldan dolu doner, dolayisiyla capli
 * `currentName` dali DWG satirlarinda PRATIKTE OLUDUR. Yani canli etkilesimli
 * yol "PVC BORU" sorar, capli hali degil.
 *
 * Capli sorgu masum bir fark degil: cap dolu olunca motorda sert cap filtresi
 * kosar, 'belirsiz' cevap TEK adaya duser ve restore, kullanicinin popup'ta
 * ONAYLAMADIGI varyantin fiyatini sessizce yazardi. Ayni satirda etkilesimli
 * yol SORU sorarken restore KARAR verirdi. Sozlesme tersidir (asagi bkz).
 * Bu yuzden ad, eski satir ici blokla ve canli etkilesimli yolla ayni
 * kalir: yalniz nameField.
 *
 * (Etkilesimli yolun kendi ic tutarsizligi — belgelenen niyet "Çap + Cins"
 * iken ctxDetail.name'in onu golgelemesi — AYRI bir istir; burada taklit
 * edilen sey NIYET degil OLCULEN CANLI DAVRANIStir.)
 *
 * SESSIZ SECIM YOK: yalniz `netPrice > 0` iken yazilir. Motor 'belirsiz'/'yok'
 * dallarinda netPrice HER ZAMAN 0 doner (outcome-mapper.ts:9 ve :152) —
 * restore kullanici adina varyant secemez. Ayrica motorun ONCEDEN cevapladigi
 * satirlar (_matStatus/_labStatus = belirsiz|yok|urun_degil) HIC sorulmaz:
 * cevap zaten bellidir, tekrar sormak ayni 0'i geri getirir ve her sayfa
 * yenilemesinde bosa istek uretirdi.
 *
 * FIYAT YAZILDIYSA BEKLEME ISARETI KALKAR: fiyat yazan diger uc yol da bunu
 * uygular (ExcelGrid.tsx:322 ve :2631, fill-down.ts:271). Isaret temizlenmezse
 * hucre fiyati gosterirken arka plani kirmizi kalir ve ust sayac satiri hala
 * "secim bekliyor" sayar.
 *
 * GENEL TOPLAM DA TAZELENIR: satir nesnesine dogrudan yazildigi icin AG-Grid
 * olayi (dolayisiyla ExcelGrid'in recalcGrand'i) atesmez. Tazelenmezse
 * "Malz. Toplam + Isc. Toplam ≠ Toplam" celiskisi satirda kalir ve draft'a
 * kaydedilip teklif detayinda da oyle gorunur — fill-down.ts:103'te ayni
 * gerekceyle kapatilan kusurun ta kendisi. Kural TEK: iki taraf da ROLLERDEN
 * okunur, dal bilgisinden DEGIL.
 *
 * ⚠ KAR OKUMASI `sayiAlani`DAN GECER (ozellik/fiyat/sayi-alani), ham
 * `parseFloat(...) || 0` ile DEGIL — hucrede "12,5" yazan kullanicinin ekranda
 * gordugu kar ile restore'un yazdigi fiyat ayrismasin. Bu dosya
 * `kar-tek-suzgec.test.ts` KAPSAM listesindedir.
 *
 * NOT: satir nesneleri YERINDE guncellenir (ExcelGrid yazim yollari da
 * node.data'yi dogrudan yazar) — cagiran taraf degisiklik varsa state'i
 * yeniden spread eder.
 */
import type { ColumnRoles, ExcelRowData } from '../tablo/excel-grid/types';
import {
  hesaplaSatisBirimFiyat,
  hesaplaSatirToplam,
  etkinMiktar,
  yukariYuvarla,
} from '../fiyat/pricing';
import { sayiAlani } from '../fiyat/sayi-alani';

/** Draft'taki sheet'in bu modulun ihtiyac duydugu kesiti (SheetData uyumlu). */
export interface RematchSheet {
  index: number;
  isEmpty?: boolean;
  rowData?: ExcelRowData[];
  columnRoles?: ColumnRoles;
}

/** HTTP katmani dependency injection ile gelir — modul saf kalir, test sahte
 *  poster verir. Donen deger bulk-match cevabinin `data`'sidir (ad → match). */
export type RematchPoster = (
  url: string,
  body: Record<string, unknown>,
) => Promise<Record<string, any>>;

/** Iki ikiz taraf tek tanimdan kosulur — pricing.ts `taraf(...)` deseniyle
 *  ayni gerekce: taraflardan biri silinirse/saparsa test kirmiziya doner. */
interface Taraf {
  atamaAlani: '_marka' | '_firma';
  karAlani: '_malzKar' | '_iscKar';
  netAlani: '_matNetPrice' | '_labNetPrice';
  kurAlani: '_matKurBilgi' | '_labKurBilgi';
  durumAlani: '_matStatus' | '_labStatus';
  birimRolu: 'materialUnitPriceField' | 'laborUnitPriceField';
  toplamRolu: 'materialTotalField' | 'laborTotalField';
  url: '/matching/bulk-match' | '/labor-matching/bulk-match';
  idAnahtari: 'brandId' | 'firmaId';
  adAnahtari: 'materialNames' | 'laborNames';
}

const TARAFLAR: readonly Taraf[] = [
  {
    atamaAlani: '_marka', karAlani: '_malzKar',
    netAlani: '_matNetPrice', kurAlani: '_matKurBilgi', durumAlani: '_matStatus',
    birimRolu: 'materialUnitPriceField', toplamRolu: 'materialTotalField',
    url: '/matching/bulk-match', idAnahtari: 'brandId', adAnahtari: 'materialNames',
  },
  {
    atamaAlani: '_firma', karAlani: '_iscKar',
    netAlani: '_labNetPrice', kurAlani: '_labKurBilgi', durumAlani: '_labStatus',
    birimRolu: 'laborUnitPriceField', toplamRolu: 'laborTotalField',
    url: '/labor-matching/bulk-match', idAnahtari: 'firmaId', adAnahtari: 'laborNames',
  },
];

/** Motorun ZATEN cevapladigi ve kullanici karari bekleyen durumlar. Bu
 *  satirlarda fiyatin bos olmasi KUSUR DEGIL, tasarimdir — restore sormaz. */
const CEVAPLANMIS = new Set(['belirsiz', 'yok', 'urun_degil']);

/** Restore yalniz KAYIP fiyati tamamlar — dolu hucre kullanici emegidir. */
function fiyatKayip(mevcut: string): boolean {
  return !mevcut || mevcut === '0' || mevcut === '0.00';
}

/** Tek satirin tek tarafini (malzeme VEYA iscilik) yeniden eslestirir.
 *  Yazim olduysa 1, her turlu atlama/hata durumunda 0 doner. */
async function tarafEslestir(
  row: ExcelRowData,
  roles: ColumnRoles,
  taraf: Taraf,
  poster: RematchPoster,
): Promise<0 | 1> {
  const atanan = row[taraf.atamaAlani];
  const birimAlan = roles[taraf.birimRolu];
  if (!atanan || !birimAlan) return 0;
  if (!fiyatKayip(String(row[birimAlan] ?? '').trim())) return 0;
  // Motor bu satiri zaten cevapladi (aday secimi/eslesme yok) — tekrar sormak
  // ayni 0'i getirir; yalniz bosa istek olur.
  if (CEVAPLANMIS.has(String(row[taraf.durumAlani] ?? ''))) return 0;

  // ⚠ CAPSIZ: canli etkilesimli yolun sordugu adin AYNISI (bkz. dosya basligi).
  const ad = roles.nameField ? String(row[roles.nameField] ?? '').trim() : '';
  if (!ad) return 0;

  try {
    const govde: Record<string, unknown> = {
      [taraf.idAnahtari]: atanan,
      [taraf.adAnahtari]: [ad],
    };
    const birim = roles.unitField ? String(row[roles.unitField] ?? '').trim() : '';
    if (birim) govde.units = { [ad]: birim };

    const sonuc = await poster(taraf.url, govde);
    const match = sonuc?.[ad];
    if (!match || !(match.netPrice > 0)) return 0;

    // ⚠ TEK SUZGEC: ham parseFloat kullanilirsa "12,5" → 12 olur ve ekranda
    // gorunen kar ile restore'un yazdigi fiyat ayrisir (kar-tek-suzgec kapisi).
    const kar = sayiAlani(row[taraf.karAlani]);
    const satis = hesaplaSatisBirimFiyat(match.netPrice, kar);
    row[birimAlan] = satis.toFixed(1);
    // UY2 — ExcelGrid yazim yollari ile AYNI kural: MIKTAR/BIRIM basliklari
    // ters persist edilmis satirlarda gercek sayi birim hucresindedir.
    const miktar = etkinMiktar(row, roles.quantityField, roles.unitField);
    const toplamAlan = roles[taraf.toplamRolu];
    if (toplamAlan) row[toplamAlan] = hesaplaSatirToplam(satis, miktar).toFixed(1);
    row[taraf.netAlani] = match.netPrice;
    row[taraf.kurAlani] = match.kaynakKur ?? null; // kur donmasi
    row[taraf.durumAlani] = ''; // fiyat geldi — bekleme isareti kalkar
    return 1;
  } catch {
    // Restore arka plan isidir: tek satirin sunucu hatasi digerlerini
    // durdurmaz. Fiyat bos kalir — hucre gorunur, interaktif yol acik.
    return 0;
  }
}

/**
 * SATIRIN GENEL TOPLAMI = Malz. Toplam + Isc. Toplam.
 *
 * fill-down.ts:103 ve ExcelGrid'in recalcGrand'i ile AYNI kural; yuvarlama
 * `yukariYuvarla` (pricing.ts) — para yuvarlamasi tek kaynaktan.
 * ⚠ IKI TARAF DA ROLLERDEN okunur: hangi dalin yazdigi bilgisi buraya
 * SIZMAZ (sizersa "Toplam = 2 × iscilik" kusuru geri gelir).
 */
function genelToplamiTazele(row: ExcelRowData, roles: ColumnRoles): void {
  const genelAlan = roles.grandTotalField;
  if (!genelAlan) return;
  const oku = (alan?: string) => {
    if (!alan) return 0;
    const v = parseFloat(String(row[alan] ?? '').replace(',', '.'));
    return Number.isFinite(v) ? v : 0;
  };
  const mat = oku(roles.materialTotalField);
  const lab = oku(roles.laborTotalField);
  row[genelAlan] = yukariYuvarla(mat + lab).toFixed(1);
}

/**
 * SessionStorage draft'i geri yuklendikten sonra marka/firma atanmis ama
 * fiyati kayip satirlari yeniden eslestirir. Yazilan satir sayisini doner;
 * cagiran taraf > 0 ise state'i yeniden spread edip grid'i tazeler.
 */
export async function restoreRematch(
  sheets: RematchSheet[],
  live: Record<number, ExcelRowData[]>,
  poster: RematchPoster,
): Promise<number> {
  let yazilan = 0;
  for (const sheet of sheets) {
    if (sheet.isEmpty) continue;
    const rows = live[sheet.index] ?? sheet.rowData ?? [];
    const roles = sheet.columnRoles ?? {};
    if (!roles.nameField) continue;
    for (const row of rows) {
      if (!row?._isDataRow) continue;
      let satirdaYazim = 0;
      for (const taraf of TARAFLAR) {
        satirdaYazim += await tarafEslestir(row, roles, taraf, poster);
      }
      // Genel toplam SATIR BAZINDA, iki taraf da islendikten SONRA tazelenir —
      // aksi halde ilk tarafin yazimindan sonra ikinci taraf hentiz yazilmamis
      // olur ve genel toplam eksik kalirdi.
      if (satirdaYazim > 0) genelToplamiTazele(row, roles);
      yazilan += satirdaYazim;
    }
  }
  return yazilan;
}
