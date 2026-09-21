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
import { uyeSatirMetni } from './kisi-metinleri';

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

describe('⭐ BAĞLANTI — ekip tablosu bu kararı kullanıyor', () => {
  const sayfa = kodu(oku('app/(protected)/firma/ekip/page.tsx'));

  it('ÖLÇÜT: dosya okundu ve hâlâ üye tablosunu çiziyor', () => {
    expect(sayfa).toContain('veri.uyeler.map');
  });

  it('saf fonksiyon içe aktarılıp çağrılıyor', () => {
    expect(sayfa).toContain("from '@/ozellik/firma/ekip/kisi-metinleri'");
    expect(sayfa).toContain('uyeSatirMetni(');
  });

  it('⭐ ESKİ İKİZ KARAR (`gorunenAd`) KALMADI', () => {
    expect(sayfa).not.toContain('gorunenAd');
    expect(sayfa).not.toContain("join(' ').trim() || u.eposta");
  });

  it('⭐ e-posta hücrede KOŞULSUZ basılmıyor (kusurun kendisi)', () => {
    // Eski hâl: `{gorunenAd(u)}<span …>{u.eposta}</span>` — span koşulsuzdu.
    expect(sayfa).not.toMatch(/>\{u\.eposta\}</);
    expect(sayfa).toContain('kisi.altSatir &&');
  });
});
