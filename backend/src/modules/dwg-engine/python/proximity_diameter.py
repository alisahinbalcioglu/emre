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

ATAMA MANTIGI:
  - SEGMENT-PERSPECTIVE NAIVE NEAREST: her segment kendi en yakin text'ini
    alir. Ayni text birden fazla segmente paylasilabilir (T-junction'da ayni
    cap kardes borulara uygular).
  - MESAFE SINIRI: DEFAULT_MAX_DISTANCE_WORLD (2000mm world unit, ~2m).
    Asan text'ler atanmaz; uzak text'in segmente zorla yakistirilmasini onler.
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


# MTEXT stacked fraction formatting code: \S<num>[/#^]<den>; → "<num>/<den>"
# ezdxf plain_text() cogu zaman bunu cozer ama versiyona gore "2#3" gibi hash
# separator birakabilir. Safety olarak burada normalize ediyoruz. SADECE \S ile
# baslayip ; ile biten formatlara dokunulur — standalone "Profil#3" gibi text'leri
# yanlislikla degistirmez.
_STACKED_FRACTION_RE = re.compile(r"\\S\s*(\d+)\s*[/#^]\s*(\d+)\s*;")


def _autocad_decode(s: str) -> str:
    """AutoCAD %%c -> Ø vb. escape'leri cozer.
    Plus: MTEXT stacked fraction format kodu \\S2/3; veya \\S2#3; -> "2/3".
    """
    if not s:
        return ""
    s = s.replace("%%c", "Ø").replace("%%C", "Ø")
    s = s.replace("%%d", "°").replace("%%D", "°")
    s = s.replace("%%p", "±").replace("%%P", "±")
    # P1b: stacked fraction → normal "/" kesir (sadece guvenli \S...; format)
    s = _STACKED_FRACTION_RE.sub(r"\1/\2", s)
    return s


_MAX_BLOCK_DEPTH = 4  # nested INSERT max recursion depth (cyclic guard + maliyet sinirla)


# ════════════════════════════════════════════════════════════════════════
#  CAP CANONICAL NORMALIZATION
#  Ayni capi temsil eden farkli format'lari TEK string'e indirger.
#  Legend'da '1¼"' iki kez gozukmesin diye GEREKLI. Ornekler:
#    '1 1/4"' → '1¼"'
#    '1¼″'    → '1¼"'   (Unicode prime → ASCII quote)
#    "1¼''"   → '1¼"'   (iki tek-tirnak → ASCII quote)
#    'dn 150' → 'DN150'
#    '50 MM'  → '50mm'
#    'Ø 200'  → 'Ø200'
# ════════════════════════════════════════════════════════════════════════

_ASCII_FRAC_TO_UNICODE = {
    ("1", "2"): "½",
    ("1", "4"): "¼",
    ("3", "4"): "¾",
}


def _canonicalize_cap(s: str) -> str:
    """Cap text'ini canonical form'a getir. Idempotent: tekrar uygulanabilir."""
    if not s:
        return ""
    s = s.strip()
    # Quote varyantlarini ASCII " ile birlestir
    s = s.replace("″", '"').replace("''", '"')
    # DN: 'dn 150' → 'DN150'
    s = re.sub(
        r"(?<![A-Za-zÇĞİÖŞÜçğıöşü])[Dd][Nn]\s*(\d+)",
        lambda m: f"DN{m.group(1)}",
        s,
    )
    # Ø: 'Ø 200' → 'Ø200'  (Ø ve Ø varyantlari)
    s = re.sub(r"[ØØ]\s*", "Ø", s)
    # mm: '50 MM', '50 mm' → '50mm'
    s = re.sub(r"(\d+)\s*[Mm][Mm]\b", lambda m: f"{m.group(1)}mm", s)

    def _ascii_frac(m: re.Match) -> str:
        whole = m.group(1) or ""
        num = m.group(2)
        den = m.group(3)
        ufrac = _ASCII_FRAC_TO_UNICODE.get((num, den))
        if ufrac is None:
            # Bilinmeyen kesir (orn 5/8) — kompakt boslusuz "5/8"
            return f"{whole + ' ' if whole else ''}{num}/{den}".replace("  ", " ")
        return f"{whole}{ufrac}"

    # Mixed: '1 1/4' → '1¼'
    s = re.sub(r"(\d+)\s+(\d+)/(\d+)", _ascii_frac, s)
    # Standalone kesir: '1/4' → '¼' (oncesinde rakam yok)
    s = re.sub(r"(?<!\d)()(\d+)/(\d+)(?!\d)", _ascii_frac, s)
    # Coklu bosluklari tek bosluga indir
    s = re.sub(r"\s+", " ", s).strip()
    return s


