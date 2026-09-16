/**
 * DETAY EKRANI AÇILIŞ DİL KARARI (Faz 6.11, 15.09.2026).
 *
 * Tablonun her satırı ayrı `it` (bir assert tek kritere). Kilitlenen:
 *   · kayıt İngilizce değil ve işaretli satır yoksa istek ATILMAZ, Türkçe
 *   · ödenmiş + tam → İngilizce + harita; ödenmiş + eksik → harita YOK, bilgi notu
 *   · ödenmemiş → harita YOK; İngilizce dosya duracaksa (değişecek ya da
 *     karşılıksız satır) nedenli not, durmayacaksa not yok
 *   · HİÇBİR dalda otomatik 'tr' onarımı yok (kayıttaki 'en' korunur)
 */
import { describe, it, expect } from 'vitest';
import {
  EKSIK_NOTU,
  NEDEN_NOTLARI,
  YUKLENEMEDI_NOTU,
  acilisKarari,
  goruntulemeGerekirMi,
} from './teklif-dil-karari';
import type { GoruntulemeNedeni, GoruntulemeYaniti } from './ceviri-kota';

const HARITA = { 'PVC BORU': 'PVC PIPE' };
const TAM: GoruntulemeYaniti = { odenmis: true, tamam: true, kaynak: 'TUKETIM', harita: HARITA, satirSayisi: 3 };
const EKSIK: GoruntulemeYaniti = { odenmis: true, tamam: false, kaynak: 'GECIS', satirSayisi: 3, cevrilemeyenSatir: 1 };
const odenmemis = (neden: GoruntulemeNedeni, degisecekSatir: number, karsiliksizSatir = 0): GoruntulemeYaniti => ({
  odenmis: false, neden, satirSayisi: 3, degisecekSatir, karsiliksizSatir,
});

describe('goruntulemeGerekirMi', () => {
  it('kayıt tr ve işaretli satır yok → istek ATILMAZ', () => {
    expect(goruntulemeGerekirMi('tr', false)).toBe(false);
  });
  it('kayıt en → istenir', () => {
    expect(goruntulemeGerekirMi('en', false)).toBe(true);
  });
  it('kayıt tr ama işaretli satır var → istenir', () => {
    expect(goruntulemeGerekirMi('tr', true)).toBe(true);
  });
});

