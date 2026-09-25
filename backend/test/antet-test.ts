/**
 * TEKLIF CIKTISI ANTETI (plan 4.4 — hesap dogrulugu turu, 13.09.2026)
 *   npx ts-node test/antet-test.ts   (npm run test:antet)
 *
 * Iki kez ertelenmis maddenin riski: antet satirlari tabloyu asagi kaydirir;
 * SUM araliklari satir numarasina gomuluyse ICMAL sessizce yanlis toplar.
 * Bu kapi uc seyi ayni anda ister:
 *  1. Antetli ve antetsiz ciktida ICMAL (formulun HUCRELERDEN yeniden hesabi)
 *     ve fiyatli GENEL TOPLAM BIREBIR ayni — gercek dosyalarla (AN1).
 *  2. Bilgi yoksa satir yok: "[FİRMA UNVANI]", "Tel: " gibi artik basilmaz;
 *     tehlikeli yedekler (ad, giris e-postasi, TC kimlik) sizmaz (AN2-AN3).
 *  3. Logo: PNG/JPEG gomulur, WEBP ve bozuk gorsel KIRIK KUTU birakmaz,
 *     okuma hatasi ciktiyi dusurmez (AN4-AN5).
 * Ayrica: donmus bolme basligin altinda, iki yol AYNI firma kaydini
 * `k.firmaId` ile okur (baglanti), format sayfalarina dokunulmaz (AN2),
 * kullanici formatinin kendi logosu tek kalir (AN6).
 *
 * Cikis kodu: 0 = PASS · 1 = FAIL.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { QuotesService } from '../src/ozellik/teklif/quotes/quotes.service';
import { ExcelGridService } from '../src/ozellik/giris/excel-grid/excel-grid.service';
import { antetKur, antetLogoNotu, gorselBoyutu, ANTET_FIRMA_ALANLARI } from '../src/ozellik/cikti/utils/antet';
import { TAM_FIRMA, JPEG_1PX, WEBP_BASLIK, pngUret, gercek, formulDenetimi } from './cikti-test-yardimci';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

const FE = require('../../frontend/ozellik/fiyat/pricing');
const K = (v: number): number => FE.kurusTamsayi(v);

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const ROLLER = {
  noField: '_no', nameField: '_ad', quantityField: '_miktar', unitField: '_birim',
  materialUnitPriceField: '_matBirim', materialTotalField: '_matToplam',
  laborUnitPriceField: '_labBirim', laborTotalField: '_labToplam',
};
const veri = (no: number, ad: string, mT: string, lT = '', ek: any = {}) => ({
  _isDataRow: true, _no: String(no), _ad: ad, _miktar: 1, _birim: 'Ad.', _matBirim: mT, _matToplam: mT, _labBirim: lT, _labToplam: lT, ...ek,
});
const sentetik = () => [
  { name: 'Mekanik', isEmpty: false, columnRoles: ROLLER, rowData: [
    { _isDataRow: false, _ad: 'KAT 1' }, veri(1, 'Boru', '15230', '2500'), veri(2, 'Vana', '6002.5'),
    veri(0, 'ARA TOPLAM', '21232.5', '2500', { _ozet: true }), veri(3, 'Pompa', '10.075', '1.015'),
  ] },
  { name: 'Elektrik', isEmpty: false, columnRoles: ROLLER, rowData: [veri(1, 'Kablo', '10675', '875')] },
];

interface Kayit { firmaSorgulari: any[] }
function servis(sheets: any[], firma: any, ek: { firmaHatasi?: boolean; formatBytes?: Buffer } = {}) {
  const kayit: Kayit = { firmaSorgulari: [] };
  const quote: any = {
    id: 'q1', firmaId: 'f-antet', title: 'Antet Turu', sheets, originalFile: Buffer.from('x'), quoteNo: null, rev: 0,
    musteri: 'Müşteri A.Ş.', proje: 'Proje', hazirlayan: 'H', gecerlilik: '30 gün', exportOverrides: null, displayCurrency: 'TRY',
    formatId: ek.formatBytes ? 'fmt1' : null,
  };
  const prisma: any = {
    $transaction: async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma)),
    quote: { findFirst: async () => quote, count: async () => 0, update: async ({ data }: any) => Object.assign(quote, data) },
    quoteFormat: { findFirst: async () => (ek.formatBytes ? { id: 'fmt1', name: 'Kullanıcı formatı', fileBytes: ek.formatBytes, isDefault: true, mapping: null } : null) },
    quoteExport: { create: async () => ({}) },
    firma: {
      findUnique: async (arg: any) => {
        kayit.firmaSorgulari.push(arg);
        if (ek.firmaHatasi) throw new Error('db baglantisi koptu');
        return firma;
      },
    },
  };
  const fx: any = { getRates: async () => ({ usdTry: 47.35, eurTry: 54.1, source: 'tcmb', date: '12.09.2026' }) };
  return { svc: new QuotesService(prisma, fx, { onbellekHaritasi: async () => ({}) } as any), kayit };
}
const KIM: any = { userId: 'u1', firmaId: 'f-antet', teklifKapsami: 'firma' };

async function ac(buf: Buffer | ArrayBuffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  return wb;
}
async function ikiYol(sheets: any[], firma: any, ek: { firmaHatasi?: boolean; formatBytes?: Buffer } = {}) {
  const { svc, kayit } = servis(sheets, firma, ek);
  const priced = await svc.exportPricedXlsx(KIM, 'q1');
  const format = await svc.exportXlsx(KIM, 'q1');
  return { pw: await ac(priced.buffer), fw: await ac(format.buffer), kayit, priced, format };
}

const hucreMetni = (v: any): string => (v && typeof v === 'object'
  ? (Array.isArray(v.richText) ? v.richText.map((x: any) => x.text).join('') : v.formula ? '' : String(v.text ?? ''))
  : String(v ?? ''));
function tumMetin(wb: ExcelJS.Workbook): string[] {
  const m: string[] = [];
  wb.eachSheet((ws) => ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => {
    const t = hucreMetni(c.value); if (t) m.push(`${ws.name}!${c.address}=${t}`);
  })));
  return m;
}
/** "No | Malzeme Adı" baslik satirinin numarasi (standart tablo). 23.09: antetsiz
 *  duzende 4 (ustunde 3 satirlik baslik blogu: teklif adi · sayfa adi+tarih · cizgi). */