# ════════════════════════════════════════════════════════════════════════
#  LAYER-AWARE FILTERING
#  Yangin tesisati segment'lerine isitma/sogutma/basinclihava layer'larindan
#  cap-text atanmasini engeller. Yan yana cakisan tesisatlardan yanlis cap
#  gelmesi engellenir.
# ════════════════════════════════════════════════════════════════════════

# Yapisal/anlamsiz kelimeler — tema degil; layer adindan cikartilir.
# Tema kelimeleri (yangin, isitma, sogutma, klima, sihhi, ...) korunur.
_LAYER_STOPWORDS = frozenset({
    # Tek harfler (anlamsiz)
    "a", "b", "c", "d", "e", "f",
    # Yapisal kelimeler
    "tesisat", "tesisati", "tesisatlari",
    "hat", "hatti", "hattisi", "hatlari",
    "kolon", "kolonu", "kolonlari",
    "bolum", "bolumu", "bolge", "bolgesi",
    "detay", "detayi", "detaylar",
    "ile", "ve", "icin", "veya",
    "cap", "capi", "caplar",  # cap-tag layer'lardan temizle (tema kalsin)
    "sistem", "sistemi", "sistemler",
    "grup", "grubu", "gruplari",
    "genel", "ana", "alt",
    "sembol", "sembolu", "sembolleri",
    "alan", "alani", "alanlar",
    "duzen", "duzeni",
    "boru", "borulama",
    "no", "numara", "numarali",
    # AutoCAD tipik
    "format", "cerceve", "yardimci", "yardim",
    # Sayisal indeksler (01-99)
})


def _normalize_turkish(s: str) -> str:
    """Turkce karakterleri normalize et + lowercase + alphanumeric only."""
    if not s:
        return ""
    tr_map = str.maketrans({
        "İ": "i", "I": "i", "Ğ": "g", "Ü": "u",
        "Ş": "s", "Ö": "o", "Ç": "c",
        "ı": "i", "ğ": "g", "ü": "u",
        "ş": "s", "ö": "o", "ç": "c",
    })
    s = s.translate(tr_map).lower()
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return s


def _layer_theme_words(layer_name: str) -> set[str]:
    """Layer adindan tema kelimelerini cikar (yapisal stopword'leri at).

    Ornekler:
      'A_Yangın Çap' -> {'yangin'}
      'YANGIN TESİSATI YANGIN DOLABI ve İSA HATTI' -> {'yangin', 'dolabi', 'isa'}
      '---ISITMA' -> {'isitma'}
      '---BASICLIHAVA_SEBEKE' -> {'basiclihava', 'sebeke'}
      'A-Yangın Tesisatı Sprink Yangın Borulama Hattı' -> {'yangin', 'sprink'}
    """
    s = _normalize_turkish(layer_name)
    # Cift haneli sayisal indeksleri de stopword olarak ele al
    words: set[str] = set()
    for w in s.split():
        if len(w) < 2:
            continue
        if w in _LAYER_STOPWORDS:
            continue
        if w.isdigit():
            continue  # "01", "02", ...
        words.add(w)
    return words


