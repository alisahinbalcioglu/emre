/**
 * Calisma alaninin BELGE islemleri (saf — React'siz; `calisma-kaydi.test.ts`).
 *
 * "Belge" = layer secimi + hesaplanmis layer'lar (cap etiketleri dahil).
 * Bu islemlerin HER BIRI geri alinabilir bir adimdir; gorunum tercihleri
 * (gizle / soluklastir / 💧) belge DEGILDIR ve gecmise yazilmaz.
 *
 * Kural: islem bir sey degistirmiyorsa AYNI nesneyi dondurur — cagiran
 * (indirgeyici) bosuna gecmis adimi yazmaz.
 */
import type { CalculatedLayer, WorkspaceState } from './types';
import { isUnassignedDiameter } from '../dwg-metraj/constants';
import { canonicalizeDiameter } from '../dwg-metraj/diameter-colors';
import { aktarimPayi, etiketleriAktar, segmentKosegeni, segmentYolu } from './etiket-aktarimi';
import { ayniOlcek } from './birim-bayatlik';

export interface Belge {
  selectedLayer: string | null;
  calculatedLayers: Record<string, CalculatedLayer>;
}

export function belgeAl(s: WorkspaceState): Belge {
  return { selectedLayer: s.selectedLayer, calculatedLayers: s.calculatedLayers };
}

export function belgeyiUygula(s: WorkspaceState, b: Belge): WorkspaceState {
  return { ...s, selectedLayer: b.selectedLayer, calculatedLayers: b.calculatedLayers };
}

function layerYaz(s: WorkspaceState, cl: CalculatedLayer): WorkspaceState {
  return { ...s, calculatedLayers: { ...s.calculatedLayers, [cl.layer]: cl } };
}

/** Boru layer'ini sec / birak (`null`). TOGGLE YOK: ayni layer'a tekrar
 *  tiklamak secimi kapatmaz — birakmanin yolu "Degistir" (07.08 dersi:
 *  toggle revizyonda secimi NULL'a cekiyordu). */
export function layerSec(s: WorkspaceState, layer: string | null): WorkspaceState {
  return s.selectedLayer === layer ? s : { ...s, selectedLayer: layer };
}

export interface HesapOzeti {
  tur: 'yeni' | 'yeniden';
  layer: string;
  parca: number;
  bolmeden: boolean;
  /** Yeniden ayirmada capi tasinan parca. */
  aktarilan: number;
  /** Yeniden ayirmada capli geometriye oturdugu halde capsiz kalan parca. */
  yenidenEtiketlenecek: number;
  /** Yeniden ayrilan layer onayliydi — onay kalkti (bildirim soyler). */
  onayKalkti: boolean;
}

/**
 * Motorun ayirma sonucunu belgeye yazar. Layer zaten hesaplanmissa bu bir
 * YENIDEN AYIRMADIR (birim / 💧 degisti): cap etiketleri GUNCEL belgedeki
 * parcalardan geometriyle aktarilir (kullanici istek surerken etiketlemeye
 * devam etmis olabilir) ve onay KALKAR — uzunluklar degisti.
 *
 * Aktarim payi VERIDEN: iki parcalamanin birimi ve layer'in kendi geometrisi
 * (motorun dugum toleransi formulu). Cizimin tamami KULLANILMAZ — bkz.
 * `dugumToleransi`.
 */
export function hesapSonucuUygula(
  s: WorkspaceState,
  hesap: CalculatedLayer,
): { state: WorkspaceState; ozet: HesapOzeti } {
  const eski = s.calculatedLayers[hesap.layer];
  const temel: CalculatedLayer = { ...hesap, approved: false, approvedAt: undefined };
  const bolmeden = hesap.splitMode === 'none';
  if (!eski) {
    return {
      state: layerYaz(s, temel),
      ozet: {
        tur: 'yeni',
        layer: hesap.layer,
        parca: hesap.edgeSegments.length,
        bolmeden,
        aktarilan: 0,
        yenidenEtiketlenecek: 0,
        onayKalkti: false,
      },
    };
  }
  const pay = aktarimPayi(eski.scaleUsed, hesap.scaleUsed, segmentKosegeni(eski.edgeSegments, hesap.edgeSegments));
  const a = etiketleriAktar(eski.edgeSegments, hesap.edgeSegments, pay);
  return {
    state: layerYaz(s, { ...temel, edgeSegments: a.segmentler }),
    ozet: {
      tur: 'yeniden',
      layer: hesap.layer,
      parca: a.segmentler.length,
      bolmeden,
      aktarilan: a.aktarilan,
      yenidenEtiketlenecek: a.yenidenEtiketlenecek,
      onayKalkti: !!eski.approved,
    },
  };
}

/** "Ayirmayi kaldir": layer ayrilmamis haline doner (etiketleriyle gider —
 *  geri alinabilir). Secim DEGISMEZ: kullanici Adim 1b'de kalir. */
export function hesabiKaldir(s: WorkspaceState, layer: string): WorkspaceState {
  if (!s.calculatedLayers[layer]) return s;
  const { [layer]: _atilan, ...kalan } = s.calculatedLayers;
  return { ...s, calculatedLayers: kalan };
}

