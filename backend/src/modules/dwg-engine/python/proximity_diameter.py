"""
Proximity-tabanli deterministic diameter atama.

KURAL (kullanici talimati):
  "Boruya en yakin text + text MUTLAKA cap belirteci icermeli."
  Cap belirteci = Ø, DN, inch ("), mm, kesir (/ veya ½¼¾)

FELSEFE:
  - Text icinde cap belirteci YOKSA cap olarak atama YOK.
    'YANGIN DOLABI', '8PYB', 'KM80', '25', '20000 kcal/h' -> atanmaz
  - Text icinde cap belirteci VARSA: o belirteci iceren kismi EXTRACT et.
    'HDPE 100 PN 16 Ø200' -> 'Ø200' (uzun spec icinde Ø)
    'DN150' -> 'DN150' (zaten cap)
    'Ø100' -> 'Ø100'
    '2½' -> '2½'
  - Filtreli havuzdan, segment'e fiziksel olarak en yakin text -> cap.
  - Sprinkler layer'larindaki text'ler havuzdan dusurulur (ID etiketi).

EXTRACT YAKLASIMI:
  Tek tipte: ham text'in TAMAMI degil, icindeki cap PATTERN'i kullanilir.
  Boylece spec string'leri ('HDPE 100 PN 16 Ø200') temiz cap'e ('Ø200')
  donusur, ayni cap'in farkli spec variantlari (PE100 vs HDPE) ayni renge
  duser.

ALGORITMA:
  1. DXF'ten TEXT/MTEXT entity'lerini cek (sprinkler layer hariç).
  2. Her text'i regex ile filtrele: cap pattern bulunamazsa havuza ALMA.
  3. Bulunan -> match.group(0) extract olarak text.value.
  4. Her segment icin point-to-line-segment distance ile en yakin text.
  5. Distance esik altindaysa segment.diameter = text.value.

Performans: O(N*M) brute force. ~500 seg x ~300 text = 150K compare, ~50ms.
"""
from __future__ import annotations

import math
import re
import logging
from typing import Any


# ─────────────────────────────────────────────────────────────────────
# CAP REGEX — text icinde cap belirteci (Ø, DN, ", mm, kesir) ARA.
# Bulunan match'in tam stringi cap olarak alinir (extract).
# Anchor'siz: 'HDPE 100 PN 16 Ø200' icinden 'Ø200' yakalanabilir.
# Pure sayi YOK ('25', '100' kabul edilmez — cap belirteci yok).
# ─────────────────────────────────────────────────────────────────────
_CAP_PATTERN = re.compile(
    r"""(
          [ØØ]\s*\d+([./\s]+\d+)?(\s*["″])?                          # Ø200, Ø 50, Ø1 1/4
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü])[Dd][Nn]\s*\d+                     # DN100, dn50 (KM/PN onunde olamaz)
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü\d.])\d+\s*[/]\s*\d+\s*["″]?         # 1/2, 3/4"
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü\d.])\d+\s+\d+\s*[/]\s*\d+\s*["″]?   # 1 1/4, 1 1/4"
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü\d.])\d+\s*[½¼¾]\s*["″]?             # 1½, 2½ (Unicode kesir)
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü\d.])[½¼¾]\s*["″]?                   # ½ (tek basina)
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü\d.])\d+\s*["″]                      # 2", 4"
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü\d.])\d{2,3}\s*(mm|MM)\b             # 50mm, 100 mm
    )""",
    re.VERBOSE,
)


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


def _extract_diameter_texts(doc, excluded_layers: set[str] | None = None) -> list[dict]:
    """DXF modelspace'inden CAP BELIRTECI ICEREN TEXT/MTEXT entity'lerini cikar.

    Filtreleme: text icinde Ø/DN/"/mm/kesir VARSA havuza alinir, bulunan
    cap pattern'i kismi extract edilir. Pure sayilar ve harf-only text'ler
    ('25', 'YANGIN', '8PYB') havuza ALINMAZ.

    Args:
        doc: ezdxf Drawing
        excluded_layers: bu layer'lardaki text'ler atlanir (sprinkler ID'leri vb.)

    Returns:
        [{"x": float, "y": float, "value": str, "layer": str}, ...]
        value = cap pattern extract (ham text degil)
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
            # KRITIK FILTER: text icinde cap belirteci VAR mi?
            # Yoksa havuza alma. 'YANGIN DOLABI', '25', '8PYB' -> elenir.
            m = _CAP_PATTERN.search(txt)
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
    bile dogru yakalansin.

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
    Her edge_segment icin en yakin CAP TEXT'ini bul, segment.diameter ata.

    KURAL:
      - Text icinde cap belirteci (Ø/DN/"/mm/kesir) ZORUNLU.
      - Sadece bu kriteri saglayan text'ler havuza alinir.
      - Havuzdan segment'e fiziksel olarak en yakin secilir (point-to-segment).
      - Mesafe esik (max_distance_world) altinda olmali — uzak text atanmasin.

    Args:
        doc: ezdxf Drawing
        edge_segments: list of EdgeSegment (Pydantic) — diameter field'i mutate edilir
        sprinkler_layers: bu layer'lardaki text'ler havuzdan dusurulur (ID etiketi)
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
        warnings.append(
            "Proximity: DXF'te cap belirteci (Ø/DN/\"/mm/kesir) iceren "
            "TEXT/MTEXT bulunamadi"
        )
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
