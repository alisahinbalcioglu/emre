import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';
import { ALAN_ETIKET } from './fatura-kimligi';
import { telefonHatasi } from './telefon-bicim';
import { dwgIpucu } from './dwg-kapisi';
import { SEVIYE_AD } from './paket-bicim';

/**
 * ÖDEME / ABONELİK / PAKET EKRANLARI — TÜRKÇE KARAKTER KAPISI
 * (Faz 6.1 kapanış, 15.09.2026)
 *
 * Müşterinin para ödediği ekranlarda "Ödemeye geç" yerine "Odemeye gec",
 * "İl" yerine "Il" yazıyordu (ölçüm 6.1: ~40 metin; çürütücü ödeme DÖNÜŞ
 * ekranını ve hesap sayfasındaki ham durum kodunu ekledi).
 *
 * NE TARANIR — dosyanın TAMAMINDA ekrana gidebilecek metin düğümleri:
 *   · JSX metni (her zaman; tek kelime "Ödeme" başlığı dahil)
 *   · dizge/şablon parçası: boşluk içeriyorsa YA DA büyük harfle başlıyorsa
 *     ("İl", "İşçilik" gibi tek kelimelik etiketler)
 * NE TARANMAZ (kod sayılır): küçük harfli tek kelime (`'yukleniyor'` durum
 * kodu), BÜYÜK HARFLİ kod (`'AKTIF'`), karşılaştırma işleneni, tür
 * bildirimi, nesne anahtarı, import, görünmeyen öznitelik (className, href…),
 * `cn(...)` argümanı, `<style>` içeriği (CSS), `console.*` günlüğü.
 *
 * P1-ek (15.09): ExcelGrid yalnız "Pro paket gerekli" desenli metne bakılıyordu;
 * aynı Pro kapısının sütun başlığı ipucu ("Iscilik fiyatlandirmasi Pro pakete
 * dahildir.") desene uymadığı için HİÇ taranmıyordu. Artık ExcelGrid ve kabuk
 * (kırıntı, üst menü, kenar çubuğu) dosyanın TAMAMIYLA taranır.
 *
 * ⚠ SINIR: kara liste BUGÜN düzeltilen kelimelerden türetildi; yarın yazılan
 * yeni karaktersiz bir kelimeyi kaçırabilir. Listeye geçerli bir yazım
 * ("dahil", "cihazlardaki") girerse yanlış kırmızı üretir — "ölçütün kendisi"
 * bloğu listeyi doğru yazılmış hukuki metinlere karşı sınar.
 * ⚠ JS `\b` yalnız ASCII harf tanır: "seç" içindeki "sec"i ayırmak için
 * Unicode harf sınırı kullanılır.
 */
const kok = join(__dirname, '..', '..');

