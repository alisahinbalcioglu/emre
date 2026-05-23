"""
Proximity-tabanli deterministic diameter atama.

TEK KURAL (kullanici talimati):
  "Run (T-noktalari arasi kesintisiz hat = EdgeSegment) icin
   HATTA EN YAKIN CAP-TEXT'i cap olarak atanir."

CAP-TEXT TANIMI:
  Text'in icinde cap belirteci VARSA o text cap-text'tir:
    - Ø veya Ø prefix              (Ø200, Ø50)
    - DN/dn prefix                 (DN150)
    - inch suffix (\")              (2\", 1 1/4\")
    - mm suffix                    (50mm, 100 mm)
    - kesir (/) veya Unicode ½¼¾   (1/2, 2½)
  Sahte text'leri (YD, YK, '2', 'YANGIN DOLABI', basliklar) eler.
  Bu filter olmadan 569 segmente bilmem ne text'i atanir.

DIGER:
  - max_distance YOK (sinirsiz — havuzdaki en yakin cap-text kazanir)
  - BFS YOK (gereksiz kompleksite)
  - Sprinkler layer text'leri hariç (kullanici manuel isaretledi -> ID)
  - Kullanici yanlis goruse DiameterEditPopup ile manuel duzeltir
"""
from __future__ import annotations

import math
import re
import logging
from typing import Any


# Cap-belirteci regex — text icinde Ø/DN/inch/mm/kesir VAR MI?
# Bulunan match'in extract'i (örn. 'HDPE 100 PN 16 Ø200' -> 'Ø200') cap olur.
# Anchor'siz: string'in herhangi bir yerinde olabilir.
_CAP_PATTERN = re.compile(
    r"""(
          [ØØ]\s*\d+([./\s]+\d+)?(\s*["″])?                          # Ø200, Ø1 1/4
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü])[Dd][Nn]\s*\d+                     # DN100
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü\d.])\d+\s*[/]\s*\d+\s*["″]?         # 1/2, 3/4"
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü\d.])\d+\s+\d+\s*[/]\s*\d+\s*["″]?   # 1 1/4
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü\d.])\d+\s*[½¼¾]\s*["″]?             # 1½, 2½
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü\d.])[½¼¾]\s*["″]?                   # ½
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü\d.])\d+\s*["″]                      # 2", 4"
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü\d.])\d{2,3}\s*(mm|MM)\b             # 50mm
    )""",
    re.VERBOSE,
)


def _point_to_segment_distance(
    px: float, py: float,
    x1: float, y1: float, x2: float, y2: float,
) -> float:
    """Bir nokta ile bir cizgi parcasinin EN KISA mesafesi.
    Projection segment disinda kalirsa en yakin endpoint'e duser."""
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
    return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))


def _segment_polyline_points(seg) -> list[tuple[float, float]]:
    """Run'in koselerini (x,y) liste olarak don. Polyline varsa onun vertex'leri,
    yoksa basit iki uctan olusur. point-to-segment her ardisik pair icin
    minimum alir — boylece hat boyunca tarama olur."""
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
    """AutoCAD %%c -> Ø vb. escape'leri cozer."""
    if not s:
        return ""
    s = s.replace("%%c", "Ø").replace("%%C", "Ø")
    s = s.replace("%%d", "°").replace("%%D", "°")
    s = s.replace("%%p", "±").replace("%%P", "±")
    return s


