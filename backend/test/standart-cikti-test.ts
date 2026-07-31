/* STANDART CIKTI — EX1-EX8 KABUL TESTLERI
 * PRD: PRD_Standart_Grid_Semasi_ve_Aday_Ayirt_Edicilik.md §Bolum C
 * Kullanici onayi (30.07): "fiyatli cikti standart 9 kolon olsun, musterinin
 * sablonuna yazmayi birak."
 *
 * ONCE KIRMIZI: `standartCiktiUret` HENUZ YOK.
 * Kosum: npm run test:ex
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { standartCiktiUret, STANDART_CIKTI_KOLONLARI } from '../src/quotes/standart-cikti';
import { ExcelGridService } from '../src/modules/excel-grid/excel-grid.service';

let pass = 0; let fail = 0;
const check = (ad: string, kosul: boolean, kanit = '') => {
  if (kosul) { pass++; console.log(`PASS: ${ad}${kanit ? ' — ' + kanit : ''}`); }
  else { fail++; console.log(`FAIL: ${ad}${kanit ? ' — ' + kanit : ''}`); }
};

/** Grid'in kaydettigi bicimde iki sayfalik teklif (sabit sema alanlari). */
const SHEETS = [
  {
    name: 'SIHHİ',
    isEmpty: false,
    rowData: [
      { _rowIdx: 0, _isHeaderRow: true, _ad: 'CİNSİ TANIMI' },
      { _rowIdx: 1, _isDataRow: true, _no: '1', _ad: 'Galvaniz Çelik Boru ½"', _miktar: 6, _birim: 'mt.',
        _malzKar: 10, _marka: 'ÇAYIROVA', _matBirim: '80.5', _matToplam: '483', _iscKar: 5,
        _firma: 'ACME İnşaat', _labBirim: '550', _labToplam: '3300', _toplam: '3783' },
      { _rowIdx: 2, _isDataRow: true, _no: '2', _ad: 'Galvaniz Çelik Boru ¾"', _miktar: 565, _birim: 'mt.',
        _malzKar: 10, _marka: 'ÇAYIROVA', _matBirim: '96.1', _matToplam: '54296.5', _iscKar: 5,
        _firma: 'ACME İnşaat', _labBirim: '600', _labToplam: '339000', _toplam: '393296.5' },
      { _rowIdx: 3, _isDataRow: false, _ad: 'Onay : UL Listeli, FM Onaylı' },
    ],
  },
  {
    name: 'İcmal',
    isEmpty: false,
    isOzet: true,
    rowData: [
      { _rowIdx: 0, _isDataRow: true, _ozet: true, _no: '1', _ad: 'Yangın Pompası', _toplam: 270850 },
    ],
  },
];

