'use client';

/**
 * DWG Viewer — native HTML5 Canvas2D rendering.
 *
 * Mimari:
 *   - HTML <canvas> + 2d context
 *   - useViewport pan/zoom state (native wheel listener)
 *   - Y-flip transform: canvas Y-asagi, DWG Y-yukari → ctx.scale(zoom, -zoom)
 *   - Adaptive grid (log10 step) + viewport culling
 *   - Per-layer batched stroke (single beginPath + multi moveTo/lineTo + stroke)
 *   - rbush spatial index: 26K+ cizgide hover/click O(log N)
 *   - Hover overlay + bilgi kutusu (layer / parca / cap)
 *
 * 25.09 DWG tasarimi — viewer YALNIZ ciziyor ve tiklamayi bildiriyor:
 *   - Arac cubugu (Katmanlar, yakinlastir, cap silgisi, geri al/yinele),
 *     ipucu hapi, lejant ve bildirim CALISMA ALANINDA, bu bilesenin
 *     KARDESI olarak durur. Eskiden cubuk isaretci kabinin icindeydi ve
 *     cubuga tiklama bir de tuval tiklamasi uretiyordu (layer secimini
 *     dusurebiliyordu). Yakinlastirma kontrolleri `ref` ile verilir.
 *   - Gorsel silgi (sekil gizleme) KALDIRILDI: metraja hic girmiyordu
 *     (yorum "excluded_lines gonderilir" diyordu, gonderilmiyordu) — silinen
 *     boru ekrandan kalkip metrajda sayilmaya devam ediyordu.
 *
 * Layer durumlari (her biri bagimsiz):
 *   - hidden:     hic cizilmez, hit-test'te atlanir
 *   - dimmed:     gri + %45, hit-test'te atlanir (referans; Katmanlar paneli)
 *   - soluklasan: kendi renginde %22, TIKLANABILIR (secim varken diger boru
 *                 layer'lari — "digerleri soluklasir")
 *   - ham:        hesaplanmis ama onayli ve secili degil → parcalar ACI renginde
 *   - normal:     ACI renkli, etkilesime acik
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import RBush from 'rbush';
import { Loader2, AlertCircle } from 'lucide-react';
import api from '@/ortak/lib/api';
import type { GeometryResult } from './types';
import type { EdgeSegment } from '@/components/dwg-metraj/types';
import { CAPSIZ_RENGI, diameterToColor } from '@/components/dwg-metraj/diameter-colors';
import { isUnassignedDiameter } from '@/components/dwg-metraj/constants';
import { resolveHoverLength } from './segment-length';
import { canliCapliVarlik, canliSegmentiBul, sabitSecimGecersiz } from './canli-cap';
import { gorunumKutusu } from './gorunum-kutusu';
import { useViewport } from './useViewport';
import { aciToColor } from './aci-colors';

/** Cizimden cikan katman ozeti — calisma alani (baslik sayaclari, Katmanlar
 *  paneli, "Adina gore boru olabilecekler") bunu okur. */
export interface GeometriBilgisi {
  katmanlar: { ad: string; renk: string; cizgi: number }[];
  /** Toplam LINE sayisi. */
  cizgi: number;
  /** Toplam INSERT (blok) sayisi. */
  blok: number;
}

/** Calisma alaninin arac cubugu bu kontrolleri `ref` ile cagirir. */
export interface CizimKontrolleri {
  zoomIn: () => void;
  zoomOut: () => void;
  fitView: () => void;
}

/** Parca kimligi: `segment_id` her ayirmada 1'den baslar, yani layer'lar
 *  arasinda TEKRAR EDER — arama her zaman layer + id ile yapilir. */
export interface ParcaKimligi {
  layer: string;
  segmentId: number;
}

interface DxfCanvasViewerProps {
  fileId: string | null;
  /** Hesaplanmis TUM layer'larin parcalari (onayli olanlar dahil — mekansal
   *  indeks secim degistikce yeniden kurulmasin diye uyelik sabit tutulur;
   *  onayli ve secili olmayanlar `hamCizilenLayerlar` ile ACI renginde cizilir). */
  calculatedEdgesByLayer?: Record<string, EdgeSegment[]>;
  /** Layer adi -> T-junction noktalari ([x,y] listesi). Beyaz halka olarak cizilir. */
  calculatedJunctionsByLayer?: Record<string, [number, number][]>;
  selectedLayer?: string | null;
  onSegmentClick?: (segment: EdgeSegment) => void;
  onLineClick?: (line: { layer: string; index: number; shiftKey: boolean; screenX: number; screenY: number }) => void;
  onInsertClick?: (insert: { layer: string; insertIndex: number; insertName: string; position: [number, number] }) => void;
  onCircleClick?: (circle: { layer: string; circleIndex: number; center: [number, number]; radius: number }) => void;
  sprinklerLayers?: Set<string>;
  className?: string;
  /** Hicbir seye isabet etmeyen tik. */
  onClearSelection?: () => void;
  /** Cizim yuklenince bir kez: katmanlar, sayaclar. */
  onGeometriBilgisi?: (bilgi: GeometriBilgisi) => void;
  hiddenLayers?: Set<string>;
  dimmedLayers?: Set<string>;
  /** Birim donusturucu (DWG birimi → metre). Bilgi kutusu uzunluk hesabi icin. */
  scale?: number;
  /** Hesaplanmis edge segment'leri cap-bazli renklerle (true, default) ya da
   *  layer orijinal ACI rengiyle (false) ciz. PRD §5: save sonrasi false. */
  useDiameterColors?: boolean;
  /** Parcalari cap rengi yerine ACI renginde cizilecek layer'lar (onayli ve
   *  secili olmayan — "bu layer bitti" kurali, onay-revizyon.ts). */
  hamCizilenLayerlar?: Set<string>;
  /** Secim varken diger boru layer'lari: kendi renginde %22 (tiklanabilir). */
  soluklasanLayerlar?: Set<string>;
  /** Birimi degismis, yeniden ayirma bitmemis layer'lar: parca uzunlugu yeni
   *  birime cevrilmis ON HESAPTIR — bilgi kutusu "≈" yazar (25.09 canli). */
  yaklasikLayerlar?: Set<string>;
  /** "Çapsızları göster": secili layer'in CAPLI parcalari solar. */
  capsizOdak?: boolean;
  /** Adim 2: yalniz bu layer'in parcalari (ve yazilar) fareye yanit verir —
   *  cap atarken yanlislikla baska layer secilmesin. */
  kilitliLayer?: string | null;
  /** Bilgi kutusunun dili: Adim 1 "Layer: … / Seçmek için tıklayın",
   *  Adim 2 "Ø110 PVC BORU / Parça: 16,0 m · a-yağmur". */
  etkilesimModu?: 'layer-sec' | 'cap-ata';
  // ── CAP SATIRINDAN GEZINME (focus segment) ─────────────────────────
  /** Set ise: viewport o parcaya zoom yapilir + uzerine kalin hale cizilir. */
  focusedSegment?: ParcaKimligi | null;
  /** Hale rengi (cap rengi). null ise sari/vurgu rengi kullanir. */
  focusedHaloColor?: string | null;
  /** Ayni parcaya art arda tiklayinca zoom + hale tekrari icin token. */
  focusVersion?: number;
  // ── MANUEL ETIKETLEME (tikla-etiketle) ────────────────────────────
  /** Aktif cap kaleminin (ya da silginin) rengi. Set ise parca hover vurgusu
   *  bu renge boyanir — kullanici tiklamadan ONCE ne olacagini gorur. */
  activeTagColor?: string | null;
  /** SEGMENT IZOLASYONU teyidi: tiklanan parca ~900ms kalem rengiyle parlar. */
  flashSegment?: (ParcaKimligi & { color: string; at: number }) | null;
}

const COLOR_BG = '#0b1220';
const COLOR_PASSIVE = '#94a3b8';
const COLOR_TEXT = '#fbbf24';
const COLOR_SPRINKLER = '#22d3ee';
const COLOR_DIMMED = '#475569';            // slate-600
const COLOR_HOVER = '#fde68a';             // amber-200 glow
const COLOR_LINE_SELECTED = '#3b82f6';     // brand blue
const COLOR_T_HALKA = '#e2e8f0';
const DIMMED_ALPHA = 0.45;
/** "Digerleri soluklasir" (tasarim: 0.22). */
const SOLUK_ALPHA = 0.22;
/** "Çapsızları göster" acikken capli parcalarin opakligi. */
const CAPSIZ_ODAK_ALPHA = 0.2;
const HOVER_TOL_PX = 6;

