/**
 * KG9-KG13 — ONCEDEN GIRILMIS FIYATLAR HER ZAMAN ICE ALINIR
 * (PRD Kesin Cozum 29.07, Bolum C)
 *
 * KULLANICI KURALI (aynen): "Yuklenen excelde onceden kullanicinin girdigi
 * fiyatlar varsa sisteme yuklendiginde de bu gorulmeli. Kullanici kafasina
 * gore revize yapmak isteyebilir. Excelde ne varsa fiyatlari ile beraber
 * sisteme gelmeli."
 *
 * FAZ 0 kok neden (FAZ0_KOK_NEDEN_RAPORU.md §B ikinci katman):
 * excel-grid.controller.ts:20 teklif akisini daima fixedSchema:true cagirir;
 * excel-grid.service.ts:292 bu modda dosyanin fiyat/tutar kolonlarini
 * dropCols'a alip GRID'DEN CIKARIR → SAHINKUL'un dolu iscilik fiyatlari
 * (550-960) ekranda gorunmez.
 *
 * Kosum: npx ts-node test/onceden-fiyatli-test.ts   (npm run test:of)
 */
import * as fs from 'fs';
import { ExcelGridService } from '../src/modules/excel-grid/excel-grid.service';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const oku = (ad: string) => fs.readFileSync(`../test-fixtures/e2e/${ad}`);
const svc = new ExcelGridService({ brand: { findMany: async () => [] } } as any);
const SAHINKUL = 'FIRMA-A KEŞİF ÖZETİ 251224 R1 - FIRMA-B MÜHENDİSLİK.xlsx';

