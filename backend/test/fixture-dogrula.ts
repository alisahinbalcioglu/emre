/**
 * PK3 — ANONIMLESTIRME DOGRULAMA  (`npm run fixture:dogrula -- --orijinal <dizin>`)
 *
 * `fixture-anonim.ts` "SONRA ZORUNLU: parse farki 0 dogrulanir" diyordu ama
 * bu araç YOKTU. Kanitsiz bir "0 fark" iddiasi, tam da bu projede defalarca
 * yasanan "testler yesil, gercek kirik" tuzagi olurdu.
 *
 * IDDIA (tek cumle): anonimlestirme, KIMLIK DIZELERI DISINDA dosyanin
 * hicbir yerini degistirmez.
 *
 * Bu iddia TEK assert ile kapatilamaz — iki bagimsiz katmandan olculur:
 *
 *   D1 · ZIP KATMANI  — Yeni dosyadaki HER girdinin ACILMIS icerigi,
 *        orijinaldekiyle byte-byte ayni olmali. Tek istisna
 *        `xl/sharedStrings.xml`; onun da farki, orijinale haritayi
 *        uygulayinca BIREBIR yeni hali vermeli. Bu, JSZip'in yeniden
 *        paketlemesinin sayfa XML'ini, stilleri, paylasilan formulleri,
 *        vbaProject.bin'i bozmadigini kanitlar (KH11/EX5 sinifi hasar).
 *
 *   D2 · AYRISTIRMA KATMANI — Urunun GERCEK boru hatti
 *        (`ExcelGridService.prepare`, fixedSchema) iki dosyayi da ayristirir.
 *        Orijinalin JSON ciktisina harita uygulanınca yeni dosyanin JSON
 *        ciktisini BIREBIR vermeli. Bu, sayilarin/birimlerin/kolon
 *        rollerinin/satir sayilarinin kaymadigini kanitlar.
 *
 * D1 gecip D2 kalabilir (ayristirici sharedStrings disi bir seye bakiyorsa),
 * D2 gecip D1 kalabilir (ayristiricinin gormedigi bir girdi bozulduysa).
 * Ikisi ayri kriter, ayri assert.
 *
 * ⚠ ORIJINALLER REPODA DEGILDIR ve OLMAMALIDIR. Bu yuzden bu arac CI'da
 * degil, anonimlestirmeyi yapan makinede TEK SEFER kosar. Orijinal dizin
 * verilmezse cikis 2 (= ON KOSUL YOK) — "atlandi"yi "gecti" saymaz.
 *
 * Cikis kodu sozlesmesi: 0 = PASS · 2 = ON KOSUL YOK · diger = FAIL.
 */
import * as fs from 'fs';
import * as path from 'path';
import { KOKLER, kimlikleriDegistir, anonimAd, ustveriTemizle } from './fixture-anonim';
import { ExcelGridService } from '../src/ozellik/giris/excel-grid/excel-grid.service';

let pass = 0;
const fails: string[] = [];
const sina = (kod: string, ad: string, kosul: boolean, kanit: string) => {
  if (kosul) { pass++; console.log(`  ✅ ${kod} ${ad} — ${kanit}`); }
  else { fails.push(`${kod} ${ad} — ${kanit}`); console.log(`  ❌ ${kod} ${ad} — ${kanit}`); }
};

/** `--orijinal <dizin>` BIRDEN COK KEZ verilebilir; sira KOKLER ile eslesir
 *  (1. = test-fixtures/e2e, 2. = backend/test/fixtures). Dizine gore
 *  eslestirmek sart: `yangin-temin-montaj.xlsx` HER IKI dizinde de var. */
function orijinalDizinler(): string[] {
  const liste: string[] = [];
  process.argv.forEach((a, i) => { if (a === '--orijinal' && process.argv[i + 1]) liste.push(process.argv[i + 1]); });
  if (liste.length === 0 && process.env.FIXTURE_ORIJINAL) liste.push(...process.env.FIXTURE_ORIJINAL.split(path.delimiter));
  return liste.map((p) => path.resolve(p));
}

async function ayristir(buf: Buffer): Promise<any> {
  const grid = new ExcelGridService({ brand: { findMany: async () => [] } } as any);
  return grid.prepare(buf, { fixedSchema: true } as any);
}

/**
 * TEK MUAF ALAN — `standart-sema.ts:193`:
 *   `yeni._miktarCozulemedi = String(hamMiktar).slice(0, 20)`
 * Bu alan ham hucrenin 20 KARAKTERLIK ON EKIDIR. Kimlik dizeleri farkli
 * uzunlukta oldugu icin 20'lik pencere ZORUNLU olarak baska bir yere duser
 * ("FIRMA-C ENTEGRE KARTE" ↔ "FIRMA-C ENTEGRE SAHA"). Icerigi bir TANI
 * yankisidir, hicbir karar ona bakmaz.
 *
 * ⚠ MUAFIYET SESSIZ DEGIL: alanin KENDISI muaf, ama "hangi satirlarda VAR"
 * sorusu D3'te BIREBIR sinanir. Yani "miktar cozulemedi" karari degisirse
 * kirmizi yanar; degisen yalniz yankinin penceresidir.
 */
