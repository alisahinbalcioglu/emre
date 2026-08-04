/**
 * K1 — SUNUCU HATA METNI KULLANICIYA ULASMALI
 *   npx vitest run ozellik/kutuphane/hata-metni.test.ts
 *
 * ── KUSUR (olculdu) ────────────────────────────────────────────────────────
 * `materials/mechanical/page.tsx` ve `materials/electrical/page.tsx` marka
 * silmeyi ciplak `catch { ... 'Marka silinirken hata olustu.' }` ile
 * karsiliyordu. Backend `brands.service.remove` ekonomi (iskonto/ozel fiyat)
 * tasiyan satir varsa 409 atiyor ve mesajinda GERCEK rakamlari + nasil
 * onaylanacagini yaziyor. O mesaj `catch {` icinde bir isim bile almadigi icin
 * ekrana ULASAMIYORDU: silme dogru sekilde duruyor ama kullanici NE oldugunu
 * ve NASIL devam edecegini goremiyor — fiilen sessiz basarisizlik.
 *
 * DOGRU DESEN AYNI REPODA: `app/admin/brands/page.tsx:229`
 *   `e?.response?.data?.message ?? 'Marka silinemedi'`
 * Bu dosya o deseni SAF FONKSIYONA alir (jsdom kurulu degil, vitest ortami
 * `node` — sayfa JSX'i oldugu yerde test edilemez; `lib/silme-onay-metni.ts`
 * ve `lib/indeks-sagligi.ts` ile ayni gerekce).
 *
 * BU TEST KIRMIZI OLMAK ICIN YAZILDI (`ozellik/kutuphane/hata-metni.ts` henuz yok).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { hataMetni } from './hata-metni';

/** Backend `brands.service.ts:202-207` 409 metninin BIREBIR kopyasi. */
const GERCEK_409 =
  '"CAYIROVA" markasi silinirse 4 kutuphane satiri (2 kullaniciya ait) kaldirilacak; ' +
  'bunlarin 3 tanesi girilmis fiyat bilgisi tasiyor (2 iskonto). Bu bilgi geri getirilemez. ' +
  'Devam etmek icin silme istegini onay ile tekrarlayin (?onaylandi=true).';

const cakisma409 = { response: { status: 409, data: { statusCode: 409, message: GERCEK_409 } } };
/** Nest ValidationPipe mesaji DIZI doner — birlestirilmezse "[object Object]" olur. */
const dogrulama400 = { response: { status: 400, data: { message: ['ad bos olamaz', 'discipline gecersiz'] } } };
/** Sunucu bos metin dondu — "Hata: " diye bos bir toast gostermek kusurun kendisi. */
const bosMesaj = { response: { status: 500, data: { message: '   ' } } };
/** Ag koptu: axios `response` bile uretmez. */
const agHatasi = Object.assign(new Error('Network Error'), { response: undefined });

const VARSAYILAN = 'Marka silinirken hata olustu.';

describe('★ BOS-KUME KAPISI — fixture GERCEKTEN dolu mu', () => {
  // Fixture bos olsaydi asagidaki "mesaj aynen doner" assert'i hicbir sey
  // olcmeden gecerdi. Uc kriter AYRI AYRI kanitlanir.
  it('409 fixture mesaji bos degil', () => {
    expect(GERCEK_409.length).toBeGreaterThan(0);
  });
  it('409 fixture mesaji GERCEK rakam tasiyor (kullanicinin gormesi gereken sey)', () => {
    expect(GERCEK_409).toContain('4 kutuphane satiri');
  });
  it('409 fixture mesaji NASIL onaylanacagini soyluyor', () => {
    expect(GERCEK_409).toContain('onaylandi=true');
  });
  it('dogrulama fixture dizisi bos degil', () => {
    expect(dogrulama400.response.data.message.length).toBeGreaterThan(0);
  });
});

describe('K1-a — sunucunun yazdigi mesaj AYNEN kullaniciya gider', () => {
  it('409 metni birebir doner', () => {
    expect(hataMetni(cakisma409, VARSAYILAN)).toBe(GERCEK_409);
  });
  it('409 durumunda varsayilan metin KULLANILMAZ (eski davranisin mühürü)', () => {
    // Kusurun tam olarak bu idi: gercek mesaj yerine sabit cumle gosteriliyordu.
    expect(hataMetni(cakisma409, VARSAYILAN)).not.toContain(VARSAYILAN);
  });
});

