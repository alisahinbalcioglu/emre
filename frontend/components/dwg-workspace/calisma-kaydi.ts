/**
 * Calisma alaninin TEK durum makinesi (saf indirgeyici — `useReducer`).
 *
 * Belge islemleri (belge-islemleri.ts) gecmise yazilir; gorunum tercihleri
 * yazilmaz. Kimlik (`id`) ve zaman EYLEMIN ICINDE gelir: indirgeyici saf
 * kalir, React StrictMode'un cift cagrisinda ayni sonucu uretir.
 *
 * `son`: gecmise yazilan son islem. Calisma alani bildirimini bundan cizer;
 * bildirimdeki "Geri al" yalniz bu adim hala gecmisin TEPESINDEYSE calisir.
 */
import type { CalculatedLayer, WorkspaceState } from './types';
import {
  type Belge,
  belgeAl,
  belgeyiUygula,
  capAta,
  hesabiKaldir,
  hesapSonucuUygula,
  layerSec,
  onayiKaldir,
  onayla,
  yerelOlcekle,
} from './belge-islemleri';
import { bosGecmis, gecmiseEkle, geriAl, tepedekiAdim, yinele, type Gecmis } from './gecmis';
import { ayniOlcek } from './birim-bayatlik';

export interface SonIslem {
  id: number;
  etiket: string;
  /** Kullaniciya gosterilecek kisa bildirim; `null` = sessiz islem. */
  bildirim: string | null;
}

/** Birim degisimi sonrasi SIRALI yeniden ayirma oturumu: layer'larin sonucu
 *  TEK bildirimde toplanir. 25.09 inceleme: her layer kendi bildirimini
 *  yaziyordu, sonuncusu oncekilerin "N parcaya yeniden cap verin" sayisini
 *  eziyordu. Oturum, arada yapilan baska islemlerle (etiketleme serbest)
 *  kopmasin diye `son`dan AYRI tutulur. */
export interface YenidenAyirmaOturumu {
  id: number;
  layerlar: { layer: string; kayip: number; onayKalkti: boolean }[];
}

export interface CalismaKaydi {
  state: WorkspaceState;
  gecmis: Gecmis<Belge>;
  son: SonIslem | null;
  oturum: YenidenAyirmaOturumu | null;
}

export type BelgeEylemi =
  | { tur: 'sec'; id: number; layer: string | null }
  | { tur: 'hesap'; id: number; hesap: CalculatedLayer; oturum?: number }
  | { tur: 'kaldir'; id: number; layer: string }
  /** `surum`: tiklanan parcalamanin `computedAt`'i (bkz. `capAta`). */
  | { tur: 'cap'; id: number; layer: string; idler: number[]; cap: string; surum: number; toplu?: boolean }
  | { tur: 'onayla'; id: number; layer: string; zaman: number }
  | { tur: 'onayiKaldir'; id: number; layer: string }
  | { tur: 'olcekle'; id: number; layer: string; scale: number; oturum?: number };

export type GorunumEylemi =
  | { tur: 'gizle'; layer: string }
  | { tur: 'soluklastir'; layer: string }
  | { tur: 'sprinkler'; layer: string }
  | { tur: 'tumunuGoster' }
  | { tur: 'yalnizGoster'; layer: string; katmanlar: string[] };

export type KayitEylemi =
  | BelgeEylemi
  | GorunumEylemi
  | { tur: 'geri' }
  | { tur: 'ileri' }
  | { tur: 'yukle'; state: WorkspaceState }
  | { tur: 'birim'; scale: number };

export function yeniKayit(state: WorkspaceState): CalismaKaydi {
  return { state, gecmis: bosGecmis<Belge>(), son: null, oturum: null };
}

/** Kaydin "Geri al"i bu islemi mi geri alir? (bildirim bagi icin) */
export function tepedeMi(k: CalismaKaydi, id: number): boolean {
  return tepedekiAdim(k.gecmis)?.id === id;
}

function listeyiDegistir(liste: string[], oge: string): string[] {
  return liste.includes(oge) ? liste.filter((x) => x !== oge) : [...liste, oge];
}

function gorunumUygula(s: WorkspaceState, e: GorunumEylemi): WorkspaceState {
  switch (e.tur) {
    case 'gizle':
      return { ...s, hiddenLayers: listeyiDegistir(s.hiddenLayers, e.layer) };
    case 'soluklastir':
      return { ...s, dimmedLayers: listeyiDegistir(s.dimmedLayers, e.layer) };
    case 'sprinkler':
      return { ...s, sprinklerLayers: listeyiDegistir(s.sprinklerLayers, e.layer) };
    case 'tumunuGoster':
      // Gizli VE soluk katmanlarin ikisi de normale doner ("Tumunu goster").
      return s.hiddenLayers.length === 0 && s.dimmedLayers.length === 0
        ? s
        : { ...s, hiddenLayers: [], dimmedLayers: [] };
    case 'yalnizGoster':
      return { ...s, hiddenLayers: e.katmanlar.filter((k) => k !== e.layer) };
    default:
      return s;
  }
}