const KARAKTERSIZ = [
  'Odeme', 'odeme', 'Odemeniz', 'Odemeye', 'baslatilamadi', 'Faturanizin', 'icin', 'adimda', 'dogrudan',
  'alinir', 'istege', 'bagli', 'Hazirlaniyor', 'gec', 'sunucularimiza', 'sec', 'secin', 'tutarlari',
  'referanstir', 'yapilir', 'satista', 'iletisime', 'gecin', 'gun', 'ucretsiz', 'kullaniciya', 'Sinirsiz',
  'Aylik', 'haric', 'dogrulaniyor', 'Aboneliginiz', 'baslatildi', 'Iyi', 'calismalar', 'henuz',
  'dogrulanmadi', 'tamamlandiysa', 'hesabiniz', 'birkac', 'acilir', 'sayfayi', 'bulunamadi', 'sayfasindan',
  'sorgulanamadi', 'gectiyse', 'kisa', 'sure', 'surerse', 'alindi', 'olustu', 'isleniyor', 'don', 'sayfasi',
  'Gecis', 'belirtilmemis', 'kaldi', 'Il', 'numarasi', 'olmali', 'baslamali', 'Yukseltmek', 'sayfasina',
  'kesif', 'secebilirsiniz', 'cikarma', 'olusturma', 'akisi', 'acik', 'kalir', 'gor', 'Iscilik', 'iscilik',
  'ozelligi', 'fiyatlandirmasi', 'olmaniz', 'Firmalarim', 'yukleyiniz', 'eslesmiyor', 'Parolaniz',
  'guncellendi', 'guncellenemedi', 'Aboneliginizi', 'istediginize', 'Donem', 'donem', 'erisiminiz', 'surer',
  'Iptal', 'islemi', 'tamamlanamadi', 'Hesabim', 'Uye', 'ozellikler', 'Baslangic', 'Kullanim', 'yonetimi',
  'ettiginizde', 'Aboneligi', 'Erisim', 'Parolanizi', 'degistirdiginizde', 'diger', 'kapatilir', 'Parolayi',
  'degistir', 'Cikis', 'Ikisi', 'yukleniyor', 'yuklenemedi', 'Lutfen',
  // P1-ek (15.09): teklif tablosu ve kabuk
  'Sec', 'Iskonto', 'Giris', 'yapildi', 'Firmalari', 'Yonetim', 'Yonetimi', 'Kullanicilar', 'Kullanici',
  'Ayarlari', 'Kutuphanem', 'markalari',
  // G3-ek (21.09, "Görünür kusurlar turu"): kütüphane/malzeme havuzu ekranları +
  // dashboard/QuickStart.tsx ("Hizli Baslat" ana sayfa kutusu, brief t.6'da adıyla
  // istenen düzeltme — G1/G4/G5 bitirdikten sonra çakışma kalmadığı için eklendi).
  // ⚠ "disiplin" BİLEREK EKLENMEDİ: doğru yazılmış bir kelime (hukuki metinde ve
  // /fiyatlar'da "disipline" olarak geçerli kullanımı var — yanlış kırmızı üretirdi).
  // G3-ek3 (21.09): `labor-firms/page.tsx`'teki "Firma Adi"/"Henuz firma yok..." önce
  // "dokunma" denip sonra ölçüm düzeltilip DÜZELTİLDİ (bkz. EKRANLAR/içerik kilidi) —
  // "Henuz"/"Adi" artık güvenle eklenebiliyor.
  'sablonlari', 'Kaldir', 'Belirtilmemis', 'eklenmemis', 'avantajli', 'Ayri', 'Tum', 'Kutuphaneme',
  'kopyalandi', 'uygulandi', 'kopyalanamadi', 'Uyari', 'ustu', 'arasinda', 'Basarili', 'uygulanamadi',
  'Markasiz', 'buyuk', 'ayiklanamadi', 'basarisiz', 'aktarildi', 'Aktarildi', 'Kutuphanenizdeki', 'Yukle',
  'Aramanizla', 'eslesen', 'Ayiklanan', 'Dosyasi', 'ayiklandi', 'Ayiklaniyor', 'Ayikla', 'Orn', 'orn', 'Henuz',
  'Adi', 'Yukaridan', 'firmanizi',
  'kaldirildi', 'basariyla', 'Hizli', 'Baslat', 'Gecersiz', 'yukleyin', 'dosyasi',
];
const KARA_LISTE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${KARAKTERSIZ.join('|')})(?![\\p{L}\\p{N}])`, 'u');

const GORUNUR_OZNITELIK = new Set(['title', 'placeholder', 'aria-label', 'alt', 'label']);
const KARSILASTIRMA = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);
/** Küçük harfli tek kelime / yol ya da BÜYÜK HARFLİ kod — ekran metni değil. */
const koduMu = (s: string) => /^[a-z0-9_\-./:?=&]*$/.test(s) || /^[A-Z0-9_]+$/.test(s);

function ayristir(ad: string, kaynak: string): ts.SourceFile {
  const tur = ad.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(ad, kaynak, ts.ScriptTarget.Latest, true, tur);
}

/** Ekrana gidebilecek metin parçaları, satır numarasıyla. */
function ekranMetinleri(sf: ts.SourceFile): { metin: string; satir: number }[] {
  const out: { metin: string; satir: number }[] = [];
  const ekle = (metin: string, n: ts.Node) =>
    out.push({ metin, satir: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1 });
  const gez = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n) || ts.isLiteralTypeNode(n)) return;
    // <style> içeriği CSS'tir (styled-jsx yorumları dahil) — ekran metni değil.
    if (ts.isJsxElement(n) && n.openingElement.tagName.getText() === 'style') return;
    if (ts.isJsxAttribute(n) && !GORUNUR_OZNITELIK.has(n.name.getText())) return;
    // sınıf adı yardımcıları ve geliştirici günlüğü ekrana gitmez
    if (ts.isCallExpression(n) && /^(cn|clsx|console\.\w+)$/.test(n.expression.getText())) return;
    if (ts.isJsxText(n)) {
      const t = n.text.replace(/\s+/g, ' ').trim();
      if (t) ekle(t, n);
    } else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const p = n.parent;
      const anahtar = ts.isPropertyAssignment(p) && p.name === n;
      const karsilastirma = ts.isBinaryExpression(p) && KARSILASTIRMA.has(p.operatorToken.kind);
      if (!anahtar && !karsilastirma && !ts.isCaseClause(p) && !koduMu(n.text)) ekle(n.text, n);
    } else if (ts.isTemplateExpression(n)) {
      for (const t of [n.head.text, ...n.templateSpans.map((s) => s.literal.text)]) {
        if (t.trim() && !koduMu(t.trim())) ekle(t, n);
      }
    }
    n.forEachChild(gez);
  };
  gez(sf);
  return out;
}

const karaktersizler = (sf: ts.SourceFile) =>
  ekranMetinleri(sf)
    .filter((m) => KARA_LISTE.test(m.metin))
    .map((m) => `:${m.satir} ${m.metin}`);

const agaclar = new Map<string, ts.SourceFile>();
const dosya = (yol: string) => {
  if (!agaclar.has(yol)) agaclar.set(yol, ayristir(yol, readFileSync(join(kok, yol), 'utf-8')));
  return agaclar.get(yol) as ts.SourceFile;
};
const metinler = (yol: string) => ekranMetinleri(dosya(yol)).map((m) => m.metin.replace(/\s+/g, ' ').trim());

describe('Ölçütün kendisi — tarayıcı metni koddan ayırıyor, kara liste doğru yazımı yakalamıyor', () => {
  it('JSX metni yakalanır; durum kodu, karşılaştırma, tür ve className yakalanmaz', () => {
    const sf = ayristir(
      'o.tsx',
      `type D = { tur: 'yukleniyor' };
       const x = (d: D) => d.tur === 'yukleniyor';
       const y = { tur: 'yukleniyor', AKTIF: 'AKTIF' };
       export const A = () => <p className="gun gec">Paketler yukleniyor…</p>;`,
    );
    expect(karaktersizler(sf)).toEqual([':4 Paketler yukleniyor…']);
  });

  it('büyük harfle başlayan tek kelimelik etiket ve tek kelimelik JSX başlığı yakalanır', () => {
    const sf = ayristir('o.tsx', `const E = { sehir: 'Il', label: 'Iscilik' };\nexport const B = () => <h1>Odeme</h1>;`);
    expect(karaktersizler(sf)).toEqual([':1 Il', ':1 Iscilik', ':2 Odeme']);
  });

  it('<style> içeriği ve console günlüğü sayılmaz; atamayla verilen sütun ipucu sayılır', () => {
    const sf = ayristir(
      'o.tsx',
      `const f = (c: any) => { console.log('satir geri alindi'); c.headerTooltip = 'Iscilik fiyatlandirmasi Pro pakete dahildir.'; };
       export const S = () => <style jsx>{\`.a { color: red } /* Iscilik sec */\`}</style>;`,
    );
    expect(karaktersizler(sf)).toEqual([':1 Iscilik fiyatlandirmasi Pro pakete dahildir.']);
  });

  it('FIXTURE KANITI: tabandaki eski metinlerin her biri kara listeye takılır', () => {
    for (const eski of [
      'Odemeye gec', 'Bu paketi sec', 'Il', 'Paketleri gor', 'Iscilik', 'Gecis paketi',
      'Aboneliginiz baslatildi. Iyi calismalar!', 'Cep telefonu 5 ile baslamali', 'Hesabim',
      // P1-ek: teklif tablosu ve kabuk
      'Iscilik fiyatlandirmasi Pro pakete dahildir.', 'Marka sec...', 'Firma sec...', '⚠ Iscilik Sec (', 'Iskonto %',
      'Iptal', 'Cikis Yap', 'Giris yapildi', 'Iscilik Firmalari', 'Kullanicilar', 'AI Ayarlari', 'Malzeme Yonetimi',
      'Kutuphanem', 'Kullanici', 'Malzeme markalari ve iscilik kalemleri',
      // G3-ek (21.09): kütüphane / malzeme havuzu ekranları
      'Kutuphaneme Aktar', 'Kaldir', 'Kapak + icmal sablonlari', 'Henuz mekanik marka eklenmemis.',
      'Iskonto kopyalandi', 'Toplu iskonto kopyalanamadi.', 'Uyari', 'Fiyat 0 veya ustu olmali.', 'Basarili',
      'Markasiz', 'PDF ayiklama basarisiz oldu.', 'Kutuphanenizdeki mekanik malzeme markalari', 'PDF Yukle',
      'Aramanizla eslesen marka bulunamadi.', 'Ayiklanan Malzemeler', 'PDF Dosyasi (max 10MB)', 'Ayikla',
      // G3-ek2 (21.09): dashboard/QuickStart.tsx ("Hizli Baslat" kutusu)
      'Hizli Baslat', 'Gecersiz dosya', 'Excel (.xlsx/.xls) dosyasi yukleyin.', 'DWG veya DXF dosyasi yukleyin.',
      // G3-ek3 (21.09): labor-firms/page.tsx (önce "dokunma" dendi, ölçüm düzeltilip düzeltildi)
      'Firma Adi', 'orn. Ahmet Tesisat', 'Henuz firma yok. Yukaridan ilk firmanizi ekleyin.',
    ]) {
      expect(KARA_LISTE.test(eski), eski).toBe(true);
    }
  });

  it('doğru yazılmış karşılıkları ve geçerli ASCII yazımlar takılmaz', () => {
    for (const dogru of [
      'Ödemeye geç', 'Bu paketi seç', 'İl', 'Paketleri gör', 'İşçilik', 'gün kaldı', 'KDV dahil',
      'Pro pakete dahildir', 'diğer cihazlardaki oturumlar', 'section', 'donemEki',
      'İşçilik fiyatlandırması Pro pakete dâhildir.', 'Marka seç…', '⚠ İşçilik Seç (', 'İskonto %', 'Çıkış Yap',
      'Giriş yapıldı', 'Kütüphanem', 'Kullanıcılar', 'AI Ayarları', 'Malzeme Yönetimi', 'Malzeme markaları ve işçilik kalemleri',
      // G3-ek (21.09): duzeltilen dogru bicimler yanlis yakalanmamali
      'Kütüphaneme Aktar', 'Kaldır', 'Kapak + icmal şablonları', 'Henüz mekanik marka eklenmemiş.',
      'İskonto kopyalandı', 'Toplu iskonto kopyalanamadı.', 'Uyarı', 'Fiyat 0 veya üstü olmalı.', 'Başarılı',
      'Markasız', 'PDF ayıklama başarısız oldu.', 'Kütüphanenizdeki mekanik malzeme markaları', 'PDF Yükle',
      'Aramanızla eşleşen marka bulunamadı.', 'Ayıklanan Malzemeler', 'PDF Dosyası (max 10MB)', 'Ayıkla',
      // G3-ek2 (21.09): dashboard/QuickStart.tsx doğru biçimleri
      'Hızlı Başlat', 'Geçersiz dosya', 'Excel (.xlsx/.xls) dosyası yükleyin.', 'DWG veya DXF dosyası yükleyin.',
      // G3-ek3 (21.09): labor-firms/page.tsx doğru biçimleri
      'Firma Adı', 'örn. Ahmet Tesisat', 'Henüz firma yok. Yukarıdan ilk firmanızı ekleyin.',
      // "disiplin" kelimesi kendisi DOGRU Turkce (ozel karakter gerekmez) — kara listeye
      // EKLENMEDI (bkz. KARAKTERSIZ yorumu); burada gecerliligini kanitlar.
      'Paketler disipline göre farklılaşır',
    ]) {
      expect(KARA_LISTE.test(dogru), dogru).toBe(false);
    }
  });

  it('kara liste doğru Türkçe hukuki metinlerde ve fiyat sayfasında hiçbir şey yakalamaz', () => {
    expect(karaktersizler(dosya('ozellik/hukuki/metinler.ts'))).toEqual([]);
    expect(ekranMetinleri(dosya('ozellik/hukuki/metinler.ts')).length).toBeGreaterThan(50);
  });
});

