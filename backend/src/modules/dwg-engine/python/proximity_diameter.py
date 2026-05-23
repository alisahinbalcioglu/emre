"""
Proximity-tabanli deterministic diameter atama.

GENEL MANTIK (kullanici PRD'si):
  "Her boru segmentine fiziksel olarak EN YAKIN text/mtext entity'sinin
   icerigi o segmente cap olarak atanir."

FELSEFE:
  - Filter YOK (regex, uzunluk, rakam zorunlulugu — hicbiri).
  - Kullanici text'i borunun yanina bilincli yerlestirdiyse niyeti captir.
  - Algoritma sadece FIZIKSEL PROXIMITY'i kabul eder, icerigi yorumlamaz.
  - Yanlis atama olursa kullanici DiameterEditPopup ile manuel duzeltir.

TEK SINIRLAMA: mesafe esigi (max_distance_world).
  - Text segment'ten cok uzaksa (>esik) atama YAPILMAZ — sayfa basligi,
    kapasite degeri, baska blok'un text'i karismaz.

OPSIYONEL FILTER: sprinkler layer'larindaki text'ler atlanir.
  - Kullanici manuel sprinkler layer'i isaretledigi icin o layer'lardaki
    text'ler genelde ID etiketi ('S1', 'K115'), cap degil.

ALGORITMA:
  - Her segment icin point-to-line-segment distance ile en yakin text bul.
  - Polyline'li segment'lerde her ardisik vertex pair'i ayri parca, min mesafe.
  - Distance esik altindaysa text.value -> seg.diameter (orijinal aynen).

Performans: O(N*M) brute force. ~500 seg x ~300 text = 150K compare, ~50ms.
"""
from __future__ import annotations

import math
import logging
from typing import Any


def _point_to_segment_distance(
    px: float, py: float,
    x1: float, y1: float, x2: float, y2: float,
) -> float:
    """Bir nokta (px,py) ile bir cizgi parcasinin [(x1,y1)-(x2,y2)] arasindaki
    EN KISA mesafe. Projection segment disinda kalirsa, en yakin endpoint'e duser.

    Bu fonksiyon midpoint'ten degil, cizginin HERHANGI BIR NOKTASINDAN olan
    mesafeyi hesaplar — uzun borularda cap text borunun BIR UCUNDA olsa bile
    yakaladigi icin midpoint-only yaklasimdan cok daha dogru.
    """
    dx = x2 - x1
    dy = y2 - y1
    lensq = dx * dx + dy * dy
    if lensq < 1e-12:
        return math.hypot(px - x1, py - y1)
    t = ((px - x1) * dx + (py - y1) * dy) / lensq
    if t < 0.0:
        t = 0.0
    elif t > 1.0:
        t = 1.0
    proj_x = x1 + t * dx
    proj_y = y1 + t * dy
    return math.hypot(px - proj_x, py - proj_y)


def _segment_polyline_points(seg) -> list[tuple[float, float]]:
    """Segment'in koselerini list of (x,y) olarak don. Polyline varsa onun
    vertex'leri, yoksa basit iki uctan olusur."""
    if isinstance(seg, dict):
        pl = seg.get("polyline") or []
        if pl and len(pl) >= 2:
            return [(float(p[0]), float(p[1])) for p in pl
                    if isinstance(p, (list, tuple)) and len(p) >= 2]
        return [(seg["x1"], seg["y1"]), (seg["x2"], seg["y2"])]
    # EdgeSegment Pydantic model
    pl = getattr(seg, "polyline", None) or []
    if pl and len(pl) >= 2:
        return [(float(p[0]), float(p[1])) for p in pl
                if isinstance(p, (list, tuple)) and len(p) >= 2]
    c = seg.coords
    return [(c[0], c[1]), (c[2], c[3])]


def _autocad_decode(s: str) -> str:
    """AutoCAD %%c -> Ø gibi escape'leri cozer (geometry.py ile tutarli)."""
    if not s:
        return ""
    s = s.replace("%%c", "Ø").replace("%%C", "Ø")
    s = s.replace("%%d", "°").replace("%%D", "°")
    s = s.replace("%%p", "±").replace("%%P", "±")
    return s


