/**
 * DRAFT RESTORE YENIDEN ESLESTIRME — MALZEME + ISCILIK IKIZI (11.08).
 *
 * KULLANICI-GORUNUR SEMPTOM: sayfa yenilenince marka atanmis satirlarin
 * malzeme fiyati otomatik geri geliyordu ama _firma atanmis satirlarin
 * ISCILIK fiyati sessizce bos kaliyordu — restore blogu yalniz malzeme
 * tarafini kosuyordu (ikizi unutma dersi; dwg-teklif-sema ile ayni sinif).
 *
 * ★ TEST GERCEKTEN AYIRT EDIYOR MU? — eski davranisin replikasi
 * (`eskiRestoreRematch`, page.tsx:558-589 fix oncesi) ayni kriterlerle
 * olculur ve IHLAL ETTIGI assert edilir.
 *
 * ⚠ BIR ASSERT TEK KRITERE (proje kurali): her kriter kendi it() blogunda.
 * ⚠ DAIRESEL OLCUT YASAK: parasal beklentiler LITERAL yazilir (110.0, 2750.0
 *   ...), modulun cagirdigi helper'la test icinde YENIDEN URETILMEZ.
 * ⚠ SAHTE DEGISMEZ MUHURLEME YASAK — BU DOSYA IKI KEZ DUZELTILDI:
 *   1) Ilk hali "sorgu adi capli = interaktif akisla ayni" diye MUHURLUYORDU;
 *      olculdugunde CANLI yolun CAPSIZ sordugu cikti → kriter capsiza cekildi.
 *   2) Sonra golgelemenin KENDISI kusur cikti (capsiz sorgu sert cap filtresini
 *      devre disi birakip yanlis capin fiyatini yazdirabiliyordu) ve etkilesimli
 *      yol duzeltildi → kriter "<CINS> <CAP>"a cekildi.
 *   Ders: kriter, o an OLCULEN canli davranisi izler; ama once o davranisin
 *   DOGRU olup olmadigi sorulur.
 */
import { describe, it, expect } from 'vitest';
import { restoreRematch, type RematchPoster, type RematchSheet } from './restore-rematch';
import type { ColumnRoles, ExcelRowData } from '../tablo/excel-grid/types';

// ── FIXTURE (DWG teklif semasi rolleri — ozellik/teklif/dwg-teklif-sema ile ayni) ──

const ROLLER: ColumnRoles = {
  nameField: 'Malzeme Cinsi',
  diameterField: 'Çapı',
  quantityField: 'Miktar',
  unitField: 'Birim',
  materialUnitPriceField: 'Birim Fiyat',
  materialTotalField: 'Tutar',
  laborUnitPriceField: '_labBirim',
  laborTotalField: '_labToplam',
  grandTotalField: '_toplam',
};

function satir(patch: Partial<ExcelRowData> = {}): ExcelRowData {
  return {
    _rowIdx: 1, _isDataRow: true, _isHeaderRow: false,
    _malzKar: 10, _iscKar: 20, _marka: null, _firma: null,
    _matNetPrice: 0, _labNetPrice: 0, // DWG_SISTEM_ALANLARI ile ayni taban
    'Malzeme Cinsi': 'PVC BORU', 'Çapı': 'Ø110', 'Birim': 'm', 'Miktar': '25',
    'Birim Fiyat': '', 'Tutar': '', _labBirim: '', _labToplam: '', _toplam: '',
    ...patch,
  };
}

function sayfa(rows: ExcelRowData[], roller: ColumnRoles = ROLLER): RematchSheet {
  return { index: 0, isEmpty: false, rowData: rows, columnRoles: roller };
}

/** Sahte poster — cagrilari kaydeder, url→(ad→match) sozlugunden cevap verir. */
function posterKur(cevaplar: Record<string, Record<string, any>> = {}) {
  const cagrilar: Array<{ url: string; body: Record<string, any> }> = [];
  const poster: RematchPoster = async (url, body) => {
    cagrilar.push({ url, body: body as Record<string, any> });
    return cevaplar[url] ?? {};
  };
  return { poster, cagrilar };
}