/**
 * Verilen parcalara capi yazar (`''` = capi kaldir). Tek tik da, toplu atama
 * da TEK islem ve TEK gecmis adimidir. Onayli layer'da bir parcanin capi
 * DEGISIRSE onay kalkar (tasarim kurali). Degisen yoksa ayni state doner.
 *
 * `surum` = tiklamanin yapildigi PARCALAMANIN `computedAt`'i. Parca numarasi
 * yalniz kendi parcalamasinda anlamlidir (motor her ayirmada 1'den sayar).
 * 25.09 inceleme bulgusu: yeniden ayirma yaniti dispatch edilip henuz
 * cizilmeden gelen tik, React'in guncelleme kuyrugunda [hesap, cap] sirasiyla
 * YENI parcalamaya yeniden oynatiliyordu — 17 numarali eski parcanin capi
 * yeni parcalamada baska yerdeki 17'ye yaziliyordu (sessiz, yanlis metraj).
 * Surumu tutmayan eylem REDDEDILIR (gecmise adim da yazilmaz).
 */
export function capAta(
  s: WorkspaceState,
  layer: string,
  segmentIdler: readonly number[],
  cap: string,
  surum: number,
): { state: WorkspaceState; degisen: number; onayKalkti: boolean } {
  const cl = s.calculatedLayers[layer];
  if (!cl || segmentIdler.length === 0) return { state: s, degisen: 0, onayKalkti: false };
  if (cl.computedAt !== surum) return { state: s, degisen: 0, onayKalkti: false };
  const hedef = new Set(segmentIdler);
  const yeniCap = isUnassignedDiameter(cap) ? '' : cap;
  const yeniKanonik = canonicalizeDiameter(yeniCap);
  let degisen = 0;
  const edgeSegments = cl.edgeSegments.map((es) => {
    if (!hedef.has(es.segment_id)) return es;
    const simdiki = isUnassignedDiameter(es.diameter) ? '' : canonicalizeDiameter(es.diameter);
    if (simdiki === yeniKanonik) return es;
    degisen += 1;
    return { ...es, diameter: yeniCap };
  });
  if (degisen === 0) return { state: s, degisen: 0, onayKalkti: false };
  const onayKalkti = cl.approved;
  return {
    state: layerYaz(s, { ...cl, edgeSegments, approved: false, approvedAt: undefined }),
    degisen,
    onayKalkti,
  };
}

/** Layer'in CAPSIZ parcalarinin kimlikleri (toplu atama hedefi). */
export function capsizParcalar(cl: CalculatedLayer | undefined): number[] {
  if (!cl) return [];
  return cl.edgeSegments.filter((es) => isUnassignedDiameter(es.diameter)).map((es) => es.segment_id);
}

/** Metraji onayla. Secim DEGISMEZ (tasarim: onaydan sonra "Onaylandi ·
 *  fiyatlandirmaya hazir" ayni layer'da gorunur). */
export function onayla(s: WorkspaceState, layer: string, zaman: number): WorkspaceState {
  const cl = s.calculatedLayers[layer];
  if (!cl || cl.approved) return s;
  return layerYaz(s, { ...cl, approved: true, approvedAt: zaman });
}

/** Onayi kaldir — secim DEGISMEZ (07.08: revizyonda secim kapanmamali). */
export function onayiKaldir(s: WorkspaceState, layer: string): WorkspaceState {
  const cl = s.calculatedLayers[layer];
  if (!cl || !cl.approved) return s;
  return layerYaz(s, { ...cl, approved: false, approvedAt: undefined });
}

function yolUzunlugu(noktalar: ReadonlyArray<readonly [number, number]>): number {
  let t = 0;
  for (let i = 0; i < noktalar.length - 1; i++) {
    t += Math.hypot(noktalar[i + 1][0] - noktalar[i][0], noktalar[i + 1][1] - noktalar[i][1]);
  }
  return t;
}

/**
 * "Bolmeden" layer'i yeni birime gore YERELDE gunceller (motor cagrisi yok).
 * Motor bu kipte uzunlugu `round(yol_uzunlugu * birim, 3)` diye verir
 * (main.py); ayni formul geometriden yeniden hesaplanir — eski yuvarlanmis
 * metreyi carpmak mm'lik hatayi buyuturdu. Onay KALKAR (uzunluk degisti).
 */
export function yerelOlcekle(s: WorkspaceState, layer: string, scale: number): WorkspaceState {
  const cl = s.calculatedLayers[layer];
  if (!cl || !(scale > 0)) return s;
  if (cl.scaleUsed !== undefined && ayniOlcek(cl.scaleUsed, scale)) return s;
  const edgeSegments = cl.edgeSegments.map((es) => ({
    ...es,
    length: Math.round(yolUzunlugu(segmentYolu(es)) * scale * 1000) / 1000,
  }));
  const totalLength = edgeSegments.reduce((t, es) => t + es.length, 0);
  return layerYaz(s, { ...cl, edgeSegments, totalLength, scaleUsed: scale, approved: false, approvedAt: undefined });
}
