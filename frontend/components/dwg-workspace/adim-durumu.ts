/**
 * Sag panelin 3 adimli yol haritasi — hangi adim acik, cizimdeki ipucu hapi
 * ne diyor, onay ve fiyatlandirma dugmeleri ne zaman acik (saf; test edilir).
 *
 * 07.08 SOZLESMESI (onay-revizyon.ts'den tasindi): secili layer icin panel
 * ASLA cikissiz kalmaz — ayrilmamis layer'in cikisi "Parcalara ayir",
 * onaysizin "Metraji onayla", onaylinin "Geri al" (onayi kaldirir).
 *
 * FIYATLANDIRMA YUKLEMI TEK: baslik dugmesi de `handleConfirmAll` da
 * `fiyatlandirmaDurumu`nu okur — biri acik, digeri kapali olamaz.
 */
import type { CalculatedLayer } from './types';
import { birimBayatMi } from './birim-bayatlik';
import { sprinklerIsaretiBayat } from './sprinkler-bayatlik';

export type Adim1Durumu = 'sec' | 'ayir' | 'tamam';
/** 'onayli-bayat': onayli ama cizim birimi degismis — teklife GIRMEZ (baslik
 *  sayaci ve fiyatlandirma dugmesi de oyle der). 25.09 inceleme: Adim 3
 *  "fiyatlandirmaya hazir" derken baslik "0/1 onayli" diyordu. */
export type Adim3Durumu = 'bekliyor' | 'onayla' | 'onayli' | 'onayli-bayat';

export interface AdimDurumu {
  adim1: Adim1Durumu;
  adim2Acik: boolean;
  adim3: Adim3Durumu;
  /** Hesap simdiki cizim birimiyle yapilmamis: onaylanamaz, yeniden ayrilmali. */
  birimBayat: boolean;
  /** 💧 isareti hesaptan sonra degismis: metraj dogru, parca sinirlari eski
   *  (UYARI — onayi engellemez). */
  sprinklerBayat: boolean;
}

export function adimDurumu(g: {
  seciliLayer: string | null;
  hesap: CalculatedLayer | null;
  scale: number;
  sprinklerLayers: string[];
}): AdimDurumu {
  if (!g.seciliLayer) {
    return { adim1: 'sec', adim2Acik: false, adim3: 'bekliyor', birimBayat: false, sprinklerBayat: false };
  }
  if (!g.hesap) {
    return { adim1: 'ayir', adim2Acik: false, adim3: 'bekliyor', birimBayat: false, sprinklerBayat: false };
  }
  const birimBayat = birimBayatMi(g.hesap, g.scale);
  return {
    adim1: 'tamam',
    adim2Acik: true,
    adim3: !g.hesap.approved ? 'onayla' : birimBayat ? 'onayli-bayat' : 'onayli',
    birimBayat,
    sprinklerBayat: sprinklerIsaretiBayat(g.hesap, g.sprinklerLayers),
  };
}

/** Onay dugmesi neden kapali? `null` = acik. */
export function onayEngeli(g: {
  hesap: CalculatedLayer | null;
  scale: number;
  ayriliyor: boolean;
}): string | null {
  if (!g.hesap) return "Önce layer'ı parçalara ayırın";
  if (g.ayriliyor) return 'Parçalara ayırma sürüyor';
  if (birimBayatMi(g.hesap, g.scale)) return 'Çizim birimi değişti — önce yeniden ayırın';
  return null;
}

export interface FiyatlandirmaDurumu {
  /** Onayli ve birimi guncel — fiyatlandirmaya gidecek layer'lar. */
  hazir: CalculatedLayer[];
  /** Onayli ama birimi degismis — GITMEZ, yeniden ayrilmali. */
  bayatOnayli: CalculatedLayer[];
  onaysiz: CalculatedLayer[];
}

export function fiyatlandirmaDurumu(layers: readonly CalculatedLayer[], scale: number): FiyatlandirmaDurumu {
  const hazir: CalculatedLayer[] = [];
  const bayatOnayli: CalculatedLayer[] = [];
  const onaysiz: CalculatedLayer[] = [];
  for (const cl of layers) {
    if (!cl.approved) onaysiz.push(cl);
    else if (birimBayatMi(cl, scale)) bayatOnayli.push(cl);
    else hazir.push(cl);
  }
  return { hazir, bayatOnayli, onaysiz };
}

/** Baslikta "Fiyatlandırmaya geç" neden kapali? `null` = acik. Onayli ama
 *  birimi degismis layer "onaylayin" diye YANLIS yonlendirilmez. */
export function fiyatlandirmaEngeli(d: FiyatlandirmaDurumu, ayriliyor: boolean): string | null {
  if (ayriliyor) return 'Parçalara ayırma sürüyor';
  if (d.hazir.length > 0) return null;
  if (d.bayatOnayli.length > 0) return "Onaylı layer'ların çizim birimi değişti — önce yeniden ayırın";
  return "Önce en az bir layer'ın metrajını onaylayın";
}