def _layers_thematically_compatible(text_layer: str, seg_layer: str) -> bool:
    """Text'in layer'i ile segment'in layer'i ayni tema'ya ait mi?

    Strateji: ikisinin de tema kelime listelerinde EN AZ 1 ortak kelime varsa
    'uyumlu'. Yangin-yangin OK; yangin-isitma DEGIL.

    Edge case: ikisi de bos tema kelime kumesi (cok generic layer) -> True
    don (atamayi engelleme; max_distance zaten filtreliyor).
    """
    twords = _layer_theme_words(text_layer)
    swords = _layer_theme_words(seg_layer)
    if not twords or not swords:
        # Bos tema (cok generic layer adi) — atamayi engelleme, distance halletsin.
        return True
    return bool(twords & swords)


def _apply_view_transform(
    x: float, y: float,
    view_transform: tuple[float, float, float, float, float, float] | None,
) -> tuple[float, float]:
    """Geometry'nin _transform_point ile aynisi — proximity space'i edge_segments
    space'iyle ayni tutar. None ise identity (x, y) doner."""
    if view_transform is None:
        return x, y
    cos_t, sin_t, tx, ty, cx, cy = view_transform
    rx = (x - cx) * cos_t - (y - cy) * sin_t + cx + tx
    ry = (x - cx) * sin_t + (y - cy) * cos_t + cy + ty
    return rx, ry


