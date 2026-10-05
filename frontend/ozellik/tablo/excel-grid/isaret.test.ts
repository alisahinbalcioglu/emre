/**
 * FIYAT HUCRESI ISARETI — MALZEME ↔ ISCILIK IKIZI (12.08).
 *
 * KUSUR: doldurma yolu iscilik dalinda `_labStatus`/`_labSebep`/
 * `_labAdaySayisi` yaziyordu ama UC okuyucunun UCU DE (cellStyle, tooltip,
 * "N satir secim bekliyor" sayaci) yalniz `_matStatus` okuyordu. Iscilik
 * firmasi surukle-doldur yapilan satirlar, o firmada kalem yoksa TAMAMEN
 * SESSIZ kaliyordu.
 *
 * ★ TEST GERCEKTEN AYIRT EDIYOR MU? — eski okuyucularin replikasi
 * (`eskiStil`, `eskiTooltip`, `eskiSayacOlcutu`) ayni kriterlerle olculur ve
 * ISCILIK tarafinda IHLAL ETTIKLERI assert edilir.
 *
 * ⚠ BIR ASSERT TEK KRITERE: her kriter kendi it() blogunda.
 * ⚠ MALZEME DAVRANISI DEGISMEDI — A blogu eski cikti ile BIREBIR karsilastirir
 *   (ExcelGrid.tsx'ten tasima sirasinda sessiz kayma olmadigi olculur).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { isaretStili, isaretTooltip, secimBekliyor, kutuphaneFiyatAyrisimi, HAVUZA_DON_EYLEMI, type IsaretGirdisi } from './isaret';

// ── ESKI OKUYUCULARIN REPLIKASI (ExcelGrid.tsx, fix oncesi) ─────────────────

/** ExcelGrid.tsx:2336-2352 — YALNIZ `_matStatus` okurdu.
 *  VS GUNCELLEMESI (25.08, BILINCLI SAPMA): 'hata'/'ad-yok' eski okuyucuda
 *  ZEMINSIZDI — surukleme sirasindaki sunucu hatasi ekranda tamamen sessiz
 *  kaliyordu (kesif turu bulgusu). Referans artik bu iki durumda TURUNCU
 *  bekler; parite muhru kalan 8 vakada aynen surer. */
function eskiStil(d: any): { backgroundColor?: string; color?: string } | null {
  if (d?._matAutoVariant) return { backgroundColor: '#e0f2fe', color: '#0c4a6e' };
  if (d?._matSuggestion) return { backgroundColor: '#fef9c3', color: '#854d0e' };
  if (d?._matStatus === 'yok' || d?._matStatus === 'belirsiz') return { backgroundColor: '#fee2e2' };
  if (d?._matStatus === 'hata' || d?._matStatus === 'ad-yok') return { backgroundColor: '#ffedd5', color: '#9a3412' };
  if (d?._matStatus === 'urun_degil') return { backgroundColor: '#f1f5f9' };
  return null;
}

/** ExcelGrid.tsx:2354-2372 — YALNIZ `_mat*` alanlarini okurdu. */
function eskiTooltip(d: any): string {
  if (d._matAutoVariant) return `⚡ otomatik: ${d._matAutoVariant} — farklı varyant için marka menüsünü yeniden açın`;
  if (d._matStatus === 'belirsiz') {
    const n = d._matAdaySayisi;
    return [d._matSebep || 'Seçim bekliyor',
      n ? `${n} aday var — marka menüsünü açıp seçin` : 'marka menüsünü açıp varyant seçin',
    ].join(' · ');
  }
  if (d._matStatus === 'yok') return d._matSebep || 'Kütüphanede eşleşme yok';
  if (d._matStatus === 'hata') return `Eşleştirme hatası: ${d._matSebep || 'bilinmeyen'} — tekrar deneyin`;
  if (d._matStatus === 'ad-yok') return 'Bu satırda malzeme adı yok — fiyat sorgulanamadı';
  if (d._matStatus === 'urun_degil') return 'Oran/hizmet satırı — fiyat beklenmiyor';
  if (d._matSuggestion) return 'Öneri — kontrol edin';
  return '';
}

/** ExcelGrid.tsx:1760 — sayac YALNIZ `_matStatus` sayardi. */
function eskiSayacOlcutu(d: any): boolean {
  return d._matStatus === 'yok' || d._matStatus === 'belirsiz';
}

const malz = (p: Partial<IsaretGirdisi> = {}): IsaretGirdisi => ({ dal: 'malzeme', ...p });
const isc = (p: Partial<IsaretGirdisi> = {}): IsaretGirdisi => ({ dal: 'iscilik', ...p });

// ── A) MALZEME DAVRANISI DEGISMEDI (tasima muhru) ───────────────────────────

