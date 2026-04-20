"""
DXF Geometri Cikaricisi — Frontend SVG viewer icin.

Cikti: LINE ve LWPOLYLINE entity'lerinden koordinat listesi + bounding box.
Hicbir cap/topoloji analizi yok — salt geometri.
"""

from __future__ import annotations

import math
import re
from typing import Any

import ezdxf
from pydantic import BaseModel


class GeometryLine(BaseModel):
    layer: str
    color: int = 0           # AutoCAD color index (ACI); 0 = BYBLOCK, 256 = BYLAYER
    coords: list[float]      # [x1, y1, x2, y2]


class GeometryInsert(BaseModel):
    """INSERT (block reference) — ekipman/sembol (sprinkler, vana, pompa, vs.)."""
    insert_index: int        # Her INSERT icin benzersiz id (0-based)
    layer: str
    color: int = 256         # BYLAYER default
    insert_name: str = ""    # Block adi (ornek: "SPRINKLER_PENDANT", "GATE_VALVE")
    position: list[float] = []  # [x, y] — anchor noktasi
    rotation: float = 0.0    # Derece
    scale: list[float] = [1.0, 1.0]  # [x, y] scale


class GeometryText(BaseModel):
    """TEXT / MTEXT entity — cap etiketleri, olcu, notlar, vs."""
    text: str
    layer: str
    color: int = 256
    position: list[float] = []   # [x, y] anchor
    height: float = 1.0           # world units
    rotation: float = 0.0         # derece


class GeometryCircle(BaseModel):
    """CIRCLE entity — sprinkler kafasi, sembol cemberi, vs."""
    circle_index: int            # Her CIRCLE icin benzersiz id (0-based)
    layer: str
    color: int = 256             # BYLAYER default
    center: list[float] = []     # [cx, cy]
    radius: float = 0.0          # world units


class GeometryResult(BaseModel):
    lines: list[GeometryLine] = []
    inserts: list[GeometryInsert] = []
    texts: list[GeometryText] = []
    circles: list[GeometryCircle] = []
    bounds: list[float] = [0.0, 0.0, 0.0, 0.0]  # [minX, minY, maxX, maxY]
    layer_colors: dict[str, int] = {}  # {layer_name: ACI color}


def _update_bounds(b: list[float], x: float, y: float) -> None:
    if x < b[0]:
        b[0] = x
    if y < b[1]:
        b[1] = y
    if x > b[2]:
        b[2] = x
    if y > b[3]:
        b[3] = y


def _autocad_decode(s: str) -> str:
    """AutoCAD %% kodlarini cevir (%%c = Ø, %%188 = ¼ vb)."""
    if not s:
        return ""
    return (s
        .replace("%%c", "Ø").replace("%%C", "Ø")
        .replace("%%d", "°").replace("%%D", "°")
        .replace("%%p", "±").replace("%%P", "±")
        .replace("%%188", "¼").replace("%%189", "½").replace("%%190", "¾"))