/** Sorgu adi: "<CINS> <CAP>" — canli etkilesimli yolun sordugu adin aynisi
 *  (12.08: cap golgelemesi kapatildi, cap ADIN SONUNA eklenir). */
const AD = 'PVC BORU Ø110';
/** Cap DUSMUS hal — golgeleme donemi. Bir daha gonderilmemeli. */
const CAPSIZ_AD = 'PVC BORU';
/** Cap BASA konmus hal — S4 sozluk kapisini (startsWith) kirardi. */
const CAP_BASTA = 'Ø110 PVC BORU';

// ── ESKI DAVRANIS REPLIKASI (page.tsx:558-589, fix oncesi) ──────────────────

/** Restore re-matching YALNIZ malzeme tarafini kosuyordu. */
async function eskiRestoreRematch(
  rows: ExcelRowData[],
  roles: ColumnRoles,
  poster: RematchPoster,
): Promise<number> {
  let reMatched = 0;
  for (const row of rows) {
    if (!row?._isDataRow) continue;
    if (row._marka && roles.materialUnitPriceField) {
      const currentVal = String(row[roles.materialUnitPriceField] ?? '').trim();
      if (!currentVal || currentVal === '0' || currentVal === '0.00') {
        const currentName = String(row[roles.nameField!] ?? '').trim();
        if (currentName) {
          try {
            const result = await poster('/matching/bulk-match', {
              brandId: row._marka,
              materialNames: [currentName],
            });
            if (result[currentName]?.netPrice > 0) reMatched++;
          } catch {}
        }
      }
    }
  }
  return reMatched;
}

// ── A) MALZEME TARAFI ───────────────────────────────────────────────────────

describe('restoreRematch — malzeme tarafi', () => {
  it('marka atanmis + fiyat bos → /matching/bulk-match kosulur, fiyat alanlari yazilir', async () => {
    const row = satir({ _marka: 'marka-1' });
    const { poster, cagrilar } = posterKur({
      '/matching/bulk-match': { [AD]: { netPrice: 100, kaynakKur: 'USD/41,2' } },
    });
    const n = await restoreRematch([sayfa([row])], { 0: [row] }, poster);
    expect(n).toBe(1);
    expect(cagrilar).toHaveLength(1);
    expect(cagrilar[0].url).toBe('/matching/bulk-match');
    expect(cagrilar[0].body.brandId).toBe('marka-1');
    // net 100, kar %10 → satis 110.0; miktar 25 → toplam 2750.0 (LITERAL)
    expect(row['Birim Fiyat']).toBe('110.0');
    expect(row['Tutar']).toBe('2750.0');
    expect(row._matNetPrice).toBe(100);
    expect(row._matKurBilgi).toBe('USD/41,2'); // kur donmasi tasinir
  });

  it('fiyat DOLUYSA istek hic atilmaz (kullanici emegi ezilmez)', async () => {
    const row = satir({ _marka: 'marka-1', 'Birim Fiyat': '123.4' });
    const { poster, cagrilar } = posterKur();
    expect(await restoreRematch([sayfa([row])], { 0: [row] }, poster)).toBe(0);
    expect(cagrilar).toHaveLength(0);
  });

  it("fiyat '0.00' ise yeniden eslestirilir (bos ile ayni muamele)", async () => {
    const row = satir({ _marka: 'marka-1', 'Birim Fiyat': '0.00' });
    const { poster, cagrilar } = posterKur({
      '/matching/bulk-match': { [AD]: { netPrice: 100 } },
    });
    expect(await restoreRematch([sayfa([row])], { 0: [row] }, poster)).toBe(1);
    expect(cagrilar).toHaveLength(1);
  });

  it('netPrice 0 (multi/eslesmedi) → hicbir alan yazilmaz, sessiz secim yok', async () => {
    const row = satir({ _marka: 'marka-1' });
    const { poster } = posterKur({
      '/matching/bulk-match': { [AD]: { netPrice: 0, confidence: 'multi', candidates: [{}] } },
    });
    expect(await restoreRematch([sayfa([row])], { 0: [row] }, poster)).toBe(0);
    expect(row['Birim Fiyat']).toBe('');
    expect(row._matNetPrice).toBe(0);
  });
});

// ── B) ISCILIK TARAFI (IKIZ) ────────────────────────────────────────────────