def _extract_block_texts(
    doc,
    insert_entity,
    parent_layer: str | None = None,
    view_transform: tuple[float, float, float, float, float, float] | None = None,
    _depth: int = 0,
    _visited: frozenset[str] = frozenset(),
) -> list[tuple[str, float, float, str]]:
    """INSERT'in referans verdigi blok tanimi icindeki TEXT/MTEXT'leri
    world coordinates'e donusturup don. Recursive: nested INSERT'leri
    de takip eder (visited set + max depth ile cyclic guard).

    AutoCAD'de boru cap etiketleri sik sik bir "tag block"a sarilir
    (ornek: 'A_Yangin Cap' layer'inda 664 INSERT, her biri icinde TEXT
    '1¼"' yazili). Modelspace tarama bunlari ATTRIB olmadigi icin
    yakalayamaz — blok'u acmak gerekir.

    Transform: TEXT'in lokal pozisyonunu INSERT'in pos+rot+scale ile
    world coords'e tasi. Negatif scale (mirror) matrix carpiminda dogal
    olarak handle olur — koordinatlar dogru aksetler.

    BYLAYER konvansiyonu (P0b): block icindeki TEXT'in dxf.layer "0" ise
    AutoCAD bu entity'i parent INSERT'in layer'iyle render eder. Biz de
    proximity icin parent layer'i kullaniyoruz; aksi halde "0" diye
    soyut bir layer pool'a girer ve sprinkler filtresi yanlis isler.

    Returns: [(text, world_x, world_y, effective_layer), ...]
    """
    if _depth > _MAX_BLOCK_DEPTH:
        return []
    try:
        block_name = str(getattr(insert_entity.dxf, "name", "") or "")
        if not block_name:
            return []
        if block_name in _visited:
            return []  # cyclic reference guard
        if block_name not in doc.blocks:
            return []
        block = doc.blocks[block_name]
        ip = insert_entity.dxf.insert
        ix, iy = float(ip.x), float(ip.y)
        rot = math.radians(float(getattr(insert_entity.dxf, "rotation", 0.0) or 0.0))
        sx = float(getattr(insert_entity.dxf, "xscale", 1.0) or 1.0)
        sy = float(getattr(insert_entity.dxf, "yscale", 1.0) or 1.0)
        cr, sr = math.cos(rot), math.sin(rot)
        # Parent INSERT'in layer'i — block icinde TEXT layer == "0" olunca
        # bunu kullanacagiz. None ise entity.dxf.layer fallback.
        own_layer = str(getattr(insert_entity.dxf, "layer", "") or "")
        effective_parent_layer = parent_layer or own_layer
    except Exception:
        return []

    results: list[tuple[str, float, float, str]] = []

    def _local_to_world(lx: float, ly: float) -> tuple[float, float]:
        """Local block coords -> world coords (scale, rotate, translate)."""
        sxl, syl = lx * sx, ly * sy
        return (sxl * cr - syl * sr + ix, sxl * sr + syl * cr + iy)

    # ── Direct TEXT/MTEXT block icinde ─────────────────────────────
    try:
        text_iter = block.query("TEXT MTEXT")
    except Exception:
        text_iter = []
    for ent in text_iter:
        try:
            # KRITIK FILTER (geometry.py:272 ile ayni): invisible entity'leri ATLA.
            # AutoCAD dynamic block'larda block icinde HER variant icin TEXT entity
            # bulunur, sadece bir tanesi visible olur (dxf.invisible=0). Bu filter
            # olmazsa proximity TUM variants'i goruyor ve yanlis cap atiyordu —
            # ornek: *U112 ('2½"' block) icinde '1"', '1¼"', '2"', '2½"' TEXT'leri
            # var; visible olan sadece '2½"'. Bu kontrol olmadan '1"' atanyordu.
            if getattr(ent.dxf, "invisible", 0) == 1:
                continue
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
            wx, wy = _local_to_world(lx, ly)
            # KRITIK: view_transform uygulanmali (edge_segments view space'te,
            # text de ayni space'te olmali; yoksa mesafe hesabi YANLIS).
            wx, wy = _apply_view_transform(wx, wy, view_transform)
            # P0b: TEXT'in kendi layer'i "0" ise parent INSERT layer'i
            ent_layer = str(getattr(ent.dxf, "layer", "") or "")
            effective = effective_parent_layer if ent_layer in ("", "0") else ent_layer
            results.append((txt, wx, wy, effective))
        except (AttributeError, TypeError, ValueError):
            continue

    # ── Nested INSERT recursion (P0a) ──────────────────────────────
    # Block icindeki INSERT'leri de ac — onlarin icindeki TEXT'leri al.
    # visited set'e bu block'u ekle ki cyclic referans patlamasin.
    try:
        nested_iter = block.query("INSERT")
    except Exception:
        nested_iter = []
    new_visited = _visited | {block_name}
    for nested in nested_iter:
        try:
            # Nested INSERT'in lokal pozisyonunu world'e tasi, sonra
            # geçici bir "synthetic" insert objesi gibi davran — yani
            # recursive call'a dogru transform'u zaten yapan parent ile gir.
            # Pratikte: nested'in dxf.insert/rotation/scale'i lokal koordinatta,
            # _extract_block_texts kendi local-to-world transform'unu uyguluyor.
            # Bizim burada nested'i ham ile gondermemiz YETERSIZ — cunku
            # nested'in dxf.insert lokal, biz worldspace transform'u once
            # uygulamaliyiz. Bunun yerine: NESTED icin ozyinelemeli cagri
            # YENI bir local-to-world zinciri kurmali.
            #
            # Cozum: nested.dxf.insert/rot/scale'i ALI VE PARENT TRANSFORM ILE
            # CARPIP YENI BIR EFFECTIVE INSERT olustur, sonra recursive cagir.
            # Bunu temiz yapmak icin sadece world space'e tasinmis bir "stub"
            # gerekiyor. ezdxf entity'sini mutate edemeyiz; bu yuzden
            # alternative: nested icindeki TEXT'leri kendi mantigimizla
            # gez (iki adim transform).
            nip = nested.dxf.insert
            nlx, nly = float(nip.x), float(nip.y)
            n_rot_local = math.radians(float(getattr(nested.dxf, "rotation", 0.0) or 0.0))
            n_sx = float(getattr(nested.dxf, "xscale", 1.0) or 1.0)
            n_sy = float(getattr(nested.dxf, "yscale", 1.0) or 1.0)
            # Nested'in world pozisyonu (parent transform uygulu)
            nwx, nwy = _local_to_world(nlx, nly)
            # Bilesik rotation = parent_rot + nested_rot_local
            combined_rot = rot + n_rot_local
            # Bilesik scale = parent_sx * nested_sx (carpim)
            combined_sx = sx * n_sx
            combined_sy = sy * n_sy
            n_cr, n_sr = math.cos(combined_rot), math.sin(combined_rot)

            n_block_name = str(getattr(nested.dxf, "name", "") or "")
            if not n_block_name or n_block_name in new_visited:
                continue
            if n_block_name not in doc.blocks:
                continue
            n_block = doc.blocks[n_block_name]

            # Nested'in kendi layer'i — TEXT layer "0" ise nested INSERT layer'i
            nested_own_layer = str(getattr(nested.dxf, "layer", "") or "")
            nested_effective_parent = (
                effective_parent_layer if nested_own_layer in ("", "0") else nested_own_layer
            )

            def _l2w_nested(lx: float, ly: float, nwx=nwx, nwy=nwy,
                            csx=combined_sx, csy=combined_sy,
                            ncr=n_cr, nsr=n_sr) -> tuple[float, float]:
                sxl, syl = lx * csx, ly * csy
                return (sxl * ncr - syl * nsr + nwx, sxl * nsr + syl * ncr + nwy)

            # Nested block icindeki direct TEXT/MTEXT
            try:
                n_text_iter = n_block.query("TEXT MTEXT")
            except Exception:
                n_text_iter = []
            for ent in n_text_iter:
                try:
                    # Invisible filter (dynamic block visibility — geometry.py:272 ile ayni)
                    if getattr(ent.dxf, "invisible", 0) == 1:
                        continue
                    etype = ent.dxftype()
                    if etype == "TEXT":
                        raw = str(getattr(ent.dxf, "text", "") or "")
                    else:
                        raw = (
                            ent.plain_text()
                            if hasattr(ent, "plain_text")
                            else str(getattr(ent.dxf, "text", "") or "")
                        )
                    txt = str(raw).replace("\n", " ").strip()
                    if not txt:
                        continue
                    lp = ent.dxf.insert
                    wx, wy = _l2w_nested(float(lp.x), float(lp.y))
                    # View transform uyumu (edge space'iyle ayni olsun)
                    wx, wy = _apply_view_transform(wx, wy, view_transform)
                    ent_layer = str(getattr(ent.dxf, "layer", "") or "")
                    effective = nested_effective_parent if ent_layer in ("", "0") else ent_layer
                    results.append((txt, wx, wy, effective))
                except (AttributeError, TypeError, ValueError):
                    continue

            # Daha derin nested icin recursive — depth limiti ile.
            # NOT: Daha derin seviyeler nadir; max derinlik 4'te kesilir.
            if _depth + 1 < _MAX_BLOCK_DEPTH:
                deeper = _extract_block_texts(
                    doc, nested,
                    parent_layer=nested_effective_parent,
                    view_transform=view_transform,
                    _depth=_depth + 2,  # iki seviye ileri — bu fonk + recursive
                    _visited=new_visited,
                )
                # deeper'da koordinatlar nested'in kendi transform'unda; ama
                # nested'i parent transform ile bagladigimizi unutmadan,
                # deeper'i da parent transform'a tasimaliyiz. _l2w_nested
                # zaten parent transform'u iceriyor, ama recursive call kendi
                # local-to-world'unu kuruyor olabilir — bu durum derin
                # seviyelerde drift uretir. Pratikte cap text'leri seviye
                # 0-1'de oldugu icin bu drift'i kabul ediyoruz; gelecekte
                # tam matrix kompozisyonu ile temizlenebilir.
                results.extend(deeper)
        except (AttributeError, TypeError, ValueError):
            continue

    return results