describe('acilisKarari — tablo satırları', () => {
  it('!L && !E → tr, harita yok, not yok, onarım yok', () => {
    expect(acilisKarari({ displayLanguage: 'tr', isaretliSatirVar: false, yanit: null, hata: false })).toEqual({ dil: 'tr', harita: null, not: null, dilOnar: false });
  });

  it('istek hatası, E yok → tr + "yüklenemedi" uyarısı, onarım yok', () => {
    expect(acilisKarari({ displayLanguage: 'en', isaretliSatirVar: false, yanit: null, hata: true })).toEqual({ dil: 'tr', harita: null, not: YUKLENEMEDI_NOTU, dilOnar: false });
  });

  it('istek hatası, E var → en (kayıttaki İngilizce hücreler) + uyarı', () => {
    const k = acilisKarari({ displayLanguage: 'en', isaretliSatirVar: true, yanit: null, hata: true });
    expect([k.dil, k.not]).toEqual(['en', YUKLENEMEDI_NOTU]);
  });

  it('ödenmiş + tam → en + harita, not yok; kayıt tr ise en onarımı', () => {
    expect(acilisKarari({ displayLanguage: 'tr', isaretliSatirVar: true, yanit: TAM, hata: false })).toEqual({ dil: 'en', harita: HARITA, not: null, dilOnar: true });
  });

  it('ödenmiş + tam, kayıt zaten en → onarım yok', () => {
    expect(acilisKarari({ displayLanguage: 'en', isaretliSatirVar: false, yanit: TAM, hata: false }).dilOnar).toBe(false);
  });

  it('ödenmiş + eksik, E yok → tr, harita YOK, bilgi notu (eylem CEVIR)', () => {
    const k = acilisKarari({ displayLanguage: 'en', isaretliSatirVar: false, yanit: EKSIK, hata: false });
    expect(k).toEqual({ dil: 'tr', harita: null, not: EKSIK_NOTU, dilOnar: false });
    expect([EKSIK_NOTU.tur, EKSIK_NOTU.eylem]).toEqual(['bilgi', 'CEVIR']);
  });

  it('ödenmiş + eksik, E var, kayıt tr → en (kayıttaki İngilizce) harita YOK, en onarımı', () => {
    expect(acilisKarari({ displayLanguage: 'tr', isaretliSatirVar: true, yanit: EKSIK, hata: false })).toEqual({ dil: 'en', harita: null, not: EKSIK_NOTU, dilOnar: true });
  });

  const NEDENLER: GoruntulemeNedeni[] = ['ICERIK_DEGISTI', 'CEVIRI_YOK', 'CEVIRI_SURUYOR'];

  it.each(NEDENLER)('ödenmemiş (%s), değişecek > 0 → nedenli not, harita YOK', (neden) => {
    expect(acilisKarari({ displayLanguage: 'en', isaretliSatirVar: false, yanit: odenmemis(neden, 3), hata: false })).toEqual({ dil: 'tr', harita: null, not: NEDEN_NOTLARI[neden], dilOnar: false });
  });

  it.each(NEDENLER)('ödenmemiş (%s), değişecek 0 ve karşılıksız 0 → not yok (ekran = dosya)', (neden) => {
    expect(acilisKarari({ displayLanguage: 'en', isaretliSatirVar: true, yanit: odenmemis(neden, 0), hata: false })).toEqual({ dil: 'en', harita: null, not: null, dilOnar: false });
  });

  it.each(NEDENLER)('ödenmemiş (%s), değişecek 0 ama karşılıksız > 0 → nedenli not (İngilizce dosya durur, Emre 15.09)', (neden) => {
    expect(acilisKarari({ displayLanguage: 'en', isaretliSatirVar: true, yanit: odenmemis(neden, 0, 2), hata: false }).not).toEqual(NEDEN_NOTLARI[neden]);
  });

  it('ödenmemiş, E var, kayıt tr → en (kayıttaki İngilizce) + en onarımı', () => {
    expect(acilisKarari({ displayLanguage: 'tr', isaretliSatirVar: true, yanit: odenmemis('CEVIRI_YOK', 2), hata: false })).toMatchObject({ dil: 'en', dilOnar: true });
  });

  it('neden notları: "süren" çeviride düğme yok, diğerlerinde çeviri düğmesi', () => {
    expect([NEDEN_NOTLARI.CEVIRI_SURUYOR.eylem, NEDEN_NOTLARI.ICERIK_DEGISTI.eylem, NEDEN_NOTLARI.CEVIRI_YOK.eylem]).toEqual([null, 'CEVIR', 'CEVIR']);
  });
});

describe('acilisKarari — hiçbir dalda Türkçe onarımı yok', () => {
  const yanitlar: Array<GoruntulemeYaniti | null> = [null, TAM, EKSIK, odenmemis('CEVIRI_YOK', 3), odenmemis('ICERIK_DEGISTI', 0), odenmemis('CEVIRI_SURUYOR', 0, 1)];
  const durumlar = yanitlar.flatMap((yanit) => [true, false].flatMap((hata) => ['tr', 'en'].flatMap((dl) => [true, false].map((E) => ({ yanit, hata, dl, E })))));

  it('kayıtta İngilizce satır varsa (E) görünüm hiçbir dalda Türkçeye düşmez', () => {
    const tr = durumlar.filter((d) => d.E).map((d) => acilisKarari({ displayLanguage: d.dl, isaretliSatirVar: d.E, yanit: d.yanit, hata: d.hata })).filter((k) => k.dil === 'tr');
    expect(tr).toEqual([]);
  });

  it('onarım yalnız İngilizce görünümde (dilOnar → dil en)', () => {
    const yanlis = durumlar.map((d) => acilisKarari({ displayLanguage: d.dl, isaretliSatirVar: d.E, yanit: d.yanit, hata: d.hata })).filter((k) => k.dilOnar && k.dil !== 'en');
    expect(yanlis).toEqual([]);
  });

  it('ödenmemiş ya da eksik yanıtta harita hiçbir dalda dönmez', () => {
    const haritali = durumlar
      .filter((d) => d.yanit && !(d.yanit.odenmis === true && d.yanit.tamam === true))
      .map((d) => acilisKarari({ displayLanguage: d.dl, isaretliSatirVar: d.E, yanit: d.yanit, hata: d.hata }))
      .filter((k) => k.harita !== null);
    expect(haritali).toEqual([]);
  });
});