/** Dosyanın TAMAMI taranır — yarım düzeltilmiş dosya kırmızı verir. */
const EKRANLAR = [
  'app/(protected)/abonelik/page.tsx', // paket seçimi, fatura formu, ödeme
  'app/(protected)/abonelik/donus/page.tsx', // ödeme dönüşü — satın almanın son adımı
  'app/(protected)/profile/page.tsx', // hesap: kimlik satırı, sekmeler
  // 23.09.2026 — Hesabım sekmelere bölündü; kartların metni artık bu
  // dosyalarda. Eklenmeselerdi sayfanın TAMAMI yine taranıyor sanılırdı.
  'ozellik/kimlik/hesabim/hesabim.ts', // sekme adları, fatura kimliği uyarısı
  'ozellik/kimlik/hesabim/ProfilSekmesi.tsx',
  'ozellik/kimlik/hesabim/FirmaSekmesi.tsx',
  'ozellik/kimlik/hesabim/AbonelikSekmesi.tsx', // abonelik bölümü, iptal
  'ozellik/kimlik/hesabim/GuvenlikSekmesi.tsx',
  'ozellik/kimlik/hesabim/VerilerSekmesi.tsx',
  'ozellik/kimlik/hesabim/EkipErisimiSekmesi.tsx',
  'ozellik/kimlik/kapatma-metinleri.ts', // "Hesabımı kapat" maddeleri
  'app/(protected)/dwg-workspace/page.tsx', // DWG için Pro kapısı
  'app/(protected)/labor-firms/page.tsx', // işçilik için Pro kapısı
  'ortak/kabuk/components/dashboard/QuickStart.tsx', // Excel/DWG kutusu ipucu
  'app/fiyatlar/page.tsx',
  'ozellik/odeme/FiyatKartlari.tsx',
  'ozellik/odeme/paket-bicim.ts',
  // 23.09 — paket değişimi: onay penceresi ve bekleyen değişim cümleleri.
  'ozellik/odeme/paket-degisimi.ts',
  // 24.09 (A2) — yönetici "Paket işlemleri" penceresi ve yardımcı metinleri.
  'ozellik/odeme/yonetici/yonetici-paket.ts',
  'ozellik/odeme/yonetici/YoneticiPaketPenceresi.tsx',
  // 24.09 (A2 Blok 2) — müşterinin paket önerisi şeridi ve metinleri.
  'ozellik/odeme/OneriSeridi.tsx',
  'ozellik/odeme/paket-onerisi.ts',
  'ozellik/odeme/abonelik-ozeti.ts',
  'ozellik/odeme/fatura-kimligi.ts',
  'ozellik/odeme/telefon-bicim.ts',
  'ozellik/odeme/dwg-kapisi.ts',
  'ozellik/odeme/ozellik-kapisi.ts',
  // P1-ek (15.09): teklif tablosu — işçilik Pro kapısının İKİ ipucu (hücre + sütun
  // başlığı), marka/firma seçim kutuları. Önceki süzgeç yalnız "Pro paket gerekli"
  // desenine bakıyordu; başlık ipucu o yüzden kaçtı.
  'ozellik/tablo/excel-grid/ExcelGrid.tsx',
  // kabuk: her korumalı sayfada sayfa başlığının yanında görünür
  'ortak/kabuk/components/layout/Breadcrumb.tsx',
  'app/(protected)/layout.tsx', // üst menü: Giriş yapıldı / Çıkış Yap
  'ortak/kabuk/components/layout/Sidebar.tsx',
  // G3-ek (21.09, "Görünür kusurlar turu" t.6): kütüphane / malzeme havuzu ekranları.
  // NOT: `app/(protected)/materials/page.tsx` yalnız /materials/mechanical'a
  // yönlendirir (ekran metni yok), o yüzden listede değil.
  'app/(protected)/library/page.tsx',
  'app/(protected)/materials/mechanical/page.tsx',
  'app/(protected)/library/mechanical-brands/page.tsx', // sahipsizdi, bu turda G3'e eklendi
  // K-ek (21.09, kurumsal sayfalar turu t.21): ELEKTRİK İKİZLERİ.
  // ⚠ Bunlar G3'te "elektrik kapsam dışı" denip BİLEREK atlanmıştı ve o turun
  // en değerli bulgusu buydu: kapı vardı, bu iki ekran listede DEĞİLDİ — yani
  // mekanik ikizi düzelirken elektrik ikizi sessizce bozuk kalıyordu
  // ("Henuz elektrik markasi eklenmemis."). Kapsam dışı olan elektrik
  // İÇERİĞİdir; yazım düzeltmesi içerik değildir (aynı ayrım
  // `scripts/paket-aciklama-duzelt.ts` başında da yapıldı).
  // ⚠ Dosyanın TAMAMI tarandığı için iki ekranın TÜM metinleri mekanik
  // ikizleriyle aynı yazıma çekildi — yarım düzeltilmiş dosya kırmızı verir.
  'app/(protected)/materials/electrical/page.tsx',
  'app/(protected)/library/electrical-brands/page.tsx',
  'ortak/kabuk/components/dashboard/QuickAccess.tsx', // sahipsizdi, bu turda G3'e eklendi
  'app/(protected)/dashboard/page.tsx', // G1'in dosyası — G1 21.09'da düzeltti (bkz. Kullanicilar→Kullanıcılar)
  // 23.09.2026 — VİTRİN (paketsiz yeni hesap): şerit/pencere metinleri, bölüm
  // kartı ve deneme satırı. Yeni hesabın İLK gördüğü ekranlar; inceleme (S3,
  // 24.09) listede olmadıklarını yakaladı — bugünkü metin doğru, yarın
  // yazılacak karaktersiz cümle kaçardı.
  'ozellik/odeme/vitrin-metinleri.ts',
  'ozellik/odeme/VitrinSaglayici.tsx',
  'ozellik/odeme/VitrinBolumKarti.tsx',
  // Vitrin önizlemesinde görüldü (24.09): Ana Sayfa'nın "Son Teklifler" kutusu
  // yeni hesabın ilk ekranında "Henuz teklif olusturulmadi" yazıyordu.
  'ozellik/teklif/dashboard/RecentQuotes.tsx',
];

