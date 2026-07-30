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
import { niteliklerdenBaglam, adayEtiketleri } from './aday-ayirt-edicilik';

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
