/**
 * EKİP LİSTESİ KİŞİ HÜCRESİ — saf karar + EKRANA BAĞLANTI.
 *
 * Ölçülen kusur (21.09.2026): ad boşken hücre e-postayı İKİ KEZ basıyordu
 * ("a@b.coma@b.com"). İki bağımsız yer aynı değeri yazıyordu; bu yüzden test
 * yalnız fonksiyonu değil, EKRANIN bu fonksiyonu kullandığını da ölçer —
 * fonksiyon doğru olup çağıran eski desende kalırsa kusur geri gelir.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { basHarfler, firmaYoneticileri, uyeSatirMetni, yoneticiEpostasi } from './kisi-metinleri';

const KOK = path.join(__dirname, '../../..');
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), 'utf8');
/** Yorumları at: kapı YORUMDA değil KODDA eşleşsin. */
const kodu = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const EPOSTA = 'emre.basarann1@gmail.com';

describe('uyeSatirMetni — dört hâl', () => {
  it('AD VAR → üstte ad, altta e-posta', () => {
    const m = uyeSatirMetni({ ad: 'Emre', soyad: 'Başaran', eposta: EPOSTA });
    expect(m.baslik).toBe('Emre Başaran');
    expect(m.altSatir).toBe(EPOSTA);
  });

  it('⭐ AD BOŞ → e-posta BİR kez (ikinci satır YOK)', () => {
    const m = uyeSatirMetni({ ad: null, soyad: null, eposta: EPOSTA });
    expect(m.baslik).toBe(EPOSTA);
    expect(m.altSatir).toBeNull();
    // Kusurun kendisi: iki parçanın birleşimi e-postayı iki kez içermemeli.
    expect(`${m.baslik}${m.altSatir ?? ''}`).toBe(EPOSTA);
  });

  it('⭐ AD BOŞLUK KARAKTERİ → e-posta BİR kez ("   " ad sayılmaz)', () => {
    const m = uyeSatirMetni({ ad: '   ', soyad: '\t', eposta: EPOSTA });
    expect(m.baslik).toBe(EPOSTA);
    expect(m.altSatir).toBeNull();
  });

  it('⭐ AD E-POSTAYA EŞİT → e-posta BİR kez (kayıt adı e-postaya yazmışsa)', () => {
    const m = uyeSatirMetni({ ad: EPOSTA, soyad: '', eposta: EPOSTA });
    expect(m.baslik).toBe(EPOSTA);
    expect(m.altSatir).toBeNull();
  });

  it('AD E-POSTAYA EŞİT — büyük/küçük harf farkıyla da eşit sayılır', () => {
    const m = uyeSatirMetni({ ad: EPOSTA.toUpperCase(), eposta: EPOSTA });
    expect(m.altSatir).toBeNull();
  });

  it('⭐ eşitlik ASCII küçültmeyle kurulur (Türkçe locale "I"yı bozar)', () => {
    // İlk yazımda `toLocaleLowerCase('tr')` kullanılmıştı ve BU TEST düşürdü:
    // "GMAIL" → "gmaıl" olduğu için eşitlik kaçıyor, e-posta iki kez basılıyordu.
    // Kural sunucudaki `epostaKucult` ile aynı (backend/src/altyapi/auth/eposta.ts).
    expect('EMRE.BASARANN1@GMAIL.COM'.toLocaleLowerCase('tr')).not.toBe(EPOSTA); // ölçüt
    const m = uyeSatirMetni({ ad: 'EMRE.BASARANN1@GMAIL.COM', eposta: EPOSTA });
    expect(m.baslik).toBe(EPOSTA);
    expect(m.altSatir).toBeNull();
  });

  it('yalnız ad ya da yalnız soyad da ADDIR', () => {
    expect(uyeSatirMetni({ ad: 'Emre', soyad: null, eposta: EPOSTA }).baslik).toBe('Emre');
    expect(uyeSatirMetni({ ad: '', soyad: 'Başaran', eposta: EPOSTA }).baslik).toBe('Başaran');
  });

  it('ad/soyad kenar boşlukları kırpılır, araya TEK boşluk girer', () => {
    expect(uyeSatirMetni({ ad: '  Emre ', soyad: ' Başaran  ', eposta: EPOSTA }).baslik)
      .toBe('Emre Başaran');
  });

  it('e-posta yoksa boş alt satır çizdirilmez', () => {
    const m = uyeSatirMetni({ ad: 'Emre', eposta: null });
    expect(m.baslik).toBe('Emre');
    expect(m.altSatir).toBeNull();
  });

  it('hiç bilgi yoksa da iki satır AYNI değeri taşımaz', () => {
    const m = uyeSatirMetni({ ad: null, soyad: null, eposta: null });
    expect(m.altSatir).toBeNull();
  });
});

describe('basHarfler — avatar (tasarım: "MM", "AT"; yönetici tek harf "E")', () => {
  it('e-postanın @ öncesi noktadan bölünür', () => {
    expect(basHarfler({ eposta: 'mehmet.muhendis@firma.com' })).toBe('MM');
    expect(basHarfler({ eposta: 'selin.satinalma@firma.com' })).toBe('SS');
    expect(basHarfler({ eposta: 'ayse.teknik@firma.com' })).toBe('AT');
  });
  it('yönetici avatarı TEK harf (kenar çubuğundaki kendi avatarınla aynı)', () => {
    expect(basHarfler({ eposta: 'emre.basarann1@gmail.com' }, 1)).toBe('E');
  });
  it('ad varsa ad + soyad; boşluk-yalnızca ad sayılmaz', () => {
    expect(basHarfler({ ad: 'Emre', soyad: 'Başaran', eposta: EPOSTA })).toBe('EB');
    expect(basHarfler({ ad: '  ', soyad: null, eposta: 'ali_veli@x.com' })).toBe('AV');
  });
  it('büyütme Türkçe: "ilker" → "İ"; sembol atlanır; girdi yoksa "?"', () => {
    expect(basHarfler({ eposta: 'ilker.ozturk@x.com' })).toBe('İO');
    expect(basHarfler({ eposta: '_.ceren@x.com' })).toBe('C');
    expect(basHarfler({ eposta: null })).toBe('?');
  });
});