describe('Ödeme / abonelik / paket ekranları, teklif tablosu ve kabukta karaktersiz Türkçe yok', () => {
  it.each(EKRANLAR)('%s', (yol) => {
    expect(ekranMetinleri(dosya(yol)).length).toBeGreaterThan(0);
    expect(karaktersizler(dosya(yol))).toEqual([]);
  });
});

describe('Düzeltilen metinler yerinde (içerik kilidi)', () => {
  it('fatura formu il alanı', () => {
    expect(ALAN_ETIKET.sehir).toBe('İl');
  });

  it('telefon hata mesajları', () => {
    expect(telefonHatasi('53309')).toBe('Telefon numarası 10 haneli olmalı');
    expect(telefonHatasi('2120983663')).toBe('Cep telefonu 5 ile başlamalı');
  });

  it('DWG kapısı ipucu', () => {
    expect(dwgIpucu('sonuk')).toBe('DWG metrajı Pro pakete dâhildir. Yükseltmek için Abonelik sayfasına gidin.');
  });

  it('abonelik sayfası: ödeme adımları ve kart satırları fiyat kartıyla aynı dilde', () => {
    const m = metinler('app/(protected)/abonelik/page.tsx');
    for (const t of ['Ödeme', 'Ödemeye geç', 'Hazırlanıyor…', '(isteğe bağlı)', 'Bu paketi seç', 'Sınırsız teklif', 'dâhil değil']) {
      expect(m, t).toContain(t);
    }
  });

  it('ödeme dönüş ekranı', () => {
    const m = metinler('app/(protected)/abonelik/donus/page.tsx');
    for (const t of ['Ödeme alındı', 'Bir sorun oluştu', 'Ödemeniz işleniyor', 'Aboneliğiniz başlatıldı. İyi çalışmalar!', 'Panele dön']) {
      expect(m, t).toContain(t);
    }
  });

  it('hesap sayfası: abonelik bölümü (Abonelik sekmesi) ve "Core" yok', () => {
    // 23.09.2026: kart Abonelik sekmesine taşındı. "Abonelik yönetimi" (açılır
    // bölüm) ve "Başlangıç paketi" (eski alt satır) tasarımla KALKTI; "Basic"
    // artık ekranda elle yazılmıyor, `paketRozeti` → `SEVIYE_AD`den geliyor
    // (ikinci sözlük yok — aşağıdaki "Core" bloğu ölçer).
    const m = metinler('ozellik/kimlik/hesabim/AbonelikSekmesi.tsx');
    for (const t of ['Aboneliği iptal et', 'Paketleri gör', 'İşçilik', 'Paket kapsamı', 'Bu dönemki kullanım', 'Tüm zamanlar']) {
      expect(m, t).toContain(t);
    }
    expect(m).not.toContain('Core');
    expect(metinler('app/(protected)/profile/page.tsx')).not.toContain('Core');
  });

  it('teklif tablosu (ExcelGrid): Pro kapısının iki ipucu, seçim kutuları, iskonto başlığı', () => {
    const m = metinler('ozellik/tablo/excel-grid/ExcelGrid.tsx');
    for (const t of ['İşçilik için Pro paket gerekli', 'İşçilik fiyatlandırması Pro pakete dâhildir.', 'Marka seç…', 'Firma seç…', 'İskonto %', 'İptal']) {
      expect(m, t).toContain(t);
    }
  });

  it('kabuk: kırıntı, üst menü ve kenar çubuğu aynı ekrandaki başlıklarla aynı yazımda', () => {
    const kirinti = metinler('ortak/kabuk/components/layout/Breadcrumb.tsx');
    for (const t of ['Hesabım', 'İşçilik', 'İşçilik Firmaları', 'Kütüphanem', 'Yönetim', 'Kullanıcılar', 'AI Ayarları', 'Malzeme Yönetimi']) {
      expect(kirinti, t).toContain(t);
    }
    expect(metinler('app/(protected)/layout.tsx')).toEqual(expect.arrayContaining(['Giriş yapıldı', 'Çıkış Yap']));
    expect(metinler('ortak/kabuk/components/layout/Sidebar.tsx')).toEqual(expect.arrayContaining(['Kütüphanem', 'Kullanıcı']));
    // ikizler: aynı ekrandaki sayfa başlıkları. 23.09: "Çıkış Yap" Hesabım'ın
    // Güvenlik sekmesine taşındı — üst menüyle AYNI yazım korunuyor (hukuki
    // metin de düğmeyi bu adla anıyor: `"Çıkış Yap" (… Hesabım sayfası)`).
    expect(metinler('app/(protected)/profile/page.tsx')).toEqual(expect.arrayContaining(['Hesabım']));
    expect(metinler('ozellik/kimlik/hesabim/GuvenlikSekmesi.tsx')).toEqual(expect.arrayContaining(['Çıkış Yap']));
    expect(metinler('app/(protected)/library/page.tsx')).toEqual(expect.arrayContaining(['Kütüphanem', 'Malzeme markaları ve işçilik kalemleri']));
  });

  // G3-ek (21.09): kütüphane / malzeme havuzu ekranları — düzeltilen metinler yerinde
  it('kütüphanem: mekanik işçilik kartı ve teklif format şablonları etiketi', () => {
    expect(metinler('app/(protected)/library/page.tsx')).toEqual(
      expect.arrayContaining(['Mekanik İşçilik', 'Kapak + icmal şablonları']),
    );
  });

  it('malzeme havuzu (mekanik): kaldır / kütüphaneme aktar / boş liste metni', () => {
    expect(metinler('app/(protected)/materials/mechanical/page.tsx')).toEqual(
      expect.arrayContaining(['Kaldır', 'Kütüphaneme Aktar', 'Henüz mekanik marka eklenmemiş.']),
    );
  });

  it('kütüphanem → mekanik markalar: PDF yükle akışı ve boş arama metni', () => {
    expect(metinler('app/(protected)/library/mechanical-brands/page.tsx')).toEqual(
      expect.arrayContaining(['PDF Yükle', 'Ayıklanan Malzemeler', 'Aramanızla eşleşen marka bulunamadı.']),
    );
  });

  it('anasayfa hızlı erişim kartı: kütüphanem açıklaması', () => {
    expect(metinler('ortak/kabuk/components/dashboard/QuickAccess.tsx')).toEqual(
      expect.arrayContaining(['Kütüphanem', 'Markalar, iskontolar, işçilik']),
    );
  });

  // G3-ek2 (21.09): dashboard/QuickStart.tsx — "Hızlı Başlat" kutusu (brief t.6, Ana sayfa)
  it('anasayfa hızlı başlat kutusu: başlık ve dosya uyarı metinleri', () => {
    expect(metinler('ortak/kabuk/components/dashboard/QuickStart.tsx')).toEqual(
      expect.arrayContaining([
        'Hızlı Başlat',
        'Geçersiz dosya',
        'Excel (.xlsx/.xls) dosyası yükleyin.',
        'DWG veya DXF dosyası yükleyin.',
      ]),
    );
  });

  // G3-ek3 (21.09): labor-firms/page.tsx — önce "dokunma" dendi, ölçüm düzeltilip
  // t.6 kapsamına girdiği netleşince düzeltildi (para birimi yazma yolu — ht.9 —
  // ayrı, [firmaId]/page.tsx'te ve KAPSAM DIŞI kaldı, buraya dokunulmadı).
  it('işçilik firmaları: firma adı etiketi ve boş liste metni', () => {
    expect(metinler('app/(protected)/labor-firms/page.tsx')).toEqual(
      expect.arrayContaining(['Firma Adı', 'Henüz firma yok. Yukarıdan ilk firmanızı ekleyin.']),
    );
  });

  // K-ek (21.09, t.21): ELEKTRİK İKİZLERİ — iş emrinin adıyla istediği metin
  // ("Henüz elektrik markası eklenmemiş.") ve ikizin aynı yazımda olduğu.
  it('elektrik havuzu: boş liste metni + mekanik ikiziyle aynı yazım', () => {
    const elk = metinler('app/(protected)/materials/electrical/page.tsx');
    expect(elk).toEqual(
      expect.arrayContaining([
        'Henüz elektrik markası eklenmemiş.',
        'Kaldır',
        'Kütüphaneme Aktar',
        'Elektrik tesisat malzeme markaları ve fiyat listeleri',
      ]),
    );
    // İKİZ: iki havuz ekranı ortak düğmeleri AYNI yazımda basmalı — biri
    // düzeltilip öteki geride kalırsa bu assert kırmızı olur.
    const mek = metinler('app/(protected)/materials/mechanical/page.tsx');
    for (const ortak of ['Kaldır', 'Kütüphaneme Aktar', 'Marka Adı', 'İptal']) {
      expect(mek, `mekanik: ${ortak}`).toContain(ortak);
      expect(elk, `elektrik: ${ortak}`).toContain(ortak);
    }
  });

  it('kütüphanem → elektrik markalar: PDF yükle akışı ve boş arama metni', () => {
    const elk = metinler('app/(protected)/library/electrical-brands/page.tsx');
    expect(elk).toEqual(
      expect.arrayContaining([
        'Henüz elektrik markası eklenmemiş.',
        'PDF Yükle (Admin)',
        'Ayıklanan Malzemeler',
        'Aramanızla eşleşen marka bulunamadı.',
        'Kütüphanenizdeki elektrik malzeme markaları',
      ]),
    );
    const mek = metinler('app/(protected)/library/mechanical-brands/page.tsx');
    for (const ortak of ['Ayıklanan Malzemeler', 'Aramanızla eşleşen marka bulunamadı.', 'Malzeme Adı', 'İptal']) {
      expect(mek, `mekanik: ${ortak}`).toContain(ortak);
      expect(elk, `elektrik: ${ortak}`).toContain(ortak);
    }
  });
});

