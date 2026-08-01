/**
 * KD12 — BAŞLIK/ÜNVAN SATIRLARI MALZEME SANILIYOR MU? (pano kalem 55)
 *
 * ÜÇ AYRI DAVRANIŞ, ÜÇ AYRI ASSERT (kabul şartı 3):
 *   (a) ünvan/başlık satırları VERİ SATIRI olarak alınmayacak
 *   (b) sütun adları SAYFA ADINA dönmeyecek
 *   (c) "8. CADDE" gibi metinlerden SAYI TÜRETİLMEYECEK
 *
 * ⚠ HİPOTEZ ÇÜRÜTÜLDÜ (ölçüldü, varsayılmadı). Kullanıcının hipotezi
 * "içe aktarıcı ünvan satırını başlık sanıyor; tek kök neden ikisini de
 * açıklar" idi. Ham hücreler bunu çürüttü:
 *
 *   YILDIZ·Hidrant r6: ["","No","HİDRANT SİSTEMİ","Miktar","Birim","BİRİM FİYAT…"]
 *   PANOVA        r2 : ["NO","MALZEME ADI","BİRİM","MİKTAR","malzeme birim fiyat","TOPLAM TUTAR"]
 *
 * → (b) BİR HATA DEĞİL: YILDIZ'da malzeme sütununun başlığı DOSYADA
 *   gerçekten "HİDRANT SİSTEMİ" yazıyor; sayfa adı da `Hidrant.Sistemi`
 *   olduğu için ikisi ÇAKIŞIYOR. Program dosyaya sadık davranıyor.
 *   Başlık satırı seçici (excel-grid.service.ts:901-921) doğru satırı
 *   buluyor — log da öyle diyor: `realHeaderRow=6 (score=4)`.
 *
 * → (a) GERÇEK HATA, ama YILDIZ'da değil PANOVA'da: r2 (Excel'in KENDİ
 *   başlık satırı) `_isDataRow=true` geliyor. Sebep: `standart-sema.ts`
 *   satır tipini `ad + (birim|miktar)` kuralıyla belirliyor ve başlık
 *   satırı bu kuralı SAĞLIYOR ("MALZEME ADI" + "BİRİM"). `headerEndRow`
 *   bilgisi ELDE VAR ama satır sınıflandırmasında KULLANILMIYOR.
 *
 * Yani iki dosya iki AYRI şey gösteriyor; tek kök neden yok.
 * "İlk N satırı atla" ise çözüm değil: YILDIZ'da 5, PANOVA'da 1 çöp satır var.
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
  else { fails.push(`${kod} ${ad}`); console.log(`  ❌ ${kod} ${ad} — ${kanit}`); }
};

/** BILINEN ACIK — ne PASS ne FAIL. Acik KAPANIRSA test UYARI verir ki satir
 *  gercek assert'e terfi etsin; boylece acik listesi bayatlamaz.
 *  (conversion-test.ts'teki `bilinenAcik` ile ayni kalip.) */
const acikListesi: string[] = [];
const bilinenAcik = (kod: string, ad: string, duzeldiMi: boolean, kanit: string) => {
  renk[kod] = duzeldiMi ? 'YEŞİL (ACIK KAPANMIS)' : 'KIRMIZI (BILINEN ACIK)';
  acikListesi.push(`${kod} ${ad} — ${kanit}`);
  if (duzeldiMi) {
    fails.push(`ACIK KAPANMIS: ${kod} artik dogru calisiyor — gercek assert'e cevir`);
    console.log(`  ❌ ACIK KAPANMIS: ${kod} — ${kanit}`);
  } else {
    console.log(`  ⚠ BILINEN ACIK ${kod} ${ad} — ${kanit}`);
  }
};

const FIX = path.resolve(__dirname, '../../test-fixtures/e2e');
const PANOVA = path.join(FIX, 'FIRMA-D-1.xlsx');
const YILDIZ = path.join(FIX, 'FIRMA-C ENTEGRE SAHA-UC - Yangın Tesisatı.xlsx');
const BEYKOZ = path.join(FIX, 'FIRMA-B MÜHENDİSLİK-SAHA-DORT OKUL PROJESİ SAHA-BES.xlsx');

