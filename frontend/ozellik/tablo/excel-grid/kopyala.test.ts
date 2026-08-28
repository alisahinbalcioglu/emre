/**
 * PANO KOPYALAMA PLANLAYICISI — KILITLER (28.08.2026)
 *
 * Kaynak vaka (kullanici fotografi): kutuphanede ODE Teknik Yalitim listesi
 * acik, "Net Fiyat" kolonunda ₺53,30 / ₺64,60 / ₺80,10 duruyor. Kullanici bu
 * fiyati teklif gridindeki "Malz. Birim Fiyat" hucresine tasimak istiyor —
 * kopyalama yolu HIC yoktu (AG Grid clipboard = Enterprise, kayitli degil).
 *
 * En kritik kilit S7 GIDIS-DONUS: kopyalanan metin, YAPISTIRAN tarafta ayni
 * degerleri uretmezse ozellik yalanci calisir. Ozellikle "₺105.800,00" gibi
 * binlikli bicimler — `replace(',','.')` sinifi bir parser onu 105.8 okur
 * (BIN KAT yanlis, PK6). Bu yuzden donus `planYapistir` ile OLCULUR, gozle
 * degil.
 */
import { describe, it, expect } from 'vitest';
import { aralikKur, hucreMetni, planKopyala, type KopyaKolon, type KopyaSatir } from './kopyala';
import { planYapistir, type PasteKolon, type PasteSatir } from './yapistir';

// ── Kutuphane gridinin GORUNUR kolon dizilisi (library modu) ──
// Not: '_draftNetPrice' AG Grid'de `colId` ile tanimli (field yok) — kopyalama
// kolon KIMLIGI uzerinden calisir, o yuzden burada da colId adiyla durur.
const KUTUPHANE: KopyaKolon[] = [
  { field: 'col_ad' },
  { field: 'col_cins' },
  { field: 'col_cap' },
  { field: 'col_fiyat' },        // Liste Fiyat
  { field: '_draftDiscount' },   // Iskonto %
  { field: '_draftNetPrice' },   // Net Fiyat  ← kullanicinin kopyaladigi kolon
];
const NET = KUTUPHANE.findIndex((k) => k.field === '_draftNetPrice');

const VERI = (n: number): KopyaSatir[] => Array.from({ length: n }, () => ({ isDataRow: true }));

/** Kullanicinin ekranindaki Net Fiyat sutunu (fotograftaki gercek degerler). */
const NET_FIYATLAR = ['₺53,30', '₺64,60', '₺80,10', '₺105.800,00'];
const okuNet = (si: number, field: string) => (field === '_draftNetPrice' ? NET_FIYATLAR[si] : `${field}#${si}`);

describe('aralikKur — secim yonu onemsiz', () => {
  it('asagidan yukari secim de ayni araligi verir', () => {
    const asagi = aralikKur({ satir: 2, kolon: 5 }, { satir: 6, kolon: 3 });
    const yukari = aralikKur({ satir: 6, kolon: 3 }, { satir: 2, kolon: 5 });
    expect(asagi).toEqual({ satirBas: 2, satirSon: 6, kolonBas: 3, kolonSon: 5 });
    expect(yukari).toEqual(asagi);
  });
});

describe('hucreMetni — TSV ayiricilari hucre icinde kalamaz', () => {
  it('sekme ve satir sonu tek bosluga iner (cok satirli malzeme adi)', () => {
    expect(hucreMetni('Elastomerik kaucuk\nkopugu boru')).toBe('Elastomerik kaucuk kopugu boru');
    expect(hucreMetni('a\tb')).toBe('a b');
    expect(hucreMetni('a\r\n\r\nb')).toBe('a b');
  });
  it('bos deger bos string — "null" yazilmaz', () => {
    expect(hucreMetni(null)).toBe('');
    expect(hucreMetni(undefined)).toBe('');
    expect(hucreMetni('')).toBe('');
    expect(hucreMetni(0)).toBe('0'); // ⚠ sifir BOS DEGILDIR
  });
});

