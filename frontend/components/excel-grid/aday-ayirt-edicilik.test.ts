/* PU1-PU7 — ADAY LISTESI AYIRT EDICILIGI + NITELIK BAGLAMI
 * PRD: PRD_Standart_Grid_Semasi_ve_Aday_Ayirt_Edicilik.md §Bolum D
 *
 * ONCE KIRMIZI: bu testler duzeltmeden ONCE yazildi. Sinanan iki fonksiyon
 * (`niteliklerdenBaglam`, `adayEtiketleri`) HENUZ YOK — kok neden raporunda
 * (FAZ0_STANDART_SEMA_KOK_NEDEN.md §B) olculen iki hatanin sozlesmesidir:
 *   B.1  cap satirin ALTINDAKI nitelik satirinda; sorgu baglamina alinmiyor
 *   B.2  aday adi 60 karakterde kesiliyor; ayirt edici alan (DN) gorunmuyor
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  niteliklerdenBaglam, adayEtiketleri,
  popupGenisligiOku, popupGenisligiYaz, PU4_ANAHTAR, PU4_VARSAYILAN, PU4_ASGARI,
} from './aday-ayirt-edicilik';

/** YILDIZ ENTEGRE KARTEPE · Yangın.Pompa.Odası R47-R57 (gercek dosya) */
const YILDIZ_SATIRLARI = [
  { ad: 'Yükselen Milli Vana (OS&Y Valve)', veri: true },
  { ad: 'Çap : DN 250', veri: false },
  { ad: 'Vana Türü : Yükselen Milli Sürgülü', veri: false },
  { ad: 'Bağlantı Türü : Flanşlı', veri: false },
  { ad: 'Basınç Sınıfı : 175 psi', veri: false },
  { ad: 'Açılma : Volanlı', veri: false },
  { ad: 'Malzeme : - Vana Gövdesi : Dökme Demir', veri: false },
  { ad: 'Disk : EPDM Kaplamalı Döküm Demir', veri: false },
  { ad: 'Aksesuarlar : İzleme Anahtarlı (TKÇY)', veri: false },
  { ad: 'Üretici : Fivalco, Kennedy, Globe', veri: false },
  { ad: 'Onay : UL Listeli, FM Onaylı', veri: false },
  { ad: 'Yükselen Milli Vana (OS&Y Valve)', veri: true },
];

describe('PU1 — nitelik satırlarındaki çap sorgu bağlamına girer', () => {
  it('PU1 malzeme satırının çapı ALTINDAKİ nitelik satırından alınır', () => {
    const b = niteliklerdenBaglam(YILDIZ_SATIRLARI, 0);
    expect(b.cap, 'R48 "Çap : DN 250" bağlama girmeli').toBe('DN 250');
  });

  it('PU1b diğer ayırt edici nitelikler de toplanır (basınç · bağlantı · gövde)', () => {
    const b = niteliklerdenBaglam(YILDIZ_SATIRLARI, 0);
    expect(b.nitelikler['Basınç Sınıfı']).toBe('175 psi');
    expect(b.nitelikler['Bağlantı Türü']).toBe('Flanşlı');
  });

  it('PU1c nitelik toplama BİR SONRAKİ malzeme satırında durur (sızma yok)', () => {
    const b = niteliklerdenBaglam(YILDIZ_SATIRLARI, 0);
    // 12. satır ikinci malzeme satırı — onun nitelikleri bu bağlama girmemeli
    expect(Object.keys(b.nitelikler).length).toBeLessThanOrEqual(9);
    expect(b.sonNitelikSatiri).toBe(10);
  });

  it('PU1d niteliksiz satırda bağlam boş döner (uydurma yok)', () => {
    const b = niteliklerdenBaglam([{ ad: 'Dikişli Siyah Çelik Boru, DN150', veri: true }], 0);
    expect(b.cap).toBeNull();
    expect(Object.keys(b.nitelikler)).toHaveLength(0);
  });
});

