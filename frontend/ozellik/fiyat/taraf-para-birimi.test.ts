/**
 * COKLU PARA BIRIMI F2a (Emre karari 04.10) — taraf para birimi saf kurallari.
 *
 * Para birimi SATIR degil TARAF basinadir (malzeme $ + iscilik ₺ ayni satirda).
 * Karar 1: karma satirin Toplam hucresi iki tutari yan yana gosterir.
 * Karar 3: elle yazilan fiyat tarafin MEVCUT birimini korur; "$12"/"₺12"/"€12"
 *          yazimi birimi secer.
 * Karar 4: doviz 2 hane YUKARI (₺ kurali 1 hane, DEGISMEZ).
 */
import { describe, it, expect } from 'vitest';
import {
  paraHanesi, tarafPB, karmaToplamMetni, elleGirilenPB, PARA_SEMBOLU, paraIsaretiniAyikla, netFiyatBiriminde,
  dovizliTarafVarMi, dovizliSatirVarMi, digerSayfalardaDovizVar, karisikKipMi, balonTutari, adayFiyatEtiketi,
} from './taraf-para-birimi';
import { hesaplaSatisBirimFiyat, hesaplaSatirToplam } from './pricing';

describe('paraHanesi — Emre karari 4', () => {
  it('★ TRY 1 hane (bugunku kural), USD/EUR 2 hane', () => {
    expect(paraHanesi('TRY')).toBe(1);
    expect(paraHanesi('USD')).toBe(2);
    expect(paraHanesi('EUR')).toBe(2);
  });
  it('birim yoksa TRY (eski satirlar birim tasimaz)', () => {
    expect(paraHanesi(undefined)).toBe(1);
    expect(paraHanesi(null)).toBe(1);
  });
});

describe('hesaplaSatisBirimFiyat / hesaplaSatirToplam — hane parametresi', () => {
  it('★★ KONTROL: hane verilmezse ₺ kurali BIREBIR ayni (1 hane yukari)', () => {
    expect(hesaplaSatisBirimFiyat(100, 12.345)).toBe(112.4);
    expect(hesaplaSatirToplam(12.31, 3)).toBe(37);
  });
  it('★ dovizde 2 hane YUKARI: 100 × 1,12345 = 112,345 → 112,35', () => {
    expect(hesaplaSatisBirimFiyat(100, 12.345, 2)).toBe(112.35);
  });
  it('★ doviz satir toplami 2 hane: 12,31 × 3 = 36,93 (₺ kurali 37 derdi)', () => {
    expect(hesaplaSatirToplam(12.31, 3, 2)).toBe(36.93);
  });
});

describe('tarafPB — satirdan tarafin birimi', () => {
  it('★ malzeme ve iscilik AYRI okunur', () => {
    const d = { _matPB: 'USD', _labPB: 'TRY' };
    expect(tarafPB(d, 'malzeme')).toBe('USD');
    expect(tarafPB(d, 'iscilik')).toBe('TRY');
  });
  it('alan yoksa ya da taninmiyorsa TRY', () => {
    expect(tarafPB({}, 'malzeme')).toBe('TRY');
    expect(tarafPB({ _matPB: 'GBP' }, 'malzeme')).toBe('TRY');
    expect(tarafPB(null, 'iscilik')).toBe('TRY');
  });
});

describe('karmaToplamMetni — Emre karari 1', () => {
  it('★★ farkli birim: iki tutar yan yana', () => {
    expect(karmaToplamMetni(1200, 'USD', 450, 'TRY')).toBe('$1.200,00 + ₺450,00');
  });
  it('★ ayni birim: tek toplam (kurus katmaninda)', () => {
    expect(karmaToplamMetni(100.1, 'USD', 0.2, 'USD')).toBe('$100,30');
    expect(karmaToplamMetni(1200, 'TRY', 450, 'TRY')).toBe('₺1.650,00');
  });
  it('★ bos taraf yazilmaz', () => {
    expect(karmaToplamMetni(1200, 'USD', null, 'TRY')).toBe('$1.200,00');
    expect(karmaToplamMetni(null, 'USD', 450, 'TRY')).toBe('₺450,00');
    expect(karmaToplamMetni(0, 'USD', 450, 'TRY')).toBe('₺450,00');
  });
  it('iki taraf da bossa null', () => {
    expect(karmaToplamMetni(null, 'USD', null, 'TRY')).toBeNull();
    expect(karmaToplamMetni(0, 'USD', 0, 'TRY')).toBeNull();
  });
  it('EUR sembolu', () => {
    expect(karmaToplamMetni(10, 'EUR', 5, 'USD')).toBe('€10,00 + $5,00');
    expect(PARA_SEMBOLU.EUR).toBe('€');
  });
});