const MUAF_ALAN = '_miktarCozulemedi';

/** Iki agaci paralel gezer, TUM farkli yollari toplar (ilk farkta durmaz). */
function farklariTopla(a: any, b: any, harita: (s: string) => string, yol = '', out: string[] = [], muaf: string[] = []): { fark: string[]; muaf: string[] } {
  const son = yol.split('.').pop() ?? '';
  if (typeof a === 'string' && typeof b === 'string') {
    if (harita(a) !== b) (son === MUAF_ALAN ? muaf : out).push(`${yol}: ${JSON.stringify(harita(a))} → ${JSON.stringify(b)}`);
    return { fark: out, muaf };
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    // Sayilar da kimlik tasiyabilir: BEYKOZ dosyasinda sahsi telefon
    // `miktarNormalize` tarafindan 905058851564 SAYISINA cevriliyor. Kimlik
    // iki temsilde birden var; harita ikisini de kapsar (fixture-anonim.ts).
    if (a !== b && !(typeof a === 'number' && typeof b === 'number' && harita(String(a)) === String(b))) {
      out.push(`${yol}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
    }
    return { fark: out, muaf };
  }
  if (Array.isArray(a) !== Array.isArray(b)) { out.push(`${yol}: dizi/nesne uyusmazligi`); return { fark: out, muaf }; }
  if (Array.isArray(a)) {
    if (a.length !== b.length) { out.push(`${yol}: dizi uzunlugu ${a.length} → ${b.length}`); return { fark: out, muaf }; }
    for (let i = 0; i < a.length; i++) farklariTopla(a[i], b[i], harita, `${yol}[${i}]`, out, muaf);
    return { fark: out, muaf };
  }
  const ka = Object.keys(a), kb = Object.keys(b);
  const eksik = ka.filter((k) => !kb.includes(k)), fazla = kb.filter((k) => !ka.includes(k));
  if (eksik.length || fazla.length) out.push(`${yol}: alan kumesi degisti (eksik: ${eksik.join(',') || '-'} · fazla: ${fazla.join(',') || '-'})`);
  for (const k of ka) if (kb.includes(k)) farklariTopla(a[k], b[k], harita, yol ? `${yol}.${k}` : k, out, muaf);
  return { fark: out, muaf };
}

/** Muaf alanin VARLIK haritasi — hangi yollarda tanimli? Karar degismemeli. */
function muafVarlikYollari(kok: any, yol = '', out: string[] = []): string[] {
  if (kok === null || typeof kok !== 'object') return out;
  if (Array.isArray(kok)) { kok.forEach((v, i) => muafVarlikYollari(v, `${yol}[${i}]`, out)); return out; }
  for (const k of Object.keys(kok)) {
    const y = yol ? `${yol}.${k}` : k;
    if (k === MUAF_ALAN) out.push(y); else muafVarlikYollari(kok[k], y, out);
  }
  return out;
}

async function main() {
  const ORJLER = orijinalDizinler();
  if (ORJLER.length === 0 || ORJLER.some((p) => !fs.existsSync(p))) {
    console.log('ON KOSUL YOK — orijinal dizin(ler) verilmedi/bulunamadi.');
    console.log('  Kullanim: npm run fixture:dogrula -- --orijinal "<e2e-yedek>" --orijinal "<backend-yedek>"');
    console.log('  (veya FIXTURE_ORIJINAL ortam degiskeni, ; ile ayrilmis)');
    process.exit(2);
  }
  if (ORJLER.length !== KOKLER.length) {
    console.log(`ON KOSUL YOK — ${KOKLER.length} fixture dizini var, ${ORJLER.length} yedek verildi.`);
    console.log(`  Beklenen sira: ${KOKLER.join(' , ')}`);
    process.exit(2);
  }

  const JSZip = require('jszip');
  const cift: Array<{ ORJ: string; KOK: string; ad: string }> = [];
  for (let i = 0; i < KOKLER.length; i++) {
    if (!fs.existsSync(KOKLER[i])) { console.log(`ON KOSUL YOK — ${KOKLER[i]} yok`); process.exit(2); }
    for (const f of fs.readdirSync(ORJLER[i]).filter((x) => /\.(xlsx|xlsm)$/i.test(x))) {
      cift.push({ ORJ: ORJLER[i], KOK: KOKLER[i], ad: f });
    }
  }
  if (cift.length === 0) { console.log('ON KOSUL YOK — yedeklerde xlsx/xlsm yok'); process.exit(2); }

  console.log('── PK3 ANONIMLESTIRME DOGRULAMA ──');
  ORJLER.forEach((o, i) => console.log(`   ${o}\n   → ${KOKLER[i]}`));
  console.log(`   ${cift.length} dosya\n`);

  for (const { ORJ, KOK, ad: orjAd } of cift) {
    const yeniAd = anonimAd(orjAd);
    const orjYol = path.join(ORJ, orjAd);
    const yeniYol = path.join(KOK, yeniAd);
    console.log(`  ── ${orjAd}${yeniAd !== orjAd ? `  →  ${yeniAd}` : ''}`);

    if (!fs.existsSync(yeniYol)) {
      sina('D1', yeniAd, false, 'anonimlestirilmis karsiligi YOK (anonim kosulmamis olabilir)');
      sina('D2', yeniAd, false, 'anonimlestirilmis karsiligi YOK');
      continue;
    }

    const orjBuf = fs.readFileSync(orjYol);
    const yeniBuf = fs.readFileSync(yeniYol);

    // ══ D1 · ZIP KATMANI ════════════════════════════════════════════════
    const zOrj = await JSZip.loadAsync(orjBuf);
    const zYeni = await JSZip.loadAsync(yeniBuf);
    const adlarOrj = Object.keys(zOrj.files).filter((n) => !zOrj.files[n].dir).sort();
    const adlarYeni = Object.keys(zYeni.files).filter((n) => !zYeni.files[n].dir).sort();

    const bozuk: string[] = [];
    if (adlarOrj.join('|') !== adlarYeni.join('|')) {
      bozuk.push(`ZIP girdi listesi degisti (${adlarOrj.length} → ${adlarYeni.length})`);
    } else {
      for (const g of adlarOrj) {
        const a: Buffer = await zOrj.file(g).async('nodebuffer');
        const b: Buffer = await zYeni.file(g).async('nodebuffer');
        if (g === 'xl/sharedStrings.xml') {
          // Izinli fark 1: kimlik haritasinin kendisi.
          const beklenen = kimlikleriDegistir(a.toString('utf8')).cikti;
          if (beklenen !== b.toString('utf8')) bozuk.push('sharedStrings.xml haritanin OTESINDE degismis');
        } else if (g === 'docProps/core.xml' || g === 'docProps/app.xml') {
          // Izinli fark 2: ustveri temizligi (kisi/sirket adlari). Orijinale
          // temizlik uygulanınca YENI hali cikmali — fazlasi degil.
          const beklenen = ustveriTemizle(a.toString('utf8')).cikti;
          if (beklenen !== b.toString('utf8')) bozuk.push(`${g} temizligin OTESINDE degismis`);
        } else if (!a.equals(b)) {
          bozuk.push(`${g} degismis (${a.length} → ${b.length} byte)`);
        }
      }
    }
    sina('D1', `${yeniAd} · ZIP katmani`, bozuk.length === 0,
      bozuk.length === 0
        ? `${adlarOrj.length} girdinin ${adlarOrj.length - 1}'i byte-byte ayni, sharedStrings farki tam olarak harita`
        : bozuk.slice(0, 3).join(' | '));

    // ══ D2/D3 · AYRISTIRMA KATMANI ══════════════════════════════════════
    let pOrj: any = null, pYeni: any = null, hata = '';
    try { pOrj = await ayristir(orjBuf); } catch (e) { hata = `orijinal ayristirilamadi: ${(e as Error).message}`; }
    try { pYeni = await ayristir(yeniBuf); } catch (e) { hata = hata || `yeni ayristirilamadi: ${(e as Error).message}`; }

    if (hata) {
      sina('D2', `${yeniAd} · ayristirma`, false, hata);
      sina('D3', `${yeniAd} · tanı kararı`, false, hata);
      continue;
    }

    const { fark, muaf } = farklariTopla(pOrj, pYeni, (s) => kimlikleriDegistir(s).cikti);
    sina('D2', `${yeniAd} · ayristirma`, fark.length === 0,
      fark.length === 0
        ? `prepare() ciktisi birebir ayni${muaf.length ? ` (${muaf.length} kisaltma penceresi kaymasi — D3 sinar)` : ''}`
        : `${fark.length} fark · ${fark.slice(0, 3).join(' | ')}`);

    // D3 — muaf alan SESSIZ GECMEZ: "hangi satirlarda miktar cozulemedi"
    // karari birebir ayni mi? Degisseydi fixture baska bir davranis olcerdi.
    const yOrj = muafVarlikYollari(pOrj), yYeni = muafVarlikYollari(pYeni);
    sina('D3', `${yeniAd} · tanı kararı (${MUAF_ALAN})`,
      yOrj.join('|') === yYeni.join('|'),
      yOrj.join('|') === yYeni.join('|')
        ? `${yOrj.length} satırda çözülemedi — aynı satırlar`
        : `satır kümesi değişti: ${yOrj.length} → ${yYeni.length}`);
  }

  console.log(`\nSONUC: ${pass} PASS, ${fails.length} FAIL`);
  if (fails.length) { fails.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
  console.log('PARSE FARKI 0 — anonimlestirme kimlik disinda hicbir seyi degistirmedi.');
}
main().catch((e) => { console.error(e); process.exit(1); });