def _extract_all_texts(
    doc,
    excluded_layers: set[str] | None = None,
    view_transform: tuple[float, float, float, float, float, float] | None = None,
) -> list[dict]:
    """DXF modelspace'inden GORUNUR cap-text'leri cikar.
    TEXT/MTEXT/DIMENSION/MULTILEADER/MLEADER/INSERT (ATTRIB + nested block).
    Gorunmez (dxf.invisible=1) entity'ler ve sprinkler layer'lar haric.

    Returns: [{"x", "y", "value", "layer", "source"}, ...]
    """
    excluded_layers = excluded_layers or set()
    texts: list[dict] = []
    try:
        msp = doc.modelspace()
    except Exception:
        return texts

    def _add(txt_raw: str, x: float, y: float, layer: str, source: str) -> None:
        """Cap belirteci filter + extract. Yoksa havuza alma.
        Pozisyon view_transform ile edge_segments space'ine tasinir."""
        txt = _autocad_decode(txt_raw or "").strip()
        if not txt:
            return
        m = _CAP_PATTERN.search(txt)
        if not m:
            return
        extracted = _canonicalize_cap(m.group(0).strip())
        if not extracted:
            return
        # Pozisyonu edge space'e tasiyan view_transform uygulanir
        wx, wy = _apply_view_transform(float(x), float(y), view_transform)
        texts.append({
            "x": wx, "y": wy,
            "value": extracted,
            "layer": layer, "source": source,
        })

    for entity in msp:
        etype = entity.dxftype()
        try:
            layer = str(getattr(entity.dxf, "layer", "") or "")
            if layer in excluded_layers:
                continue

            # KRITIK FILTER: gorunmez entity'leri (dxf.invisible=1) ATLA.
            # Modelspace top-level'da TEXT/MTEXT/DIMENSION/INSERT/... hepsi icin gecerli.
            # Bu filter olmadan, gorunmeyen bir 'DN300' veya 'DN15' TEXT proximity
            # pool'una giriyor ve bir segmente cap olarak atanyor — kullanici
            # cizimde olmayan capi gormesinin asil sebebi buydu.
            # INSERT icin: block instance gorunmezse icindeki TEXT'lere de bakma
            # (block icinde recursive filter zaten var ama ust seviye de filtrelenmeli).
            if getattr(entity.dxf, "invisible", 0) == 1:
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
                            # INVISIBLE filter — ATTRIB icin iki yol:
                            # a) dxf.invisible == 1 (entity-level invisible)
                            # b) ATTRIB flags & 1 (DXF spec: bit 0 = invisible)
                            # Her iki kanal da kontrol edilmeli; AutoCAD'in eski versiyonlari
                            # gorunmez ATTRIB'leri flags ile, yenileri invisible ile isaretler.
                            if getattr(at.dxf, "invisible", 0) == 1:
                                continue
                            if int(getattr(at.dxf, "flags", 0) or 0) & 1:
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
                #
                # P0a: Nested INSERT'leri de takip eder (max depth 4, cyclic guard).
                # P0b: Block TEXT'in dxf.layer "0" ise parent INSERT layer'ina dusurulur.
                try:
                    block_texts = _extract_block_texts(
                        doc, entity,
                        parent_layer=layer,
                        view_transform=view_transform,
                    )
                    for btxt, wx, wy, blayer in block_texts:
                        # Sprinkler/excluded layer filtresini block TEXT'lere de uygula
                        if blayer in excluded_layers:
                            continue
                        _add(btxt, wx, wy, blayer, "BLOCK_TEXT")
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


