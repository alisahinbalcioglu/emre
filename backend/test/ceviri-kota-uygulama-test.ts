/**
 * FAZ 6.2 — ÇEVİRİ KOTASI UYGULAMASI  (`npm run test:ceviri-kota-uygulama`)
 *
 * DB'siz, deterministik. Bloklar:
 *  K) KURAL — satır sayımı ve çevrilecek metinler TEK fonksiyondan
 *     (`ceviriIcerigi`); 13.08'den beri ön yüzde mühürlü dokunulmaz vakaları
 *     birebir taşındı; ön yüzün anahtar normalizasyonu sunucuyla aynı.
 *  D) KARAR — hangi tavanın dolduğu, sıra ve mesajlar.
 *  T) DÖNEM — abonelik dönemi, takvim ayı değil.
 *  W) KABLOLAMA — servis + controller + DTO gerçek sınıflarla, bellekte sahte
 *     Prisma ile: kota reddi AI'dan ÖNCE, önbellek isabeti de kayıt bırakır,
 *     tekrar yeni kayıt yazmaz, başarısız/kısmi çeviri sayılmaz, istemcinin
 *     gönderdiği satır sayısı hiçbir yere ulaşmaz.
 *
 * Çıkış kodu sözleşmesi: 0 = PASS · 1 = FAIL.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  CEVIRI_KAYNAK_ALANI,
  ceviriAnahtari,
  ceviriIcerigi,
  dokunulmazMi,
  satirKaynagi,
  teslimEdilenSatir,
} from '../src/ozellik/giris/ai/ceviri-kurali';
import {
  EN_DUSUK_KOTA,
  kotaDonemi,
  kotaKarari,
  kotaRedMesaji,
  sonucHesabi,
  trTarih,
} from '../src/ozellik/odeme/abonelik/ceviri-kotasi';
import {
  CeviriKotaServisi,
  ISLENIYOR_ZAMAN_ASIMI_DK,
  TEKRAR_PENCERESI_DK,
  YENIDEN_BASLAMA_NOTU,
  ZAMAN_ASIMI_NOTU,
} from '../src/ozellik/odeme/abonelik/ceviri-kota.servisi';
import { CeviriService } from '../src/ozellik/giris/ai/ceviri.service';
import { AiController } from '../src/ozellik/giris/ai/ai.controller';
import { CeviriIstegiDto, CeviriOnizlemeSorgusuDto } from '../src/ozellik/giris/ai/dto/ceviri.dto';
import { Yetenek } from '../src/ozellik/odeme/abonelik/erisim.servisi';

// ⚠ W bloğu AI'ya GİTMEMELİ: anahtar yoksa `cevir` eksik metinde erken hata
// verir. Ortamda gerçek anahtar varsa bile bu test onu kullanamaz.
delete process.env.ANTHROPIC_API_KEY;

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(ad: string, kosul: boolean, detay = ''): void {
  if (kosul) {
    passed++;
    console.log(`  ✓ ${ad}`);
  } else {
    failed++;
    failures.push(`${ad}${detay ? ` — ${detay}` : ''}`);
    console.log(`  ✗ ${ad}${detay ? ` — ${detay}` : ''}`);
  }
}

const ROLLER = { nameField: 'Malzeme Cinsi' };
function satir(ad: string, ek: Record<string, unknown> = {}): Record<string, unknown> {
  return { _rowIdx: 1, _isDataRow: true, _isHeaderRow: false, 'Malzeme Cinsi': ad, Miktar: '1', ...ek };
}
function sayfa(adlar: string[], ek: Record<string, unknown> = {}) {
  return { isEmpty: false, rowData: adlar.map((a) => satir(a)), columnRoles: ROLLER, ...ek };
}

// ── K) KURAL ────────────────────────────────────────────────────────────────
console.log('\nK) Satır kuralı — sayım ve çeviri tek fonksiyondan');

// Ön yüzden (frontend/ozellik/teklif/ceviri.test.ts, 13.08) BİREBİR taşındı.
const DOKUNULMAZ = [
  'DN 20', 'DN20', 'dn 150',
  'Ø110', 'Ø 110', 'φ50',
  '6"', '1 1/4"', '3/4"', '2½"',
  '25', '0.5', '1,5', '313',
  '9MM', '110 mm',
  'PN 20',
  '2x9,36 m³/h',
  'Ø110 x Ø90', '3"x1"', 'DN80 x DN25',
  '', '   ',
];
check('K1 dokunulmaz vaka paydası 23', DOKUNULMAZ.length === 23, `${DOKUNULMAZ.length}`);
const sizan = DOKUNULMAZ.filter((m) => !dokunulmazMi(m));
check('K2 ölçü/kod metinlerinin HEPSİ dokunulmaz', sizan.length === 0, `sızanlar: ${sizan.join(' | ')}`);

const CEVRILIR = [
  'PVC BORU', 'TEMİZ SU HİDROFORU', 'SIHHI TESİSAT İŞLERİ', 'FİTTİNGS ORANI',
  'Montaj bedeli', 'Küresel vana', 'Int yangın borusu',
  '9MM ALUMİNYUM FOLYO KAUÇUK BORU İZOLASYONU',
];
check('K3 çevrilir vaka paydası 8', CEVRILIR.length === 8, `${CEVRILIR.length}`);
const atlanan = CEVRILIR.filter((m) => dokunulmazMi(m));
check('K4 gerçek adların HEPSİ çevrilir (ölçü İÇEREN ad dahil)', atlanan.length === 0, `atlananlar: ${atlanan.join(' | ')}`);

check('K5 anahtar: baş/son boşluk atılır', ceviriAnahtari('  PVC BORU  ') === 'PVC BORU');
check('K6 anahtar: iç boşluk teklenir', ceviriAnahtari('PVC  \t BORU') === 'PVC BORU');

{
  const r = ceviriIcerigi([sayfa(['PVC BORU', 'PVC BORU', 'DN 20', 'ÇELİK BORU', '25'])]);
  check('K7 satır sayısı = çevrilecek metin içeren satır (tekrarlar SAYILIR)', r.satirSayisi === 3, `${r.satirSayisi}`);
  check(
    'K8 API metinleri benzersiz, ilk görülme sırasıyla',
    JSON.stringify(r.metinler) === JSON.stringify(['PVC BORU', 'ÇELİK BORU']),
    JSON.stringify(r.metinler),
  );
}
{
  const r = ceviriIcerigi([
    { ...sayfa(['BAŞLIK METNİ']), rowData: [satir('MALZEME CİNSİ', { _isDataRow: false, _isHeaderRow: true }), satir('PVC BORU')] },
  ]);
  check('K9 başlık satırı da sayılır (tanım a: çeviriye giden her metin)', r.satirSayisi === 2, `${r.satirSayisi}`);
}
{
  const r = ceviriIcerigi([
    sayfa(['ŞARTNAME: BORULAR TS EN 10255 STANDARDINDA OLACAKTIR'], {
      rowData: [satir('ŞARTNAME: BORULAR TS EN 10255 STANDARDINDA OLACAKTIR', { _isDataRow: false, Miktar: null })],
    }),
  ]);
  check('K10 miktarsız şartname satırı sayılır', r.satirSayisi === 1, `${r.satirSayisi}`);
}
check('K11 isEmpty sayfa atlanır', ceviriIcerigi([sayfa(['PVC BORU'], { isEmpty: true })]).satirSayisi === 0);
check('K12 nameField rolü olmayan sayfa atlanır', ceviriIcerigi([sayfa(['PVC BORU'], { columnRoles: {} })]).satirSayisi === 0);
check('K13 sayfa dizisi değilse sıfır (null/obje)', ceviriIcerigi(null).satirSayisi === 0 && ceviriIcerigi({}).satirSayisi === 0);
{
  const cevrilmis = { ...sayfa([]), rowData: [satir('PVC PIPE', { [CEVIRI_KAYNAK_ALANI]: 'PVC BORU' })] };
  const r = ceviriIcerigi([cevrilmis]);
  check(
    'K14 çevrilmiş satırda Türkçe ASIL sayılır ve çevrilir',
    r.satirSayisi === 1 && r.metinler[0] === 'PVC BORU',
    JSON.stringify(r.metinler),
  );
}
{
  const a = ceviriIcerigi([sayfa(['PVC BORU', 'ÇELİK BORU'])]);
  const b = ceviriIcerigi([sayfa(['PVC BORU', 'ÇELİK BORU'])]);
  const miktarDegisti = ceviriIcerigi([{ ...sayfa([]), rowData: [satir('PVC BORU', { Miktar: '99' }), satir('ÇELİK BORU')] }]);
  const adDegisti = ceviriIcerigi([sayfa(['PVC BORU', 'PPR BORU'])]);
  check('K15 aynı içerik → aynı özet', a.ozet === b.ozet);
  check('K16 miktar değişikliği özeti DEĞİŞTİRMEZ (çıktı aynı)', a.ozet === miktarDegisti.ozet);
  check('K17 ad değişikliği özeti DEĞİŞTİRİR (yeni çeviri)', a.ozet !== adDegisti.ozet);
  check('K18 özet sha256 hex', /^[0-9a-f]{64}$/.test(a.ozet), a.ozet);
}
{
  // 14.09 incelemesi O6: `_ceviriKaynak` kayıtta istemcinin yazabildiği alan.
  const bos = { ...sayfa([]), rowData: [satir('PVC BORU', { [CEVIRI_KAYNAK_ALANI]: '' }), satir('PVC BORU', { [CEVIRI_KAYNAK_ALANI]: '   ' })] };
  const r = ceviriIcerigi([bos]);
  check('K22 ★ boş/boşluk `_ceviriKaynak` ada düşer — satır SAYILIR', r.satirSayisi === 2 && r.metinler[0] === 'PVC BORU', `${r.satirSayisi} · ${JSON.stringify(r.metinler)}`);
  check('K23 satirKaynagi: dolu kaynak önce gelir', satirKaynagi({ ad: 'PVC PIPE', [CEVIRI_KAYNAK_ALANI]: 'PVC BORU' }, 'ad') === 'PVC BORU');
  check('K24 satirKaynagi: dizge olmayan kaynak ada düşer', satirKaynagi({ ad: 'PVC BORU', [CEVIRI_KAYNAK_ALANI]: 42 }, 'ad') === 'PVC BORU');
}
{
  const r = ceviriIcerigi([sayfa(['PVC BORU', 'PVC BORU', 'DN 20', 'ÇELİK BORU', 'constructor'])]);
  check('K25 satır haritası anahtar başına satır sayar (payda: 4 satır)', r.satirlar.get('PVC BORU') === 2 && r.satirlar.get('ÇELİK BORU') === 1 && r.satirlar.get('constructor') === 1, JSON.stringify([...r.satirlar]));
  check('K26 ★ teslim: haritanın karşıladığı SATIR (2 + 0 + 0)', teslimEdilenSatir(r, { 'PVC BORU': 'PVC PIPE' }) === 2);
  check('K27 teslim: tam harita → satirSayisi', teslimEdilenSatir(r, { 'PVC BORU': 'A', 'ÇELİK BORU': 'B', constructor: 'C' }) === r.satirSayisi);
  check('K28 teslim: prototip anahtarı haritada VAR sayılmaz', teslimEdilenSatir(r, {}) === 0);
}

// Ön yüz ↔ sunucu anahtar eşliği: harita sunucuda bu anahtarla kurulur, istemci
// satırlara bu anahtarla uygular. Ayrışırsa çeviri "tamamlandı" der ama hiçbir
// hücre değişmez (13.08'de tam bu yaşandı, başka sebeple).
{
  const feYol = path.join(__dirname, '../../frontend/ozellik/teklif/ceviri.ts');
  const fe = fs.existsSync(feYol) ? fs.readFileSync(feYol, 'utf8') : '';
  check('K19 ön yüz çeviri modülü bulundu', fe.length > 0, feYol);
  const govde = fe.match(/export function ceviriAnahtari\([^)]*\)[^{]*\{([\s\S]*?)\n\}/)?.[1]?.trim() ?? '';
  check(
    'K20 ön yüz ceviriAnahtari gövdesi sunucununkiyle AYNI',
    govde === "return String(metin ?? '').trim().replace(/\\s+/g, ' ');",
    `ön yüz: ${govde}`,
  );
  check(
    'K21 ön yüzde dokunulmaz kuralı YOK (tek yer sunucu — ikiz ayrışamaz)',
    !/export function dokunulmazMi|function olcuyuSoy|export function cevrilecekMetinler/.test(fe),
  );
  // Satır kaynağı kuralı iki tarafta aynı olmak ZORUNDA: sunucu haritayı bu
  // anahtarla kurar ve satırı bu anahtarla sayar, ekran bu anahtarla yazar.
  const kaynakGovdesi = (kod: string) =>
    kod.match(/export function satirKaynagi\([^)]*\)[^{]*\{([\s\S]*?)\n\}/)?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
  const beGovde = kaynakGovdesi(fs.readFileSync(path.join(__dirname, '../src/ozellik/giris/ai/ceviri-kurali.ts'), 'utf8'));
  const feGovde = kaynakGovdesi(fe);
  check('K29 ★ ön yüz satirKaynagi gövdesi sunucununkiyle AYNI', beGovde.length > 0 && beGovde === feGovde, `sunucu: ${beGovde} · ön yüz: ${feGovde}`);
  check('K30 ön yüz haritayı satirKaynagi anahtarıyla uygular', /ceviriAnahtari\(satirKaynagi\(row, adAlan\)\)/.test(fe));
}

// ── D) KARAR ────────────────────────────────────────────────────────────────
console.log('\nD) Kota kararı — hangi tavan, hangi sıra');
const CORE = { satir: 3000, dosya: 30 };
const yenilenme = new Date('2026-10-15T07:00:00Z');

{
  const k = kotaKarari({ kota: CORE, kullanilanSatir: 0, kullanilanDosya: 0, gerekenSatir: 3001 });
  check('D1 tavandan büyük tek dosya → DOSYA_TAVANDAN_BUYUK (dönem başında bile)', !k.izin && k.sebep === 'DOSYA_TAVANDAN_BUYUK', JSON.stringify(k));
  const m = kotaRedMesaji(k, CORE, yenilenme);
  check('D2 mesaj "hiçbir dönem" ve üst paket diyor, yenilenme tarihi VERMİYOR', m.includes('hiçbir dönem') && m.includes('daha yüksek kotalı') && !m.includes('yenilenir'), m);
  check('D3 mesaj gereken ve tavan satırını söylüyor', m.includes('3.001 satır') && m.includes('3.000 satır'), m);
}
{
  const k = kotaKarari({ kota: CORE, kullanilanSatir: 100, kullanilanDosya: 30, gerekenSatir: 10 });
  check('D4 dosya hakkı bitti → DOSYA_TAVANI (satır kalsa bile)', !k.izin && k.sebep === 'DOSYA_TAVANI', JSON.stringify(k));
  const m = kotaRedMesaji(k, CORE, yenilenme);
  check('D5 dosya mesajı dosya hakkını ve yenilenme tarihini söylüyor', m.includes('30 dosyalık') && m.includes('15.10.2026'), m);
}
{
  const k = kotaKarari({ kota: CORE, kullanilanSatir: 2800, kullanilanDosya: 5, gerekenSatir: 207 });
  check('D6 kalan satır yetmiyor → SATIR_TAVANI', !k.izin && k.sebep === 'SATIR_TAVANI', JSON.stringify(k));
  check('D7 kalan satır doğru (200)', k.kalanSatir === 200, `${k.kalanSatir}`);
  const m = kotaRedMesaji(k, CORE, yenilenme);
  check('D8 satır mesajı kalan + gereken + "kısmen çevrilmez"', m.includes('200 satırlık') && m.includes('207 satır') && m.includes('kısmen çevrilmez'), m);
}
{
  const k = kotaKarari({ kota: CORE, kullanilanSatir: 2793, kullanilanDosya: 29, gerekenSatir: 207 });
  check('D9 tam sığan istek (son dosya, son satır) → izin', k.izin && k.sebep === null, JSON.stringify(k));
}
{
  const k = kotaKarari({ kota: CORE, kullanilanSatir: 3000, kullanilanDosya: 30, gerekenSatir: 0 });
  check('D10 çevrilecek satırı olmayan istek reddedilmez (kota harcamaz)', k.izin, JSON.stringify(k));
}
{
  const k = kotaKarari({ kota: CORE, kullanilanSatir: 3500, kullanilanDosya: 40, gerekenSatir: 1 });
  check('D11 aşılmış kullanımda kalan negatif olmaz', k.kalanSatir === 0 && k.kalanDosya === 0, JSON.stringify(k));
}
check('D12 izinli kararda mesaj boş', kotaRedMesaji(kotaKarari({ kota: CORE, kullanilanSatir: 0, kullanilanDosya: 0, gerekenSatir: 5 }), CORE, yenilenme) === '');
{
  const devam = kotaKarari({ kota: CORE, kullanilanSatir: 100, kullanilanDosya: 30, gerekenSatir: 10, yeniDosya: false });
  check('D13 devam isteği dosya tavanına takılmaz (dosya zincirin başında düştü)', devam.izin, JSON.stringify(devam));
  const yeni = kotaKarari({ kota: CORE, kullanilanSatir: 100, kullanilanDosya: 30, gerekenSatir: 10, yeniDosya: true });
  check('D14 yeni istek aynı durumda DOSYA_TAVANI alır', !yeni.izin && yeni.sebep === 'DOSYA_TAVANI');
  const satir = kotaKarari({ kota: CORE, kullanilanSatir: 2995, kullanilanDosya: 30, gerekenSatir: 10, yeniDosya: false });
  check('D15 devam isteği satır tavanına yine takılır', !satir.izin && satir.sebep === 'SATIR_TAVANI');
}
{
  const tam = sonucHesabi({ toplamSatir: 300, teslimEdilen: 300, oncekiTeslim: 0 });
  check('D16 tam teslim → BASARILI, hepsi düşer', tam.durum === 'BASARILI' && tam.dusulenSatir === 300 && tam.toplamTeslim === 300, JSON.stringify(tam));
  const kismi = sonucHesabi({ toplamSatir: 300, teslimEdilen: 240, oncekiTeslim: 0 });
  check('D17 ★ kısmi teslim → KISMI, yalnız teslim edilen düşer', kismi.durum === 'KISMI' && kismi.dusulenSatir === 240, JSON.stringify(kismi));
  const hata = sonucHesabi({ toplamSatir: 300, teslimEdilen: 0, oncekiTeslim: 0 });
  check('D18 ★ hiç teslim yok → BASARISIZ, hiçbir şey düşmez', hata.durum === 'BASARISIZ' && hata.dusulenSatir === 0, JSON.stringify(hata));
  const devamTam = sonucHesabi({ toplamSatir: 300, teslimEdilen: 300, oncekiTeslim: 240 });
  check('D19 ★ devam tamamlanınca yalnız KALAN 60 satır düşer', devamTam.durum === 'BASARILI' && devamTam.dusulenSatir === 60, JSON.stringify(devamTam));
  const devamHata = sonucHesabi({ toplamSatir: 300, teslimEdilen: 0, oncekiTeslim: 240 });
  check('D20 devam hata alırsa hiçbir şey düşmez, zincir teslimi korunur', devamHata.dusulenSatir === 0 && devamHata.toplamTeslim === 240 && devamHata.durum === 'KISMI', JSON.stringify(devamHata));
  const bos = sonucHesabi({ toplamSatir: 0, teslimEdilen: 0, oncekiTeslim: 0 });
  check('D21 çevrilecek satırı olmayan istek BASARILI, 0 düşer', bos.durum === 'BASARILI' && bos.dusulenSatir === 0);
  const tasma = sonucHesabi({ toplamSatir: 300, teslimEdilen: 999, oncekiTeslim: 0 });
  check('D22 teslim toplamı aşamaz (düşen ≤ satır)', tasma.dusulenSatir === 300, JSON.stringify(tasma));
}

// ── T) DÖNEM ────────────────────────────────────────────────────────────────
console.log('\nT) Kota dönemi — abonelik dönemi, takvim ayı değil');
const d = (s: string) => new Date(s);
const esit = (a: Date, b: string) => a.toISOString() === new Date(b).toISOString();
{
  const p = kotaDonemi(d('2026-01-15T10:00:00Z'), 'MONTHLY', 1, d('2026-03-14T09:00:00Z'));
  check('T1 çapa 15 Oca 10:00, şimdi 14 Mar 09:00 → dönem 15 Şub – 15 Mar', esit(p.baslangic, '2026-02-15T10:00:00Z') && esit(p.bitis, '2026-03-15T10:00:00Z'), `${p.baslangic.toISOString()} – ${p.bitis.toISOString()}`);
  check('T2 dönem başlangıcı ayın 1\'i DEĞİL (takvim ayı kullanılmıyor)', p.baslangic.getUTCDate() === 15);
}
{
  const p = kotaDonemi(d('2026-01-15T10:00:00Z'), 'MONTHLY', 1, d('2026-03-15T10:00:00Z'));
  check('T3 tam yenilenme anında YENİ dönem başlar', esit(p.baslangic, '2026-03-15T10:00:00Z'), p.baslangic.toISOString());
}
{
  const capa = d('2026-01-31T12:00:00Z');
  const sub = kotaDonemi(capa, 'MONTHLY', 1, d('2026-02-28T13:00:00Z'));
  const mar = kotaDonemi(capa, 'MONTHLY', 1, d('2026-03-31T12:00:00Z'));
  check('T4 31 Oca çapası Şubat\'ta 28\'ine kırpılır', esit(sub.baslangic, '2026-02-28T12:00:00Z'), sub.baslangic.toISOString());
  check('T5 Mart\'ta yine 31\'ine döner (kırpılma zincirlenmez)', esit(mar.baslangic, '2026-03-31T12:00:00Z'), mar.baslangic.toISOString());
  check('T6 Şubat dönemi 31 Mart\'ta biter', esit(sub.bitis, '2026-03-31T12:00:00Z'), sub.bitis.toISOString());
}
{
  const p = kotaDonemi(d('2025-06-01T00:00:00Z'), 'YEARLY', 1, d('2026-09-14T00:00:00Z'));
  check('T7 yıllık periyot 12 ay adımlar', esit(p.baslangic, '2026-06-01T00:00:00Z') && esit(p.bitis, '2027-06-01T00:00:00Z'), `${p.baslangic.toISOString()}`);
}
{
  const p = kotaDonemi(d('2026-09-20T00:00:00Z'), 'MONTHLY', 1, d('2026-09-14T00:00:00Z'));
  check('T8 çapa gelecekteyse ilk dönem çapadan başlar', esit(p.baslangic, '2026-09-20T00:00:00Z'), p.baslangic.toISOString());
}
{
  const p = kotaDonemi(d('2024-02-29T08:00:00Z'), 'MONTHLY', 1, d('2026-09-14T00:00:00Z'));
  check('T9 uzun süre sonra doğru dönem (29 Şub çapası, 30 ay)', esit(p.baslangic, '2026-08-29T08:00:00Z') && esit(p.bitis, '2026-09-29T08:00:00Z'), `${p.baslangic.toISOString()} – ${p.bitis.toISOString()}`);
}
{
  const p = kotaDonemi(d('2026-09-01T00:00:00Z'), 'BILINMEYEN', 0, d('2026-09-14T00:00:00Z'));
  check('T10 tanınmayan periyot/adet aylık·1 sayılır', esit(p.bitis, '2026-10-01T00:00:00Z'), p.bitis.toISOString());
}
check('T11 TR tarihi UTC+3: 22:30 UTC ertesi gün', trTarih(d('2026-09-14T22:30:00Z')) === '15.09.2026', trTarih(d('2026-09-14T22:30:00Z')));

// ── W) KABLOLAMA ────────────────────────────────────────────────────────────
// Gerçek servis/controller/DTO sınıfları; Prisma bellekte sahte. Sahte `where`
// değerlendiricisi servisin kullandığı operatörlerin DIŞINDA bir şey görürse
// PATLAR — sessizce "eşleşti" demez (yalancı yeşil dersi).

type Satir = Record<string, any>;
const DK = 60_000;
const GUN = 24 * 60 * DK;
const Q = '8a2f4a4e-2b7c-4a55-9d0e-0f6f3c1b2a10';
const Q_BASKA = '5d1c7e2a-0b3f-4c8d-9e6a-7f2b1c0d9e8f';

function eslesir(kayit: Satir, where: Record<string, any> | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([alan, kosul]) => {
    if (alan === 'OR') return (kosul as Array<Record<string, any>>).some((alt) => eslesir(kayit, alt));
    const deger = kayit[alan];
    const olcek = (v: unknown) => (v instanceof Date ? v.getTime() : v);
    if (kosul instanceof Date) return olcek(deger) === kosul.getTime();
    if (kosul !== null && typeof kosul === 'object') {
      return Object.entries(kosul).every(([op, hedef]) => {
        const a = olcek(deger) as number;
        const b = olcek(hedef) as number;
        switch (op) {
          case 'gt': return a > b;
          case 'gte': return a >= b;
          case 'lt': return a < b;
          case 'lte': return a <= b;
          case 'in': return (hedef as unknown[]).includes(deger);
          default: throw new Error(`sahte Prisma: tanınmayan operatör "${op}"`);
        }
      });
    }
    return deger === kosul;
  });
}

interface Sahne {
  abonelik: { olusturuldu: Date; periyot: string; periyotAdedi: number; paket: { kod: string; seviye: string; kapsam: string } } | null;
  emailVerified: boolean;
  teklifler: Record<string, { firmaId: string; sheets: unknown }>;
  onbellek: Record<string, string>;
  tuketim: Satir[];
  olaylar: string[];
}

function sahteDb(s: Sahne): any {
  let sayac = 0;
  const tuketimSuz = (where: Record<string, any>) => s.tuketim.filter((k) => eslesir(k, where));
  const db: any = {
    user: { findUnique: async () => ({ emailVerified: s.emailVerified }) },
    quote: {
      // Gerçek Prisma gibi: `where`'de olmayan alan SÜZMEZ. (İlk hali firmaId
      // eksikse "bulunamadı" diyordu — firma süzgeci silinse bile W27 yeşil
      // kalırdı; mutant G21 başka testlere çarparak ölmüştü, W27'ye değil.)
      findFirst: async ({ where }: any) => {
        const bulunan = Object.entries(s.teklifler).find(([id, t]) => eslesir({ id, ...t }, where));
        return bulunan ? { sheets: bulunan[1].sheets } : null;
      },
    },
    abonelik: {
      findUnique: async () =>
        s.abonelik
          ? {
              id: 'ab-1',
              olusturuldu: s.abonelik.olusturuldu,
              paketSurumu: { periyot: s.abonelik.periyot, periyotAdedi: s.abonelik.periyotAdedi, paket: s.abonelik.paket },
            }
          : null,
    },
    ceviriTuketimi: {
      aggregate: async ({ where, _sum }: any) => {
        const l = tuketimSuz(where);
        const alan = Object.keys(_sum)[0];
        return { _sum: { [alan]: l.length ? l.reduce((t, k) => t + k[alan], 0) : null } };
      },
      count: async ({ where }: any) => tuketimSuz(where).length,
      findFirst: async ({ where, orderBy, select }: any) => {
        const l = tuketimSuz(where);
        if (orderBy) {
          const [alan, yon] = Object.entries(orderBy)[0] as [string, string];
          const deger = (k: Satir) => (k[alan] instanceof Date ? k[alan].getTime() : -Infinity);
          l.sort((a, b) => (yon === 'desc' ? deger(b) - deger(a) : deger(a) - deger(b)));
        }
        const k = l[0];
        if (!k) return null;
        return select ? Object.fromEntries(Object.keys(select).map((a) => [a, k[a]])) : { ...k };
      },
      create: async ({ data }: any) => {
        s.olaylar.push('create');
        const k = { id: `tk-${++sayac}`, ...data };
        s.tuketim.push(k);
        return { id: k.id };
      },
      updateMany: async ({ where, data }: any) => {
        const l = tuketimSuz(where);
        l.forEach((k) => Object.assign(k, data));
        return { count: l.length };
      },
    },
    translation: {
      findMany: async ({ where }: any) =>
        (where.sourceText.in as string[])
          .filter((m) => s.onbellek[m] !== undefined)
          .map((m) => ({ sourceText: m, translatedText: s.onbellek[m] })),
    },
    systemSettings: { findMany: async () => [] },
    $queryRaw: async (_parcalar: TemplateStringsArray, ...degerler: unknown[]) => {
      s.olaylar.push(`kilit:${degerler.join(',')}`);
      return [{ kilit: '' }];
    },
    $transaction: async (fn: (tx: any) => Promise<unknown>, ayar?: { timeout?: number; maxWait?: number }) => {
      s.olaylar.push(`tx:${ayar?.maxWait ?? '-'}/${ayar?.timeout ?? '-'}`);
      return fn(db);
    },
  };
  return db;
}

const TEKLIF_SAYFALARI = [sayfa(['PVC BORU', 'PVC BORU', 'DN 20', 'ÇELİK BORU'])]; // 3 satır · 2 metin

function kur(ek: Partial<Sahne> = {}) {
  const s: Sahne = {
    abonelik: {
      olusturuldu: new Date(Date.now() - 3 * GUN),
      periyot: 'MONTHLY',
      periyotAdedi: 1,
      paket: { kod: 'pro-mek', seviye: 'pro', kapsam: 'mechanical' },
    },
    emailVerified: true,
    teklifler: { [Q]: { firmaId: 'f1', sheets: TEKLIF_SAYFALARI } },
    onbellek: { 'PVC BORU': 'PVC PIPE', 'ÇELİK BORU': 'STEEL PIPE' },
    tuketim: [],
    olaylar: [],
    ...ek,
  };
  const db = sahteDb(s);
  const kota = new CeviriKotaServisi(db);
  const aiKayitlari: unknown[] = [];
  const ai = { logUsage: async (x: unknown) => { aiKayitlari.push(x); } };
  const servis = new CeviriService(db, ai as any, kota);
  let cevirCagrisi = 0;
  const asil = servis.cevir.bind(servis);
  (servis as any).cevir = async (...a: Parameters<CeviriService['cevir']>) => {
    cevirCagrisi++;
    return asil(...a);
  };
  return { s, kota, servis, aiKayitlari, cevirSayisi: () => cevirCagrisi };
}

const K1 = { userId: 'u1', firmaId: 'f1' };
const OZET = ceviriIcerigi(TEKLIF_SAYFALARI).ozet;

/** Hazır tüketim kaydı. Verilmezse: düşülen = satır, bitmiş kayıt oluşturmadan 1 dk sonra sonuçlanmış. */
function tuketimKaydi(ek: Satir): Satir {
  const olusturuldu: Date = ek.olusturuldu ?? new Date(Date.now() - 60 * DK);
  const durum: string = ek.durum ?? 'BASARILI';
  const satir: number = ek.satirSayisi ?? 0;
  return {
    id: `on-${Math.random().toString(36).slice(2)}`,
    firmaId: 'f1', userId: 'u1', abonelikId: 'ab-1', paketKodu: 'pro-mek',
    quoteId: Q, hedefDil: 'en', metinSayisi: 0, icerikOzeti: 'baska-icerik',
    satirSayisi: satir, dusulenSatir: satir, toplamTeslim: durum === 'ISLENIYOR' ? 0 : satir, devam: false,
    durum, olusturuldu, hata: null,
    sonuclandi: durum === 'ISLENIYOR' ? null : new Date(olusturuldu.getTime() + DK),
    ...ek,
  };
}