def _compute_view_transform(doc) -> tuple[float, float, float, float, float, float]:
    """
    DWG'nin baskin LINE yonunu tespit et → ters rotasyon matrisi hesapla.
    Amac: Eger UCS/view rotasyonu varsa cizim yamuk gorunur. Baskın LINE yonu
    0° veya 90°'ye hizalanarak ortogonal gorunum saglanir.

    Return: (cos_t, sin_t, tx, ty, cx, cy) — transform parametreleri.
      transformed_x = (x - cx) * cos_t - (y - cy) * sin_t + cx + tx
      transformed_y = (x - cx) * sin_t + (y - cy) * cos_t + cy + ty
    Default (rotation yok): cos_t=1, sin_t=0, hepsi 0.
    """
    msp = doc.modelspace()

    # 1) UCS header kontrolu — eger $UCSXDIR varsa ve (1,0,0) degilse rotasyon var
    try:
        ucs_x = doc.header.get("$UCSXDIR", (1.0, 0.0, 0.0))
        if ucs_x and len(ucs_x) >= 2:
            ux, uy = float(ucs_x[0]), float(ucs_x[1])
            mag = math.sqrt(ux * ux + uy * uy)
            if mag > 0.001 and abs(uy) > 0.01:  # Y bileseni sifira yakin degilse rotasyon var
                # UCS X ekseni WCS'te (ux, uy) ise, bakis acisi bunu X eksenine getirmek
                theta = math.atan2(uy, ux)
                return (math.cos(-theta), math.sin(-theta), 0.0, 0.0, 0.0, 0.0)
    except Exception:
        pass

    # 2) Fallback: Baskın LINE/POLYLINE yonunu tespit et (her DWG icin calisir)
    # Tum edge'lerin acilarini topla → 0-180° arasi histogram → en buyuk bin
    angle_bins = [0] * 180  # 1° bin
    total_length = 0.0

    def _add_edge(x1: float, y1: float, x2: float, y2: float) -> None:
        nonlocal total_length
        dx, dy = x2 - x1, y2 - y1
        length = math.sqrt(dx * dx + dy * dy)
        if length < 0.01:
            return
        angle_deg = math.degrees(math.atan2(dy, dx)) % 180
        bin_idx = int(angle_deg) % 180
        angle_bins[bin_idx] += int(length)
        total_length += length

    for ent in msp.query('LINE'):
        try:
            _add_edge(float(ent.dxf.start.x), float(ent.dxf.start.y),
                      float(ent.dxf.end.x), float(ent.dxf.end.y))
        except Exception:
            continue
    for ent in msp.query('LWPOLYLINE'):
        try:
            pts = list(ent.get_points(format='xy'))
            for i in range(len(pts) - 1):
                _add_edge(float(pts[i][0]), float(pts[i][1]),
                          float(pts[i+1][0]), float(pts[i+1][1]))
        except Exception:
            continue
    for ent in msp.query('POLYLINE'):
        try:
            verts = [(float(v.dxf.location.x), float(v.dxf.location.y)) for v in ent.vertices]
            for i in range(len(verts) - 1):
                _add_edge(verts[i][0], verts[i][1], verts[i+1][0], verts[i+1][1])
        except Exception:
            continue

    if total_length < 10:
        return (1.0, 0.0, 0.0, 0.0, 0.0, 0.0)

    # GUVENLIK KONTROLU: Eger cizimin onemli bir kismi zaten ortogonal ise
    # (0-5° ve 85-95° ve 175-180° bin'leri toplami), HICBIR rotasyon uygulama.
    # Aksi halde, non-orthogonal bir bolum (title block, sembol galerisi)
    # baskın tespit edilip ana plani bozabilir.
    orthogonal_weight = 0
    for i in range(180):
        if i <= 5 or (85 <= i <= 95) or i >= 175:
            orthogonal_weight += angle_bins[i]
    if orthogonal_weight >= total_length * 0.5:
        # Cizimin %50+'si zaten ortogonal — dokunma
        return (1.0, 0.0, 0.0, 0.0, 0.0, 0.0)

    # En yogun bin'i bul
    max_bin = max(range(180), key=lambda i: angle_bins[i])
    max_weight = angle_bins[max_bin]

    # Eger baskın yön zaten 0/90/180'e yakin, rotasyon gereksiz
    if max_bin <= 2 or max_bin >= 178 or abs(max_bin - 90) <= 2:
        return (1.0, 0.0, 0.0, 0.0, 0.0, 0.0)

    # Baskın bin'in weight'i yeterince belirleyici mi? En az %50 olmalı
    # (aksi halde cesitli oriyantasyonlar var, rotate etmek riskli)
    if max_weight < total_length * 0.5:
        return (1.0, 0.0, 0.0, 0.0, 0.0, 0.0)

    # Baskin yön = max_bin derece. 0°'ye hizala → -max_bin rotasyon.
    # (90'a daha yakin ise 90'a hizala)
    target_angle = 0 if max_bin < 45 or max_bin > 135 else 90
    rotation_deg = target_angle - max_bin
    theta = math.radians(rotation_deg)
    return (math.cos(theta), math.sin(theta), 0.0, 0.0, 0.0, 0.0)


def _transform_point(x: float, y: float, t: tuple[float, float, float, float, float, float]) -> tuple[float, float]:
    cos_t, sin_t, tx, ty, cx, cy = t
    rx = (x - cx) * cos_t - (y - cy) * sin_t + cx + tx
    ry = (x - cx) * sin_t + (y - cy) * cos_t + cy + ty
    return rx, ry