describe('isaret — malzeme davranisi ExcelGrid.tsx ile BIREBIR', () => {
  const VAKALAR: Array<{ ad: string; d: any }> = [
    { ad: 'otomatik varyant', d: { _matAutoVariant: 'kaynaklı' } },
    { ad: 'oneri', d: { _matSuggestion: true } },
    { ad: 'belirsiz + sebep + aday', d: { _matStatus: 'belirsiz', _matSebep: 'Çap eşleşmedi', _matAdaySayisi: 3 } },
    { ad: 'belirsiz, aday sayisi yok', d: { _matStatus: 'belirsiz' } },
    { ad: 'yok', d: { _matStatus: 'yok' } },
    { ad: 'yok + sebep', d: { _matStatus: 'yok', _matSebep: 'Markada bu cins yok' } },
    { ad: 'hata', d: { _matStatus: 'hata', _matSebep: 'HTTP 500' } },
    { ad: 'ad-yok', d: { _matStatus: 'ad-yok' } },
    { ad: 'urun_degil', d: { _matStatus: 'urun_degil' } },
    { ad: 'temiz satir', d: { _matStatus: '' } },
  ];

  it('stil ciktisi eski okuyucuyla AYNI (10 vaka)', () => {
    // ⚠ BOS DIZIDE .every() YALANCI YESIL — payda acikca kilitlenir.
    expect(VAKALAR).toHaveLength(10);
    for (const { ad, d } of VAKALAR) {
      const yeni = isaretStili(malz({
        durum: d._matStatus, sebep: d._matSebep, adaySayisi: d._matAdaySayisi,
        otoVaryant: d._matAutoVariant, oneri: d._matSuggestion,
      }));
      expect(yeni, `stil sapti: ${ad}`).toEqual(eskiStil(d));
    }
  });

  it('tooltip ciktisi eski okuyucuyla AYNI (10 vaka)', () => {
    expect(VAKALAR).toHaveLength(10);
    for (const { ad, d } of VAKALAR) {
      const yeni = isaretTooltip(malz({
        durum: d._matStatus, sebep: d._matSebep, adaySayisi: d._matAdaySayisi,
        otoVaryant: d._matAutoVariant, oneri: d._matSuggestion,
      }));
      expect(yeni, `tooltip sapti: ${ad}`).toBe(eskiTooltip(d));
    }
  });
});

// ── B) ISCILIK TARAFI ARTIK ISARETLENIYOR (IKIZ) ────────────────────────────

describe('isaret — iscilik tarafi (ikiz)', () => {
  it("iscilik 'yok' KIRMIZI hucre uretir", () => {
    expect(isaretStili(isc({ durum: 'yok' }))).toEqual({ backgroundColor: '#fee2e2' });
  });

  it("iscilik 'belirsiz' KIRMIZI hucre uretir", () => {
    expect(isaretStili(isc({ durum: 'belirsiz' }))).toEqual({ backgroundColor: '#fee2e2' });
  });

  it("iscilik 'urun_degil' GRI hucre uretir", () => {
    expect(isaretStili(isc({ durum: 'urun_degil' }))).toEqual({ backgroundColor: '#f1f5f9' });
  });

  it('iscilik tooltip SEBEP ve ADAY SAYISINI tasir (SD6: isaret eylemli)', () => {
    const t = isaretTooltip(isc({ durum: 'belirsiz', sebep: 'Birim uyuşmuyor', adaySayisi: 4 }));
    expect(t).toBe('Birim uyuşmuyor · 4 aday var — firma menüsünü açıp seçin');
  });

  it("iscilik tooltip'i kullaniciyi FIRMA menusune yollar, marka menusune DEGIL", () => {
    const t = isaretTooltip(isc({ durum: 'belirsiz', adaySayisi: 2 }));
    expect(t).toContain('firma menüsünü');
    expect(t).not.toContain('marka menüsünü');
  });

  it("iscilik 'ad-yok' metni ISCILIK der, malzeme DEMEZ", () => {
    expect(isaretTooltip(isc({ durum: 'ad-yok' }))).toBe('Bu satırda işçilik adı yok — fiyat sorgulanamadı');
  });

  it('ESKI OKUYUCU bu kriteri IHLAL EDERDI — iscilik satiri isaretsiz kalirdi', () => {
    const iscilikSatiri = { _labStatus: 'yok', _labSebep: 'Firmada bu kalem yok' };
    expect(eskiStil(iscilikSatiri)).toBeNull();      // hucre boyanmazdi
    expect(eskiTooltip(iscilikSatiri)).toBe('');     // tooltip bos
    expect(isaretStili(isc({ durum: 'yok' }))).not.toBeNull();
  });
});

// ── C) MALZEMEYE OZGU ISARETLER ISCILIGE SIZMAZ ─────────────────────────────

describe('isaret — malzemeye ozgu sinyaller iscilikte okunmaz', () => {
  it('iscilik dalinda otoVaryant MAVI yapmaz (dolduran yol onu zaten yazmaz)', () => {
    expect(isaretStili(isc({ otoVaryant: 'kaynaklı' }))).toBeNull();
  });

  it('iscilik dalinda oneri SARI yapmaz', () => {
    expect(isaretStili(isc({ oneri: true }))).toBeNull();
  });

  it('iscilik dalinda otoVaryant tooltip uretmez', () => {
    expect(isaretTooltip(isc({ otoVaryant: 'kaynaklı' }))).toBe('');
  });
});