/** TAM TIKLANABILIRLIK: line/edge'e ek olarak INSERT (blok),
 *  CIRCLE (sembol cemberi) ve TEXT (cap etiketi/olcu/not) de spatial index'e
 *  girer — her biri hover + click alabilen "selectable entity" olur. */
type EntityKind = 'line' | 'edge' | 'insert' | 'circle' | 'text';

interface SpatialEntry {
  minX: number; minY: number; maxX: number; maxY: number;
  type: EntityKind;
  layer: string;
  /** Ilgili geometry dizisindeki index (lines/edgeSegments/inserts/circles/texts) */
  index: number;
  coords: [number, number, number, number];
  polyline?: Array<[number, number]>;
  /** Sadece type='edge' icin: backend'in hesapladigi metre uzunluk (tooltip). */
  length?: number;
  // NOT: diameter/isInherited BILEREK index'te tutulmaz — cap her tiklamada
  // degisir; index'te olsa ya stale kalir ya da 700K'lik agac her tiklamada
  // yeniden kurulur (OOM). Hover aninda allEdgeSegments'ten canli okunur.
  /** type='text': icerik + yukseklik (hitbox + tooltip) */
  text?: string;
  height?: number;
  /** type='insert': blok adi; type='insert'|'circle': merkez/anchor */
  insertName?: string;
  center?: [number, number];
  radius?: number;
}

interface HoveredEntity {
  type: EntityKind;
  layer: string;
  index: number;
  coords: [number, number, number, number];
  polyline?: Array<[number, number]>;
  /** Metre cinsinden hesaplanmis uzunluk (yalniz line/edge). */
  length?: number;
  /** Sadece edge tipi icin: cap ve BFS miras durumu */
  diameter?: string;
  isInherited?: boolean;
  /** type='text' icerik; type='insert' blok adi */
  text?: string;
  insertName?: string;
  center?: [number, number];
  radius?: number;
  height?: number;
}

/** Parca dizisinin GEOMETRIK parmak izi (sira dahil). Cap degisimi bunu
 *  DEGISTIRMEZ (indeks ayakta kalir); yeniden ayirma — ayni sayida, ayni
 *  numarali parca donse bile — koordinat ya da layer farkiyla degistirir.
 *  Eskiden yalniz id listesiydi: numaralar her ayirmada 1'den basladigi icin
 *  birim degisince ayni sayida gelen parcalar BAYAT indeksle kaliyordu. */
function geometriParmakIzi(segs: EdgeSegment[] | null): string {
  if (!segs) return 'none';
  let h = 2166136261;
  const karistir = (n: number) => {
    h ^= Math.round(n * 1000) | 0;
    h = Math.imul(h, 16777619);
  };
  const layerOzeti = new Map<string, number>();
  for (const s of segs) {
    let lh = layerOzeti.get(s.layer);
    if (lh === undefined) {
      lh = 0;
      for (let i = 0; i < s.layer.length; i++) lh = Math.imul(lh ^ s.layer.charCodeAt(i), 16777619);
      layerOzeti.set(s.layer, lh);
    }
    karistir(lh);
    karistir(s.segment_id);
    karistir(s.coords[0]);
    karistir(s.coords[1]);
    karistir(s.coords[2]);
    karistir(s.coords[3]);
  }
  return `${segs.length}:${h >>> 0}`;
}

const ayniParca = (s: EdgeSegment, k: ParcaKimligi | null | undefined) =>
  !!k && s.layer === k.layer && s.segment_id === k.segmentId;

