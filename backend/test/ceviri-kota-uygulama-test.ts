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
  anahtarSatirlari,
  CEVIRI_KAYNAK_ALANI,
  ceviriAnahtari,
  ceviriGuvenliMi,
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
  YENIDEN_BASLAMA_NOTU,
  ZAMAN_ASIMI_NOTU,
} from '../src/ozellik/odeme/abonelik/ceviri-kota.servisi';
import { CeviriService } from '../src/ozellik/giris/ai/ceviri.service';
import { AiController } from '../src/ozellik/giris/ai/ai.controller';
import { CeviriIstegiDto, CeviriOnizlemeSorgusuDto } from '../src/ozellik/giris/ai/dto/ceviri.dto';
import { Yetenek } from '../src/ozellik/odeme/abonelik/erisim.servisi';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

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
  // Faz 6.11 (15.09): "kayıtta kaynak duruyor mu" ikinci ikizdir — ekran ve
  // dosya İngilizceyi AYNI satırlara uygular (kayıtta İngilizce duran hücreye
  // ikisi de dokunmaz). Ayrışırsa ekranda İngilizce görünen dosyada Türkçe iner.
  const duruyorGovdesi = (kod: string) =>
    kod.match(/export function kayittaKaynakDuruyorMu\([^)]*\)[^{]*\{([\s\S]*?)\n\}/)?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
  const beDuruyor = duruyorGovdesi(fs.readFileSync(path.join(__dirname, '../src/ozellik/giris/ai/ceviri-kurali.ts'), 'utf8'));
  const feDuruyor = duruyorGovdesi(fe);
  check('K31 ★ ön yüz kayittaKaynakDuruyorMu gövdesi sunucununkiyle AYNI', beDuruyor.length > 0 && beDuruyor === feDuruyor, `sunucu: ${beDuruyor} · ön yüz: ${feDuruyor}`);
  check('K31b ön yüzde sonuç alanı sunucuyla aynı ad', /const CEVIRI_SONUC_ALANI = '_ceviriSonucu';/.test(fe), 'ön yüz sabiti yok');
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
  check('D8 ★ satır mesajı YENİ satırı, kalanı ve "kısmen çevrilmez"i söyler', m.includes('207 satırı yeni') && m.includes('200 satır') && m.includes('kısmen çevrilmez'), m);
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
  // REVİZE K-T7 (15.09): "devam" kalktı — her çeviri yeni dosyadır. D13 ve D15
  // (devamın dosya tavanına takılmaması) silindi; yeni istek dosya tavanında durur.
  const yeni = kotaKarari({ kota: CORE, kullanilanSatir: 100, kullanilanDosya: 30, gerekenSatir: 10 });
  check('D14 yeni istek dosya hakkı bitmişken DOSYA_TAVANI alır (devam istisnası yok)', !yeni.izin && yeni.sebep === 'DOSYA_TAVANI');
}
{
  // HEPSİ YA DA HİÇBİRİ (REVİZE K-T7): sonuç iki durumlu. D19-D20 (devam zinciri) silindi.
  // PARA HARCANANA HAK DÜŞER (Emre 16.09): düşen satır = API'DEN DÖNEN satır.
  const tam = sonucHesabi({ toplamSatir: 300, teslimEdilen: 300, apiSatir: 300 });
  check('D16 tam teslim, hepsi API\'den → BASARILI, hepsi düşer', tam.durum === 'BASARILI' && tam.dusulenSatir === 300 && tam.toplamTeslim === 300, JSON.stringify(tam));
  // ── HARCANAN SATIR DÜŞER (Emre 16.09 ek kararı) ──
  // "Teslim edildi mi" ile "para harcandı mı" AYRI sorulardır: tamamlanamayan
  // çeviride kullanıcıya hiçbir satır verilmez (toplamTeslim 0) ama karşılık
  // alınan satırların parası harcanmıştır ve kotadan düşer.
  const eksik = sonucHesabi({ toplamSatir: 300, teslimEdilen: 299, apiSatir: 299 });
  check('D17 ★ tek satır eksik → BASARISIZ, TESLİM 0 ama karşılık alınan 299 satır DÜŞER',
    eksik.durum === 'BASARISIZ' && eksik.dusulenSatir === 299 && eksik.toplamTeslim === 0, JSON.stringify(eksik));
  const hata = sonucHesabi({ toplamSatir: 300, teslimEdilen: 0, apiSatir: 0 });
  check('D18 ★ karşılık HİÇ alınamadı (ağ/sunucu hatası) → BASARISIZ, hiçbir şey düşmez', hata.durum === 'BASARISIZ' && hata.dusulenSatir === 0, JSON.stringify(hata));
  const yarimApi = sonucHesabi({ toplamSatir: 300, teslimEdilen: 0, apiSatir: 120 });
  check('D18b ★ hiç teslim yok ama 120 satır karşılık aldı → 120 düşer, teslim 0',
    yarimApi.durum === 'BASARISIZ' && yarimApi.dusulenSatir === 120 && yarimApi.toplamTeslim === 0, JSON.stringify(yarimApi));
  const basarisizTasma = sonucHesabi({ toplamSatir: 300, teslimEdilen: 10, apiSatir: 900 });
  check('D18c başarısızda da düşen satır toplamı aşamaz (kırpılır)', basarisizTasma.dusulenSatir === 300, JSON.stringify(basarisizTasma));
  const bos = sonucHesabi({ toplamSatir: 0, teslimEdilen: 0, apiSatir: 0 });
  check('D21 çevrilecek satırı olmayan istek BASARILI, 0 düşer', bos.durum === 'BASARILI' && bos.dusulenSatir === 0);
  const tasma = sonucHesabi({ toplamSatir: 300, teslimEdilen: 999, apiSatir: 300 });
  check('D22 teslim toplamı aşamaz (düşen ≤ satır)', tasma.durum === 'BASARILI' && tasma.dusulenSatir === 300, JSON.stringify(tasma));
  const onbellek = sonucHesabi({ toplamSatir: 300, teslimEdilen: 300, apiSatir: 0 });
  check('D23 ★ hepsi önbellekten geldi: BASARILI ama kotadan 0 düşer (teslim yine 300)',
    onbellek.durum === 'BASARILI' && onbellek.dusulenSatir === 0 && onbellek.toplamTeslim === 300, JSON.stringify(onbellek));
  const karisik = sonucHesabi({ toplamSatir: 300, teslimEdilen: 300, apiSatir: 120 });
  check('D24 ★ 180 satır önbellekten, 120 satır API\'den → yalnız 120 düşer', karisik.durum === 'BASARILI' && karisik.dusulenSatir === 120, JSON.stringify(karisik));
  const apiTasma = sonucHesabi({ toplamSatir: 300, teslimEdilen: 300, apiSatir: 400 });
  check('D25 API satırı toplamı aşamaz (kırpılır)', apiTasma.dusulenSatir === 300, JSON.stringify(apiTasma));
  const eksiApi = sonucHesabi({ toplamSatir: 300, teslimEdilen: 300, apiSatir: -5 });
  check('D26 negatif API satırı 0 sayılır', eksiApi.dusulenSatir === 0, JSON.stringify(eksiApi));
}
{
  // K32-K35: kota birimi SATIR, önbelleğin birimi METİN — köprü `anahtarSatirlari`.
  const r = ceviriIcerigi([sayfa(['PVC BORU', 'PVC BORU', 'ÇELİK BORU', 'DN 20'])]);
  check('K32 FIXTURE KANITI: 3 satır / 2 metin (PVC 2 satır)', r.satirSayisi === 3 && r.metinler.length === 2 && r.satirlar.get('PVC BORU') === 2, `${r.satirSayisi}/${r.metinler.length}`);
  check('K33 ★ tek metin 2 satır tutuyorsa 2 satır sayılır', anahtarSatirlari(r, ['PVC BORU']) === 2, String(anahtarSatirlari(r, ['PVC BORU'])));
  check('K34 ★ hiç yeni metin yoksa 0 satır', anahtarSatirlari(r, []) === 0);
  check('K35 yinelenen anahtar bir kez sayılır, tanınmayan anahtar 0 ekler', anahtarSatirlari(r, ['PVC BORU', ' PVC  BORU ', 'YOK']) === 2, String(anahtarSatirlari(r, ['PVC BORU', ' PVC  BORU ', 'YOK'])));
  check('K36 tüm metinler yeni → toplam satır', anahtarSatirlari(r, r.metinler) === r.satirSayisi);
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
  /** `CLAUDE_API_KEY` ayarı — verilmezse API'ye gidilmez (400). */
  apiAnahtari?: string;
  /** Bu kaynak metinlerin `translation.upsert`'ü patlar (R1-A5). */
  patlayanUpsert?: string[];
  /** SystemSettings anahtar → değer (geçiş izni). */
  ayarlar?: Record<string, string>;
  /** Faz 6.9: firma çeviri düzeltmeleri (CeviriDuzeltmesi satırları). */
  duzeltmeler?: Satir[];
  /**
   * İLK `translation.findMany` okumasından SONRA önbelleğe eklenecek karşılıklar
   * (16.09): ayırma ile API çağrısı arasında BAŞKA bir firmanın aynı metni
   * çevirip önbelleğe yazmasını taklit eder. Ayırmanın saydığı satır ile
   * gerçekten API'ye giden satırı ayırmanın tek yolu budur.
   */
  onbellekGecikmeli?: Record<string, string>;
}

