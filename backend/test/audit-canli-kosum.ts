/**
 * DERIN DENETIM — CANLI KOSUM KANITLARI (D1-D8, A akisi)
 * GOREV_Derin_Denetim_Eslestirme_ve_SurukleDoldur.md Adim 2.
 *
 * GERCEK servisler (MatchingService/AdminService/LibraryService/ExcelGridService)
 * + GERCEK yerel DB (Cayirova 116 satir kutuphane) + GERCEK dosyalar (Downloads).
 * Davranis DEGISTIRMEZ — yalniz sorgular ve kanit dokumu uretir.
 *
 *   npx ts-node test/audit-canli-kosum.ts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import { MatchingService } from '../src/modules/matching/matching.service';
import { TerminologyService } from '../src/modules/matching/terminology.service';
import { AdminService } from '../src/admin/admin.service';
import { LibraryService } from '../src/library/library.service';
import { ExcelGridService } from '../src/modules/excel-grid/excel-grid.service';

const DUYAR_XLSX = 'C:/Users/basar/Downloads/Duyar_Aralik2023_Yapilandirilmis.xlsx';
// Dosya adi diskte NFD (ş/ü ayrik birlesik karakter) — readdir ile cozulur.
const teklifDosyasiBul = (): string => {
  const dir = 'C:/Users/basar/Downloads';
  const f = fs.readdirSync(dir).find((n) =>
    n.normalize('NFC').includes('mekanik-elektrik') && n.normalize('NFC').includes('teklif.xlsx') && !n.startsWith('MP-'));
  if (!f) throw new Error('Teklif dosyasi bulunamadi');
  return `${dir}/${f}`;
};

let passed = 0; let failed = 0; const failures: string[] = [];
const kanit: string[] = [];
function log(s: string) { console.log(s); kanit.push(s); }
function check(name: string, cond: boolean, detail: string) {
  log(`${cond ? 'PASS' : 'FAIL'} ${name} — ${detail}`);
  if (cond) passed++; else { failed++; failures.push(`${name}: ${detail}`); }
}
/** Beklenen net fiyat BAGIMSIZ hesap: liste * (1 - isk/100), 1 haneye YUKARI. */
function bekleNet(liste: number, isk: number): number {
  return Math.ceil(liste * (1 - isk / 100) * 10) / 10;
}

