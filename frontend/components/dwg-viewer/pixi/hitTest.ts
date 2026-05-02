/**
 * Merkezi hit-test dispatcher.
 *
 * Eski yapi: 28K obje × per-entity Pixi Graphics + pointertap listener
 *   = 28K bbox iterasyonu her pointermove'da. Pan/zoom takiliyor.
 *
 * Yeni yapi: World container'da TEK pointertap. Tiklanilan world koordinatini
 * RBush'a sor, bbox aday'larini exact-test ile filtrele, en yakin entity'i don.
 *
 * Bu modul Pixi'den bagimsiz — saf TS. World'un toLocal cagrisi DxfPixiViewer'da
 * yapilir, sonuc burayi besler.
 */

import type { EntityIndex, Entity } from '../useEntityIndex';
import type { GeometryArc, GeometryCircle, GeometryLine } from '../types';

/** Tıklama dispatch onceligi — ayni noktada cakisma varsa tercih sirasi.
 *  UX: kullanici sembol/sprinkler ustune tikladiysa ekipman secilsin, alttaki
 *  cizgi degil. */
const TYPE_PRIORITY: Record<Entity['type'], number> = {
  insert: 100,
  circle: 90,
  arc: 80,
  text: 70,
  segment: 60,
  line: 50,
};

/**
 * Bir noktaya en yakin entity'i bul. Bbox query → exact distance → priority tie-break.
 *
 * @param worldX/worldY Tiklanan dunya-uzayi koordinati
 * @param zoom World scale (`viewport.zoom`) — tolerans hesabi icin
 * @param index RBush + Map
 * @param hiddenLayers Filter — gizli layer entity'leri sonuctan dusurulur
 * @returns En iyi aday entity, veya null
 */
export function pickEntityAt(
  worldX: number,
  worldY: number,
  zoom: number,
  index: EntityIndex,
  hiddenLayers: Set<string> | undefined,
): Entity | null {
  if (!index.size) return null;
  const safeZoom = zoom > 1e-8 ? zoom : 1;
  // 8 ekran piksel toleransi → dunya birimine cevir
  const tolWorld = 8 / safeZoom;

  // 1) RBush sorgu — tolerans bbox'i icindeki tum aday id'ler
  const candidates = index.tree.search({
    minX: worldX - tolWorld,
    minY: worldY - tolWorld,
    maxX: worldX + tolWorld,
    maxY: worldY + tolWorld,
  });
  if (candidates.length === 0) return null;

  // 2) Exact-test + priority tie-break
  let best: Entity | null = null;
  let bestDist = Infinity;
  let bestPriority = -1;

  for (const c of candidates) {
    const ent = index.map.get(c.id);
    if (!ent) continue;
    if (hiddenLayers && hiddenLayers.has(ent.layer)) continue;

    const dist = exactDistance(worldX, worldY, ent, tolWorld);
    if (dist === null) continue; // exact-test reddetti

    const priority = TYPE_PRIORITY[ent.type];
    // En yakin olan kazanir; mesafe ~esit ise yuksek priority kazanir
    const distEpsilon = tolWorld * 0.25;
    if (dist + distEpsilon < bestDist) {
      best = ent;
      bestDist = dist;
      bestPriority = priority;
    } else if (Math.abs(dist - bestDist) <= distEpsilon && priority > bestPriority) {
      best = ent;
      bestDist = dist;
      bestPriority = priority;
    }
  }

  return best;
}

/**
 * Tip-bazli kesin mesafe hesabi. Bbox sorgu false-positive verebilir; bu
 * adim "gercekten tikladi mi" sorusunu kesin cevaplar.
 *
 * @returns metre cinsinden mesafe (nokta → entity), veya null = tiklamadi.
 */
