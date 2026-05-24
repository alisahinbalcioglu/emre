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


def _extract_block_texts(
    doc,
    insert_entity,
    parent_layer: str | None = None,
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
                #
                # P0a: Nested INSERT'leri de takip eder (max depth 4, cyclic guard).
                # P0b: Block TEXT'in dxf.layer "0" ise parent INSERT layer'ina dusurulur.
                try:
                    block_texts = _extract_block_texts(doc, entity, parent_layer=layer)
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


def assign_diameters_by_proximity(
    doc,
    edge_segments: list[Any],
    sprinkler_layers: set[str] | None = None,
    max_distance_world: float | None = None,
    inheritance_tolerance: float | None = None,
) -> dict:
    """
    SEGMENT-PERSPECTIVE NAIVE NEAREST: Her segment KENDI en yakin cap-text'ini
    alir. Mesafe DEFAULT_MAX_DISTANCE_WORLD sinirini asan text'ler atanmaz.
    Ayni text birden fazla yakin segmente paylasilabilir (T-junction'da ayni
    cap zaten kardes borulara uygulanir).

    Onceki "mutual nearest" (text-perspective, tek-text-tek-segment kapma)
    mantigi BLOCK_TEXT havuzu buyudukten sonra kullaniciya yanlis sonuc
    veriyordu: borunun yanindaki text bir kardes boruya kapilinca, bu boru
    uzaktaki bambaska bir text'i 'en yakin' aliyordu. Basit mantik daha
    saglam: "borunun yaninda text var -> al, yoksa Belirtilmemis."

    Args:
        doc: ezdxf Drawing
        edge_segments: list of EdgeSegment — diameter field'i mutate edilir
        sprinkler_layers: bu layer'lardaki text'ler havuzdan dusurulur
        max_distance_world: DWG world unit cinsinden maks text-segment mesafesi.
          None -> DEFAULT_MAX_DISTANCE_WORLD (2000mm). 0 veya negatif -> sinir yok.
        inheritance_tolerance: kullanilmiyor (backward compat)

    Returns:
        {assigned_count, skipped_count, text_pool_size, source_summary,
         warnings, inherited_count(=0), max_distance_world, out_of_range_*,
         debug_*}
    """
    # Efektif mesafe sınırı — None ise default, <=0 ise sinir yok
    if max_distance_world is None:
        effective_max_dist = DEFAULT_MAX_DISTANCE_WORLD
    elif max_distance_world <= 0:
        effective_max_dist = math.inf
    else:
        effective_max_dist = float(max_distance_world)
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
            "max_distance_world": effective_max_dist if effective_max_dist != math.inf else None,
            "out_of_range_text_count": 0,
            "debug_rejected_texts": debug_rejected[:50],
            "debug_accepted_sample": [],
            "debug_assignment_sample": [],
        }

    from collections import Counter
    source_counts = Counter(t.get("source", "?") for t in texts)
    source_summary = ", ".join(f"{src}:{cnt}" for src, cnt in source_counts.most_common())

    # P1c: Pool size guard — buyuk DWG'lerde proximity O(text × edge) maliyeti
    # patlamasin. Esik gecince warning ekle (kullaniciya gosterilir, hesap yine devam).
    # 3000 esigi: 3000 text × 1500 edge = 4.5M mesafe hesabi ~ 1-2 saniye. Cok daha
    # azi normal. Sinir asilirsa kullanici tum-DWG isleyislerinde yavaslama beklesin.
    if pool_size > 3000:
        warnings.append(
            f"Proximity: cap-text havuzu BUYUK ({pool_size}). Hesaplama yavaslayabilir."
        )

    # ── SEGMENT-PERSPECTIVE NAIVE NEAREST + LAYER-AWARE FILTER ──────
    # Her segment KENDI en yakin cap-text'ini alir AMA text'in layer'i ile
    # segment'in layer'inin TEMA KELIMELERI ortak olmali (yangin-yangin OK,
    # yangin-isitma DEGIL). Bu sayede yan yana cakisan tesisatlardan yanlis
    # cap atanmaz. Mesafe sinirinin altinda kalmak kosuluyla.
    #
    # Ozel durum: layer adi cok generic (tema kelime yok) -> filter atlanir,
    # sadece distance kontrolu yeter.
    #
    # DIAGNOSTIC: ilk 60 atamanin bilgisini sample'a koy.
    assigned = 0
    out_of_range_count = 0
    assignment_sample: list[dict] = []
    for idx, es in enumerate(edge_segments):
        try:
            current = getattr(es, "diameter", "") or ""
            if current and current != "Belirtilmemis":
                continue  # manuel override korunur
            seg_layer = getattr(es, "layer", "") or ""
            # Bu segmente en yakin UYUMLU text'i ara
            best_text: dict | None = None
            best_d = effective_max_dist  # mesafe siniri — bunun ustu sayilmaz
            for t in texts:
                try:
                    # LAYER-AWARE FILTER: tematik uyumsuz text'leri atla.
                    if not _layers_thematically_compatible(t.get("layer", ""), seg_layer):
                        continue
                    d = _segment_distance(es, t["x"], t["y"])
                    if d < best_d:
                        best_d = d
                        best_text = t
                except Exception:
                    continue
            if best_text is None:
                # Bu segmente mesafe + layer-compatibility kosullarinda hicbir text yok
                continue
            es.diameter = best_text["value"]
            assigned += 1
            if len(assignment_sample) < 60:
                seg_id = getattr(es, "segment_id", idx)
                assignment_sample.append({
                    "segment_id": int(seg_id),
                    "segment_layer": seg_layer,
                    "assigned_diameter": best_text["value"],
                    "distance_world": round(best_d, 2),
                    "text_layer": best_text.get("layer", ""),
                    "text_source": best_text.get("source", ""),
                    "text_xy": [round(best_text["x"], 1), round(best_text["y"], 1)],
                })
        except Exception as _e:
            logging.warning("proximity nearest skip: %s", _e)
            continue

    # Mesafe siniri yuzunden atanmayan segment'leri say (warning icin)
    out_of_range_count = sum(
        1 for es in edge_segments
        if not (getattr(es, "diameter", "") or "")
    )

    skipped = out_of_range_count
    if out_of_range_count > 0 and effective_max_dist != math.inf:
        warnings.append(
            f"Proximity: {out_of_range_count} segmente mesafe sinirinin ({effective_max_dist:g}) "
            f"altinda cap-text bulunamadi."
        )
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
        "max_distance_world": effective_max_dist if effective_max_dist != math.inf else None,
        "out_of_range_text_count": out_of_range_count,
        "debug_rejected_texts": debug_rejected[:50],
        "debug_accepted_sample": accepted_sample,
        "debug_assignment_sample": assignment_sample,
    }