function baslikSatiri(ws: ExcelJS.Worksheet): number {
  for (let r = 1; r <= Math.min(ws.rowCount, 20); r++) {
    if (ws.getRow(r).getCell(1).value === 'No' && ws.getRow(r).getCell(2).value === 'Malzeme Adı') return r;
  }
  return -1;
}
/** Govdenin basladigi satir: kalem sayfasinda tablo basligi; METIN sayfasinda
 *  (tablo basligi yok) "Tarih:" satirindan 2 sonrasi — baslik slotu (tarif §4). */
function govdeBasi(ws: ExcelJS.Worksheet): number {
  const bas = baslikSatiri(ws);
  if (bas > 0) return bas;
  for (let r = 1; r <= Math.min(ws.rowCount, 20); r++) {
    if (/^Tarih: /.test(String(ws.getRow(r).getCell(3).value ?? ''))) return r + 2;
  }
  return -1;
}
/** Formuldeki hucre adreslerini govde basina GORE yazar (C7 → C@3): antet satirlari
 *  tabloyu kaydirir, goreli formul metni de kayar — kayma DISINDA fark olmamali. */
const goreliFormul = (f: string, bas: number) => f.replace(/\b([A-Z]{1,3})(\d+)\b/g, (_, k: string, r: string) => `${k}@${Number(r) - bas}`);
const gorselSayisi = (ws?: ExcelJS.Worksheet) => (ws?.getImages?.() ?? []).length;

/** Fiyatli ciktida TEKLİF GENEL TOPLAMI ve her SAYFA TOPLAMI (kurus).
 *  23.09: hucreler FORMUL — `Number(formul)` NaN → `|| 0` iki kosumda da 0 verip
 *  karsilastirmayi BOS YERE yesil yapardi (olculdu). Deger formulun hucrelerden
 *  bagimsiz yeniden hesabidir; hata → NaN (esitlik kirilir). */