function exactDistance(
  px: number,
  py: number,
  ent: Entity,
  tolWorld: number,
): number | null {
  switch (ent.payload.type) {
    case 'line': {
      // LINE: nokta-segment mesafesi. Tolerans icindeyse mesafeyi don.
      const ln = ent.payload.data;
      const [x1, y1, x2, y2] = ln.coords;
      const d = pointToSegmentDistance(px, py, x1, y1, x2, y2);
      return d <= tolWorld ? d : null;
    }
    case 'segment': {
      // EdgeSegment: polyline varsa multi-segment mesafe; yoksa coords
      const seg = ent.payload.data;
      let minD = Infinity;
      if (seg.polyline && seg.polyline.length >= 2) {
        for (let i = 0; i < seg.polyline.length - 1; i++) {
          const [a, b] = seg.polyline[i];
          const [c, d] = seg.polyline[i + 1];
          const di = pointToSegmentDistance(px, py, a, b, c, d);
          if (di < minD) minD = di;
        }
      } else if (seg.coords && seg.coords.length === 4) {
        minD = pointToSegmentDistance(px, py, seg.coords[0], seg.coords[1], seg.coords[2], seg.coords[3]);
      }
      return minD <= tolWorld ? minD : null;
    }
    case 'circle': {
      // CIRCLE: ring hit (cevreden mesafe), VEYA dolu daire icindeyse 0
      const c = ent.payload.data;
      return distanceToCircleRing(px, py, c, tolWorld);
    }
    case 'arc': {
      // ARC: cevreden mesafe + acisal range icinde mi kontrolu
      const a = ent.payload.data;
      return distanceToArcRing(px, py, a, tolWorld);
    }
    case 'insert':
    case 'text': {
      // INSERT/TEXT: bbox-icinde testi yeterli (hit area zaten bbox)
      const [minX, minY, maxX, maxY] = ent.bbox;
      if (px < minX - tolWorld || px > maxX + tolWorld) return null;
      if (py < minY - tolWorld || py > maxY + tolWorld) return null;
      // Bbox icine olan en kisa mesafe (cikinti varsa)
      const dx = px < minX ? minX - px : px > maxX ? px - maxX : 0;
      const dy = py < minY ? minY - py : py > maxY ? py - maxY : 0;
      return Math.hypot(dx, dy);
    }
  }
}

/** Nokta → segment mesafesi (klasik proje + clamp). */
function pointToSegmentDistance(
  px: number, py: number,
  x1: number, y1: number, x2: number, y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) {
    // Degenerate segment — sadece x1,y1 noktasi
    return Math.hypot(px - x1, py - y1);
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

/** Nokta → CIRCLE cevresi mesafesi. Dolu cember icinde ise 0 (sembol secimi). */
function distanceToCircleRing(
  px: number, py: number, c: GeometryCircle, tolWorld: number,
): number | null {
  const [cx, cy] = c.center;
  const r = c.radius;
  const distToCenter = Math.hypot(px - cx, py - cy);
  // Sprinkler/sembol cemberi: kullanici icine de tiklasa secilsin
  if (distToCenter <= r) return 0;
  // Disinda → cevreye mesafe
  const ringDist = distToCenter - r;
  return ringDist <= tolWorld ? ringDist : null;
}

/** Nokta → ARC cevresi + acisal range. */
function distanceToArcRing(
  px: number, py: number, a: GeometryArc, tolWorld: number,
): number | null {
  const [cx, cy] = a.center;
  const r = a.radius;
  const dx = px - cx;
  const dy = py - cy;
  const distToCenter = Math.hypot(dx, dy);
  // Cevreye mesafe (radyal)
  const ringDist = Math.abs(distToCenter - r);
  if (ringDist > tolWorld) return null;

  // Acisal range — DXF: derece, x-eksenin saat yonune ters
  const angDeg = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
  const sa = ((a.start_angle % 360) + 360) % 360;
  const ea = ((a.end_angle % 360) + 360) % 360;
  // CCW range testi: sa → ea (sayilar saat ters yonunde artar)
  let inRange: boolean;
  if (sa <= ea) {
    inRange = angDeg >= sa && angDeg <= ea;
  } else {
    // 0° geçişli range (örn 350 → 30)
    inRange = angDeg >= sa || angDeg <= ea;
  }
  return inRange ? ringDist : null;
}

// Tip seviyesinde helper unused-import silecek olursak compile uyari verir;
// pointToSegmentDistance disinda hepsi internal — sadece public API'yi export ettik.
// (Yukaridaki GeometryLine import'u tip kontrolu icin kullanildi sadece, Tüm exportlar yukarida.)
export type { GeometryLine };