def extract_geometry(dxf_path: str, layer_filter: set[str] | None = None) -> GeometryResult:
    """
    DXF dosyasindan LINE ve LWPOLYLINE koordinatlarini cikar.

    Args:
        dxf_path: DXF dosya yolu
        layer_filter: Bu set bos degilse sadece bu layer'lardaki entity'ler alinir

    Returns:
        GeometryResult — lines + bounds + layer_colors
    """
    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()

    lines: list[GeometryLine] = []
    inserts: list[GeometryInsert] = []
    texts: list[GeometryText] = []
    circles: list[GeometryCircle] = []
    bounds = [math.inf, math.inf, -math.inf, -math.inf]
    layer_colors: dict[str, int] = {}
    insert_counter = 0
    circle_counter = 0

    # Cizim orientasyonunu orthogonal'e hizala (UCS rotation veya skewed view fix)
    # _compute_view_transform baskın LINE yonunu 0/90 dereceye hizalayan rotasyon doner.
    # Rotation yoksa identity (cos=1, sin=0) — hicbir sey degismez.
    view_t = _compute_view_transform(doc)
    _has_rotation = abs(view_t[1]) > 1e-6  # sin_t > 0 → rotation var
    view_angle_deg = math.degrees(math.atan2(view_t[1], view_t[0])) if _has_rotation else 0.0

    def _tp(x: float, y: float) -> tuple[float, float]:
        if _has_rotation:
            return _transform_point(x, y, view_t)
        return x, y

    # Layer renkleri
    for layer in doc.layers:
        layer_colors[layer.dxf.name] = layer.color if layer.color > 0 else 7  # default beyaz

    for entity in msp:
        layer_name = entity.dxf.layer
        if layer_filter is not None and layer_name not in layer_filter:
            continue

        # Entity color — BYLAYER ise 256, aksi halde kendi ACI kodu
        color = getattr(entity.dxf, "color", 256) or 256
        etype = entity.dxftype()

        if etype == "LINE":
            try:
                x1, y1 = _tp(float(entity.dxf.start.x), float(entity.dxf.start.y))
                x2, y2 = _tp(float(entity.dxf.end.x), float(entity.dxf.end.y))
            except (AttributeError, TypeError):
                continue
            lines.append(GeometryLine(layer=layer_name, color=color, coords=[x1, y1, x2, y2]))
            _update_bounds(bounds, x1, y1)
            _update_bounds(bounds, x2, y2)

        elif etype == "LWPOLYLINE":
            try:
                pts = [_tp(float(p[0]), float(p[1])) for p in entity.get_points("xy")]
            except Exception:
                continue
            for i in range(len(pts) - 1):
                x1, y1 = pts[i]
                x2, y2 = pts[i + 1]
                lines.append(GeometryLine(layer=layer_name, color=color, coords=[x1, y1, x2, y2]))
                _update_bounds(bounds, x1, y1)
                _update_bounds(bounds, x2, y2)
            # Polyline kapali mi?
            if getattr(entity, "closed", False) and len(pts) > 2:
                x1, y1 = pts[-1]
                x2, y2 = pts[0]
                lines.append(GeometryLine(layer=layer_name, color=color, coords=[x1, y1, x2, y2]))

        elif etype == "POLYLINE":
            try:
                pts = [_tp(float(v.dxf.location.x), float(v.dxf.location.y)) for v in entity.vertices]
            except Exception:
                continue
            for i in range(len(pts) - 1):
                x1, y1 = pts[i]
                x2, y2 = pts[i + 1]
                lines.append(GeometryLine(layer=layer_name, color=color, coords=[x1, y1, x2, y2]))
                _update_bounds(bounds, x1, y1)
                _update_bounds(bounds, x2, y2)

        elif etype == "CIRCLE":
            try:
                cx_raw, cy_raw = float(entity.dxf.center.x), float(entity.dxf.center.y)
                cx, cy = _tp(cx_raw, cy_raw)
                radius = float(entity.dxf.radius)
            except (AttributeError, TypeError):
                continue
            circles.append(GeometryCircle(
                circle_index=circle_counter,
                layer=layer_name,
                color=color,
                center=[cx, cy],
                radius=radius,
            ))
            circle_counter += 1
            _update_bounds(bounds, cx - radius, cy - radius)
            _update_bounds(bounds, cx + radius, cy + radius)

        elif etype == "INSERT":
            # Ekipman/sembol — vana, pompa, sprinkler, radyator, hidrant, vs.
            try:
                pos = entity.dxf.insert
                px_raw, py_raw = float(pos.x), float(pos.y)
                px, py = _tp(px_raw, py_raw)
                block_name = str(getattr(entity.dxf, "name", "") or "")
                rot = float(getattr(entity.dxf, "rotation", 0.0) or 0.0)
                sx = float(getattr(entity.dxf, "xscale", 1.0) or 1.0)
                sy = float(getattr(entity.dxf, "yscale", 1.0) or 1.0)
            except (AttributeError, TypeError):
                continue
            inserts.append(GeometryInsert(
                insert_index=insert_counter,
                layer=layer_name,
                color=color,
                insert_name=block_name,
                position=[px, py],
                rotation=rot + view_angle_deg,
                scale=[sx, sy],
            ))
            insert_counter += 1
            _update_bounds(bounds, px, py)

            # 2a) ATTRIB degerleri — block referansinda kullanicinin yazdigi dinamik yazilar
            if hasattr(entity, "attribs"):
                for at in entity.attribs:
                    try:
                        at_layer = getattr(at.dxf, "layer", layer_name)
                        if layer_filter is not None and at_layer not in layer_filter:
                            continue
                        at_txt = _autocad_decode(str(getattr(at.dxf, "text", "") or "")).strip()
                        if not at_txt:
                            continue
                        ap = at.dxf.insert
                        apx, apy = _tp(float(ap.x), float(ap.y))
                        at_color = getattr(at.dxf, "color", 256) or 256
                        texts.append(GeometryText(
                            text=at_txt, layer=at_layer, color=at_color,
                            position=[apx, apy],
                            height=float(getattr(at.dxf, "height", 1.0) or 1.0),
                            rotation=float(getattr(at.dxf, "rotation", 0.0) or 0.0) + view_angle_deg,
                        ))
                        _update_bounds(bounds, apx, apy)
                    except Exception:
                        continue

            # 2b) Block definition icindeki TEXT/MTEXT — world coords'a transform
            if block_name and block_name in doc.blocks:
                rot_rad = math.radians(rot)
                cr, sr = math.cos(rot_rad), math.sin(rot_rad)
                for bent in doc.blocks[block_name]:
                    bt_type = bent.dxftype()
                    if bt_type not in ("TEXT", "MTEXT"):
                        continue
                    if getattr(bent.dxf, "invisible", 0) == 1:
                        continue  # dynamic block gizli state
                    try:
                        if bt_type == "TEXT":
                            bt_txt_raw = getattr(bent.dxf, "text", "") or ""
                        else:
                            bt_txt_raw = bent.plain_text() if hasattr(bent, "plain_text") else (getattr(bent.dxf, "text", "") or "")
                        bt_txt = _autocad_decode(str(bt_txt_raw).replace("\n", " ")).strip()
                        if not bt_txt:
                            continue
                        bent_layer = getattr(bent.dxf, "layer", layer_name)
                        if layer_filter is not None and bent_layer not in layer_filter:
                            continue
                        # Local block coords → world (raw) → view-transformed world coords
                        lp = bent.dxf.insert
                        lx, ly = float(lp.x) * sx, float(lp.y) * sy
                        wx_raw = lx * cr - ly * sr + px_raw
                        wy_raw = lx * sr + ly * cr + py_raw
                        wx, wy = _tp(wx_raw, wy_raw)
                        # Height * ortalama scale
                        raw_h = getattr(bent.dxf, "height", None)
                        if raw_h is None:
                            raw_h = getattr(bent.dxf, "char_height", 1.0)
                        bh = float(raw_h or 1.0) * ((abs(sx) + abs(sy)) / 2)
                        b_rot = float(getattr(bent.dxf, "rotation", 0.0) or 0.0) + rot + view_angle_deg
                        bt_color = getattr(bent.dxf, "color", 256) or 256
                        texts.append(GeometryText(
                            text=bt_txt, layer=bent_layer, color=bt_color,
                            position=[wx, wy], height=bh, rotation=b_rot,
                        ))
                        _update_bounds(bounds, wx, wy)
                    except Exception:
                        continue

        elif etype == "TEXT":
            # Cap etiketi, olcu, vs. (kullanici gorebilsin diye)
            try:
                txt = _autocad_decode(str(getattr(entity.dxf, "text", "") or "")).strip()
                if not txt:
                    continue
                pos = entity.dxf.insert
                px, py = _tp(float(pos.x), float(pos.y))
                height = float(getattr(entity.dxf, "height", 1.0) or 1.0)
                rot = float(getattr(entity.dxf, "rotation", 0.0) or 0.0)
            except (AttributeError, TypeError):
                continue
            texts.append(GeometryText(
                text=txt, layer=layer_name, color=color,
                position=[px, py], height=height, rotation=rot + view_angle_deg,
            ))
            _update_bounds(bounds, px, py)

        elif etype == "MTEXT":
            try:
                # MTEXT'te formatting kodlari var — plain_text temizler
                raw = entity.plain_text() if hasattr(entity, "plain_text") else str(entity.dxf.text)
                txt = _autocad_decode(str(raw).replace("\n", " ")).strip()
                if not txt:
                    continue
                pos = entity.dxf.insert
                px, py = _tp(float(pos.x), float(pos.y))
                height = float(getattr(entity.dxf, "char_height", 1.0) or 1.0)
                rot = float(getattr(entity.dxf, "rotation", 0.0) or 0.0)
            except (AttributeError, TypeError):
                continue
            texts.append(GeometryText(
                text=txt, layer=layer_name, color=color,
                position=[px, py], height=height, rotation=rot + view_angle_deg,
            ))
            _update_bounds(bounds, px, py)

        elif etype == "DIMENSION":
            # Olcu etiketi — text override var ise onu kullan, yoksa get_measurement()
            try:
                dim_txt = getattr(entity.dxf, "text", "") or ""
                if dim_txt in ("", "<>", "< >"):
                    if hasattr(entity, "get_measurement"):
                        try:
                            meas = entity.get_measurement()
                            if isinstance(meas, (int, float)):
                                dim_txt = f"{meas:g}"
                        except Exception:
                            pass
                dim_txt = _autocad_decode(dim_txt).strip()
                if not dim_txt:
                    continue
                tmp = getattr(entity.dxf, "text_midpoint", None)
                if tmp is not None:
                    px, py = _tp(float(tmp.x), float(tmp.y))
                else:
                    dp = getattr(entity.dxf, "defpoint", None)
                    if dp is None:
                        continue
                    px, py = _tp(float(dp.x), float(dp.y))
                height = float(getattr(entity.dxf, "text_height", 2.5) or 2.5)
            except (AttributeError, TypeError):
                continue
            texts.append(GeometryText(
                text=dim_txt, layer=layer_name, color=color,
                position=[px, py], height=height, rotation=view_angle_deg,
            ))
            _update_bounds(bounds, px, py)

        elif etype in ("MULTILEADER", "MLEADER"):
            # Modern leader (ok + yazi) — MTEXT icerigi + attachment noktasi
            try:
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
                mtxt = _autocad_decode(str(mtxt).replace("\n", " ")).strip()
                if not mtxt:
                    continue
                # Pozisyon: text_attachment_point → context.leaders fallback
                px, py = 0.0, 0.0
                tap = getattr(entity.dxf, "text_attachment_point", None)
                if tap is not None and hasattr(tap, "x"):
                    px, py = _tp(float(tap.x), float(tap.y))
                else:
                    ctx = getattr(entity, "context", None)
                    if ctx is not None:
                        leaders = getattr(ctx, "leaders", None) or []
                        for ldr in leaders:
                            lines = getattr(ldr, "lines", None) or []
                            found = False
                            for ln in lines:
                                verts = list(getattr(ln, "vertices", []) or [])
                                if verts:
                                    v = verts[0]
                                    px, py = _tp(float(v[0]), float(v[1]))
                                    found = True
                                    break
                            if found:
                                break
                height = float(getattr(entity.dxf, "char_height", 2.5) or 2.5)
            except (AttributeError, TypeError):
                continue
            texts.append(GeometryText(
                text=mtxt, layer=layer_name, color=color,
                position=[px, py], height=height, rotation=view_angle_deg,
            ))
            _update_bounds(bounds, px, py)

    # Hicbir entity yoksa bounds sonsuz kalir — sifir yap
    if not lines and not inserts and not texts and not circles:
        bounds = [0.0, 0.0, 0.0, 0.0]
    else:
        bounds = [float(bounds[0]), float(bounds[1]), float(bounds[2]), float(bounds[3])]

    # TEXT filtreleme — binlerce kullanici odaklı optimizasyon.
    # Buyuk DWG'lerde binlerce isim/baslik/not TEXT entity'si olur; bunlar
    # viewer'da gorsel olarak degil, cap bilgisi olarak onemli. 2000 esiginin
    # ustunde sadece cap notu gibi goruneni (Ø50, DN100, 1 1/2", 2" vs)
    # geri dondur — ag trafigi %50-80 azalir.
    _DIAMETER_TEXT_RE = re.compile(r"""^[\sØØDNdn\d/\\"'½¼¾]+$""")
    if len(texts) > 2000:
        texts = [t for t in texts if _DIAMETER_TEXT_RE.match(t.text.strip())]

    return GeometryResult(
        lines=lines, inserts=inserts, texts=texts, circles=circles,
        bounds=bounds, layer_colors=layer_colors,
    )