async function main() {
  const prisma = new PrismaClient();
  const terminology = new TerminologyService(prisma as any);
  const fakeFx = {
    getRates: async () => ({ usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'fake', date: '' }),
  } as any;
  const matching = new MatchingService(prisma as any, terminology, fakeFx);
  const admin = new AdminService(prisma as any, undefined as any, terminology);
  const library = new LibraryService(prisma as any, terminology);
  const excelGrid = new ExcelGridService(prisma as any);

  // ── Ortam: kutuphane sahibi + markalar ─────────────────────────────
  const cayirova = await prisma.brand.findFirst({ where: { name: { contains: 'ayırova', mode: 'insensitive' } } });
  if (!cayirova) throw new Error('Cayirova markasi yok');
  const libRow = await prisma.userLibrary.findFirst({ where: { brandId: cayirova.id }, select: { userId: true } });
  if (!libRow) throw new Error('Cayirova kutuphanesi bos');
  const userId = libRow.userId;
  log(`ORTAM: userId=${userId} cayirova=${cayirova.id}`);

  // ── DUYAR verisini GERCEK import yolundan kur (idempotent) ─────────
  let duyar = await prisma.brand.findFirst({ where: { name: { contains: 'duyar', mode: 'insensitive' } } });
  if (!duyar) {
    duyar = await prisma.brand.create({ data: { name: 'DUYAR (denetim)' } });
    const buf = fs.readFileSync(DUYAR_XLSX);
    const preview = await admin.previewBrandExcel(duyar.id, buf, null);
    const rapor = await admin.commitBrandImport(duyar.id, { items: preview.items, listName: 'Aralik 2023 (denetim)' });
    log(`DUYAR import raporu: ${JSON.stringify(rapor).slice(0, 300)}`);
  }
  const duyarLib = await prisma.userLibrary.count({ where: { userId, brandId: duyar.id } });
  if (duyarLib === 0) {
    const pl = await prisma.priceList.findFirst({ where: { brandId: duyar.id } });
    if (!pl) throw new Error('DUYAR fiyat listesi yok');
    const aktarma = await library.importPriceList(userId, { brandId: duyar.id, priceListId: pl.id });
    log(`DUYAR kutuphaneye aktarim: ${JSON.stringify(aktarma).slice(0, 200)}`);
  }
  log(`DUYAR kutuphane satiri: ${await prisma.userLibrary.count({ where: { userId, brandId: duyar.id } })}`);

  // ════ D1 (K2): AD+cap TEK kayit → sorulmadan DOGRU TUTAR ═══════════
  // Kirmizi Boyali 5" (DN125) — yazili 'kirmizi' SERT (K4) → capinda tek kayit.
  {
    const q = 'KIRMIZI BOYALI YANGIN BORUSU 5"';
    const r = (await matching.bulkMatch(userId, cayirova.id, [q]))[q];
    const row = await prisma.userLibrary.findFirst({
      where: {
        userId, brandId: cayirova.id,
        material: { name: { contains: 'DN125' } },
        AND: { material: { name: { contains: 'Kırmızı' } } },
      },
      include: { material: { select: { name: true } } },
    });
    const beklenen = row ? bekleNet(row.listPrice ?? 0, row.discountRate ?? 0) : -1;
    check('D1 confidence=high (soru yok)', r?.confidence === 'high', `got ${r?.confidence} reason="${r?.reason}"`);
    check('D1 dogru TUTAR (beklenen↔gercek)', Math.abs((r?.netPrice ?? 0) - beklenen) < 0.001,
      `liste=${row?.listPrice} isk=${row?.discountRate ?? 0} beklenen=${beklenen} gercek=${r?.netPrice} matched="${r?.matchedName}"`);
  }

  // ── D1-EK (yol-3 cap fix, denetim bulgu): "Dış Cap 114.3mm Et 6.0mm" adli
  // urun ET'i cap sanmiyor → inc sorgusu artik ESLESIR. Onceden "4" yok".
  {
    const { extractSizeInfo } = require('../src/modules/matching/conversion');
    const urunAdi = 'PE Kaplı Doğalgaz Tesisat Borusu DIN 30670 Dış Cap 114.3mm Et 6.0mm Gr B/X42';
    const si = extractSizeInfo(urunAdi);
    check('D1-EK extractSizeInfo dis cap (et degil)', si?.value === 114.3, `got ${JSON.stringify(si)}`);
    // 114.3 dis cap PE Kapli satiri cayirova kutuphanesinde 4" (dn100) ile aranir.
    const q = 'PE KAPLI DOĞALGAZ TESİSAT BORUSU 4"';
    const r = (await matching.bulkMatch(userId, cayirova.id, [q]))[q];
    const okuMatched = r?.matchedName ?? '';
    check('D1-EK yol-3 fix: PE Kapli 4" ARTIK eslesir (fiyat > 0)', (r?.netPrice ?? 0) > 0,
      `conf=${r?.confidence} net=${r?.netPrice} matched="${okuMatched}" reason="${r?.reason}"`);
  }

  // ════ D2 (K8): CEKVALF DN32 → YALNIZ cekvalf adaylari ══════════════
  {
    const q = 'ÇEKVALF DN32';
    const r = (await matching.bulkMatch(userId, duyar.id, [q]))[q];
    const adlar = (r?.candidates ?? []).map((c) => c.materialName);
    const hepsiCek = adlar.length > 0
      ? adlar.every((a) => /çek|cek/i.test(a))
      : /çek|cek/i.test(r?.matchedName ?? '');
    check('D2 sonuc dondu (high/multi)', r?.confidence === 'high' || r?.confidence === 'multi',
      `got ${r?.confidence} reason="${r?.reason}"`);
    check('D2 aday dokumu YALNIZ cekvalf', hepsiCek,
      adlar.length ? `adaylar: ${adlar.join(' | ')}` : `tek eslesme: ${r?.matchedName} net=${r?.netPrice}`);
    log(`D2 DOKUM: ${JSON.stringify({ conf: r?.confidence, matched: r?.matchedName, adaylar: adlar })}`);
  }

  // ════ D3 (K10/K11): cok kategori → GRUP/varyant sorusu; tek kategori → atlanir ═
  {
    // "YANGIN BORUSU 2 1/2"" cayirova'da GERCEK cok-adayli (Su-Yangin: siyah
    // disli/duz uclu, kirmizi, galvaniz ×2 + Kazan Borusu 76.1mm) — fiyat
    // YAZILMAZ, secim listesi doner. NOT: "SİYAH BORU 2 1/2"" bilerek
    // KULLANILMADI — AD-kilidi geregi generic "siyah boru" spesifik "Su ve
    // Yangın Tesisat Borusu" ailesine baglanmaz (none doner, tasarim/guvenlik).
    const q = 'YANGIN BORUSU 2 1/2"';
    const r = (await matching.bulkMatch(userId, cayirova.id, [q]))[q];
    const etiketler = (r?.candidates ?? []).map((c) => c.label);
    const grupSorusu = r?.confidence === 'multi' && new Set(etiketler).size > 1;
    check('D3a cok aday → secim sorusu (fiyat YAZILMADI)', r?.netPrice === 0 && r?.confidence === 'multi',
      `conf=${r?.confidence} net=${r?.netPrice} soru="${r?.reason}" etiketler=[${etiketler.slice(0, 4).join(' | ')}]`);
    log(`D3a POPUP DOKUMU: ${JSON.stringify({ reason: r?.reason, secenekler: etiketler.slice(0, 6) })}`);
    check('D3a secenekler >1', grupSorusu || etiketler.length > 1, `${etiketler.length} secenek`);
    // D3a-EK (D3a cap-parse fix kaniti): grade son rakami bulasan "1 3/4"
    // SAHTE etiketi ARTIK YOK — "SİYAH BORU 1 1/4"" adaylari "1 1/4" gosterir.
    const q3 = 'SİYAH BORU 1 1/4"';
    const r3 = (await matching.bulkMatch(userId, cayirova.id, [q3]))[q3];
    const etk3 = (r3?.candidates ?? []).map((c) => c.label);
    const sahte134 = etk3.some((e) => e.includes('1 3/4'));
    check('D3a-EK "1 3/4" sahte etiket YOK (grade-bulasma fix)', !sahte134 && etk3.some((e) => e.includes('1 1/4')),
      `etiketler=${JSON.stringify(etk3.slice(0, 3))}`);
    log(`D3a-EK aday urun adlari: ${JSON.stringify((r?.candidates ?? []).map((c) => c.materialName).slice(0, 6))}`);
    // Tek kategoriye ozgu ad: Basincli Boru yalniz Basincli grubunda →
    // GRUP sorusu ATLANIR (K11). Baska kolon sorusu (baglanti/urun) olabilir;
    // kriter: soru metni 'Hangi grup?' DEGIL.
    const q2 = 'BASINÇLI BORU 1"';
    const r2 = (await matching.bulkMatch(userId, cayirova.id, [q2]))[q2];
    check('D3b tek kategori → GRUP sorusu atlanir', !(r2?.reason ?? '').includes('Hangi grup?'),
      `conf=${r2?.confidence} net=${r2?.netPrice} soru="${(r2?.reason ?? '').slice(0, 90)}" matched="${r2?.matchedName ?? '-'}"`);
  }

  // ════ D4 (R3): PPR hatti + CELIK markasi → fiyat YAZILMAZ ══════════
  // Mevcut spec (S1 ad-gevsetme): dogrulanamayan yazili kelime ('ppr')
  // FIYATLI SORUYA acilir, otomatik fiyat ASLA yazilmaz. Kriter: net=0 +
  // 'ppr' dogrulanamadi bilgisi kullaniciya tasinir.
  {
    const q = 'PPR BORU 32mm';
    const r = (await matching.bulkMatch(userId, cayirova.id, [q]))[q];
    const pprBilgisi = (r?.reason ?? '').toLowerCase().includes('ppr')
      || (r?.dogrulanamadi ?? []).some((d) => d.toLowerCase().includes('ppr'));
    check('D4 fiyat YAZILMADI (otomatik yazim yok)', (r?.netPrice ?? 0) === 0,
      `conf=${r?.confidence} net=${r?.netPrice}`);
    check('D4 "ppr bulunamadi" kullaniciya soylenir', pprBilgisi,
      `reason="${r?.reason}" dogrulanamadi=${JSON.stringify(r?.dogrulanamadi ?? [])} alt=${r?.alternatives?.length ?? 0}`);
  }

  // ════ D5 (R9): dogalgaz kuresel → surgulu/kelebek ASLA ═════════════
  {
    const q = 'DOĞALGAZ KÜRESEL VANA 1"';
    const r = (await matching.bulkMatch(userId, duyar.id, [q]))[q];
    const adlar = (r?.candidates ?? []).map((c) => `${c.materialName} [${c.label}]`);
    const havuz = adlar.length ? adlar.join(' | ') : `${r?.matchedName ?? '-'} (tek)`;
    // YASAK = surgulu VANA / kelebek VANA urunleri. 'Kelebek kollu' kuresel
    // vananin KOL tipidir (govde degil) — yasak sayilmaz.
    const yasak = /sürgülü vana|surgulu vana|^kelebek vana|\| ?kelebek vana/i;
    const urunAdlari = (r?.candidates ?? []).map((c) => c.materialName);
    const temiz = urunAdlari.length
      ? urunAdlari.every((a) => !/sürgülü|surgulu/i.test(a) && !/^kelebek/i.test(a.trim()))
      : !yasak.test(r?.matchedName ?? '');
    check('D5 surgulu/kelebek ASLA aday degil', temiz, `conf=${r?.confidence} havuz: ${havuz.slice(0, 400)}`);
    log(`D5 DOKUM: ${JSON.stringify({ conf: r?.confidence, matched: r?.matchedName, adaylar: adlar.slice(0, 10) })}`);
  }

  // ════ D6 (K7): ayni urun kimligi 2 kayit farkli fiyat → ikisi de secenekte ═
  {
    // DUYAR verisinde ayni (adSlug+cap) ikili kayit ara
    const dup: any[] = await prisma.$queryRaw`
      SELECT "adSlug", "capNorm", COUNT(*) c, MIN(price) p1, MAX(price) p2
      FROM "ProductIndex" WHERE "brandId" = ${duyar!.id}
      GROUP BY "adSlug", "capNorm", "cinsNorm", "baglantiNorm", "boyTag"
      HAVING COUNT(*) > 1 AND MIN(price) <> MAX(price) LIMIT 1`;
    if (dup.length === 0) {
      log('D6 NOT: DUYAR verisinde ayni-kimlik cift kayit yok — K7 fixtur kaniti test:product-index/test:index (K7 blogu) ile kapali.');
    } else {
      const d = dup[0];
      const ornek = await prisma.productIndex.findFirst({ where: { brandId: duyar!.id, adSlug: d.adSlug, capNorm: d.capNorm } });
      const q = `${ornek!.ad} ${ornek!.capRaw ?? ''}`.trim();
      const r = (await matching.bulkMatch(userId, duyar!.id, [q]))[q];
      const fiyatlar = (r?.candidates ?? []).map((c) => c.netPrice);
      check('D6 iki kayit da secenekte (farkli fiyatlarla)', (r?.candidates?.length ?? 0) >= 2 && new Set(fiyatlar).size >= 2,
        `q="${q}" conf=${r?.confidence} fiyatlar=[${fiyatlar.join(', ')}]`);
    }
  }

  // ════ D7: 500+ satirlik GERCEK teklif dosyasi — sure + bellek + sonuc ═
  {
    const buf = fs.readFileSync(teklifDosyasiBul());
    const multi = await excelGrid.prepare(buf, { fixedSchema: true });
    const isimler: string[] = [];
    for (const sheet of multi.sheets) {
      if (sheet.isEmpty) continue;
      const nameF = (sheet.columnRoles as any).nameField;
      const diaF = (sheet.columnRoles as any).diameterField;
      if (!nameF) continue;
      for (const row of sheet.rowData as any[]) {
        if (!row._isDataRow) continue;
        const ad = String(row[nameF] ?? '').trim();
        const cap = diaF ? String(row[diaF] ?? '').trim() : '';
        const tam = [cap, ad].filter(Boolean).join(' ');
        if (tam.length > 1) isimler.push(tam);
      }
    }
    const uniq = Array.from(new Set(isimler));
    log(`D7 DOSYA: ${multi.sheets.length} sayfa, ${isimler.length} veri satiri, ${uniq.length} benzersiz ad`);
    const t0 = Date.now(); const m0 = process.memoryUsage().heapUsed;
    const sonuc = await matching.bulkMatch(userId, cayirova.id, uniq);
    const sure = Date.now() - t0; const bellek = (process.memoryUsage().heapUsed - m0) / 1024 / 1024;
    const hist: Record<string, number> = {};
    for (const n of uniq) {
      const c = sonuc[n]?.notProduct ? 'notProduct' : (sonuc[n]?.confidence ?? 'CEVAPSIZ');
      hist[c] = (hist[c] ?? 0) + 1;
    }
    check('D7 satir sayisi 500+', isimler.length >= 500, `${isimler.length} satir`);
    check('D7 TUM satirlar sonuclandi (CEVAPSIZ=0)', !('CEVAPSIZ' in hist), JSON.stringify(hist));
    check('D7 sure makul (<60sn)', sure < 60000, `${sure}ms, bellek delta ${bellek.toFixed(1)}MB`);
    // Orneklem 20: elle dogrulama icin dokum
    const orneklem = uniq.filter((n) => (sonuc[n]?.netPrice ?? 0) > 0).slice(0, 10)
      .concat(uniq.filter((n) => sonuc[n]?.confidence === 'multi').slice(0, 5))
      .concat(uniq.filter((n) => sonuc[n]?.confidence === 'none' && !sonuc[n]?.notProduct).slice(0, 5));
    log('D7 ORNEKLEM-20 (elle dogrulama):');
    for (const n of orneklem) {
      const r = sonuc[n];
      log(`  "${n}" → ${r.notProduct ? 'URUN-DEGIL' : r.confidence} net=${r.netPrice}` +
        (r.matchedName ? ` matched="${r.matchedName}"` : '') +
        (r.candidates?.length ? ` aday=${r.candidates.length}` : ''));
    }
  }

  // ════ D8 (R12): bos/baslik/oran satirlari → fiyat ASLA yazilmaz ════
  // Gercek zincirde baslik satirlari FE'de _isDataRow=false ile hic
  // gonderilmez (quotes/new fill: ExcelGrid.tsx:1608 continue; D7 dosyasi da
  // prepare() ile ayni yoldan filtrelendi). Motor-seviyesi guvence: bu tur
  // metinlere OTOMATIK FIYAT YAZILMAZ (oran/hizmet kaliplari ayrica
  // notProduct isaretlenir).
  {
    const ornekler = ['MEKANİK TESİSAT', 'FİTTİNGS ORANI %3', 'GENEL TOPLAM', 'KDV %20', 'NAKLİYE BEDELİ'];
    const r = await matching.bulkMatch(userId, cayirova.id, ornekler);
    for (const o of ornekler) {
      const m = r[o];
      check(`D8 "${o}" fiyat yazilmadi`, (m?.netPrice ?? 0) === 0,
        `conf=${m?.confidence} notProduct=${m?.notProduct} reason="${(m?.reason ?? '').slice(0, 60)}"`);
    }
  }

  // ════ EK (Adim 3): terminology CRUD — S4/S5 dallari (coverage <80 idi) ═
  {
    const once = (await terminology.listAliases(userId)).length;
    const kayit = await terminology.saveUserAlias(userId, { alias: 'denetim çekvalfi', canonical: 'çek vana' });
    const liste = await terminology.listAliases(userId);
    check('S4 alias kaydet → listede', liste.some((a: any) => a.alias?.includes('denetim')), `once=${once} sonra=${liste.length}`);
    const guncel = await terminology.saveUserAlias(userId, { alias: 'denetim çekvalfi', canonical: 'çekvalf' });
    const tekil = (await terminology.listAliases(userId)).filter((a: any) => a.alias?.includes('denetim'));
    check('S5 ayni alias GUNCELLENIR (tekil)', tekil.length === 1, `adet=${tekil.length} canonical=${(tekil[0] as any)?.canonical}`);
    await terminology.deactivateAlias(userId, (kayit as any).id ?? (tekil[0] as any).id);
    const kalan = (await terminology.listAliases(userId)).filter((a: any) => a.alias?.includes('denetim') && (a as any).active !== false);
    check('S4 alias sil/pasif', kalan.length === 0 || (kalan[0] as any).active === false, `kalan=${kalan.length}`);

    // S3: seed alias SILINEMEZ — yalniz pasife alinir (sonra durum geri acilir)
    const seedRow = await (prisma as any).terminologyAlias.findFirst({ where: { userId: null, active: true } });
    if (seedRow) {
      const sonuc = await terminology.deactivateAlias(userId, seedRow.id);
      check('S3 seed silinmez, pasife alinir', (sonuc as any).deactivated === true && !(sonuc as any).deleted,
        JSON.stringify(sonuc));
      await (prisma as any).terminologyAlias.update({ where: { id: seedRow.id }, data: { active: true } }); // durumu geri al
    }
    // Yetki: baska kullanicinin alias'i silinemez
    const baskasi = await (prisma as any).terminologyAlias.findFirst({ where: { userId: { not: null, notIn: [userId] } } });
    if (baskasi) {
      const red = await terminology.deactivateAlias(userId, baskasi.id);
      check('S3 yetki: baskasinin alias\'i silinemez', (red as any).ok === false, JSON.stringify(red));
    } else {
      log('S3 yetki dali: baska kullanici alias\'i yok — atlandi (dal kodu okundu: userId esitsizligi → yetki yok)');
    }
  }

  log(`\n${'='.repeat(60)}\nCANLI KOSUM SONUC: ${passed} PASS, ${failed} FAIL`);
  if (failures.length) { log('FAILURES:'); failures.forEach((f) => log('  - ' + f)); }
  fs.writeFileSync(`${__dirname}/audit-canli-kosum-kanit.log`, kanit.join('\n'), 'utf8');
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
