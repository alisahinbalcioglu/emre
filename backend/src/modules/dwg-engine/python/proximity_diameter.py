"""
Proximity-tabanli deterministic diameter atama.

TEK KURAL (kullanici talimati):
  "Run (T-noktalari arasi kesintisiz hat = EdgeSegment) icin
   HATTA EN YAKIN CAP-TEXT'i cap olarak atanir."

CAP-TEXT TANIMI:
  Text'in icinde cap belirteci VARSA o text cap-text'tir:
    - Ø veya Ø prefix              (Ø200, Ø50)
    - DN/dn prefix                 (DN150)
    - inch suffix (", ″, '')        (2", 1 1/4", 1'')
    - mm suffix                    (50mm, 100 mm)
    - kesir (/) — SADECE payda 2/4/8/16 (inç standardi: 1/2, 3/4, 1 1/4)
    - Unicode kesir ½¼¾            (1½, 2½)
  Kesir paydasi >16 olanlar REDDEDILIR (100/210, 1/50, 50/50 sahte cap).
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
#
# Inch isareti varyantlari: "  ″  '' (iki tek-tirnak, AutoCAD/TR klavyeden)
# Kesir paydasi WHITELIST: SADECE 2/4/8/16 (inç standardi).
# Bu kural 100/210, 1/50, 50/50, 90/210 gibi kanal/spec format'larini eler.
_CAP_PATTERN = re.compile(
    r"""(
          [ØØ]\s*\d+([./\s]+\d+)?(\s*(?:["″]|''))?                              # Ø200, Ø1 1/4
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü])[Dd][Nn]\s*\d+                                # DN100
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü\d.])\d+\s+\d+\s*/\s*(?:2|4|8|16)\b\s*(?:["″]|'')?  # 1 1/4 (mixed, payda whitelist)
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü\d.])\d+\s*/\s*(?:2|4|8|16)\b\s*(?:["″]|'')?        # 1/2, 3/4" (payda whitelist)
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü\d.])\d+\s*[½¼¾]\s*(?:["″]|'')?                    # 1½, 2½
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü\d.])[½¼¾]\s*(?:["″]|'')?                          # ½
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü\d.])\d+\s*(?:["″]|'')                              # 2", 4", 1''
        | (?<![A-Za-zÇĞİÖŞÜçğıöşü\d.])\d{2,3}\s*(mm|MM)\b                            # 50mm
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


def _extract_block_texts(doc, insert_entity) -> list[tuple[str, float, float]]:
    """INSERT'in referans verdigi blok tanimi icindeki TEXT/MTEXT'leri
    world coordinates'e donusturup don.

    AutoCAD'de boru cap etiketleri sik sik bir "tag block"a sarilir
    (ornek: 'A_Yangin Cap' layer'inda 664 INSERT, her biri icinde TEXT
    '1¼"' yazili). Modelspace tarama bunlari ATTRIB olmadigi icin
    yakalayamaz — blok'u acmak gerekir.

    Transform: TEXT'in lokal pozisyonunu INSERT'in pos+rot+scale ile
    world coords'e tasi. Nested INSERT su an ele alinmaz (cyclic risk),
    pratikte cap text bloklari tek seviye.
    """
    try:
        block_name = str(getattr(insert_entity.dxf, "name", "") or "")
        if not block_name:
            return []
        if block_name not in doc.blocks:
            return []
        block = doc.blocks[block_name]
        ip = insert_entity.dxf.insert
        ix, iy = float(ip.x), float(ip.y)
        rot = math.radians(float(getattr(insert_entity.dxf, "rotation", 0.0) or 0.0))
        sx = float(getattr(insert_entity.dxf, "xscale", 1.0) or 1.0)
        sy = float(getattr(insert_entity.dxf, "yscale", 1.0) or 1.0)
        cr, sr = math.cos(rot), math.sin(rot)
    except Exception:
        return []

    results: list[tuple[str, float, float]] = []
    try:
        block_iter = block.query("TEXT MTEXT")
    except Exception:
        return results

    for ent in block_iter:
        try:
            etype = ent.dxftype()
            if etype == "TEXT":
                raw = str(getattr(ent.dxf, "text", "") or "")
            else:  # MTEXT
                raw = (
                    ent.plain_text()
                    if hasattr(ent, "plain_text")
                    else str(getattr(ent.dxf, "text", "") or "")
                )
            txt = str(raw).replace("\n", " ").strip()
            if not txt:
                continue
            lp = ent.dxf.insert
            lx, ly = float(lp.x), float(lp.y)
            # Local -> world: scale, rotate, translate
            sxl, syl = lx * sx, ly * sy
            wx = sxl * cr - syl * sr + ix
            wy = sxl * sr + syl * cr + iy
            results.append((txt, wx, wy))
        except (AttributeError, TypeError, ValueError):
            continue
    return results


def _extract_all_texts(
    doc,
    excluded_layers: set[str] | None = None,
    debug_rejected: list[dict] | None = None,
) -> list[dict]:
    """DXF modelspace'inden TUM text-bearing entity'leri cikar.
    Filter YOK — TEXT/MTEXT/DIMENSION/MULTILEADER/MLEADER/INSERT ATTRIB
    hepsinin icerigi havuza alinir. Sprinkler layer text'leri hariç.

    Args:
        debug_rejected: caller bos liste verirse, REGEX'i gecemeyen text'ler
          burada toplanir (debug icin). None ise toplanmaz (production path).

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
            # 'YD', 'YK', '2', 'YANGIN DOLABI' vb. eler — ama debug icin
            # ham metni kaydet ki kullanici "neden '2½\"' atanmadi" gibi
            # sorularini cozebilelim. Caller list vermisse pushla.
            if debug_rejected is not None and len(debug_rejected) < 200:
                # Ham karakterleri Unicode codepoint listesi ile birlikte ver —
                # ekranda goremedigimiz garip karakterleri (stacked fraction
                # kontrol kodlari, BOM, vs.) tanimak icin.
                codepoints = [f"U+{ord(c):04X}" for c in txt[:40]]
                debug_rejected.append({
                    "raw": txt,
                    "codepoints": codepoints,
                    "layer": layer,
                    "source": source,
                    "x": float(x), "y": float(y),
                })
            return
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
                # 1) ATTRIB'ler (block'a baglanan kullanici girdi text'leri)
                if hasattr(entity, "attribs"):
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
                # 2) BLOCK_TEXT — INSERT'in referans verdigi blok icinde TEXT/MTEXT
                # entity'leri varsa (ornek: 'cap tag' block'lari icinde '1¼"' yazili
                # statik TEXT), bunlari world coords'e tasiyip pool'a ekle. AutoCAD'de
                # cap etiketleri sik sik bu yontemle yerlestirilir; geometry.py block
                # expansion yapiyor ama proximity'de yoktu — bu DWG'nin pool'unu 43
                # text'ten ~700+ text'e cikaracak (664 INSERT × 1 TEXT/blok).
                try:
                    block_texts = _extract_block_texts(doc, entity)
                    for btxt, wx, wy in block_texts:
                        _add(btxt, wx, wy, layer, "BLOCK_TEXT")
                except Exception:
                    pass

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


def _segment_distance(seg, tx: float, ty: float) -> float:
    """Bir text noktasinin segment polyline'ina min mesafesi (point-to-segment)."""
    points = _segment_polyline_points(seg)
    if len(points) < 2:
        return math.inf
    seg_d = math.inf
    for i in range(len(points) - 1):
        x1, y1 = points[i]
        x2, y2 = points[i + 1]
        d = _point_to_segment_distance(tx, ty, x1, y1, x2, y2)
        if d < seg_d:
            seg_d = d
    return seg_d


def assign_diameters_by_proximity(
    doc,
    edge_segments: list[Any],
    sprinkler_layers: set[str] | None = None,
    max_distance_world: float | None = None,
    inheritance_tolerance: float | None = None,
) -> dict:
    """
    MUTUAL NEAREST: Her cap-text icin en yakin segment'i bul (text-perspective).
    Sonra her segment'e — kendisini en yakin segment olarak goren text'lerin
    EN YAKIN olani — cap olarak atanir.

    Avantaj: bir text birden fazla segment'e atanmaz. "2½\"" text'i hangi
    segment'e fiziksel olarak en yakinsa OYU segmente atanir, baska segment'ler
    bu text'i 'kapamaz'.

    Args:
        doc: ezdxf Drawing
        edge_segments: list of EdgeSegment — diameter field'i mutate edilir
        sprinkler_layers: bu layer'lardaki text'ler havuzdan dusurulur
        max_distance_world: kullanilmiyor (backward compat)
        inheritance_tolerance: kullanilmiyor (backward compat)

    Returns:
        {assigned_count, skipped_count, text_pool_size, source_summary,
         warnings, inherited_count(=0)}
    """
    warnings: list[str] = []
    # DIAGNOSTIC: regex'i geçemeyen ham text'leri topla — response'a forward edilir.
    # "Neden '2½\"' atanmadi" gibi sorularda kullanici F12 Console'da gorebilsin.
    # Production'a sokmadan once kaldirilacak (default capacity 200 entry).
    debug_rejected: list[dict] = []
    texts = _extract_all_texts(
        doc,
        excluded_layers=sprinkler_layers,
        debug_rejected=debug_rejected,
    )
    pool_size = len(texts)
    if pool_size == 0:
        warnings.append("Proximity: DXF'te cap belirteci iceren TEXT/MTEXT/DIM/LEADER/ATTRIB bulunamadi")
        return {
            "assigned_count": 0,
            "inherited_count": 0,
            "skipped_count": len(edge_segments),
            "text_pool_size": 0,
            "source_summary": "",
            "warnings": warnings,
            "debug_rejected_texts": debug_rejected[:50],
            "debug_accepted_sample": [],
        }

    from collections import Counter
    source_counts = Counter(t.get("source", "?") for t in texts)
    source_summary = ", ".join(f"{src}:{cnt}" for src, cnt in source_counts.most_common())

    # ── ADIM 1: Her text icin en yakin segment bul (text-perspective) ──
    # segment_to_texts[seg_idx] = [(text_dict, distance), ...] — bu segmente "ait" text'ler
    segment_to_texts: dict[int, list[tuple[dict, float]]] = {}
    for t in texts:
        tx, ty = t["x"], t["y"]
        best_seg_idx = -1
        best_d = math.inf
        for idx, es in enumerate(edge_segments):
            try:
                d = _segment_distance(es, tx, ty)
                if d < best_d:
                    best_d = d
                    best_seg_idx = idx
            except Exception:
                continue
        if best_seg_idx >= 0:
            segment_to_texts.setdefault(best_seg_idx, []).append((t, best_d))

    # ── ADIM 2: Her segmente kendi text'lerinin EN YAKIN olanini ata ──
    assigned = 0
    for idx, es in enumerate(edge_segments):
        try:
            current = getattr(es, "diameter", "") or ""
            if current and current != "Belirtilmemis":
                continue  # manuel override korunur
            text_candidates = segment_to_texts.get(idx, [])
            if not text_candidates:
                continue  # bu segmente hicbir text 'ait' degil -> Belirtilmemis
            # En yakin candidate
            best_text, _ = min(text_candidates, key=lambda x: x[1])
            es.diameter = best_text["value"]
            assigned += 1
        except Exception as _e:
            logging.warning("mutual nearest skip: %s", _e)
            continue

    skipped = sum(1 for es in edge_segments if not (getattr(es, "diameter", "") or ""))
    # DIAGNOSTIC: kabul edilmis text'lerden ilk 50 ornek + codepoint dump.
    # Production'a sokmadan once kaldirilacak.
    accepted_sample: list[dict] = []
    for t in texts[:50]:
        v = str(t.get("value", ""))
        accepted_sample.append({
            "value": v,
            "codepoints": [f"U+{ord(c):04X}" for c in v[:40]],
            "layer": t.get("layer", ""),
            "source": t.get("source", ""),
            "x": float(t.get("x", 0.0)),
            "y": float(t.get("y", 0.0)),
        })
    return {
        "assigned_count": assigned,
        "inherited_count": 0,
        "skipped_count": skipped,
        "text_pool_size": pool_size,
        "source_summary": source_summary,
        "warnings": warnings,
        "debug_rejected_texts": debug_rejected[:50],
        "debug_accepted_sample": accepted_sample,
    }