interface IslemSonucu {
  state: WorkspaceState;
  etiket: string;
  bildirim: string | null;
  /** Yeniden ayirma / yerel olcekleme: oturum ozetine girecek satir. */
  oturumSatiri?: YenidenAyirmaOturumu['layerlar'][number];
}

const ONAY_KALKTI_NOTU = ' · onay kalktı, yeniden onaylayın';
const sayi = (n: number) => n.toLocaleString('tr-TR');

function belgeIslemi(s: WorkspaceState, e: BelgeEylemi): IslemSonucu {
  switch (e.tur) {
    case 'sec':
      return { state: layerSec(s, e.layer), etiket: 'Layer seçimi', bildirim: null };
    case 'hesap': {
      const { state, ozet } = hesapSonucuUygula(s, e.hesap);
      if (ozet.tur === 'yeni') {
        return ozet.bolmeden
          ? { state, etiket: 'Hat çıkarma', bildirim: `${ozet.layer}: ${sayi(ozet.parca)} hat çıkarıldı (bölmeden)` }
          : { state, etiket: 'Parçalara ayırma', bildirim: `${ozet.layer} ${sayi(ozet.parca)} parçaya ayrıldı` };
      }
      const korunan = ozet.aktarilan > 0 ? `, ${sayi(ozet.aktarilan)} parçanın çapı korundu` : '';
      const eksik = ozet.yenidenEtiketlenecek > 0
        ? ` · ${sayi(ozet.yenidenEtiketlenecek)} parçaya yeniden çap verin`
        : '';
      return {
        state,
        etiket: 'Yeniden ayırma',
        bildirim: `${ozet.layer} yeniden ayrıldı · ${sayi(ozet.parca)} parça${korunan}${eksik}${ozet.onayKalkti ? ONAY_KALKTI_NOTU : ''}`,
        oturumSatiri: { layer: ozet.layer, kayip: ozet.yenidenEtiketlenecek, onayKalkti: ozet.onayKalkti },
      };
    }
    case 'kaldir':
      return { state: hesabiKaldir(s, e.layer), etiket: 'Ayırmayı kaldırma', bildirim: `${e.layer} ayırması kaldırıldı` };
    case 'cap': {
      const { state, degisen, onayKalkti } = capAta(s, e.layer, e.idler, e.cap, e.surum);
      const onayNotu = onayKalkti ? ONAY_KALKTI_NOTU : '';
      if (e.toplu) {
        return {
          state,
          etiket: 'Toplu çap',
          bildirim: `${sayi(degisen)} çapsız parçaya ${e.cap} verildi${onayNotu}`,
        };
      }
      return {
        state,
        etiket: e.cap ? 'Çap atama' : 'Çap silme',
        bildirim: onayKalkti ? `${e.layer} onayı kalktı — çap değişti, yeniden onaylayın` : null,
      };
    }
    case 'onayla':
      return { state: onayla(s, e.layer, e.zaman), etiket: 'Onay', bildirim: `${e.layer} metrajı onaylandı` };
    case 'onayiKaldir':
      return { state: onayiKaldir(s, e.layer), etiket: 'Onayı geri alma', bildirim: null };
    case 'olcekle': {
      const onayliydi = !!s.calculatedLayers[e.layer]?.approved;
      return {
        state: yerelOlcekle(s, e.layer, e.scale),
        etiket: 'Birim güncelleme',
        bildirim: `${e.layer} yeni birime göre güncellendi${onayliydi ? ONAY_KALKTI_NOTU : ''}`,
        oturumSatiri: { layer: e.layer, kayip: 0, onayKalkti: onayliydi },
      };
    }
    default:
      return { state: s, etiket: '', bildirim: null };
  }
}

/** Birden cok layer'lik oturumun tek bildirimi (tek layer'da o layer'in
 *  kendi bildirimi kalir). */
export function oturumBildirimi(layerlar: YenidenAyirmaOturumu['layerlar']): string {
  const kayipli = layerlar.filter((l) => l.kayip > 0);
  const toplamKayip = kayipli.reduce((t, l) => t + l.kayip, 0);
  const etiketler = toplamKayip > 0
    ? ` · ${sayi(toplamKayip)} parçaya yeniden çap verin (${kayipli.map((l) => `${l.layer}: ${sayi(l.kayip)}`).join(', ')})`
    : ' · çap etiketleri korundu';
  const onay = layerlar.some((l) => l.onayKalkti) ? ONAY_KALKTI_NOTU : '';
  return `${layerlar.length} layer yeni birime göre güncellendi${etiketler}${onay}`;
}