# Mesafe sınırı default (DWG world unit, scale 0.001 ile 2 metre).
# Cap text'i segmente bu mesafeden uzaksa atanmaz — uzak text'in "kazanmasini"
# onler. Pool BLOCK_TEXT ile buyudukten sonra (15000+) bu kritik. 81960eb refactor'unda
# kaldirilmisti, BLOCK_TEXT genislemesiyle birlikte geri eklendi.
DEFAULT_MAX_DISTANCE_WORLD = 2000.0

# Endpoint paylasimi toleransi (DWG world unit). T-junction'da iki segment'in
# uclari floating-point hassasiyetinden ufak ayrik durabilir; bu tolerans icinde
# olan endpoint'ler ayni nokta sayilir.
_INHERITANCE_ENDPOINT_TOL = 1.0  # 1 mm (mm-bazli DWG icin)


def _segment_endpoints(es) -> list[tuple[float, float]]:
    """Segment'in iki ucunu (x, y) olarak don. coords > polyline > attr fallback."""
    if isinstance(es, dict):
        c = es.get("coords") or []
        if len(c) >= 4:
            return [(float(c[0]), float(c[1])), (float(c[2]), float(c[3]))]
        pl = es.get("polyline") or []
        if pl and len(pl) >= 2:
            return [(float(pl[0][0]), float(pl[0][1])),
                    (float(pl[-1][0]), float(pl[-1][1]))]
        return []
    # object: EdgeSegment Pydantic model
    c = getattr(es, "coords", None) or []
    if len(c) >= 4:
        return [(float(c[0]), float(c[1])), (float(c[2]), float(c[3]))]
    pl = getattr(es, "polyline", None) or []
    if pl and len(pl) >= 2:
        return [(float(pl[0][0]), float(pl[0][1])),
                (float(pl[-1][0]), float(pl[-1][1]))]
    return []