/**
 * Onay kutusu (confirm) acik mi? Acikken klavye ONA aittir: calisma alaninin
 * Esc zinciri ve Ctrl+Z / Ctrl+Y arkada calismaz. 25.09 inceleme: fiyatlandirma
 * karti acikken Ctrl+Z onayi geri aliyordu, "Devam et" onaysiz layer'i teklife
 * gonderiyordu; Esc karti kapatirken kalemi de birakiyordu.
 */
export function onayKutusuAcikMi(kok: { querySelector: (secici: string) => unknown } | null | undefined): boolean {
  return !!kok && !!kok.querySelector('[role="alertdialog"]');
}

export interface Ipucu {
  /** Kalin kisim. */
  vurgu: string;
  /** Tireden sonraki aciklama (bos olabilir). */
  metin: string;
  /** Soldaki nokta rengi. */
  renk: string;
  /** Sagda "Esc" tusu gosterilsin mi (kalem / silgi Esc ile kapanir). */
  esc: boolean;
}

const GRI = '#94a3b8';
const TURUNCU = '#f59e0b';
const YESIL = '#16a34a';

/** Cizimin sag ustundeki ipucu hapi — her adimda ne yapilacagini tek cumleyle. */
export function ipucu(g: {
  adim: AdimDurumu;
  seciliLayer: string | null;
  layerRengi: string | null;
  yontem: 't' | 'none';
  kalem: { cap: string; renk: string } | null;
  silgi: boolean;
  ayriliyor: string | null;
  /** Motorun su an uyguladigi yontem ("Bölmeden" → "hatları çıkarılıyor"). */
  ayrilanYontem?: 't' | 'none';
}): Ipucu {
  const renk = g.layerRengi ?? GRI;
  if (g.ayriliyor) {
    const is = g.ayrilanYontem === 'none' ? 'hatları çıkarılıyor…' : 'parçalara ayrılıyor…';
    return { vurgu: `${g.ayriliyor} ${is}`, metin: 'birkaç saniye sürebilir', renk, esc: false };
  }
  if (g.adim.adim1 === 'sec') {
    return { vurgu: "Boru layer'ını seçin", metin: 'çizimde bir boruya tıklayın', renk: GRI, esc: false };
  }
  const layer = g.seciliLayer ?? '';
  if (g.adim.adim1 === 'ayir') {
    const dugme = g.yontem === 'none' ? 'Hatları çıkar' : 'Parçalara ayır';
    return { vurgu: `${layer} seçildi`, metin: `sağdan “${dugme}” ile devam edin`, renk, esc: false };
  }
  if (g.adim.birimBayat) {
    return { vurgu: `${layer} yeniden ayrılmalı`, metin: 'çizim birimi değişti — sağdan “Yeniden ayır”', renk: TURUNCU, esc: false };
  }
  if (g.silgi) {
    return { vurgu: 'Çap silgisi açık', metin: 'çapını kaldırmak istediğiniz parçaya tıklayın', renk: TURUNCU, esc: true };
  }
  if (g.kalem) {
    return { vurgu: `${g.kalem.cap} seçili`, metin: 'parçalara tıklayarak atayın', renk: g.kalem.renk, esc: true };
  }
  if (g.adim.adim3 === 'onayli') {
    return { vurgu: `${layer} onaylandı`, metin: 'fiyatlandırmaya geçebilir ya da başka layer seçebilirsiniz', renk: YESIL, esc: false };
  }
  return { vurgu: 'Çap seçin', metin: 'sağdaki listeden bir çap seçip parçalara tıklayın', renk, esc: false };
}

export type KisayolEylemi = 'geri' | 'ileri' | null;

/** Ctrl/Cmd+Z geri alir; Ctrl/Cmd+Y ve Ctrl/Cmd+Shift+Z yineler. Alt'li
 *  birlesimler (AltGr = Ctrl+Alt, Turkce klavyede @ { } yazar) YOK SAYILIR. */
export function kisayolEylemi(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): KisayolEylemi {
  if (e.altKey || !(e.ctrlKey || e.metaKey)) return null;
  const k = (e.key || '').toLowerCase();
  if (k === 'z') return e.shiftKey ? 'ileri' : 'geri';
  if (k === 'y' && !e.shiftKey) return 'ileri';
  return null;
}

/** Odak bir yazi alanindaysa kisayol ve Esc oraya aittir (metin geri alma). */
export function yaziAlaniMi(hedef: { tagName?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!hedef) return false;
  if (hedef.isContentEditable) return true;
  const t = (hedef.tagName || '').toLowerCase();
  return t === 'input' || t === 'textarea' || t === 'select';
}
