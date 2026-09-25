/* STANDART CIKTI — EX1-EX8 KABUL TESTLERI
 * PRD: PRD_Standart_Grid_Semasi_ve_Aday_Ayirt_Edicilik.md §Bolum C
 * Kullanici onayi (30.07): "fiyatli cikti standart 9 kolon olsun, musterinin
 * sablonuna yazmayi birak."
 *
 * 23.09 YENI TASARIM (Emre: "indirdiğimiz excel dökümanının tasarımına göre
 * düzenle"): ilk sekme GENEL TOPLAM, her sayfada 3 satirlik baslik blogu
 * (tablo basligi 4. satirda), kalemsiz sayfa duz METIN, satirlarda FORMUL.
 *  · EX4 ("sistem formul icat etmez") tarifle KALDIRILDI → EX4b: tutar hucresi
 *    formul + onbellegi formulun gercek sonucu (Korumali Gorunum = duzenleme modu).
 *  · YT blogu: tarifin kurallari + olculmus kenar durumlari (goturu, fitting,
 *    bos toplam, ters miktar/birim, tirnakli sayfa adi, antet, doviz, dil).
 *
 * Kosum: npm run test:ex
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { standartCiktiUret, STANDART_CIKTI_KOLONLARI } from '../src/ozellik/teklif/quotes/standart-cikti';
import { ExcelGridService } from '../src/ozellik/giris/excel-grid/excel-grid.service';
import { formulDegerlendir, formulDenetimi } from './cikti-test-yardimci';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

// Ekranin TEK hesap modulu — "ekran toplami" beklentisinin kaynagi (kd11/hesap ile ayni yol)
const FE = require('../../frontend/ozellik/fiyat/pricing');
const { sayiOku } = require('../../frontend/ozellik/fiyat/sayi-alani');
const K = (v: number): number => FE.kurusTamsayi(v);

let pass = 0; let fail = 0;
const check = (ad: string, kosul: boolean, kanit = '') => {
  if (kosul) { pass++; console.log(`PASS: ${ad}${kanit ? ' — ' + kanit : ''}`); }
  else { fail++; console.log(`FAIL: ${ad}${kanit ? ' — ' + kanit : ''}`); }
};

/** Antetsiz duzende tablo basligi 4. satir, veri 5'ten (tarif §2). */
const BASLIK = 4;
const TARIH = new Date('2026-09-23T10:00:00Z');

const ac = async (buf: Buffer | ArrayBuffer): Promise<ExcelJS.Workbook> => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  return wb;
};
/** Satirin hucre metinleri (bos olmayanlar) — basliklar icin. */
const satirMetinleri = (ws: ExcelJS.Worksheet, r: number): string[] => {
  const l: string[] = [];
  ws.getRow(r).eachCell({ includeEmpty: false }, (c) => l.push(String(c.value ?? '').trim()));
  return l;
};
/** B kolonunda metni ARANAN ilk satir (yoksa 0). */
const satirBul = (ws: ExcelJS.Worksheet, metin: string, kolon = 2): number => {
  let n = 0;
  ws.eachRow({ includeEmpty: false }, (row, rn) => { if (!n && String(row.getCell(kolon).value ?? '').trim() === metin) n = rn; });
  return n;
};
/** Hucrenin sayisal icerigi: deger ya da formul onbellegi (yoksa NaN). */
const sayisal = (v: any): number => (typeof v === 'number' ? v : v && typeof v === 'object' && typeof v.result === 'number' ? v.result : NaN);
const formulu = (v: any): string => (v && typeof v === 'object' && typeof v.formula === 'string' ? v.formula : '');

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

/** Tarif §1 kalem sayfasi olcutu (test tarafinda BAGIMSIZ yazilir): ozet olmayan veri
 *  satiri + sayisal miktar (ya da ters kayitta birim hucresinde sayi) ya da para. */