describe('PU2/PU3 — aday listesinde iki satır asla aynı görünemez', () => {
  /** Yerel DUYAR kütüphanesinden GERÇEK adlar (çap adın SONUNDA) */
  const ADAYLAR = [
    { materialName: 'Sürgülü vana (OS&Y yükselen milli) · 175 psi · elastomer sitli · flanşlı · DN65', netPrice: 13838 },
    { materialName: 'Sürgülü vana (OS&Y yükselen milli) · 175 psi · elastomer sitli · flanşlı · DN80', netPrice: 15376 },
    { materialName: 'Sürgülü vana (OS&Y yükselen milli) · 175 psi · elastomer sitli · flanşlı · DN100', netPrice: 18291 },
    { materialName: 'Sürgülü vana (OS&Y yükselen milli) · 300 psi · elastomer sitli · flanşlı · DN65', netPrice: 15029 },
    { materialName: 'Sürgülü vana (NRS yükselmeyen milli) · 175 psi · elastomer sitli · flanşlı · DN150', netPrice: 25043 },
  ];

  it('PU2 hiçbir iki aday görsel olarak aynı değil', () => {
    const etiketler = adayEtiketleri(ADAYLAR);
    const gorunen = etiketler.map((e) => `${e.ayirtEdici}|${e.ad}`);
    expect(new Set(gorunen).size, `tekrar eden etiket: ${gorunen.join(' / ')}`).toBe(ADAYLAR.length);
  });

  it('PU3 ayırt edici alan (çap) ÖNDE ve tam yazılı', () => {
    const etiketler = adayEtiketleri(ADAYLAR);
    expect(etiketler[0].ayirtEdici).toContain('DN65');
    expect(etiketler[2].ayirtEdici).toContain('DN100');
  });

  it('PU3b ürün adı KESİLMEZ (60 karakter tuzağı)', () => {
    const etiketler = adayEtiketleri(ADAYLAR);
    for (let i = 0; i < ADAYLAR.length; i++) {
      expect(etiketler[i].ad, 'ad kısaltılmamalı').toBe(ADAYLAR[i].materialName);
    }
  });

  it('PU7 fark açıklanamıyorsa ayrı aday olarak sunulmaz, işaretlenir', () => {
    const ikiz = [
      { materialName: 'Kelebek vana · PN16 · DN100', netPrice: 100 },
      { materialName: 'Kelebek vana · PN16 · DN100', netPrice: 250 },
    ];
    const etiketler = adayEtiketleri(ikiz);
    expect(etiketler.some((e) => e.veriSorunu), 'aynı ad + farklı fiyat = veri sorunu işareti').toBe(true);
  });
});

/* PU4 — popup genişlik tercihi GERÇEKTEN hatırlanır.
 *
 * ONCE KIRMIZI (31.07): ExcelGrid `metaprice.adayPopupGenislik` anahtarını
 * yalnızca OKUYORDU; codebase'de o anahtara yazan TEK BİR SATIR yoktu
 * (`grep adayPopupGenislik` → 1 eşleşme, getItem). Yani kullanıcı popup'ı
 * genişletse de bir sonraki popup hep varsayılan genişlikte açılıyordu.
 * Bu blok, yazma halkasının sözleşmesidir. */