// ── C2) A2 (tur 3, 14.09): SAYI OKUNAMADI SINYALI ───────────────────────────
// Ice aktarmada fiyat/miktar hucresindeki metin sayi degilse/belirsizse hucre
// BOS gelir, satirda `_sayiUyari[alan] = {ham, tur}` durur. Sinyal `_matStatus`e
// YAZILMAZ (eslestirme/elle giris ezer) — ayri girdi, en yuksek oncelik.

describe('isaret — A2 sayi okunamadi sinyali', () => {
  const HAYALET = { ham: '35x240mm Üç bölmeli döşeme kanalı', tur: 'sayi-degil' };
  it('IS-A2 MOR zemin; eslesme durumlarinin (yok/oneri/otoVaryant) ONUNDE', () => {
    const mor = isaretStili(malz({ sayiUyari: HAYALET, sayiAlani: 'fiyat' }));
    expect(mor).toEqual({ backgroundColor: '#ede9fe', color: '#5b21b6' });
    expect(isaretStili(malz({ sayiUyari: HAYALET, durum: 'yok', otoVaryant: 'x', oneri: true }))).toEqual(mor);
    expect(isaretStili(isc({ sayiUyari: HAYALET, durum: 'yok' }))).toEqual(mor);
  });
  it('IS-A2 renk diger sinyallerle KARISMAZ (kirmizi/turuncu/gri/mavi/sari)', () => {
    const mor = isaretStili(malz({ sayiUyari: HAYALET }))!.backgroundColor;
    for (const d of ['yok', 'hata', 'urun_degil']) expect(isaretStili(malz({ durum: d }))!.backgroundColor, d).not.toBe(mor);
    expect(isaretStili(malz({ otoVaryant: 'x' }))!.backgroundColor).not.toBe(mor);
    expect(isaretStili(malz({ oneri: true }))!.backgroundColor).not.toBe(mor);
  });
  it('IS-A2 tooltip dosyadaki metni ve kuralin TEK cumlesini soyler (alan turuyla)', () => {
    expect(isaretTooltip(malz({ sayiUyari: HAYALET, sayiAlani: 'fiyat' })))
      .toBe('Dosyadan gelmedi — “35x240mm Üç bölmeli döşeme kanalı” sayı değil — Fiyat hücresine yalnız sayı yazılır.');
    expect(isaretTooltip(malz({ sayiUyari: { ham: '1.250', tur: 'belirsiz' }, sayiAlani: 'miktar' }))).toContain('“1.250” belirsiz');
  });
  it('IS-A2 bos/gecersiz isaret sinyal DEGIL (satir temiz kalir)', () => {
    expect(isaretStili(malz({ sayiUyari: undefined }))).toBeNull();
    expect(isaretStili(malz({ sayiUyari: '' }))).toBeNull();
    expect(isaretTooltip(malz({ sayiUyari: null }))).toBe('');
  });
});

// ── D) GUVEN KAPISI SAYACI OLCUTU ───────────────────────────────────────────

describe('secimBekliyor — sayac olcutu', () => {
  it("'yok' bekliyor sayilir", () => expect(secimBekliyor('yok')).toBe(true));
  it("'belirsiz' bekliyor sayilir", () => expect(secimBekliyor('belirsiz')).toBe(true));
  it("'urun_degil' bekliyor SAYILMAZ (fiyat beklenmiyor)", () => expect(secimBekliyor('urun_degil')).toBe(false));
  it("bos durum bekliyor sayilmaz", () => expect(secimBekliyor('')).toBe(false));
  it('tanimsiz durum bekliyor sayilmaz', () => expect(secimBekliyor(undefined)).toBe(false));

  it('ESKI SAYAC bu kriteri IHLAL EDERDI — iscilik bekleyeni gormezdi', () => {
    const satir = { _matStatus: '', _labStatus: 'yok' };
    expect(eskiSayacOlcutu(satir)).toBe(false); // sayac 0 gosteriyordu
    // Yeni olcut satiri iki taraftan da sorar (ExcelGrid OR'lar):
    expect(secimBekliyor(satir._matStatus) || secimBekliyor(satir._labStatus)).toBe(true);
  });
});

// ── E) BAGLANTI KAPISI: ExcelGrid GERCEKTEN bu modulu kullaniyor mu? ────────
//
// NEDEN KAYNAK TARAMASI: yukaridaki bloklar KARAR mantigini olcuyor, ama
// karar dogru olsa bile ExcelGrid onu CAGIRMAZSA kullanici hicbir sey gormez
// ("wiring" kusuru — bu depoda daha once tam olarak boyle yasandi: doldurma
// yolu `_labStatus` YAZIYORDU, hicbir okuyucu yoktu ve testler yesildi).
// ExcelGrid.tsx AG-Grid olay nesnelerine bagli ve bu depoda jsdom YOK; o yollar
// birim testiyle kosulamiyor. Olculebilen tek sey KAYNAGIN KENDISI.
// Ayni desen projede zaten var: `ozellik/fiyat/kar-tek-suzgec.test.ts`,
// `lib/marj-tek-kaynak.test.ts`, `lib/popup-secici-sozlesmesi.test.ts`.