/**
 * Sahte Anthropic istemcisi (`anthropicIstemcisi` dikişi). Her çağrı sıradaki
 * yanıt üreticisine gider; istenen metinler kaydedilir.
 */
function sahteIstemci(ureticiler: Array<(metinler: string[]) => { ceviriler?: Array<{ kaynak: string; ceviri: string }>; hata?: { status: number; message: string } }>) {
  const istekler: string[][] = [];
  let sira = 0;
  return {
    istekler,
    messages: {
      create: async (govde: any) => {
        const icerik = String(govde?.messages?.[0]?.content ?? '');
        const metinler = icerik.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
        istekler.push(metinler);
        const r = ureticiler[Math.min(sira++, ureticiler.length - 1)](metinler);
        if (r.hata) throw Object.assign(new Error(r.hata.message), { status: r.hata.status });
        return { content: [{ type: 'text', text: JSON.stringify({ ceviriler: r.ceviriler ?? [] }) }], usage: { input_tokens: 1, output_tokens: 1 } };
      },
    },
  };
}

function sahteDb(s: Sahne): any {
  let sayac = 0;
  const tuketimSuz = (where: Record<string, any>) => s.tuketim.filter((k) => eslesir(k, where));
  const db: any = {
    // Tek e-posta yardımcısı (`eposta-dogrulama.ts`) aynı imzayla okur: yalnız emailVerified.
    user: { findUnique: async ({ select }: any) => (select?.emailVerified ? { emailVerified: s.emailVerified } : { emailVerified: s.emailVerified }) },
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
          // Prisma gibi: `{ alan: yon }` ya da `[{ a: yon }, { b: yon }]` (sıra =
          // öncelik), nesne başına TEK alan. Eşitlikte sonraki anahtara geçilir;
          // hepsi eşitse ekleme sırası kalır (sort kararlı). Postgres eşitlerin
          // sırasını garanti etmez — testler en kötü sırayı kurar. (İlk hali
          // yalnız ilk anahtara bakıyordu: dizi gelse sessizce sıralamazdı.)
          const anahtarlar = (Array.isArray(orderBy) ? orderBy : [orderBy]).map((o: Record<string, unknown>) => {
            const g = Object.entries(o);
            if (g.length !== 1 || (g[0][1] !== 'asc' && g[0][1] !== 'desc')) throw new Error(`sahte Prisma: tanınmayan orderBy ${JSON.stringify(o)}`);
            return g[0] as [string, 'asc' | 'desc'];
          });
          const sayi = (alan: string, v: unknown): number => {
            if (v instanceof Date) return v.getTime();
            if (typeof v === 'number') return v;
            throw new Error(`sahte Prisma: "${alan}" sıralanamaz (${typeof v})`);
          };
          // Postgres varsayılanı: NULL en büyüktür (DESC'te başa gelir).
          const kiyas = (alan: string, x: unknown, y: unknown): number =>
            x == null || y == null ? (x == null ? 1 : 0) - (y == null ? 1 : 0) : sayi(alan, x) - sayi(alan, y);
          l.sort((a, b) => {
            for (const [alan, yon] of anahtarlar) {
              const fark = kiyas(alan, a[alan], b[alan]);
              if (fark !== 0) return yon === 'desc' ? -fark : fark;
            }
            return 0;
          });
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
      // Önbellek yalnız 'en': başka hedef dil sorgusu boş döner (6.9 risk 8 — süzgeç sahtede de uygulanır).
      findMany: async ({ where }: any) => {
        const yanit =
          where.targetLang !== 'en'
            ? []
            : (where.sourceText.in as string[])
                .filter((m) => s.onbellek[m] !== undefined)
                .map((m) => ({ sourceText: m, translatedText: s.onbellek[m] }));
        // Okuma BİTTİKTEN sonra gecikmeli karşılıklar önbelleğe girer: bir
        // sonraki okuma (çeviri) onları görür, bu okuma (ayırma) görmez.
        if (s.onbellekGecikmeli) {
          Object.assign(s.onbellek, s.onbellekGecikmeli);
          s.onbellekGecikmeli = undefined;
        }
        return yanit;
      },
      // Gerçek davranış: yoksa yaz, varsa DOKUNMA (`update: {}`). İstenirse patlar.
      upsert: async ({ where, create }: any) => {
        const kaynak = where.sourceText_targetLang.sourceText as string;
        s.olaylar.push(`upsert:${kaynak}`);
        if ((s.patlayanUpsert ?? []).includes(kaynak)) throw new Error('sahte DB: yazilamadi');
        if (s.onbellek[kaynak] === undefined) s.onbellek[kaynak] = create.translatedText;
        return {};
      },
    },
    // Faz 6.9: firma katmanı — where GERÇEKTEN uygulanır (firmaId süzgeci silinirse başka firmanın satırı gelir).
    ceviriDuzeltmesi: {
      findMany: async ({ where, select }: any) =>
        (s.duzeltmeler ?? [])
          .filter((k) => eslesir(k, where))
          .map((k) => (select ? Object.fromEntries(Object.keys(select).filter((a) => select[a]).map((a) => [a, k[a]])) : { ...k })),
    },
    systemSettings: {
      findMany: async ({ where }: any) =>
        where?.key === 'CLAUDE_API_KEY' && s.apiAnahtari ? [{ key: 'CLAUDE_API_KEY', value: s.apiAnahtari }] : [],
      findUnique: async ({ where }: any) =>
        s.ayarlar && Object.prototype.hasOwnProperty.call(s.ayarlar, where.key) ? { key: where.key, value: s.ayarlar[where.key] } : null,
    },
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
  const istemciBagla = (istemci: unknown) => {
    (servis as any).anthropicIstemcisi = () => istemci;
  };
  return { s, kota, servis, aiKayitlari, cevirSayisi: () => cevirCagrisi, istemciBagla };
}

