"""
diameter.py — Çap Text Çıkarma + Format Filtresi

DXF'ten çap text'lerini çıkarır. Boru tipine göre format filtresi uygular:
- metric (pis su, yağmur): sadece Ø kabul
- imperial (temiz, gri, sprinkler, dolap): sadece DN/inch kabul
- all (hidrant): hepsini kabul
"""

import math
import re
from typing import NamedTuple

from graph import Point


class DiameterText(NamedTuple):
    value: str       # "Ø200", "DN150", '2"' vb.
    position: Point
    layer: str = ""


# ── Regex pattern'leri ──

_QUOTE_CHARS = r'[""\u2033\u201D\u201C\u0022]'

_DIAMETER_PATTERNS = [
    (re.compile(r'[ØøÖö]\s*(\d+)', re.IGNORECASE), lambda m: f"Ø{m.group(1)}"),
    (re.compile(r'DN\s*(\d+)', re.IGNORECASE), lambda m: f"DN{m.group(1)}"),
    (re.compile(r'(\d+)\s*[½\u00BD]\s*' + _QUOTE_CHARS), lambda m: f'{m.group(1)}½"'),
    (re.compile(r'(\d+)\s*[¼\u00BC]\s*' + _QUOTE_CHARS), lambda m: f'{m.group(1)}¼"'),
    (re.compile(r'(\d+)\s*[¾\u00BE]\s*' + _QUOTE_CHARS), lambda m: f'{m.group(1)}¾"'),
    (re.compile(r'(\d+)\s+(\d+/\d+)\s*' + _QUOTE_CHARS), lambda m: f'{m.group(1)} {m.group(2)}"'),
    (re.compile(r'(\d+/\d+)\s*' + _QUOTE_CHARS), lambda m: f'{m.group(1)}"'),
    (re.compile(r'[½\u00BD]\s*' + _QUOTE_CHARS), lambda m: '½"'),
    (re.compile(r'[¼\u00BC]\s*' + _QUOTE_CHARS), lambda m: '¼"'),
    (re.compile(r'[¾\u00BE]\s*' + _QUOTE_CHARS), lambda m: '¾"'),
    (re.compile(r'(?<!\d)(\d+)\s*' + _QUOTE_CHARS), lambda m: f'{m.group(1)}"'),
]

_EQUIPMENT_KEYWORDS = {
    "NPT", "SPRINKLER", "TEPKIMEL", "UPRIGHT", "PENDENT",
    "CONCEALED", "SIDEWALL", "PENDANT", "FIRE HOSE",
}
_MATERIAL_DESC_PATTERN = re.compile(r'HDPE|PPR|PE\s*100|PN\s*\d+', re.IGNORECASE)

# Fitting/baglanti parcasi adet text'leri — cap olarak algilanmamali
# Ornekler: "n=4 1\"", "n=1 ¾\"", "2 adet ½\"", "x3 DN20"
_FITTING_COUNT_PATTERN = re.compile(
    r'(?:^|\s)(?:n\s*[=:]\s*\d+|[xX]\s*\d+|\d+\s*(?:adet|ad\.|pcs?|piece))',
    re.IGNORECASE,
)


def _autocad_decode(text: str) -> str:
    text = text.replace("%%188", "¼").replace("%%189", "½").replace("%%190", "¾")
    text = text.replace("%%d", "°").replace("%%D", "°")
    text = text.replace("%%p", "±").replace("%%P", "±")
    text = text.replace("%%c", "Ø").replace("%%C", "Ø")
    return text


def _parse_diameter(text: str) -> str | None:
    upper = text.upper()
    if any(kw in upper for kw in _EQUIPMENT_KEYWORDS):
        if not _MATERIAL_DESC_PATTERN.search(text):
            return None
    # Fitting/baglanti parcasi adet text'leri → cap DEGIL
    # "n=4 1\"", "n=1 ¾\"", "2 adet ½\"" gibi
    if _FITTING_COUNT_PATTERN.search(text):
        return None
    # Compound text: "4"s:34;Ø100" → parcalara bol, her birini dene
    parts = re.split(r'[;,]', text)
    for part in parts:
        part = part.strip()
        if not part:
            continue
        for pattern, formatter in _DIAMETER_PATTERNS:
            match = pattern.search(part)
            if match:
                return formatter(match)
    return None