describe('restoreRematch — iscilik tarafi (ikiz)', () => {
  it('firma atanmis + iscilik fiyati bos → /labor-matching/bulk-match kosulur, iscilik alanlari yazilir', async () => {
    const row = satir({ _firma: 'firma-1' });
    const { poster, cagrilar } = posterKur({
      '/labor-matching/bulk-match': { [AD]: { netPrice: 50 } },
    });
    const n = await restoreRematch([sayfa([row])], { 0: [row] }, poster);
    expect(n).toBe(1);
    expect(cagrilar).toHaveLength(1);
    expect(cagrilar[0].url).toBe('/labor-matching/bulk-match');
    expect(cagrilar[0].body.firmaId).toBe('firma-1');
    expect(cagrilar[0].body.laborNames).toEqual([AD]);
    // net 50, kar %20 → satis 60.0; miktar 25 → toplam 1500.0 (LITERAL)
    expect(row._labBirim).toBe('60.0');
    expect(row._labToplam).toBe('1500.0');
    expect(row._labNetPrice).toBe(50);
    expect(row._labKurBilgi).toBeNull(); // kaynakKur yok → null (kur donmasi kurali)
  });

  it("iscilik kari _iscKar'dan okunur, _malzKar'dan DEGIL", async () => {
    // _malzKar=10 ile karisirsa satis 55.0 olurdu; dogrusu _iscKar=20 → 60.0
    const row = satir({ _firma: 'firma-1' });
    const { poster } = posterKur({
      '/labor-matching/bulk-match': { [AD]: { netPrice: 50 } },
    });
    await restoreRematch([sayfa([row])], { 0: [row] }, poster);
    expect(row._labBirim).toBe('60.0');
    expect(row._labBirim).not.toBe('55.0');
  });

  it('iscilik fiyati DOLUYSA istek atilmaz', async () => {
    const row = satir({ _firma: 'firma-1', _labBirim: '99.9' });
    const { poster, cagrilar } = posterKur();
    expect(await restoreRematch([sayfa([row])], { 0: [row] }, poster)).toBe(0);
    expect(cagrilar).toHaveLength(0);
  });
});

// ── C) SIMETRI MUHRU ────────────────────────────────────────────────────────

describe('restoreRematch — malzeme ↔ iscilik simetrisi', () => {
  it('ayni satirda marka VE firma atanmissa IKI uc da kosulur, iki taraf da yazilir', async () => {
    const row = satir({ _marka: 'marka-1', _firma: 'firma-1' });
    const { poster, cagrilar } = posterKur({
      '/matching/bulk-match': { [AD]: { netPrice: 100 } },
      '/labor-matching/bulk-match': { [AD]: { netPrice: 50 } },
    });
    const n = await restoreRematch([sayfa([row])], { 0: [row] }, poster);
    expect(n).toBe(2);
    expect(cagrilar.map((c) => c.url).sort()).toEqual([
      '/labor-matching/bulk-match',
      '/matching/bulk-match',
    ]);
    expect(row['Birim Fiyat']).toBe('110.0');
    expect(row._labBirim).toBe('60.0');
  });

  it('ESKI DAVRANIS bu kriteri IHLAL EDERDI — iscilik ucu HIC kosulmuyordu', async () => {
    const row = satir({ _marka: 'marka-1', _firma: 'firma-1' });
    const { poster, cagrilar } = posterKur({
      '/matching/bulk-match': { [AD]: { netPrice: 100 } },
    });
    await eskiRestoreRematch([row], ROLLER, poster);
    expect(cagrilar.map((c) => c.url)).not.toContain('/labor-matching/bulk-match');
    expect(row._labBirim).toBe(''); // iscilik fiyati sessizce bos kaliyordu
  });
});