// 23.09: teklif kapsami ACIK — bu paket izin DEGIL kota olcer.
const K1 = { userId: 'u1', firmaId: 'f1', teklifKapsami: 'firma' as const };
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
    // Pro mekanik tavanı 4.500; tamamı bu dönem harcanmış. Önbellek BOŞ olmalı:
    // 16.09'dan beri önbellekteki satır kotadan düşmez, dolayısıyla önbellekli
    // bir teklif kota dolu olsa bile reddedilmez (W6b bunu ölçer).
    const t = kur({ tuketim: [tuketimKaydi({ satirSayisi: 4500 })], onbellek: {} });
    const e = await hata(() => t.servis.teklifiCevir(K1, Q));
    check('W1 kota dolu → 403 CEVIRI_KOTASI', e?.getStatus?.() === 403 && yanit(e).kod === 'CEVIRI_KOTASI', JSON.stringify(yanit(e)));
    check('W2 hangi tavanın dolduğu söylenir (SATIR_TAVANI)', yanit(e).sebep === 'SATIR_TAVANI', String(yanit(e).sebep));
    check('W3 ★ reddedilen istekte çeviri HİÇ çağrılmaz (kota AI\'dan önce)', t.cevirSayisi() === 0, `${t.cevirSayisi()} çağrı`);
    check('W4 ★ reddedilen istekte AI kullanım kaydı YAZILMAZ', t.aiKayitlari.length === 0, `${t.aiKayitlari.length}`);
    check('W5 kota reddi tüketim kaydı bırakmaz', t.s.tuketim.length === 1, `${t.s.tuketim.length}`);
  }

  {
    // PARA HARCANANA HAK DÜŞER (Emre 16.09). Bu sahnede iki metnin ikisi de
    // ortak önbellekte: API'ye HİÇ metin gitmez → kotadan hiçbir şey düşmez.
    const t = kur();
    const r = await t.servis.teklifiCevir(K1, Q);
    const yeni = t.s.tuketim[0];
    check('W6 ★ önbellekten dönen çeviri de TEK kalıcı kayıt bırakır', t.s.tuketim.length === 1 && yeni?.durum === 'BASARILI', `${t.s.tuketim.length} kayıt · ${yeni?.durum}`);
    check('W7 ★ tamamı önbellekten: kayıt 3 satır / 2 metin ama DÜŞEN 0, önbellekten 3',
      yeni?.satirSayisi === 3 && yeni?.metinSayisi === 2 && yeni?.dusulenSatir === 0 && yeni?.onbellektenSatir === 3,
      `${yeni?.satirSayisi}/${yeni?.metinSayisi}/${yeni?.dusulenSatir}/${yeni?.onbellektenSatir}`);
    check('W8 önbellek isabetinde AI\'ya gidilmez', t.aiKayitlari.length === 0);
    check('W9 ★ sonuç kotadan DÜŞMEDİĞİNİ söyler; kalan satır ve dosya aynı', r.kotadanDustu === false && r.dusulenSatir === 0 && r.onbellektenSatir === 3 && r.kota.kalanSatir === 4500 && r.kota.kalanDosya === 60, JSON.stringify(r.kota));
    check('W10 harita istemciye döner', r.harita['PVC BORU'] === 'PVC PIPE');
    const kilit = t.s.olaylar.indexOf('kilit:ceviri-kota:f1');
    check('W11 firma kilidi kayıttan ÖNCE alınır', kilit >= 0 && kilit < t.s.olaylar.indexOf('create'), t.s.olaylar.join(' → '));
    check('W11b işlem süresi sınırları açık (bekleme 5 sn / işlem 10 sn)', t.s.olaylar.includes('tx:5000/10000'), t.s.olaylar.join(' → '));

    const r2 = await t.servis.teklifiCevir(K1, Q);
    const durum = await t.kota.durum(K1);
    check('W12 ★ aynı içerik yeniden çevrilse de kotadan/dosyadan hiçbir şey düşmez', durum?.kullanilanSatir === 0 && durum?.kullanilanDosya === 0, JSON.stringify(durum));
    check('W13 API\'siz istek işaretlenir, kotadan düşmez', r2.tekrar === true && r2.kotadanDustu === false);
    check('W14 ★ her istek denetim kaydı bırakır (ikisi de 0 düşen)', t.s.tuketim.length === 2 && t.s.tuketim.every((k) => k.dusulenSatir === 0), JSON.stringify(t.s.tuketim.map((k) => k.dusulenSatir)));
    check('W15 tekrar isteği yine haritayı döndürür', r2.harita['ÇELİK BORU'] === 'STEEL PIPE');
  }

  {
    // ★ ASIL ÖLÇÜM: karışık teklif — bir metin önbellekte, biri değil. Kotadan
    // YALNIZ API'ye giden metnin tuttuğu satır düşer.
    const sayfalar = [sayfa(['PVC BORU', 'PVC BORU', 'BAKIR BORU', 'DN 20'])]; // 3 satır: PVC 2 + BAKIR 1
    const icerik = ceviriIcerigi(sayfalar);
    const t = kur({ onbellek: { 'PVC BORU': 'PVC PIPE' }, apiAnahtari: 'test-anahtari', teklifler: { [Q]: { firmaId: 'f1', sheets: sayfalar } } });
    const istemci = sahteIstemci([(m) => ({ ceviriler: m.map((x) => ({ kaynak: x, ceviri: `EN ${x}` })) })]);
    t.istemciBagla(istemci);
    check('W16a FIXTURE KANITI: 3 satır, PVC 2 satır önbellekte, BAKIR 1 satır yeni',
      icerik.satirSayisi === 3 && icerik.satirlar.get('PVC BORU') === 2 && icerik.satirlar.get('BAKIR BORU') === 1, JSON.stringify([...icerik.satirlar]));
    const o = await t.kota.onizleme(K1, Q);
    check('W16b ★ önizleme: yeni 1 satır, önbellekten 2, toplam 3', o.gerekenSatir === 1 && o.onbellektenSatir === 2 && o.toplamSatir === 3 && o.tekrar === false, JSON.stringify({ g: o.gerekenSatir, o: o.onbellektenSatir, t: o.toplamSatir }));
    const r = await t.servis.teklifiCevir(K1, Q);
    const kayit = t.s.tuketim[0];
    check('W16c ★ API\'ye YALNIZ önbellekte olmayan metin gider', JSON.stringify(istemci.istekler) === JSON.stringify([['BAKIR BORU']]), JSON.stringify(istemci.istekler));
    check('W16d ★ kotadan yalnız API satırı düşer (1), önbellek satırı (2) düşmez',
      r.dusulenSatir === 1 && r.onbellektenSatir === 2 && r.kotadanDustu === true && kayit?.dusulenSatir === 1 && kayit?.onbellektenSatir === 2,
      JSON.stringify({ dusen: r.dusulenSatir, onb: r.onbellektenSatir, kayit: kayit && { d: kayit.dusulenSatir, o: kayit.onbellektenSatir } }));
    check('W16e satır düştüğü için dosya hakkı da yenir (kalan 59)', r.kota.kalanSatir === 4499 && r.kota.kalanDosya === 59, JSON.stringify(r.kota));

    // İkinci istek: artık BAKIR da önbellekte → API'ye hiç gitmez, hiç düşmez.
    const r2 = await t.servis.teklifiCevir(K1, Q);
    const d2 = await t.kota.durum(K1);
    check('W16f ★ ikinci istek: API çağrısı yok, kotadan düşmez, kullanım 1 satır / 1 dosyada kalır',
      istemci.istekler.length === 1 && r2.dusulenSatir === 0 && d2?.kullanilanSatir === 1 && d2?.kullanilanDosya === 1,
      JSON.stringify({ istek: istemci.istekler.length, d2 }));
  }

  {
    // ★ AYIRMA ≠ SONUÇ (Emre 16.09: "sonuçlandırmada gerçekten API'den dönen
    // satır esas alınsın"). Ayırma anında 3 satır yeni; çağrıdan önce başka bir
    // firma 'PVC BORU'yu çevirip ortak önbelleğe yazıyor. Kullanıcı onu ÖDEMEZ:
    // API'ye yalnız 'BAKIR BORU' gider, kotadan yalnız 1 satır düşer.
    const sayfalar = [sayfa(['PVC BORU', 'PVC BORU', 'BAKIR BORU'])]; // PVC 2 + BAKIR 1
    const t = kur({
      onbellek: {},
      onbellekGecikmeli: { 'PVC BORU': 'PVC PIPE' },
      apiAnahtari: 'test-anahtari',
      teklifler: { [Q]: { firmaId: 'f1', sheets: sayfalar } },
    });
    const istemci = sahteIstemci([(m) => ({ ceviriler: m.map((x) => ({ kaynak: x, ceviri: `EN ${x}` })) })]);
    t.istemciBagla(istemci);
    const r = await t.servis.teklifiCevir(K1, Q);
    const kayit = t.s.tuketim[0];
    check('W16g ★ ayırma 3 satır saydı ama API çağrısına 1 satır gitti: kotadan AYIRMA değil GERÇEKLEŞEN düşer',
      JSON.stringify(istemci.istekler) === JSON.stringify([['BAKIR BORU']]) &&
      kayit?.satirSayisi === 3 && r.dusulenSatir === 1 && r.onbellektenSatir === 2 && kayit?.dusulenSatir === 1,
      JSON.stringify({ istekler: istemci.istekler, dusen: r.dusulenSatir, kayit: kayit && kayit.dusulenSatir }));
  }

  {
    // ★ Kota dolu ama teklifin tamamı önbellekte: API'ye para gitmeyeceği için
    // reddedilmez. (Eski kural bunu "tavan doldu" diye keserdi.)
    const t = kur({ tuketim: [tuketimKaydi({ satirSayisi: 4500 })] });
    const o = await t.kota.onizleme(K1, Q);
    const r = await t.servis.teklifiCevir(K1, Q);
    check('W6b ★ kota TAMAMEN dolu ama yeni satır yok → çeviri geçer, 0 düşer',
      o.izin === true && o.gerekenSatir === 0 && o.kota.kalanSatir === 0 && r.dusulenSatir === 0 && r.harita['PVC BORU'] === 'PVC PIPE',
      JSON.stringify({ izin: o.izin, gereken: o.gerekenSatir, dusen: r.dusulenSatir }));
  }

  {
    // Faz 6.11 (15.09) — TERSİNE: 14.09'da 10 dakikalık pencere dışındaki aynı
    // içerik yeniden düşüyordu. 16.09'dan beri gerekçe daha sade: içerik zaten
    // önbellektedir, API'ye gitmez, düşmez (K-T8, K-T9).
    const t = kur({
      tuketim: [tuketimKaydi({
        icerikOzeti: OZET, satirSayisi: 3,
        olusturuldu: new Date(Date.now() - 26 * 60 * DK),
        sonuclandi: new Date(Date.now() - 25 * 60 * DK),
      })],
    });
    const r = await t.servis.teklifiCevir(K1, Q);
    check('W17 ★ pencere YOK: 25 saat önce çevrilmiş aynı içerik yeniden kotadan DÜŞMEZ', r.tekrar === true && r.dusulenSatir === 0, `tekrar=${r.tekrar} · ${r.dusulenSatir}`);
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

  try {
    await aBlogu();
  } catch (e) {
    // A-bloğunun istisnası W bloğunun geri kalanını koşturmadan bırakmasın.
    check('A-BLOK beklenmedik hata', false, String((e as Error)?.stack ?? e).slice(0, 400));
  }

  {
    // 14.09 tur 3 · A1: W21f kapı komutuyla 20 koşumda 3 düşüyordu. Zaman ölçümü
    // (40 koşum): düşen 3 koşumun üçünde de iki halkanın `sonuclandi`'si aynı
    // ms'deydi; `sonuclandi desc` eşitlenince yarım (KISMI) halka seçiliyor,
    // tamamlanmış çeviri devam sanılıp kalan satırı bir kez daha düşüyordu.
    // Aynı ölçümde 3 koşumda iki halka aynı ms'de OLUŞTURULMUŞTU — dört damga
    // da aynı ms'ye düşerse `olusturuldu` da eşitlenir. Eşitlik burada
    // zamanlamaya bırakılmaz, kurulur; ekleme sırası en kötü sıradır.
    const an = new Date(Date.now() - 5 * DK);
    const zincir = { icerikOzeti: OZET, satirSayisi: 3, olusturuldu: an, sonuclandi: an };
    const t = kur({
      tuketim: [
        tuketimKaydi({ ...zincir, id: 'halka-1', durum: 'KISMI', dusulenSatir: 2, toplamTeslim: 2 }),
        tuketimKaydi({ ...zincir, id: 'halka-2', durum: 'BASARILI', dusulenSatir: 1, toplamTeslim: 3, devam: true }),
      ],
    });
    // 16.09: kota kararı artık zincire BAKMAZ (önbellek bakışı karar verir), ama
    // ÖDENMİŞ İÇERİK KANITI hâlâ bu sıralamayı kullanır — İngilizce dosya kapısı
    // ona sorar. Bu yüzden sıralama kanıt ucunda ölçülür.
    const icerik = ceviriIcerigi(TEKLIF_SAYFALARI);
    const kanit = await t.kota.odenmisIcerikKaniti(K1, Q, 'en', icerik);
    check('W21j ★ zincirin dört damgası aynı ms\'de: kanıt son halkayı (BASARILI) seçer, KISMI kanıt değildir',
      kanit.odenmis === true && kanit.kayitId === 'halka-2', JSON.stringify(kanit));

    // Zaman aşımına düşmüş iş geç biterse `sonuclandir` onu da kapatır; iki
    // BASARILI kayıt olur. Aynı ms'de sonuçlanmışlarsa teslimleri de eşittir —
    // karar `olusturuldu`: kanıt en son OLUŞTURULAN kaydı gösterir.
    const t2 = kur({
      tuketim: [
        tuketimKaydi({ icerikOzeti: OZET, satirSayisi: 3, id: 'gec-biten', durum: 'BASARILI', olusturuldu: new Date(an.getTime() - 95 * DK), sonuclandi: an }),
        tuketimKaydi({ icerikOzeti: OZET, satirSayisi: 3, id: 'yeniden-deneme', durum: 'BASARILI', olusturuldu: new Date(an.getTime() - DK), sonuclandi: an }),
      ],
    });
    const k2 = await t2.kota.odenmisIcerikKaniti(K1, Q, 'en', icerik);
    check('W21k aynı ms\'de sonuçlanmış iki tamamlanmış kayıt: kanıt en son oluşturulanı gösterir', k2.odenmis === true && k2.kayitId === 'yeniden-deneme', JSON.stringify(k2));

    const r = await t2.kota.rezerveEt(K1, Q, 'en');
    check('W21l ★ ayırma kanıta DEĞİL önbelleğe bakar: yeni satır 0, yeni kayıt yazılır', r.gerekenSatir === 0 && r.tekrar === true && t2.s.tuketim.length === 3, `${r.gerekenSatir} · ${t2.s.tuketim.length}`);
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
    await t.kota.sonuclandir(bayat.id, { toplamSatir: 4500, teslimEdilen: 4500, apiSatir: 4500, onbellektenSatir: 0, onbellekten: 0, cevrilen: 10, basarisizParca: 0 });
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
    await t.kota.sonuclandir(yarim.id, { toplamSatir: 3, teslimEdilen: 3, apiSatir: 3, onbellektenSatir: 0, onbellekten: 0, cevrilen: 0, basarisizParca: 0 });
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
    // Önbellek BOŞ: 16.09'dan beri yalnız API'ye giden satır düşer, dolayısıyla
    // "kalan" farkı ancak gerçekten çevrilen bir dosyada görünür.
    const yeniKurulum = () => {
      const k = kur({ onbellek: {}, apiAnahtari: 'test-anahtari' });
      k.istemciBagla(sahteIstemci([(m) => ({ ceviriler: m.map((x) => ({ kaynak: x, ceviri: `EN ${x}` })) })]));
      return k;
    };
    const mek = await yeniKurulum().servis.teklifiCevir(K1, Q);
    const t = yeniKurulum();
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
        // Yanıtsız kalan çağrı: BASARISIZ ve düşen 0 → hiçbir sayıma girmez.
        tuketimKaydi({ satirSayisi: 700, durum: 'BASARISIZ', dusulenSatir: 0, toplamTeslim: 0 }),
        // Karşılık alınmış ama tamamlanamamış çeviri: para harcandı → SATIR
        // sayımına girer, DOSYA sayımına GİRMEZ (kullanıcıya dosya çıkmadı).
        tuketimKaydi({ satirSayisi: 400, durum: 'BASARISIZ', dusulenSatir: 400, toplamTeslim: 0 }),
        tuketimKaydi({ satirSayisi: 900, olusturuldu: new Date(Date.now() - 4 * GUN) }), // önceki dönem
        tuketimKaydi({ satirSayisi: 200 }),
        tuketimKaydi({ durum: 'KISMI', satirSayisi: 300, dusulenSatir: 50, toplamTeslim: 50 }),
        tuketimKaydi({ durum: 'BASARILI', satirSayisi: 300, dusulenSatir: 30, toplamTeslim: 80, devam: true }),
      ],
    });
    const o = await t.kota.durum(K1);
    check('W31 sayım: BAŞARILI + KISMI + harcanmış BAŞARISIZ kayıtların DÜŞÜLEN satırı (200+50+30+400)', o?.kullanilanSatir === 680, `${o?.kullanilanSatir}`);
    check('W32 sayım: 0 satırlık istek ve DEVAM kaydı dosya sayılmaz (2 dosya)', o?.kullanilanDosya === 2, `${o?.kullanilanDosya}`);
    // ⚠ BAĞLANTI TESTİ (mekanizma var bağlantı yok): `sonucHesabi` başarısız
    // kayda satır yazsa bile dönem sayımı onu OKUMAZSA kural hiç işlemez.
    // Aşağıdaki iki assert kuralın iki yüzünü AYRI ölçer.
    check('W32b ★ harcanmış BAŞARISIZ kayıt SATIR sayımına girer (400 dönemde görünür)',
      (o?.kullanilanSatir ?? 0) - 280 === 400, `${o?.kullanilanSatir}`);
    check('W32c ★ harcanmış BAŞARISIZ kayıt DOSYA sayımına GİRMEZ (teslim edilmedi)',
      o?.kullanilanDosya === 2 && (o?.kalanDosya ?? 0) === 58, `dosya=${o?.kullanilanDosya} kalan=${o?.kalanDosya}`);
  }

  {
    const t = kur({ onbellek: {} });
    const o = await t.kota.onizleme(K1, Q);
    check('W33 önizleme sunucunun saydığı YENİ satırı söyler (devam alanı YOK)', o.gerekenSatir === 3 && o.toplamSatir === 3 && o.onbellektenSatir === 0 && o.metinSayisi === 2 && o.izin === true && o.tekrar === false && !('devam' in o), JSON.stringify({ g: o.gerekenSatir, t: o.toplamSatir, o: o.onbellektenSatir }));
    check('W34 önizleme kayıt yazmaz', t.s.tuketim.length === 0);
    const dolu = kur({ tuketim: [tuketimKaydi({ satirSayisi: 4499 })], onbellek: {} });
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
    // 23.09: oturum FIRMA SAHIBI → kapsam 'firma' (K1 ile birebir; `kimlikCoz`a donus kirmizi).
    await ctrl.translate({ id: 'u1', firmaId: 'f1', firmaRol: 'sahip' }, govde);
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
    // REVİZE K-T7 (15.09): fiyat sayfası sunucuyla aynı kuralı söylemeli —
    // "hepsi ya da hiçbiri" var; 10 dakikalık pencere ve kısmi çeviri cümleleri
    // YOK (sunucuda ikisi de kalktı; kalırsa sayfa sessizce yalan söyler).
    const yol = path.join(__dirname, '../../frontend/app/fiyatlar/page.tsx');
    const metin = fs.existsSync(yol) ? fs.readFileSync(yol, 'utf8') : '';
    check('W45 ★ fiyat sayfası "hepsi ya da hiçbiri" diyor, "dakika" ve "Kısmen tamamlanan" YOK', metin.includes('Çeviri ya tamamlanır ya hiç yapılmaz') && !/dakika|Kısmen tamamlanan/.test(metin), `sayfa ${metin.length} karakter`);
  }
}