async function run() {
  console.log('\n══════ KG9-KG13: ONCEDEN GIRILMIS FIYATLAR ══════\n');

  const res = await svc.prepare(oku(SAHINKUL), { fixedSchema: true });
  const sh = res.sheets.find((s: any) => s.name === 'SIHHİ');
  const R = sh.columnRoles as any;
  const defs = (sh.columnDefs ?? []) as Array<{ field: string; headerName?: string }>;
  const alanlar = new Set(defs.map((d) => d.field));

  // ── KG9: dosyadaki DOLU fiyat kolonlari GRID'DE gorunur ───────────────
  // SAHINKUL: G=MALZEME BF, H=MALZEME TUTAR, I=İŞÇİLİK BF, J=İŞÇİLİK TUTAR,
  // K/L=TOPLAM (grid col5..col10). Iscilik kolonlari dosyada DOLU.
  {
    // MF1 (ust belge KG9'un yerini aldi): SABIT semada dosyanin fiyat KOLONU
    // grid'e tasinmaz; degerler SABIT hucrelere gelir. Olcut: dosyada dolu
    // fiyat varsa sabit hucrede de dolu olmali.
    const doluSabit = (sh.rowData ?? []).filter((r: any) => r._isDataRow
      && [R.materialUnitPriceField, R.materialTotalField, R.laborUnitPriceField, R.laborTotalField]
        .some((f: string) => String(r[f] ?? '').trim() !== '')).length;
    check('MF1 dosyadaki dolu fiyatlar SABİT hücrelerde görünür',
      doluSabit >= 20, `sabit hücresi dolu satır=${doluSabit}`);
  }

  // ── KG10: iscilik birim fiyat/tutar DOSYADAKI degerle grid'de ─────────
  {
    // dosyada I/J dolu ilk veri satirini bul (col7=I, col8=J)
    const iscSatir = (sh.rowData ?? []).filter((r: any) => r._isDataRow
      && parseFloat(String(r[R.laborUnitPriceField] ?? '')) > 0);
    check('MF2 işçilik başlığı altındaki fiyatlar İşç. Birim Fiyat’a geldi',
      iscSatir.length >= 20,
      `İşç. Birim Fiyat dolu satır=${iscSatir.length} (ör: ${iscSatir.slice(0, 3).map((r: any) => r[R.laborUnitPriceField]).join(', ')})`);
    const iscTutar = (sh.rowData ?? []).filter((r: any) => r._isDataRow
      && parseFloat(String(r[R.laborTotalField] ?? '')) > 0);
    check('MF2b işçilik tutarları İşç. Toplam’a geldi',
      iscTutar.length >= 20, `İşç. Toplam dolu satır=${iscTutar.length}`);
  }

  // ── KG10c: malzeme tarafi da ayni kuralla (dolu ise gelir) ────────────
  {
    // YANGIN sayfasinda malzeme fiyatlari dolu olabilir — genel kural sinanir
    let toplamDosyaDegeri = 0; let toplamGridDegeri = 0;
    for (const s of res.sheets as any[]) {
      if (s.isEmpty) continue;
      const rr = s.columnRoles ?? {};
      for (const r of s.rowData ?? []) {
        if (!r._isDataRow) continue;
        for (const k of Object.keys(r)) {
          if (/^col([5-9]|1[0-9])$/.test(k)) {
            const v = parseFloat(String(r[k] ?? '').replace(',', '.'));
            if (!isNaN(v) && v > 0) toplamDosyaDegeri++;
          }
        }
        // TUM fiyat rolleri — TOPLAM (grand) kolonlari da grid alanidir
        for (const f of [rr.materialUnitPriceField, rr.materialTotalField,
          rr.laborUnitPriceField, rr.laborTotalField,
          rr.grandUnitPriceField, rr.grandTotalField]) {
          if (!f) continue;
          const v = parseFloat(String(r[f] ?? '').replace(',', '.'));
          if (!isNaN(v) && v > 0) toplamGridDegeri++;
        }
      }
    }
    check('KG10c TÜM sayfalarda dosyadaki dolu fiyat sayısı ≈ grid alanlarındaki dolu sayısı',
      toplamGridDegeri >= toplamDosyaDegeri * 0.9,
      `dosyada ${toplamDosyaDegeri} dolu fiyat hücresi, grid alanlarında ${toplamGridDegeri}`);
  }

  // ── KG11: kaynak rozeti alani (dosyadan / kutuphaneden / manuel) ──────
  {
    const rozetli = (sh.rowData ?? []).filter((r: any) => r._isDataRow
      && (r._matKaynak === 'dosya' || r._labKaynak === 'dosya')).length;
    check('MF3 dosyadan gelen değer "dosyadan" kaynak rozetiyle işaretli',
      rozetli >= 20, `rozetli satır=${rozetli}`);
  }

  // ── KG13: para birimi karisimi yasak — dosyadan gelen deger BICIMSIZ ──
  // (cevrim export'ta TEK kurla yapilir; grid'e "$" yazilmaz)
  {
    const semboller = (sh.rowData ?? []).filter((r: any) => r._isDataRow
      && /[$€₺]/.test(String(r[R.laborUnitPriceField] ?? '') + String(r[R.materialUnitPriceField] ?? '')));
    check('MF/KG13 dosyadan gelen değerde para birimi sembolü YOK (ham sayı)',
      semboller.length === 0, `sembollü satır=${semboller.length}`);
  }

  // ── KG9b: MERGE-GIZLI kolon rol tasiyamaz (canli bulgu 30.07) ────────
  // Kullanici: "MALZ B. FİYAT kolonuna deger yazilmamis." Olcum: rol atanan
  // kolon veri satirlarinin TAMAMINDA merge-gizli → frontend hucreyi CSS ile
  // gizliyor, yazilan fiyat GORUNMUYOR. Rol gorunur olmayan kolona
  // baglanmaz; sistem alanina duser ve sistem kolonu eklenir.
  {
    const r2 = await svc.prepare(oku('FIRMA-B MÜHENDİSLİK-SAHA-DORT OKUL PROJESİ SAHA-BES.xlsx'), { fixedSchema: true });
    const sh2 = (r2.sheets as any[]).find((s) => s.name === 'CİLAS KAUÇUK');
    const R2 = sh2.columnRoles as any;
    const alanlar2 = new Set(((sh2.columnDefs ?? []) as any[]).map((d) => d.field));

    // merge-gizli olan malzeme birim fiyat kolonu (col12) rol TASIMAMALI
    const mergeGizli = (alan?: string) => {
      if (!alan || !alan.startsWith('col')) return false;
      let gizli = 0; let toplam = 0;
      for (const row of sh2.rowData ?? []) {
        if (!row._isDataRow) continue;
        toplam++;
        if (row._merges?.[alan]?.hidden) gizli++;
      }
      return toplam > 0 && gizli / toplam >= 0.5;
    };
    check('KG9b malzeme birim fiyat rolü GÖRÜNÜR bir hedefe bağlı (merge-gizli kolona değil)',
      !mergeGizli(R2.materialUnitPriceField),
      `rol=${R2.materialUnitPriceField} (bu kolon veri satırlarında merge-gizli)`);
    check('KG9b-2 rol sistem alanına düştüyse sistem kolonu EKLENDİ (fiyat görünür)',
      !R2.materialUnitPriceField?.startsWith('col') ? alanlar2.has('_matBirim') : true,
      `rol=${R2.materialUnitPriceField} _matBirim kolonu=${alanlar2.has('_matBirim')}`);
    // KG9b-3 DUSTU: sabit semada roller her zaman SABIT alanlardir; "gorunur
    // dosya kolonu rolde kalir" kurali artik gecersiz (GS1). Yerine sozlesme:
    check('GS14 roller SABİT alanları gösterir (dosya kolonu rolde kalmaz)',
      !String(R2.laborUnitPriceField ?? '').startsWith('col')
      && !String(R2.materialUnitPriceField ?? '').startsWith('col'),
      `lbf=${R2.laborUnitPriceField} mbf=${R2.materialUnitPriceField}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`ONCEDEN FIYATLI: ${passed} PASS, ${failed} FAIL`);
  console.log('='.repeat(60));
  if (failures.length) {
    console.log('\nFAILURES:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