// ── D) SORGU ADI = CANLI ETKILESIMLI YOLUN SORDUGU AD ───────────────────────
//
// 12.08: cap golgelemesi KAPATILDI. buildMaterialContextDetailed artik
// diameterField aliyor ve capi ADIN SONUNA ekliyor (ExcelGrid.tsx `capliAd`).
// Restore de ayni sirayi kurar. Neden sona: S4 sozluk kapisi ad-basina bagli
// (`lookupNameRef.current.startsWith(hdr)`) — cap basa gelirse sessizce oler;
// backend ise konuma toleransli (DN eslesmelerinin SONUNCUSUNU alir).
//
// NEDEN ONEMLI: cap sorguya girmezse motorda sert cap filtresi
// (query-engine.ts `if (line.capInfo)`) HIC kosmaz. Kutuphanede o aileden TEK
// kalem varsa `kind:'single'` doner ve YANLIS CAPIN fiyati sessizce yazilir.

describe('restoreRematch — sorgu adi (canli etkilesimli yolla ayni)', () => {
  it('sorgu adi "<CINS> <CAP>" birlesimidir', async () => {
    const row = satir({ _marka: 'marka-1' });
    const { poster, cagrilar } = posterKur();
    await restoreRematch([sayfa([row])], { 0: [row] }, poster);
    expect(cagrilar[0].body.materialNames).toEqual(['PVC BORU Ø110']);
  });

  it('CAP DUSURULMEZ — capsiz sorgu sert cap filtresini devre disi birakirdi', async () => {
    const row = satir({ _marka: 'marka-1' });
    const { poster, cagrilar } = posterKur();
    await restoreRematch([sayfa([row])], { 0: [row] }, poster);
    expect(cagrilar[0].body.materialNames).not.toEqual([CAPSIZ_AD]);
  });

  it('CAP BASA konmaz — basa konmasi S4 sozluk kapisini (startsWith) kirardi', async () => {
    const row = satir({ _marka: 'marka-1' });
    const { poster, cagrilar } = posterKur();
    await restoreRematch([sayfa([row])], { 0: [row] }, poster);
    expect(cagrilar[0].body.materialNames).not.toEqual([CAP_BASTA]);
  });

  it('ESKI satir ici blok bu kriteri IHLAL EDERDI — capi dusururdu', async () => {
    const yeniRow = satir({ _marka: 'marka-1' });
    const eskiRow = satir({ _marka: 'marka-1' });
    const yeni = posterKur();
    const eski = posterKur();
    await restoreRematch([sayfa([yeniRow])], { 0: [yeniRow] }, yeni.poster);
    await eskiRestoreRematch([eskiRow], ROLLER, eski.poster);
    expect(eski.cagrilar[0].body.materialNames).toEqual([CAPSIZ_AD]); // cap dusmus
    expect(yeni.cagrilar[0].body.materialNames).not.toEqual(eski.cagrilar[0].body.materialNames);
  });

  it('cap kolonu OLMAYAN sayfada ad oldugu gibi kalir (Excel yolu degismedi)', async () => {
    const { diameterField: _cap, ...capsizRoller } = ROLLER;
    const row = satir({ _marka: 'marka-1' });
    const { poster, cagrilar } = posterKur();
    await restoreRematch([sayfa([row], capsizRoller)], { 0: [row] }, poster);
    expect(cagrilar[0].body.materialNames).toEqual(['PVC BORU']);
  });

  it('satirin birimi units sinyali olarak gonderilir (E2/L6 sert filtre)', async () => {
    const row = satir({ _marka: 'marka-1', _firma: 'firma-1' });
    const { poster, cagrilar } = posterKur();
    await restoreRematch([sayfa([row])], { 0: [row] }, poster);
    // ⚠ BOS DIZIDE .every() YALANCI YESIL — payda acikca kilitlenir.
    expect(cagrilar).toHaveLength(2);
    for (const c of cagrilar) expect(c.body.units).toEqual({ [AD]: 'm' });
  });

  it('birim hucresi bossa units hic gonderilmez (backend opsiyonel)', async () => {
    const row = satir({ _marka: 'marka-1', Birim: '' });
    const { poster, cagrilar } = posterKur();
    await restoreRematch([sayfa([row])], { 0: [row] }, poster);
    expect(cagrilar[0].body).not.toHaveProperty('units');
  });
});

// ── E) MOTORUN ZATEN CEVAPLADIGI SATIR SORULMAZ ─────────────────────────────
//
// _matStatus/_labStatus 'belirsiz'|'yok'|'urun_degil' ise fiyatin bos olmasi
// KUSUR DEGIL, tasarimdir (kullanici secmeli). Tekrar sormak ayni 0'i getirir
// ve HER sayfa yenilemesinde bosa istek uretirdi.

