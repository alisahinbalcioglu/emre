"""
Proximity-tabanli deterministic diameter atama.

PRD: "her boru segmentinin midpoint'inden en yakin diameter text'i bul,
segment.diameter = text.value olarak set et."

AI/Claude YOK. Sadece Euclidean mesafe + cap-format regex.
geometry.py'daki _DIAMETER_TEXT_RE mantigi (same regex re-used) ile
TEXT/MTEXT entity'leri filtrelenir.

Performans: O(N*M) brute force. Tipik DWG: ~500 segment x ~300 text =
150K comparison ~50ms. R-tree gereksiz.
"""
from __future__ import annotations

import math
import re
import logging
from typing import Any

# Cap-format text regex — EXTRACT mantigi: string ICINDE cap pattern'i ara,
# tam string match istemeden. DWG'de cap text'leri genelde:
#   - Saf format: "Ø200", "DN150"
#   - Spec string icinde: "HDPE 100 PN 16 Ø200", "PE 32 PN6 Ø50"
# Anchor'siz (^/$ yok) — re.search ile string'in herhangi bir yerinde bulur.
# Bulunan kismi capture group 0 ile alir, segment'e atar.
#
# Cap belirteci ZORUNLU (sahte "1", "100" gibi tek sayilari elemek icin):
#   - Ø/Ø prefix:        Ø50, Ø 100
#   - DN/dn prefix:      DN100, DN 32
#   - Inch suffix:       2", 1 1/4"
#   - mm suffix:         50mm, 100 mm
#   - Kesir:             1/2, 3/4, 1 1/4 (en az bir / icermeli)
# "KM80" gibi prefix'leri filtrelemek icin: cap match'ten ONCE harf gelmemeli
# (negative lookbehind \b ile). "HDPE 100" once kelime/sayi olabilir, ama
# "Ø" karakteri kendi basina yeterli isaret.
# Ana regex — explicit cap belirteci olan format'lar (Ø, DN, ", mm, kesir).
# Pure sayidan ONCE denenir; "HDPE 100 PN 16 Ø200" -> "Ø200" almak icin.
_DIAMETER_TEXT_RE = re.compile(
    r"""(
          [ØØ]\s*\d+([./\s]+\d+)?(\s*["″])?                                # Ø200, Ø 50, Ø1 1/4
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü])[Dd][Nn]\s*\d+                            # DN100
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü\d.])\d+\s*[/]\s*\d+\s*["″]?                # 1/2, 3/4"
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü\d.])\d+\s+\d+\s*[/]\s*\d+\s*["″]?          # 1 1/4, 1 1/4"
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü\d.])\d+\s*[½¼¾]\s*["″]?                    # 1½, 2½ (Unicode)
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü\d.])[½¼¾]\s*["″]?                           # ½ (tek basina)
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü\d.])\d+\s*["″]                              # 2", 4"
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü\d.])\d{2,3}\s*(mm|MM)\b                    # 50mm, 100 mm
    )""",
    re.VERBOSE,
)

# Fallback — sik mm cap degerlerinin pure sayi versiyonu (15/20/.../250).
# Sahsi tesisat planlarinda boru yaninda "25", "50", "70" yazilir.
# SADECE string'de ana regex match etmiyorsa kullanilir (Ø/DN onceliklidir).
_DIAMETER_FALLBACK_RE = re.compile(
    r"""(?<![A-Za-zÇĞİÖŞÜçğıöşü\d.])
        (?:15|20|25|32|40|50|65|70|80|100|125|150|200|250)
        (?![\d.A-Za-zÇĞİÖŞÜçğıöşü])""",
    re.VERBOSE,
)
# NOT: '10' listede YOK. Cunku '10' cok sik oda numarasi/satir numarasi olur.
# 10mm cap'i nadirdir, eklenirse yanlis atama riski yuksek. 15mm = 1/2" zaten
# yangin tesisatinda minimum.


def _segment_midpoint(seg: dict) -> tuple[float, float]:
    """Segment (dict ya da EdgeSegment) orta noktasi."""
    if isinstance(seg, dict):
        return ((seg["x1"] + seg["x2"]) / 2.0, (seg["y1"] + seg["y2"]) / 2.0)
    # EdgeSegment Pydantic model — coords [x1,y1,x2,y2]
    c = seg.coords
    return ((c[0] + c[2]) / 2.0, (c[1] + c[3]) / 2.0)


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
    vertex'leri, yoksa basit iki uctan olusur. point-to-segment distance icin
    her ardisik pair ayri bir cizgi parcasi olarak ele alinir."""
    if isinstance(seg, dict):
        pl = seg.get("polyline") or []
        if pl and len(pl) >= 2:
            return [(float(p[0]), float(p[1])) for p in pl if isinstance(p, (list, tuple)) and len(p) >= 2]
        return [(seg["x1"], seg["y1"]), (seg["x2"], seg["y2"])]
    # EdgeSegment Pydantic
    pl = getattr(seg, "polyline", None) or []
    if pl and len(pl) >= 2:
        return [(float(p[0]), float(p[1])) for p in pl if isinstance(p, (list, tuple)) and len(p) >= 2]
    c = seg.coords
    return [(c[0], c[1]), (c[2], c[3])]


def _autocad_decode(s: str) -> str:
    """AutoCAD %%c -> Ø gibi escape'leri cozer (geometry.py ile tutarli)."""
    if not s:
        return ""
    # Sik kullanilan escape'ler
    s = s.replace("%%c", "Ø").replace("%%C", "Ø")
    s = s.replace("%%d", "°").replace("%%D", "°")
    s = s.replace("%%p", "±").replace("%%P", "±")
    return s


def _extract_diameter_texts(doc, excluded_layers: set[str] | None = None) -> list[dict]:
    """
    DXF modelspace'inden cap-benzeri TEXT/MTEXT entity'lerini cikar.

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
            # Iki asamali extract:
            #   1. Ana regex (Ø/DN/inch/kesir/mm) — explicit cap belirteci
            #   2. Yoksa fallback (pure 15/20/.../250 sayilari, sihhi tesisat)
            # "HDPE 100 PN 16 Ø200" -> "Ø200" (ana), "25" -> "25" (fallback).
            m = _DIAMETER_TEXT_RE.search(txt)
            if not m:
                m = _DIAMETER_FALLBACK_RE.search(txt)
            if not m:
                continue
            extracted = m.group(0).strip()
            if not extracted:
                continue
            pos = entity.dxf.insert
            x = float(pos.x)
            y = float(pos.y)
            texts.append({"x": x, "y": y, "value": extracted, "layer": layer})
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
        # Her ardisik vertex pair'inden olan mesafenin min'i = text'in
        # tum polyline'a olan en kisa mesafesi.
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
    Her edge_segment icin en yakin diameter text'i bul, segment.diameter ata.

    Args:
        doc: ezdxf Drawing
        edge_segments: list of EdgeSegment (Pydantic) — diameter field'i mutate edilir
        sprinkler_layers: bu layer'lardaki text'ler cap havuzundan dusurulur
        max_distance_world: opsiyonel uzaklik esigi (DWG world unit). None = sinir yok.

    Returns:
        {
            "assigned_count": int,
            "skipped_count": int,
            "text_pool_size": int,
            "warnings": list[str],
        }
    """
    warnings: list[str] = []
    texts = _extract_diameter_texts(doc, excluded_layers=sprinkler_layers)
    pool_size = len(texts)
    if pool_size == 0:
        warnings.append("Proximity: DXF'te cap formatinda hicbir TEXT/MTEXT bulunamadi")
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