describe('elleGirilenPB — Emre karari 3', () => {
  it('★ sembol ya da kod birimi secer', () => {
    expect(elleGirilenPB('$12')).toBe('USD');
    expect(elleGirilenPB('12 $')).toBe('USD');
    expect(elleGirilenPB('USD 12,5')).toBe('USD');
    expect(elleGirilenPB('€12')).toBe('EUR');
    expect(elleGirilenPB('12 EUR')).toBe('EUR');
    expect(elleGirilenPB('₺12')).toBe('TRY');
    expect(elleGirilenPB('12 TL')).toBe('TRY');
  });
  it('★ duz sayi birim SECMEZ (tarafin mevcut birimi korunur)', () => {
    expect(elleGirilenPB('12')).toBeNull();
    expect(elleGirilenPB('1.250,50')).toBeNull();
    expect(elleGirilenPB('')).toBeNull();
  });
  it('birden cok birim yazilmissa SECMEZ (tahmin yok)', () => {
    expect(elleGirilenPB('$12 TL')).toBeNull();
  });
});

describe('paraIsaretiniAyikla — elle girisin sayi kismi', () => {
  it('★ sembol ve kod ayiklanir, sayi yazimi KORUNUR', () => {
    expect(paraIsaretiniAyikla('$12')).toBe('12');
    expect(paraIsaretiniAyikla('12,5 TL')).toBe('12,5');
    expect(paraIsaretiniAyikla('€ 1.250,50')).toBe('1.250,50');
    expect(paraIsaretiniAyikla('USD 9.99')).toBe('9.99');
  });
  it('isaretsiz metin aynen', () => {
    expect(paraIsaretiniAyikla('15')).toBe('15');
  });
});

// ── KUTUPHANE NETI (05.10, P2 notu): kutuphane ekraninin "Net Fiyat" kolonu dovizli
// satirda da ₺ kuraliyla (1 hane yukari) yuvarliyordu; motorun kaynak neti (F1
// `kaynakFiyat`) ve TL neti (P2 C6) dovizde 2 hane. Kural TEK yerde: satirin
// birimine gore TRY → hesaplaNetFiyat, USD/EUR → hesaplaNetFiyatDoviz (arka uc ikizi).
describe('netFiyatBiriminde — kutuphane neti satirin biriminde', () => {
  it('USD/EUR 2 hane YUKARI (1 hane degil)', () => {
    expect(netFiyatBiriminde(10.55, 0, 'USD')).toBe(10.55);
    expect(netFiyatBiriminde(10.551, 0, 'EUR')).toBe(10.56);
    expect(netFiyatBiriminde(3354.64, 10, 'USD')).toBe(3019.18);
  });
  it('KONTROL: TRY ve birimsiz satir BUGUNKU kural (1 hane yukari)', () => {
    expect(netFiyatBiriminde(10.55, 0, 'TRY')).toBe(10.6);
    expect(netFiyatBiriminde(3354.64, 10, undefined)).toBe(3019.2);
    expect(netFiyatBiriminde(10.55, 0, 'GBP')).toBe(10.6); // taninmayan birim tahmin edilmez → ₺ kurali
  });
  it('iskonto sinirlanir (0-100), ayni formul', () => {
    expect(netFiyatBiriminde(100, 150, 'USD')).toBe(0);
    expect(netFiyatBiriminde(100, -5, 'USD')).toBe(100);
  });
});

// ══ F6a — GORUNUM KURALI: birim basina gorunum YALNIZ dovizli taraf varken ═══
// Karar K1 (05.10, Emre'nin onerilen onayi): karisik = YAZIM yetenegi ($ liste
// fiyati $ kalir); birim basina GORUNUM (ekran toplamlari, fiyatli Excel, İCMAL)
// yalniz $/€ taraf varken. Yalniz-₺ karisik teklif TL teklifle bayt bayt ayni
// gorunur — "yeni teklif karisik" ile "yalniz-TL teklifin ekrani ve Excel'i
// ayni" ancak boyle birlikte tutar. IKIZ: arka uc `cikti-karisik.ts`
// `dovizliTarafVarMi` (test:ex-karisik KR0 ayni girdilerle karsilastirir).
describe('dovizliTarafVarMi — F6a gorunum kurali', () => {
  it('$ ya da € tarafi olan satir → dovizli', () => {
    expect(dovizliSatirVarMi([{ _matPB: 'USD' }])).toBe(true);
    expect(dovizliSatirVarMi([{ _labPB: 'EUR' }])).toBe(true);
    expect(dovizliTarafVarMi([{ rowData: [{ _matPB: 'TRY' }] }, { rowData: [{ _labPB: 'USD' }] }])).toBe(true);
  });
  it('yalniz ₺ birimli karisik satirlar DOVIZLI DEGIL (TL gibi gorunur) — yazim kipi yine karisik', () => {
    const satirlar = [{ _matPB: 'TRY', _labPB: 'TRY' }, { _matPB: 'TRY' }];
    expect(dovizliSatirVarMi(satirlar)).toBe(false);
    expect(karisikKipMi([{ rowData: satirlar }])).toBe(true); // KONTROL: yazim kipi ayri kural
  });
  it('fitting birim parcalarinda doviz → dovizli; yalniz ₺ parca → degil', () => {
    expect(dovizliSatirVarMi([{ _fitting: { kapsam: [1] }, _fittingBirimli: { mat: [{ pb: 'TRY', toplam: 5 }], lab: [{ pb: 'USD', toplam: 1 }] } }])).toBe(true);
    expect(dovizliSatirVarMi([{ _fitting: { kapsam: [1] }, _fittingBirimli: { mat: [{ pb: 'TRY', toplam: 5 }], lab: [] } }])).toBe(false);
  });
  it('gecersiz birim, alan yok, bos/null sayfa → dovizli degil', () => {
    expect(dovizliSatirVarMi([{ _matPB: 'GBP' }, { _matBirim: '5' }, null as any])).toBe(false);
    expect(dovizliTarafVarMi([{ rowData: null }, { rowData: [] }])).toBe(false);
    expect(dovizliTarafVarMi(null)).toBe(false);
  });
  it('bozuk fitting kaydi (dizi olmayan mat/lab) COKERTMEZ (inceleme L4)', () => {
    expect(() => dovizliSatirVarMi([{ _fittingBirimli: { mat: 5, lab: { pb: 'USD' } } }])).not.toThrow();
    expect(dovizliSatirVarMi([{ _fittingBirimli: { mat: 5, lab: { pb: 'USD' } } }])).toBe(false);
  });
});