def _propagate_inheritance(edge_segments: list[Any], tolerance: float) -> int:
    """T-junction komsulari arasi BFS-based cap miras yayilimi.

    Proximity bittikten sonra cagrilir. Atama almamis segmentlere, AYNI LAYER'da
    AYNI ENDPOINT'i paylasan ATANMIS komsudan cap miras verir. BFS sirasinda
    ilk gelen kazanir (ana-hat -> kollar yayilimi pratikte dogal sonuc).

    Returns: miras alan segment sayisi.
    """
    if not edge_segments or tolerance <= 0:
        return 0

    def _key(x: float, y: float) -> tuple[int, int]:
        """Endpoint'i tolerance grid'ine snap'le — hash key."""
        return (round(x / tolerance), round(y / tolerance))

    # Endpoint key -> [segment indices]
    from collections import defaultdict, deque
    endpoint_to_segs: dict[tuple[int, int], list[int]] = defaultdict(list)
    for idx, es in enumerate(edge_segments):
        for (ex, ey) in _segment_endpoints(es):
            endpoint_to_segs[_key(ex, ey)].append(idx)

    # BFS frontier: atanmis segment indices'lerini kuyruga koy
    queue: deque[int] = deque()
    for idx, es in enumerate(edge_segments):
        d = getattr(es, "diameter", "") or ""
        if d and d != "Belirtilmemis":
            queue.append(idx)

    inherited = 0
    while queue:
        src_idx = queue.popleft()
        src = edge_segments[src_idx]
        src_cap = getattr(src, "diameter", "") or ""
        src_layer = getattr(src, "layer", "") or ""
        if not src_cap:
            continue  # defansif — kuyrukta yer almamali ama yine de
        for (ex, ey) in _segment_endpoints(src):
            for nbr_idx in endpoint_to_segs.get(_key(ex, ey), []):
                if nbr_idx == src_idx:
                    continue
                nbr = edge_segments[nbr_idx]
                nbr_cap = getattr(nbr, "diameter", "") or ""
                if nbr_cap and nbr_cap != "Belirtilmemis":
                    continue  # zaten atanmis
                # AYNI LAYER kosulu — yangin → isitma sicramasin
                if (getattr(nbr, "layer", "") or "") != src_layer:
                    continue
                nbr.diameter = src_cap
                if hasattr(nbr, "is_inherited"):
                    nbr.is_inherited = True
                inherited += 1
                queue.append(nbr_idx)
    return inherited