def _extract_all_texts(doc, excluded_layers: set[str] | None = None) -> list[dict]:
    """DXF modelspace'inden TUM text-bearing entity'leri cikar.
    Filter YOK — TEXT/MTEXT/DIMENSION/MULTILEADER/MLEADER/INSERT ATTRIB
    hepsinin icerigi havuza alinir. Sprinkler layer text'leri hariç.

    Returns: [{"x", "y", "value", "layer", "source"}, ...]
    """
    excluded_layers = excluded_layers or set()
    texts: list[dict] = []
    try:
        msp = doc.modelspace()
    except Exception:
        return texts

    def _add(txt_raw: str, x: float, y: float, layer: str, source: str) -> None:
        """Cap belirteci filter + extract. Yoksa havuza alma."""
        txt = _autocad_decode(txt_raw or "").strip()
        if not txt:
            return
        m = _CAP_PATTERN.search(txt)
        if not m:
            return  # 'YD', 'YK', '2', 'YANGIN DOLABI' vb. eler
        extracted = m.group(0).strip()
        if not extracted:
            return
        texts.append({
            "x": float(x), "y": float(y),
            "value": extracted,   # 'HDPE 100 PN 16 Ø200' -> 'Ø200'
            "layer": layer, "source": source,
        })

    for entity in msp:
        etype = entity.dxftype()
        try:
            layer = str(getattr(entity.dxf, "layer", "") or "")
            if layer in excluded_layers:
                continue

            if etype == "TEXT":
                raw = str(getattr(entity.dxf, "text", "") or "")
                pos = entity.dxf.insert
                _add(raw, pos.x, pos.y, layer, "TEXT")

            elif etype == "MTEXT":
                raw = entity.plain_text() if hasattr(entity, "plain_text") else str(entity.dxf.text)
                raw = str(raw).replace("\n", " ")
                pos = entity.dxf.insert
                _add(raw, pos.x, pos.y, layer, "MTEXT")

            elif etype == "DIMENSION":
                dim_txt = getattr(entity.dxf, "text", "") or ""
                if dim_txt in ("", "<>", "< >"):
                    if hasattr(entity, "get_measurement"):
                        try:
                            meas = entity.get_measurement()
                            if isinstance(meas, (int, float)):
                                dim_txt = f"{meas:g}"
                        except Exception:
                            pass
                tmp = getattr(entity.dxf, "text_midpoint", None)
                if tmp is not None and hasattr(tmp, "x"):
                    x, y = float(tmp.x), float(tmp.y)
                else:
                    dp = getattr(entity.dxf, "defpoint", None)
                    if dp is None or not hasattr(dp, "x"):
                        continue
                    x, y = float(dp.x), float(dp.y)
                _add(dim_txt, x, y, layer, "DIMENSION")

            elif etype in ("MULTILEADER", "MLEADER"):
                mtxt = None
                if hasattr(entity, "get_mtext_content"):
                    try:
                        mtxt = entity.get_mtext_content()
                    except Exception:
                        mtxt = None
                if not mtxt:
                    mtxt = getattr(entity.dxf, "text", None)
                if not mtxt:
                    continue
                mtxt = str(mtxt).replace("\n", " ")
                x, y = 0.0, 0.0
                tap = getattr(entity.dxf, "text_attachment_point", None)
                pos_found = False
                if tap is not None and hasattr(tap, "x"):
                    x, y = float(tap.x), float(tap.y)
                    pos_found = True
                else:
                    ctx = getattr(entity, "context", None)
                    if ctx is not None:
                        for ldr in (getattr(ctx, "leaders", None) or []):
                            for ln in (getattr(ldr, "lines", None) or []):
                                verts = list(getattr(ln, "vertices", []) or [])
                                if verts:
                                    v = verts[0]
                                    x, y = float(v[0]), float(v[1])
                                    pos_found = True
                                    break
                            if pos_found:
                                break
                if not pos_found:
                    continue
                _add(mtxt, x, y, layer, "LEADER")

            elif etype == "INSERT":
                if not hasattr(entity, "attribs"):
                    continue
                for at in entity.attribs:
                    try:
                        at_layer = str(getattr(at.dxf, "layer", layer) or layer)
                        if at_layer in excluded_layers:
                            continue
                        at_txt = str(getattr(at.dxf, "text", "") or "")
                        ap = at.dxf.insert
                        _add(at_txt, ap.x, ap.y, at_layer, "ATTRIB")
                    except Exception:
                        continue

        except (AttributeError, TypeError, ValueError):
            continue

    return texts


def _nearest_text(seg, texts: list[dict]) -> tuple[dict, float] | None:
    """Run polyline'inin HERHANGI bir noktasindan en yakin text + mesafesi.
    Polyline her ardisik vertex pair'i icin point-to-segment min mesafe alinir
    -> sonuc: hattin HER yerinden olan en kisa mesafe = 'boruyu takip et'."""
    if not texts:
        return None
    points = _segment_polyline_points(seg)
    if len(points) < 2:
        return None
    best = None
    best_d = math.inf
    for t in texts:
        tx, ty = t["x"], t["y"]
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
    edge_segments: list[Any],
    sprinkler_layers: set[str] | None = None,
    max_distance_world: float | None = None,
    inheritance_tolerance: float | None = None,
) -> dict:
    """
    Her run (T-noktalari arasi kesintisiz hat = EdgeSegment) icin en yakin
    text'i bul, segment.diameter ata. SADE: filter yok, BFS yok, mesafe yok.

    Args:
        doc: ezdxf Drawing
        edge_segments: list of EdgeSegment — diameter field'i mutate edilir
        sprinkler_layers: bu layer'lardaki text'ler havuzdan dusurulur
        max_distance_world: KULLANILMIYOR (geri uyumluluk icin parametre)
        inheritance_tolerance: KULLANILMIYOR (geri uyumluluk icin parametre)

    Returns:
        {assigned_count, inherited_count, skipped_count, text_pool_size,
         source_summary, warnings}
    """
    warnings: list[str] = []
    texts = _extract_all_texts(doc, excluded_layers=sprinkler_layers)
    pool_size = len(texts)
    if pool_size == 0:
        warnings.append("Proximity: DXF'te hicbir TEXT/MTEXT/DIM/LEADER/ATTRIB bulunamadi")
        return {
            "assigned_count": 0,
            "inherited_count": 0,
            "skipped_count": len(edge_segments),
            "text_pool_size": 0,
            "source_summary": "",
            "warnings": warnings,
        }

    # Source breakdown — sadece debug bilgisi
    from collections import Counter
    source_counts = Counter(t.get("source", "?") for t in texts)
    source_summary = ", ".join(f"{src}:{cnt}" for src, cnt in source_counts.most_common())

    # Her run icin en yakin text -> cap
    assigned = 0
    for es in edge_segments:
        try:
            current = getattr(es, "diameter", "") or ""
            if current and current != "Belirtilmemis":
                continue  # manuel override veya onceki atama korunur
            result = _nearest_text(es, texts)
            if result is None:
                continue
            top_text, _dist = result
            es.diameter = top_text["value"]
            assigned += 1
        except Exception as _e:
            logging.warning("proximity assign skip: %s", _e)
            continue

    skipped = sum(1 for es in edge_segments if not (getattr(es, "diameter", "") or ""))
    return {
        "assigned_count": assigned,
        "inherited_count": 0,  # geri uyumluluk
        "skipped_count": skipped,
        "text_pool_size": pool_size,
        "source_summary": source_summary,
        "warnings": warnings,
    }