describe('digerSayfalardaDovizVar — aktif sayfa DISINDAKI sayfalar (sayfa izgaraya gecirir)', () => {
  const sayfalar = [
    { index: 0, rowData: [{ _matPB: 'TRY' }] },
    { index: 1, rowData: [{ _matPB: 'USD' }] },
    { index: 2, rowData: [{ _labPB: 'TRY' }] },
  ];
  it('aktif sayfanin kendi dovizi SAYILMAZ (izgara onu canli olcer)', () => {
    expect(digerSayfalardaDovizVar(sayfalar, 1)).toBe(false);
  });
  it('baska sayfada $ varsa aktif yalniz-₺ sayfa da birim basina gorunur', () => {
    expect(digerSayfalardaDovizVar(sayfalar, 0)).toBe(true);
    expect(digerSayfalardaDovizVar(sayfalar, 2)).toBe(true);
  });
  it('canli satirlar kayittakinin YERINE gecer (duzenlenmis sayfa)', () => {
    expect(digerSayfalardaDovizVar(sayfalar, 0, { 1: [{ _matPB: 'TRY' }] })).toBe(false);
    expect(digerSayfalardaDovizVar(sayfalar, 1, { 2: [{ _labPB: 'EUR' }] })).toBe(true);
  });
});

// ══ F6b — eslesme balonu tutari (hucreyle ayni birim) ══
describe('balonTutari — F6b', () => {
  const tl = (n: number) => `₺${n}`;
  it('★★ karisikta dovizli kaynak KENDI biriminde (2 hane)', () => {
    expect(balonTutari(420, { currency: 'USD', net: 10.5 }, true, tl)).toBe('$10,50');
    expect(balonTutari(500, { currency: 'EUR', net: 12 }, true, tl)).toBe('€12,00');
  });
  it('★ tl kipi, ₺ kaynak, kaynak yok ya da sayi olmayan net → bugunku TL gosterimi', () => {
    expect(balonTutari(420, { currency: 'USD', net: 10.5 }, false, tl)).toBe('₺420');
    expect(balonTutari(420, { currency: 'TRY', net: 420 }, true, tl)).toBe('₺420');
    expect(balonTutari(420, null, true, tl)).toBe('₺420');
    expect(balonTutari(420, { currency: 'USD', net: 'x' }, true, tl)).toBe('₺420');
    // izgarayla ayni: null ya da metin net (izgara ₺ yazar) → TL
    expect(balonTutari(420, { currency: 'USD', net: null }, true, tl)).toBe('₺420');
    expect(balonTutari(420, { currency: 'USD', net: '10.5' }, true, tl)).toBe('₺420');
  });
});

// ── F6b KARDES (06.10): aday / alternatif menusu fiyat etiketi ───────────────
// Menu karisik kipte secimin YAZACAGI birimde konusur (eslesme balonu kurali):
// "420.0 TL" deyip $10,50 yazmasin. tl kipinde etiket bayt bayt eski hali.
describe('adayFiyatEtiketi', () => {
  const usd = { currency: 'USD', net: 10.5 };
  it('karisik + dovizli kaynak: kaynak biriminde', () => {
    expect(adayFiyatEtiketi(420, usd, true)).toBe('$10,50');
  });
  it('tl kipi: eski etiket (1 hane, TL)', () => {
    expect(adayFiyatEtiketi(420, usd, false)).toBe('420.0 TL');
  });
  it('karisik ama ₺ kaynak: eski etiket', () => {
    expect(adayFiyatEtiketi(400, { currency: 'TRY', net: 400 }, true)).toBe('400.0 TL');
  });
  it('hane parametresi TL etiketine gecer (iscilik menusu 2 hane)', () => {
    expect(adayFiyatEtiketi(12.5, null, true, 2)).toBe("12.50 TL");
  });
});
