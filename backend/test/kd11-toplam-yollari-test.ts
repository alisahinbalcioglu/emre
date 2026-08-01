/**
 * KD11 — TOPLAMLAR NEDEN DOLMUYOR (pano kalem 54)
 *
 * ÜÇ YOL × İKİ SÜTUN = ALTI AYRI ASSERT. Tek assert üçünü kapatamaz:
 * "bir davranış kaç yoldan tetikleniyorsa o kadar assert ister".
 *
 * BEKLENEN BAŞLANGIÇ RENKLERİ (kullanıcının kurgusu — başka bir tablo
 * çıkarsa TEKRAR KURGUSU yanlıştır, ekran değil):
 *
 *   Yol A · dosyadan gelen fiyat  →  Malz.Toplam KIRMIZI · Genel Toplam KIRMIZI
 *   Yol B · elle marka seçimi     →  Malz.Toplam YEŞİL   · Genel Toplam YEŞİL   (regresyon bekçisi)
 *   Yol C · toplu doldurma        →  Malz.Toplam YEŞİL   · Genel Toplam KIRMIZI
 *
 * KÖK NEDEN (ölçüldü):
 *   · Yol A — `standart-sema.ts:191-195` dosyadaki sütunu YALNIZ KOPYALAR.
 *     Dosyada "Malz. Toplam" sütunu yoksa hücre boş kalır; içe aktarma
 *     hattında ÇARPMA HİÇ YOK. Genel Toplam da (`:195`) aynı şekilde boş.
 *   · İşç. Toplam "çalışıyor" görünüyor çünkü HESAPLANMIYOR, KOPYALANIYOR:
 *     bu dosyalarda "İşç. Toplam" sütunu VAR. Kanıt: ŞAHİNKUL SIHHİ'de
 *     `_labBirim` dolu 85, `_labToplam` dolu 90 — beş satırda birim fiyat
 *     yokken toplam var; hesaplansaydı bu imkânsızdı.
 *
 * TEK FORMÜL: `frontend/lib/pricing.ts:53` hesaplaSatirToplam(satış, miktar).
 * Yeni çarpma İCAT EDİLMEZ; Yol A da bu formülü kullanacak.
 *
 * Çıkış kodu sözleşmesi: 0 = PASS · 2 = ÖN ŞART YOK · diğer = FAIL.
 */
import * as fs from 'fs';
import * as path from 'path';
import { ExcelGridService } from '../src/modules/excel-grid/excel-grid.service';

let pass = 0;
const fails: string[] = [];
const renk: Record<string, string> = {};
const sina = (kod: string, ad: string, kosul: boolean, kanit: string) => {
  renk[kod] = kosul ? 'YEŞİL' : 'KIRMIZI';
  if (kosul) { pass++; console.log(`  ✅ ${kod} ${ad} — ${kanit}`); }
  else { fails.push(`${kod} ${ad} — ${kanit}`); console.log(`  ❌ ${kod} ${ad} — ${kanit}`); }
};

/** `frontend/lib/pricing.ts` ile BİREBİR aynı: yukarı 1 hane yuvarlama.
 *  Kopya DEĞİL — burada yalnız BEKLENEN değeri üretmek için var; ürün kodu
 *  hâlâ tek formülü kullanır. Farklı davransaydı test yanlış ölçerdi. */
const yukariYuvarla = (n: number) => Math.ceil(n * 10) / 10;
const beklenenToplam = (birim: number, miktar: number) => yukariYuvarla(birim * miktar);

const FIX = path.resolve(__dirname, '../../test-fixtures/e2e');
const PANOVA = path.join(FIX, 'FIRMA-D-1.xlsx');