def _extract_all_texts(doc, excluded_layers: set[str] | None = None) -> list[dict]:
    """DXF modelspace'inden TUM TEXT/MTEXT entity'lerini cikar — FILTER YOK.
    Sadece sprinkler layer'lari (kullanici isaretledi) atlanir.

    Args:
        doc: ezdxf Drawing
        excluded_layers: bu layer'lardaki text'ler atlanir (sprinkler ID'leri vb.)

    Returns:
        [{"x": float, "y": float, "value": str, "layer": str}, ...]
    """
    excluded_layers = excluded_layers or set()
    texts: list[dict] = []
    try:
        msp = doc.modelspace()
    except Exception:
        return texts

    for entity in msp:
        etype = entity.dxftype()
        if etype not in ("TEXT", "MTEXT"):
            continue
        try:
            layer = str(getattr(entity.dxf, "layer", "") or "")
            if layer in excluded_layers:
                continue
            if etype == "TEXT":
                raw = str(getattr(entity.dxf, "text", "") or "")
            else:
                # MTEXT — formatting code'lari temizle
                raw = entity.plain_text() if hasattr(entity, "plain_text") else str(entity.dxf.text)
                raw = str(raw).replace("\n", " ")
            txt = _autocad_decode(raw).strip()
            if not txt:
                continue
            pos = entity.dxf.insert
            x = float(pos.x)
            y = float(pos.y)
            texts.append({"x": x, "y": y, "value": txt, "layer": layer})
        except (AttributeError, TypeError, ValueError):
            continue
    return texts


def _nearest_text(seg, texts: list[dict]) -> tuple[dict, float] | None:
    """Segment cizgisinin HERHANGI BIR NOKTASINDAN en yakin text'i + mesafesini
    dondur. Midpoint'ten degil — uzun borularda cap text borunun ucunda olsa
    bile dogru yakalansin (kullanici talimati: 'boruya en yakin text').

    Polyline'li segment varsa her ardisik vertex pair'i ayri cizgi parcasi
    olarak ele alinir; min mesafe alinir.
    """
    if not texts:
        return None
    points = _segment_polyline_points(seg)
    if len(points) < 2:
        return None
    best = None
    best_d = math.inf
    for t in texts:
        tx = t["x"]
        ty = t["y"]
        seg_d = math.inf
        for i in range(len(points) - 1):
            x1, y1 = points[i]
            x2, y2 = points[i + 1]
            d = _point_to_segment_distance(tx, ty, x1, y1, x2, y2)
            if d < seg_d:
                seg_d = d
        if seg_d < best_d:
            best_d = seg_d
            best = t
    if best is None:
        return None
    return (best, best_d)


def assign_diameters_by_proximity(
    doc,
    edge_segments: list[Any],   # list[EdgeSegment] — mutate in place
    sprinkler_layers: set[str] | None = None,
    max_distance_world: float | None = None,
) -> dict:
    """
    Her edge_segment icin en yakin TEXT/MTEXT entity'sini bul, segment.diameter ata.
    Saf proximity — text icerigi REGEX ile filtrelenmez, aynen kullanilir.

    Args:
        doc: ezdxf Drawing
        edge_segments: list of EdgeSegment (Pydantic) — diameter field'i mutate edilir
        sprinkler_layers: bu layer'lardaki text'ler havuzdan dusurulur (ID etiketi)
        max_distance_world: opsiyonel uzaklik esigi (DWG world unit). None = sinir yok.
                            Esik altinda text -> atama; uzerinde -> atama yok.

    Returns:
        {
            "assigned_count": int,
            "skipped_count": int,
            "text_pool_size": int,
            "warnings": list[str],
        }
    """
    warnings: list[str] = []
    texts = _extract_all_texts(doc, excluded_layers=sprinkler_layers)
    pool_size = len(texts)
    if pool_size == 0:
        warnings.append("Proximity: DXF'te hicbir TEXT/MTEXT entity'si bulunamadi")
        return {
            "assigned_count": 0,
            "skipped_count": len(edge_segments),
            "text_pool_size": 0,
            "warnings": warnings,
        }

    assigned = 0
    for es in edge_segments:
        try:
            current = getattr(es, "diameter", "") or ""
            if current and current != "Belirtilmemis":
                continue  # zaten dolu (manuel override veya onceki atama)
            result = _nearest_text(es, texts)
            if result is None:
                continue
            top_text, dist = result
            if max_distance_world is not None and dist > max_distance_world:
                continue
            es.diameter = top_text["value"]
            assigned += 1
        except Exception as _e:
            logging.warning("proximity assign segment skip: %s", _e)
            continue

    skipped = sum(
        1 for es in edge_segments
        if not (getattr(es, "diameter", "") or "")
    )
    return {
        "assigned_count": assigned,
        "skipped_count": skipped,
        "text_pool_size": pool_size,
        "warnings": warnings,
    }