async function main() {
  // ══ GERCEK DOSYA: SAHINKUL uctan uca (parse → standart cikti) ═════════
  // Eski sablon-yazicisi (writePricesToWorkbook) SILINMEDEN ONCE yeni
  // yazicinin GERCEK dosyayla kapsami guclendirildi (T4 protokolu).
  {
    const FIX = path.resolve(__dirname, '../../test-fixtures/e2e');
    const katla = (x: string) => x.normalize('NFC')
      .replace(/[İIı]/g, 'i').replace(/[Şş]/g, 's').replace(/[Ğğ]/g, 'g')
      .replace(/[Üü]/g, 'u').replace(/[Öö]/g, 'o').replace(/[Çç]/g, 'c').toLowerCase();
    const dosyaAdi = fs.readdirSync(FIX).find((x) => katla(x).includes(katla('kesif ozeti 251224')));
    if (!dosyaAdi) {
      check('GERÇEK DOSYA fixture bulundu', false, 'ŞAHİNKUL yok');
    } else {
      const svc = new ExcelGridService({ brand: { findMany: async () => [] } } as any);
      const parsed = await svc.prepare(fs.readFileSync(path.join(FIX, dosyaAdi)), { fixedSchema: true });
      const r = await standartCiktiUret({ sheetsArr: parsed.sheets as any, birim: null });
      const wbG = new ExcelJS.Workbook();
      let acildi = true; let h = '';
      try { await wbG.xlsx.load(r.buffer as any); } catch (e: any) { acildi = false; h = e?.message ?? 'hata'; }
      check('EX5/GERÇEK ŞAHİNKUL çıktısı round-trip okunur', acildi, h);

      // GS14c: TEK HESAP MODULU (Kapatma Turu ADIM 5) — ekrandaki toplam ile
      // ciktidaki toplam AYNI kaynaktan gelmeli. Grid'in pinned-bottom kurali
      // (ExcelGrid.updatePinnedBottom): ozet satirlari HARIC, matToplam+labToplam.
      // Ikinci bir hesap yolu eklenirse (yuvarlama/kapsam farki) burasi kirilir.
      {
        let gridToplam = 0;
        for (const sh of parsed.sheets as any[]) {
          for (const row of (sh.rowData ?? []) as any[]) {
            if (!row._isDataRow || row._ozet) continue;
            gridToplam += (parseFloat(String(row._matToplam ?? '')) || 0)
              + (parseFloat(String(row._labToplam ?? '')) || 0);
          }
        }
        check('GS14c tek hesap modülü — grid toplamı ile çıktı toplamı BİREBİR aynı',
          Math.abs(gridToplam - r.genelToplam) < 0.01,
          `grid=${gridToplam.toFixed(2)} · çıktı=${r.genelToplam.toFixed(2)} · fark=${(gridToplam - r.genelToplam).toFixed(2)}`);
      }

      if (acildi) {
        const sapan = wbG.worksheets.filter((w) => w.name !== 'GENEL TOPLAM').filter((w) => {
          const b: string[] = [];
          w.getRow(1).eachCell({ includeEmpty: false }, (c) => b.push(String(c.value ?? '').trim()));
          return JSON.stringify(b) !== JSON.stringify(STANDART_CIKTI_KOLONLARI);
        }).map((w) => w.name);
        check('EX1/GERÇEK her sayfa 9 standart kolon', sapan.length === 0,
          sapan.length ? `sapan: ${sapan.join(', ')}` : `${wbG.worksheets.length - 1} sayfa uyumlu`);

        const yasak = /malz\.\s*kar|i̇şç\.\s*kar|malz\.\s*marka|i̇şç\.\s*firma/i;
        const sizinti: string[] = [];
        for (const w of wbG.worksheets) w.eachRow({ includeEmpty: false }, (row, rn) => {
          row.eachCell({ includeEmpty: false }, (c, cn) => {
            if (yasak.test(String(c.value ?? ''))) sizinti.push(`${w.name}!R${rn}C${cn}`);
          });
        });
        check('EX1b/GERÇEK kâr ve marka/firma sızıntısı yok', sizinti.length === 0,
          sizinti.slice(0, 3).join(' ') || 'sızıntı yok');

        let iscDolu = 0;
        for (const w of wbG.worksheets) {
          if (w.name === 'GENEL TOPLAM') continue;
          w.eachRow({ includeEmpty: false }, (row, rn) => {
            if (rn === 1) return;
            if (typeof row.getCell(7).value === 'number') iscDolu++;
          });
        }
        check('MF6/GERÇEK dosyanın işçilik fiyatları çıktıda korundu', iscDolu >= 80,
          `İşç. Birim Fiyat dolu hücre=${iscDolu}`);

        const ozetSayfalar = (parsed.sheets as any[]).filter((x) => x.isOzet).map((x) => x.name);
        check('KARAR/GERÇEK özet sayfa toplama dahil değil',
          ozetSayfalar.length > 0 && r.genelToplam > 0,
          `özet=${ozetSayfalar.join(',')} genelToplam=${r.genelToplam.toFixed(0)}`);
      }
    }
  }

  console.log('\n══════ EX1-EX8: STANDART ÇIKTI ══════\n');
  const sonuc = await standartCiktiUret({ sheetsArr: SHEETS as any, birim: null });
  const buf = sonuc.buffer;

  // EX5: bagimsiz kutuphaneyle round-trip okunur ("Onarıldı" yasagi)
  const wb = new ExcelJS.Workbook();
  let okundu = true; let hata = '';
  try { await wb.xlsx.load(buf as any); } catch (e: any) { okundu = false; hata = e?.message ?? 'hata'; }
  check('EX5 üretilen dosya bağımsız round-trip ile okunur (yapı sağlam)', okundu, hata);
  if (!okundu) { console.log(`\nSTANDART CIKTI: ${pass} PASS, ${fail} FAIL`); process.exit(1); }

  // EX1: 9 kolon, PRD sirasiyla
  const ws = wb.getWorksheet('SIHHİ')!;
  const basliklar: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: false }, (c) => basliklar.push(String(c.value ?? '').trim()));
  check('EX1 çıktı 9 standart kolon, PRD sırasıyla',
    JSON.stringify(basliklar) === JSON.stringify(STANDART_CIKTI_KOLONLARI),
    `[${basliklar.join(' | ')}]`);

  // EX1: kar ve marka/firma HICBIR YERDE yok (sizinti kontrolu)
  {
    const yasak = /çayırova|acme|kar\s*%|malz\.\s*kar|i̇şç\.\s*kar|marka|firma/i;
    const bulunan: string[] = [];
    for (const sheet of wb.worksheets) {
      sheet.eachRow({ includeEmpty: false }, (row, rn) => {
        row.eachCell({ includeEmpty: false }, (cell, cn) => {
          const t = String(cell.value ?? '');
          if (yasak.test(t)) bulunan.push(`${sheet.name}!R${rn}C${cn}="${t.slice(0, 24)}"`);
        });
      });
    }
    check('EX1b kâr oranı ve marka/firma çıktıda HİÇBİR yerde yok',
      bulunan.length === 0, bulunan.slice(0, 3).join(' · ') || 'sızıntı yok');
  }

  // EX2: kar fiyatin ICINDE — birim fiyat grid degeriyle AYNI
  {
    const satir = ws.getRow(2);
    const birimFiyat = Number(satir.getCell(5).value);
    check('EX2 birim fiyat grid’deki satış fiyatıyla aynı (kâr içeride)',
      Math.abs(birimFiyat - 80.5) < 0.01, `çıktı=${birimFiyat} grid=80.5`);
  }

  // EX3: sayfa alti toplam satiri + ekranla ayni
  {
    let toplamSatiri: any = null;
    ws.eachRow({ includeEmpty: false }, (row) => {
      if (/toplam/i.test(String(row.getCell(2).value ?? ''))) toplamSatiri = row;
    });
    const matToplam = toplamSatiri ? Number(toplamSatiri.getCell(6).value) : 0;
    check('EX3 sayfa altı toplam satırı var ve doğru (483 + 54.296,5)',
      !!toplamSatiri && Math.abs(matToplam - 54779.5) < 0.5, `malz. toplam=${matToplam}`);
  }

  // KULLANICI KARARI: ozet sayfa cikti geneli toplamina GIRMEZ
  check('KARAR özet sayfa (İcmal) teklif geneli toplamına dahil edilmedi',
    Math.abs(sonuc.genelToplam - (54779.5 + 342300)) < 1,
    `genelToplam=${sonuc.genelToplam} (özet 270.850 hariç beklenir)`);

  // EX7: gorunur self-check ozeti
  check('EX7 self-check özeti üretildi (n değer aktarıldı · genel toplam)',
    /değer aktarıldı/.test(sonuc.ozet) && /toplam/i.test(sonuc.ozet), sonuc.ozet);

  // EX6: para birimi — USD secildiginde tek kur + not
  {
    const usd = await standartCiktiUret({
      sheetsArr: SHEETS as any,
      birim: { kod: 'USD', katsayi: 1 / 47.41, not: 'Fiyatlar USD — 1 USD = ₺47,41 (TCMB, 30.07.2026)' },
    });
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(usd.buffer as any);
    const ws2 = wb2.getWorksheet('SIHHİ')!;
    const birimFiyat = Number(ws2.getRow(2).getCell(5).value);
    let notVar = false;
    for (const sheet of wb2.worksheets) sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (c) => { if (/1 USD = ₺/.test(String(c.value ?? ''))) notVar = true; });
    });
    check('EX6 USD çıktıda değerler tek kurla çevrildi + kur notu var',
      Math.abs(birimFiyat - 80.5 / 47.41) < 0.01 && notVar,
      `birim=${birimFiyat} beklenen=${(80.5 / 47.41).toFixed(2)} kurNotu=${notVar}`);
  }

  // EX4: sistem formul ICAT ETMEZ — veri satirlarinda formul yok
  {
    let formullu = 0;
    ws.eachRow({ includeEmpty: false }, (row, rn) => {
      if (rn === 1) return;
      row.eachCell({ includeEmpty: false }, (c) => {
        if (c.value && typeof c.value === 'object' && (c.value as any).formula) formullu++;
      });
    });
    check('EX4 veri satırlarında sistem-icadı formül yok (hesaplanmış değer)',
      formullu === 0, `formüllü hücre=${formullu}`);
  }

  // ══ KAPATMA TURU ADIM 4: SILME SIRASINDA KAYBOLAN KANIT ═══════════════
  // T1/T3/T4 temizliginde `test:ke` + `test:kb` paketleri silinirken KE17 ve
  // KF7'nin kaniti da gitti. O iki kriter eskiden TEK assert'i paylasiyordu
  // (KE17'nin hic kendi assert'i olmamis, KF7'ninkine yamanmisti) — tek assert
  // silinince ikisi birden kanitsiz kaldi. Bu yuzden burada AYRI AYRI yazilir.

  // ── KE17: harita persist — ayni teklif iki kez aktarilinca BIREBIR ayni ──
  {
    const oku = async (buf: Buffer) => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as any);
      const iz: string[] = [];
      wb.worksheets.forEach((w) => {
        w.eachRow({ includeEmpty: false }, (row, rn) => {
          const h: string[] = [];
          row.eachCell({ includeEmpty: false }, (c, ci) => {
            const v = c.value as any;
            h.push(`${ci}:${v && typeof v === 'object' && v.result !== undefined ? v.result : String(v ?? '')}`);
          });
          iz.push(`${w.name}!R${rn} ${h.join('|')}`);
        });
      });
      return iz.join('\n');
    };
    const a = await standartCiktiUret({ sheetsArr: SHEETS as any, birim: null });
    const b = await standartCiktiUret({ sheetsArr: JSON.parse(JSON.stringify(SHEETS)), birim: null });
    const izA = await oku(a.buffer); const izB = await oku(b.buffer);
    const ilkFark = izA === izB ? '' : (izA.split('\n').find((s, i) => s !== izB.split('\n')[i]) ?? 'satır sayısı farklı');
    check('KE17 aynı teklif iki kez dışa aktarılınca BİREBİR aynı (harita persist)',
      izA === izB && a.ozet === b.ozet && a.genelToplam === b.genelToplam,
      izA === izB ? `${izA.split('\n').length} satır birebir · özet aynı` : `İLK FARK: ${ilkFark.slice(0, 90)}`);
  }

  // ── KF7: TEK doldurma motoru — her sayfa ayni yazicidan cikar ────────────
  // Ikinci bir yazici eklenirse (eski `writePricesToWorkbook` hatasi) sayfalar
  // arasinda baslik/genislik imzasi ayrisir; bu kontrol onu yakalar.
  {
    const r = await standartCiktiUret({ sheetsArr: SHEETS as any, birim: null });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.buffer as any);
    // Olcut VERI sayfalari icindir; uretilen ozet/toplam sayfasinin duzeni
    // bilerek farklidir (kendi basligi var, `standartSayfaYaz` kullanmaz).
    const imzalar = wb.worksheets
      .filter((w) => String(w.getRow(1).getCell(1).value ?? '').trim() === 'No')
      .map((w) => {
        const bas: string[] = [];
        w.getRow(1).eachCell({ includeEmpty: false }, (c) => bas.push(String(c.value ?? '').trim()));
        const gen = (w.columns ?? []).map((c: any) => c?.width ?? '-').join(',');
        return `${bas.join('|')}##${gen}`;
      });
    const tekil = Array.from(new Set(imzalar));
    check('KF7 tek doldurma motoru — TÜM veri sayfaları aynı başlık+genişlik imzası',
      imzalar.length >= 2 && tekil.length === 1,
      `veri sayfası=${imzalar.length}/${wb.worksheets.length}, farklı imza=${tekil.length}${tekil.length > 1 ? ' → ' + tekil.map((s) => s.slice(0, 40)).join(' ≠ ') : ''}`);
    check('KF7b başlık imzası standart 9 kolon',
      tekil.length === 1 && tekil[0].split('##')[0] === STANDART_CIKTI_KOLONLARI.join('|'),
      tekil[0]?.split('##')[0]?.slice(0, 90) ?? '');
  }

  // ── KF6: SELF-CHECK — "eksik = 0" gorunur sekilde dogrulanir ────────────
  // (Kapatma Turu ADIM 5) KF6'nin hicbir otomatik testi yoktu; kaynakta yalniz
  // yorum satiri vardi (main.ts:56 · quotes.controller.ts:79/98). Cekirdek sart:
  // girdideki HER fiyat degeri ciktida bulunur ve ozet bunu SAYIYLA soyler.
  {
    const r = await standartCiktiUret({ sheetsArr: SHEETS as any, birim: null });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.buffer as any);
    const tumDegerler: number[] = [];
    wb.worksheets.forEach((w) => w.eachRow({ includeEmpty: false }, (row) =>
      row.eachCell({ includeEmpty: false }, (c) => {
        const v = c.value as any;
        const n = typeof v === 'number' ? v : (v && typeof v === 'object' && typeof v.result === 'number' ? v.result : NaN);
        if (!isNaN(n)) tumDegerler.push(n);
      })));
    const beklenen: { alan: string; deger: number }[] = [];
    for (const sh of SHEETS) {
      for (const r2 of sh.rowData as any[]) {
        if (!r2._isDataRow || r2._ozet) continue;
        for (const alan of ['_matBirim', '_matToplam', '_labBirim', '_labToplam']) {
          const v = parseFloat(String(r2[alan] ?? ''));
          if (!isNaN(v) && v !== 0) beklenen.push({ alan: `${sh.name}.${alan}`, deger: v });
        }
      }
    }
    const eksik = beklenen.filter((b) => !tumDegerler.some((v) => Math.abs(v - b.deger) < 0.005));
    check('KF6 self-check: girdideki her fiyat değeri çıktıda var (eksik=0)',
      beklenen.length >= 8 && eksik.length === 0,
      `beklenen=${beklenen.length}, eksik=${eksik.length}${eksik.length ? ' → ' + eksik.slice(0, 3).map((e) => `${e.alan}=${e.deger}`).join(', ') : ''}`);
    check('KF6b self-check özeti aktarılan değer SAYISINI taşır',
      /\d+\s*değer aktarıldı/.test(r.ozet) && r.yazilan > 0,
      `ozet="${r.ozet.slice(0, 60)}" · yazilan=${r.yazilan}`);
  }

  console.log(`\n${'='.repeat(60)}\nSTANDART CIKTI: ${pass} PASS, ${fail} FAIL\n${'='.repeat(60)}`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