def _is_metric(value: str) -> bool:
    """Ø formatında mı?"""
    return value.startswith("Ø")


def _is_imperial(value: str) -> bool:
    """DN veya inch formatında mı?"""
    return value.startswith("DN") or '"' in value


def _format_ok(value: str, pipe_type: str) -> bool:
    """
    Format filtresi (PRD v2):
    - "metric": SADECE Ø kabul (pis su, yağmur)
    - "imperial": HER format kabul (temiz/yangin/gaz hattinda Ø100 + 1¼" karisik)
    - "all": hepsi
    """
    if pipe_type == "metric":
        return _is_metric(value)
    # imperial veya all: tum format'lar (Ø, DN, inch) kabul
    return True


def detect_pipe_type(layer_name: str) -> str:
    """Layer adından boru tipini belirle."""
    low = layer_name.lower()
    # Metric: pis su, yağmur
    if any(kw in low for kw in ['pis', 'yamur', 'yağmur', 'yagmur']):
        return "metric"
    # Imperial: temiz, gri, sıcak, sprinkler, dolap
    if any(kw in low for kw in ['temiz', 'gri', 'sicak', 'sıcak', 'sprinkler', 'dolap']):
        return "imperial"
    # Hidrant: hepsini kabul
    if 'hidrant' in low:
        return "all"
    # Bilinmeyen: hepsini kabul
    return "all"


def extract_diameters(
    dxf_path: str,
    cap_layers: list[str] | None = None,
    pipe_type: str = "all",
) -> list[DiameterText]:
    """
    Cap layer'larından çap text'lerini çıkar.
    Format filtresi uygular — yanlış formattaki text'ler direkt elenir.

    cap_layers: None ise TÜM layer'lardan çıkarır.
    pipe_type: "metric", "imperial", "all"
    """
    import ezdxf

    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()
    cap_set = set(cap_layers) if cap_layers else None
    results: list[DiameterText] = []

    def _process(text_content: str, position: Point, text_layer: str) -> None:
        if not text_content or not text_content.strip():
            return
        text_content = _autocad_decode(text_content)
        diameter = _parse_diameter(text_content)
        if diameter and _format_ok(diameter, pipe_type):
            results.append(DiameterText(value=diameter, position=position, layer=text_layer))

    for entity in msp:
        etype = entity.dxftype()
        elayer = entity.dxf.layer if hasattr(entity.dxf, 'layer') else ""

        if cap_set and elayer not in cap_set:
            continue

        if etype == 'TEXT':
            ins = entity.dxf.insert
            _process(entity.dxf.text or "", Point(ins.x, ins.y), elayer)

        elif etype == 'MTEXT':
            text = entity.plain_text() if hasattr(entity, 'plain_text') else (entity.text or "")
            ins = entity.dxf.insert
            _process(text, Point(ins.x, ins.y), elayer)

        elif etype == 'INSERT':
            try:
                insert_pos = entity.dxf.insert
                ix, iy = insert_pos.x, insert_pos.y

                if hasattr(entity, 'attribs'):
                    for attrib in entity.attribs:
                        at = attrib.dxf.text or ""
                        if at:
                            try:
                                ap = attrib.dxf.insert
                                _process(at, Point(ap.x, ap.y), elayer)
                            except Exception:
                                _process(at, Point(ix, iy), elayer)

                block_name = entity.dxf.name
                if block_name and block_name in doc.blocks:
                    for bent in doc.blocks[block_name]:
                        if bent.dxftype() not in ('TEXT', 'MTEXT'):
                            continue
                        if bent.dxf.get('invisible', 0) == 1:
                            continue
                        bt = ""
                        if bent.dxftype() == 'TEXT':
                            bt = bent.dxf.text or ""
                        elif bent.dxftype() == 'MTEXT':
                            bt = bent.plain_text() if hasattr(bent, 'plain_text') else (bent.text or "")
                        if bt:
                            bt = _autocad_decode(bt)
                            diameter = _parse_diameter(bt)
                            if diameter and _format_ok(diameter, pipe_type):
                                results.append(DiameterText(value=diameter, position=Point(ix, iy), layer=elayer))
            except Exception:
                pass

    return results