function oturumuIlerlet(
  k: CalismaKaydi,
  e: BelgeEylemi,
  satir: IslemSonucu['oturumSatiri'],
): YenidenAyirmaOturumu | null {
  const id = e.tur === 'hesap' || e.tur === 'olcekle' ? e.oturum : undefined;
  if (id === undefined || !satir) return k.oturum;
  const onceki = k.oturum?.id === id ? k.oturum.layerlar : [];
  return { id, layerlar: [...onceki.filter((l) => l.layer !== satir.layer), satir] };
}

export function calismaKaydiIndirgeyici(k: CalismaKaydi, e: KayitEylemi): CalismaKaydi {
  switch (e.tur) {
    case 'geri': {
      const g = geriAl(k.gecmis, belgeAl(k.state));
      return g ? { ...k, state: belgeyiUygula(k.state, g.belge), gecmis: g.gecmis } : k;
    }
    case 'ileri': {
      const g = yinele(k.gecmis, belgeAl(k.state));
      return g ? { ...k, state: belgeyiUygula(k.state, g.belge), gecmis: g.gecmis } : k;
    }
    case 'yukle':
      return yeniKayit(e.state);
    case 'birim':
      return ayniOlcek(k.state.scale, e.scale) ? k : { ...k, state: { ...k.state, scale: e.scale } };
    case 'gizle':
    case 'soluklastir':
    case 'sprinkler':
    case 'tumunuGoster':
    case 'yalnizGoster': {
      const state = gorunumUygula(k.state, e);
      return state === k.state ? k : { ...k, state };
    }
    default: {
      const r = belgeIslemi(k.state, e);
      if (r.state === k.state) return k;
      const oturum = oturumuIlerlet(k, e, r.oturumSatiri);
      const bildirim = oturum && oturum !== k.oturum && oturum.layerlar.length > 1
        ? oturumBildirimi(oturum.layerlar)
        : r.bildirim;
      return {
        state: r.state,
        gecmis: gecmiseEkle(k.gecmis, { id: e.id, etiket: r.etiket, belge: belgeAl(k.state) }),
        son: { id: e.id, etiket: r.etiket, bildirim },
        oturum,
      };
    }
  }
}

// ── KAYITLI CALISMANIN YUKLENMESI (localStorage) ──────────────────────────

export function bosDurum(fileId: string, scale: number): WorkspaceState {
  return {
    fileId,
    scale,
    selectedLayer: null,
    layerConfigs: {},
    calculatedLayers: {},
    sprinklerLayers: [],
    hiddenLayers: [],
    dimmedLayers: [],
  };
}

/**
 * Kayitli calismayi (JSON'dan cozulmus) calisma durumuna cevirir.
 *
 * BIRIM (25.09): eskiden birim uyusmazsa hesaplanan layer'lar DUSURULUYOR ve
 * kayit eziliyordu — etiketler kayboluyordu. Artik layer'lar KORUNUR; her
 * birine hesaplandigi birim (`scaleUsed`) yazilir. `scaleUsed`i olmayan eski
 * kayitlarda deger kaydin KENDI birimidir: o surumde birim degisince layer'lar
 * dusuruldugu icin kayittaki tum layer'lar kaydin birimiyle hesaplanmisti.
 * Simdiki birimden farkliysa layer bayat gorunur (birim-bayatlik.ts).
 */
export function kayitliDurumuCoz(
  parsed: unknown,
  fileId: string,
  scale: number,
  hashAnahtarli: boolean,
): WorkspaceState {
  if (!parsed || typeof parsed !== 'object') return bosDurum(fileId, scale);
  const p = parsed as Partial<WorkspaceState> & Record<string, unknown>;
  // Legacy (fileId anahtarli) kayitta dosya kimligi tutmali; hash anahtarli
  // kayitta sunucu yeni file_id vermis olabilir — kayit gecerlidir.
  if (!hashAnahtarli && p.fileId !== fileId) return bosDurum(fileId, scale);
  const kayitBirimi = typeof p.scale === 'number' && p.scale > 0 ? p.scale : scale;
  const calculatedLayers: Record<string, CalculatedLayer> = {};
  const kaynak = (p.calculatedLayers ?? {}) as Record<string, CalculatedLayer>;
  Object.keys(kaynak).forEach((ad) => {
    const cl = kaynak[ad];
    if (!cl || typeof cl !== 'object') return;
    calculatedLayers[ad] = {
      ...cl,
      scaleUsed: typeof cl.scaleUsed === 'number' && cl.scaleUsed > 0 ? cl.scaleUsed : kayitBirimi,
    };
  });
  return { ...bosDurum(fileId, scale), ...p, calculatedLayers, fileId, scale } as WorkspaceState;
}