describe('restoreRematch — cevaplanmis satir tekrar sorulmaz', () => {
  it("_matStatus 'belirsiz' ise malzeme ucu hic cagrilmaz", async () => {
    const row = satir({ _marka: 'marka-1', _matStatus: 'belirsiz' });
    const { poster, cagrilar } = posterKur();
    expect(await restoreRematch([sayfa([row])], { 0: [row] }, poster)).toBe(0);
    expect(cagrilar).toHaveLength(0);
  });

  it("_labStatus 'yok' ise iscilik ucu hic cagrilmaz (ikiz)", async () => {
    const row = satir({ _firma: 'firma-1', _labStatus: 'yok' });
    const { poster, cagrilar } = posterKur();
    expect(await restoreRematch([sayfa([row])], { 0: [row] }, poster)).toBe(0);
    expect(cagrilar).toHaveLength(0);
  });

  it('bir taraf cevaplanmis, digeri degilse YALNIZ digeri sorulur', async () => {
    const row = satir({ _marka: 'marka-1', _firma: 'firma-1', _matStatus: 'urun_degil' });
    const { poster, cagrilar } = posterKur({
      '/labor-matching/bulk-match': { [AD]: { netPrice: 50 } },
    });
    expect(await restoreRematch([sayfa([row])], { 0: [row] }, poster)).toBe(1);
    expect(cagrilar.map((c) => c.url)).toEqual(['/labor-matching/bulk-match']);
  });

  it("bos durum ('') ve tanimsiz durum SORULUR — kapi fazla genis degil", async () => {
    const bos = satir({ _rowIdx: 1, _marka: 'marka-1', _matStatus: '' });
    const yok = satir({ _rowIdx: 2, _marka: 'marka-1' }); // _matStatus hic yok
    const { poster, cagrilar } = posterKur();
    const rows = [bos, yok];
    await restoreRematch([sayfa(rows)], { 0: rows }, poster);
    expect(cagrilar).toHaveLength(2);
  });
});

// ── F) BEKLEME ISARETI TEMIZLENIR ───────────────────────────────────────────
//
// "Fiyat yazildiysa isaret kalkar" kurali fiyat yazan diger UC yolda da var
// (ExcelGrid.tsx:322, :2631, fill-down.ts:271). Temizlenmezse hucre fiyati
// gosterirken arka plani kirmizi kalir ve ust sayac satiri hala sayar.

describe('restoreRematch — fiyat yazilinca bekleme isareti kalkar', () => {
  it('malzeme fiyati yazilinca _matStatus temizlenir', async () => {
    const row = satir({ _marka: 'marka-1', _matStatus: 'bekliyor' });
    const { poster } = posterKur({ '/matching/bulk-match': { [AD]: { netPrice: 100 } } });
    await restoreRematch([sayfa([row])], { 0: [row] }, poster);
    expect(row['Birim Fiyat']).toBe('110.0');
    expect(row._matStatus).toBe('');
  });

  it('iscilik fiyati yazilinca _labStatus temizlenir (ikiz)', async () => {
    const row = satir({ _firma: 'firma-1', _labStatus: 'bekliyor' });
    const { poster } = posterKur({ '/labor-matching/bulk-match': { [AD]: { netPrice: 50 } } });
    await restoreRematch([sayfa([row])], { 0: [row] }, poster);
    expect(row._labBirim).toBe('60.0');
    expect(row._labStatus).toBe('');
  });

  it('fiyat YAZILMADIYSA isarete dokunulmaz (yanlis temizleme yok)', async () => {
    const row = satir({ _marka: 'marka-1', _matStatus: 'bekliyor' });
    const { poster } = posterKur({ '/matching/bulk-match': { [AD]: { netPrice: 0 } } });
    await restoreRematch([sayfa([row])], { 0: [row] }, poster);
    expect(row._matStatus).toBe('bekliyor');
  });
});