function fiyatliToplamlar(wb: ExcelJS.Workbook) {
  const sayfalar: Record<string, number[]> = {};
  let genel: number | null = null;
  const deger = (ws: ExcelJS.Worksheet, adres: string) => { const d = gercek(wb, ws.name, adres); return d.e !== undefined ? NaN : K(d.v as number); };
  wb.eachSheet((ws) => ws.eachRow({ includeEmpty: false }, (row) => {
    if (row.getCell(2).value === 'SAYFA TOPLAMI') sayfalar[ws.name] = [6, 8, 9].map((c) => deger(ws, row.getCell(c).address));
    if (row.getCell(1).value === 'TEKLİF GENEL TOPLAMI') genel = deger(ws, row.getCell(4).address);
  }));
  return { sayfalar, genel };
}
/** Format ciktisindaki ICMAL: sayi/formul tasiyan HER hucrenin GERCEK degeri (kurus). */
function icmalGercek(wb: ExcelJS.Workbook): Record<string, number | string> {
  const o: Record<string, number | string> = {};
  const ws = wb.getWorksheet('İCMAL');
  ws?.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => {
    const v: any = c.value;
    if (typeof v === 'number' || (v && typeof v === 'object' && typeof v.formula === 'string')) {
      const d = gercek(wb, 'İCMAL', c.address);
      o[c.address] = d.e ? d.e : K(d.v as number);
    }
  }));
  return o;
}
/** Liste sayfasinin tablo govdesi (baslik dahil) — antet satirlarindan bagimsiz;
 *  formul adresleri govde basina GORE (kayma disinda fark olmamali). */
function tabloGovdesi(ws: ExcelJS.Worksheet): string[] {
  const bas = govdeBasi(ws); const g: string[] = [];
  if (bas < 1) return ['GOVDE-YOK'];
  for (let r = bas; r <= ws.rowCount; r++) {
    const v = ws.getRow(r).values as any[];
    g.push(JSON.stringify((v ?? []).slice(1).map((x) => (x && typeof x === 'object' && typeof x.formula === 'string' ? goreliFormul(x.formula, bas) : x))));
  }
  return g;
}

async function gercekTeklif(dosya: string): Promise<any[]> {
  const svc = new ExcelGridService({ brand: { findMany: async () => [] } } as any);
  const parsed = await svc.prepare(fs.readFileSync(path.join(__dirname, '..', '..', 'test-fixtures', 'e2e', dosya)), { fixedSchema: true });
  const sheets = JSON.parse(JSON.stringify(parsed.sheets));
  for (const sh of sheets) FE.toplamlariTamamla(sh.rowData ?? [], sh.columnRoles ?? {});
  return sheets.map((s: any) => ({ name: s.name, index: s.index, isEmpty: s.isEmpty, columnDefs: s.columnDefs, columnRoles: s.columnRoles, headerEndRow: s.headerEndRow, rowData: (s.rowData ?? []).filter((r: any) => !r._isSpareRow) }));
}