describe('yoneticiEpostasi — üyenin "Firma yöneticin" adresi', () => {
  it('rol AÇIKÇA aranır: ilk satır yönetici olmasa da yönetici bulunur', () => {
    expect(yoneticiEpostasi([
      { eposta: 'uye@x.com', firmaRol: 'uye' },
      { eposta: 'yonetici@x.com', firmaRol: 'sahip' },
    ])).toBe('yonetici@x.com');
  });
  it('yönetici yoksa ya da liste gelmediyse null (boş mailto çizilmez)', () => {
    expect(yoneticiEpostasi([{ eposta: 'uye@x.com', firmaRol: 'uye' }])).toBeNull();
    expect(yoneticiEpostasi(undefined)).toBeNull();
  });
  it('kanca bu kararı kullanıyor (ikinci bir seçim yazılmadı)', () => {
    const kanca = kodu(oku('ozellik/firma/ekip/useFirmaYoneticisi.ts'));
    expect(kanca).toContain('setEposta(yoneticiEpostasi(data?.uyeler));');
    expect(kanca).not.toContain("firmaRol === 'sahip'");
  });
});

describe('firmaYoneticileri — yönetici kuralı TEK yerde', () => {
  const UYELER = [
    { id: '1', eposta: 'uye@x.com', firmaRol: 'uye' },
    { id: '2', eposta: 'y1@x.com', firmaRol: 'sahip' },
    { id: '3', eposta: 'y2@x.com', firmaRol: 'sahip' },
  ];

  it('bütün yöneticiler, listedeki sırayla (birden çok yönetici olabilir)', () => {
    expect(firmaYoneticileri(UYELER).map((u) => u.id)).toEqual(['2', '3']);
  });

  it('yönetici yoksa ya da liste gelmediyse boş dizi', () => {
    expect(firmaYoneticileri([{ firmaRol: 'uye' }])).toEqual([]);
    expect(firmaYoneticileri(undefined)).toEqual([]);
    expect(firmaYoneticileri(null)).toEqual([]);
  });

  it('FAIL-CLOSED: bilinmeyen / boş rol yönetici SAYILMAZ (yalnız tam `sahip`)', () => {
    expect(firmaYoneticileri([{ firmaRol: '' }, { firmaRol: 'SAHIP' }, { firmaRol: 'yonetici' }])).toEqual([]);
  });

  it('⭐ `yoneticiEpostasi` bu kuralın İLKİ: iki ekran aynı kişiyi gösterir', () => {
    expect(yoneticiEpostasi(UYELER)).toBe(firmaYoneticileri(UYELER)[0].eposta);
    expect(kodu(oku('ozellik/firma/ekip/kisi-metinleri.ts'))).toContain('return firmaYoneticileri(uyeler)[0]?.eposta ?? null;');
  });
});

describe('⭐ BAĞLANTI — üye listesi bu kararı kullanıyor', () => {
  // 23.09.2026 ikinci tasarım: izin sütunlu tablo (`EkipTablosu.tsx`) etiketli
  // üye listesine dönüştü (`UyeListesi.tsx`, git mv). Öncül "tablo" çürüdü;
  // ölçüt kararın YENİ yerini okur ve sayfanın listeyi çizdiğini AYRICA ölçer.
  const sayfa = kodu(oku('app/(protected)/firma/ekip/page.tsx'));
  const tablo = kodu(oku('ozellik/firma/ekip/UyeListesi.tsx'));

  it('ÖLÇÜT: sayfa listeyi çiziyor, liste üyeleri dönüyor', () => {
    expect(sayfa).toContain('<UyeListesi');
    expect(sayfa).toContain('uyeler={veri.uyeler}');
    expect(tablo).toContain('uyeler.map(');
  });

  it('saf fonksiyon içe aktarılıp çağrılıyor', () => {
    expect(tablo).toContain("from './kisi-metinleri'");
    expect(tablo).toContain('uyeSatirMetni(');
  });

  it('⭐ ESKİ İKİZ KARAR (`gorunenAd`) KALMADI', () => {
    for (const kod of [sayfa, tablo]) {
      expect(kod).not.toContain('gorunenAd');
      expect(kod).not.toContain("join(' ').trim() || u.eposta");
    }
  });

  it('⭐ e-posta hücrede KOŞULSUZ basılmıyor (kusurun kendisi)', () => {
    // Eski hâl: `{gorunenAd(u)}<span …>{u.eposta}</span>` — span koşulsuzdu.
    expect(tablo).not.toMatch(/>\{u\.eposta\}</);
    expect(tablo).toContain('kisi.altSatir &&');
  });

  it('avatar harfleri aynı saf karardan (yönetici tek harf)', () => {
    expect(tablo).toContain('basHarfler(u, yonetici ? 1 : 2)');
  });
});