/** Excel'in KENDİ başlık satırı: hücreleri başlık kelimesi olan satır. */
const BASLIK_KELIMELERI = /^(no|s\.?n\.?|sıra|malzeme adı|birim|miktar|tutar|toplam|fiyat|açıklama|cinsi)$/;
/** ⚠ TÜRKÇE `İ` TUZAĞI — bu yüklem bir kez YALANCI YEŞİL verdi.
 *  JS `"MİKTAR".toLowerCase()` → `"mi̇ktar"` (i + birleşik nokta), `"miktar"`
 *  DEĞİL; bu yüzden `/miktar/i` EŞLEŞMEZ. Yalnız `toLocaleLowerCase('tr')`
 *  doğru sonucu verir. Aynı sınıf hata bu oturumda bir kez daha yaşandı
 *  (`çayırova` markası `contains:'AYIROVA'` ile bulunamadı). */
const kucult = (s: string) => s.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
const baslikSatiriMi = (r: any) => {
  const hucreler = [r._no, r._ad, r._birim, r._miktar]
    .map((v) => String(v ?? '').trim()).filter(Boolean);
  if (hucreler.length < 2) return false;
  return hucreler.filter((h) => BASLIK_KELIMELERI.test(kucult(h))).length >= 2;
};

async function main() {
  console.log('── KD12: BAŞLIK/ÜNVAN SATIRLARI ──\n');
  for (const p of [PANOVA, YILDIZ, BEYKOZ]) {
    if (!fs.existsSync(p)) { console.log(`ON KOSUL YOK — ${p} yok`); process.exit(2); }
  }
  const g = () => new ExcelGridService({ brand: { findMany: async () => [] } } as any);

  // ── (a) Excel'in kendi başlık satırı VERİ olamaz ────────────────────────
  {
    const o: any = await g().prepare(fs.readFileSync(PANOVA), { fixedSchema: true } as any);
    const veri = (o.sheets[0].rowData ?? []).filter((r: any) => r._isDataRow);
    const sizan = veri.filter(baslikSatiriMi);
    sina('a', 'Excel başlık satırı VERİ satırı olarak alınmıyor',
      sizan.length === 0,
      sizan.length
        ? `${sizan.length} başlık satırı veriye sızdı: ${sizan.map((r: any) => `"${r._ad}"/"${r._birim}"`).join(' · ')}`
        : `PANOVA'da ${veri.length} veri satırı, hiçbiri başlık değil`);
  }

  // ── (b) Sütun adı SAYFA ADINA dönmüyor ─────────────────────────────────
  // Ölçüt: sütun adı, DOSYANIN KENDİ başlık hücresiyle aynı olmalı.
  // Sayfa adına benzemesi tek başına hata DEĞİLDİR — dosya öyle yazmışsa
  // program ona sadıktır. Hata, dosyada olmayan bir adın uydurulmasıdır.
  {
    const o: any = await g().prepare(fs.readFileSync(YILDIZ), { fixedSchema: true } as any);
    const sh = o.sheets.find((s: any) => /hidrant/i.test(s.name));
    const adlar = (sh?.kaynakKolonlar ?? []).map((k: any) => String(k.headerName));
    // Dosyanın gerçek başlık satırındaki metinler (r6) — parse'tan bağımsız kanıt
    const dosyadaki = ['HİDRANT SİSTEMİ', 'Birim', 'Miktar', 'No'];
    const uydurulan = adlar.filter((a: string) =>
      a.trim() !== '' && !dosyadaki.some((d) => d.toLocaleUpperCase('tr') === a.toLocaleUpperCase('tr')));
    sina('b', 'Sütun adları dosyanın KENDİ başlık hücrelerinden geliyor',
      uydurulan.length === 0,
      `seçicideki adlar=${JSON.stringify(adlar)} · dosyada olmayan=${JSON.stringify(uydurulan)}`);
  }

  // ── (c) "8. CADDE" gibi metinden SAYI türetilmiyor ──────────────────────
  {
    const o: any = await g().prepare(fs.readFileSync(PANOVA), { fixedSchema: true } as any);
    const tum = o.sheets[0].rowData ?? [];
    const unvan = tum.filter((r: any) => /CADDE|YANGIN SİSTEMLERİ/i.test(String(r._ad ?? '')));
    const sayiTuretilen = unvan.filter((r: any) => {
      const m = String(r._miktar ?? '').trim();
      return m !== '' && m !== 'null' && Number.isFinite(parseFloat(m));
    });
    // ── 01.08.2026: AÇIK KAPANDI, GERÇEK ASSERT'E TERFİ ETTİ ──────────────
    // Kapanma şartı ("12/12 fixture repoda olsun") ADIM 6/PK3 ile sağlandı;
    // kural artık 19 fixture · 10.015 satır üzerinde ÖLÇÜLEBİLİYOR.
    //
    // ÇÜRÜTÜLEN NAİF FİX: "adında N. var ve miktar N ise miktarı sil" —
    // 12 satır yakalıyordu, 7'si GERÇEK MALZEME (AKSA `1.1/2"-DN40 Küresel
    // Vana` mik=1). Bu yaklaşım satırın ADINA bakıyordu; yanlış yerdi.
    //
    // ÇÜRÜTÜLEN İKİNCİ FİX: lookbehind ile "harften sonraki sayıyı atla" —
    // sayıyı reddetmiyor, BİR SONRAKİNİ buluyordu: "C 35 Betonarme" → 5.
    //
    // KABUL EDİLEN KURAL (`standart-sema.ts` miktarNormalize): hücrede
    // sayıdan ÖNCE harf varsa hücre sayı DEĞİLDİR → null. Yalnız hücrenin
    // KENDİ şekline bakar, satırın adına bakmaz → AKSA'nın 7 malzemesi
    // etkilenmez (miktar hücresi zaten "1").
    //
    // ÖLÇÜM (19 fixture, 10.015 satır): 21 alan değişti; VERİ satırında
    // yalnız 1 satır — FIRMA-B/İCMAL r5, `_toplam` 25 → boş. Kaynağı
    // "TEKLİF NO : T25-0121" idi: TEKLİF NUMARASINDAN para değeri
    // türetiliyordu. Yani tek veri değişikliği de KAYIP değil DÜZELTME.
    sina('c', 'ünvan metninden miktar türetilmiyor',
      unvan.length > 0 && sayiTuretilen.length === 0,
      unvan.length === 0
        ? 'ÖN KOŞUL: PANOVA fixture\'ında ünvan satırı bulunamadı'
        : sayiTuretilen.length === 0
          ? `${unvan.length} ünvan satırının hiçbirinde türetilmiş miktar yok`
          : `${sayiTuretilen.length}/${unvan.length} ünvan satırında miktar TÜRETİLMİŞ: `
            + sayiTuretilen.map((r: any) => `"${String(r._ad).slice(0, 24)}"→${r._miktar}`).join(' · '));
  }

  // ── (d) İKİNCİ AİLE: TEKLİF NUMARASINDAN PARA DEĞERİ TÜRETİLMEZ ────────
  // (c) tek başına "o dosyaya özel yama" olabilirdi. Bu ikinci aile BAŞKA
  // bir dosya, BAŞKA bir alan (`_toplam`, `_miktar` değil) ve BAŞKA bir
  // mekanizma (`ozetToplamKaynagi`, quantityField değil) üzerinden ölçer.
  // Gerçek hücre: "TEKLİF NO : T25-0121" → eski kural `_toplam = 25`
  // yazıyordu; yani teklif referans numarası PARA olarak grid'e giriyordu.
  {
    const o: any = await g().prepare(fs.readFileSync(BEYKOZ), { fixedSchema: true } as any);
    const sh = o.sheets.find((s: any) => /icmal/i.test(String(s.name).toLocaleLowerCase('tr')))
      ?? o.sheets[0];
    const r = (sh?.rowData ?? []).find((x: any) => x._rowIdx === 5);
    const t = String(r?._toplam ?? '').trim();
    sina('d', 'teklif numarasından ("T25-0121") para değeri türetilmiyor',
      !!r && (t === '' || t === 'null'),
      r ? `r5 _ad="${String(r._ad).slice(0, 20)}" · _toplam=${JSON.stringify(r._toplam)} · _isDataRow=${r._isDataRow}`
        : 'ÖN KOŞUL: r5 bulunamadı');
  }

  console.log('\n── RENK TABLOSU ──');
  console.log(`  (a) başlık satırı veri olmuyor        : ${renk.a}`);
  console.log(`  (b) sütun adı dosyadan geliyor        : ${renk.b}`);
  console.log(`  (c) ünvandan sayı türetilmiyor        : ${renk.c}`);
  console.log(`  (d) teklif numarası para olmuyor      : ${renk.d}`);
  console.log(`\nSONUC: ${pass} PASS, ${fails.length} FAIL`);
  if (fails.length) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