async function run() {
  // ── AN0: antetKur — saf kurallar ──────────────────────────────────────
  {
    check('AN0 firma yok / tum alanlar bos ya da bosluk → antet YOK (null)',
      antetKur(null) === null && antetKur(undefined) === null
        && antetKur({ unvan: '  ', faturaAdresi: '', il: null, telefon: '\t', logoBytes: null, logoMime: null }) === null);
    const tam = antetKur(TAM_FIRMA)!;
    check('AN0 tam firma → 4 satır, bu sırada, etiketli; logo 300×100',
      JSON.stringify(tam.satirlar) === JSON.stringify([
        'Örnek Mühendislik Tesisat Ltd. Şti.',
        'Atatürk Cad. No: 12/3 · Kadıköy / İstanbul',
        'Tel: 0216 555 12 34 · E-posta: teklif@ornekmuhendislik.com.tr',
        'Vergi Dairesi: Kozyatağı · Vergi No: 1234567890',
      ]) && tam.unvanVar && tam.logo?.genislik === 300 && tam.logo?.yukseklik === 100 && tam.logo?.uzanti === 'png',
      JSON.stringify({ ...tam, logo: tam.logo && { ...tam.logo, buffer: tam.logo.buffer.length } }));
    const kismi = antetKur({ telefon: '0212 000 00 00', il: 'Bursa' })!;
    check('AN0 kısmi bilgi: yalnız dolu alanların satırı basılır (unvan yok → ilk satır kalın değil)',
      JSON.stringify(kismi.satirlar) === JSON.stringify(['Bursa', 'Tel: 0212 000 00 00']) && !kismi.unvanVar,
      JSON.stringify(kismi.satirlar));
    const tehlikeli: any = { unvan: null, ad: 'acme', yetkiliEposta: 'giris@acme.com', tcKimlikNo: '11111111111', telefon: '0212 1' };
    const t = JSON.stringify(antetKur(tehlikeli));
    check('AN0 tehlikeli yedek YOK: ad (e-postadan türeyen), yetkiliEposta ve tcKimlikNo antete girmez',
      !/acme|giris@|11111111111/.test(t) && /Tel: 0212 1/.test(t), t);
    check('AN0 select listesi yalnız antet alanlarını okur (ad / yetkiliEposta / tcKimlikNo SEÇİLMEZ)',
      !('ad' in ANTET_FIRMA_ALANLARI) && !('yetkiliEposta' in ANTET_FIRMA_ALANLARI) && !('tcKimlikNo' in ANTET_FIRMA_ALANLARI)
        && 'unvan' in ANTET_FIRMA_ALANLARI && 'logoBytes' in ANTET_FIRMA_ALANLARI);
    check('AN0 kullanıcı metnindeki {{…}} yer tutucu gibi işlenmez (format taraması antet hücresine giremez)',
      antetKur({ unvan: 'ACME {{MUSTERI}} Ltd' })!.satirlar[0] === 'ACME MUSTERI Ltd');
    // Tek geciste yalniz {{ }} ciftlerini silen ayiklayici bu girdiyi
    // "{{ICMAL_SATIRLARI}}"e DONUSTURUYORDU (13.09 incelemesi, olculdu).
    const atlatma = antetKur({ unvan: '{}}{ICMAL_SATIRLARI}{{}', faturaAdresi: '{{{MUSTERI}}}' })!;
    check('AN0 süslü parantez parçalı yazılarak yer tutucu İNŞA EDİLEMEZ (hiçbir antet satırında { } kalmaz)',
      atlatma.satirlar.length === 2 && atlatma.satirlar.every((s) => !/[{}]/.test(s)) && atlatma.satirlar[0] === 'ICMAL_SATIRLARI',
      JSON.stringify(atlatma.satirlar));
    check('AN0 İngilizce çıktı etiketleri çevrilir', JSON.stringify(antetKur({ telefon: '1', vergiNo: '2' }, 'en')!.satirlar)
      === JSON.stringify(['Tel: 1', 'Tax No: 2']));
    check('AN0 görsel boyutu: PNG başlığı · JPEG SOF · bozuk/kesik bayt null',
      JSON.stringify(gorselBoyutu(pngUret(64, 20), 'png')) === '{"genislik":64,"yukseklik":20}'
        && JSON.stringify(gorselBoyutu(JPEG_1PX, 'jpeg')) === '{"genislik":1,"yukseklik":1}'
        && gorselBoyutu(pngUret(64, 20).subarray(0, 20), 'png') === null
        && gorselBoyutu(Buffer.from('<html>'), 'jpeg') === null);
    check('AN0 WEBP ve bozuk PNG logo gömülmez; yalnız logosu olan kayıt → antet YOK',
      antetKur({ unvan: 'A', logoBytes: WEBP_BASLIK, logoMime: 'image/webp' })!.logo === null
        && antetKur({ unvan: 'A', logoBytes: Buffer.from('bozuk-png'), logoMime: 'image/png' })!.logo === null
        && antetKur({ logoBytes: WEBP_BASLIK, logoMime: 'image/webp' }) === null);
    check('AN0 gömülmeyen logonun NEDENİ söylenir (WEBP / okunamayan / desteklenmeyen); gömülen ya da olmayan logoda not yok',
      /WEBP/.test(antetLogoNotu({ logoBytes: WEBP_BASLIK, logoMime: 'image/webp' }) ?? '')
        && /okunamadı/.test(antetLogoNotu({ logoBytes: Buffer.from('bozuk-png'), logoMime: 'image/png' }) ?? '')
        && /desteklenmediği/.test(antetLogoNotu({ logoBytes: Buffer.from('GIF89a'), logoMime: 'image/gif' }) ?? '')
        && antetLogoNotu(TAM_FIRMA) === null && antetLogoNotu({ unvan: 'A' }) === null && antetLogoNotu(null) === null);
  }

  // ── AN1: ONCE / SONRA — ICMAL birebir ayni (sentetik + gercek dosyalar) ──
  for (const [ad, sheetsUret] of [
    ['sentetik (ara toplam satırlı)', async () => sentetik()],
    ['FIRMA-C (özet sayfalı, gerçek)', () => gercekTeklif('FIRMA-C ENTEGRE SAHA-UC - Yangın Tesisatı.xlsx')],
    ['Bursa (3 ondalıklı, gerçek)', () => gercekTeklif('0_Bursa SAHA-BIR inşai işler - Revize Keşif (1).xlsx')],
  ] as const) {
    const sheets = await sheetsUret();
    const once = await ikiYol(sheets, null);
    const sonra = await ikiYol(sheets, TAM_FIRMA);
    const icO = icmalGercek(once.fw); const icS = icmalGercek(sonra.fw);
    const icmalAyni = JSON.stringify(icO) === JSON.stringify(icS) && Object.keys(icO).length > 0
      && Object.values(icS).every((x) => typeof x === 'number');
    const fO = fiyatliToplamlar(once.pw); const fS = fiyatliToplamlar(sonra.pw);
    check(`AN1 antetten ÖNCE ve SONRA İCMAL formüllerinin gerçek değeri birebir aynı [${ad}]`, icmalAyni,
      `önce=${JSON.stringify(icO).slice(0, 160)} sonra=${JSON.stringify(icS).slice(0, 160)}`);
    check(`AN1 antetten ÖNCE ve SONRA fiyatlı TEKLİF GENEL TOPLAMI ve her SAYFA TOPLAMI aynı [${ad}]`,
      fO.genel !== null && fO.genel > 0 && fO.genel === fS.genel && Object.keys(fO.sayfalar).length > 0
        && JSON.stringify(fO.sayfalar) === JSON.stringify(fS.sayfalar),
      `genel ${fO.genel} / ${fS.genel} sayfa=${Object.keys(fO.sayfalar).length}`);
    const pfd = formulDenetimi(sonra.pw);
    check(`AN1 antetli fiyatlı çıktıda her formülün önbelleği = gerçek değeri [${ad}]`, pfd.sayi > 0 && pfd.sorun.length === 0,
      pfd.sorun.slice(0, 2).join(' | '));
    const fd = formulDenetimi(sonra.fw);
    check(`AN1 antetli format çıktısında her formülün önbelleği = gerçek değeri [${ad}]`, fd.sayi > 0 && fd.sorun.length === 0,
      fd.sorun.slice(0, 2).join(' | '));
    const listeAdlari = once.pw.worksheets.map((w) => w.name).filter((n) => n !== 'GENEL TOPLAM');
    const govdeAyni = listeAdlari.every((n) => JSON.stringify(tabloGovdesi(once.pw.getWorksheet(n)!))
      === JSON.stringify(tabloGovdesi(sonra.pw.getWorksheet(n)!)));
    check(`AN1 tablo gövdesi (başlık + veri) antetten sonra aynen korunur, yalnız aşağı kayar [${ad}]`,
      govdeAyni && listeAdlari.every((n) => govdeBasi(sonra.pw.getWorksheet(n)!) > govdeBasi(once.pw.getWorksheet(n)!)),
      listeAdlari.map((n) => `${n}:${govdeBasi(once.pw.getWorksheet(n)!)}→${govdeBasi(sonra.pw.getWorksheet(n)!)}`).join(' '));
  }

  // ── AN2: tam antet cikti yerlesimi ────────────────────────────────────
  {
    const { pw, fw, kayit } = await ikiYol(sentetik(), TAM_FIRMA);
    const mek = pw.getWorksheet('Mekanik')!;
    const bas = baslikSatiri(mek);
    check('AN2 fiyatlı liste sayfası: 1-4. satır antet, 5. boşluk, 6-8 başlık bloğu (teklif adı · sayfa + tarih · çizgi), tablo başlığı 9. satırda',
      mek.getRow(1).getCell(2).value === TAM_FIRMA.unvan && String(mek.getRow(4).getCell(2).value).startsWith('Vergi Dairesi')
        && !mek.getRow(5).getCell(2).value && String(mek.getRow(6).getCell(1).value).startsWith('Antet Turu')
        && mek.getRow(7).getCell(1).value === 'Mekanik' && /^Tarih: /.test(String(mek.getRow(7).getCell(9).value)) && bas === 9,
      `başlık=${bas} A6=${mek.getRow(6).getCell(1).value} A7=${mek.getRow(7).getCell(1).value}`);
    const gorunum: any = (mek.views ?? [])[0];
    check('AN2 donmuş bölme BAŞLIĞIN altından (ySplit = başlık satırı, antet donmaz yanlış satır değil)',
      gorunum?.state === 'frozen' && gorunum?.ySplit === bas, JSON.stringify(gorunum));
    const gt = pw.getWorksheet('GENEL TOPLAM')!;
    check('AN2 fiyatlı GENEL TOPLAM sayfası da antetli (ikiz)', gt.getRow(1).getCell(1).value === TAM_FIRMA.unvan);
    check('AN2 logo her liste sayfasında ve GENEL TOPLAM\'da BİR kez; dosya yeniden açılınca korunur',
      gorselSayisi(mek) === 1 && gorselSayisi(pw.getWorksheet('Elektrik')) === 1 && gorselSayisi(gt) === 1,
      `mek=${gorselSayisi(mek)} elk=${gorselSayisi(pw.getWorksheet('Elektrik'))} gt=${gorselSayisi(gt)}`);
    // GENEL TOPLAM'da (23.09: A 44 + B 20) uzun antet satiri (Tel · E-posta) C'ye
    // tasabilir; logo C'nin SOLUNDA baslarsa metnin USTUNE biner (13.09 incelemesi),
    // D'den baslarsa 22 genislikli D'yi asip baski alaninin disina cikar. Logo C+D'nin
    // SAG kenarina yaslanir: C'nin solunda >= 60 px bos kalir, sag kenar D'yi asmaz.
    const gtLogo: any = (gt.getImages?.() ?? [])[0];
    const tl = gtLogo?.range?.tl ?? {};
    const px = (w: number) => Math.floor(w * 7 + 5);
    const solPx = (tl.nativeColOff ?? 0) / 9525;
    const genislik = Number(gtLogo?.range?.ext?.width ?? 0);
    check("AN2 GENEL TOPLAM logosu C+D'nin sağ kenarına yaslı (uzun antet satırının üstüne binmez, baskı alanını aşmaz)",
      tl.nativeCol === 2 && solPx >= 60 && genislik > 0 && solPx + genislik <= px(20) + px(22),
      `kolon=${tl.nativeCol} sol=${solPx.toFixed(0)}px genişlik=${genislik}`);
    const fMek = fw.getWorksheet('Mekanik')!;
    check('AN2 format yolu liste sayfaları da antetli + aynı başlık bloğu (tek motor): teklif adı · müşteri · proje',
      fMek.getRow(1).getCell(2).value === TAM_FIRMA.unvan && baslikSatiri(fMek) === 9 && gorselSayisi(fMek) === 1
        && fMek.getRow(6).getCell(1).value === 'Antet Turu · Müşteri A.Ş. · Proje' && fMek.getRow(6).getCell(1).value === mek.getRow(6).getCell(1).value,
      `başlık=${baslikSatiri(fMek)} A6=${fMek.getRow(6).getCell(1).value}`);
    const formatMetni = tumMetin(fw).filter((m) => /^(KAPAK|İCMAL)!/.test(m));
    check('AN2 format sayfalarına (KAPAK / İCMAL) antet YAZILMAZ, görsel eklenmez (T3)',
      !formatMetni.some((m) => m.includes(TAM_FIRMA.unvan)) && gorselSayisi(fw.getWorksheet('KAPAK')) === 0
        && gorselSayisi(fw.getWorksheet('İCMAL')) === 0);
    check('AN2 bağlantı: İKİ yol da firmayı oturumun firmaId\'si ve antet select\'iyle okur',
      kayit.firmaSorgulari.length === 2 && kayit.firmaSorgulari.every((q) => q?.where?.id === KIM.firmaId
        && JSON.stringify(q?.select) === JSON.stringify(ANTET_FIRMA_ALANLARI)),
      JSON.stringify(kayit.firmaSorgulari.map((q) => q?.where)));
  }

  // ── AN3: bilgi yoksa yer tutucu yok ───────────────────────────────────
  {
    const yasak = /\[[^\]]*(UNVAN|ÜNVAN|FİRMA|FIRMA|ADRES)[^\]]*\]|\bnull\b|\bundefined\b|\{\{|(Tel|E-posta|Vergi Dairesi|Vergi No):\s*($|·)/i;
    const bos = await ikiYol(sentetik(), { unvan: null, faturaAdresi: '', il: null, ilce: null, telefon: null, faturaEposta: null, vergiDairesi: null, vergiNo: null, logoBytes: null, logoMime: null });
    const artik = [...tumMetin(bos.pw), ...tumMetin(bos.fw)].filter((m) => yasak.test(m));
    check('AN3 firma kaydı var ama alanlar boş → antet YOK: tablo başlığı 4. satırda (başlık bloğunun altı), görsel yok, artık metin yok',
      baslikSatiri(bos.pw.getWorksheet('Mekanik')!) === 4 && baslikSatiri(bos.fw.getWorksheet('Mekanik')!) === 4
        && gorselSayisi(bos.pw.getWorksheet('Mekanik')) === 0 && artik.length === 0
        && bos.pw.getWorksheet('GENEL TOPLAM')!.getRow(1).getCell(1).value !== null,
      artik.slice(0, 3).join(' | '));
    const yalnizUnvan = await ikiYol(sentetik(), { unvan: 'Yalnız Unvan A.Ş.' });
    const mek = yalnizUnvan.pw.getWorksheet('Mekanik')!;
    const artik2 = [...tumMetin(yalnizUnvan.pw), ...tumMetin(yalnizUnvan.fw)].filter((m) => yasak.test(m));
    check('AN3 yalnız unvan → tek antet satırı + boşluk (+ 3 satırlık başlık bloğu); "Tel:" / "Vergi" / boş etiket basılmaz',
      mek.getRow(1).getCell(2).value === 'Yalnız Unvan A.Ş.' && baslikSatiri(mek) === 6 && artik2.length === 0
        && !tumMetin(yalnizUnvan.pw).some((m) => /Tel:|Vergi|E-posta/.test(m)), `başlık=${baslikSatiri(mek)} ${artik2.join(' | ')}`);
    const tehlikeli = await ikiYol(sentetik(), { unvan: null, ad: 'acme', yetkiliEposta: 'giris@acme.com', tcKimlikNo: '11111111111', telefon: '0212 000 00 00' });
    const sizinti = [...tumMetin(tehlikeli.pw), ...tumMetin(tehlikeli.fw)].filter((m) => /acme|giris@|11111111111/.test(m));
    check('AN3 unvan boş + ad/giriş e-postası/TC kimlik dolu → hiçbiri çıktıya sızmaz, yalnız telefon basılır',
      sizinti.length === 0 && tehlikeli.pw.getWorksheet('Mekanik')!.getRow(1).getCell(2).value === 'Tel: 0212 000 00 00',
      sizinti.join(' | '));
  }

  // ── AN4: logo turleri — kirik gorsel yok ──────────────────────────────
  {
    for (const [ad, firma, beklenen, notDeseni] of [
      ['JPEG', { unvan: 'J', logoBytes: JPEG_1PX, logoMime: 'image/jpeg' }, 1, null],
      ['WEBP', { unvan: 'W', logoBytes: WEBP_BASLIK, logoMime: 'image/webp' }, 0, /logo WEBP biçiminde olduğu için antete eklenmedi/],
      ['bozuk PNG (imza geçer, gövde kesik)', { unvan: 'B', logoBytes: pngUret(40, 40).subarray(0, 22), logoMime: 'image/png' }, 0, /logo dosyası okunamadığı/],
      ['logo yok', { unvan: 'Y' }, 0, null],
    ] as const) {
      const { pw, fw, priced, format } = await ikiYol(sentetik(), firma);
      const mek = pw.getWorksheet('Mekanik')!;
      check(`AN4 logo ${ad}: liste sayfasında ${beklenen} görsel, unvan yine basılır, dosya yeniden açılır`,
        gorselSayisi(mek) === beklenen && gorselSayisi(fw.getWorksheet('Mekanik')) === beklenen && mek.getRow(1).getCell(2).value === firma.unvan,
        `görsel=${gorselSayisi(mek)}`);
      // SESSIZ ATLAMA YASAK: gomulmeyen logo IKI indirmenin ozetinde (toast) soylenir
      const ozetler = [priced.ozet ?? '', format.ozet ?? ''];
      check(`AN4 logo ${ad}: indirme özeti ${notDeseni ? 'logonun neden eklenmediğini söyler (iki yol)' : 'logo notu içermez (iki yol)'}`,
        notDeseni ? ozetler.every((o) => notDeseni.test(o)) : ozetler.every((o) => !/logo/i.test(o)),
        `fiyatlı="${ozetler[0]}" format="${ozetler[1]}"`);
    }
  }

  // ── AN5: okuma hatasi ciktiyi dusurmez ────────────────────────────────
  {
    let hata = '';
    let sonuc: any = null;
    try { sonuc = await ikiYol(sentetik(), TAM_FIRMA, { firmaHatasi: true }); } catch (e: any) { hata = e?.message ?? String(e); }
    check('AN5 firma okuması hata verirse iki çıktı da ANTETSİZ iner (500 yok, KH2)',
      !hata && !!sonuc && baslikSatiri(sonuc.pw.getWorksheet('Mekanik')) === 4 && baslikSatiri(sonuc.fw.getWorksheet('Mekanik')) === 4, hata);
  }

  // ── AN6: kullanici formati kendi logosunu tasiyorsa ───────────────────
  {
    const f = new ExcelJS.Workbook();
    const kapak = f.addWorksheet('KAPAK');
    kapak.addImage(f.addImage({ buffer: pngUret(10, 10, [200, 0, 0]) as any, extension: 'png' }), 'B2:D6');
    kapak.getCell('B8').value = 'Sn {{MUSTERI}}';
    const icmal = f.addWorksheet('İCMAL');
    icmal.getCell('B3').value = '{{ICMAL_SATIRLARI}}';
    icmal.getCell('E6').value = '{{GENEL_TOPLAM}}';
    const formatBytes = Buffer.from(await f.xlsx.writeBuffer());
    const { fw } = await ikiYol(sentetik(), TAM_FIRMA, { formatBytes });
    check('AN6 kullanıcı formatının KAPAK logosu tek kalır (çift logo yok); antet liste sayfalarına girer',
      gorselSayisi(fw.getWorksheet('KAPAK')) === 1 && gorselSayisi(fw.getWorksheet('Mekanik')) === 1
        && fw.getWorksheet('Mekanik')!.getRow(1).getCell(2).value === TAM_FIRMA.unvan,
      `kapak=${gorselSayisi(fw.getWorksheet('KAPAK'))} mekanik=${gorselSayisi(fw.getWorksheet('Mekanik'))}`);
    const fd = formulDenetimi(fw);
    check('AN6 kullanıcı formatlı antetli çıktıda İCMAL formülleri doğru (önbellek = gerçek)', fd.sayi > 0 && fd.sorun.length === 0,
      fd.sorun.slice(0, 2).join(' | '));
  }

  console.log(`\n${'─'.repeat(64)}\nANTET: ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nBAŞARISIZ:'); failures.forEach((x) => console.log(`  ✗ ${x}`)); }
  process.exit(failed > 0 ? 1 : 0);
}

bitmezseKirmizi(run().catch((e) => { console.error('BEKLENMEYEN HATA:', e); process.exit(1); }));