const kalemVar = (sh: any): boolean => (sh.rowData ?? []).some((r: any) => {
  if (!r?._isDataRow || r._ozet || r._isHeaderRow) return false;
  const s = (v: unknown): number | null => sayiOku(v);
  const para = ['_matBirim', '_matToplam', '_labBirim', '_labToplam'].some((k) => (s(r[k]) ?? 0) !== 0);
  return s(r._miktar) !== null || s(r._birim) !== null || para;
});

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
      let acildi = true; let h = ''; let wbG: ExcelJS.Workbook | null = null;
      try { wbG = await ac(r.buffer); } catch (e: any) { acildi = false; h = e?.message ?? 'hata'; }
      check('EX5/GERÇEK ŞAHİNKUL çıktısı round-trip okunur', acildi, h);

      // GS14c: TEK HESAP MODULU (Kapatma Turu ADIM 5) — ekrandaki toplam ile
      // ciktidaki toplam AYNI kurali izlemeli. EKRAN = ice aktarmada bos
      // toplamlari tamamlayan yol (`toplamlariTamamla`, dashboard) + sayfa
      // toplami (`sayfaToplamlari`: ozet satiri HARIC, kurus-tam).
      // ⚠ 23.09: eski olcut HAM ayristirmayi topluyordu (bos toplam = 0) — ekran
      // oyle gostermez; yeni formul bos toplami ekranin kuraliyla (ceil1) tamamlar.
      // Yazici IKI girdiyle de ayni rakami vermeli: ham (bos toplamli) ve tamamlanmis.
      {
        const tamam = JSON.parse(JSON.stringify(parsed.sheets));
        let ekranK = 0;
        for (const sh of tamam as any[]) {
          FE.toplamlariTamamla(sh.rowData ?? [], sh.columnRoles ?? {});
          const o = FE.sayfaToplamlari(sh.rowData ?? [], sh.columnRoles ?? {});
          ekranK += K(o.matToplam) + K(o.labToplam);
        }
        const rTamam = await standartCiktiUret({ sheetsArr: tamam, birim: null });
        check('GS14c tek hesap modülü — ekran toplamı = çıktı toplamı, kuruşu kuruşuna (ham VE tamamlanmış girdi)',
          K(r.genelToplam) === ekranK && K(rTamam.genelToplam) === ekranK && r.yenidenHesaplanan === 0,
          `ekran=${(ekranK / 100).toFixed(2)} · çıktı(ham)=${r.genelToplam.toFixed(2)} · çıktı(tamam)=${rTamam.genelToplam.toFixed(2)} · yeniden=${r.yenidenHesaplanan}`);
      }

      if (wbG) {
        // EX1/GERCEK: kalem sayfasi 9 standart kolon (4. satir); kalemsiz sayfa METIN (tarif §1)
        const sapan: string[] = []; let kalemSayfa = 0; let metinSayfa = 0;
        for (const sh of (parsed.sheets as any[]).filter((s) => !s.isEmpty)) {
          const w = wbG.getWorksheet(sh.name);
          if (!w) { sapan.push(`${sh.name}: yok`); continue; }
          if (kalemVar(sh)) {
            kalemSayfa++;
            if (JSON.stringify(satirMetinleri(w, BASLIK)) !== JSON.stringify(STANDART_CIKTI_KOLONLARI)) sapan.push(`${sh.name}: başlık`);
          } else {
            metinSayfa++;
            if (satirBul(w, 'SAYFA TOPLAMI') || w.columnCount > 3) sapan.push(`${sh.name}: metin sayfası değil`);
          }
        }
        check('EX1/GERÇEK kalem sayfası 9 standart kolon, kalemsiz sayfa metin', sapan.length === 0 && kalemSayfa > 0,
          sapan.length ? `sapan: ${sapan.join(', ')}` : `${kalemSayfa} kalem · ${metinSayfa} metin sayfası uyumlu`);

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
            if (rn <= BASLIK) return;
            if (typeof row.getCell(7).value === 'number') iscDolu++;
          });
        }
        check('MF6/GERÇEK dosyanın işçilik fiyatları çıktıda korundu', iscDolu >= 80,
          `İşç. Birim Fiyat dolu hücre=${iscDolu}`);

        const ozetSayfalar = (parsed.sheets as any[]).filter((x) => x.isOzet).map((x) => x.name);
        check('KARAR/GERÇEK özet sayfa toplama dahil değil',
          ozetSayfalar.length > 0 && r.genelToplam > 0,
          `özet=${ozetSayfalar.join(',')} genelToplam=${r.genelToplam.toFixed(0)}`);

        const fd = formulDenetimi(wbG);
        check('EX4b/GERÇEK her formülün önbelleği = hücrelerden yeniden hesap (Korumalı Görünüm = düzenleme modu)',
          fd.sayi > 100 && fd.sorun.length === 0, `formül=${fd.sayi} sorun=${fd.sorun.slice(0, 2).join(' | ')}`);
      }
    }
  }

  console.log('\n══════ EX1-EX8: STANDART ÇIKTI ══════\n');
  const sonuc = await standartCiktiUret({ sheetsArr: SHEETS as any, birim: null, tarih: TARIH });
  const buf = sonuc.buffer;

  // EX5: bagimsiz kutuphaneyle round-trip okunur ("Onarıldı" yasagi)
  let wb: ExcelJS.Workbook;
  try { wb = await ac(buf); } catch (e: any) {
    check('EX5 üretilen dosya bağımsız round-trip ile okunur (yapı sağlam)', false, e?.message ?? 'hata');
    console.log(`\nSTANDART CIKTI: ${pass} PASS, ${fail} FAIL`); process.exit(1);
  }
  check('EX5 üretilen dosya bağımsız round-trip ile okunur (yapı sağlam)', true);

  // EX1: 9 kolon, PRD sirasiyla — tablo basligi 4. satirda (baslik blogunun altinda)
  const ws = wb.getWorksheet('SIHHİ')!;
  const basliklar = satirMetinleri(ws, BASLIK);
  check('EX1 çıktı 9 standart kolon, PRD sırasıyla (4. satır)',
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
    const r1 = satirBul(ws, 'Galvaniz Çelik Boru ½"');
    const birimFiyat = r1 ? Number(ws.getRow(r1).getCell(5).value) : NaN;
    check('EX2 birim fiyat grid’deki satış fiyatıyla aynı (kâr içeride)',
      Math.abs(birimFiyat - 80.5) < 0.01, `satır=${r1} çıktı=${birimFiyat} grid=80.5`);
  }

  // EX3: sayfa alti toplam satiri + ekranla ayni — FORMUL, hucrelerden yeniden hesaplanir
  {
    const t = satirBul(ws, 'SAYFA TOPLAMI');
    const f = t ? ws.getRow(t).getCell(6).value : null;
    const hesap = t ? formulDegerlendir(wb, 'SIHHİ', formulu(f)) : { e: 'yok' };
    check('EX3 sayfa altı toplam satırı var ve doğru (483 + 54.296,5) — formül + önbellek',
      !!t && Math.abs(sayisal(f) - 54779.5) < 0.005 && hesap.v !== undefined && K(hesap.v) === K(54779.5),
      `satır=${t} formül=${formulu(f)} önbellek=${sayisal(f)} yeniden hesap=${hesap.v ?? hesap.e}`);
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
    const wb2 = await ac(usd.buffer);
    const ws2 = wb2.getWorksheet('SIHHİ')!;
    const r1 = satirBul(ws2, 'Galvaniz Çelik Boru ½"');
    const birimFiyat = r1 ? Number(ws2.getRow(r1).getCell(5).value) : NaN;
    let notVar = false;
    for (const sheet of wb2.worksheets) sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (c) => { if (/1 USD = ₺/.test(String(c.value ?? ''))) notVar = true; });
    });
    check('EX6 USD çıktıda değerler tek kurla çevrildi + kur notu var',
      Math.abs(birimFiyat - 80.5 / 47.41) < 0.01 && notVar,
      `birim=${birimFiyat} beklenen=${(80.5 / 47.41).toFixed(2)} kurNotu=${notVar}`);
  }

  // EX4b (23.09 — EX4 "formul icat etmez" TARIFLE KALDIRILDI): tutar hucreleri
  // FORMUL (F = C×E, H = C×G, I = F+H) ve her formulun onbellegi hucrelerden
  // yeniden hesapla AYNI — Korumali Gorunum ile duzenleme modu ayni rakam.
  {
    const r1 = satirBul(ws, 'Galvaniz Çelik Boru ½"');
    const satir = ws.getRow(r1);
    const f = formulu(satir.getCell(6).value); const hh = formulu(satir.getCell(8).value); const i = formulu(satir.getCell(9).value);
    const fd = formulDenetimi(wb);
    check('EX4b tutar hücreleri formül (F=C×E, H=C×G, I=F+H) + önbellekleri doğru',
      f === `IF(E${r1}="","",ROUND(C${r1}*E${r1},2))` && hh === `IF(G${r1}="","",ROUND(C${r1}*G${r1},2))`
        && i === `IF(COUNT(F${r1},H${r1})=0,"",SUM(F${r1},H${r1}))`
        && sayisal(satir.getCell(6).value) === 483 && sayisal(satir.getCell(8).value) === 3300 && sayisal(satir.getCell(9).value) === 3783
        && fd.sorun.length === 0,
      `F=${f} H=${hh} I=${i} denetim=${fd.sorun.slice(0, 2).join(' | ') || `${fd.sayi} formül temiz`}`);
  }

  // ══ KAPATMA TURU ADIM 4: SILME SIRASINDA KAYBOLAN KANIT ═══════════════
  // T1/T3/T4 temizliginde `test:ke` + `test:kb` paketleri silinirken KE17 ve
  // KF7'nin kaniti da gitti. O iki kriter eskiden TEK assert'i paylasiyordu
  // (KE17'nin hic kendi assert'i olmamis, KF7'ninkine yamanmisti) — tek assert
  // silinince ikisi birden kanitsiz kaldi. Bu yuzden burada AYRI AYRI yazilir.

  // ── KE17: harita persist — ayni teklif iki kez aktarilinca BIREBIR ayni ──
  {
    const oku = async (b: Buffer) => {
      const w0 = await ac(b);
      const iz: string[] = [];
      w0.worksheets.forEach((w) => {
        w.eachRow({ includeEmpty: false }, (row, rn) => {
          const h: string[] = [];
          row.eachCell({ includeEmpty: false }, (c, ci) => {
            const v = c.value as any;
            h.push(`${ci}:${v && typeof v === 'object' && v.formula ? `=${v.formula}→${v.result}` : String(v ?? '')}`);
          });
          iz.push(`${w.name}!R${rn} ${h.join('|')}`);
        });
      });
      return iz.join('\n');
    };
    const a = await standartCiktiUret({ sheetsArr: SHEETS as any, birim: null, tarih: TARIH });
    const b = await standartCiktiUret({ sheetsArr: JSON.parse(JSON.stringify(SHEETS)), birim: null, tarih: TARIH });
    const izA = await oku(a.buffer); const izB = await oku(b.buffer);
    const ilkFark = izA === izB ? '' : (izA.split('\n').find((s, i) => s !== izB.split('\n')[i]) ?? 'satır sayısı farklı');
    check('KE17 aynı teklif iki kez dışa aktarılınca BİREBİR aynı (harita persist)',
      izA === izB && a.ozet === b.ozet && a.genelToplam === b.genelToplam,
      izA === izB ? `${izA.split('\n').length} satır birebir · özet aynı` : `İLK FARK: ${ilkFark.slice(0, 90)}`);
  }

  // ── KF7: TEK doldurma motoru — her KALEM sayfasi ayni yazicidan cikar ────
  // Ikinci bir yazici eklenirse (eski `writePricesToWorkbook` hatasi) sayfalar
  // arasinda baslik/genislik imzasi ayrisir; bu kontrol onu yakalar. GENEL
  // TOPLAM ve metin sayfalari BILEREK farkli duzendedir (tarif §4/§5).
  {
    const ikiKalem = [SHEETS[0], {
      name: 'MEKANİK', isEmpty: false,
      rowData: [
        { _rowIdx: 0, _isDataRow: false, _ad: 'KAT 1' },
        { _rowIdx: 1, _isDataRow: true, _ad: 'Küresel vana DN50', _miktar: 5, _birim: 'ad', _matBirim: '1200.5', _matToplam: '6002.5' },
      ],
    }, SHEETS[1]];
    const r = await standartCiktiUret({ sheetsArr: ikiKalem as any, birim: null });
    const w = await ac(r.buffer);
    const imzalar = w.worksheets
      .filter((x) => String(x.getRow(BASLIK).getCell(1).value ?? '').trim() === 'No')
      .map((x) => `${satirMetinleri(x, BASLIK).join('|')}##${(x.columns ?? []).map((c: any) => c?.width ?? '-').join(',')}`);
    const tekil = Array.from(new Set(imzalar));
    check('KF7 tek doldurma motoru — TÜM kalem sayfaları aynı başlık+genişlik imzası',
      imzalar.length === 2 && tekil.length === 1,
      `kalem sayfası=${imzalar.length}/${w.worksheets.length}, farklı imza=${tekil.length}${tekil.length > 1 ? ' → ' + tekil.map((s) => s.slice(0, 40)).join(' ≠ ') : ''}`);
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
    const w = await ac(r.buffer);
    const tumDegerler: number[] = [];
    w.worksheets.forEach((x) => x.eachRow({ includeEmpty: false }, (row) =>
      row.eachCell({ includeEmpty: false }, (c) => {
        const n = sayisal(c.value);
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

  // ── KE31 (Kar Analizi, 06.08): MUSTERIYE GIDEN CIKTIDA KAR GORUNMEZ ────
  // Kar satiri FE'de PINNED yasar (rowData disinda) — kayda ve dolayisiyla
  // ciktiya YAPISAL olarak giremez. Bu assert o yapisal garantinin uzerine
  // ACIK bir taramadir: gelecekte biri kar satirini ciktiya "ekleyiverirse"
  // buradan kirmizi doner. (Format-yolu icin ayrica: format-engine'in sayisal
  // etiket listesi sabittir ve KAR icermez — format-engine.ts:20.)
  {
    const kSonuc = await standartCiktiUret({ sheetsArr: SHEETS as any, birim: null });
    const kWb = await ac(kSonuc.buffer);
    const karHucreleri: string[] = [];
    kWb.worksheets.forEach((w) => w.eachRow({ includeEmpty: false }, (row, ri) =>
      row.eachCell({ includeEmpty: false }, (c, ci) => {
        const metin = typeof c.value === 'string' ? c.value : '';
        if (/KÂR|KAR SATIRI|MALZEME KARI|ISCILIK KARI|TOPLAM KARI?\b/i.test(metin)) {
          karHucreleri.push(`${w.name}!${ri}:${ci} "${metin.slice(0, 30)}"`);
        }
      })));
    check('KE31: musteriye giden ciktida KAR etiketi YOK',
      karHucreleri.length === 0,
      karHucreleri.slice(0, 3).join(' · ') || 'temiz');
  }

  await yeniTasarim();

  console.log(`\n${'='.repeat(60)}\nSTANDART CIKTI: ${pass} PASS, ${fail} FAIL\n${'='.repeat(60)}`);
  process.exitCode = fail > 0 ? 1 : 0;
}
// ════════════════════════════════════════════════════════════════════
// YT — YENI TASARIM (23.09.2026): tarifin kurallari + OLCULMUS kenar durumlari.
// Beklenen degerler ekranin TEK hesap modulunden (FE.sayfaToplamlari) ya da
// elle hesaplanmis sabitlerden gelir; formuller BAGIMSIZ degerlendiriciyle
// (cikti-test-yardimci) hucrelerden yeniden hesaplanir — motorun kendi
// matDeger'i olcut DEGIL (dairesel olcut yasagi).
// ════════════════════════════════════════════════════════════════════
const ROL = {
  noField: '_no', nameField: '_ad', quantityField: '_miktar', unitField: '_birim',
  materialUnitPriceField: '_matBirim', materialTotalField: '_matToplam',
  laborUnitPriceField: '_labBirim', laborTotalField: '_labToplam', grandTotalField: '_toplam',
};
const veri = (i: number, ad: string, miktar: unknown, mB = '', mT = '', lB = '', lT = '', ek: any = {}) => ({
  _rowIdx: i, _isDataRow: true, _no: '', _ad: ad, _miktar: miktar, _birim: 'ad',
  _matBirim: mB, _matToplam: mT, _labBirim: lB, _labToplam: lT, ...ek,
});
const metin = (i: number, ad: string) => ({ _rowIdx: i, _isDataRow: false, _ad: ad });

function ytTeklifi(): any[] {
  return [
    { name: 'Mekanik', isEmpty: false, columnRoles: ROL, rowData: [
      { _rowIdx: 0, _isHeaderRow: true, _isDataRow: false, _ad: 'Malzeme Adı' },
      metin(1, 'YAT ÜRETİM TESİSİ YSS'),
      metin(2, 'YAT ÜRETİM TESİSİ YSS'), // kaynaktaki birlesik hucre → teke iner
      metin(3, 'Pompa Dairesi'),
      veri(4, 'Boru 1"', 100, '152.3', '15230', '25', '2500'),
      veri(5, 'Flow Swich', 2, '', '', '23', '23'), // dosya toplami carpimla TUTMUYOR → Excel 46
      veri(6, 'Götürü montaj', '', '', '5000'), // miktarsiz para → kalem, DEGER
      veri(7, 'Toplamı boş kalem', 12.35, '147.3', ''), // bos toplam → ekran ceil1: 1.819,20
      veri(8, 'Uygulama yuvarlaması', 7.5, '13.47', '101.1'), // 101,025 → ceil1 101,1
      veri(9, 'Dosya 3 haneli', 1, '10.075', '10.075'), // kurus: 10,08
      veri(10, 'Fiyatsız kalem', 3), // formul yine yazilir, sonuc ""
      veri(11, 'ARA TOPLAM', '', '', '26941.18', '', '2523', { _ozet: true }),
      veri(12, 'Küresel vana DN50', 5, '1200.55', '6002.75'),
      // Fitting: kapsam 6.002,75 × %35 → ceil1(2.100,9625) = 2.101,0; birim ceil1(60,0275) = 60,1
      // (35 × 60,1 = 2.103,5 — C×E formulu dogru satiri BOZARDI)
      veri(13, 'Fitting', 35, '60.1', '2101', '', '', { _birim: '%', _fitting: { kapsam: [12] } }),
      metin(14, 'Not: Nakliye ve vinç bedeli teklif kapsamında'),
      metin(15, 'değildir.'), // kucuk harf → nota eklenir
      metin(16, 'Sistemin devreye alınması hizmetimiz dahilindedir.'), // son kalemden sonra → not
    ] },
    { name: 'Esaslar', isEmpty: false, columnRoles: ROL, rowData: [
      metin(0, 'TEKLİF ESASLARI'),
      metin(1, 'Montajı tamamlanan sistemler hakkında uygulamalı ve teorik kullanıcı eğitimi tarafımızdan'),
      metin(2, 'verilecektir'),
      metin(3, 'Sistemin kurulumu ve devreye alınması esnasında gerekli su, elektrik temini işveren sorumluluğundadır.'),
      metin(4, "Satış Hükümleri Türk Hukuku'na tabi olup, buradan doğacak her türlü uyuşmazlık Türkiye"),
      metin(5, 'Cumhuriyeti İstanbul Mahkemeleri tarafından çözülecektir.'),
      metin(6, '8"'),
      veri(7, 'İcmal satırı', '', '', '99999', '', '', { _ozet: true }), // metin sayfasinda tutar YAZILMAZ
    ] },
    { name: 'Kontrol', isEmpty: false, columnRoles: ROL, rowData: [
      // Tarifin KONTROL TABLOSU: işçilik 46,00 → 52,90 (Flow Swich 2 × 23 = 46; Fitting 0,3 × 23 = 6,90)
      veri(0, "3'' Islak Alarm Vanası", 2, '42488.8', '84977.6'),
      veri(1, "3'' Flow Swich", 2, '', '', '23', '23'),
      veri(2, 'Fitting', 0.3, '', '', '23', '23', { _birim: '' }),
    ] },
  ];
}

/** Ekranin sayfa toplami (kurus): mat, lab. */
const ekranK = (sh: any, oran = 1) => {
  const o = FE.sayfaToplamlari(sh.rowData ?? [], sh.columnRoles ?? {}, oran);
  return { mat: K(o.matToplam), lab: K(o.labToplam) };
};
const hucreKenari = (c: ExcelJS.Cell, yon: 'top' | 'bottom') => {
  const b: any = (c.border as any)?.[yon];
  return b?.style ? `${b.style}:${b.color?.argb ?? ''}` : '';
};
const dolguRengi = (c: ExcelJS.Cell) => ((c.fill as any)?.type === 'pattern' ? (c.fill as any).fgColor?.argb ?? '' : '');

async function yeniTasarim(): Promise<void> {
  console.log('\n══════ YT: YENİ TASARIM (23.09) ══════\n');

  // ── YT0: satir plani (saf fonksiyonlar) ──
  {
    const S = require('../src/ozellik/teklif/quotes/cikti-satirlari');
    const t = S.metinleriTemizle([
      'FİYAT TEKLİFİ', 'FİYAT TEKLİFİ', 'FİYAT TEKLİFİ',
      'Şantiyede çalışacak personellerimizin sosyal ihtiyaçlarının karşılanması şirketimiz',
      'sorumluluğundadır.',
      'Montajı tamamlanan sistemler hakkında uygulamalı ve teorik kullanıcı eğitimi tarafımızdan',
      'verilecektir',
      'Sistemin kurulumu ve devreye alınması esnasında gerekli su, elektrik temini işveren sorumluluğundadır.',
      'a) ilk madde', 'b) ikinci madde',
    ]);
    check('YT0 temizlik: art arda aynı metin teke iner, küçük harfle başlayan satır öncekine eklenir',
      t[0] === 'FİYAT TEKLİFİ' && t[1] === 'Şantiyede çalışacak personellerimizin sosyal ihtiyaçlarının karşılanması şirketimiz sorumluluğundadır.',
      JSON.stringify(t.slice(0, 2)));
    check('YT0 temizlik: "önceki satır" KAYNAKTAKİ satırdır — birleşmiş uzun paragrafa sonraki madde eklenmez (referansla ölçüldü)',
      t[2] === 'Montajı tamamlanan sistemler hakkında uygulamalı ve teorik kullanıcı eğitimi tarafımızdan verilecektir'
        && t[3].startsWith('Sistemin kurulumu'),
      JSON.stringify(t.slice(2, 4)).slice(0, 160));
    check('YT0 temizlik: liste işaretli satır ("a) …") yeni paragraftır, küçük harfle başlasa da eklenmez',
      t[4] === 'a) ilk madde' && t[5] === 'b) ikinci madde' && t.length === 6, JSON.stringify(t.slice(4)));
    check('YT0 "Not" tanıma: Not/NOT:/Notlar evet — Noter/Nota hayır',
      S.notIleBaslar('Not: x') && S.notIleBaslar('NOT: x') && S.notIleBaslar('Notlar') && !S.notIleBaslar('Noter masrafı') && !S.notIleBaslar('Nota'));
    const { tarihMetni } = require('../src/ozellik/teklif/quotes/cikti-stil');
    check('YT0 tarih: çıktının alındığı gün TÜRKİYE saatiyle, gg.aa.yyyy (UTC 22:30 = İstanbul ertesi gün 01:30; tek haneli gün/ay sıfırlı)',
      tarihMetni(new Date('2026-09-23T22:30:00Z')) === '24.09.2026' && tarihMetni(new Date('2026-01-05T08:00:00Z')) === '05.01.2026',
      `${tarihMetni(new Date('2026-09-23T22:30:00Z'))} · ${tarihMetni(new Date('2026-01-05T08:00:00Z'))}`);
    check('YT0 bölüm başlığı: 45 karakterden kısa ve tamamı büyük harf ("8\\"" dahil)',
      S.bolumBasligiMi('TEKLİF ESASLARI') && S.bolumBasligiMi('8"') && !S.bolumBasligiMi('Pompa Dairesi')
        && !S.bolumBasligiMi('ÇOK UZUN BİR BAŞLIK METNİ KIRK BEŞ KARAKTERİ AŞIYOR ELBETTE'));
  }

  const girdi = ytTeklifi();
  const r = await standartCiktiUret({ sheetsArr: girdi, birim: null, baslik: 'Hesap & Kontrol · Müşteri A.Ş.', tarih: TARIH });
  const wb = await ac(r.buffer);
  const mek = wb.getWorksheet('Mekanik')!;
  const esas = wb.getWorksheet('Esaslar')!;
  const kon = wb.getWorksheet('Kontrol')!;
  const gt = wb.getWorksheet('GENEL TOPLAM')!;

  // ── YT1: sekme sirasi ve turleri (tarif §1) ──
  check('YT1 ilk sekme GENEL TOPLAM, ardından kaynak sırası; sekme renkleri özet/kalem/metin',
    JSON.stringify(wb.worksheets.map((w) => w.name)) === JSON.stringify(['GENEL TOPLAM', 'Mekanik', 'Esaslar', 'Kontrol'])
      && (gt.properties.tabColor as any)?.argb === 'FF0F1A31' && (mek.properties.tabColor as any)?.argb === 'FF2563EB'
      && (esas.properties.tabColor as any)?.argb === 'FF94A3B8' && (kon.properties.tabColor as any)?.argb === 'FF2563EB',
    wb.worksheets.map((w) => `${w.name}:${(w.properties.tabColor as any)?.argb}`).join(' '));

  // ── YT2: ortak baslik blogu (tarif §2) ──
  {
    const ust = [1, 2, 3, 4, 5, 6, 7, 8, 9].every((k) => hucreKenari(mek.getRow(3).getCell(k), 'top') === 'medium:FF0F1A31');
    const bas = mek.getRow(4).getCell(1);
    check('YT2 başlık bloğu: 1 teklif adı · 2 sayfa adı + sağda tarih · 3 kalın üst çizgi · 4 lacivert tablo başlığı',
      mek.getRow(1).getCell(1).value === 'Hesap & Kontrol · Müşteri A.Ş.' && mek.getRow(1).height === 24
        && mek.getRow(2).getCell(1).value === 'Mekanik' && mek.getRow(2).getCell(9).value === 'Tarih: 23.09.2026'
        && (mek.getRow(2).getCell(9).alignment as any)?.horizontal === 'right' && mek.getRow(3).height === 8 && ust
        && dolguRengi(bas) === 'FF0F1A31' && (bas.font as any)?.name === 'Arial' && (bas.font as any)?.color?.argb === 'FFFFFFFF'
        && mek.getRow(4).height === 30,
      `A1=${mek.getRow(1).getCell(1).value} I2=${mek.getRow(2).getCell(9).value} üstÇizgi=${ust}`);
    const v: any = mek.views?.[0] ?? {};
    check('YT2 görünüm: kılavuz çizgisi kapalı, bölme C5\'ten dondurulmuş',
      v.state === 'frozen' && v.xSplit === 2 && v.ySplit === 4 && v.topLeftCell === 'C5' && v.showGridLines === false,
      JSON.stringify(v));
  }

  // ── YT3: satir turleri + temizlik (tarif §3) ──
  const satir = (ad: string) => satirBul(mek, ad);
  {
    const araBaslik = satir('YAT ÜRETİM TESİSİ YSS');
    let tekrar = 0; mek.eachRow((row) => { if (row.getCell(2).value === 'YAT ÜRETİM TESİSİ YSS') tekrar++; });
    const dolgulu = [1, 2, 3, 4, 5, 6, 7, 8, 9].every((k) => dolguRengi(mek.getRow(araBaslik).getCell(k)) === 'FFEEF2F7');
    check('YT3 ara başlık: tekrar teke indi, A–I #EEF2F7 dolgu, B kalın lacivert, ilk veri satırı 5',
      araBaslik === 5 && tekrar === 1 && dolgulu && satir('Pompa Dairesi') === 6
        && (mek.getRow(5).getCell(2).font as any)?.bold === true && (mek.getRow(5).getCell(2).font as any)?.color?.argb === 'FF0F1A31',
      `satır=${araBaslik} tekrar=${tekrar} dolgu=${dolgulu}`);
    const notSatiri = satirBul(mek, 'Not: Nakliye ve vinç bedeli teklif kapsamında değildir.');
    const sonNot = satirBul(mek, 'Sistemin devreye alınması hizmetimiz dahilindedir.');
    const birlesik = ((mek.model as any).merges ?? []) as string[];
    check('YT3 not: "Not" ile başlayan + son kalemden sonraki satır B–I birleşik, italik gri; bölünmüş not birleşti',
      notSatiri > 0 && sonNot === notSatiri + 1 && birlesik.includes(`B${notSatiri}:I${notSatiri}`) && birlesik.includes(`B${sonNot}:I${sonNot}`)
        && (mek.getRow(notSatiri).getCell(2).font as any)?.italic === true && (mek.getRow(notSatiri).getCell(2).font as any)?.color?.argb === 'FF64748B',
      `not=${notSatiri} son=${sonNot} birleşik=${birlesik.join(',')}`);
    const nolar = ['Boru 1"', 'Flow Swich', 'Götürü montaj', 'Toplamı boş kalem', 'Uygulama yuvarlaması', 'Dosya 3 haneli', 'Fiyatsız kalem', 'Küresel vana DN50', 'Fitting']
      .map((ad) => mek.getRow(satir(ad)).getCell(1).value);
    check('YT3 No: yalnız kalemlere 1, 2, 3… (ara toplam ve başlıklar numarasız)',
      JSON.stringify(nolar) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9]) && mek.getRow(satir('ARA TOPLAM')).getCell(1).value === null,
      JSON.stringify(nolar));
  }

  // ── YT4: formul ve deger kurallari (kenarYaz) ──
  {
    const hucre = (ad: string, k: number) => mek.getRow(satir(ad)).getCell(k).value as any;
    const n = (ad: string) => satir(ad);
    const b = n('Boru 1"'); const fl = n('Flow Swich'); const tb = n('Toplamı boş kalem'); const uy = n('Uygulama yuvarlaması');
    check('YT4 tutarlı satır: F = IF(E="","",ROUND(C*E,2)), önbellek 15.230',
      hucre('Boru 1"', 6)?.formula === `IF(E${b}="","",ROUND(C${b}*E${b},2))` && sayisal(hucre('Boru 1"', 6)) === 15230,
      JSON.stringify(hucre('Boru 1"', 6)));
    check('YT4 KARAR "Excel yeniden hesaplasın": dosyada 2 × 23 = 23 yazan işçilik → H formülü 46',
      hucre('Flow Swich', 8)?.formula === `IF(G${fl}="","",ROUND(C${fl}*G${fl},2))` && sayisal(hucre('Flow Swich', 8)) === 46
        && hucre('Flow Swich', 5) === null && hucre('Flow Swich', 7) === 23,
      JSON.stringify(hucre('Flow Swich', 8)));
    check('YT4 boş toplam → ekranın tamamlama kuralı (ceil1): ROUNDUP(C*E,1) = 1.819,20 (ROUND 1.819,16 derdi)',
      hucre('Toplamı boş kalem', 6)?.formula === `IF(E${tb}="","",ROUNDUP(C${tb}*E${tb},1))` && sayisal(hucre('Toplamı boş kalem', 6)) === 1819.2,
      JSON.stringify(hucre('Toplamı boş kalem', 6)));
    check('YT4 uygulamanın yuvarladığı kayıtlı toplam (101,1) → ROUNDUP formülü, yeniden hesap SAYILMAZ',
      hucre('Uygulama yuvarlaması', 6)?.formula === `IF(E${uy}="","",ROUNDUP(C${uy}*E${uy},1))` && sayisal(hucre('Uygulama yuvarlaması', 6)) === 101.1,
      JSON.stringify(hucre('Uygulama yuvarlaması', 6)));
    check('YT4 miktar biçimi: tam sayı #,##0 · kesirli #,##0.00; yalnız Genel Toplam kalın',
      String(mek.getRow(b).getCell(3).numFmt) === '#,##0' && String(mek.getRow(uy).getCell(3).numFmt) === '#,##0.00'
        && (mek.getRow(b).getCell(9).font as any)?.bold === true && (mek.getRow(b).getCell(8).font as any)?.bold !== true,
      `C${b}=${mek.getRow(b).getCell(3).numFmt} C${uy}=${mek.getRow(uy).getCell(3).numFmt}`);
    check('YT4 3 haneli dosya birimi TAM hassasiyet (10,075), tutar kuruşa (10,08)',
      hucre('Dosya 3 haneli', 5) === 10.075 && sayisal(hucre('Dosya 3 haneli', 6)) === 10.08, `E=${hucre('Dosya 3 haneli', 5)}`);
    check('YT4 götürü (miktarsız) satır: kalem, tutar DEĞER (formül tutarı silerdi), miktar boş',
      hucre('Götürü montaj', 6) === 5000 && hucre('Götürü montaj', 3) === null && mek.getRow(n('Götürü montaj')).getCell(1).value === 3,
      JSON.stringify(hucre('Götürü montaj', 6)));
    check('YT4 fiyatsız kalem: E/G boş (0 değil), F/H formülü yine yazılı, I boş',
      hucre('Fiyatsız kalem', 5) === null && hucre('Fiyatsız kalem', 7) === null
        && typeof hucre('Fiyatsız kalem', 6)?.formula === 'string' && typeof hucre('Fiyatsız kalem', 8)?.formula === 'string'
        && isNaN(sayisal(hucre('Fiyatsız kalem', 9))),
      JSON.stringify([hucre('Fiyatsız kalem', 5), hucre('Fiyatsız kalem', 6), hucre('Fiyatsız kalem', 9)]));
    check('YT4 fitting satırı: birim gösterim, tutar KAYITLI DEĞER 2.101 (C×E = 2.103,5 olurdu)',
      hucre('Fitting', 6) === 2101 && hucre('Fitting', 5) === 60.1 && hucre('Fitting', 3) === 35 && hucre('Fitting', 4) === '%',
      JSON.stringify([hucre('Fitting', 3), hucre('Fitting', 4), hucre('Fitting', 5), hucre('Fitting', 6)]));
    const oz = n('ARA TOPLAM');
    const f = mek.getRow(satirBul(mek, 'SAYFA TOPLAMI')).getCell(6).value as any;
    check('YT4 ARA TOPLAM (_ozet): görünür, italik; SAYFA TOPLAMI aralığı onu ATLAR (13.09 "3 kat" dersi)',
      hucre('ARA TOPLAM', 6) === 26941.18 && (mek.getRow(oz).getCell(2).font as any)?.italic === true
        && f?.formula === `SUM(F5:F${oz - 1},F${oz + 1}:F${satirBul(mek, 'Sistemin devreye alınması hizmetimiz dahilindedir.')})`,
      `formül=${f?.formula} ara=${oz}`);
  }

  // ── YT5: SAYFA TOPLAMI + ekran paritesi (tarif §3) ──
  {
    const t = satirBul(mek, 'SAYFA TOPLAMI');
    const deg = (k: number) => formulDegerlendir(wb, 'Mekanik', formulu(mek.getRow(t).getCell(k).value));
    const e = ekranK(girdi[0]);
    const matK = K(deg(6).v as number); const labK = K(deg(8).v as number); const genK = K(deg(9).v as number);
    // Ekran: mat 30.264,13 · lab 2.523,00 (Flow Swich dosyadan 23). Excel: lab 2.546 (46) — fark YALNIZ yeniden hesaplanan satir.
    check('YT5 SAYFA TOPLAMI formülü hücrelerden = ekran; tek fark kararla yeniden hesaplanan satır (+23)',
      mek.getRow(t - 1).cellCount === 0 && matK === e.mat && e.mat === 3026413 && labK === e.lab + 2300 && e.lab === 252300
        && genK === matK + labK && sayisal(mek.getRow(t).getCell(9).value) === genK / 100,
      `ekran=${e.mat / 100}/${e.lab / 100} · excel=${matK / 100}/${labK / 100}/${genK / 100}`);
    const c = mek.getRow(t).getCell(6);
    check('YT5 SAYFA TOPLAMI biçimi: #F1F5F9 dolgu, kalın lacivert üst çizgi, Arial 10 kalın, 22 yükseklik',
      dolguRengi(c) === 'FFF1F5F9' && hucreKenari(c, 'top') === 'medium:FF0F1A31' && (c.font as any)?.bold === true && mek.getRow(t).height === 22
        && String(c.numFmt) === '#,##0.00 "₺";-#,##0.00 "₺";"–"');
  }

  // ── YT6: tarifin KONTROL TABLOSU (işçilik 46,00 → 52,90) ──
  {
    const t = satirBul(kon, 'SAYFA TOPLAMI');
    const lab = formulDegerlendir(wb, 'Kontrol', formulu(kon.getRow(t).getCell(8).value));
    const mat = formulDegerlendir(wb, 'Kontrol', formulu(kon.getRow(t).getCell(6).value));
    check('YT6 tarif kontrolü: malzeme 84.977,60 aynı · işçilik ekranda 46,00 → Excel 52,90 (2×23 + 0,3×23)',
      K(mat.v as number) === 8497760 && K(lab.v as number) === 5290 && ekranK(girdi[2]).lab === 4600,
      `mat=${mat.v} lab=${lab.v} ekranLab=${ekranK(girdi[2]).lab / 100}`);
    check('YT6 yeniden hesaplanan satır SAYILIR ve özet SÖYLER (Mekanik 1 + Kontrol 2)',
      r.yenidenHesaplanan === 3 && /3 satırda dosyadaki toplam miktar × birim fiyatla tutmuyordu/.test(r.ozet), r.ozet);
  }

  // ── YT7: metin sayfasi (tarif §4) ──
  {
    const paragraflar: string[] = [];
    esas.eachRow((row, rn) => { if (rn >= 5 && row.getCell(2).value) paragraflar.push(String(row.getCell(2).value)); });
    let sayiVar = false;
    esas.eachRow((row) => row.eachCell((c) => { if (typeof c.value === 'number' || (c.value as any)?.formula) sayiVar = true; }));
    const birlesik = ((esas.model as any).merges ?? []) as string[];
    check('YT7 metin sayfası: paragraflar 5. satırdan, temizlenmiş; fiyat sütunu/tutar/SAYFA TOPLAMI YOK',
      JSON.stringify(paragraflar) === JSON.stringify([
        'TEKLİF ESASLARI',
        'Montajı tamamlanan sistemler hakkında uygulamalı ve teorik kullanıcı eğitimi tarafımızdan verilecektir',
        'Sistemin kurulumu ve devreye alınması esnasında gerekli su, elektrik temini işveren sorumluluğundadır.',
        "Satış Hükümleri Türk Hukuku'na tabi olup, buradan doğacak her türlü uyuşmazlık Türkiye Cumhuriyeti İstanbul Mahkemeleri tarafından çözülecektir.",
        '8"', 'İcmal satırı',
      ]) && !sayiVar && !satirBul(esas, 'SAYFA TOPLAMI') && birlesik.length === 6 && birlesik.every((m) => /^B\d+:C\d+$/.test(m)),
      JSON.stringify(paragraflar).slice(0, 200));
    check('YT7 metin sayfası: başlık kalın lacivert, B–C genişlik 3/96/16, tarih C2, yükseklik 13×satır+9',
      (esas.getRow(5).getCell(2).font as any)?.bold === true && (esas.getRow(6).getCell(2).font as any)?.bold !== true
        && JSON.stringify((esas.columns ?? []).map((c: any) => c.width)) === '[3,96,16]'
        && esas.getRow(2).getCell(3).value === 'Tarih: 23.09.2026' && esas.getRow(1).getCell(2).value === 'Hesap & Kontrol · Müşteri A.Ş.'
        && esas.getRow(5).height === 22 && esas.getRow(8).height === 35,
      `h5=${esas.getRow(5).height} h8=${esas.getRow(8).height} gen=${JSON.stringify((esas.columns ?? []).map((c: any) => c.width))}`);
  }

  // ── YT8: GENEL TOPLAM (tarif §5) ──
  {
    const bas = satirMetinleri(gt, 4);
    const mekT = satirBul(mek, 'SAYFA TOPLAMI'); const konT = satirBul(kon, 'SAYFA TOPLAMI');
    const b5 = gt.getRow(5).getCell(2).value as any; const d6 = gt.getRow(6).getCell(4).value as any;
    const genelSatir = satirBul(gt, 'TEKLİF GENEL TOPLAMI', 1);
    const genel = formulDegerlendir(wb, 'GENEL TOPLAM', formulu(gt.getRow(genelSatir).getCell(4).value));
    check('YT8 GENEL TOPLAM: yalnız kalem sayfaları, SAYFA TOPLAMI hücresine tırnaklı adla formül bağı',
      JSON.stringify(bas) === JSON.stringify(['Sayfa', 'Malzeme', 'İşçilik', 'Genel Toplam'])
        && gt.getRow(5).getCell(1).value === 'Mekanik' && gt.getRow(6).getCell(1).value === 'Kontrol'
        && b5?.formula === `'Mekanik'!F${mekT}` && d6?.formula === `'Kontrol'!I${konT}` && genelSatir === 8
        && !satirBul(gt, 'Esaslar', 1),
      `başlık=${bas.join('|')} B5=${b5?.formula} D6=${d6?.formula} genel satır=${genelSatir}`);
    check('YT8 TEKLİF GENEL TOPLAMI = SUM (hücrelerden) = r.genelToplam; lacivert, beyaz kalın, 28 yükseklik',
      formulu(gt.getRow(genelSatir).getCell(4).value) === 'SUM(D5:D6)' && K(genel.v as number) === K(r.genelToplam)
        && dolguRengi(gt.getRow(genelSatir).getCell(1)) === 'FF0F1A31' && (gt.getRow(genelSatir).getCell(4).font as any)?.size === 11
        && gt.getRow(genelSatir).height === 28,
      `genel=${genel.v} r=${r.genelToplam}`);
    const fd = formulDenetimi(wb);
    check('YT8 TÜM çalışma kitabı: her formülün önbelleği = hücrelerden yeniden hesap (Korumalı Görünüm = düzenleme modu)',
      fd.sayi > 40 && fd.sorun.length === 0, `formül=${fd.sayi} sorun=${fd.sorun.slice(0, 3).join(' | ')}`);
  }

  // ── YT9: baski ayarlari (tarif §6) ──
  {
    const ps = (w: ExcelJS.Worksheet) => w.pageSetup as any;
    const altBilgi = String((mek.headerFooter as any)?.oddFooter ?? '');
    check('YT9 baskı: A4, kalem yatay / metin + özet dikey, genişliğe sığdır, yatay ortalı, kenarlar 0,4/0,5/0,6',
      ps(mek).paperSize === 9 && ps(mek).orientation === 'landscape' && ps(esas).orientation === 'portrait' && ps(gt).orientation === 'portrait'
        && ps(mek).fitToPage === true && ps(mek).fitToWidth === 1 && ps(mek).fitToHeight === 0 && ps(mek).horizontalCentered === true
        && ps(mek).margins?.left === 0.4 && ps(mek).margins?.top === 0.5 && ps(mek).margins?.bottom === 0.6,
      JSON.stringify({ o: ps(mek).orientation, fw: ps(mek).fitToWidth, fh: ps(mek).fitToHeight, m: ps(mek).margins }));
    check('YT9 baskı alanı A1:son sütun·son satır, 4. satır her sayfada tekrar; alt bilgi Arial 8, "&" kaçışlı',
      ps(mek).printArea === `A1:I${mek.rowCount}` && ps(mek).printTitlesRow === '4:4' && ps(esas).printArea === `A1:C${esas.rowCount}`
        && altBilgi.includes('Hesap && Kontrol') && altBilgi.includes('&C') && altBilgi.includes('&A') && altBilgi.includes('Sayfa &P / &N')
        && altBilgi.includes('&8&"Arial,Regular"'),
      `alan=${ps(mek).printArea} tekrar=${ps(mek).printTitlesRow} altBilgi=${altBilgi.slice(0, 90)}`);
  }

  // ── YT10: tirnakli sayfa adi · kaynak numarasi · ters miktar/birim ──
  {
    const ozel = [
      { name: "O'Neil Blok", isEmpty: false, columnRoles: ROL, rowData: [veri(0, 'Vana', 2, '10', '20')] },
      { name: 'Poz', isEmpty: false, columnRoles: ROL, rowData: [
        { ...veri(0, 'Kazı', 10, '5', '50'), _no: '15.140.1003' },
        { ...veri(1, 'Dolgu', 4, '2.5', '10'), _no: '2' },
        veri(2, 'Numarasız', 1, '1', '1'),
      ] },
      { name: 'Ters', isEmpty: false, columnRoles: ROL, rowData: [
        // UY2 (EMO AYVAZ): MİKTAR/BİRİM ters kaydedilmiş — sayı birim hücresinde
        { ...veri(0, 'Kablo', 'mt', '10', '120'), _birim: '12' },
      ] },
      // Kayitli "0" BOS DEGIL: ekran 0 gosterir (satirTarafi yalniz BOS toplami tamamlar)
      { name: 'Sıfır', isEmpty: false, columnRoles: ROL, rowData: [veri(0, 'Sıfır yazılı toplam', 2, '10', '0')] },
    ];
    const o = await standartCiktiUret({ sheetsArr: ozel, birim: null, baslik: 'Özel', tarih: TARIH });
    const w = await ac(o.buffer);
    const oneil = w.getWorksheet("O'Neil Blok")!;
    const poz = w.getWorksheet('Poz')!;
    const ters = w.getWorksheet('Ters')!;
    const fd = formulDenetimi(w);
    const bag = w.getWorksheet('GENEL TOPLAM')!.getRow(5).getCell(2).value as any;
    check('YT10 tırnaklı sayfa adı: baskı alanı YAZILMAZ (ExcelJS tırnağı kaçışlamıyor), özet bağı \'\' ile, formüller doğru',
      (oneil.pageSetup as any).printArea === undefined && bag?.formula === `'O''Neil Blok'!F${satirBul(oneil, 'SAYFA TOPLAMI')}` && fd.sorun.length === 0,
      `alan=${(oneil.pageSetup as any).printArea} bağ=${bag?.formula} sorun=${fd.sorun.slice(0, 2).join(' | ')}`);
    check('YT10 dosyanın kendi No\'su (poz no) korunur; yoksa boş',
      poz.getRow(5).getCell(1).value === '15.140.1003' && poz.getRow(6).getCell(1).value === 2 && poz.getRow(7).getCell(1).value === null,
      JSON.stringify([5, 6, 7].map((i) => poz.getRow(i).getCell(1).value)));
    const f = ters.getRow(5).getCell(6).value as any;
    check('YT10 ters miktar/birim: C = 12 (birim hücresindeki sayı), D = "mt", F = 12 × 10 = 120',
      ters.getRow(5).getCell(3).value === 12 && ters.getRow(5).getCell(4).value === 'mt' && sayisal(f) === 120,
      JSON.stringify([ters.getRow(5).getCell(3).value, ters.getRow(5).getCell(4).value, f]));
    const sf = w.getWorksheet('Sıfır')!.getRow(5).getCell(6).value as any;
    check('YT10 kayıtlı "0" toplam BOŞ sayılmaz: ekran 0 der, çarpım 20 → Excel yeniden hesaplar ve SAYAR (başka satır sayılmaz)',
      sayisal(sf) === 20 && o.yenidenHesaplanan === 1, `F5=${JSON.stringify(sf)} yeniden=${o.yenidenHesaplanan}`);
  }

  // ── YT11: doviz — ekran paritesi (H4b ikizi) ──
  {
    const oran = 1 / 47.35;
    const u = await standartCiktiUret({ sheetsArr: ytTeklifi(), birim: { kod: 'USD', katsayi: oran, not: 'Fiyatlar USD' }, tarih: TARIH });
    const w = await ac(u.buffer);
    const m = w.getWorksheet('Mekanik')!;
    const t = satirBul(m, 'SAYFA TOPLAMI');
    const matK = K(formulDegerlendir(w, 'Mekanik', formulu(m.getRow(t).getCell(6).value)).v as number);
    const e = ekranK(ytTeklifi()[0], oran);
    // 7,5 × 13,47 = 101,025 → uygulama TL'de 101,1 yazdi: dolarda 101,1/47,35 = 2,14 ama
    // 7,5 × (13,47/47,35) = 2,13 — ROUND ekrani tutturamaz, ROUNDUP dolarda YASAK → DEGER.
    const uy = m.getRow(satirBul(m, 'Uygulama yuvarlaması')).getCell(6).value as any;
    let roundup = 0;
    w.eachSheet((x) => x.eachRow((row) => row.eachCell((c) => { if (formulu(c.value).includes('ROUNDUP')) roundup++; })));
    check('YT11 USD: malzeme SAYFA TOPLAMI = ekranın USD sayfa toplamı, kuruşu kuruşuna (TL\'de yuvarlanan satır DEĞER, dolarda ROUNDUP yok)',
      matK === e.mat && typeof uy === 'number' && K(uy) === K(101.1 * oran) && K(uy) !== K(7.5 * 13.47 * oran) && roundup === 0
        && formulDenetimi(w).sorun.length === 0
        && String(m.getRow(t).getCell(6).numFmt) === '"$"#,##0.00;-"$"#,##0.00;"–"' && u.yenidenHesaplanan === 3,
      `excel=${matK / 100} ekran=${e.mat / 100} uygulama=${JSON.stringify(uy)} ROUNDUP=${roundup} yeniden=${u.yenidenHesaplanan}`);
  }

  // ── YT12: Ingilizce cikti ──
  {
    const en = await standartCiktiUret({ sheetsArr: ytTeklifi(), birim: null, dil: 'en', baslik: 'Quote', tarih: TARIH });
    const w = await ac(en.buffer);
    const m = w.getWorksheet('Mekanik')!;
    const g = w.getWorksheet('GENEL TOPLAM')!;
    check('YT12 İngilizce: tablo/özet başlıkları, "Date:", PAGE TOTAL, QUOTE GRAND TOTAL, alt bilgi "Page"',
      satirMetinleri(m, 4)[1] === 'Description' && m.getRow(2).getCell(9).value === 'Date: 23.09.2026' && satirBul(m, 'PAGE TOTAL') > 0
        && JSON.stringify(satirMetinleri(g, 4)) === JSON.stringify(['Sheet', 'Material', 'Labour', 'Grand Total'])
        && satirBul(g, 'QUOTE GRAND TOTAL', 1) > 0 && g.getRow(2).getCell(1).value === 'Priced quote · Summary'
        && String((m.headerFooter as any)?.oddFooter ?? '').includes('Page &P / &N'),
      `${satirMetinleri(m, 4)[1]} · ${m.getRow(2).getCell(9).value} · ${satirMetinleri(g, 4).join('|')}`);
  }

  // ── YT13: antet — satirlar kayar, hicbir aralik sabit degil (tarif §2 "Önemli") ──
  {
    const { TAM_FIRMA } = require('./cikti-test-yardimci');
    const { antetKur } = require('../src/ozellik/cikti/utils/antet');
    const a = await standartCiktiUret({ sheetsArr: ytTeklifi(), birim: null, antet: antetKur(TAM_FIRMA), baslik: 'Antetli', tarih: TARIH });
    const w = await ac(a.buffer);
    const m = w.getWorksheet('Mekanik')!;
    const bas = satirBul(m, 'Malzeme Adı');
    const t = satirBul(m, 'SAYFA TOPLAMI');
    const v: any = m.views?.[0] ?? {};
    check('YT13 antetli: başlık 4\'ten aşağı kayar; SUM, bölme, tekrar satırı başlıktan hesaplanır; toplam antetsizle aynı',
      m.getRow(1).getCell(2).value === TAM_FIRMA.unvan && (m.getRow(1).getCell(2).font as any)?.name === 'Arial' && bas > 4 && m.getRow(bas - 3).getCell(1).value === 'Antetli'
        && String(formulu(m.getRow(t).getCell(6).value)).startsWith(`SUM(F${bas + 1}:`) && v.ySplit === bas && v.topLeftCell === `C${bas + 1}`
        && (m.pageSetup as any).printTitlesRow === `${bas}:${bas}` && K(a.genelToplam) === K(r.genelToplam) && formulDenetimi(w).sorun.length === 0
        && w.getWorksheet('GENEL TOPLAM')!.getRow(1).getCell(1).value === TAM_FIRMA.unvan,
      `başlık=${bas} SUM=${formulu(m.getRow(t).getCell(6).value)} bölme=${v.ySplit}/${v.topLeftCell} tekrar=${(m.pageSetup as any).printTitlesRow}`);
  }
}

bitmezseKirmizi(main().catch((e) => { console.error(e); process.exitCode = 1; }));