describe('planKopyala — kullanicinin senaryosu', () => {
  it('S1 ★ tek hucre: Net Fiyat ₺53,30 panoya GORUNEN haliyle gider', () => {
    const s = planKopyala(aralikKur({ satir: 0, kolon: NET }, { satir: 0, kolon: NET }), KUTUPHANE, VERI(4), okuNet);
    expect(s.metin).toBe('₺53,30');
    expect(s).toMatchObject({ hucreSayisi: 1, satirSayisi: 1 });
  });

  it('S2 ★ dikey blok: 3 Net Fiyat alt alta, satirlar \\n ile', () => {
    const s = planKopyala(aralikKur({ satir: 0, kolon: NET }, { satir: 2, kolon: NET }), KUTUPHANE, VERI(4), okuNet);
    expect(s.metin).toBe('₺53,30\n₺64,60\n₺80,10');
    expect(s.hucreSayisi).toBe(3);
    expect(s.metin.endsWith('\n')).toBe(false); // sonda bos satir URETILMEZ
  });

  it('S3 ★ iki boyutlu blok: kolonlar \\t ile (Iskonto + Net)', () => {
    // ⚠ FIXTURE GERCEGE HIZALI: Iskonto hucresi ekranda "%15" gorunur ama
    // okuyucu (`getCellValue useFormatter:true`) "15" doner — o kolon degeri
    // `cellRenderer` ile cizilir, `valueFormatter` ile DEGIL ve renderer
    // calistirilamaz. "%15" yazan bir fixture, uretimin ASLA uretemeyecegi
    // bir metni olcerdi (proje dersi: fixture dogru dali surmeli).
    // E2E KP9 bunu tarayicida dogruluyor: pano "0\t₺600,00".
    const oku = (si: number, f: string) => (f === '_draftNetPrice' ? NET_FIYATLAR[si] : '15');
    const s = planKopyala(aralikKur({ satir: 0, kolon: NET - 1 }, { satir: 1, kolon: NET }), KUTUPHANE, VERI(4), oku);
    expect(s.metin).toBe('15\t₺53,30\n15\t₺64,60');
    expect(s.hucreSayisi).toBe(4);
  });

  it('S4 ★ GRUP BANDI ATLANIR — bant icin bos TSV satiri URETILMEZ', () => {
    // Kutuphane teknik sinif bazli gruplanir; bantlar veri satiri DEGIL.
    const satirlar: KopyaSatir[] = [
      { isDataRow: true },   // 0 → ₺53,30
      { isDataRow: false },  // 1 → grup bandi
      { isDataRow: true },   // 2 → ₺80,10
    ];
    const oku = (si: number) => ['₺53,30', 'GRUP: Kaucuk', '₺80,10'][si];
    const s = planKopyala(aralikKur({ satir: 0, kolon: NET }, { satir: 2, kolon: NET }), KUTUPHANE, satirlar, oku);
    expect(s.metin).toBe('₺53,30\n₺80,10'); // ARADA BOS SATIR YOK
    expect(s.satirSayisi).toBe(2);
  });

  it('S5 secimde hic veri satiri yoksa bos sonuc (pano KIRLETILMEZ)', () => {
    const s = planKopyala(aralikKur({ satir: 0, kolon: NET }, { satir: 1, kolon: NET }),
      KUTUPHANE, [{ isDataRow: false }, { isDataRow: false }], okuNet);
    expect(s).toEqual({ metin: '', hucreSayisi: 0, satirSayisi: 0, doluHucreSayisi: 0 });
  });

  it('S5b ★ TUMU BOS hucre secimi PANOYU EZMEZ (bos string doner)', () => {
    // ⚠ `satirMetinleri.length > 0` kapisi YETMEZ: iki bos hucre ["",""] uretir
    // ve metin "\n" olur — bos string DEGILDIR. O kapiyla pano sessizce
    // silinir ve kullaniciya "2 hücre kopyalandı" denirdi; teklifte Ctrl+V
    // ise "Yapistirilacak deger bulunamadi" derdi (iki mesaj birbirini yalanlar).
    const s = planKopyala(aralikKur({ satir: 0, kolon: NET }, { satir: 1, kolon: NET }),
      KUTUPHANE, VERI(2), () => '');
    expect(s.metin).toBe('');
    expect(s.doluHucreSayisi).toBe(0);
  });

  it('S5c ★ KISMEN dolu secim kopyalanir; sayac DOLU hucreyi sayar', () => {
    // Geometri 3 hucre ama tasinan deger 2 — toast dolu sayiyi basmali,
    // yoksa "3 hücre kopyalandı" der ve kullanici eksik yapistirmayi fark etmez.
    const oku = (si: number) => (si === 1 ? '' : NET_FIYATLAR[si]);
    const s = planKopyala(aralikKur({ satir: 0, kolon: NET }, { satir: 2, kolon: NET }),
      KUTUPHANE, VERI(3), oku);
    expect(s.metin).toBe('₺53,30\n\n₺80,10');   // ARADAKI BOSLUK KORUNUR (hiza)
    expect(s.hucreSayisi).toBe(3);
    expect(s.doluHucreSayisi).toBe(2);
  });

  it('S6 kolon araligi grid sinirlarina kirpilir (tasan secim cokmez)', () => {
    const s = planKopyala({ satirBas: 0, satirSon: 0, kolonBas: NET, kolonSon: NET + 99 }, KUTUPHANE, VERI(1), okuNet);
    expect(s.metin).toBe('₺53,30');
    expect(s.hucreSayisi).toBe(1);
  });
});