// ── G) GENEL TOPLAM TAZELENIR ───────────────────────────────────────────────
//
// Satir nesnesine dogrudan yazildigi icin AG-Grid olayi (recalcGrand) atesmez.
// Tazelenmezse "Malz. Toplam + Isc. Toplam ≠ Toplam" celiskisi satirda kalir,
// draft'a kaydedilir ve teklif detayinda da oyle gorunur.

/** Fix oncesi hal: genel toplam alanina HIC dokunulmuyordu. */
function eskiGenelToplam(row: ExcelRowData): unknown {
  return row._toplam;
}

describe('restoreRematch — satirin GENEL TOPLAM alani tazelenir', () => {
  it('iki taraf da yazilinca genel toplam = malzeme + iscilik', async () => {
    const row = satir({ _marka: 'marka-1', _firma: 'firma-1' });
    const { poster } = posterKur({
      '/matching/bulk-match': { [AD]: { netPrice: 100 } },
      '/labor-matching/bulk-match': { [AD]: { netPrice: 50 } },
    });
    await restoreRematch([sayfa([row])], { 0: [row] }, poster);
    // 2750.0 + 1500.0 = 4250.0 (LITERAL)
    expect(row._toplam).toBe('4250.0');
  });

  it('yalniz iscilik yazilirsa genel toplam MALZEME toplamini da toplar (2x iscilik degil)', async () => {
    // Malzeme onceden fiyatliydi: Tutar=1000.0. Iscilik restore ile 1500.0 gelir.
    const row = satir({
      _firma: 'firma-1', _marka: 'marka-1',
      'Birim Fiyat': '40.0', 'Tutar': '1000.0', _toplam: '1000.0',
    });
    const { poster } = posterKur({ '/labor-matching/bulk-match': { [AD]: { netPrice: 50 } } });
    await restoreRematch([sayfa([row])], { 0: [row] }, poster);
    expect(row._toplam).toBe('2500.0'); // 1000 + 1500
    expect(row._toplam).not.toBe('3000.0'); // 2 × iscilik kusuru
  });

  it('bayat genel toplam EZILIR (eski deger satirda kalmaz)', async () => {
    const row = satir({ _firma: 'firma-1', _toplam: '99999.9' });
    const { poster } = posterKur({ '/labor-matching/bulk-match': { [AD]: { netPrice: 50 } } });
    await restoreRematch([sayfa([row])], { 0: [row] }, poster);
    expect(row._toplam).toBe('1500.0');
  });

  it('hicbir yazim olmadiysa genel toplama DOKUNULMAZ', async () => {
    const row = satir({ _marka: 'marka-1', _toplam: '777.7' });
    const { poster } = posterKur({ '/matching/bulk-match': { [AD]: { netPrice: 0 } } });
    await restoreRematch([sayfa([row])], { 0: [row] }, poster);
    expect(row._toplam).toBe('777.7');
  });

  it('grandTotalField rolu yoksa kirilmaz (Excel yolu geriye uyum)', async () => {
    const { grandTotalField: _g, ...genelsizRoller } = ROLLER;
    const row = satir({ _firma: 'firma-1' });
    const { poster } = posterKur({ '/labor-matching/bulk-match': { [AD]: { netPrice: 50 } } });
    expect(await restoreRematch([sayfa([row], genelsizRoller)], { 0: [row] }, poster)).toBe(1);
    expect(row._labBirim).toBe('60.0');
  });

  it('ESKI DAVRANIS bu kriteri IHLAL EDERDI — genel toplam bayat kalirdi', async () => {
    const row = satir({ _firma: 'firma-1', _toplam: '1000.0' });
    const { poster } = posterKur({ '/labor-matching/bulk-match': { [AD]: { netPrice: 50 } } });
    await restoreRematch([sayfa([row])], { 0: [row] }, poster);
    // Eski hal genel toplama dokunmadigi icin '1000.0' kalirdi; yeni hal 1500.0 yazar.
    expect(eskiGenelToplam(row)).not.toBe('1000.0');
    expect(row._toplam).toBe('1500.0');
  });
});

// ── H) KAR TEK SUZGECTEN (12.08 — 350785e ile birlestirme kosulu) ───────────

