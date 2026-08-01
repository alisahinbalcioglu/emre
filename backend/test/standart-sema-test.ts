/* STANDART GRID SEMASI — GS1-GS14 + MF1-MF6 KABUL TESTLERI
 * PRD: PRD_Standart_Grid_Semasi_ve_Aday_Ayirt_Edicilik.md (ust belge)
 *
 * ONCE KIRMIZI: bu testler DUZELTMEDEN ONCE yazildi ve kirmizi kostugu
 * kanitlandi (FAZ0_STANDART_SEMA_KOK_NEDEN.md §A). Hedef, ayni testlerin
 * duzeltme sonrasi yesile donmesidir.
 *
 * Olcum GERCEK dosyalarla: YILDIZ ENTEGRE KARTEPE (11 sayfa) + SAHINKUL.
 * Kosum: npm run test:gs
 */
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { ExcelGridService } from '../src/modules/excel-grid/excel-grid.service';
import { STANDART_KOLONLAR, STANDART_ROLLER } from '../src/modules/excel-grid/standart-sema';

const FIX = path.resolve(__dirname, '../../test-fixtures/e2e');
/** Turkce katlama — "YILDIZ".toLowerCase('tr') noktasiz ı verir, duz
 *  karsilastirma dosyayi bulamiyor. */
const katla = (s: string) => s.normalize('NFC')
  .replace(/[İIı]/g, 'i').replace(/[Şş]/g, 's').replace(/[Ğğ]/g, 'g')
  .replace(/[Üü]/g, 'u').replace(/[Öö]/g, 'o').replace(/[Çç]/g, 'c').toLowerCase();
const dosya = (parca: string) => {
  const f = fs.readdirSync(FIX).find((x) => katla(x).includes(katla(parca)));
  if (!f) throw new Error(`fixture yok: ${parca}`);
  return path.join(FIX, f);
};

let pass = 0; let fail = 0;
const check = (ad: string, kosul: boolean, kanit = '') => {
  if (kosul) { pass++; console.log(`PASS: ${ad}${kanit ? ' — ' + kanit : ''}`); }
  else { fail++; console.log(`FAIL: ${ad}${kanit ? ' — ' + kanit : ''}`); }
};

/** PRD §A.1 — degismez 13 kolon, bu sirada. */
const STANDART_SEMA = [
  'No', 'Malzeme Adı', 'Miktar', 'Birim',
  'Malz. Kar %', 'Malz. Marka', 'Malz. Birim Fiyat', 'Malz. Toplam',
  'İşç. Kar %', 'İşç. Firma', 'İşç. Birim Fiyat', 'İşç. Toplam',
  'Genel Toplam',
];