describe('S7 ★ GIDIS-DONUS — kutuphaneden kopyala, teklife yapistir', () => {
  // Teklif gridinin gorunur kolonlari (standart-sema sirasi, yapistir.test ile ayni sinif)
  const TEKLIF: PasteKolon[] = [
    { field: '_ad', editable: true, sayisal: false },
    { field: '_miktar', editable: true, sayisal: true },
    { field: '_malzKar', editable: true, sayisal: true },
    { field: '_marka', editable: false, sayisal: false },
    { field: '_matBirim', editable: true, sayisal: true },
    { field: '_matToplam', editable: false, sayisal: true },
    { field: '_labBirim', editable: true, sayisal: true },
  ];
  const TEKLIF_SATIR = (n: number): PasteSatir[] => Array.from({ length: n }, () => ({ isDataRow: true }));

  it('MALZEME dali: Net Fiyat blogu → Malz. Birim Fiyat, SAYI olarak (BIN KAT tuzagi dahil)', () => {
    const kopya = planKopyala(aralikKur({ satir: 0, kolon: NET }, { satir: 3, kolon: NET }), KUTUPHANE, VERI(4), okuNet);
    const yapistir = planYapistir(kopya.metin, TEKLIF, '_matBirim', TEKLIF_SATIR(4));
    expect(yapistir.hucreler).toEqual([
      { satir: 0, field: '_matBirim', deger: 53.3 },
      { satir: 1, field: '_matBirim', deger: 64.6 },
      { satir: 2, field: '_matBirim', deger: 80.1 },
      { satir: 3, field: '_matBirim', deger: 105800 }, // ⚠ 105.8 DEGIL (PK6)
    ]);
    expect(yapistir.ozet.atlananSayiDegil).toBe(0);
  });

  it('ISCILIK dali: ayni metin İşç. Birim Fiyat kolonuna da AYNI degerleri yazar', () => {
    const kopya = planKopyala(aralikKur({ satir: 0, kolon: NET }, { satir: 2, kolon: NET }), KUTUPHANE, VERI(3), okuNet);
    const yapistir = planYapistir(kopya.metin, TEKLIF, '_labBirim', TEKLIF_SATIR(3));
    expect(yapistir.hucreler.map((h) => h.deger)).toEqual([53.3, 64.6, 80.1]);
    expect(yapistir.hucreler.every((h) => h.field === '_labBirim')).toBe(true);
  });

  it('★ BANTLI kaynak → yapistirmada HIZA KAYMAZ (S4 kuralinin bedeli olculur)', () => {
    // Kutuphanede 1. satir grup bandi; kopyada 2 veri satiri olmali ve teklifte
    // de ardisik 2 veri satirina inmeli. Bant icin bos satir uretilseydi
    // ikinci deger BIR SATIR ASAGI kayardi — sessiz para hatasi.
    const satirlar: KopyaSatir[] = [{ isDataRow: true }, { isDataRow: false }, { isDataRow: true }];
    const oku = (si: number) => ['₺53,30', 'GRUP', '₺80,10'][si];
    const kopya = planKopyala(aralikKur({ satir: 0, kolon: NET }, { satir: 2, kolon: NET }), KUTUPHANE, satirlar, oku);
    const yapistir = planYapistir(kopya.metin, TEKLIF, '_matBirim', TEKLIF_SATIR(3));
    expect(yapistir.hucreler).toEqual([
      { satir: 0, field: '_matBirim', deger: 53.3 },
      { satir: 1, field: '_matBirim', deger: 80.1 }, // 2 DEGIL — bos satir yok
    ]);
  });
});