/**
 * A) HEPSİ YA DA HİÇBİRİ (REVİZE K-T7, Emre 15.09) — gerçek `cevir`, sahte
 * Anthropic istemcisi. Tek metin bile çevrilemezse tüketim BASARISIZ, kotadan
 * hiçbir şey düşmez, istemciye harita DÖNMEZ (422); çevrilen metinler önbellekte
 * kalır ve ikinci deneme yalnız eksiği sorar.
 */
async function aBlogu(): Promise<void> {
  console.log('\nA) Hepsi ya da hiçbiri — eksik çeviri düşmez, harita dönmez');
  const API = 'test-anahtari';

  {
    const icerik = ceviriIcerigi(TEKLIF_SAYFALARI);
    const t = kur({ onbellek: {}, apiAnahtari: API });
    const istemci = sahteIstemci([
      () => ({ ceviriler: [{ kaynak: 'PVC BORU', ceviri: 'PVC PIPE' }] }),
      (m) => ({ ceviriler: m.includes('ÇELİK BORU') ? [{ kaynak: 'ÇELİK BORU', ceviri: 'STEEL PIPE' }] : [] }),
    ]);
    t.istemciBagla(istemci);
    check('A0 FIXTURE KANITI: teklif 3 satır / 2 metin, önbellek boş', icerik.satirSayisi === 3 && icerik.metinler.length === 2 && Object.keys(t.s.onbellek).length === 0, `${icerik.satirSayisi}/${icerik.metinler.length}`);

    const once = await t.kota.durum(K1);
    const e = await hata(() => t.servis.teklifiCevir(K1, Q));
    const sonra = await t.kota.durum(K1);
    const y = yanit(e);
    // ⚠ 16.09 ek kararı: parça YANIT DÖNDÜ (içinde 'ÇELİK BORU' çevirisi
    // gelmedi ama çağrının parası harcandı) → 3 satırın tamamı düşer. Kayıt
    // BASARISIZ, teslim 0: "teslim edilmedi ama düşüldü" ayrık durur. DOSYA
    // hakkı YENMEZ — kullanıcıya dosya çıkmadı.
    check('A1 ★ eksik çeviri: kayıt BASARISIZ + teslim 0, ama karşılık alınan 3 satır DÜŞER; DOSYA hakkı değişmez',
      t.s.tuketim.length === 1 && t.s.tuketim[0].durum === 'BASARISIZ' && t.s.tuketim[0].dusulenSatir === 3 &&
      t.s.tuketim[0].toplamTeslim === 0 &&
      sonra?.kullanilanSatir === (once?.kullanilanSatir ?? 0) + 3 && sonra?.kullanilanDosya === once?.kullanilanDosya,
      JSON.stringify({ durum: t.s.tuketim[0]?.durum, dusulen: t.s.tuketim[0]?.dusulenSatir, once, sonra }));
    check('A2 ★ 422 gövdesi: kod, mesaj, çevrilemeyen liste/sayı, message dolu, harita YOK',
      y.kod === 'CEVIRI_TAMAMLANAMADI' && y.mesaj === 'Çeviri tamamlanamadı, tekrar deneyin' &&
      JSON.stringify(y.cevrilemeyenSatirlar) === JSON.stringify(['ÇELİK BORU']) && y.cevrilemeyenSayisi === 1 &&
      typeof y.message === 'string' && y.message.length > 0 && !('harita' in y),
      JSON.stringify(y));
    check('A2b ★ açıklama DÜŞEN satırı ve karşılıksızın düşmediğini SÖYLER (sessiz dal yok), gövdede dusulenSatir var',
      /karşılık alınan 3 satır kotanızdan düştü/.test(String(y.aciklama)) &&
      /karşılık alınamayan satırlar düşmedi/.test(String(y.aciklama)) &&
      /teklif Türkçe kaldı/.test(String(y.aciklama)) && y.dusulenSatir === 3,
      String(y.aciklama));
    check('A12 durum kodu 422 (401 DEĞİL — oturum düşürülmez)', e?.getStatus?.() === 422, String(e?.getStatus?.()));
    check('A3 çevrilen metin önbelleğe yazıldı', t.s.onbellek['PVC BORU'] === 'PVC PIPE' && t.s.onbellek['ÇELİK BORU'] === undefined, JSON.stringify(t.s.onbellek));

    const r2: any = await t.servis.teklifiCevir(K1, Q).catch((e) => ({ hata: String(e), harita: {} }));
    const d2 = await t.kota.durum(K1);
    const basarili = t.s.tuketim.filter((k) => k.durum === 'BASARILI');
    // Dönem kullanımı 4 = ilk denemede harcanan 3 + ikinci denemede yeni 1.
    // Dosya 1: yalnız TESLİM EDİLEN çeviri dosya sayar (başarısız kayıt sayılmaz).
    check('A4 ★ ikinci deneme: API\'ye YALNIZ eksik gider; düşen YALNIZ o metnin satırı (1), dönem 3+1, dosya 1',
      JSON.stringify(istemci.istekler[1]) === JSON.stringify(['ÇELİK BORU']) && basarili.length === 1 && basarili[0].dusulenSatir === 1 &&
      basarili[0].onbellektenSatir === 2 && d2?.kullanilanSatir === 4 && d2?.kullanilanDosya === 1 &&
      r2.harita['PVC BORU'] === 'PVC PIPE' && r2.harita['ÇELİK BORU'] === 'STEEL PIPE',
      JSON.stringify({ istekler: istemci.istekler, basarili: basarili.length, d2 }));
    check('A4b ★ ilk denemede API\'ye gidip önbelleğe düşen satır ikinci denemede ÜCRETLENMEZ (tekrar ücretsiz)',
      basarili[0].satirSayisi === 3 && basarili[0].dusulenSatir + basarili[0].onbellektenSatir === 3,
      JSON.stringify({ s: basarili[0].satirSayisi, d: basarili[0].dusulenSatir, o: basarili[0].onbellektenSatir }));

    await hata(() => t.servis.teklifiCevir(K1, Q));
    const d3 = await t.kota.durum(K1);
    check('W21f tamamlandıktan sonra aynı istek API\'ye gitmez ve kotayı artırmaz',
      istemci.istekler.length === 2 && d3?.kullanilanSatir === 4 && d3?.kullanilanDosya === 1, `${istemci.istekler.length} · ${JSON.stringify(d3)}`);
  }

  {
    const sayfalar = [sayfa(['GEBERIT', 'PVC BORU'])];
    const t = kur({ onbellek: { 'PVC BORU': 'PVC PIPE' }, apiAnahtari: API, teklifler: { [Q]: { firmaId: 'f1', sheets: sayfalar } } });
    t.istemciBagla(sahteIstemci([() => ({ ceviriler: [{ kaynak: 'GEBERIT', ceviri: 'GEBERIT' }] })]));
    const r: any = await t.servis.teklifiCevir(K1, Q).catch((e) => ({ hata: String(e), harita: {} }));
    check('A5 ★ kaynakla aynı dönen çeviri (GEBERIT) eksik sayılmaz → BASARILI, yalnız o satır düşer', t.s.tuketim[0]?.durum === 'BASARILI' && r.harita.GEBERIT === 'GEBERIT' && r.dusulenSatir === 1 && r.onbellektenSatir === 1, `${t.s.tuketim[0]?.durum} · ${r.dusulenSatir}`);
  }

  {
    const t = kur({ onbellek: {}, apiAnahtari: API });
    t.istemciBagla(sahteIstemci([() => ({ hata: { status: 401, message: 'invalid x-api-key' } })]));
    const once6 = await t.kota.durum(K1);
    const e = await hata(() => t.servis.teklifiCevir(K1, Q));
    const y = yanit(e);
    const sonra6 = await t.kota.durum(K1);
    check('A6 tüm parçalar 401 → 422, açıklamada API anahtarı sebebi, kayıt BASARISIZ', e?.getStatus?.() === 422 && /GECERSIZ/.test(String(y.aciklama)) && t.s.tuketim[0]?.durum === 'BASARISIZ', `${e?.getStatus?.()} · ${y.aciklama}`);
    // ⚠ KARŞILIK ALINAMAYAN SATIR DÜŞMEZ (Emre 16.09 ek kararı): parça hiç
    // yanıt dönmediği için para harcanmadı. A1'in ikizi — tek fark yanıtın
    // gelip gelmemesi; ikisi birlikte kuralın iki yüzünü mühürler.
    check('A6b ★ yanıtsız çağrı (401): 0 düşer, dönem kullanımı DEĞİŞMEZ, açıklama "hiçbir şey düşmedi" der',
      t.s.tuketim[0]?.dusulenSatir === 0 && y.dusulenSatir === 0 &&
      sonra6?.kullanilanSatir === once6?.kullanilanSatir && sonra6?.kullanilanDosya === once6?.kullanilanDosya &&
      /kotadan hiçbir şey düşmedi/.test(String(y.aciklama)),
      JSON.stringify({ dusulen: t.s.tuketim[0]?.dusulenSatir, once6, sonra6, aciklama: y.aciklama }));
  }

  {
    const kaynak = (yol: string) => fs.readFileSync(path.join(__dirname, yol), 'utf8');
    const servisi = kaynak('../src/ozellik/odeme/abonelik/ceviri-kota.servisi.ts');
    const servis = kaynak('../src/ozellik/giris/ai/ceviri.service.ts');
    const kotasi = kaynak('../src/ozellik/odeme/abonelik/ceviri-kotasi.ts');
    const sayimGovdesi = servisi.match(/private sayimKosulu\([\s\S]*?\n {2}\}/)?.[0] ?? '';
    const say = (m: string) => m.split("'KISMI'").length - 1;
    check('A7 ★ KISMI hiçbir yoldan üretilmez: dizge yalnız sayimKosulu içinde, sonuç tipi iki durumlu',
      sayimGovdesi.length > 0 && say(servisi) === 1 && say(sayimGovdesi) === 1 && say(servis) === 0 &&
      /export type CeviriSonucDurumu = 'BASARILI' \| 'BASARISIZ';/.test(kotasi),
      `servisi=${say(servisi)} sayim=${say(sayimGovdesi)} servis=${say(servis)}`);
  }

  {
    // Eski (15.09 öncesi) KISMI kayıt: aynı v2 özet, 2 dk önce, 2 satır teslim etmiş.
    const kismi = tuketimKaydi({ icerikOzeti: OZET, durum: 'KISMI', satirSayisi: 3, dusulenSatir: 2, toplamTeslim: 2, olusturuldu: new Date(Date.now() - 3 * DK), sonuclandi: new Date(Date.now() - 2 * DK) });
    // Önbellek BOŞ: eski KISMI kayıt "satırlar hazır" demek değildir; 16.09
    // kuralında hazır olup olmadığını yalnız önbellek söyler.
    const t = kur({ tuketim: [kismi], onbellek: {}, apiAnahtari: API });
    t.istemciBagla(sahteIstemci([(m) => ({ ceviriler: m.map((x) => ({ kaynak: x, ceviri: `EN ${x}` })) })]));
    const o = await t.kota.onizleme(K1, Q);
    const r: any = await t.servis.teklifiCevir(K1, Q).catch((e) => ({ hata: String(e) }));
    const yeni = t.s.tuketim[1];
    check('A8 ★ eski KISMI devam da kanıt da değil: önizleme 3 satır (devam alanı yok), POST tam 3 düşer',
      o.gerekenSatir === 3 && o.tekrar === false && !('devam' in o) &&
      r.tekrar === false && yeni?.durum === 'BASARILI' && yeni?.dusulenSatir === 3 && yeni?.devam === false,
      JSON.stringify({ gereken: o.gerekenSatir, tekrar: o.tekrar, yeni: yeni && { d: yeni.durum, s: yeni.dusulenSatir, devam: yeni.devam } }));
  }

  {
    const t = kur({ tuketim: [tuketimKaydi({ satirSayisi: 4499 })], onbellek: {} });
    const e = await hata(() => t.servis.teklifiCevir(K1, Q));
    const y = yanit(e);
    check('A9 kalan 1 satır: baştan 403 CEVIRI_KOTASI (hangi tavan), kayıt yok, çeviri çağrılmadı',
      e?.getStatus?.() === 403 && y.kod === 'CEVIRI_KOTASI' && y.sebep === 'SATIR_TAVANI' && /kısmen çevrilmez/.test(String(y.mesaj)) &&
      t.s.tuketim.length === 1 && t.cevirSayisi() === 0,
      JSON.stringify({ durum: e?.getStatus?.(), y }));
  }

  {
    const sayfalar = [sayfa(['KELEBEK VANA', 'ÇEK VANA', 'PİSLİK TUTUCU'])];
    const t = kur({ onbellek: {}, apiAnahtari: API, patlayanUpsert: ['KELEBEK VANA'], teklifler: { [Q]: { firmaId: 'f1', sheets: sayfalar } } });
    t.istemciBagla(sahteIstemci([(m) => ({ ceviriler: m.map((x) => ({ kaynak: x, ceviri: `EN ${x}` })) })]));
    const gunluk: string[] = [];
    (t.servis as any).logger = { error: (m: string) => gunluk.push(m), warn: () => undefined, log: () => undefined };
    const r = await hata(async () => t.servis.teklifiCevir(K1, Q)) === null ? 'ok' : 'hata';
    check('A10 ★ tek anahtarın önbellek yazımı patlar: çeviri yine BASARILI, aynı parçadaki SONRAKİ anahtarlar önbellekte, günlükte yalnız sayı',
      r === 'ok' && t.s.tuketim[0]?.durum === 'BASARILI' && t.s.onbellek['ÇEK VANA'] === 'EN ÇEK VANA' && t.s.onbellek['PİSLİK TUTUCU'] === 'EN PİSLİK TUTUCU' &&
      t.s.onbellek['KELEBEK VANA'] === undefined && gunluk.some((g) => /onbellege yazilamadi: 1 metin/.test(g)) && !gunluk.some((g) => g.includes('KELEBEK')),
      JSON.stringify({ r, durum: t.s.tuketim[0]?.durum, onbellek: t.s.onbellek, gunluk }));
  }

  {
    // Ödenmiş içerik (26 saat önce BASARILI) ama önbellekte bir anahtar eksik
    // (önbellek yazımı patlamış içerik).
    const odenmis = () => [tuketimKaydi({ icerikOzeti: OZET, satirSayisi: 3, olusturuldu: new Date(Date.now() - 26 * 60 * DK), sonuclandi: new Date(Date.now() - 26 * 60 * DK + DK) })];
    const t = kur({ onbellek: { 'PVC BORU': 'PVC PIPE' }, apiAnahtari: API, tuketim: odenmis() });
    const istemci = sahteIstemci([(m) => ({ ceviriler: m.includes('ÇELİK BORU') ? [{ kaynak: 'ÇELİK BORU', ceviri: 'STEEL PIPE' }] : [] })]);
    t.istemciBagla(istemci);
    const r: any = await t.servis.teklifiCevir(K1, Q).catch((e) => ({ hata: String(e), harita: {} }));
    check('A11 ★ ödenmiş ama önbellekte eksik: API\'ye YALNIZ eksik gider ve o satır ÜCRETLENİR (kotasız API yolu yok)',
      JSON.stringify(istemci.istekler) === JSON.stringify([['ÇELİK BORU']]) && t.s.tuketim.length === 2 && t.s.olaylar.includes('create') &&
      r.tekrar === false && r.dusulenSatir === 1 && r.onbellektenSatir === 2 &&
      r.harita['PVC BORU'] === 'PVC PIPE' && r.harita['ÇELİK BORU'] === 'STEEL PIPE' && t.aiKayitlari.length === 1,
      JSON.stringify({ istekler: istemci.istekler, kayit: t.s.tuketim.length, tekrar: r.tekrar, dusen: r.dusulenSatir, ai: t.aiKayitlari.length }));

    const t2 = kur({ onbellek: { 'PVC BORU': 'PVC PIPE' }, apiAnahtari: API, tuketim: odenmis() });
    t2.istemciBagla(sahteIstemci([() => ({ ceviriler: [] })]));
    const e = await hata(() => t2.servis.teklifiCevir(K1, Q));
    const y = yanit(e);
    // Yanıt GELDİ ama BOŞ döndü (`ceviriler: []`): çağrının parası harcandı →
    // o metnin 1 satırı düşer. "Model bir şey döndürmedi" ücretsiz DEĞİLDİR.
    check('A11b ★ ödenmiş içerikte API BOŞ yanıt dönerse 422 + liste, harita YOK, kayıt BASARISIZ ama 1 satır DÜŞER',
      e?.getStatus?.() === 422 && y.kod === 'CEVIRI_TAMAMLANAMADI' && JSON.stringify(y.cevrilemeyenSatirlar) === JSON.stringify(['ÇELİK BORU']) &&
      !('harita' in y) && t2.s.tuketim.length === 2 && t2.s.tuketim[1]?.durum === 'BASARISIZ' && t2.s.tuketim[1]?.dusulenSatir === 1,
      JSON.stringify({ durum: e?.getStatus?.(), y, dusulen: t2.s.tuketim[1]?.dusulenSatir }));
  }

  {
    // GÜVENLİK SÜZGECİ REDDETTİ AMA PARA HARCANDI (Emre 16.09 ek kararı):
    // yanıt geldi, K-T11 süzgeci çeviriyi reddetti (kaynakta OLMAYAN bağlantı)
    // → metin eksik kaldı, 422, önbelleğe yazılmadı; ama çağrının parası
    // harcandığı için o satır kotadan DÜŞER. Süzgeç ücretsiz bir geri alma
    // DEĞİLDİR: reddedilen yanıt da fatura üretmiştir.
    const KOTU = 'PVC PIPE www.kotu-site.com';
    const t = kur({ onbellek: {}, apiAnahtari: API, teklifler: { [Q]: { firmaId: 'f1', sheets: [sayfa(['PVC BORU'])] } } });
    t.istemciBagla(sahteIstemci([() => ({ ceviriler: [{ kaynak: 'PVC BORU', ceviri: KOTU }] })]));
    check('A13 FIXTURE KANITI: süzgeç bu çeviriyi gerçekten reddediyor', ceviriGuvenliMi('PVC BORU', KOTU) === false, KOTU);
    const e = await hata(() => t.servis.teklifiCevir(K1, Q));
    const y = yanit(e);
    const d = await t.kota.durum(K1);
    check('A13b ★ güvenlik süzgecinin reddettiği satır önbelleğe girmez ama kotadan DÜŞER (1 satır), dosya yenmez',
      e?.getStatus?.() === 422 && t.s.onbellek['PVC BORU'] === undefined &&
      t.s.tuketim[0]?.durum === 'BASARISIZ' && t.s.tuketim[0]?.dusulenSatir === 1 &&
      y.dusulenSatir === 1 && d?.kullanilanSatir === 1 && d?.kullanilanDosya === 0,
      JSON.stringify({ durum: e?.getStatus?.(), dusulen: t.s.tuketim[0]?.dusulenSatir, d }));
  }
}

bitmezseKirmizi(wBlogu()
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
  }));