/**
 * PAKET ADI KAPISI (P1-ek, Emre kararı 15.09): müşteriye görünen en ucuz paket
 * adı "Basic". `core` yalnız iç seviye kodudur (backend `enum Tier` /
 * `PackageLevel`) — iç değerler DEĞİŞMEDİ. İki yol kapanır:
 *   · YAZILI: ön yüzün TAMAMINDA ekran metinlerinde "Core" kelimesi yok
 *     (anasayfa "Core pakette", /fiyatlar paylaşım görseli alt metni vardı).
 *   · KOD BASIMI: seviye kodu JSX'e ham basılmıyor (kenar çubuğu `{tier}` +
 *     `uppercase` → "CORE"). Yönetici paneli (`app/admin/`) HARİÇ: orada
 *     yönetici seviye KODUNU seçer ve görür; iç araçtır.
 * ⚠ SINIR: görsellerin içindeki yazıyı okumaz (og/fiyatlar-basic.jpg P1-ek'te
 * yeniden üretildi, gözle karşılaştırıldı).
 */
const KAYNAK_DIZINLERI = ['app', 'components', 'lib', 'ortak', 'ozellik'];
function kaynakDosyalari(): string[] {
  const out: string[] = [];
  const gez = (d: string): void => {
    for (const ad of readdirSync(join(kok, d))) {
      const rel = `${d}/${ad}`;
      if (statSync(join(kok, rel)).isDirectory()) gez(rel);
      else if (/\.tsx?$/.test(ad) && !/\.(test|spec)\.tsx?$|\.d\.ts$/.test(ad)) out.push(rel);
    }
  };
  for (const d of KAYNAK_DIZINLERI) gez(d);
  return out;
}
// Kurucu ile: tsconfig hedefi ES5, `u` bayraklı düzenli ifade DEĞİŞMEZİ tsc'de TS1501 verir.
const CORE_KELIMESI = new RegExp('(?<![\\p{L}\\p{N}])core(?![\\p{L}\\p{N}])', 'iu');
const SEVIYE_KODU_ADLARI = new Set(['tier', 'seviye', 'level', 'packageLevel']);