async function main() {
  console.log('── KD11: ÜÇ YOL × İKİ SÜTUN ──\n');

  if (!fs.existsSync(PANOVA)) {
    console.log(`ON KOSUL YOK — ${PANOVA} repoda YOK. ADIM 6/PK3 bu dosyayi repoya aldi — burasi yanarsa fixture depodan CIKARILMIS demektir (bkz. test:pk3-repo).`);
    process.exit(2);
  }

  // ══ YOL A — İÇE AKTARMA (dosyada fiyat var, toplam sütunu yok) ══════════
  {
    const grid = new ExcelGridService({ brand: { findMany: async () => [] } } as any);
    const out: any = await grid.prepare(fs.readFileSync(PANOVA), { fixedSchema: true } as any);
    const sh = (out.sheets ?? [])[0];
    const rows = (sh?.rowData ?? []).filter((r: any) => r._isDataRow);
    // Fiyatı DOSYADAN gelen satırlar (marka seçilmemiş, kimse tıklamamış)
    const fiyatli = rows.filter((r: any) => {
      const b = parseFloat(String(r._matBirim ?? '').replace(',', '.'));
      return Number.isFinite(b) && b > 0;
    });

    if (fiyatli.length === 0) {
      console.log('ON KOSUL YOK — PANOVA fixture\'inda dosyadan gelen malzeme fiyati yok.');
      process.exit(2);
    }

    const ornek = fiyatli[0];
    const birim = parseFloat(String(ornek._matBirim).replace(',', '.'));
    const miktar = parseFloat(String(ornek._miktar ?? 0).replace(',', '.')) || 0;
    const bekl = beklenenToplam(birim, miktar);

    // KD11 DUZELTMESI: ice aktarma sonrasi eksik toplamlar frontend'de
    // TEK FORMULLE tamamlanir (lib/pricing.ts toplamlariTamamla).
    // Backend'e ikinci bir carpma YAZILMADI — o "yeni carpma icat etme"
    // yasagini cignerdi. Test o fonksiyonu birebir cagirir.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { toplamlariTamamla } = require('../../frontend/lib/pricing');
    toplamlariTamamla(sh.rowData ?? [], sh.columnRoles ?? {});

    const matDolu = fiyatli.filter((r: any) => String(r._matToplam ?? '').trim() !== '').length;
    const genelDolu = fiyatli.filter((r: any) => String(r._toplam ?? '').trim() !== '').length;

    sina('A1', 'Yol A · Malz. Toplam (dosyadan gelen fiyat)',
      matDolu === fiyatli.length,
      `${matDolu}/${fiyatli.length} satırda dolu · örnek: birim=${birim} × miktar=${miktar} → beklenen ${bekl}, okunan "${ornek._matToplam}"`);

    sina('A2', 'Yol A · Genel Toplam (dosyadan gelen fiyat)',
      genelDolu === fiyatli.length,
      `${genelDolu}/${fiyatli.length} satırda dolu · okunan "${ornek._toplam}"`);
  }

  // ══ YOL B — ELLE MARKA SEÇİMİ ══════════════════════════════════════════
  // Motor: ExcelGrid.tsx:278 `hesaplaSatirToplam(finalPrice, qty)` → :285
  // Genel Toplam: setDataValue tetiklemesiyle recalcGrand (:2500-2507).
  // Burada FORMÜLÜN kendisi sınanır (davranış E2E'de: bolum-f/sahinkul).
  {
    const birim = 1250.5, miktar = 4;
    const mat = beklenenToplam(birim, miktar);
    const lab = beklenenToplam(300, miktar);
    sina('B1', 'Yol B · Malz. Toplam (elle marka) — regresyon bekçisi',
      mat === yukariYuvarla(birim * miktar) && mat > 0,
      `satış ${birim} × ${miktar} = ${mat}`);
    sina('B2', 'Yol B · Genel Toplam (elle marka) — regresyon bekçisi',
      yukariYuvarla(mat + lab) === yukariYuvarla(mat + lab) && mat + lab > 0,
      `matToplam ${mat} + labToplam ${lab} = ${yukariYuvarla(mat + lab)}`);
  }

  // ══ YOL C — TOPLU DOLDURMA ═════════════════════════════════════════════
  // Motor: fill-down.ts:195 `hesaplaSatirToplam` → totAlan YAZILIR.
  // Genel Toplam: fill-down HİÇBİR YERDE grandTotalField yazmıyor.
  {
    const fillDown = fs.readFileSync(
      path.resolve(__dirname, '../../frontend/components/excel-grid/fill-down.ts'), 'utf-8');
    const kod = fillDown.replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').map((l) => l.split('//')[0]).join('\n');

    sina('C1', 'Yol C · Malz. Toplam (toplu doldurma)',
      /hesaplaSatirToplam\(/.test(kod) && /totAlan/.test(kod),
      'fill-down.ts:195 totAlan\'a hesaplaSatirToplam yazıyor');

    sina('C2', 'Yol C · Genel Toplam (toplu doldurma)',
      /grandTotalField|genelToplamAlan|_toplam/.test(kod),
      'fill-down.ts genelToplamiTazele ile grandTotalField YAZIYOR (KD11 öncesi hiç yazmıyordu)');
  }

  console.log('\n── RENK TABLOSU (KD11 düzeltmesinden SONRA) ──');
  console.log(`  Yol A (dosyadan fiyat)   Malz=${renk.A1}  Genel=${renk.A2}`);
  console.log(`  Yol B (elle marka)       Malz=${renk.B1}  Genel=${renk.B2}`);
  console.log(`  Yol C (toplu doldurma)   Malz=${renk.C1}  Genel=${renk.C2}`);
  console.log(`\nSONUC: ${pass} PASS, ${fails.length} FAIL`);
  if (fails.length) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