describe('restoreRematch — kar degeri tek suzgecten gecer', () => {
  it('virgullu kar "12,5" ondaligi KORUR (ham parseFloat 12 verirdi)', async () => {
    const row = satir({ _marka: 'marka-1', _malzKar: '12,5' });
    const { poster } = posterKur({ '/matching/bulk-match': { [AD]: { netPrice: 100 } } });
    await restoreRematch([sayfa([row])], { 0: [row] }, poster);
    // net 100, kar %12,5 → 112.5 (LITERAL). Ham parseFloat("12,5")=12 → 112.0
    expect(row['Birim Fiyat']).toBe('112.5');
    expect(row['Birim Fiyat']).not.toBe('112.0');
  });

  it('cop kar degeri ("abc") 0 kabul edilir — NaN fiyata sizmaz', async () => {
    const row = satir({ _firma: 'firma-1', _iscKar: 'abc' });
    const { poster } = posterKur({ '/labor-matching/bulk-match': { [AD]: { netPrice: 50 } } });
    await restoreRematch([sayfa([row])], { 0: [row] }, poster);
    expect(row._labBirim).toBe('50.0'); // karsiz net
  });
});

// ── I) KENAR DURUMLAR ───────────────────────────────────────────────────────

describe('restoreRematch — kenar durumlar', () => {
  it('poster hata firlatirsa yutulur, SONRAKI satirlar islenmeye devam eder', async () => {
    const bozuk = satir({ _rowIdx: 1, _marka: 'marka-1' });
    const saglam = satir({ _rowIdx: 2, _firma: 'firma-1' });
    let ilkCagri = true;
    const cagrilar: string[] = [];
    const poster: RematchPoster = async (url) => {
      cagrilar.push(url);
      if (ilkCagri) { ilkCagri = false; throw new Error('HTTP 500'); }
      return { [AD]: { netPrice: 50 } };
    };
    const rows = [bozuk, saglam];
    const n = await restoreRematch([sayfa(rows)], { 0: rows }, poster);
    expect(n).toBe(1);
    expect(saglam._labBirim).toBe('60.0');
    expect(cagrilar).toHaveLength(2); // hata ikinci cagriyi engellemedi
  });

  it('veri olmayan satirlar (grup bandi) ve adi bos satirlar atlanir', async () => {
    const grupBandi = satir({ _isDataRow: false, _isGroupRow: true, _marka: 'marka-1' });
    const adsiz = satir({ _marka: 'marka-1', 'Malzeme Cinsi': '', 'Çapı': '' });
    const { poster, cagrilar } = posterKur();
    const rows = [grupBandi, adsiz];
    expect(await restoreRematch([sayfa(rows)], { 0: rows }, poster)).toBe(0);
    expect(cagrilar).toHaveLength(0);
  });

  it('isEmpty sheet atlanir', async () => {
    const row = satir({ _marka: 'marka-1' });
    const { poster, cagrilar } = posterKur();
    const s = { ...sayfa([row]), isEmpty: true };
    expect(await restoreRematch([s], { 0: [row] }, poster)).toBe(0);
    expect(cagrilar).toHaveLength(0);
  });

  it('nameField rolu olmayan sheet atlanir', async () => {
    const { nameField: _ad, ...adsizRoller } = ROLLER;
    const row = satir({ _marka: 'marka-1' });
    const { poster, cagrilar } = posterKur();
    expect(await restoreRematch([sayfa([row], adsizRoller)], { 0: [row] }, poster)).toBe(0);
    expect(cagrilar).toHaveLength(0);
  });

  it('live kaydi varsa sheet.rowData DEGIL live satirlari islenir (tek dogruluk kaynagi)', async () => {
    const bayat = satir({ _marka: 'marka-1' });
    const canli = satir({ _firma: 'firma-1' });
    const { poster, cagrilar } = posterKur({
      '/labor-matching/bulk-match': { [AD]: { netPrice: 50 } },
    });
    const n = await restoreRematch([sayfa([bayat])], { 0: [canli] }, poster);
    expect(n).toBe(1);
    expect(cagrilar[0].url).toBe('/labor-matching/bulk-match');
    expect(canli._labBirim).toBe('60.0');
    expect(bayat['Birim Fiyat']).toBe(''); // bayat kopyaya dokunulmadi
  });
});