describe('PU4 — aday popup genişlik tercihi', () => {
  const sahteDepo = (baslangic: Record<string, string> = {}) => {
    const kv = { ...baslangic };
    return {
      kv,
      getItem: (k: string) => (k in kv ? kv[k] : null),
      setItem: (k: string, v: string) => { kv[k] = v; },
    };
  };

  it('PU4a kayıt yokken varsayılan genişlik döner', () => {
    expect(popupGenisligiOku(sahteDepo())).toBe(PU4_VARSAYILAN);
  });

  it('PU4b yazılan genişlik bir sonraki okumada aynen döner (asıl eksik halka)', () => {
    const d = sahteDepo();
    expect(popupGenisligiYaz(880, d), 'geçerli genişlik kaydedilmeli').toBe(true);
    expect(d.kv[PU4_ANAHTAR], 'anahtara GERÇEKTEN yazılmalı').toBe('880');
    expect(popupGenisligiOku(d)).toBe(880);
  });

  it('PU4c ondalık genişlik (getBoundingClientRect) yuvarlanarak saklanır', () => {
    const d = sahteDepo();
    popupGenisligiYaz(723.4, d);
    expect(popupGenisligiOku(d)).toBe(723);
  });

  it('PU4d asgarinin altı kaydedilmez — popup okunamaz hale gelmez', () => {
    const d = sahteDepo({ [PU4_ANAHTAR]: '900' });
    expect(popupGenisligiYaz(PU4_ASGARI - 1, d)).toBe(false);
    expect(popupGenisligiOku(d), 'önceki geçerli tercih korunur').toBe(900);
  });

  it('PU4e bozuk/dar kayıt varsayılana düşer', () => {
    expect(popupGenisligiOku(sahteDepo({ [PU4_ANAHTAR]: 'abc' }))).toBe(PU4_VARSAYILAN);
    expect(popupGenisligiOku(sahteDepo({ [PU4_ANAHTAR]: '120' }))).toBe(PU4_VARSAYILAN);
  });

  it('PU4f depo yoksa (SSR / private mode) çökmez', () => {
    expect(popupGenisligiOku(null)).toBe(PU4_VARSAYILAN);
    expect(popupGenisligiYaz(800, null)).toBe(false);
  });

  /* PU4g — BAGLANTI KAPISI. Yukaridaki testler yalniz yardimciyi sinar;
   * ExcelGrid yazma cagrisini kaybederse hepsi YESIL kalir ve tercih yine
   * hatirlanmaz (bu tuzagin adi: "testler yesil, gercek kirik"). Bu yuzden
   * popup'in olcum halkasi kaynak duzeyinde de dogrulanir. */
  it('PU4g ExcelGrid popup genişliğini gerçekten ölçüp kaydediyor', () => {
    const kaynak = fs.readFileSync(path.join(__dirname, 'ExcelGrid.tsx'), 'utf8');
    expect(kaynak, 'popup okuma halkasi').toContain('popupGenisligiOku(');
    expect(kaynak, 'popup YAZMA halkasi — eksikse tercih hic hatirlanmaz').toContain('popupGenisligiYaz(');
    expect(kaynak, 'CSS resize DOM olayi uretmez → ResizeObserver sart')
      .toMatch(/new ResizeObserver\([\s\S]{0,200}?popupGenisligiYaz\(/);
    expect(kaynak, 'olculecek elemana ref bagli olmali').toContain('ref={popupRef}');
  });

  /* PU4h — CANLI BULGU (31.07): kullanici "popup'ı genişletemiyorum" dedi.
   * Kok neden: `width` REACT KONTROLUNDE bir inline stil (`width: popupGenislik`),
   * ama CSS `resize` tarayicinin AYNI inline stile yazmasiyla calisir. Her
   * yeniden render React'in degerini geri yazip surüklemeyi SIFIRLIYORDU
   * (ozellikle "tip seçin" adimina gecerken). Setter de hic kullanilmiyordu,
   * yani React kullanicinin olcusunu asla ogrenmiyordu.
   * Sozlesme: olcu STATE'e geri yazilmali ki React'in degeri ekrandakiyle
   * ayni kalsin. */
  it('PU4h ResizeObserver ölçüyü state’e geri yazar (yoksa genişletme geri sıçrar)', () => {
    const kaynak = fs.readFileSync(path.join(__dirname, 'ExcelGrid.tsx'), 'utf8');
    expect(kaynak, 'setter tanımlı olmalı — [popupGenislik] tek başına yetmez')
      .toMatch(/\[\s*popupGenislik\s*,\s*setPopupGenislik\s*\]/);
    expect(kaynak, 'ResizeObserver ölçüyü state’e yazmalı')
      .toMatch(/new ResizeObserver\([\s\S]{0,400}?setPopupGenislik\(/);
  });
});