async function hata(fn: () => Promise<unknown>): Promise<any> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
}
const yanit = (e: any) => (typeof e?.getResponse === 'function' ? e.getResponse() : {});

async function wBlogu(): Promise<void> {
  console.log('\nW) Kablolama — servis, controller, DTO');

  {
    // Pro mekanik tavanı 4.500; tamamı bu dönem harcanmış.
    const t = kur({ tuketim: [tuketimKaydi({ satirSayisi: 4500 })] });
    const e = await hata(() => t.servis.teklifiCevir(K1, Q));
    check('W1 kota dolu → 403 CEVIRI_KOTASI', e?.getStatus?.() === 403 && yanit(e).kod === 'CEVIRI_KOTASI', JSON.stringify(yanit(e)));
    check('W2 hangi tavanın dolduğu söylenir (SATIR_TAVANI)', yanit(e).sebep === 'SATIR_TAVANI', String(yanit(e).sebep));
    check('W3 ★ reddedilen istekte çeviri HİÇ çağrılmaz (kota AI\'dan önce)', t.cevirSayisi() === 0, `${t.cevirSayisi()} çağrı`);
    check('W4 ★ reddedilen istekte AI kullanım kaydı YAZILMAZ', t.aiKayitlari.length === 0, `${t.aiKayitlari.length}`);
    check('W5 kota reddi tüketim kaydı bırakmaz', t.s.tuketim.length === 1, `${t.s.tuketim.length}`);
  }

  {
    const t = kur();
    const r = await t.servis.teklifiCevir(K1, Q);
    const yeni = t.s.tuketim[0];
    check('W6 ★ önbellekten dönen çeviri de TEK kalıcı kayıt bırakır', t.s.tuketim.length === 1 && yeni?.durum === 'BASARILI', `${t.s.tuketim.length} kayıt · ${yeni?.durum}`);
    check('W7 ★ kayda yazılan satır SUNUCUNUN saydığı (3) ve 3 satır düştü', yeni?.satirSayisi === 3 && yeni?.metinSayisi === 2 && yeni?.dusulenSatir === 3, `${yeni?.satirSayisi}/${yeni?.metinSayisi}/${yeni?.dusulenSatir}`);
    check('W8 önbellek isabetinde AI\'ya gidilmez', t.aiKayitlari.length === 0);
    check('W9 sonuç kotadan düştüğünü ve kalanı söyler', r.kotadanDustu === true && r.dusulenSatir === 3 && r.kota.kalanSatir === 4497 && r.kota.kalanDosya === 59, JSON.stringify(r.kota));
    check('W10 harita istemciye döner', r.harita['PVC BORU'] === 'PVC PIPE');
    const kilit = t.s.olaylar.indexOf('kilit:ceviri-kota:f1');
    check('W11 firma kilidi kayıttan ÖNCE alınır', kilit >= 0 && kilit < t.s.olaylar.indexOf('create'), t.s.olaylar.join(' → '));
    check('W11b işlem süresi sınırları açık (bekleme 5 sn / işlem 10 sn)', t.s.olaylar.includes('tx:5000/10000'), t.s.olaylar.join(' → '));

    const r2 = await t.servis.teklifiCevir(K1, Q);
    check('W12 ★ aynı içerik pencere içinde → yeni tüketim YOK', t.s.tuketim.length === 1, `${t.s.tuketim.length}`);
    check('W13 tekrar isteği işaretlenir, kotadan düşmez', r2.tekrar === true && r2.kotadanDustu === false);
    check('W14 tekrar isteği çeviriyi yeniden çalıştırmaz', t.cevirSayisi() === 1, `${t.cevirSayisi()}`);
    check('W15 tekrar isteği yine haritayı döndürür', r2.harita['ÇELİK BORU'] === 'STEEL PIPE');

    t.s.teklifler[Q] = { firmaId: 'f1', sheets: [sayfa(['PVC BORU', 'ÇELİK BORU', 'BAKIR BORU'])] };
    t.s.onbellek['BAKIR BORU'] = 'COPPER PIPE';
    await t.servis.teklifiCevir(K1, Q);
    check('W16 içerik değiştiyse yeni çeviridir (yeni tüketim)', t.s.tuketim.length === 2, `${t.s.tuketim.length}`);
  }

  {
    const t = kur({
      tuketim: [tuketimKaydi({
        icerikOzeti: OZET, satirSayisi: 3,
        olusturuldu: new Date(Date.now() - 30 * DK),
        sonuclandi: new Date(Date.now() - (TEKRAR_PENCERESI_DK + 1) * DK),
      })],
    });
    const r = await t.servis.teklifiCevir(K1, Q);
    check('W17 pencere DIŞINDA aynı içerik → yeniden kotadan düşer', t.s.tuketim.length === 2 && r.tekrar === false, `${t.s.tuketim.length}`);
  }

  {
    // 14.09 incelemesi Y2: 15 dk önce BAŞLAYIP 2 dk önce BİTEN çeviri — bağlantısı
    // kopan kullanıcı iş bitince yeniden ister. Pencere başlangıçtan ölçülseydi
    // bu ikinci tam tüketim olurdu.
    const t = kur({
      tuketim: [tuketimKaydi({
        icerikOzeti: OZET, satirSayisi: 3,
        olusturuldu: new Date(Date.now() - 15 * DK),
        sonuclandi: new Date(Date.now() - 2 * DK),
      })],
    });
    const r = await t.servis.teklifiCevir(K1, Q);
    check('W17b ★ pencere BİTİŞTEN ölçülür: uzun çevirinin yeniden denemesi tekrar sayılır', r.tekrar === true && t.s.tuketim.length === 1, `${r.tekrar} · ${t.s.tuketim.length}`);
  }

  {
    // Önbellek boş, anahtar yok → çeviri gerçekten başarısız olur.
    const t = kur({ onbellek: {} });
    const e = await hata(() => t.servis.teklifiCevir(K1, Q));
    const durum = await t.kota.durum(K1);
    check('W18 başarısız çeviri hatası kullanıcıya iletilir', e?.getStatus?.() === 400, String(e?.message));
    check('W19 ★ başarısız çeviri BASARISIZ kaydedilir', t.s.tuketim[0]?.durum === 'BASARISIZ', String(t.s.tuketim[0]?.durum));
    check('W20 ★ başarısız çeviri kotadan DÜŞMEZ', durum?.kullanilanSatir === 0 && durum?.kullanilanDosya === 0, JSON.stringify(durum));
  }

  {
    // 14.09 incelemesi Y1: bir parça patlar, 3 satırın 2'si teslim edilir.
    const t = kur();
    const asil = t.servis.cevir.bind(t.servis);
    (t.servis as any).cevir = async () => ({ harita: { 'PVC BORU': 'PVC PIPE' }, onbellekten: 1, cevrilen: 0, basarisiz: 1 });
    const r = await t.servis.teklifiCevir(K1, Q);
    const d1 = await t.kota.durum(K1);
    const k1 = t.s.tuketim[0];
    check('W21 ★ kısmi çeviri KISMI kaydedilir, yalnız TESLİM EDİLEN 2 satır düşer', k1?.durum === 'KISMI' && k1?.dusulenSatir === 2 && d1?.kullanilanSatir === 2, `${k1?.durum} · ${k1?.dusulenSatir} · ${d1?.kullanilanSatir}`);
    check('W21a kısmi sonuç kullanıcıya teslim edilmeyeni söyler (1 satır Türkçe kaldı)', r.dusulenSatir === 2 && r.cevrilemeyenSatir === 1 && r.kotadanDustu === true, JSON.stringify({ d: r.dusulenSatir, c: r.cevrilemeyenSatir }));
    check('W21b kısmi çeviri dosya hakkından bir kez yer', d1?.kullanilanDosya === 1, `${d1?.kullanilanDosya}`);

    const o = await t.kota.onizleme(K1, Q);
    check('W21c önizleme devamı tanır: yalnız KALAN 1 satır yer', o.devam === true && o.tekrar === false && o.gerekenSatir === 1, JSON.stringify({ devam: o.devam, gereken: o.gerekenSatir }));

    (t.servis as any).cevir = asil; // bu kez önbellek iki metni de karşılar
    const r2 = await t.servis.teklifiCevir(K1, Q);
    const d2 = await t.kota.durum(K1);
    const k2 = t.s.tuketim[1];
    check('W21d ★ devam tamamlanınca yalnız kalan 1 satır düşer (toplam 3, iki kez düşmez)', k2?.durum === 'BASARILI' && k2?.dusulenSatir === 1 && d2?.kullanilanSatir === 3 && r2.devam === true, `${k2?.durum} · ${k2?.dusulenSatir} · ${d2?.kullanilanSatir}`);
    check('W21e ★ devam dosya hakkından ikinci kez yemez', d2?.kullanilanDosya === 1 && k2?.devam === true, `${d2?.kullanilanDosya}`);

    await t.servis.teklifiCevir(K1, Q);
    check('W21f tamamlandıktan sonra aynı istek tekrardır (yeni kayıt yok)', t.s.tuketim.length === 2, `${t.s.tuketim.length}`);
  }

  {
    // 14.09 incelemesi O4: model bir metni atlar — hiçbir parça "başarısız" değil.
    const t = kur();
    (t.servis as any).cevir = async () => ({ harita: { 'ÇELİK BORU': 'STEEL PIPE' }, onbellekten: 0, cevrilen: 1, basarisiz: 0 });
    const r = await t.servis.teklifiCevir(K1, Q);
    check('W21g ★ atlanan metin: basarisiz=0 olsa da KISMI, yalnız 1 satır düşer', t.s.tuketim[0]?.durum === 'KISMI' && r.dusulenSatir === 1, `${t.s.tuketim[0]?.durum} · ${r.dusulenSatir}`);
  }

  {
    // Dosya tavanı dolu firmada yarım kalan çevirinin devamı engellenmez.
    const dolu = Array.from({ length: 59 }, () => tuketimKaydi({ satirSayisi: 1 }));
    const kismi = tuketimKaydi({ icerikOzeti: OZET, durum: 'KISMI', satirSayisi: 3, dusulenSatir: 2, toplamTeslim: 2, olusturuldu: new Date(Date.now() - 3 * DK), sonuclandi: new Date(Date.now() - 2 * DK) });
    const t = kur({ tuketim: [...dolu, kismi] });
    const o = await t.kota.onizleme(K1, Q);
    check('W21h devam dosya tavanına takılmaz (60/60 dosya dolu)', o.izin === true && o.devam === true && o.kota.kalanDosya === 0, JSON.stringify({ izin: o.izin, sebep: o.sebep, kalanDosya: o.kota.kalanDosya }));
  }

  {
    // Kalan kota yalnız EKSİK satıra yetiyor: 3 satırın 2'si önceden düştü, 1 satır kaldı.
    const kismi = tuketimKaydi({ icerikOzeti: OZET, durum: 'KISMI', satirSayisi: 3, dusulenSatir: 2, toplamTeslim: 2, olusturuldu: new Date(Date.now() - 3 * DK), sonuclandi: new Date(Date.now() - 2 * DK) });
    const t = kur({ tuketim: [tuketimKaydi({ satirSayisi: 4497 }), kismi] });
    const e = await hata(() => t.servis.teklifiCevir(K1, Q));
    const d = await t.kota.durum(K1);
    check('W21i ★ devam yalnız KALAN satırla karara girer (kalan 1 satır yeter)', e === null && d?.kullanilanSatir === 4500 && d?.kalanSatir === 0, `${e?.message ?? 'ok'} · ${d?.kullanilanSatir}`);
  }

  {
    const t = kur({ tuketim: [tuketimKaydi({ icerikOzeti: OZET, durum: 'ISLENIYOR', satirSayisi: 3, olusturuldu: new Date(Date.now() - DK) })] });
    const e = await hata(() => t.servis.teklifiCevir(K1, Q));
    check('W22 süren çeviri için ikinci istek 409, yeni kayıt yok', e?.getStatus?.() === 409 && yanit(e).kod === 'CEVIRI_SURUYOR' && t.s.tuketim.length === 1);
  }

  {
    const bayat = tuketimKaydi({ durum: 'ISLENIYOR', satirSayisi: 4500, olusturuldu: new Date(Date.now() - (ISLENIYOR_ZAMAN_ASIMI_DK + 1) * DK) });
    const t = kur({ tuketim: [bayat] });
    const e = await hata(() => t.servis.teklifiCevir(K1, Q));
    check('W23 zaman aşımına uğramış ayırma kotayı işgal etmez', e === null, String(e?.message));
    check('W24 zaman aşımına uğramış ayırma BASARISIZ yapılır ve nedeni yazılır', bayat.durum === 'BASARISIZ' && bayat.hata === ZAMAN_ASIMI_NOTU, `${bayat.durum} · ${bayat.hata}`);

    // 14.09 incelemesi O5: zaman aşımıyla kapatılan UZUN iş sonradan biterse kotasız kalmaz.
    await t.kota.sonuclandir(bayat.id, { toplamSatir: 4500, teslimEdilen: 4500, oncekiTeslim: 0, onbellekten: 0, cevrilen: 10, basarisizParca: 0 });
    check('W24b ★ zaman aşımına uğramış iş geç biterse sonuçlanır ve düşer', bayat.durum === 'BASARILI' && bayat.dusulenSatir === 4500, `${bayat.durum} · ${bayat.dusulenSatir}`);
  }

  {
    // 14.09 incelemesi O5: deploy/çökme sonrası yarım kalan ayırma 409 ve kota işgali yapmasın.
    const yarim = tuketimKaydi({ icerikOzeti: OZET, durum: 'ISLENIYOR', satirSayisi: 3, olusturuldu: new Date(Date.now() - 2 * DK) });
    const biten = tuketimKaydi({ satirSayisi: 100 });
    const t = kur({ tuketim: [yarim, biten] });
    await t.kota.onApplicationBootstrap();
    check('W24c ★ açılışta yarım kalan ayırma kapatılır (nedeniyle)', yarim.durum === 'BASARISIZ' && yarim.hata === YENIDEN_BASLAMA_NOTU, `${yarim.durum} · ${yarim.hata}`);
    check('W24d açılış temizliği bitmiş kayda dokunmaz', biten.durum === 'BASARILI' && biten.dusulenSatir === 100);
    const r = await hata(() => t.servis.teklifiCevir(K1, Q));
    check('W24e açılıştan sonra aynı teklif 409 ALMAZ', r === null, String(r?.message));
    await t.kota.sonuclandir(yarim.id, { toplamSatir: 3, teslimEdilen: 3, oncekiTeslim: 0, onbellekten: 0, cevrilen: 0, basarisizParca: 0 });
    check('W24f süreci ölmüş kayıt sonradan sonuçlanamaz', yarim.durum === 'BASARISIZ', yarim.durum);
    const bozukDb = { ceviriTuketimi: { updateMany: async () => { throw new Error('DB yok'); } } };
    const e = await hata(() => new CeviriKotaServisi(bozukDb as any).onApplicationBootstrap());
    check('W24g veritabanı yoksa açılış temizliği uygulamayı düşürmez', e === null, String(e?.message));
  }

  {
    const t = kur({ emailVerified: false });
    const e = await hata(() => t.servis.teklifiCevir(K1, Q));
    check('W25 e-posta doğrulanmamış → 403 EPOSTA_DOGRULANMADI', e?.getStatus?.() === 403 && yanit(e).kod === 'EPOSTA_DOGRULANMADI');
    check('W26 e-posta kapısı işlem açmadan ve kayıt yazmadan döner', !t.s.olaylar.some((o) => o.startsWith('tx')) && t.s.tuketim.length === 0 && t.cevirSayisi() === 0);
  }

  {
    const t = kur({ teklifler: { [Q_BASKA]: { firmaId: 'f2', sheets: TEKLIF_SAYFALARI } } });
    const e = await hata(() => t.servis.teklifiCevir(K1, Q_BASKA));
    check('W27 başka firmanın teklifi → 404, kayıt yok', e?.getStatus?.() === 404 && t.s.tuketim.length === 0);
  }

  {
    const ortak = () => [tuketimKaydi({ satirSayisi: 1000 })];
    const mek = await kur({ tuketim: ortak() }).kota.durum(K1);
    const t = kur({ tuketim: ortak() });
    t.s.abonelik!.paket = { kod: 'pro-mep', seviye: 'pro', kapsam: 'mep' };
    const mep = await t.kota.durum(K1);
    check('W28 ★ pro-mek kalan 3.500', mek?.kalanSatir === 3500, JSON.stringify(mek));
    check('W29 ★ pro-mep kalan 8.000 (aynı kullanım, farklı tavan)', mep?.kalanSatir === 8000 && mep?.kota.dosya === 120, JSON.stringify(mep));
  }

  {
    // Kabul ölçütü 12'nin birebir senaryosu: AYNI dosya iki pakette çevrilir.
    const mek = await kur().servis.teklifiCevir(K1, Q);
    const t = kur();
    t.s.abonelik!.paket = { kod: 'pro-mep', seviye: 'pro', kapsam: 'mep' };
    const mep = await t.servis.teklifiCevir(K1, Q);
    check('W29b ★ aynı dosya: pro-mek kalan 4.497 · pro-mep kalan 8.997', mek.kota.kalanSatir === 4497 && mep.kota.kalanSatir === 8997, `${mek.kota.kalanSatir} · ${mep.kota.kalanSatir}`);
  }

  {
    // Kabul ölçütü 9: tavandan BÜYÜK tek dosya — kota boşken bile reddedilir, ayrı mesajla.
    const buyuk = [sayfa(Array.from({ length: 3001 }, (_, i) => `MALZEME ${i}`))];
    const t = kur({ teklifler: { [Q]: { firmaId: 'f1', sheets: buyuk } } });
    t.s.abonelik!.paket = { kod: 'core-mek', seviye: 'core', kapsam: 'mechanical' };
    const e = await hata(() => t.servis.teklifiCevir(K1, Q));
    const y = yanit(e);
    check('W29c tavandan büyük dosya → DOSYA_TAVANDAN_BUYUK (kota boşken de)', y.sebep === 'DOSYA_TAVANDAN_BUYUK', String(y.sebep));
    check('W29d mesaj "hiçbir dönem çevrilemez" der ve paket eylemi taşır', /hiçbir dönem çevrilemez/.test(String(y.mesaj)) && y.eylem?.yol === '/abonelik', String(y.mesaj));
    check('W29e tavandan büyük dosyada AI\'ya gidilmez', t.cevirSayisi() === 0 && t.aiKayitlari.length === 0);
  }

  {
    const t = kur();
    t.s.abonelik!.paket = { kod: 'prototip-x', seviye: 'suite', kapsam: 'mep' };
    const o = await t.kota.durum(K1);
    check('W30 eşlenmemiş paket en düşük kotayı alır', o?.kota.satir === EN_DUSUK_KOTA.satir && o?.kota.dosya === EN_DUSUK_KOTA.dosya, JSON.stringify(o?.kota));
  }

  {
    const t = kur({
      tuketim: [
        tuketimKaydi({ satirSayisi: 0 }), // çevrilecek satırı olmayan istek
        tuketimKaydi({ satirSayisi: 700, durum: 'BASARISIZ' }),
        tuketimKaydi({ satirSayisi: 900, olusturuldu: new Date(Date.now() - 4 * GUN) }), // önceki dönem
        tuketimKaydi({ satirSayisi: 200 }),
        tuketimKaydi({ durum: 'KISMI', satirSayisi: 300, dusulenSatir: 50, toplamTeslim: 50 }),
        tuketimKaydi({ durum: 'BASARILI', satirSayisi: 300, dusulenSatir: 30, toplamTeslim: 80, devam: true }),
      ],
    });
    const o = await t.kota.durum(K1);
    check('W31 sayım: bu dönemin BAŞARILI + KISMI kayıtlarının DÜŞÜLEN satırı (200+50+30)', o?.kullanilanSatir === 280, `${o?.kullanilanSatir}`);
    check('W32 sayım: 0 satırlık istek ve DEVAM kaydı dosya sayılmaz (2 dosya)', o?.kullanilanDosya === 2, `${o?.kullanilanDosya}`);
  }

  {
    const t = kur();
    const o = await t.kota.onizleme(K1, Q);
    check('W33 önizleme sunucunun saydığı satırı söyler', o.gerekenSatir === 3 && o.metinSayisi === 2 && o.izin === true && o.tekrar === false && o.devam === false);
    check('W34 önizleme kayıt yazmaz', t.s.tuketim.length === 0);
    const dolu = kur({ tuketim: [tuketimKaydi({ satirSayisi: 4499 })] });
    const o2 = await dolu.kota.onizleme(K1, Q);
    check('W35 önizleme reddi mesajıyla gelir', o2.izin === false && o2.sebep === 'SATIR_TAVANI' && !!o2.redMesaji, JSON.stringify(o2));
  }

  {
    // 14.09 incelemesi O1: kota dolmuşken az önce çevrilen içerik — sunucu bedava döner,
    // önizleme reddedip isteği hiç göndermezse kullanıcı çevirisini göremez.
    const t = kur({
      tuketim: [
        tuketimKaydi({ satirSayisi: 4497 }),
        tuketimKaydi({ icerikOzeti: OZET, satirSayisi: 3, olusturuldu: new Date(Date.now() - 3 * DK), sonuclandi: new Date(Date.now() - 2 * DK) }),
      ],
    });
    const o = await t.kota.onizleme(K1, Q);
    check('W35b ★ önizleme tekrarı tanır: kota dolu olsa da izin, 0 satır', o.tekrar === true && o.izin === true && o.gerekenSatir === 0 && o.kota.kalanSatir === 0, JSON.stringify({ tekrar: o.tekrar, izin: o.izin, gereken: o.gerekenSatir }));
    const s = kur({ tuketim: [tuketimKaydi({ icerikOzeti: OZET, durum: 'ISLENIYOR', satirSayisi: 3, olusturuldu: new Date(Date.now() - DK) })] });
    const o2 = await s.kota.onizleme(K1, Q);
    check('W35c önizleme süren çeviriyi söyler', o2.suruyor === true, JSON.stringify({ suruyor: o2.suruyor }));
  }

  {
    const t = kur({ abonelik: null });
    check('W36 abonelik yok → profil kotası null', (await t.kota.durum(K1)) === null);
    const e = await hata(() => t.servis.teklifiCevir(K1, Q));
    check('W37 abonelik yok → çeviri 403 ABONELIK_KISITLI', e?.getStatus?.() === 403 && yanit(e).kod === 'ABONELIK_KISITLI');
  }

  {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const govde = await pipe.transform(
      { quoteId: Q, hedefDil: 'en', satirSayisi: 1, metinler: ['X'], gerekenSatir: 1 },
      { type: 'body', metatype: CeviriIstegiDto, data: '' },
    );
    check('W38 ★ DTO istemcinin satır/metin alanlarını ATAR', JSON.stringify(Object.keys(govde).sort()) === '["hedefDil","quoteId"]', JSON.stringify(govde));
    const kotuId = await hata(() => pipe.transform({ quoteId: 'abc' }, { type: 'body', metatype: CeviriIstegiDto, data: '' }));
    check('W39 DTO: UUID olmayan teklif kimliği 400', kotuId?.getStatus?.() === 400);
    const kotuDil = await hata(() => pipe.transform({ quoteId: Q, hedefDil: 'de' }, { type: 'body', metatype: CeviriIstegiDto, data: '' }));
    check('W40 DTO: tanınmayan hedef dil 400', kotuDil?.getStatus?.() === 400);
    const kotuSorgu = await hata(() => pipe.transform({ quoteId: '1' }, { type: 'query', metatype: CeviriOnizlemeSorgusuDto, data: '' }));
    check('W41 önizleme sorgusu da doğrulanır', kotuSorgu?.getStatus?.() === 400);
  }

  {
    const alinan: unknown[][] = [];
    const ctrl = new AiController({} as any, { teklifiCevir: async (...a: unknown[]) => { alinan.push(a); return {}; } } as any, {} as any, {} as any);
    const govde = Object.assign(new CeviriIstegiDto(), { quoteId: Q, satirSayisi: 1 });
    await ctrl.translate({ id: 'u1', firmaId: 'f1' }, govde);
    check('W42 ★ controller servise yalnız kimlik + teklif + dil geçirir', JSON.stringify(alinan) === JSON.stringify([[K1, Q, 'en']]), JSON.stringify(alinan));
    const tr = AiController.prototype.translate;
    const guardlar: unknown[] = Reflect.getMetadata(GUARDS_METADATA, tr) ?? [];
    check('W43 translate hız sınırı guard\'ı taşır', guardlar.includes(ThrottlerGuard));
    check('W44 translate dakikada 10 istek', Reflect.getMetadata('THROTTLER:LIMITdefault', tr) === 10 && Reflect.getMetadata('THROTTLER:TTLdefault', tr) === 60_000);
  }

  {
    // 14.09 incelemesi D2: kısıtlı firmada profil kotayı gösterip çevirinin kapalı olduğunu söylemeli.
    const sorulan: unknown[][] = [];
    const ozet = { kalanSatir: 3000 };
    const ctrl = new AiController(
      {} as any,
      {} as any,
      { durum: async () => ozet } as any,
      { yetenekAcikMi: async (...a: unknown[]) => { sorulan.push(a); return false; } } as any,
    );
    const r: any = await ctrl.translateKota({ id: 'u1', firmaId: 'f1' });
    check('W46 profil kotası çevirinin KAPALI olduğunu taşır (kısıtlı firma)', r?.ceviriAcik === false && r?.kalanSatir === 3000, JSON.stringify(r));
    check('W47 erişim CEVIRI yeteneğiyle ve firmanın kendisiyle sorulur', JSON.stringify(sorulan) === JSON.stringify([['f1', Yetenek.CEVIRI]]), JSON.stringify(sorulan));
    const aboneliksiz = new AiController({} as any, {} as any, { durum: async () => null } as any, { yetenekAcikMi: async () => { throw new Error('sorulmamalı'); } } as any);
    check('W48 aboneliği olmayan firmada profil kotası null', (await aboneliksiz.translateKota({ id: 'u1', firmaId: 'f1' })) === null);
  }

  {
    const yol = path.join(__dirname, '../../frontend/app/fiyatlar/page.tsx');
    const metin = fs.existsSync(yol) ? fs.readFileSync(yol, 'utf8') : '';
    const pencere = metin.match(/tamamlandıktan sonraki (\d+) dakika içinde/)?.[1];
    check('W45 fiyat sayfasındaki tekrar penceresi sunucuyla aynı ve BİTİŞTEN ölçüldüğünü söylüyor', Number(pencere) === TEKRAR_PENCERESI_DK, `sayfa: ${pencere} · sunucu: ${TEKRAR_PENCERESI_DK}`);
    check('W45b fiyat sayfası kısmi çeviride yalnız çevrilen satırın düştüğünü söylüyor', /yalnız çevrilen satırlar düşer/.test(metin));
  }
}

wBlogu()
  .catch((e) => {
    failed++;
    failures.push(`W bloğu beklenmedik hata: ${(e as Error)?.stack ?? e}`);
  })
  .finally(() => {
    console.log(`\n${passed} geçti · ${failed} kaldı`);
    if (failed > 0) {
      console.log('\nKALANLAR:');
      failures.forEach((f) => console.log(`  - ${f}`));
      process.exit(1);
    }
    process.exit(0);
  });