const DxfCanvasViewer = forwardRef<CizimKontrolleri, DxfCanvasViewerProps>(function DxfCanvasViewer({
  fileId,
  calculatedEdgesByLayer,
  calculatedJunctionsByLayer,
  selectedLayer,
  onSegmentClick,
  onLineClick,
  onInsertClick,
  onCircleClick,
  sprinklerLayers,
  className = '',
  onClearSelection,
  onGeometriBilgisi,
  hiddenLayers,
  dimmedLayers,
  scale = 0.001,
  useDiameterColors = true,
  hamCizilenLayerlar,
  soluklasanLayerlar,
  yaklasikLayerlar,
  capsizOdak = false,
  kilitliLayer = null,
  etkilesimModu = 'layer-sec',
  focusedSegment: odakKimligi = null,
  focusedHaloColor = null,
  focusVersion = 0,
  activeTagColor = null,
  flashSegment = null,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const [geometry, setGeometry] = useState<GeometryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursorWorld, setCursorWorld] = useState<{ x: number; y: number } | null>(null);
  const [cursorScreen, setCursorScreen] = useState<{ x: number; y: number } | null>(null);
  const [hovered, setHovered] = useState<HoveredEntity | null>(null);
  const [selectedLine, setSelectedLine] = useState<HoveredEntity | null>(null);

  // TAG FLASH temizligi: flash 900ms gorunur; suresi dolunca bir kez redraw
  // tetikle ki parlaklik ekrandan silinsin (draw loop surekli calismiyor).
  const [flashTick, setFlashTick] = useState(0);
  useEffect(() => {
    if (!flashSegment) return;
    const t = setTimeout(() => setFlashTick((v) => v + 1), 950);
    return () => clearTimeout(t);
  }, [flashSegment]);

  // Hesaplanmis tum edge segment'leri tek bir array'e flatten et — render
  // path + spatial index + odak aramasi tek bir kaynak kullanir.
  const allEdgeSegments = useMemo<EdgeSegment[] | null>(() => {
    if (calculatedEdgesByLayer) {
      const flat = Object.values(calculatedEdgesByLayer).flat();
      if (flat.length > 0) return flat;
    }
    return null;
  }, [calculatedEdgesByLayer]);

  // Bounds (DWG world). "Tümünü sığdır" cizimin GOVDESINE sigdirir (yalniz
  // parcalara degil — eskiden bir layer ayrildiktan sonra "sigdir" yalniz
  // borulara yakinlasiyordu).
  // 26.09: motorun HAM kutusu degil GORUNUM KUTUSU (gorunum-kutusu.ts) — birkac
  // uzak nesne ham kutuyu cizimin binlerce katina sisiriyor, proje acilista nokta
  // kadar kaliyordu. Noktalarin %2'sinden azini tasiyan uzak pafta cercevede
  // yoktur (uzaklasarak bulunur). Yalniz geometri degisince, dosya basina bir kez
  // hesaplanir (olculdu: 1,5 M cizgide ~0,3 sn).
  const cizimKutusu = useMemo(() => (geometry ? gorunumKutusu(geometry) : null), [geometry]);
  const bounds = useMemo<[number, number, number, number]>(() => {
    if (cizimKutusu) return cizimKutusu;
    if (allEdgeSegments && allEdgeSegments.length > 0) {
      let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
      for (const es of allEdgeSegments) {
        const [x1, y1, x2, y2] = es.coords;
        if (x1 < mnx) mnx = x1; if (y1 < mny) mny = y1;
        if (x2 < mnx) mnx = x2; if (y2 < mny) mny = y2;
        if (x1 > mxx) mxx = x1; if (y1 > mxy) mxy = y1;
        if (x2 > mxx) mxx = x2; if (y2 > mxy) mxy = y2;
      }
      return [mnx, mny, mxx, mxy];
    }
    return [0, 0, 100, 100];
  }, [cizimKutusu, allEdgeSegments]);

  const { viewport, fitView, zoomToBounds, zoomIn, zoomOut, wasDragged, isDragging, pointerHandlers } = useViewport({
    bounds,
    containerRef,
    // Ilk sigdirma cizim gelince: kayitli parcalar cizimden once gelse bile
    // kamera once borulara kilitlenmesin.
    autoFit: !!geometry,
    // KAMERA KILIDI: dosya basina TEK otomatik fit. Onay/hesaplama/etiketleme
    // bounds'u degistirse bile kamera kullanicinin biraktigi yerde kalir.
    fitKey: fileId,
  });

  useImperativeHandle(ref, () => ({ zoomIn, zoomOut, fitView }), [zoomIn, zoomOut, fitView]);

  // ─── Odak parcasi: cap satirindan gezinme — zoom + hale ─────────────
  const focusedSegment = useMemo<EdgeSegment | null>(() => {
    if (!odakKimligi || !allEdgeSegments) return null;
    return allEdgeSegments.find((s) => ayniParca(s, odakKimligi)) ?? null;
  }, [odakKimligi, allEdgeSegments]);

  // Kamera YALNIZ yeni bir gezinme istegiyle (focusVersion) oynar. 25.09
  // inceleme: etki parca nesnesine bagliydi; etiketleme / geri al odakli
  // parcanin nesnesini degistirince kamera kullanicinin calistigi yerden
  // kaciyordu.
  const sonOdakSurumuRef = useRef(focusVersion);
  useEffect(() => {
    if (!focusedSegment) return;
    if (sonOdakSurumuRef.current === focusVersion) return;
    sonOdakSurumuRef.current = focusVersion;
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
    const pts: Array<[number, number]> =
      focusedSegment.polyline && focusedSegment.polyline.length >= 2
        ? focusedSegment.polyline
        : [
            [focusedSegment.coords[0], focusedSegment.coords[1]],
            [focusedSegment.coords[2], focusedSegment.coords[3]],
          ];
    for (const [px, py] of pts) {
      if (px < mnx) mnx = px;
      if (py < mny) mny = py;
      if (px > mxx) mxx = px;
      if (py > mxy) mxy = py;
    }
    // Parcanin etrafina pay: cevre baglami gorunsun ama parca ve cap
    // yazilari okunacak kadar yakin kalinsin. Alt sinir GERCEK olcude 15 cm
    // (eskiden sabit 150 birimdi: mm cizimde 15 cm, metre cizimde 150 m).
    const w = mxx - mnx;
    const h = mxy - mny;
    const enAzPay = 0.15 / (scale > 0 ? scale : 0.001);
    const padX = Math.max(w * 0.3, enAzPay);
    const padY = Math.max(h * 0.3, enAzPay);
    zoomToBounds([mnx - padX, mny - padY, mxx + padX, mxy + padY], 0.95);
    // focusVersion: ayni parcaya tekrar tiklamada da zoom + hale yeniden tetiklenir
  }, [focusedSegment, focusVersion, zoomToBounds, scale]);

  // ─── Geometry fetch + retry (cold-start) ─────────────────────────────
  // ⚠ Bagimlilik YALNIZ fileId: bilgi geri cagrisi ref'ten okunur. Kararsiz
  // bir geri cagri bagimliliga girseydi 700K cizgilik cizim DONGUYE girerdi.
  const bilgiRef = useRef(onGeometriBilgisi);
  bilgiRef.current = onGeometriBilgisi;
  useEffect(() => {
    if (!fileId) {
      setGeometry(null);
      return;
    }
    let cancelled = false;
    const RETRY_DELAYS = [2000, 5000, 10000, 20000, 40000];
    setLoading(true);
    setError(null);

    const isTransient = (e: any): boolean => {
      const status = e?.response?.status;
      // 5xx cold-start / overload — retry mantikli
      if (status === 503 || status === 502 || status === 504 || status === 500) return true;
      if (status === 429) return true;
      // 422/404: file_id bir daha asla geri gelmeyecek (cache TTL / deploy).
      if (status === 422 || status === 404) return false;
      const code = e?.code;
      if (code === 'ECONNABORTED' || code === 'ERR_NETWORK') return true;
      if (!e?.response) return true;
      return false;
    };

    (async () => {
      let lastErr: any = null;
      for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
        if (cancelled) return;
        try {
          const res = await api.get<GeometryResult>(`/dwg-engine/geometry/${fileId}`);
          if (cancelled) return;
          setGeometry(res.data);
          setLoading(false);
          return;
        } catch (e: any) {
          lastErr = e;
          if (!isTransient(e)) break;
          if (attempt >= RETRY_DELAYS.length) break;
          if (cancelled) return;
          await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
        }
      }
      if (!cancelled) {
        const status = lastErr?.response?.status;
        let msg: string;
        if (status === 422 || status === 404) {
          msg = 'Oturum sona erdi (sunucu dosyayı unutmuş). “Yeni DWG” ile dosyayı yeniden yükleyin — etiketleriniz geri gelir.';
        } else if (status) {
          msg = `${status}: Çizim servisi yanıt vermedi. Sayfayı yenileyin.`;
        } else {
          msg = lastErr?.message ?? 'Çizim alınamadı';
        }
        setError(msg);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fileId]);

  // Cizim bilgisi — katmanlar (renk + cizgi sayisi), sayaclar. (Aktarim payi
  // cizim kosegeninden DEGIL, layer'in kendi geometrisinden — etiket-aktarimi.)
  useEffect(() => {
    if (!geometry) return;
    const cizgi = new Map<string, number>();
    for (const ln of geometry.lines) cizgi.set(ln.layer, (cizgi.get(ln.layer) ?? 0) + 1);
    const renkler = geometry.layer_colors ?? {};
    const adlar = Object.keys(renkler);
    // layer_colors'ta olmayan ama cizgisi olan katman da listelensin
    cizgi.forEach((_n, ad) => { if (!(ad in renkler)) adlar.push(ad); });
    bilgiRef.current?.({
      katmanlar: adlar.map((ad) => ({ ad, renk: aciToColor(renkler[ad] ?? 7), cizgi: cizgi.get(ad) ?? 0 })),
      cizgi: geometry.lines.length,
      blok: geometry.inserts?.length ?? 0,
    });
  }, [geometry]);

  // ─── Canvas init + DPR ─────────────────────────────────────────────
  // resizeTick: boyut degisince render effect'i tetikler + sahne cache'ini
  // gecersiz kilar (canvas.width degisimi icerigi zaten siler).
  const [resizeTick, setResizeTick] = useState(0);
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctxRef.current = ctx;
      }
      setResizeTick((t) => t + 1);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // ─── Sahne cache (KATMAN MIMARISI — OOM/re-render fix) ─────────────
  // Statik sahne (706K cizgi + arc + circle + text + edge'ler) offscreen
  // canvas'ta tutulur. Hover/flash/secim/halo gibi OVERLAY degisimlerinde
  // sahne YENIDEN CIZILMEZ — tek drawImage (blit) + birkac vurgu cizgisi.
  const sceneCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneKeyRef = useRef<unknown[] | null>(null);

  // ─── Mekansal indeks (rbush) — IKI AGAC ────────────────────────────
  // 700K+ cizgide hover/click O(log N).
  //  - HAM agac: cizim varliklari (cizgi, blok, daire, yazi). YALNIZ cizim
  //    degisince kurulur. Hesaplanmis layer'larin ham cizgileri agacta KALIR,
  //    sorguda elenir (`hesaplananlar`): bir layer'i ayirmak, ayirmayi geri
  //    almak ya da yeniden ayirmak 700K'lik agaci yeniden KURMAZ. 25.09
  //    inceleme: tek agacta bu islemlerin her biri tum cizimi yeniden
  //    indeksliyordu (tepe bellek gecici olarak iki katina cikiyordu).
  //  - PARCA agaci: hesaplanmis parcalar; parca GEOMETRISI degisince kurulur.
  //    Anahtar geometrik parmak izi — cap degisimi agaci kurmaz.
  //  diameter index'te SAKLANMAZ — hover aninda guncel diziden okunur.
  // KRITIK: hesaplanmis layer'in ham cizgisi SECILEMEZ — aksi halde tik uzun
  // ham LWPOLYLINE'a duserdi (sorgudaki eleme bunu korur).
  const hesaplananlarKey = useMemo(
    () => (calculatedEdgesByLayer ? Object.keys(calculatedEdgesByLayer).sort().join('\u0000') : ''),
    [calculatedEdgesByLayer],
  );
  const hesaplananlar = useMemo(
    () => new Set<string>(hesaplananlarKey ? hesaplananlarKey.split('\u0000') : []),
    [hesaplananlarKey],
  );
  const edgeGeomKey = useMemo(() => geometriParmakIzi(allEdgeSegments), [allEdgeSegments]);
  // Guncel segment dizisine parmak-izi degismeden erisim (memo'yu tetiklemez;
  // ayni parmak izinde diziler geometrik olarak esdegerdir).
  const allEdgeSegmentsRef = useRef(allEdgeSegments);
  allEdgeSegmentsRef.current = allEdgeSegments;

  const hamIndeks = useMemo<RBush<SpatialEntry>>(() => {
    const tree = new RBush<SpatialEntry>();
    const items: SpatialEntry[] = [];
    if (geometry) {
      geometry.lines.forEach((ln, i) => {
        const [x1, y1, x2, y2] = ln.coords;
        items.push({
          minX: Math.min(x1, x2), maxX: Math.max(x1, x2),
          minY: Math.min(y1, y2), maxY: Math.max(y1, y2),
          type: 'line', layer: ln.layer, index: i, coords: ln.coords,
        });
      });
      geometry.inserts.forEach((ins) => {
        const [px, py] = ins.position;
        items.push({
          minX: px, maxX: px, minY: py, maxY: py,
          type: 'insert', layer: ins.layer, index: ins.insert_index,
          coords: [px, py, px, py],
          insertName: ins.insert_name,
          center: [px, py],
        });
      });
      geometry.circles.forEach((c) => {
        const [cx, cy] = c.center;
        items.push({
          minX: cx - c.radius, maxX: cx + c.radius,
          minY: cy - c.radius, maxY: cy + c.radius,
          type: 'circle', layer: c.layer, index: c.circle_index,
          coords: [cx, cy, cx, cy],
          center: [cx, cy], radius: c.radius,
        });
      });
      geometry.texts.forEach((t, ti) => {
        if (!t.text) return;
        const [tx, ty] = t.position;
        // Monospace yaklasik bbox (rotation yoksayilir) — gorunmez ama AKTIF
        // carpisma kutusu (collision hitbox).
        const th = Math.max(t.height, 1);
        const tw = t.text.length * th * 0.6;
        items.push({
          minX: tx, maxX: tx + tw, minY: ty, maxY: ty + th,
          type: 'text', layer: t.layer, index: ti,
          coords: [tx, ty, tx + tw, ty + th],
          text: t.text, height: th,
        });
      });
    }
    tree.load(items);
    return tree;
  }, [geometry]);

  const parcaIndeks = useMemo<RBush<SpatialEntry>>(() => {
    const tree = new RBush<SpatialEntry>();
    const items: SpatialEntry[] = [];
    const segs = allEdgeSegmentsRef.current;
    if (segs) {
      segs.forEach((seg, i) => {
        const meta = {
          type: 'edge' as const, layer: seg.layer, index: i,
          coords: seg.coords,
          length: seg.length,
        };
        if (seg.polyline && seg.polyline.length >= 2) {
          let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
          for (const [x, y] of seg.polyline) {
            if (x < mnx) mnx = x; if (x > mxx) mxx = x;
            if (y < mny) mny = y; if (y > mxy) mxy = y;
          }
          items.push({
            minX: mnx, minY: mny, maxX: mxx, maxY: mxy,
            ...meta, polyline: seg.polyline,
          });
        } else {
          const [x1, y1, x2, y2] = seg.coords;
          items.push({
            minX: Math.min(x1, x2), maxX: Math.max(x1, x2),
            minY: Math.min(y1, y2), maxY: Math.max(y1, y2),
            ...meta,
          });
        }
      });
    }
    tree.load(items);
    return tree;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- allEdgeSegments bilerek
    // parmak izi (edgeGeomKey) uzerinden takip edilir; identity degisimi rebuild
    // TETIKLEMEMELI (OOM fix). Detay: yukaridaki blok yorumu.
  }, [edgeGeomKey]);

  // Hidden/dimmed layer degisince hover/selected gecersiz olabilir, temizle
  useEffect(() => {
    if (hovered && (hiddenLayers?.has(hovered.layer) || dimmedLayers?.has(hovered.layer))) {
      setHovered(null);
    }
    if (selectedLine && (hiddenLayers?.has(selectedLine.layer) || dimmedLayers?.has(selectedLine.layer))) {
      setSelectedLine(null);
    }
  }, [hiddenLayers, dimmedLayers, hovered, selectedLine]);

  // Sabit secimin segmenti diziden dustuyse (layer kaldirildi / yeniden
  // ayrildi) secim gecersiz — kutu tiklama anindaki bayat capa donmesin.
  useEffect(() => {
    if (sabitSecimGecersiz(selectedLine, allEdgeSegments)) setSelectedLine(null);
  }, [selectedLine, allEdgeSegments]);

  // Kilit degisince (Adim 1 ↔ 2) eski layer'in sabit kutusu/hover'i kalmasin.
  // Ham cizgi ('line') kilitli adimda hic secilemez: layer parcalara
  // ayrilinca ham cizgileri secilmez, onlara ait sabit vurgu kalmasin.
  // Kilit KALKINCA (Değiştir, ayrilmamis layer'a gecis, geri al) Adim 2'nin
  // parca secimi de bayattir (25.09 inceleme: kalin mavi kaliyor, kutu
  // imleci baska layer'larin ustunde izliyordu).
  useEffect(() => {
    const gecersiz = (v: HoveredEntity | null) =>
      !!v && v.type !== 'text' && (!kilitliLayer || v.type === 'line' || v.layer !== kilitliLayer);
    setHovered((h) => (gecersiz(h) ? null : h));
    setSelectedLine((s) => (gecersiz(s) ? null : s));
  }, [kilitliLayer]);

  // ─── Render — sahne cache (statik katman) + overlay, RAF ile ─────
  useEffect(() => {
    let rafId = 0;
    const schedule = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(render);
    };

    const drawScene = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.fillStyle = COLOR_BG;
      ctx.fillRect(0, 0, w, h);

      // Adaptive grid (screen space, transform oncesi)
      const rawStep = 50 / viewport.zoom;
      const exponent = Math.floor(Math.log10(rawStep));
      const minorStep = Math.pow(10, exponent);
      const majorStep = minorStep * 10;
      const minorPx = minorStep * viewport.zoom;
      const majorPx = majorStep * viewport.zoom;
      const drawGrid = (stepPx: number, alpha: string) => {
        if (stepPx <= 8) return;
        ctx.strokeStyle = alpha;
        ctx.lineWidth = 1;
        const startX = Math.floor(-viewport.panX / stepPx) * stepPx + viewport.panX;
        const startY = Math.floor(-viewport.panY / stepPx) * stepPx + viewport.panY;
        ctx.beginPath();
        for (let x = startX; x < w; x += stepPx) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
        for (let y = startY; y < h; y += stepPx) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
        ctx.stroke();
      };
      drawGrid(minorPx, 'rgba(255,255,255,0.03)');
      drawGrid(majorPx, 'rgba(255,255,255,0.07)');

      // Viewport culling
      const marginPx = 50;
      const worldMinX = (-marginPx - viewport.panX) / viewport.zoom;
      const worldMaxX = (w + marginPx - viewport.panX) / viewport.zoom;
      const worldMinY = (viewport.panY - (h + marginPx)) / viewport.zoom;
      const worldMaxY = (viewport.panY + marginPx) / viewport.zoom;
      const inView = (x: number, y: number) => x >= worldMinX && x <= worldMaxX && y >= worldMinY && y <= worldMaxY;
      const lineInView = (x1: number, y1: number, x2: number, y2: number) => {
        const lnMinX = Math.min(x1, x2), lnMaxX = Math.max(x1, x2);
        const lnMinY = Math.min(y1, y2), lnMaxY = Math.max(y1, y2);
        return lnMaxX >= worldMinX && lnMinX <= worldMaxX && lnMaxY >= worldMinY && lnMinY <= worldMaxY;
      };

      ctx.save();
      ctx.translate(viewport.panX, viewport.panY);
      ctx.scale(viewport.zoom, -viewport.zoom);

      const strokeWidth = 1 / viewport.zoom;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      const layerColors = geometry?.layer_colors || {};

      if (geometry) {
        const skipLayers = calculatedEdgesByLayer ? new Set(Object.keys(calculatedEdgesByLayer)) : null;

        const normalByLayer = new Map<string, Array<[number, number, number, number]>>();
        const dimmedByLayer = new Map<string, Array<[number, number, number, number]>>();

        for (const ln of geometry.lines) {
          if (hiddenLayers?.has(ln.layer)) continue;
          if (skipLayers?.has(ln.layer)) continue;
          const [x1, y1, x2, y2] = ln.coords;
          if (!lineInView(x1, y1, x2, y2)) continue;
          const bucket = dimmedLayers?.has(ln.layer) ? dimmedByLayer : normalByLayer;
          let arr = bucket.get(ln.layer);
          if (!arr) {
            arr = [];
            bucket.set(ln.layer, arr);
          }
          arr.push(ln.coords);
        }

        // ─── Dimmed layers (önce, arka plana otursun) ─────────────
        if (dimmedByLayer.size > 0) {
          ctx.globalAlpha = DIMMED_ALPHA;
          ctx.strokeStyle = COLOR_DIMMED;
          ctx.lineWidth = strokeWidth;
          ctx.beginPath();
          dimmedByLayer.forEach((coordsList) => {
            for (const [x1, y1, x2, y2] of coordsList) {
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
            }
          });
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // ─── Normal layers (ACI renkli) ───────────────────────────
        // Secili (henuz ayrilmamis) layer KENDI renginde, altinda genis yari
        // saydam bir hare ile cizilir (tasarim). Hare `shadowBlur` DEGIL:
        // golge her pan karesinde tum layer icin yeniden hesaplaniyordu.
        normalByLayer.forEach((coordsList, layer) => {
          const isSelected = selectedLayer === layer;
          const color = aciToColor(layerColors[layer] ?? 7);
          const cizgiYolu = () => {
            ctx.beginPath();
            for (const [x1, y1, x2, y2] of coordsList) {
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
            }
          };
          ctx.strokeStyle = color;
          if (isSelected) {
            ctx.globalAlpha = 0.28;
            ctx.lineWidth = strokeWidth * 12;
            cizgiYolu();
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.lineWidth = strokeWidth * 3;
          } else {
            ctx.globalAlpha = soluklasanLayerlar?.has(layer) ? SOLUK_ALPHA : 1;
            ctx.lineWidth = strokeWidth;
          }
          cizgiYolu();
          ctx.stroke();
        });
        ctx.globalAlpha = 1;
        ctx.lineWidth = strokeWidth;

        // ─── Arcs (normal + dimmed iki pass) ──────────────────────
        if (geometry.arcs.length > 0) {
          const drawArcs = (filterDim: boolean, color: string, alpha: number) => {
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = color;
            ctx.lineWidth = strokeWidth;
            ctx.beginPath();
            for (const a of geometry.arcs) {
              if (hiddenLayers?.has(a.layer)) continue;
              const isDim = !!dimmedLayers?.has(a.layer);
              if (filterDim !== isDim) continue;
              const r = a.radius;
              if (!lineInView(a.center[0] - r, a.center[1] - r, a.center[0] + r, a.center[1] + r)) continue;
              const sa = (a.start_angle * Math.PI) / 180;
              const ea = (a.end_angle * Math.PI) / 180;
              ctx.moveTo(a.center[0] + r * Math.cos(sa), a.center[1] + r * Math.sin(sa));
              ctx.arc(a.center[0], a.center[1], r, sa, ea, false);
            }
            ctx.stroke();
          };
          drawArcs(false, COLOR_PASSIVE, 1);
          if (dimmedLayers && dimmedLayers.size > 0) {
            drawArcs(true, COLOR_DIMMED, DIMMED_ALPHA);
          }
          ctx.globalAlpha = 1;
        }

        // ─── Circles (sprinkler/normal × normal/dimmed = 4 pass) ──
        if (geometry.circles.length > 0) {
          const circleInView = (cx: number, cy: number, r: number) =>
            lineInView(cx - r, cy - r, cx + r, cy + r);

          const drawCircles = (
            filterSprinkler: boolean,
            filterDim: boolean,
            color: string,
            lw: number,
            alpha: number,
          ) => {
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
            ctx.beginPath();
            for (const c of geometry.circles) {
              if (hiddenLayers?.has(c.layer)) continue;
              const isSprink = !!sprinklerLayers?.has(c.layer);
              if (filterSprinkler !== isSprink) continue;
              const isDim = !!dimmedLayers?.has(c.layer);
              if (filterDim !== isDim) continue;
              if (!circleInView(c.center[0], c.center[1], c.radius)) continue;
              ctx.moveTo(c.center[0] + c.radius, c.center[1]);
              ctx.arc(c.center[0], c.center[1], c.radius, 0, Math.PI * 2);
            }
            ctx.stroke();
          };

          drawCircles(true, false, COLOR_SPRINKLER, strokeWidth * 1.6, 1);
          drawCircles(false, false, COLOR_PASSIVE, strokeWidth * 0.8, 1);
          if (dimmedLayers && dimmedLayers.size > 0) {
            drawCircles(true, true, COLOR_DIMMED, strokeWidth * 0.8, DIMMED_ALPHA);
            drawCircles(false, true, COLOR_DIMMED, strokeWidth * 0.8, DIMMED_ALPHA);
          }
          ctx.globalAlpha = 1;
        }

        // ─── Texts (dimmed = gri + %45 alpha, fillText per-text) ──
        if (viewport.zoom >= 0.3 && geometry.texts.length > 0) {
          ctx.textBaseline = 'alphabetic';
          for (let ti = 0; ti < geometry.texts.length; ti++) {
            const t = geometry.texts[ti];
            if (hiddenLayers?.has(t.layer)) continue;
            if (!t.text) continue;
            if (!inView(t.position[0], t.position[1])) continue;
            const isDim = !!dimmedLayers?.has(t.layer);
            ctx.fillStyle = isDim ? COLOR_DIMMED : COLOR_TEXT;
            ctx.globalAlpha = isDim ? DIMMED_ALPHA : 1;
            ctx.save();
            ctx.translate(t.position[0], t.position[1]);
            ctx.scale(1, -1);
            if (t.rotation) ctx.rotate(-t.rotation * Math.PI / 180);
            ctx.font = `${Math.max(t.height, 1)}px ui-monospace, Menlo, Consolas, monospace`;
            ctx.fillText(t.text, 0, 0);
            ctx.restore();
          }
          ctx.globalAlpha = 1;
        }
      }

      // ─── Hesaplanmis parcalar ─────────────────────────────────────
      if (allEdgeSegments && allEdgeSegments.length > 0) {
        const drawSegPath = (seg: EdgeSegment) => {
          if (seg.polyline && seg.polyline.length >= 2) {
            ctx.moveTo(seg.polyline[0][0], seg.polyline[0][1]);
            for (let i = 1; i < seg.polyline.length; i++) {
              ctx.lineTo(seg.polyline[i][0], seg.polyline[i][1]);
            }
          } else {
            ctx.moveTo(seg.coords[0], seg.coords[1]);
            ctx.lineTo(seg.coords[2], seg.coords[3]);
          }
        };

        // Gruplar: renk × opaklik × capsiz (kesikli). Tek beginPath/stroke.
        interface Grup { renk: string; alpha: number; capsiz: boolean; segs: EdgeSegment[] }
        const gruplar = new Map<string, Grup>();
        const dimmedSegs: EdgeSegment[] = [];
        for (const seg of allEdgeSegments) {
          if (hiddenLayers?.has(seg.layer)) continue;
          if (dimmedLayers?.has(seg.layer)) {
            dimmedSegs.push(seg);
            continue;
          }
          const ham = !useDiameterColors || !!hamCizilenLayerlar?.has(seg.layer);
          const capsiz = !ham && isUnassignedDiameter(seg.diameter);
          const renk = ham
            ? aciToColor(layerColors[seg.layer] ?? 7)
            : capsiz ? CAPSIZ_RENGI : diameterToColor(seg.diameter);
          let alpha = soluklasanLayerlar?.has(seg.layer) ? SOLUK_ALPHA : 1;
          if (capsizOdak && !ham && !capsiz && seg.layer === selectedLayer) alpha = CAPSIZ_ODAK_ALPHA;
          const anahtar = `${renk}|${alpha}|${capsiz ? 1 : 0}`;
          let g = gruplar.get(anahtar);
          if (!g) {
            g = { renk, alpha, capsiz, segs: [] };
            gruplar.set(anahtar, g);
          }
          g.segs.push(seg);
        }

        gruplar.forEach((g) => {
          ctx.globalAlpha = g.alpha;
          ctx.strokeStyle = g.renk;
          if (g.capsiz) {
            // EKSIK PARCA TESPITI: capsiz parca turuncu + genis yari saydam
            // hare + KESIKLI. Kesik deseni EKRAN pikseliyle (zoom'a bolunur):
            // cizim biriminde verilseydi uzak zoom'da milyonlarca kesik olurdu.
            ctx.lineWidth = strokeWidth * 7;
            ctx.globalAlpha = g.alpha * 0.22;
            ctx.setLineDash([]);
            ctx.beginPath();
            for (const seg of g.segs) drawSegPath(seg);
            ctx.stroke();
            ctx.globalAlpha = g.alpha;
            ctx.lineWidth = strokeWidth * 2.6;
            ctx.setLineDash([8 / viewport.zoom, 5 / viewport.zoom]);
          } else {
            ctx.lineWidth = strokeWidth * 2.2;
            ctx.setLineDash([]);
          }
          ctx.beginPath();
          for (const seg of g.segs) drawSegPath(seg);
          ctx.stroke();
        });
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        // Dimmed pass: hepsi gri
        if (dimmedSegs.length > 0) {
          ctx.globalAlpha = DIMMED_ALPHA;
          ctx.strokeStyle = COLOR_DIMMED;
          ctx.lineWidth = strokeWidth;
          ctx.beginPath();
          for (const seg of dimmedSegs) drawSegPath(seg);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // ─── T noktalari: beyaz halka (tasarim) ──────────────────────
      if (calculatedJunctionsByLayer) {
        const r = 4.5 / viewport.zoom;
        ctx.lineWidth = 1.6 / viewport.zoom;
        ctx.strokeStyle = COLOR_T_HALKA;
        ctx.fillStyle = COLOR_BG;
        ctx.beginPath();
        let halkaVar = false;
        for (const [layer, pts] of Object.entries(calculatedJunctionsByLayer)) {
          if (hiddenLayers?.has(layer) || dimmedLayers?.has(layer)) continue;
          for (const [jx, jy] of pts) {
            if (!inView(jx, jy)) continue;
            ctx.moveTo(jx + r, jy);
            ctx.arc(jx, jy, r, 0, Math.PI * 2);
            halkaVar = true;
          }
        }
        if (halkaVar) {
          ctx.fill();
          ctx.stroke();
        }
      }

      ctx.restore();  // sahne world-transform'u kapat
    };  // drawScene sonu

    const render = () => {
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      // ── 1) SAHNE CACHE — parmak izi degismediyse 706K cizgi CIZILMEZ ──
      // ⚠ drawScene'in okudugu HER prop burada olmali; eksik prop sahneyi
      // bayat birakir.
      const sceneDeps: unknown[] = [
        geometry, allEdgeSegments, viewport.panX, viewport.panY, viewport.zoom,
        selectedLayer, hiddenLayers, dimmedLayers,
        sprinklerLayers, calculatedJunctionsByLayer,
        useDiameterColors, calculatedEdgesByLayer, hamCizilenLayerlar,
        soluklasanLayerlar, capsizOdak, canvas.width, canvas.height,
      ];
      let scene = sceneCanvasRef.current;
      const prevKey = sceneKeyRef.current;
      const sceneValid =
        !!scene && scene.width === canvas.width && scene.height === canvas.height &&
        !!prevKey && prevKey.length === sceneDeps.length &&
        prevKey.every((v, i) => Object.is(v, sceneDeps[i]));

      if (!sceneValid) {
        if (!scene) {
          scene = document.createElement('canvas');
          sceneCanvasRef.current = scene;
        }
        if (scene.width !== canvas.width) scene.width = canvas.width;
        if (scene.height !== canvas.height) scene.height = canvas.height;
        const sctx = scene.getContext('2d');
        if (!sctx) return;
        sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawScene(sctx, w, h);
        sceneKeyRef.current = sceneDeps;
      }

      // ── 2) BLIT — sahneyi ana canvas'a tek kopyalama (device px 1:1) ──
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(scene as HTMLCanvasElement, 0, 0);
      ctx.restore();

      // ── 3) OVERLAY — hover/flash/secim/halo (az obje, ucuz) ──
      ctx.save();
      ctx.translate(viewport.panX, viewport.panY);
      ctx.scale(viewport.zoom, -viewport.zoom);
      const strokeWidth = 1 / viewport.zoom;
      ctx.lineCap = 'round';

      const drawEntityHighlight = (ent: HoveredEntity, color: string, lwMul: number, glow: string, blur: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = strokeWidth * lwMul;
        ctx.shadowColor = glow;
        ctx.shadowBlur = blur;
        if (ent.type === 'insert') {
          const r = 6 / viewport.zoom;
          ctx.beginPath();
          ctx.arc(ent.coords[0], ent.coords[1], r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.25;
          ctx.fill();
          ctx.globalAlpha = 1;
        } else if (ent.type === 'circle' && ent.center) {
          ctx.beginPath();
          ctx.arc(ent.center[0], ent.center[1], ent.radius ?? 1, 0, Math.PI * 2);
          ctx.stroke();
        } else if (ent.type === 'text') {
          const pad = 1.5 / viewport.zoom;
          ctx.strokeRect(
            ent.coords[0] - pad, ent.coords[1] - pad,
            (ent.coords[2] - ent.coords[0]) + 2 * pad,
            (ent.coords[3] - ent.coords[1]) + 2 * pad,
          );
        } else {
          ctx.beginPath();
          if (ent.polyline && ent.polyline.length >= 2) {
            ctx.moveTo(ent.polyline[0][0], ent.polyline[0][1]);
            for (let i = 1; i < ent.polyline.length; i++) {
              ctx.lineTo(ent.polyline[i][0], ent.polyline[i][1]);
            }
          } else {
            ctx.moveTo(ent.coords[0], ent.coords[1]);
            ctx.lineTo(ent.coords[2], ent.coords[3]);
          }
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
      };

      // ─── HOVER overlay ───────────────────────────────────────────
      // TIKLA-ETIKETLE onizleme: aktif kalem (ya da silgi) varken parca
      // hover'i o renge boyanir — kullanici tiklamadan once sonucu gorur.
      if (hovered) {
        const isTagHover = hovered.type === 'edge' && !!activeTagColor;
        drawEntityHighlight(
          hovered,
          isTagHover ? (activeTagColor as string) : COLOR_HOVER,
          2.2,
          isTagHover ? (activeTagColor as string) : 'rgba(253, 230, 138, 0.7)',
          isTagHover ? 14 : 10,
        );

        // Parca uclarinda nokta: kullanici T noktasinda nerede ayrildigini gorur.
        if (hovered.type === 'edge') {
          const markerR = 4 / viewport.zoom;
          const borderW = 1.5 / viewport.zoom;
          const endpoints: [number, number][] = hovered.polyline && hovered.polyline.length >= 2
            ? [hovered.polyline[0] as [number, number], hovered.polyline[hovered.polyline.length - 1] as [number, number]]
            : [[hovered.coords[0], hovered.coords[1]], [hovered.coords[2], hovered.coords[3]]];
          ctx.globalAlpha = 1;
          for (const [ex, ey] of endpoints) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(ex, ey, markerR + borderW, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = activeTagColor ?? '#3b82f6';
            ctx.beginPath();
            ctx.arc(ex, ey, markerR, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // ─── SABIT SECIM — flastan ONCE cizilir (teyit flasi ustte kalir) ──
      // Parca: notr beyaz hale + parcanin KENDI (canli) cap rengi. 25.09
      // inceleme: marka mavisi paletin ≤80 mm kovasiyla ayniydi ve flasin
      // ustune ciziliyordu — atanan cap rengi gorunmuyordu.
      if (selectedLine) {
        if (selectedLine.type === 'edge') {
          // Kimlikle (indeks kayabilir — onay/ayirma diziyi degistirir).
          const canli = canliSegmentiBul(selectedLine, allEdgeSegments);
          const kendiRengi = canli && !isUnassignedDiameter(canli.diameter) ? diameterToColor(canli.diameter) : CAPSIZ_RENGI;
          ctx.globalAlpha = 0.5;
          drawEntityHighlight(selectedLine, '#ffffff', 6, 'rgba(255, 255, 255, 0.6)', 10);
          ctx.globalAlpha = 1;
          drawEntityHighlight(selectedLine, kendiRengi, 2.2, 'transparent', 0);
        } else {
          drawEntityHighlight(selectedLine, COLOR_LINE_SELECTED, 3, 'rgba(59, 130, 246, 0.8)', 14);
        }
      }

      // ─── TAG FLASH — SEGMENT IZOLASYONU teyidi (operasyon madde 2) ──
      if (flashSegment && allEdgeSegments && Date.now() - flashSegment.at < 900) {
        const fs = allEdgeSegments.find((s) => ayniParca(s, flashSegment));
        if (fs) {
          ctx.save();
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.shadowColor = flashSegment.color;
          ctx.shadowBlur = 20;
          ctx.globalAlpha = 0.5;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = strokeWidth * 5.5;
          ctx.beginPath();
          if (fs.polyline && fs.polyline.length >= 2) {
            ctx.moveTo(fs.polyline[0][0], fs.polyline[0][1]);
            for (let i = 1; i < fs.polyline.length; i++) ctx.lineTo(fs.polyline[i][0], fs.polyline[i][1]);
          } else {
            ctx.moveTo(fs.coords[0], fs.coords[1]);
            ctx.lineTo(fs.coords[2], fs.coords[3]);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = flashSegment.color;
          ctx.lineWidth = strokeWidth * 2.8;
          ctx.stroke();
          const fEnds: [number, number][] = fs.polyline && fs.polyline.length >= 2
            ? [fs.polyline[0] as [number, number], fs.polyline[fs.polyline.length - 1] as [number, number]]
            : [[fs.coords[0], fs.coords[1]], [fs.coords[2], fs.coords[3]]];
          const fr = 5 / viewport.zoom;
          for (const [ex, ey] of fEnds) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(ex, ey, fr + 1.5 / viewport.zoom, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = flashSegment.color;
            ctx.beginPath();
            ctx.arc(ex, ey, fr, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      }

      // ─── FOCUS HALO — cap satirindan gezinme (overlay katmani) ──
      if (focusedSegment) {
        const fs = focusedSegment;
        const haloColor = focusedHaloColor || '#fde047';
        const haloPath = () => {
          ctx.beginPath();
          if (fs.polyline && fs.polyline.length >= 2) {
            ctx.moveTo(fs.polyline[0][0], fs.polyline[0][1]);
            for (let i = 1; i < fs.polyline.length; i++) {
              ctx.lineTo(fs.polyline[i][0], fs.polyline[i][1]);
            }
          } else {
            ctx.moveTo(fs.coords[0], fs.coords[1]);
            ctx.lineTo(fs.coords[2], fs.coords[3]);
          }
        };
        ctx.save();
        ctx.shadowColor = haloColor;
        ctx.shadowBlur = 18;
        ctx.strokeStyle = haloColor;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = strokeWidth * 6;
        haloPath();
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineWidth = strokeWidth * 2.8;
        haloPath();
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    };

    schedule();
    return () => cancelAnimationFrame(rafId);
  }, [geometry, allEdgeSegments, calculatedJunctionsByLayer, calculatedEdgesByLayer, viewport, selectedLayer, hiddenLayers, dimmedLayers, sprinklerLayers, hovered, selectedLine, useDiameterColors, hamCizilenLayerlar, soluklasanLayerlar, capsizOdak, focusedSegment, focusedHaloColor, activeTagColor, flashSegment, flashTick, resizeTick]);

  // ─── Hover detection (rbush ile O(log N)) ────────────────────────
  const computeHovered = useCallback(
    (worldX: number, worldY: number): HoveredEntity | null => {
      const tol = HOVER_TOL_PX / viewport.zoom;
      const kutu = {
        minX: worldX - tol, minY: worldY - tol,
        maxX: worldX + tol, maxY: worldY + tol,
      };
      const candidates = hamIndeks.search(kutu).concat(parcaIndeks.search(kutu));
      // SECIM ONCELIGI — Adim 1: nokta entity (insert) > cember > yazi > boru.
      // Adim 2 (cap-ata): PARCA once; yazi ve blok yalniz toleransta parca
      // yoksa (25.09 inceleme: borunun yanindaki "Ø110" etiketi tiklamayi
      // yutuyor, cap atanmiyordu).
      const PRIORITY: Record<EntityKind, number> = etkilesimModu === 'cap-ata'
        ? { edge: 0, insert: 1, circle: 2, text: 3, line: 4 }
        : { insert: 0, circle: 1, text: 2, edge: 3, line: 4 };
      let best: SpatialEntry | null = null;
      let bestPrio = Infinity;
      let bestDist = Infinity;
      for (const c of candidates) {
        if (hiddenLayers?.has(c.layer)) continue;
        if (dimmedLayers?.has(c.layer)) continue;
        // Hesaplanmis layer'in HAM cizgisi secilmez — parcalari secilir.
        if (c.type === 'line' && hesaplananlar.has(c.layer)) continue;
        // ADIM 2 KILIDI: cap atarken yalniz secili layer'in parcalari (ve
        // okunmak icin yazilar) yanit verir; baska layer secilemez.
        if (kilitliLayer && c.type !== 'text' && c.layer !== kilitliLayer) continue;

        let d: number;
        if (c.type === 'insert') {
          d = Math.hypot(worldX - c.coords[0], worldY - c.coords[1]);
          if (d > tol + 2) continue;
        } else if (c.type === 'circle') {
          const dc = Math.hypot(worldX - c.center![0], worldY - c.center![1]);
          d = Math.abs(dc - (c.radius ?? 0));
          if (d > tol && dc > (c.radius ?? 0)) continue;
          if (dc <= (c.radius ?? 0)) d = Math.min(d, tol * 0.5);
        } else if (c.type === 'text') {
          if (
            worldX < c.minX - tol || worldX > c.maxX + tol ||
            worldY < c.minY - tol || worldY > c.maxY + tol
          ) continue;
          d = 0;
        } else if (c.polyline && c.polyline.length >= 2) {
          d = Infinity;
          for (let i = 0; i < c.polyline.length - 1; i++) {
            const di = pointToSegmentDistance(
              worldX, worldY,
              c.polyline[i][0], c.polyline[i][1],
              c.polyline[i + 1][0], c.polyline[i + 1][1],
            );
            if (di < d) d = di;
          }
          if (d > tol) continue;
        } else {
          d = pointToSegmentDistance(worldX, worldY, c.coords[0], c.coords[1], c.coords[2], c.coords[3]);
          if (d > tol) continue;
        }

        const prio = PRIORITY[c.type];
        if (prio < bestPrio || (prio === bestPrio && d < bestDist)) {
          best = c;
          bestPrio = prio;
          bestDist = d;
        }
      }
      if (!best) return null;
      // Cap/miras bilgisi CANLI okunur — index'te tutulmaz (OOM fix, stale onlemi)
      const liveSeg = best.type === 'edge' ? allEdgeSegments?.[best.index] : undefined;
      return {
        type: best.type,
        layer: best.layer,
        index: best.index,
        coords: best.coords,
        polyline: best.polyline,
        length: (best.type === 'line' || best.type === 'edge')
          ? resolveHoverLength({ ...(best as { type: 'line' | 'edge'; length?: number; coords: [number, number, number, number]; polyline?: Array<[number, number]> }), length: liveSeg?.length ?? best.length }, scale)
          : undefined,
        diameter: liveSeg?.diameter || undefined,
        isInherited: liveSeg?.is_inherited || false,
        text: best.text,
        insertName: best.insertName,
        center: best.center,
        radius: best.radius,
        height: best.height,
      };
    },
    [hamIndeks, parcaIndeks, hesaplananlar, etkilesimModu, viewport.zoom, hiddenLayers, dimmedLayers, kilitliLayer, scale, allEdgeSegments],
  );

  // ─── Mouse pozisyonu → world coord + hover (RAF ile kare basina 1) ────
  const moveRafRef = useRef(0);
  const lastMoveRef = useRef<{ clientX: number; clientY: number } | null>(null);
  useEffect(() => () => cancelAnimationFrame(moveRafRef.current), []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      pointerHandlers.onPointerMove(e); // pan — throttle'siz, gercek zamanli
      lastMoveRef.current = { clientX: e.clientX, clientY: e.clientY };
      if (moveRafRef.current) return; // bu frame icin zaten planli
      moveRafRef.current = requestAnimationFrame(() => {
        moveRafRef.current = 0;
        const pos = lastMoveRef.current;
        const el = containerRef.current;
        if (!pos || !el) return;
        const rect = el.getBoundingClientRect();
        const mx = pos.clientX - rect.left;
        const my = pos.clientY - rect.top;
        const worldX = (mx - viewport.panX) / viewport.zoom;
        const worldY = (viewport.panY - my) / viewport.zoom;
        setCursorWorld({ x: worldX, y: worldY });
        setCursorScreen({ x: mx, y: my });

        if (isDragging()) return;
        const newHover = computeHovered(worldX, worldY);
        setHovered((prev) => {
          if (newHover?.type === prev?.type && newHover?.index === prev?.index && newHover?.layer === prev?.layer) {
            return prev;
          }
          return newHover;
        });
      });
    },
    [pointerHandlers, viewport.panX, viewport.panY, viewport.zoom, computeHovered, isDragging],
  );

  // ─── Click hit-test ──────────────────────────────────────────────
  const handleClick = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      if (wasDragged()) return;
      const el = containerRef.current;
      if (!el || !geometry) return;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const worldX = (mx - viewport.panX) / viewport.zoom;
      const worldY = (viewport.panY - my) / viewport.zoom;

      // TAM TIKLANABILIRLIK: tum tipler tek spatial sorgudan (oncelik, gizli/
      // soluk/kilit suzgecleri computeHovered icinde — tek dogruluk kaynagi).
      const target = computeHovered(worldX, worldY);
      if (target) {
        if (target.type === 'insert') {
          setSelectedLine(null);
          onInsertClick?.({
            layer: target.layer,
            insertIndex: target.index,
            insertName: target.insertName ?? '',
            position: [target.coords[0], target.coords[1]],
          });
          return;
        }
        if (target.type === 'circle') {
          setSelectedLine(null);
          onCircleClick?.({
            layer: target.layer,
            circleIndex: target.index,
            center: target.center ?? [target.coords[0], target.coords[1]],
            radius: target.radius ?? 0,
          });
          return;
        }
        if (target.type === 'text') {
          // Yazi secimi: sabit bilgi kutusu icerigi gosterir (Esc ile kalkar)
          setSelectedLine(target);
          return;
        }
        // Adim 1'de tiklama LAYER SECER — kutuyu sabitlemek "Seçmek için
        // tıklayın" yazisini secimden sonra da ekranda birakiyordu. Kutu
        // yalniz Adim 2'de, kalem/silgi KAPALIYKEN (parca bilgisi okunurken)
        // sabitlenir. 25.09 inceleme: kalemle art arda atarken her tik kutuyu
        // bir onceki parcaya sabitliyor, imlecin altindaki parcayi degil onu
        // anlatiyordu; mavi secim vurgusu da atanan cap rengini ortuyordu.
        setSelectedLine(etkilesimModu === 'cap-ata' && !activeTagColor ? target : null);
        if (target.type === 'line') {
          onLineClick?.({ layer: target.layer, index: target.index, shiftKey: e.shiftKey, screenX: e.clientX, screenY: e.clientY });
        } else if (target.type === 'edge' && allEdgeSegments) {
          onSegmentClick?.(allEdgeSegments[target.index]);
        }
        return;
      }

      // Hicbir sey tutmadi → sabit kutuyu kaldir
      setSelectedLine(null);
      onClearSelection?.();
    },
    [geometry, allEdgeSegments, viewport, wasDragged, computeHovered, etkilesimModu, activeTagColor, onLineClick, onCircleClick, onInsertClick, onSegmentClick, onClearSelection],
  );

  // Esc → sabit kutu ve hover temizlenir
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedLine(null);
        setHovered(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const cursorClass = hovered ? 'cursor-pointer' : 'cursor-crosshair';

  // Bilgi kutusu varligi: selectedLine/hovered tiklama anindaki fotograftir,
  // tiklama capi o fotograftan SONRA yazar/siler — cap/miras canli okunur.
  const tooltipEntity = useMemo(() => {
    const ent = selectedLine ?? hovered;
    return ent ? canliCapliVarlik(ent, allEdgeSegments) : null;
  }, [selectedLine, hovered, allEdgeSegments]);

  const tooltipLayerRengi = tooltipEntity
    ? aciToColor(geometry?.layer_colors?.[tooltipEntity.layer] ?? 7)
    : '#94a3b8';

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden ${cursorClass} ${className}`}
      style={{ touchAction: 'none', backgroundColor: COLOR_BG }}
      onPointerDown={pointerHandlers.onPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(e) => {
        pointerHandlers.onPointerUp(e);
        handleClick(e);
      }}
      onPointerCancel={pointerHandlers.onPointerCancel}
      onPointerLeave={() => {
        setCursorWorld(null);
        setCursorScreen(null);
        setHovered(null);
      }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />

      {/* Bilgi kutusu — hover ya da sabit (tiklanmis) */}
      {tooltipEntity && cursorScreen && (
        <Tooltip
          entity={tooltipEntity}
          screenX={cursorScreen.x}
          screenY={cursorScreen.y}
          pinned={!!selectedLine}
          mod={etkilesimModu}
          seciliLayer={selectedLayer ?? null}
          layerRengi={tooltipLayerRengi}
          genislik={containerRef.current?.clientWidth ?? 0}
          yaklasik={!!yaklasikLayerlar?.has(tooltipEntity.layer)}
        />
      )}

      {/* Koordinat + yakinlik (sol alt) */}
      <div className="pointer-events-none absolute bottom-3 left-4 font-mono text-[11px] tabular-nums text-slate-400">
        {cursorWorld
          ? `X ${tr2(cursorWorld.x)} · Y ${tr2(cursorWorld.y)} · `
          : ''}
        %{(viewport.zoom * 100).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
      </div>

      {/* Durumlar */}
      {!fileId && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 text-sm text-slate-300">
          Çizim için önce DWG yükleyin
        </div>
      )}
      {fileId && loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-blue-400" aria-hidden="true" />
            <p className="text-xs text-slate-300">Çizim hazırlanıyor…</p>
          </div>
        </div>
      )}
      {fileId && !loading && error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 p-4">
          <div className="flex max-w-md items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-red-300">Çizim yüklenemedi</p>
              <p className="mt-1 text-xs text-slate-300">{error}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default DxfCanvasViewer;

// ─── Helpers ────────────────────────────────────────────────────────

function pointToSegmentDistance(
  px: number, py: number,
  x1: number, y1: number, x2: number, y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// computeEntityLength + resolveHoverLength ./segment-length modulunde.

// ─── Bilgi kutusu ────────────────────────────────────────────────────

interface TooltipProps {
  entity: HoveredEntity;
  screenX: number;
  screenY: number;
  /** Tiklanmis (sabit) ise true. */
  pinned: boolean;
  mod: 'layer-sec' | 'cap-ata';
  /** Zaten secili layer "Seçmek için tıklayın" demesin. */
  seciliLayer: string | null;
  /** Layer'in cizim rengi (Adim 1 kutusundaki kare). */
  layerRengi: string;
  /** Kap genisligi — kutu sag kenardan tasarsa imlecin soluna gecer. */
  genislik: number;
  /** Parca uzunlugu yeni birime cevrilmis on hesap ("≈"). */
  yaklasik: boolean;
}

const tr1 = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** Koordinat: Turkce binlik + iki ondalik ("152.340,25") — yanindaki yakinlik
 *  yuzdesiyle ayni bicim (25.09 inceleme: nokta/virgul karisikti). */
const tr2 = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Tooltip({ entity, screenX, screenY, pinned, mod, seciliLayer, layerRengi, genislik, yaklasik }: TooltipProps) {
  const KUTU = 240;
  const solda = genislik > 0 && screenX + 18 + KUTU > genislik;
  const stil: React.CSSProperties = solda
    ? { right: `${genislik - screenX + 18}px`, top: `${screenY - 24}px`, maxWidth: `${KUTU}px` }
    : { left: `${screenX + 18}px`, top: `${screenY - 24}px`, maxWidth: `${KUTU}px` };

  let isaret: React.ReactNode;
  let baslik: string;
  let alt: string;
  if (entity.type === 'text') {
    isaret = <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[#fbbf24]" />;
    baslik = `“${entity.text ?? ''}”`;
    alt = `Yazı · ${entity.layer}`;
  } else if (mod === 'cap-ata' && entity.type === 'edge') {
    const capli = !isUnassignedDiameter(entity.diameter);
    isaret = (
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: capli ? diameterToColor(entity.diameter as string) : CAPSIZ_RENGI }}
      />
    );
    baslik = capli ? (entity.diameter as string) : 'Çapsız parça';
    alt = `Parça: ${yaklasik ? '≈' : ''}${tr1(entity.length ?? 0)} m · ${entity.layer}`;
  } else {
    isaret = <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: layerRengi }} />;
    baslik = `Layer: ${entity.layer}`;
    const eylem = entity.layer === seciliLayer ? 'seçili layer' : 'seçmek için tıklayın';
    alt = entity.type === 'insert' && entity.insertName
      ? `Blok: ${entity.insertName} · ${eylem}`
      : eylem.charAt(0).toLocaleUpperCase('tr-TR') + eylem.slice(1);
  }

  return (
    <div
      className={`pointer-events-none absolute z-20 rounded-lg border bg-[#0f172a] px-3 py-2 shadow-xl ${pinned ? 'border-[#cbd5e1]' : 'border-[#334155]'}`}
      style={stil}
    >
      <div className="flex items-center gap-2">
        {isaret}
        <span className="truncate text-xs font-semibold text-white">{baslik}</span>
      </div>
      <div className="mt-0.5 truncate text-[11px] text-[#94a3b8]">{alt}</div>
      {/* Sabit kutu hover kutusundan AYIRT edilir (25.09 inceleme: ikisi ayni
          gorunuyordu, kullanici imlecin altindaki parcayi okudugunu saniyordu). */}
      {pinned && <div className="mt-1 text-[10px] font-semibold text-[#cbd5e1]">Sabitlendi · Esc ile kaldırın</div>}
    </div>
  );
}