const EXCELGRID = path.join(__dirname, 'ExcelGrid.tsx');

/** Kriterler icerik uzerinde TEK yerde tanimli — testle olcut ayni sey. */
const KRITERLER: Array<{ ad: string; gecer: (s: string) => boolean }> = [
  { ad: 'isaret modulunu import eder', gecer: (s) => /from '\.\/isaret'/.test(s) },
  { ad: 'iscilik fiyat kolonu icin isaret girdisi kurar', gecer: (s) => /dal:\s*'iscilik'/.test(s) && /durum:\s*d\?\._labStatus/.test(s) },
  // ⚠ PROXY OLCUT YASAGI (bu kapinin ilk hali tam bu tuzaga dustu): olcut
  // `/iscilikFiyatKolonu/` idi — yani DEGISKENIN ADINI ariyordu. `if` kosulundan
  // `|| iscilikFiyatKolonu` silindiginde bildirim satiri yerinde kaldigi icin
  // kapi YESIL yandi (mutasyon M10 sag kaldi). Olcut artik KULLANIMI arar.
  { ad: 'iscilik fiyat kolonu isaret DALINA GIRER (kosulda kullanilir)', gecer: (s) => /if\s*\(\s*malzemeFiyatKolonu\s*\|\|\s*iscilikFiyatKolonu\s*\)/.test(s) },
  { ad: 'sayac IKI tarafi da okur', gecer: (s) => /secimBekliyor\(d\._matStatus\)/.test(s) && /secimBekliyor\(d\._labStatus\)/.test(s) },
  { ad: 'FirmaDropdown fiyat yazarken isareti temizler', gecer: (s) => /yazVeriLab\(node, '_labStatus', ''\)/.test(s) },
  { ad: "FirmaDropdown aday donunce 'belirsiz' isaretler", gecer: (s) => /yazVeriLab\(node, '_labStatus', 'belirsiz'\)/.test(s) },
  // 14.09 KUR-01: 'yok' dalinin onune kur alinamadi → 'hata' girdi (satir kur donunce yeniden eslesir).
  { ad: "FirmaDropdown eslesme yokken 'yok'/'urun_degil' isaretler", gecer: (s) => /_labStatus',\s*\(result as any\)\?\.notProduct \? 'urun_degil' : \(\(result as any\)\?\.kurAlinamadi \? 'hata' : 'yok'\)/.test(s) },
  // TEK KAYNAK: isaret renkleri modulde kaldi, ExcelGrid'e KOPYALANMADI.
  // C10 (P4b Parti 3): bayat kur seridinin rengi de modulde (#fffbeb ExcelGrid'in baska kutularinda var — serit rengi ayirt eder).
  { ad: 'isaret renkleri ExcelGrid icinde kopyalanmamis', gecer: (s) => !/#fee2e2|#e0f2fe|#fef9c3|#d97706/.test(s) },
  // Tur 3 A4c (14.09): kutuphane fiyat hucresi K1 ayrisim isaretini STIL ve IPUCU olarak okur.
  { ad: 'kutuphane fiyat hucresi K1 ayrisimini stil + ipucu olarak okur', gecer: (s) => (s.match(/mode === 'library' \? kutuphaneFiyatAyrisimi\(params\.data\) : null/g) ?? []).length === 2 && /ayrisim\?\.stil \?\? isaretStili\(/.test(s) && /ayrisim\?\.ipucu \?\? isaretTooltip\(/.test(s) },
];

describe('isaret — ExcelGrid baglanti kapisi (kaynak taramasi)', () => {
  it('A) ExcelGrid.tsx GERCEKTEN okunabiliyor (bos-kume kapisi)', () => {
    expect(fs.existsSync(EXCELGRID), 'ExcelGrid.tsx bulunamadi — kapi kapsamini kaybetmis olabilir').toBe(true);
    expect(fs.readFileSync(EXCELGRID, 'utf8').length).toBeGreaterThan(50000);
    expect(KRITERLER.length).toBeGreaterThanOrEqual(8);
  });

  it('B) ExcelGrid isaret modulune BAGLI ve iki tarafi da isaretliyor', () => {
    const s = fs.readFileSync(EXCELGRID, 'utf8');
    const ihlaller = KRITERLER.filter((k) => !k.gecer(s)).map((k) => k.ad);
    expect(ihlaller, 'ExcelGrid baglantisi kopmus:\n' + ihlaller.join('\n')).toEqual([]);
  });

  it('C) OLCUTUN KENDISI olculuyor: ESKI ExcelGrid icerigi bu kapidan GECEMEZ', () => {
    // Dairesel olcut yasagi: kural "hic ihlal yok" diye yesil yaniyorsa,
    // desenin gercekten calistigini AYRI kanitla. Asagidaki parca, fix
    // oncesi ExcelGrid.tsx'in ilgili satirlarinin birebir replikasidir.
    const ESKI = `
      if (field === data.columnRoles.materialUnitPriceField) {
        base.cellStyle = ((params: any) => {
          if (params.data?._matStatus === 'yok' || params.data?._matStatus === 'belirsiz') {
            return { textAlign: 'right', backgroundColor: '#fee2e2' };
          }
          return { textAlign: 'right' };
        }) as any;
      }
      if (d?._isDataRow && (d._matStatus === 'yok' || d._matStatus === 'belirsiz')) n++;
    `;
    const gecenler = KRITERLER.filter((k) => k.gecer(ESKI)).map((k) => k.ad);
    // Eski icerik kriterlerin HICBIRINI saglamamali (renk kopyasi dahil).
    expect(gecenler, 'ESKI icerik bu kriterleri gecmemeliydi: ' + gecenler.join(', ')).toEqual([]);
  });
});

// ── K1 AYRISMIS KUTUPHANE FIYATI (tur 3 A4c, 14.09) ─────────────────────────
describe('kutuphaneFiyatAyrisimi — havuzdan ayrismis ozel fiyat isaretlenir, tahmin edilmez', () => {
  it('sinyal yoksa null (normal stil) — bos, bozuk ya da eksik sinyal dahil', () => {
    expect(kutuphaneFiyatAyrisimi({ col3: 150 })).toBeNull();
    expect(kutuphaneFiyatAyrisimi(null)).toBeNull();
    expect(kutuphaneFiyatAyrisimi({ _fiyatAyrisik: 'evet' })).toBeNull();
    expect(kutuphaneFiyatAyrisimi({ _fiyatAyrisik: { ozel: 150 } })).toBeNull();
  });

  it('sinyal varsa SARI zemin ve IKI fiyati birlikte gosteren ipucu (satirin para birimiyle)', () => {
    const tl = kutuphaneFiyatAyrisimi({ _fiyatAyrisik: { ozel: 150, havuz: 240 }, _currency: 'TRY' });
    expect(tl?.stil).toEqual(isaretStili({ dal: 'malzeme', oneri: true })); // modulun SARI'si — kopya renk yok
    // P4b Parti 3: ayni birimde iki cikis — hucreye yaz YA DA havuza don (sayfanin dugmesi)
    expect(tl?.ipucu).toBe('Özel fiyat ₺150,00 · havuz liste fiyatı ₺240,00 — havuz fiyatı değişmiş; geçerli fiyatı bu hücreye yazın ya da üstteki «Havuz fiyatına dön» düğmesine basın');
    const usd = kutuphaneFiyatAyrisimi({ _fiyatAyrisik: { ozel: 10.5, havuz: 12 }, _currency: 'USD' });
    expect(usd?.ipucu.startsWith('Özel fiyat $10,50 · havuz liste fiyatı $12,00')).toBe(true);
  });

  it('sifir ozel fiyat da ayrisimdir (ekran 0, eslestirme liste fiyati kullanir)', () => {
    expect(kutuphaneFiyatAyrisimi({ _fiyatAyrisik: { ozel: 0, havuz: 100 } })?.ipucu).toContain('Özel fiyat ₺0,00');
  });
});

// ── C3 (P4b Parti 3, 05.10): OZEL FIYAT HAVUZDAN FARKLI BIRIMDE ─────────────
// Backend birimler FARKLIYSA `ozelBirim`/`havuzBirim` tasir (library-sheet-builder
// `havuzFiyatAyrisimi`). Eski ipucu tek simge (`_currency`) basiyordu.
describe('kutuphaneFiyatAyrisimi — C3 iki birim, her fiyat KENDI simgesiyle', () => {
  /** Fix oncesi kutuphaneFiyatAyrisimi'nin ipucu replikasi (tek simge). */
  const eskiIpucu = (d: any) => {
    const s = ({ TRY: '₺', USD: '$', EUR: '€' } as Record<string, string>)[String(d._currency ?? 'TRY')] ?? '₺';
    return `Özel fiyat ${s}… · havuz liste fiyatı ${s}…`;
  };
  const USD_TL = { _fiyatAyrisik: { ozel: 12, havuz: 480, ozelBirim: 'USD', havuzBirim: 'TRY' }, _currency: 'USD' };

  it('FIXTURE: eski ipucu iki fiyati AYNI simgeyle yazardi (ayirt edicilik)', () => {
    expect(eskiIpucu(USD_TL)).toBe('Özel fiyat $… · havuz liste fiyatı $…');
  });

  it('⭐ ozel $ · havuz ₺: her fiyat kendi simgesiyle', () => {
    expect(kutuphaneFiyatAyrisimi(USD_TL)?.ipucu.startsWith('Özel fiyat $12,00 · havuz liste fiyatı ₺480,00')).toBe(true);
  });

  it('farkli birimde cikis havuza donmektir (hucreye yazilan sayi ozel birimde kalir)', () => {
    expect(kutuphaneFiyatAyrisimi(USD_TL)?.ipucu).toBe(
      'Özel fiyat $12,00 · havuz liste fiyatı ₺480,00 — para birimleri farklı; havuz fiyatına geçmek için üstteki «Havuz fiyatına dön» düğmesine basın');
  });

  it('SOZLESME: ozel fiyatin birimi backend\'in ACIK alanindan (`ozelBirim`); `_currency` yalniz alan yoksa', () => {
    // Bugun builder `_currency`yi ozel fiyatin biriminden kurar (ikisi esit) —
    // bu test esitlige YASLANMAYI yakalar: `_currency` liste birimine donerse
    // ipucu "₺12 · ₺480, havuz fiyati degismis" diye yanlis soylerdi.
    const d = { _fiyatAyrisik: { ozel: 12, havuz: 480, ozelBirim: 'USD', havuzBirim: 'TRY' }, _currency: 'TRY' };
    expect(kutuphaneFiyatAyrisimi(d)?.ipucu.startsWith('Özel fiyat $12,00 · havuz liste fiyatı ₺480,00 — para birimleri farklı')).toBe(true);
  });

  it("ayni birimde ham yazim da simgesiyle ('EURO' = €, 'Dolar' = $ — arka ucun okuma tablosu)", () => {
    expect(kutuphaneFiyatAyrisimi({ _fiyatAyrisik: { ozel: 5, havuz: 6 }, _currency: 'EURO' })?.ipucu.startsWith('Özel fiyat €5,00 · havuz liste fiyatı €6,00')).toBe(true);
    expect(kutuphaneFiyatAyrisimi({ _fiyatAyrisik: { ozel: 5, havuz: 6 }, _currency: 'Dolar' })?.ipucu.startsWith('Özel fiyat $5,00')).toBe(true);
  });

  it('ters yon: ozel ₺ · havuz € (satir birimi ozel fiyatinki)', () => {
    const d = { _fiyatAyrisik: { ozel: 3000, havuz: 55.5, ozelBirim: 'TRY', havuzBirim: 'EUR' }, _currency: 'TRY' };
    expect(kutuphaneFiyatAyrisimi(d)?.ipucu.startsWith('Özel fiyat ₺3.000,00 · havuz liste fiyatı €55,50 — para birimleri farklı')).toBe(true);
  });

  it('farkli birimde de zemin SARI (ayni isaret, iki ayri metin)', () => {
    expect(kutuphaneFiyatAyrisimi(USD_TL)?.stil).toEqual(isaretStili({ dal: 'malzeme', oneri: true }));
  });

  it('eylem adi TEK kaynaktan (sayfanin dugmesi de bunu kullanir)', () => {
    expect(HAVUZA_DON_EYLEMI).toBe('Havuz fiyatına dön');
    expect(kutuphaneFiyatAyrisimi(USD_TL)?.ipucu).toContain(`«${HAVUZA_DON_EYLEMI}»`);
  });

  it('taninmayan birim KODUYLA yazilir — ₺ uydurulmaz', () => {
    const d = { _fiyatAyrisik: { ozel: 9, havuz: 400, ozelBirim: 'GBP', havuzBirim: 'TRY' }, _currency: 'GBP' };
    expect(kutuphaneFiyatAyrisimi(d)?.ipucu.startsWith('Özel fiyat GBP 9,00 · havuz liste fiyatı ₺400,00')).toBe(true);
  });

  it("eski kayittaki 'TL' / '₺' yazimi TRY sayilir (simge ₺, ayni birim metni)", () => {
    const tl = kutuphaneFiyatAyrisimi({ _fiyatAyrisik: { ozel: 15, havuz: 18 }, _currency: 'TL' });
    expect(tl?.ipucu.startsWith('Özel fiyat ₺15,00 · havuz liste fiyatı ₺18,00 — havuz fiyatı değişmiş')).toBe(true);
    const karisikYazim = kutuphaneFiyatAyrisimi({ _fiyatAyrisik: { ozel: 15, havuz: 18, ozelBirim: '₺', havuzBirim: 'TRY' } });
    expect(karisikYazim?.ipucu).toContain('havuz fiyatı değişmiş'); // ayni birim — "para birimleri farkli" DEGIL
  });

  it('bozuk birim alani (sayi) yok sayilir — satir birimi kullanilir', () => {
    const d = { _fiyatAyrisik: { ozel: 5, havuz: 6, ozelBirim: 7, havuzBirim: null }, _currency: 'EUR' };
    expect(kutuphaneFiyatAyrisimi(d)?.ipucu.startsWith('Özel fiyat €5,00 · havuz liste fiyatı €6,00 — havuz fiyatı değişmiş')).toBe(true);
  });
});

// ── C10 (P4b Parti 3, 05.10): BAYAT KUR ISARETI ─────────────────────────────
// Motor dovizli satirin sonucuna `kaynakKur` yazar; kur > 2 is gunu eskiyse
// `bayat: true, yasIsGunu: n` (P4a C10). On yuz satira `_matKurBilgi` /
// `_labKurBilgi` olarak tasir. Isaret ZEMIN degil SERIT: diger isaret kalir.
// Serit `background-image` (izgaranin tulleri box-shadow kanalinda — inceleme MEDIUM-1).
describe('isaret — C10 bayat kur', () => {
  const BAYAT = { currency: 'USD', kur: 41.2345, tarih: '01.10.2026', bayat: true, yasIsGunu: 3 };
  const TAZE = { currency: 'USD', kur: 41.2345, tarih: '05.10.2026' };
  const NOT = 'Fiyatlandırıldığında kur 3 iş günü eskiydi (1 USD = ₺41,2345, 01.10.2026) — güncel kur için marka menüsünden yeniden seçin ya da fiyatı elle yazın';
  const SERIT = 'linear-gradient(to right, #d97706 0 3px, transparent 3px)';

  it('FIXTURE: girdi alani olmadan cikti degismez (geriye uyum — ExcelGrid bugun alani vermiyor)', () => {
    expect(isaretStili(malz({ durum: '' }))).toBeNull();
    expect(isaretTooltip(malz({ durum: '' }))).toBe('');
  });

  it('⭐ fiyatli temiz satir + bayat kur: amber zemin + serit', () => {
    expect(isaretStili(malz({ durum: '', kurBilgi: BAYAT }))).toEqual({ backgroundColor: '#fffbeb', color: '#92400e', backgroundImage: SERIT });
  });

  it('⭐ ipucu fiyatlandirma anini (gecmis zaman), kuru, tarihi ve isaretin nasil kalkacagini soyler', () => {
    expect(isaretTooltip(malz({ durum: '', kurBilgi: BAYAT }))).toBe(NOT);
  });

  it('taze kur isaret uretmez (alan yok = bayat degil)', () => {
    expect(isaretStili(malz({ kurBilgi: TAZE }))).toBeNull();
    expect(isaretTooltip(malz({ kurBilgi: TAZE }))).toBe('');
  });

  it("yalniz `bayat: true` sayilir ('true' metni, 1, eski 'USD/41,2' bicimi degil)", () => {
    for (const k of [{ ...BAYAT, bayat: 'true' }, { ...BAYAT, bayat: 1 }, 'USD/41,2', null]) {
      expect(isaretStili(malz({ kurBilgi: k })), JSON.stringify(k)).toBeNull();
    }
  });

  it('⭐ oneri + bayat: SARI zemin KALIR, serit eklenir; metin ikisini de soyler', () => {
    expect(isaretStili(malz({ oneri: true, kurBilgi: BAYAT }))).toEqual({ backgroundColor: '#fef9c3', color: '#854d0e', backgroundImage: SERIT });
    expect(isaretTooltip(malz({ oneri: true, kurBilgi: BAYAT }))).toBe(`Öneri — kontrol edin · ${NOT}`);
  });

  it('otomatik varyant + bayat: MAVI zemin KALIR, serit eklenir', () => {
    expect(isaretStili(malz({ otoVaryant: 'kaynaklı', kurBilgi: BAYAT }))).toEqual({ backgroundColor: '#e0f2fe', color: '#0c4a6e', backgroundImage: SERIT });
    expect(isaretTooltip(malz({ otoVaryant: 'kaynaklı', kurBilgi: BAYAT }))).toBe(`⚡ otomatik: kaynaklı — farklı varyant için marka menüsünü yeniden açın · ${NOT}`);
  });

  it('iscilik ikizi: `_labKurBilgi` bayatsa ayni isaret, metin FIRMA menusune yollar', () => {
    expect(isaretStili(isc({ kurBilgi: BAYAT }))?.backgroundImage).toBe(SERIT);
    expect(isaretTooltip(isc({ kurBilgi: BAYAT }))).toBe(NOT.replace('marka menüsünden', 'firma menüsünden'));
  });

  it('fiyatsiz durumda (yok/belirsiz/hata/ad-yok/urun_degil) kur isareti YOK — cikti kursuz haliyle AYNI', () => {
    for (const durum of ['yok', 'belirsiz', 'hata', 'ad-yok', 'urun_degil']) {
      expect(isaretStili(malz({ durum, kurBilgi: BAYAT })), durum).toEqual(isaretStili(malz({ durum })));
      expect(isaretTooltip(malz({ durum, kurBilgi: BAYAT })), durum).toBe(isaretTooltip(malz({ durum })));
    }
  });

  it('sayi okunamadi (MOR) hucrede kur isareti YOK', () => {
    const g = { sayiUyari: { ham: 'x', tur: 'sayi-degil' }, sayiAlani: 'fiyat' as const };
    expect(isaretStili(malz({ ...g, kurBilgi: BAYAT }))).toEqual(isaretStili(malz(g)));
  });

  it('⭐ karisik kipte hucre fiyati dovizde kaldiysa (taraf USD/EUR) kurla hesaplanmamistir: isaret YOK', () => {
    expect(isaretStili(malz({ kurBilgi: BAYAT, tarafBirimi: 'USD' }))).toBeNull();
    expect(isaretStili(malz({ kurBilgi: BAYAT, tarafBirimi: 'EUR' }))).toBeNull();
    expect(isaretTooltip(malz({ kurBilgi: BAYAT, tarafBirimi: 'USD' }))).toBe('');
  });

  it('karisik kipte TL tarafi (kaynak fiyatsiz eski motor) isaretlenir', () => {
    expect(isaretStili(malz({ kurBilgi: BAYAT, tarafBirimi: 'TRY' }))?.backgroundImage).toBe(SERIT);
  });

  it('eksik alanlar metni bozmaz: yas yoksa yassiz, kur yoksa yalniz tarih', () => {
    expect(isaretTooltip(malz({ kurBilgi: { bayat: true, currency: 'EUR', kur: 48.1, tarih: '30.09.2026' } })))
      .toBe('Fiyatlandırıldığında kur eskiydi (1 EUR = ₺48,10, 30.09.2026) — güncel kur için marka menüsünden yeniden seçin ya da fiyatı elle yazın');
    expect(isaretTooltip(malz({ kurBilgi: { bayat: true, yasIsGunu: 4, tarih: '29.09.2026' } })))
      .toBe('Fiyatlandırıldığında kur 4 iş günü eskiydi (29.09.2026) — güncel kur için marka menüsünden yeniden seçin ya da fiyatı elle yazın');
    expect(isaretTooltip(malz({ kurBilgi: { bayat: true } })))
      .toBe('Fiyatlandırıldığında kur eskiydi — güncel kur için marka menüsünden yeniden seçin ya da fiyatı elle yazın');
  });

  // Ayirt edici ozellik SERIT (inceleme LOW-6): amber-50 zemin sarinin (oneri)
  // yanina gozle yakin — zemin esitsizligi tek basina vekil olcut olurdu.
  const DIGER_ISARETLER = () => [
    isaretStili(malz({ durum: 'yok' })), isaretStili(malz({ durum: 'hata' })), isaretStili(malz({ durum: 'urun_degil' })),
    isaretStili(malz({ otoVaryant: 'x' })), isaretStili(malz({ oneri: true })), isaretStili(malz({ sayiUyari: { ham: 'x', tur: 'sayi-degil' } })),
  ];

  it('⭐ seridi YALNIZ bayat kur tasir; hicbir isaret izgaranin tul kanalina (box-shadow) yazmaz', () => {
    const digerleri = DIGER_ISARETLER();
    expect(digerleri).toHaveLength(6);
    for (const s of digerleri) expect(s!.backgroundImage).toBeUndefined();
    for (const s of [...digerleri, isaretStili(malz({ kurBilgi: BAYAT })), isaretStili(malz({ oneri: true, kurBilgi: BAYAT }))]) {
      expect(s).not.toHaveProperty('boxShadow');
    }
  });

  it('amber zemin diger isaretlerin zeminiyle de ayni degil', () => {
    const amber = isaretStili(malz({ kurBilgi: BAYAT }))!.backgroundColor;
    for (const s of DIGER_ISARETLER()) expect(s!.backgroundColor).not.toBe(amber);
  });
});

// ── BIRIM YAZIMI ↔ ARKA UC OKUMA TABLOSU (inceleme LOW-2: senkron kapisi) ────
// Ipucu eski kayittaki ham yazimi ('EURO', 'Dolar') arka ucun OKUMA tablosuyla
// cozer (exchange-rates.service `PARA_BIRIMI_YAZIMLARI`). Tablo orada degisir de
// burada degismezse ipucu ile motorun birimi ayrisir — bu blok onu yakalar.
describe('kutuphaneFiyatAyrisimi — birim yazimi arka ucun okuma tablosuyla AYNI', () => {
  const KAYNAK = fs.readFileSync(
    path.join(__dirname, '../../../../backend/src/ozellik/fiyat/exchange-rates/exchange-rates.service.ts'), 'utf8');
  const govde = /PARA_BIRIMI_YAZIMLARI[^=]*=\s*\{([\s\S]*?)\};/.exec(KAYNAK)?.[1] ?? '';
  const ciftler = Array.from(govde.matchAll(/('(?:[^'\\]|\\.)*'|[A-Za-z_$][\w$]*)\s*:\s*'(TRY|USD|EUR)'/g))
    .map((m) => [m[1].replace(/^'|'$/g, ''), m[2]] as const);
  const SIMGE: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€' };

  it('FIXTURE: arka uc tablosu okundu (bos tablo yalanci yesil olurdu)', () => {
    expect(ciftler.length).toBeGreaterThanOrEqual(14);
    expect(ciftler).toContainEqual(['EURO', 'EUR']);
    expect(ciftler).toContainEqual(['', 'TRY']);
  });

  it('⭐ arka ucun tanidigi HER yazim ipucunda kendi simgesiyle', () => {
    const sapan = ciftler.filter(([yazim, kod]) => !kutuphaneFiyatAyrisimi({ _fiyatAyrisik: { ozel: 1, havuz: 2 }, _currency: yazim })
      ?.ipucu.startsWith(`Özel fiyat ${SIMGE[kod]}1,00 · havuz liste fiyatı ${SIMGE[kod]}2,00 — havuz fiyatı değişmiş`));
    expect(sapan, 'arka uc tablosuyla ayrisan yazim').toEqual([]);
  });

  it('kucuk harf ve bosluk (ic bosluk dahil) arka uc gibi cozulur', () => {
    expect(kutuphaneFiyatAyrisimi({ _fiyatAyrisik: { ozel: 1, havuz: 2 }, _currency: ' us $ ' })?.ipucu.startsWith('Özel fiyat $1,00')).toBe(true);
  });
});