/** JSX'e HAM basılan seviye kodu: `{tier}`, `{user.tier}`, `{s.level}` (öznitelik değeri sayılmaz). */
function hamSeviyeBasimlari(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  const gez = (n: ts.Node): void => {
    if (ts.isJsxExpression(n) && n.expression && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))) {
      const e = n.expression;
      const ad = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : undefined;
      if (ad && SEVIYE_KODU_ADLARI.has(ad)) out.push(`:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} ${n.getText()}`);
    }
    n.forEachChild(gez);
  };
  gez(sf);
  return out;
}

describe('Paket adı: müşteriye görünen hiçbir yerde "Core" yok (iç kod değişmedi)', () => {
  const dosyalar = kaynakDosyalari();

  // ⚠ TUM ON YUZUN TS AYRISTIRMASI TEK YERDE, ACIK SURE BUTCESIYLE: kapi
  // komutuyla (`npx vitest run`) bu is 5,8–6,4 sn olculdu (21.09, Windows) ve
  // varsayilan 5 sn test siniri "TAMAMINDA" testini 7/7 kosumda zaman asimiyla
  // kirmizi yapiyordu. Testler `agaclar` onbellegini okur; sira degisse de
  // (`-t` ile tek test) ayristirma hicbir testin 5 sn'sine dusmez.
  beforeAll(() => {
    for (const y of dosyalar) dosya(y);
  }, 60_000);

  it('ölçütün kendisi: yazılı "Core" ve ham kod basımı yakalanır; kod karşılaştırması, anahtar, varsayılan ve öznitelik yakalanmaz', () => {
    const sf = ayristir(
      'o.tsx',
      `const T = { core: 'Basic' }; const t = (u: any) => u?.tier ?? 'core'; const b = (x: string) => x === 'core';
       const g = { yol: '/og/f.jpg', alt: 'paket kartları: Core malzeme akışı' };
       export const A = (u: any, tier: string) => <p>Core pakette {seviyeAdi(u.tier)}<b>{u.tier}</b><i>{tier}</i><input value={u.tier} /></p>;`,
    );
    const yazili = ekranMetinleri(sf).filter((m) => CORE_KELIMESI.test(m.metin)).map((m) => `:${m.satir} ${m.metin.trim()}`);
    expect(yazili).toEqual([':2 paket kartları: Core malzeme akışı', ':3 Core pakette']);
    expect(hamSeviyeBasimlari(sf)).toEqual([':3 {u.tier}', ':3 {tier}']);
    expect(CORE_KELIMESI.test('score')).toBe(false);
  });

  it('ön yüzün TAMAMINDA ekran metinlerinde "Core" kelimesi yok', () => {
    expect(dosyalar.length).toBeGreaterThan(120); // boş küme yeşil vermesin
    const bulunan = dosyalar.flatMap((y) =>
      ekranMetinleri(dosya(y))
        .filter((m) => CORE_KELIMESI.test(m.metin))
        .map((m) => `${y}:${m.satir} ${m.metin.replace(/\s+/g, ' ').trim().slice(0, 80)}`),
    );
    expect(bulunan).toEqual([]);
  });

  it('seviye kodu JSX\'e ham basılmıyor (yönetici paneli hariç — iç araç)', () => {
    const bulunan = dosyalar
      .filter((y) => !y.startsWith('app/admin/'))
      .flatMap((y) => hamSeviyeBasimlari(dosya(y)).map((b) => `${y}${b}`));
    expect(bulunan).toEqual([]);
    // FIXTURE KANITI: dedektör çalışıyor. ⚠ 24.09 (A2): kanıt eskiden yönetici
    // kullanıcılar sayfasındaki eski abonelik listesinin `{s.level}` basımıydı;
    // o liste (erişim vermeyen eski kişi-başı tablo) KALDIRILDI. Kanıt artık
    // üretim kodundan BAĞIMSIZ sabit örnek: bir ekran değişince dedektörün
    // "çalıştığı" kanıtı sessizce kaybolmasın. Öznitelik değeri SAYILMAZ.
    const ornek = ayristir(
      'ornek.tsx',
      'const X = () => <div>{u.tier}<b>{level}</b><i title={tier}>x</i></div>;',
    );
    expect(hamSeviyeBasimlari(ornek)).toEqual([':1 {u.tier}', ':1 {level}']);
  });

  // ⚠ 2.15: ÇAĞRI `seviyeAdi` DEĞİL `paketRozeti`. Gerekçe: seviye `null`
  // olabiliyor (2.13 — abonelik yürümüyorsa etkin seviye yok) ve `seviyeAdi`
  // `string` istiyor; aradaki `?? 'core'` yedeği müşteriye SAHİP OLMADIĞI
  // paketi ("Basic") gösteriyordu. `paketRozeti` boş hâlin kapısıdır ve adı
  // yine SEVIYE_AD'den okur — bu testin ölçtüğü şey (tek sözlük) DEĞİŞMEDİ.
  it('kenar çubuğu rozeti ADI paketRozeti() ile basıyor (bağlantı)', () => {
    const sf = dosya('ortak/kabuk/components/layout/Sidebar.tsx');
    expect(
      sf.statements.some(
        (s) => ts.isImportDeclaration(s) && /ozellik\/odeme\/paket-bicim['"]$/.test(s.moduleSpecifier.getText()) && /\bpaketRozeti\b/.test(s.importClause?.getText() ?? ''),
      ),
    ).toBe(true);
    const cagrilar: string[] = [];
    const gez = (n: ts.Node): void => {
      if (ts.isJsxExpression(n) && ts.isJsxElement(n.parent) && n.expression && ts.isCallExpression(n.expression) && n.expression.expression.getText() === 'paketRozeti') {
        cagrilar.push(n.getText());
      }
      n.forEachChild(gez);
    };
    gez(sf);
    expect(cagrilar).toEqual(['{paketRozeti(tier)}']);
  });

  it('hesap sayfasında İKİNCİ paket adı sözlüğü yok — ad tek kaynaktan (SEVIYE_AD)', () => {
    // ⚠ 23.09.2026: eski kapı `TIER_CONFIG` etiketlerinin SEVIYE_AD ile AYNI
    // olduğunu ölçüyordu. Hesabım tasarımında seviye başına renk/ikon kalktı
    // ve `TIER_CONFIG` SİLİNDİ; kural aynı kalır ama ölçülen şey değişir:
    // hesap ekranının hiçbir dosyasında seviye KODUNU (`core`/`pro`/`suite`)
    // anahtar yapan bir nesne yok, rozet adı `paketRozeti(...)`den geliyor.
    const kodlar = new Set(Object.keys(SEVIYE_AD));
    const dosyalar = [
      'app/(protected)/profile/page.tsx',
      'ozellik/kimlik/hesabim/AbonelikSekmesi.tsx',
      'ozellik/kimlik/hesabim/hesabim.ts',
    ];
    for (const yol of dosyalar) {
      const sozlukler: string[] = [];
      const gez = (n: ts.Node): void => {
        if (ts.isObjectLiteralExpression(n)) {
          const anahtarlar = n.properties.map((p) => p.name?.getText().replace(/['"]/g, ''));
          if (anahtarlar.filter((a) => a && kodlar.has(a)).length >= 2) sozlukler.push(n.getText().slice(0, 60));
        }
        n.forEachChild(gez);
      };
      gez(dosya(yol));
      expect(sozlukler, yol).toEqual([]);
    }
    // Rozet adı TEK kapıdan (boş hâl dahil) ve ÇAĞRILIYOR.
    const sayfaCagrilari: string[] = [];
    const gez = (n: ts.Node): void => {
      if (ts.isCallExpression(n) && n.expression.getText() === 'paketRozeti') sayfaCagrilari.push(n.getText());
      n.forEachChild(gez);
    };
    gez(dosya('app/(protected)/profile/page.tsx'));
    expect(sayfaCagrilari.length).toBeGreaterThan(0);
    expect(sayfaCagrilari.every((c) => c === 'paketRozeti(tier)')).toBe(true);
  });

  it('düzeltilen yerler: anasayfa "Basic pakette", /fiyatlar paylaşım görseli alt metni "Basic"', () => {
    expect(metinler('ortak/kabuk/components/landing/NasilCalisir.tsx').some((t) => t.includes('Basic pakette malzeme akışının tamamı'))).toBe(true);
    expect(metinler('ortak/seo/arama-paylasim.ts').some((t) => t.startsWith('MetaPriceX paket kartları: Basic malzeme akışı'))).toBe(true);
  });
});