def assign_diameters_by_proximity(
    doc,
    edge_segments: list[Any],
    sprinkler_layers: set[str] | None = None,
    max_distance_world: float | None = None,
    inheritance_tolerance: float | None = None,  # noqa: ARG001 — backward compat
    view_transform: tuple[float, float, float, float, float, float] | None = None,
) -> dict:
    """Her segmente, layer-uyumlu en yakin GORUNUR cap-text'i ata.

    Kural: "borunun yaninda gorunen cap-text var -> al, yoksa atama yapma."

    Args:
        doc: ezdxf Drawing
        edge_segments: list of EdgeSegment — diameter field'i mutate edilir
        sprinkler_layers: bu layer'lardaki text'ler havuzdan dusurulur
        max_distance_world: maks text-segment mesafesi (DWG world unit).
          None -> DEFAULT_MAX_DISTANCE_WORLD. 0/negatif -> sinir yok.

    Returns: assigned_count, skipped_count, text_pool_size, source_summary,
             warnings, max_distance_world, out_of_range_text_count, inherited_count(=0).
    """
    # Efektif mesafe sınırı
    if max_distance_world is None:
        effective_max_dist = DEFAULT_MAX_DISTANCE_WORLD
    elif max_distance_world <= 0:
        effective_max_dist = math.inf
    else:
        effective_max_dist = float(max_distance_world)
    warnings: list[str] = []
    texts = _extract_all_texts(
        doc,
        excluded_layers=sprinkler_layers,
        view_transform=view_transform,
    )
    pool_size = len(texts)
    if pool_size == 0:
        warnings.append(
            "Proximity: DXF'te gorunen cap-text bulunamadi"
        )
        return {
            "assigned_count": 0,
            "inherited_count": 0,
            "skipped_count": len(edge_segments),
            "text_pool_size": 0,
            "source_summary": "",
            "warnings": warnings,
            "max_distance_world": effective_max_dist if effective_max_dist != math.inf else None,
            "out_of_range_text_count": 0,
        }

    from collections import Counter
    source_counts = Counter(t.get("source", "?") for t in texts)
    source_summary = ", ".join(f"{src}:{cnt}" for src, cnt in source_counts.most_common())

    # Pool size guard — kullanici hesaplama suresinin uzayabilecegini bilsin
    if pool_size > 3000:
        warnings.append(
            f"Proximity: cap-text havuzu BUYUK ({pool_size}). Hesaplama yavaslayabilir."
        )

    # SEGMENT-PERSPECTIVE NAIVE NEAREST + LAYER-AWARE FILTER
    # Her segment: kendi layer'i ile tematik uyumlu, mesafe sinirinin altindaki
    # EN YAKIN cap-text'i alir. Aksi halde atama yapilmaz.
    assigned = 0
    for es in edge_segments:
        try:
            current = getattr(es, "diameter", "") or ""
            if current and current != "Belirtilmemis":
                continue  # manuel override korunur
            seg_layer = getattr(es, "layer", "") or ""
            best_text: dict | None = None
            best_d = effective_max_dist
            for t in texts:
                if not _layers_thematically_compatible(t.get("layer", ""), seg_layer):
                    continue
                d = _segment_distance(es, t["x"], t["y"])
                if d < best_d:
                    best_d = d
                    best_text = t
            if best_text is None:
                continue
            es.diameter = best_text["value"]
            assigned += 1
        except Exception as _e:
            logging.warning("proximity nearest skip: %s", _e)
            continue

    # Atama sonrasi atanmayan segment sayisi (proximity asamasinin sonu)
    out_of_range_count = sum(
        1 for es in edge_segments
        if not (getattr(es, "diameter", "") or "")
    )
    if out_of_range_count > 0 and effective_max_dist != math.inf:
        warnings.append(
            f"Proximity: {out_of_range_count} segmente mesafe sinirinin ({effective_max_dist:g}) "
            f"altinda cap-text bulunamadi."
        )

    # ── INHERITANCE: T-junction komsulari arasi BFS yayilimi ──────────
    # Text bulamayan segmentler icin: AYNI LAYER'da AYNI ENDPOINT'i paylasan
    # ATANMIS komsudan cap miras al. Kullanici kurali:
    #   "2 metre mesafede text bulamazsan miras olarak bir onceki hattin
    #    text'ini alacaksin."
    _inh_tol = (
        float(inheritance_tolerance)
        if inheritance_tolerance and inheritance_tolerance > 0
        else _INHERITANCE_ENDPOINT_TOL
    )
    inherited = _propagate_inheritance(edge_segments, _inh_tol)
    # Inheritance sonrasi hala bos kalan segment sayisi (gercek skipped)
    skipped = sum(
        1 for es in edge_segments
        if not (getattr(es, "diameter", "") or "")
    )
    if inherited > 0:
        warnings.append(
            f"Inheritance: {inherited} segment T-junction komsusundan cap miras aldi."
        )

    return {
        "assigned_count": assigned,
        "inherited_count": inherited,
        "skipped_count": skipped,
        "text_pool_size": pool_size,
        "source_summary": source_summary,
        "warnings": warnings,
        "max_distance_world": effective_max_dist if effective_max_dist != math.inf else None,
        "out_of_range_text_count": out_of_range_count,
    }
