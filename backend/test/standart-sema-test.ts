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
  const yildizYol = dosya('yildiz entegre');
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

  console.log(`\n${'='.repeat(60)}\nSTANDART SEMA: ${pass} PASS, ${fail} FAIL\n${'='.repeat(60)}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