describe('K1-b — dizi mesaj (Nest ValidationPipe) birlestirilir', () => {
  const m = hataMetni(dogrulama400, VARSAYILAN);
  it('birinci dogrulama maddesi metinde gecer', () => {
    expect(m).toContain('ad bos olamaz');
  });
  it('ikinci dogrulama maddesi metinde gecer', () => {
    expect(m).toContain('discipline gecersiz');
  });
  it('ham dizi damgasi ("[object" / virgul-yapistirma) sizmaz', () => {
    expect(m).not.toContain('[object');
  });
});

describe('K1-c — mesaj YOKSA varsayilan; ASLA bos toast', () => {
  it('sadece bosluktan olusan mesaj varsayilana duser', () => {
    expect(hataMetni(bosMesaj, VARSAYILAN)).toBe(VARSAYILAN);
  });
  it('ag hatasinda (response yok) varsayilana duser', () => {
    expect(hataMetni(agHatasi, VARSAYILAN)).toBe(VARSAYILAN);
  });
  it('null hata nesnesinde varsayilana duser', () => {
    expect(hataMetni(null, VARSAYILAN)).toBe(VARSAYILAN);
  });
  it('mesaj alani sayi gibi beklenmedik bir tip ise varsayilana duser', () => {
    expect(hataMetni({ response: { data: { message: 42 } } }, VARSAYILAN)).toBe(VARSAYILAN);
  });
});

// ── KAYNAK-SEVIYESI KILIT ────────────────────────────────────────────────
// Saf fonksiyon dogru olsa da sayfa onu CAGIRMAZSA kullanici yine hicbir sey
// gormez. jsdom yok; `lib/gs6b-golge-kurali.test.ts` ile ayni desen: kural
// kaynak taramasiyla kilitlenir. (Bu, davranis assert'inin yerine gecmez.)

/** Bir fonksiyonun govdesini kaba ama yeterli bicimde ayikla. */
function govde(kaynak: string, imza: string): string {
  const bas = kaynak.indexOf(imza);
  if (bas < 0) return '';
  let derinlik = 0, i = kaynak.indexOf('{', bas);
  const basla = i;
  for (; i < kaynak.length; i++) {
    if (kaynak[i] === '{') derinlik++;
    else if (kaynak[i] === '}') { derinlik--; if (derinlik === 0) return kaynak.slice(basla, i + 1); }
  }
  return '';
}

/** IKI AILE: mekanik ve elektrik havuz sayfalari — fix ikisinde de gecerli olmali. */
const SAYFALAR: Array<[string, string]> = [
  ['mekanik havuz', '../../app/(protected)/materials/mechanical/page.tsx'],
  ['elektrik havuz', '../../app/(protected)/materials/electrical/page.tsx'],
];

describe('K1-d — silme akisi iki sayfada da sunucu mesajini gosterir', () => {
  for (const [ad, yol] of SAYFALAR) {
    const kaynak = fs.readFileSync(path.resolve(__dirname, yol), 'utf-8');
    const silme = govde(kaynak, 'async function handleDeleteBrand');

    describe(ad, () => {
      it('silme fonksiyonu bulunabildi (bos-kume kapisi)', () => {
        expect(silme.length).toBeGreaterThan(0);
      });
      it('ciplak `catch {` YOK — hata nesnesi bir isim aliyor', () => {
        expect(silme).not.toContain('catch {');
      });
      it('hata metni ortak saf fonksiyondan uretiliyor', () => {
        expect(silme).toContain('hataMetni(');
      });
      it('bilgilendirilmis onay `?onaylandi=true` olarak gonderiliyor', () => {
        // 409 yalniz gorunur olmakla kalmaz; kullanici onaylayabilmeli.
        expect(silme).toContain('onaylandi=true');
      });
      it('onay metni ortak `silmeOnayMetni` kaynagindan geliyor (metin ikizlenmesin)', () => {
        expect(silme).toContain('silmeOnayMetni(');
      });
    });
  }
});
