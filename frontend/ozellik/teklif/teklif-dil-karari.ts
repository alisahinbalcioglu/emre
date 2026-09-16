/**
 * DETAY EKRANI AÇILIŞ DİL KARARI (Faz 6.11, 15.09.2026) — saf, vitest'li.
 *
 * Detay ekranı kaydı DEĞİŞTİRMEZ; kayıttan türetilen görünümü çizer. Açılışta
 * hangi dilin gösterileceğini, haritanın kullanılıp kullanılmayacağını ve
 * kullanıcıya hangi notun düşüleceğini burası söyler; sayfa yalnız uygular.
 *
 * ⚠ OTOMATİK `'tr'` ONARIMI YOK (6.11 çürütücüsü): eskiden ödenmemiş İngilizce
 * teklif açılışta sessizce Türkçeye çevriliyor ve kayıttaki dil `'tr'` diye
 * PATCH'leniyordu — hem yalan not hem de geçiş betiğinin ölçtüğü sinyalin
 * silinmesi. Kayıttaki `'en'` yalnız kullanıcı "Türkçeye Dön"e basınca değişir.
 *
 * ⚠ NOT YALAN SÖYLEMEZ (Emre 15.09 "tam değilse çevirmesin"): İngilizce dosya
 * değişecek satırda da karşılıksız satırda da durur; ekran bu durumda sessiz
 * kalmaz (sayılar sunucudan, `GET /ai/translate/goruntule`).
 */
import type { CeviriHaritasi } from './ceviri';
import type { GoruntulemeNedeni, GoruntulemeYaniti } from './ceviri-kota';

export interface DilNotu {
  tur: 'bilgi' | 'uyari';
  baslik: string;
  metin: string;
  /** 'CEVIR' → notun içinde çeviri düğmesi. */
  eylem: 'CEVIR' | null;
  /** Düğme metni (eylem varsa). */
  dugme: string | null;
}

export interface AcilisKarari {
  dil: 'tr' | 'en';
  harita: CeviriHaritasi | null;
  not: DilNotu | null;
  /** true → kayıttaki dil 'en' olarak onarılır (PATCH). 'tr' onarımı YOKTUR. */
  dilOnar: boolean;
}

export const YUKLENEMEDI_NOTU: DilNotu = Object.freeze({
  tur: 'uyari',
  baslik: 'İngilizce görünüm yüklenemedi',
  metin: 'Sayfayı yenileyin.',
  eylem: null,
  dugme: null,
}) as DilNotu;

export const EKSIK_NOTU: DilNotu = Object.freeze({
  tur: 'bilgi',
  baslik: 'Bu teklifin çevirisi eksik',
  metin: "İngilizce görünüm ve İngilizce dosya için İngilizceye Çevir'e basın; kotadan düşmez.",
  eylem: 'CEVIR',
  dugme: 'İngilizceye çevir',
}) as DilNotu;

export const NEDEN_NOTLARI: Readonly<Record<GoruntulemeNedeni, DilNotu>> = Object.freeze({
  ICERIK_DEGISTI: Object.freeze({
    tur: 'uyari',
    baslik: 'Çeviriden sonra teklif değişti',
    metin: 'Malzeme/iş adları ya da satırlar çeviriden sonra değişti. İngilizce görünüm ve İngilizce dosya için yeni çeviri gerekir; yeni çeviri kotadan düşer.',
    eylem: 'CEVIR',
    dugme: 'Güncel hâli çevir',
  }) as DilNotu,
  CEVIRI_YOK: Object.freeze({
    tur: 'uyari',
    baslik: 'Bu teklifin güncel hâline ait çeviri bulunamadı',
    metin: 'İngilizce görünüm ve İngilizce dosya için teklifi İngilizceye çevirin; çeviri kotadan düşer.',
    eylem: 'CEVIR',
    dugme: 'İngilizceye çevir',
  }) as DilNotu,
  CEVIRI_SURUYOR: Object.freeze({
    tur: 'uyari',
    baslik: 'Bu teklifin çevirisi sürüyor',
    metin: 'Çeviri bitince sayfayı yenileyin.',
    eylem: null,
    dugme: null,
  }) as DilNotu,
});

/** Açılışta görüntüleme sorulmalı mı: kayıt İngilizce ya da kayıtta çevrilmiş satır var. */
export function goruntulemeGerekirMi(displayLanguage: string | undefined, isaretliSatirVar: boolean): boolean {
  return displayLanguage === 'en' || isaretliSatirVar;
}

export function acilisKarari(g: {
  displayLanguage?: string;
  isaretliSatirVar: boolean;
  yanit: GoruntulemeYaniti | null;
  hata: boolean;
}): AcilisKarari {
  const L = g.displayLanguage === 'en';
  const E = g.isaretliSatirVar;
  if (!L && !E) return { dil: 'tr', harita: null, not: null, dilOnar: false };
  // Kayıtta İngilizce kaydedilmiş satır varsa ekran onları kendi değeriyle
  // gösterir (ekran = dosya); yoksa Türkçe görünüm.
  const kayitDili: 'tr' | 'en' = E ? 'en' : 'tr';
  const y = g.yanit;
  if (g.hata || !y) return { dil: kayitDili, harita: null, not: YUKLENEMEDI_NOTU, dilOnar: false };
  if (y.odenmis === true && y.tamam === true) return { dil: 'en', harita: y.harita, not: null, dilOnar: !L };
  const onar = kayitDili === 'en' && !L;
  if (y.odenmis === true) return { dil: kayitDili, harita: null, not: EKSIK_NOTU, dilOnar: onar };
  const durur = y.degisecekSatir > 0 || (y.karsiliksizSatir ?? 0) > 0;
  return { dil: kayitDili, harita: null, not: durur ? NEDEN_NOTLARI[y.neden] : null, dilOnar: onar };
}
