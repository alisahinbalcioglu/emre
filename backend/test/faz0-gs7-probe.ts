/* FAZ 0 / GS7 KOK NEDEN OLCUMU (PRD_Standart_Grid_Semasi §GS7)
 * Soru: "Malzeme Adı sütunu" otomatik tespiti YILDIZ dosyasinda neden
 * baslik metnini (TRAFO SU PÜSKÜRTME SİSTEMİ) sutun saniyor ve sayfa
 * neden bos kaliyor? Olcum: GERCEK parse ciktisi (varsayim yok).
 *
 * Kosum: npx ts-node test/faz0-gs7-probe.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { ExcelGridService } from '../src/ozellik/giris/excel-grid/excel-grid.service';

const FIX = path.resolve(__dirname, '../../test-fixtures/e2e');
/** Turkce katlama — "YILDIZ".toLocaleLowerCase('tr') = "yıldız" (noktasiz ı)
 *  oldugundan duz karsilastirma dosyayi bulamiyordu. */
const katla = (s: string) => s.normalize('NFC')
  .replace(/[İIı]/g, 'i').replace(/[Şş]/g, 's').replace(/[Ğğ]/g, 'g')
  .replace(/[Üü]/g, 'u').replace(/[Öö]/g, 'o').replace(/[Çç]/g, 'c')
  .toLowerCase();
const dosyaBul = (parca: string) => {
  const f = fs.readdirSync(FIX).find((x) => katla(x).includes(katla(parca)));
  if (!f) throw new Error(`fixture yok: ${parca}`);
  return path.join(FIX, f);
};

async function main() {
  const svc = new ExcelGridService({ brand: { findMany: async () => [] } } as any);
  for (const [etiket, parca] of [['YILDIZ', 'firma-c entegre'], ['SAHINKUL', 'kesif ozeti 251224']] as const) {
    let yol: string;
    try { yol = dosyaBul(parca); } catch (e) { console.log(`\n### ${etiket}: ${(e as Error).message}`); continue; }
    console.log(`\n${'='.repeat(78)}\n### ${etiket} — ${path.basename(yol)}\n${'='.repeat(78)}`);
    const buf = fs.readFileSync(yol);
    const sonuc = await svc.prepare(buf, { fixedSchema: true });
    for (const sh of sonuc.sheets) {
      const roles: any = sh.columnRoles ?? {};
      const nf = roles.nameField;
      const rows = sh.rowData ?? [];
      const dataRows = rows.filter((r: any) => r._isDataRow);
      const adDolu = dataRows.filter((r: any) => nf && String(r[nf] ?? '').trim() !== '').length;
      // her kolon icin: dolu hucre sayisi + metin/sayi profili (GS7 olcutu)
      const kolonlar: string[] = [];
      const alanlar = new Set<string>();
      for (const r of rows) for (const k of Object.keys(r)) if (/^col\d+$/.test(k)) alanlar.add(k);
      const sirali = Array.from(alanlar).sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
      for (const f of sirali) {
        let dolu = 0, metin = 0, sayi = 0, uzunToplam = 0;
        for (const r of dataRows) {
          const v = String((r as any)[f] ?? '').trim();
          if (!v) continue;
          dolu++;
          uzunToplam += v.length;
          if (/^-?[\d.,]+$/.test(v)) sayi++; else metin++;
        }
        kolonlar.push(`${f}: dolu=${dolu} metin=${metin} sayi=${sayi} ortUzunluk=${dolu ? (uzunToplam / dolu).toFixed(1) : 0}`);
      }
      const bayrak = sh.isEmpty ? 'BOS-SAYFA' : adDolu === 0 ? '⚠ AD SUTUNU BOS' : 'ok';
      console.log(`\n-- ${sh.name} [${bayrak}] isEmpty=${sh.isEmpty} headerEndRow=${sh.headerEndRow} colOffset=${(sh as any).colOffset ?? 0}`);
      console.log(`   roller: ${Object.entries(roles).filter(([, v]) => v).map(([k, v]) => `${k.replace('Field', '')}=${v}`).join(' ') || '(YOK)'}`);
      console.log(`   satir: toplam=${rows.length} data=${dataRows.length} adDolu=${adDolu}`);
      console.log(`   kolon profili (yalniz data satirlari):`);
      for (const k of kolonlar) console.log(`      ${k}`);
      // GS6/GS7: "Malzeme Adı sütunu" seciciSININ ETIKETLERI columnDefs'ten gelir
      const defs: any[] = (sh.columnDefs ?? []) as any[];
      console.log(`   columnDefs (secici etiketleri): ${defs.filter((d) => /^col\d+$/.test(d.field)).map((d) => `${d.field}="${String(d.headerName ?? '').replace(/\s+/g, ' ').slice(0, 34)}"`).join(' · ')}`);
      // nameField olarak secilen kolonun ilk 3 degeri
      if (nf) {
        const ornek = dataRows.slice(0, 3).map((r: any) => JSON.stringify(String(r[nf] ?? '').slice(0, 40)));
        console.log(`   nameField=${nf} ornek: ${ornek.join(' | ') || '(bos)'}`);
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