async function main() {
  const svc = new ExcelGridService({ brand: { findMany: async () => [] } } as any);
  console.log('\n══════ GS1-GS14 · MF1-MF6: STANDART GRID SEMASI ══════\n');

  // ── YILDIZ ───────────────────────────────────────────────────────────
  const yildizYol = dosya('firma-c entegre');
  const yildizBuf = fs.readFileSync(yildizYol);
  const yildiz = await svc.prepare(yildizBuf, { fixedSchema: true });

  // GS13: sayfa sekmeleri dosyadaki GORUNUR sayfalarla birebir
  const wb = XLSX.read(yildizBuf, { type: 'buffer' });
  const gorunurSayfalar = wb.SheetNames.filter((n) => {
    const s = (wb.Workbook?.Sheets ?? []).find((x: any) => x.name === n);
    return !s || (s.Hidden ?? 0) === 0;
  });
  check('GS13 sayfa sayısı dosyadaki görünür sayfa sayısına eşit',
    yildiz.sheets.length === gorunurSayfalar.length,
    `parse=${yildiz.sheets.length} dosya=${gorunurSayfalar.length} (${gorunurSayfalar.join(', ')})`);
  const eksikSayfa = gorunurSayfalar.filter((n) => !yildiz.sheets.some((s) => s.name === n));
  check('GS13b hiçbir sayfa düşürülmedi (İcmal dahil)',
    eksikSayfa.length === 0, eksikSayfa.length ? 'eksik: ' + eksikSayfa.join(', ') : 'tümü var');
  // GS2: sayfa DONMESI yetmez — KULLANILABILIR olmali. Frontend isEmpty=true
  // sayfayi sekmeden düşürüyor (quotes/[id] ve new: sheets.filter(!isEmpty)),
  // bu yüzden İcmal dosyada 9 dolu satıra rağmen ekranda HİÇ yok.
  {
    const icmal = yildiz.sheets.find((s) => katla(s.name).includes('icmal'));
    const dataSatiri = ((icmal?.rowData ?? []) as any[]).filter((r) => r._isDataRow).length;
    check('GS2c İcmal sayfası kullanılabilir (isEmpty=false + veri satırı var)',
      !!icmal && icmal.isEmpty === false && dataSatiri >= 5,
      `isEmpty=${icmal?.isEmpty} dataSatırı=${dataSatiri} (dosyada 9 bölüm satırı var)`);
  }

  // Kullanici karari: ozet sayfa GORUNUR ama toplama/eslestirmeye GIRMEZ
  {
    const icmal: any = yildiz.sheets.find((s) => katla(s.name).includes('icmal'));
    const ozetSatir = ((icmal?.rowData ?? []) as any[]).filter((r) => r._isDataRow && r._ozet).length;
    const detayOzetli = yildiz.sheets
      .filter((s: any) => !s.isOzet)
      .some((s: any) => (s.rowData ?? []).some((r: any) => r._ozet));
    check('KARAR özet sayfa işaretli, detay sayfalar işaretsiz (çift sayma yok)',
      !!icmal?.isOzet && ozetSatir > 0 && !detayOzetli,
      `İcmal.isOzet=${icmal?.isOzet}, özet satır=${ozetSatir}, detay sayfada özet işareti=${detayOzetli}`);
  }

  // GS4b — TEKLIF GENELI, dosyanin KENDI icmal toplamiyla birebir ayni olmali.
  // Sabit sayi YOK: beklenen deger dosyanin İcmal sayfasindaki "Genel Toplam"
  // satirindan okunur, gerceklesen ise ExcelGrid'in pinned-bottom hesabinin
  // AYNISIYLA (materialTotal + laborTotal, ozet satirlari HARIC) uretilir.
  // Bu kontrol hem cift saymayi (ozet sayfanin toplama girmesi) hem de kayip
  // satiri yakalar. 31.07 olcumu: 62.043.700 = 62.043.700 (fark 0).
  //
  // ⚠ BU TEST NE KANITLAR, NE KANITLAMAZ (01.08, kalem 54'un dersi):
  // Bu test BIR DOSYANIN TOPLAMINI kanitlar — TOPLAM OZELLIGINI DEGIL.
  // Yildiz'da dogru cikmasinin sebebi o dosyada "Isc. Toplam" sutununun
  // BULUNMASI ve standart-sema.ts:194'un onu KOPYALAMASIDIR. Malz. Toplam
  // sutunu olmayan bir dosyada (PANOVA) ayni hesap BOS donuyordu ve bu test
  // hicbir sey soylemiyordu. Yani yesilligi gercek ama KAPSAMI TEK DOSYA.
  // Genel kanit icin: test/kd11-toplam-yollari-test.ts (uc yol x iki sutun).
  // Bu test SILINMEZ, DEGISTIRILMEZ — yanina ikincisi konur.
  {
    const icmal: any = yildiz.sheets.find((s) => katla(s.name).includes('icmal'));
    const icmalGenel = ((icmal?.rowData ?? []) as any[])
      .filter((r) => /genel\s*toplam/i.test(String(r._ad ?? '')))
      .reduce((m, r) => Math.max(m, Number(r._toplam) || 0), 0);
    const say = (v: any) => parseFloat(String(v ?? '')) || 0;
    let teklifGeneli = 0;
    for (const sh of yildiz.sheets as any[]) {
      const rol: any = sh.columnRoles ?? {};
      for (const r of (sh.rowData ?? []) as any[]) {
        if (!r._isDataRow || r._ozet) continue;
        teklifGeneli += say(r[rol.materialTotalField]) + say(r[rol.laborTotalField]);
      }
    }
    check('GS4b teklif geneli dosyanın İcmal toplamıyla birebir aynı',
      icmalGenel > 0 && Math.abs(teklifGeneli - icmalGenel) < 0.01,
      `teklif=${teklifGeneli.toLocaleString('tr-TR')} · İcmal=${icmalGenel.toLocaleString('tr-TR')} · fark=${(teklifGeneli - icmalGenel).toLocaleString('tr-TR')}`);
  }

  // GS1/GS2: HER sayfada AYNI 13 kolon, ayni sirada
  const semaHatalari: string[] = [];
  const sizanKolonlar: string[] = [];
  for (const sh of yildiz.sheets) {
    const basliklar = (sh.columnDefs ?? []).map((d: any) => String(d.headerName ?? '').trim());
    if (JSON.stringify(basliklar) !== JSON.stringify(STANDART_SEMA)) {
      semaHatalari.push(`${sh.name}: [${basliklar.join(' | ')}]`);
    }
    // GS1: dosyaya ozgu kolon grid'e SIZAMAZ.
    // NOT: regex'te /i BAYRAGI TURKCE İ'yi 'i'ye KATLAMAZ — "BİRİM FİYAT
    // İŞÇİLİK" basligi /işçilik/i ile eslesmiyordu ve kontrol YANLIS YESIL
    // veriyordu. Once katla(), sonra ASCII desenle bak.
    for (const d of (sh.columnDefs ?? []) as any[]) {
      const h = String(d.headerName ?? '');
      const hk = katla(h);
      if (/birim\s*fiyat\s*(iscilik|malzeme)/.test(hk) || /toplam\s*fiyat/.test(hk)) {
        sizanKolonlar.push(`${sh.name}!${d.field}="${h}"`);
      }
    }
  }
  check('GS1/GS2 her sayfada aynı 13 standart kolon',
    semaHatalari.length === 0,
    semaHatalari.length ? `${semaHatalari.length} sayfa sapıyor → ${semaHatalari[0]}` : `${yildiz.sheets.length} sayfa uyumlu`);
  check('GS1b dosyaya özgü fiyat kolonu grid’e sızmıyor',
    sizanKolonlar.length === 0,
    sizanKolonlar.length ? sizanKolonlar.join(' · ') : 'sızıntı yok');

  // GS3: Isc. Toplam + Genel Toplam HER sayfada var
  const toplamsiz = yildiz.sheets.filter((sh) => {
    const b = (sh.columnDefs ?? []).map((d: any) => String(d.headerName ?? '').trim());
    return !b.includes('İşç. Toplam') || !b.includes('Genel Toplam');
  }).map((s) => s.name);
  check('GS3 İşç. Toplam ve Genel Toplam her sayfada var',
    toplamsiz.length === 0, toplamsiz.length ? 'eksik: ' + toplamsiz.join(', ') : 'tüm sayfalarda var');

  // GS5: nitelik/devam satiri VERI satiri degildir (fiyat sorgusuna gitmez)
  {
    const sh = yildiz.sheets.find((s) => s.name === 'Trafo.Su.Püskürtme');
    const nf = (sh?.columnRoles as any)?.nameField ?? 'col1';
    const nitelik = (sh?.rowData ?? []).filter((r: any) =>
      /^(Türü|Montaj Biçimi|Malzeme|Püskürtme Yapısı|Bağlantı|Aksesuar|Onay|Üretici|Çap|Basınç Sınıfı|Tür|Tahrik)\s*:/i
        .test(String(r[nf] ?? '').trim()));
    const nitelikDataOlan = nitelik.filter((r: any) => r._isDataRow);
    check('GS5 nitelik satırları veri satırı DEĞİL (fiyat sorgusuna gitmez)',
      nitelik.length > 0 && nitelikDataOlan.length === 0,
      `nitelik satırı=${nitelik.length}, yanlışlıkla data olan=${nitelikDataOlan.length}`);
  }

  // GS7/A.2: sayfanin ILK 12 grid satirinda en az bir GERCEK malzeme olmali
  {
    const sh = yildiz.sheets.find((s) => s.name === 'Trafo.Su.Püskürtme');
    const ilk12 = (sh?.rowData ?? []).slice(0, 12);
    const malzemeVar = ilk12.some((r: any) => r._isDataRow);
    check('GS7 ilk ekranda veri görünür (afiş/boş/çift başlık grid’i doldurmaz)',
      malzemeVar, `ilk 12 satırda data satırı: ${ilk12.filter((r: any) => r._isDataRow).length}`);
  }

  // GS12: miktar sayisal
  {
    let sayisalOlmayan = 0; let toplamData = 0; let ornek = '';
    for (const sh of yildiz.sheets) {
      const qf = (sh.columnRoles as any)?.quantityField;
      if (!qf) continue;
      for (const r of (sh.rowData ?? []) as any[]) {
        if (!r._isDataRow) continue;
        toplamData++;
        const ham = String(r[qf] ?? '').trim();
        if (ham === '') continue;
        if (isNaN(parseFloat(ham.replace(',', '.')))) {
          sayisalOlmayan++;
          if (!ornek) ornek = `${sh.name}: "${ham}"`;
        }
      }
    }
    check('GS12 miktar sayıya normalize edildi',
      sayisalOlmayan === 0, `data=${toplamData}, sayısal olmayan=${sayisalOlmayan}${ornek ? ' (' + ornek + ')' : ''}`);
  }

  // ── SAHINKUL: MF1/MF2/MF3 ────────────────────────────────────────────
  const sahin = await svc.prepare(fs.readFileSync(dosya('kesif ozeti 251224')), { fixedSchema: true });
  {
    const sh = sahin.sheets.find((s) => s.name === 'SIHHİ');
    const rows = ((sh?.rowData ?? []) as any[]).filter((r) => r._isDataRow);
    // MF2: SAHINKUL'da dosyanin ISCILIK grubu altindaki fiyatlar Isc. alanina
    const iscDolu = rows.filter((r) => Number(r._labBirim) > 0).length;
    check('MF2 dosyanın İŞÇİLİK başlığı altındaki fiyatlar İşç. Birim Fiyat’a geldi',
      iscDolu >= 20, `İşç. Birim Fiyat dolu satır=${iscDolu}`);
    // MF1: malzeme fiyatlari Malz. Birim Fiyat'a
    const matDolu = rows.filter((r) => Number(r._matBirim) > 0).length;
    check('MF1 dosyadaki malzeme fiyatları Malz. Birim Fiyat’a geldi',
      matDolu >= 1, `Malz. Birim Fiyat dolu satır=${matDolu}`);
    // MF3: kaynak rozeti
    const rozetli = rows.filter((r) => r._matKaynak === 'dosya' || r._labKaynak === 'dosya').length;
    check('MF3 dosyadan gelen değerlerde kaynak rozeti "dosyadan"',
      rozetli >= 20, `rozetli satır=${rozetli}`);
  }
  // GS2 SAHINKUL'da da gecerli
  {
    const sapan = sahin.sheets.filter((sh) => {
      const b = (sh.columnDefs ?? []).map((d: any) => String(d.headerName ?? '').trim());
      return JSON.stringify(b) !== JSON.stringify(STANDART_SEMA);
    }).map((s) => s.name);
    check('GS2b ŞAHİNKUL’un her sayfasında da aynı 13 kolon',
      sapan.length === 0, sapan.length ? `sapan: ${sapan.join(', ')}` : `${sahin.sheets.length} sayfa uyumlu`);
  }

  // ══ KAPATMA TURU ADIM 4: KE20 — silinen `basligaUyar` sozlesmesinin yerine ══
  // Eski kanit `test:kb` KE20/20b/20c idi; T1/T3 temizliginde suite ile birlikte
  // silindi ve YERINE HICBIR SEY GELMEDI. Kriterin canli cekirdegi su:
  // "YALNIZ MALZEME yazan bir baslik, malzeme BIRIM FIYAT rolu DOGURMAZ."
  // Boyle bir baslik belirsizdir (marka? malzeme adi? tutar?); fiyat sayilirsa
  // dosyadaki rastgele bir sayi kolonu grid'e fiyat diye sizar.
  // Olcut davranissal: o kolonun degerleri `_matBirim`e KOPYALANMAMALI.
  {
    const aoa = [
      ['No', 'Malzeme Adı', 'Miktar', 'Birim', 'MALZEME'],
      ['1', 'Galvaniz Çelik Boru ½"', 6, 'mt.', 123.45],
      ['2', 'Galvaniz Çelik Boru ¾"', 565, 'mt.', 234.56],
      ['3', 'Galvaniz Çelik Boru 1"', 140, 'mt.', 345.67],
      ['4', 'Galvaniz Çelik Boru 1¼"', 230, 'mt.', 456.78],
      ['5', 'Kelebek Vana DN50', 4, 'Adet', 567.89],
    ];
    const wbT = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbT, XLSX.utils.aoa_to_sheet(aoa), 'BELIRSIZ');
    const buf = XLSX.write(wbT, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const p = await svc.prepare(buf, { fixedSchema: true });
    const rows = ((p.sheets[0]?.rowData ?? []) as any[]).filter((r) => r._isDataRow);
    const belirsizDegerler = [123.45, 234.56, 345.67, 456.78, 567.89];
    const sizan = rows.filter((r) => {
      const v = parseFloat(String(r._matBirim ?? ''));
      return !isNaN(v) && belirsizDegerler.some((b) => Math.abs(b - v) < 0.001);
    });
    check('KE20 yalnız "MALZEME" yazan başlık malzeme BİRİM FİYAT rolü doğurmaz',
      rows.length >= 4 && sizan.length === 0,
      `veri satırı=${rows.length}, sızan fiyat satırı=${sizan.length}` +
      (sizan.length ? ` (ör. _matBirim="${sizan[0]._matBirim}")` : ''));
    // KE20b: aynı kolon İŞÇİLİK birim fiyatına da bağlanmamalı
    const sizanIsc = rows.filter((r) => {
      const v = parseFloat(String(r._labBirim ?? ''));
      return !isNaN(v) && belirsizDegerler.some((b) => Math.abs(b - v) < 0.001);
    });
    check('KE20b aynı belirsiz başlık işçilik BİRİM FİYAT rolü de doğurmaz',
      sizanIsc.length === 0, `sızan satır=${sizanIsc.length}`);
  }

  // ── GS14: ROLLER SABIT ALANLARI GOSTERIR — colN YOK (ADIM 5) ────────────
  // GS14'un otomatik testi yoktu. Kodda tanim: "roller artik SABIT alanlari
  // gosterir — colN yok" (standart-sema.ts:53). Rol bir dosya kolonuna
  // kacarsa (colN) grid hesabi ile cikti farkli hucreleri okur ve toplamlar
  // ayrisir — KE/KF sinifinin kok nedeni buydu.
  // NOT: gorev dosyasi GS14'u "tek hesap modulu" diye tanimliyor; PRD repoda
  // olmadigi icin ikisi de sinanir (asagidaki + FE `pricing` sozlesmesi).
  // ⚠ ILK DENEME TOTOLOJIYDI (31.07): "cikti rollerinde colN yok" diye olctum;
  //    ama `standartlastir` rolleri HER KOSULDA STANDART_ROLLER'a esitliyor,
  //    yani o olcum ihlali gostermiyordu — rolu bilerek `col4`e baglayip
  //    kosunca test yine YESIL kaldi. Duyarsiz test = kanit degil, silindi.
  //    Yerine gecen iki gercek sart: (GS14b) semanin kendi tutarliligi ve
  //    (test:ex GS14c) grid toplami ile cikti toplaminin AYNI olmasi.
  {
    // GS14b: rol adlarinin isaret ettigi alanlar 13 kolonluk semada GERCEKTEN var
    const semaAlanlari = new Set(STANDART_KOLONLAR.map((k) => k.field));
    const yok = Object.entries(STANDART_ROLLER)
      .filter(([, alan]) => !semaAlanlari.has(alan as string))
      .map(([rol, alan]) => `${rol}→${alan}`);
    check('GS14b her rol, 13 kolonluk şemada var olan bir alanı gösterir',
      yok.length === 0, yok.length ? yok.join(' · ') : `${Object.keys(STANDART_ROLLER).length} rol eşleşti`);
  }

  // ══ TF/PANOVA — BASLIK ETIKETI ILE VERI UYUSMUYOR (canli bulgu 31.07) ═══
  // Kullanici bildirdi: "adet ve birimler patlamis". Olculdu — dosyanin
  // basligi ile ICERIGI TERS:
  //   R3 baslik : NO | MALZEME ADI | BİRİM | MİKTAR | BİRİM FİYAT | TOPLAM
  //   R6 veri   :    | 2000 GPM …  |   1   |  SET   |  2300000    | 2300000
  // Yani C3'te MIKTAR var ama basligi "BİRİM"; C4'te BIRIM var ama basligi
  // "MİKTAR". Motor birimi ICERIKTEN dogru buluyor (col3) ama miktari
  // "birimin komsusu" diye ararken ONCE SAGA bakiyor ve C5'i (BİRİM FİYAT,
  // %91 sayisal) miktar saniyor. Ekranda 2.300.000 "miktar" gorunuyordu.
  {
    const panova = await svc.prepare(fs.readFileSync(dosya('firma-d-1')), { fixedSchema: true });
    const sh: any = panova.sheets[0];
    const veri = ((sh?.rowData ?? []) as any[]).filter((r) => r._isDataRow);
    const bul = (parca: string) => veri.find((r) => String(r._ad ?? '').includes(parca));
    const pompa = bul('2000 GPM');
    const boru = bul('6\'\' Siyah Boru') ?? bul('Siyah Boru');

    check('TF/PANOVA dosya okundu ve veri satırları çıktı',
      veri.length >= 40, `veri satırı=${veri.length} (dosyada ~57)`);
    check('TF/PANOVA miktar SAYI, birim METİN (başlık ters olsa da)',
      !!pompa && Number(pompa._miktar) === 1 && String(pompa._birim).trim() === 'SET',
      pompa ? `"2000 GPM…" → miktar="${pompa._miktar}" birim="${pompa._birim}" (beklenen 1 / SET)` : 'satır bulunamadı');
    check('TF/PANOVA fiyat sütunu MİKTAR sanılmıyor',
      !!pompa && Number(pompa._miktar) !== 2300000,
      pompa ? `miktar="${pompa._miktar}"` : '-');
    // ⚠ Gevsek sinir (0<x<10000) fiyati da geciriyordu: 821,07 "miktar" olarak
    //   PASS aliyordu. Dosyadaki GERCEK deger yazilir: R21 → 42 mt.
    // ⚠ CANLI BULGU (31.07): ekranda miktarsız satırlarda "Invalid Number"
    //   yaziyordu. Kaynak AG-Grid'in SAYI tipi bicimlendiricisi:
    //     value == null → ""   ·   typeof value !== 'number' → "Invalid Number"
    //   Bos METIN ('') null DEGILDIR → her bos hucre "Invalid Number" oluyor.
    //   Sozlesme: `_miktar` ya SAYIDIR ya da NULL — asla bos metin.
    {
      const bosMetin = ((sh?.rowData ?? []) as any[]).filter((r) => r._miktar === '');
      check('GS12b miktarsız satırda _miktar NULL (boş metin AG-Grid’de "Invalid Number" basar)',
        bosMetin.length === 0,
        `boş metin taşıyan satır=${bosMetin.length}/${(sh?.rowData ?? []).length}`);
    }

    check('TF/PANOVA ikinci örnek: boru satırı da doğru (R21 = 42 mt)',
      !!boru && Number(boru._miktar) === 42 && String(boru._birim).trim() === 'mt',
      boru ? `"${String(boru._ad).slice(0, 20)}" → miktar="${boru._miktar}" birim="${boru._birim}" (beklenen 42 / mt)` : 'satır bulunamadı');
  }

  console.log(`\n${'='.repeat(60)}\nSTANDART SEMA: ${pass} PASS, ${fail} FAIL\n${'='.repeat(60)}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
