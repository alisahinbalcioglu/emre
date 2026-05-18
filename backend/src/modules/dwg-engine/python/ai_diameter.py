"""
ai_diameter.py — AI ile boru cap atama.

Akis:
  1. DXF'ten secilen boru layer'larinin her LINE/POLYLINE segment'ini topla
  2. DXF'teki tum cap benzeri TEXT/MTEXT entity'lerini topla
  3. Her segment icin en yakin 3-5 text'i + mesafesini bul
  4. Hat tipi + muhendislik kurallariyla zenginlestirilmis prompt Claude'a git
  5. Segment -> cap dict'i dondur

Kullanici onayi frontend'de — bu modul sadece AI onerisi uretir.
"""

import json
import math
import os
import re
from typing import TypedDict

import ezdxf
from anthropic import Anthropic


# ── Cap text patternleri (text'i "bu cap olabilir" diye tanimlar) ──

_DIAMETER_RE = re.compile(
    r'('
    # Ø / ø — opsiyonel mm eki
    r'Ø\s*\d+(?:\s*mm)?|'                  # Ø50, Ø 50 mm, Ø50mm
    r'ø\s*\d+(?:\s*mm)?|'
    # DN / NPS — nominal boru olculeri
    r'DN\s*\d+|'                           # DN50, DN 50
    r'NPS\s*\d+|'                          # NPS 2, NPS2
    # Inch — unicode fraction ile (1¼", 1¼″, 1¼'')
    r'\d+-\d+/\d+\s*(?:["″]|\'\')|'        # 1-1/4" (tire birlesimi)
    r'\d+\s*[¼½¾]\s*(?:["″]|\'\')|'        # 1¼", 2½"
    r'[¼½¾]\s*(?:["″]|\'\')|'              # ½", ¾"
    # Inch — mixed number + fraction + tam sayi
    r'\d+\s+\d+/\d+\s*(?:["″]|\'\')|'      # 1 1/4"
    r'\d+/\d+\s*(?:["″]|\'\')|'            # 1/2"
    r'\d+\s*(?:["″]|\'\')|'                # 2", 50"
    # Inch — kelime olarak (2 inch, 2 in, 1¼ inch)
    r'\d+\s*[¼½¾]?\s*inch\b|'              # 2 inch, 1¼ inch
    r'\d+/\d+\s*inch\b|'                   # 1/2 inch
    r'\d+\s*[¼½¾]?\s*in\b(?!\w)|'          # 2 in (bosluktan sonra, kelime-sonu)
    r'\d+/\d+\s*in\b(?!\w)|'
    # Standalone mm (Ø olmadan): 50mm, 50 mm
    r'\d+\s*mm\b(?!\w)|'
    # Turkce argo: 50'lik, 50lik
    r'\d+\s*[\u0027\u2019]?\s*l[iı]k\b(?!\w)'
    r')',
    re.IGNORECASE | re.UNICODE,
)


def _autocad_decode(s: str) -> str:
    """AutoCAD %% kodlarini cevir (%%c = Ø, %%188 = ¼ vb)."""
    return (s
        .replace("%%c", "Ø").replace("%%C", "Ø")
        .replace("%%188", "¼").replace("%%189", "½").replace("%%190", "¾"))


def _has_diameter_pattern(text: str) -> bool:
    """Text cap ifadesi iceriyor mu?"""
    if not text:
        return False
    decoded = _autocad_decode(text)
    return bool(_DIAMETER_RE.search(decoded))


class Segment(TypedDict, total=False):
    id: int
    layer: str
    x1: float
    y1: float
    x2: float
    y2: float
    length: float
    polyline: list[list[float]]  # opsiyonel — chain'in sirali vertex'leri


class DiameterText(TypedDict):
    value: str
    x: float
    y: float


# ── Segment/Run uretimi ───────────────────────────────────────────

# Sprinkler tespit regex — block name bu pattern'i iceren INSERT'ler sprinkler sayilir
# (auto_detect_sprinklers fail-safe fallback'i, ya da AI kapali iken).
_SPRINKLER_RE = re.compile(
    r'spr(?:ink)?|upright|pendant|sidewall|fire.?head|yağmur',
    re.IGNORECASE,
)


# ── AI-bazli sprinkler block tespiti (auto_detect_sprinklers) ─────
#
# Modul-level cache. Key = (dxf_path, mtime_ns, hat_tipi_hint).
# Value = (sprinkler_block_names: set[str], timestamp_sec).
# 24 saat TTL — proje yeniden parse edilince AI cagrisi tekrarlanmaz.
_SPRINKLER_BLOCK_CACHE: dict[tuple[str, int, str], tuple[set[str], float]] = {}
_SPRINKLER_CACHE_TTL_SEC = 24 * 3600
# AI block sınıflandırma için max unique block sayısı (prompt budget koruması)
_MAX_BLOCKS_TO_CLASSIFY = 300
# Sprinkler INSERT yakininda bulunan TEXT'leri cap havuzundan dusurme esigi (mm)
_SPRINKLER_ID_TEXT_THRESHOLD = 30.0
# Block radius < bu deger ise (DXF birimi mm varsayilir) sprinkler kandidati sayilir
# (kullanici AI kapali calistirirsa veya AI cevap veremezse fallback için)
_SPRINKLER_MAX_RADIUS_MM = 50.0


def _collect_blocks_for_classification(doc) -> list[dict]:
    """Modelspace'teki unique INSERT block'larini sayim + ornek pozisyon ile topla.

    Donus: [{"block_name", "count", "layers", "positions"[max 5]}]
    """
    from collections import defaultdict
    blocks: dict[str, dict] = defaultdict(
        lambda: {"count": 0, "layers": set(), "positions": []}
    )
    for ins in doc.modelspace().query('INSERT'):
        try:
            name = str(ins.dxf.name or '').strip()
            if not name:
                continue
            layer = str(ins.dxf.layer or '')
            x = float(ins.dxf.insert.x)
            y = float(ins.dxf.insert.y)
        except Exception:
            continue
        b = blocks[name]
        b["count"] += 1
        b["layers"].add(layer)
        if len(b["positions"]) < 5:
            b["positions"].append((x, y))
    return [
        {
            "block_name": name,
            "count": data["count"],
            "layers": sorted(data["layers"])[:5],
        }
        for name, data in blocks.items()
    ]


def _build_classification_prompt(blocks: list[dict], hat_tipi_hint: str = "") -> str:
    """Block listesini Claude'a sprinkler/diger sınıflandırma için hazırla.

    Sadece sprinkler/non-sprinkler ayrimi (test_equipment_ai.py 11-tip
    sınıflandırmasına gore daha dar). Cunku amac sadece T noktasi tespiti.
    """
    hint_line = f"\nHAT TIPI: {hat_tipi_hint}" if hat_tipi_hint else ""
    return f"""Sen bir mekanik/yangin tesisat uzmanisin. AutoCAD DWG dosyasindan
cikarilan unique block referanslarini siniflandiriyorsun.{hint_line}

Gorev: Her block'un YANGIN SPRINKLER KAFASI olup olmadigini belirle.

SPRINKLER ICIN POZITIF ISARETLER:
- Block adi: spr/sprink/upright/pendant/sidewall/concealed/yagmur, UH/PEND
- Yangin tesisat layer'inda ve cok sayida (10+) tekrar eden kucuk simetrik
  semboller (pipe network'unun T noktalarinda)
- Genelde 5-50mm civari boyut (radius)

SPRINKLER OLMAYAN:
- Vana, pompa, dolap, sayac, fitting, lavabo, klozet, tank
- Title block, frame, lejant, ok isaretleri, kotu/kuzey isareti
- Genel ekipman blocklari

Her block icin SADECE iki secenek:
- "sprinkler"     → kesin/buyuk olasilik sprinkler kafasi
- "other"         → sprinkler degil veya emin degilsin

Block listesi ({len(blocks)} tane):
{json.dumps(blocks, ensure_ascii=False, indent=2)}

SADECE valid JSON array dondur, ek metin yok:
[{{"block_name":"...","is_sprinkler":true|false}}, ...]"""


def auto_detect_sprinklers(
    dxf_path: str,
    hat_tipi_hint: str = "",
    model: str = "claude-sonnet-4-5",
    doc=None,
) -> tuple[set[str], dict]:
    """DXF'teki unique INSERT block'larini Claude'a sınıflandırarak sprinkler
    olanlarini tespit eder. Cache'li — ayni dosya icin AI cagrisi 1 kez yapilir.

    Fail-safe: API key yoksa veya cagri basarisizsa _SPRINKLER_RE regex
    fallback'i ile devam eder, hata firlatmaz.

    Returns:
      (sprinkler_block_names, info_dict)
      sprinkler_block_names: sprinkler olarak işaretlenen block adlari
      info_dict: {source: "ai"|"regex"|"cache", cost_usd, ...}
    """
    import time as _time
    # Cache key — dosya path + mtime + hat_tipi
    try:
        st = os.stat(dxf_path)
        cache_key = (dxf_path, st.st_mtime_ns, hat_tipi_hint or "")
    except OSError:
        cache_key = (dxf_path, 0, hat_tipi_hint or "")

    # Cache HIT?
    cached = _SPRINKLER_BLOCK_CACHE.get(cache_key)
    if cached is not None:
        block_set, ts = cached
        if (_time.time() - ts) < _SPRINKLER_CACHE_TTL_SEC:
            return block_set, {"source": "cache", "block_count": len(block_set)}

    # Doc lazy load (paylasilmissa kullan, yoksa oku) — perf icin
    def _get_doc():
        nonlocal doc
        if doc is None:
            from converter import read_dxf
            doc = read_dxf(dxf_path)
        return doc

    # API key
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        # Fallback: regex
        try:
            _doc = _get_doc()
            block_set = {
                str(ins.dxf.name or "")
                for ins in _doc.modelspace().query('INSERT')
                if _SPRINKLER_RE.search(str(ins.dxf.name or ""))
            }
        except Exception:
            block_set = set()
        _SPRINKLER_BLOCK_CACHE[cache_key] = (block_set, _time.time())
        return block_set, {"source": "regex", "block_count": len(block_set), "note": "ANTHROPIC_API_KEY yok"}

    # AI yolu
    try:
        _doc = _get_doc()
        blocks_info = _collect_blocks_for_classification(_doc)
    except Exception as e:
        return set(), {"source": "error", "error": str(e)[:100]}

    if not blocks_info:
        block_set: set[str] = set()
        _SPRINKLER_BLOCK_CACHE[cache_key] = (block_set, _time.time())
        return block_set, {"source": "ai", "block_count": 0, "note": "Hic INSERT bulunamadi"}

    # Cok block varsa kırp (prompt budget)
    if len(blocks_info) > _MAX_BLOCKS_TO_CLASSIFY:
        # En sık kullanılanları öncelikle ele al
        blocks_info.sort(key=lambda x: -x["count"])
        blocks_info = blocks_info[:_MAX_BLOCKS_TO_CLASSIFY]

    prompt = _build_classification_prompt(blocks_info, hat_tipi_hint=hat_tipi_hint)

    try:
        client = Anthropic(api_key=api_key)
        response = client.messages.create(
            model=model,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
        in_tok = response.usage.input_tokens
        out_tok = response.usage.output_tokens
        text = response.content[0].text if response.content else ""

        # JSON array extract
        m = re.search(r'\[\s*\{.*\}\s*\]', text, re.DOTALL)
        block_set: set[str] = set()
        if m:
            try:
                arr = json.loads(m.group(0))
                for item in arr:
                    if isinstance(item, dict) and item.get("is_sprinkler"):
                        name = str(item.get("block_name", "")).strip()
                        if name:
                            block_set.add(name)
            except json.JSONDecodeError:
                pass

        # Bos ya da fail → regex fallback'le birlestir (defansif)
        if not block_set:
            try:
                block_set = {
                    str(ins.dxf.name or "")
                    for ins in doc.modelspace().query('INSERT')
                    if _SPRINKLER_RE.search(str(ins.dxf.name or ""))
                }
            except Exception:
                pass

        cost_usd = (in_tok * 3.0 + out_tok * 15.0) / 1_000_000
        _SPRINKLER_BLOCK_CACHE[cache_key] = (block_set, _time.time())
        return block_set, {
            "source": "ai",
            "block_count": len(block_set),
            "input_tokens": in_tok,
            "output_tokens": out_tok,
            "cost_usd": round(cost_usd, 4),
            "model": model,
        }
    except Exception as e:
        # AI fail → regex fallback
        try:
            block_set = {
                str(ins.dxf.name or "")
                for ins in doc.modelspace().query('INSERT')
                if _SPRINKLER_RE.search(str(ins.dxf.name or ""))
            }
        except Exception:
            block_set = set()
        _SPRINKLER_BLOCK_CACHE[cache_key] = (block_set, _time.time())
        return block_set, {"source": "regex", "block_count": len(block_set), "ai_error": str(e)[:100]}

# Endpoint eslestirme tolerans DEFAULT'lari — `_compute_tolerances` runtime'da
# edge length median'ina gore dinamik hesaplar, proje-bagimsiz calisir.
_NODE_TOL = 1.0
_SPRINKLER_TOL = 10.0


def _node_key(x: float, y: float, tol: float = _NODE_TOL) -> tuple[float, float]:
    """Koordinatlari toleransa gore quantize et (endpoint matching icin)."""
    return (round(x / tol) * tol, round(y / tol) * tol)


def _compute_tolerances(edges: list[dict]) -> tuple[float, float]:
    """Edge length median'ina gore adaptif node/sprinkler tolerans hesapla.

    - node_tol: boru endpoint snap — dar tutulur, `max(1.0, median*0.01)` ~ %1.
    - sprinkler_tol: sprinkler sembolu merkezi boru ucundan biraz uzakta
      olabilir; sembol boyutu genelde median'in %20-30'u kadar — bu yuzden
      `max(25.0, median*0.25)` alinir.
    Alt sinirlar cok kucuk olceklerde (mimari birim-mm) koruma saglar.
    """
    if not edges:
        return _NODE_TOL, _SPRINKLER_TOL
    lens = sorted(e["length"] for e in edges)
    median = lens[len(lens) // 2]
    node_tol = max(1.0, median * 0.01)
    sprinkler_tol = max(25.0, median * 0.5)
    return node_tol, sprinkler_tol


def _sprinkler_centers_from_layers(
    doc,
    sprinkler_layers: list[str] | None = None,
    sprinkler_block_names: set[str] | None = None,
) -> list[tuple[float, float]]:
    """Sprinkler INSERT/CIRCLE/POINT pozisyonlarini topla.

    Iki kaynaktan birleşik liste:
      1) sprinkler_layers verilirse: o layer'lardaki INSERT + kucuk CIRCLE
         (radius < _SPRINKLER_MAX_RADIUS_MM) + POINT — yani sembol gosteren
         entity'ler. LINE/POLYLINE/TEXT atilir cunku ayni layer'da boru ya da
         etiket olabilir.
      2) sprinkler_block_names verilirse: layer FARKETMEKSIZIN, block adi bu
         set'te olan tum INSERT'ler. (auto_detect_sprinklers ciktisi).

    "Aynı layer" sorununun cozumu: sprinkler_layers verilse bile LINE'lar
    sprinkler sayilmaz (boru olarak kalir), sadece sembol entity'leri T
    noktasi olarak isaretlenir.
    """
    centers: list[tuple[float, float]] = []
    msp = doc.modelspace()
    layer_set: set[str] = set(sprinkler_layers) if sprinkler_layers else set()
    block_set: set[str] = sprinkler_block_names or set()

    if not layer_set and not block_set:
        return centers

    # INSERT — ya sprinkler layer'inda ya da sprinkler block adina sahip
    for ent in msp.query('INSERT'):
        try:
            in_layer = (ent.dxf.layer in layer_set) if layer_set else False
            block_name = str(ent.dxf.name or '')
            in_block = (block_name in block_set) if block_set else False
            if not (in_layer or in_block):
                continue
            centers.append((float(ent.dxf.insert.x), float(ent.dxf.insert.y)))
        except Exception:
            continue

    # CIRCLE — sadece sprinkler layer'inda VE radius esigi altinda
    if layer_set:
        for ent in msp.query('CIRCLE'):
            if ent.dxf.layer not in layer_set:
                continue
            try:
                radius = float(ent.dxf.radius)
                if radius > _SPRINKLER_MAX_RADIUS_MM:
                    continue  # Buyuk daire — sprinkler degil (vana, tank vb.)
                centers.append((float(ent.dxf.center.x), float(ent.dxf.center.y)))
            except Exception:
                continue

        # POINT — sadece sprinkler layer'inda
        for ent in msp.query('POINT'):
            if ent.dxf.layer not in layer_set:
                continue
            try:
                centers.append((float(ent.dxf.location.x), float(ent.dxf.location.y)))
            except Exception:
                continue

    # NOT: LINE/LWPOLYLINE/POLYLINE asla sprinkler degil — ayni layer
    # durumunda boru olarak topology'ye girmesi sart.
    # NOT: TEXT/MTEXT _filter_sprinkler_id_texts() ile cap havuzundan ayri
    # olarak filtre edilir (etiket yanlislikla cap sayilmasin).
    return centers


def _filter_sprinkler_id_texts(
    texts: list[DiameterText],
    sprinkler_centers: list[tuple[float, float]],
    threshold: float = _SPRINKLER_ID_TEXT_THRESHOLD,
) -> list[DiameterText]:
    """Bir TEXT bir sprinkler INSERT merkezine `threshold` mm'den yakinsa
    cap havuzundan dus. Sprinkler etiketleri (S1, PEND-Ø12.7) cap regex'ine
    yanlislikla takılmasın diye.

    threshold default 30mm — sprinkler sembolu boyutunun usti.
    """
    if not sprinkler_centers or not texts:
        return texts
    threshold_sq = threshold * threshold
    filtered: list[DiameterText] = []
    for t in texts:
        tx = t.get("x", 0.0)
        ty = t.get("y", 0.0)
        is_near_sprinkler = False
        for cx, cy in sprinkler_centers:
            dx = tx - cx
            dy = ty - cy
            if dx * dx + dy * dy <= threshold_sq:
                is_near_sprinkler = True
                break
        if not is_near_sprinkler:
            filtered.append(t)
    return filtered


def _detect_sprinkler_positions(
    doc,
    node_tol: float = _NODE_TOL,
    sprinkler_tol: float = _SPRINKLER_TOL,
    sprinkler_layers: list[str] | None = None,
    sprinkler_block_names: set[str] | None = None,
) -> tuple[set[tuple[float, float]], list[tuple[float, float]]]:
    """Sprinkler pozisyonlarini aura-fill seklinde node_key seti olarak dondur.

    Kaynaklari birlestirir (her ikisi de kullanilabilir):
      1) `sprinkler_layers` → entity-type filtre (INSERT + kucuk CIRCLE + POINT,
         LINE/TEXT atlanir, "ayni layer" sorununu cozer)
      2) `sprinkler_block_names` → block adina gore (auto_detect_sprinklers
         ciktisi); layer'dan bagimsiz, AI ile tespit edilen tum sprinkler
         INSERT'ler dahil olur
      3) Hicbiri yoksa → block adi regex'i (_SPRINKLER_RE) fallback

    Returns:
      (positions_set, centers_list) — positions aura-fill node key'ler,
      centers ham (cx, cy) listesi (text filter icin gerekli).
    """
    positions: set[tuple[float, float]] = set()
    centers: list[tuple[float, float]] = []
    if node_tol <= 0:
        return positions, centers
    steps = int(sprinkler_tol / node_tol) + 1

    if sprinkler_layers or sprinkler_block_names:
        centers = _sprinkler_centers_from_layers(
            doc,
            sprinkler_layers=sprinkler_layers,
            sprinkler_block_names=sprinkler_block_names,
        )
    else:
        # Fallback: block adi regex (auto_detect_sprinklers cagrilmadiysa)
        for ins in doc.modelspace().query('INSERT'):
            try:
                if not _SPRINKLER_RE.search(str(ins.dxf.name or '')):
                    continue
                centers.append((float(ins.dxf.insert.x), float(ins.dxf.insert.y)))
            except Exception:
                continue

    for cx, cy in centers:
        for dx in range(-steps, steps + 1):
            for dy in range(-steps, steps + 1):
                positions.add(_node_key(cx + dx * node_tol, cy + dy * node_tol))
    return positions, centers


def _collect_raw_edges(msp, layer_set: set[str]) -> list[dict]:
    """Tum LINE + LWPOLYLINE + POLYLINE edge'lerini toplar (vertex-level)."""
    edges: list[dict] = []
    for ent in msp.query('LINE'):
        if ent.dxf.layer not in layer_set:
            continue
        try:
            x1, y1 = float(ent.dxf.start.x), float(ent.dxf.start.y)
            x2, y2 = float(ent.dxf.end.x), float(ent.dxf.end.y)
        except Exception:
            continue
        length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
        if length < 1.0:
            continue
        edges.append({"layer": ent.dxf.layer, "x1": x1, "y1": y1, "x2": x2, "y2": y2, "length": length})

    for ent in msp.query('LWPOLYLINE'):
        if ent.dxf.layer not in layer_set:
            continue
        try:
            pts = [(float(p[0]), float(p[1])) for p in ent.get_points(format='xy')]
        except Exception:
            continue
        if len(pts) < 2:
            continue
        for i in range(len(pts) - 1):
            x1, y1 = pts[i]
            x2, y2 = pts[i + 1]
            length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            if length < 1.0:
                continue
            edges.append({"layer": ent.dxf.layer, "x1": x1, "y1": y1, "x2": x2, "y2": y2, "length": length})
        if getattr(ent, "closed", False) and len(pts) > 2:
            x1, y1 = pts[-1]
            x2, y2 = pts[0]
            length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            if length >= 1.0:
                edges.append({"layer": ent.dxf.layer, "x1": x1, "y1": y1, "x2": x2, "y2": y2, "length": length})

    for ent in msp.query('POLYLINE'):
        if ent.dxf.layer not in layer_set:
            continue
        try:
            pts = [(float(v.dxf.location.x), float(v.dxf.location.y)) for v in ent.vertices]
        except Exception:
            continue
        for i in range(len(pts) - 1):
            x1, y1 = pts[i]
            x2, y2 = pts[i + 1]
            length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            if length < 1.0:
                continue
            edges.append({"layer": ent.dxf.layer, "x1": x1, "y1": y1, "x2": x2, "y2": y2, "length": length})

    return edges


def _build_node_graph(
    edges: list[dict],
    node_tol: float = _NODE_TOL,
) -> dict[tuple[float, float], list[int]]:
    """Endpoint koordinatlarini node olarak quantize et, her node'da hangi edge'ler var."""
    graph: dict[tuple[float, float], list[int]] = {}
    for i, e in enumerate(edges):
        k1 = _node_key(e["x1"], e["y1"], node_tol)
        k2 = _node_key(e["x2"], e["y2"], node_tol)
        graph.setdefault(k1, []).append(i)
        graph.setdefault(k2, []).append(i)
    return graph


def _split_edges_on_intersections(
    edges: list[dict],
    node_tol: float,
) -> list[dict]:
    """LINE ortasina baska LINE'in endpoint'i degiyorsa (virtual tee), LINE'i
    o noktadan bolmek icin yeni edge listesi dondur.

    Amac: `_group_into_runs` sadece endpoint-koincident tee'leri ayirt eder;
    ancak tesisatta cogu T-baglanti ana hatta LINE ortasinda olur (endpoint
    ortaya degdiriyor). Bu routine o durumlari `node_tol` esiginde yakalar.
    Grid-based spatial index O(E*k) karmasiklik verir.
    """
    if not edges:
        return edges

    # Tum unique node'lari (tolerance-quantize) topla
    nodes: dict[tuple[float, float], tuple[float, float]] = {}
    for e in edges:
        for x, y in ((e["x1"], e["y1"]), (e["x2"], e["y2"])):
            nk = _node_key(x, y, node_tol)
            nodes.setdefault(nk, (x, y))

    # Grid index: cell size yeterince buyuk olsun ki komsu cell kontrolu yetsin
    cs = max(node_tol * 20.0, 1.0)
    cell: dict[tuple[int, int], list[tuple[float, float]]] = {}
    for nk, (nx, ny) in nodes.items():
        ck = (int(nx // cs), int(ny // cs))
        cell.setdefault(ck, []).append(nk)

    # Her edge icin, kendi bbox'undaki tum cell'leri tara, node LINE orta kesiminde mi?
    splits: dict[int, list[tuple[float, float, float]]] = {}  # edge_idx → [(x,y,t)]
    for i, e in enumerate(edges):
        x1, y1, x2, y2 = e["x1"], e["y1"], e["x2"], e["y2"]
        dx, dy = x2 - x1, y2 - y1
        L = e["length"]
        if L < max(3.0 * node_tol, 3.0):
            continue
        k_start = _node_key(x1, y1, node_tol)
        k_end = _node_key(x2, y2, node_tol)
        min_cx = int(min(x1, x2) // cs)
        max_cx = int(max(x1, x2) // cs)
        min_cy = int(min(y1, y2) // cs)
        max_cy = int(max(y1, y2) // cs)
        L2 = L * L
        for cx in range(min_cx, max_cx + 1):
            for cy in range(min_cy, max_cy + 1):
                for nk in cell.get((cx, cy), ()):
                    if nk == k_start or nk == k_end:
                        continue
                    nx, ny = nodes[nk]
                    # Projection parameter along edge (0..1)
                    t = ((nx - x1) * dx + (ny - y1) * dy) / L2
                    if t <= 0.001 or t >= 0.999:
                        continue
                    # Perpendicular distance
                    px = x1 + t * dx
                    py = y1 + t * dy
                    if math.hypot(nx - px, ny - py) > node_tol:
                        continue
                    splits.setdefault(i, []).append((nx, ny, t))

    if not splits:
        return edges

    new_edges: list[dict] = []
    for i, e in enumerate(edges):
        if i not in splits:
            new_edges.append(e)
            continue
        sp = sorted(splits[i], key=lambda v: v[2])
        prev_x, prev_y = e["x1"], e["y1"]
        layer = e["layer"]
        for nx, ny, _ in sp:
            seg_len = math.hypot(nx - prev_x, ny - prev_y)
            if seg_len >= 1.0:
                new_edges.append({"layer": layer, "x1": prev_x, "y1": prev_y,
                                  "x2": nx, "y2": ny, "length": seg_len})
            prev_x, prev_y = nx, ny
        seg_len = math.hypot(e["x2"] - prev_x, e["y2"] - prev_y)
        if seg_len >= 1.0:
            new_edges.append({"layer": layer, "x1": prev_x, "y1": prev_y,
                              "x2": e["x2"], "y2": e["y2"], "length": seg_len})

    return new_edges


def _split_edges_on_points(
    edges: list[dict],
    points: list[tuple[float, float]],
    radius: float,
) -> tuple[list[dict], list[tuple[float, float]]]:
    """Verilen her noktayi en yakin LINE'a project et; perpendicular mesafe
    `radius` icindeyse ve projeksiyon LINE'in orta bolumundeyse, LINE'i o
    noktada bol. Kullanim: sprinkler CIRCLE merkezleri boru LINE ortasinda
    cizildiginde LINE'i sprinkler pozisyonundan bolmek icin.

    Donus: (yeni edge listesi, fiilen LINE ustunde split edilen pozisyonlar).
    Split edilen pozisyonlar sprinkler endpoint'i — caller bunlari dogrudan
    sprinkler_keys olarak isaretleyebilir (aura-fill'e gerek yok).
    """
    if not edges or not points:
        return edges, []

    splits: dict[int, list[tuple[float, float, float]]] = {}
    split_positions: list[tuple[float, float]] = []
    for cx, cy in points:
        best: tuple[int, float, float, float, float] | None = None
        for i, e in enumerate(edges):
            x1, y1, x2, y2 = e["x1"], e["y1"], e["x2"], e["y2"]
            dx, dy = x2 - x1, y2 - y1
            L2 = dx * dx + dy * dy
            if L2 < 1.0:
                continue
            t = ((cx - x1) * dx + (cy - y1) * dy) / L2
            if t <= 0.001 or t >= 0.999:
                continue
            px = x1 + t * dx
            py = y1 + t * dy
            d = math.hypot(cx - px, cy - py)
            if d > radius:
                continue
            if best is None or d < best[4]:
                best = (i, px, py, t, d)
        if best is not None:
            splits.setdefault(best[0], []).append((best[1], best[2], best[3]))
            split_positions.append((best[1], best[2]))

    if not splits:
        return edges, split_positions

    new_edges: list[dict] = []
    for i, e in enumerate(edges):
        if i not in splits:
            new_edges.append(e)
            continue
        sp = sorted(splits[i], key=lambda v: v[2])
        prev_x, prev_y = e["x1"], e["y1"]
        layer = e["layer"]
        for nx, ny, _ in sp:
            sl = math.hypot(nx - prev_x, ny - prev_y)
            if sl >= 1.0:
                new_edges.append({"layer": layer, "x1": prev_x, "y1": prev_y,
                                  "x2": nx, "y2": ny, "length": sl})
            prev_x, prev_y = nx, ny
        sl = math.hypot(e["x2"] - prev_x, e["y2"] - prev_y)
        if sl >= 1.0:
            new_edges.append({"layer": layer, "x1": prev_x, "y1": prev_y,
                              "x2": e["x2"], "y2": e["y2"], "length": sl})
    return new_edges, split_positions


def _chain_to_polyline(
    chain_indices: set[int],
    edges: list[dict],
    node_tol: float = _NODE_TOL,
) -> list[list[float]]:
    """Chain edge'lerini sirali vertex listesine cevir — L/Z/U seklindeki borunun
    gercek kosesi bilgisini korur. Sirasi: bir terminal node'dan diger terminal
    node'a (veya ring ise tur tamamlanana kadar).
    """
    if not chain_indices:
        return []
    if len(chain_indices) == 1:
        e = edges[next(iter(chain_indices))]
        return [[e["x1"], e["y1"]], [e["x2"], e["y2"]]]

    # Chain-ici node graph: node key → bu node'a baglı edge_idx listesi
    # Ayni node'a gercek koordinat da tut (ilk goruldugu yerdeki) — polyline'a eklenecek
    node_edges: dict[tuple[float, float], list[int]] = {}
    node_real_coords: dict[tuple[float, float], tuple[float, float]] = {}
    for ei in chain_indices:
        e = edges[ei]
        k1 = _node_key(e["x1"], e["y1"], node_tol)
        k2 = _node_key(e["x2"], e["y2"], node_tol)
        node_edges.setdefault(k1, []).append(ei)
        node_edges.setdefault(k2, []).append(ei)
        node_real_coords.setdefault(k1, (e["x1"], e["y1"]))
        node_real_coords.setdefault(k2, (e["x2"], e["y2"]))

    # Terminal node bul (chain-ici degree=1). Yoksa ring — herhangi bir node'dan basla.
    terminal = None
    for node, elist in node_edges.items():
        if len(elist) == 1:
            terminal = node
            break
    if terminal is None:
        terminal = next(iter(node_edges))

    # Terminal'den baslayarak traversal
    vertices: list[list[float]] = []
    visited_edges: set[int] = set()
    current = terminal
    rx, ry = node_real_coords[current]
    vertices.append([rx, ry])

    while True:
        unvisited = [ei for ei in node_edges.get(current, []) if ei not in visited_edges]
        if not unvisited:
            break
        next_edge = unvisited[0]
        visited_edges.add(next_edge)
        e = edges[next_edge]
        k1 = _node_key(e["x1"], e["y1"], node_tol)
        k2 = _node_key(e["x2"], e["y2"], node_tol)
        if k1 == current:
            next_node = k2
            vertices.append([e["x2"], e["y2"]])
        else:
            next_node = k1
            vertices.append([e["x1"], e["y1"]])
        current = next_node

    return vertices


def _group_into_runs(
    edges: list[dict],
    graph: dict[tuple[float, float], list[int]],
    sprinkler_keys: set[tuple[float, float]],
    node_tol: float = _NODE_TOL,
) -> list[dict]:
    """Edge'leri pipe-run'lara grupla.

    Kural: Bir run boyunca her ara node degree=2, sprinkler degil ve ayni layer.
    Kirilma: junction (degree≥3), terminal (degree=1), sprinkler, layer degisimi.

    Her run icin hem iki uc (coords) hem sirali vertex listesi (polyline) doner.
    """
    visited: set[int] = set()
    runs: list[dict] = []

    def other_end(edge_idx: int, node_key: tuple[float, float]) -> tuple[float, float]:
        e = edges[edge_idx]
        k1 = _node_key(e["x1"], e["y1"], node_tol)
        k2 = _node_key(e["x2"], e["y2"], node_tol)
        return k2 if k1 == node_key else k1

    def extend(chain: set[int], from_edge: int, from_node: tuple[float, float], layer: str) -> None:
        """Bir yonde chain'i uzat."""
        current = from_node
        while True:
            if current in sprinkler_keys:
                break
            neighbors = graph.get(current, [])
            if len(neighbors) != 2:
                break  # terminal (1) veya junction (>=3)
            cand = [e for e in neighbors if e != from_edge and e not in chain and e not in visited]
            if len(cand) != 1:
                break
            next_e = cand[0]
            if edges[next_e]["layer"] != layer:
                break
            chain.add(next_e)
            from_edge = next_e
            current = other_end(next_e, current)

    for i, edge in enumerate(edges):
        if i in visited:
            continue
        chain: set[int] = {i}
        layer = edge["layer"]
        extend(chain, i, _node_key(edge["x2"], edge["y2"], node_tol), layer)
        extend(chain, i, _node_key(edge["x1"], edge["y1"], node_tol), layer)
        visited.update(chain)

        # Chain → run
        node_deg_in_chain: dict[tuple[float, float], int] = {}
        for ei in chain:
            e = edges[ei]
            k1 = _node_key(e["x1"], e["y1"], node_tol)
            k2 = _node_key(e["x2"], e["y2"], node_tol)
            node_deg_in_chain[k1] = node_deg_in_chain.get(k1, 0) + 1
            node_deg_in_chain[k2] = node_deg_in_chain.get(k2, 0) + 1
        endpoints = [n for n, d in node_deg_in_chain.items() if d == 1]
        total_length = sum(edges[ei]["length"] for ei in chain)

        # Sirali vertex listesi (polyline) — L/Z seklindeki kosesi korunur
        polyline_vertices = _chain_to_polyline(chain, edges, node_tol)

        if len(endpoints) >= 2:
            x1, y1 = endpoints[0]
            x2, y2 = endpoints[1]
        else:
            first = edges[next(iter(chain))]
            x1, y1 = first["x1"], first["y1"]
            x2, y2 = first["x2"], first["y2"]

        runs.append({
            "layer": layer,
            "x1": x1, "y1": y1, "x2": x2, "y2": y2,
            "length": total_length,
            "polyline": polyline_vertices,
        })

    return runs


def _extract_segments(
    dxf_path: str,
    pipe_layers: list[str],
    sprinkler_layers: list[str] | None = None,
    sprinkler_block_names: set[str] | None = None,
    doc=None,
) -> tuple[list[Segment], list[tuple[float, float]]]:
    """Secilen boru layer'larindan topology-aware pipe-run segment'leri uret.

    Her segment = bir pipe-run (iki junction/terminal/sprinkler arasinda).
    Bu sayede ana hat ve her dal icin AI'ya tek sorgu gider, farkli caplar
    dogru ayrilir (ana 2" → T → dal 1¼" → sprinkler 1").

    Sprinkler tespiti iki kaynaktan gelir:
      - sprinkler_layers (kullanici manuel) — entity tipiyle filtre
      - sprinkler_block_names (auto_detect_sprinklers ciktisi) — layer-agnostik

    Returns:
      (segments, sprinkler_centers) — sprinkler_centers ham (cx, cy) listesi,
      _filter_sprinkler_id_texts'e geri verilebilir.

    PERF: doc opsiyonel — caller'dan paylasilirsa tekrar ezdxf.readfile YOK
    (Render free tier'da 30sn tasarruf, gateway timeout altinda kalmak icin).
    """
    if doc is None:
        from converter import read_dxf
        doc = read_dxf(dxf_path)
    msp = doc.modelspace()
    layer_set = set(pipe_layers)

    edges = _collect_raw_edges(msp, layer_set)
    if not edges:
        return [], []

    # Adaptif tolerance — edge median'ina gore olcek-bagimsiz
    node_tol, sprinkler_tol = _compute_tolerances(edges)
    # Virtual tee tespiti — LINE ortasindaki endpoint degmelerini yeni edge olarak ayir
    edges = _split_edges_on_intersections(edges, node_tol)

    # Sprinkler merkezleri LINE orta kisminda ise LINE'i o noktada bol
    # (sprinkler cember boru uzerinde cizildiginde — ornek: SPR depo alanlari)
    split_sprinkler_keys: set[tuple[float, float]] = set()
    sp_centers: list[tuple[float, float]] = []
    if sprinkler_layers or sprinkler_block_names:
        sp_centers = _sprinkler_centers_from_layers(
            doc,
            sprinkler_layers=sprinkler_layers,
            sprinkler_block_names=sprinkler_block_names,
        )
        if sp_centers:
            edges, split_positions = _split_edges_on_points(edges, sp_centers, radius=sprinkler_tol)
            # Split edilen pozisyonlar dogrudan sprinkler endpoint'i
            split_sprinkler_keys = {_node_key(x, y, node_tol) for x, y in split_positions}

    graph = _build_node_graph(edges, node_tol)
    sprinkler_keys, _ = _detect_sprinkler_positions(
        doc, node_tol, sprinkler_tol,
        sprinkler_layers=sprinkler_layers,
        sprinkler_block_names=sprinkler_block_names,
    )
    sprinkler_keys |= split_sprinkler_keys
    runs = _group_into_runs(edges, graph, sprinkler_keys, node_tol)

    segments: list[Segment] = []
    for sid, run in enumerate(runs, start=1):
        segments.append({
            "id": sid,
            "layer": run["layer"],
            "x1": run["x1"], "y1": run["y1"],
            "x2": run["x2"], "y2": run["y2"],
            "length": run["length"],
            "polyline": run.get("polyline", []),
        })
    return segments, sp_centers


def _extract_diameter_texts(dxf_path: str, doc=None) -> list[DiameterText]:
    """Tum cap-benzeri TEXT/MTEXT'leri al:
    - Modelspace direct TEXT/MTEXT
    - INSERT block reference'larin ATTRIB degerleri
    - Block definition icindeki TEXT/MTEXT (INSERT pozisyonuna transform)

    PERF: doc opsiyonel — caller paylasirsa tekrar readfile YOK.
    """
    import math as _m
    if doc is None:
        from converter import read_dxf
        doc = read_dxf(dxf_path)
    msp = doc.modelspace()
    results: list[DiameterText] = []

    # 1) Modelspace direct TEXT/MTEXT
    for ent in msp:
        et = ent.dxftype()
        if et not in ('TEXT', 'MTEXT'):
            continue
        try:
            if et == 'TEXT':
                txt = ent.dxf.text or ""
            else:
                txt = ent.plain_text() if hasattr(ent, 'plain_text') else (ent.text or "")
            pos = ent.dxf.insert
            txt = _autocad_decode(txt)
            if _has_diameter_pattern(txt):
                results.append({"value": txt.strip(), "x": pos.x, "y": pos.y})
        except Exception:
            continue

    # 2) LEADER/MULTILEADER/DIMENSION — ok ve olcu etiketleri
    # LEADER: text ayri bir entity (MTEXT) olarak handle ile bagli. Ezdxf'te
    # LEADER'in kendi tag'lerinden dogrudan text yok; bu nedenle LEADER'lari
    # gecip LEADER vertex'inin yakinindaki MTEXT'leri umuyoruz (zaten 1. kisimda alindi).
    #
    # MULTILEADER (MLEADER): text icerigi get_mtext_content() veya dxf.text_raw ile
    for ent in msp.query('MULTILEADER'):
        try:
            # Cesitli ezdxf surumlerinde farkli API
            mtxt = None
            if hasattr(ent, 'get_mtext_content'):
                mtxt = ent.get_mtext_content()
            if not mtxt and hasattr(ent.dxf, 'text'):
                mtxt = ent.dxf.text
            if not mtxt:
                continue
            mtxt = _autocad_decode(mtxt)
            if not _has_diameter_pattern(mtxt):
                continue
            # Leader'in ucunun pozisyonu (text near)
            pos_x = getattr(ent.dxf, 'text_attachment_point', None)
            if pos_x:
                x, y = pos_x.x if hasattr(pos_x, 'x') else pos_x[0], pos_x.y if hasattr(pos_x, 'y') else pos_x[1]
            else:
                # fallback: leader ucu
                x, y = 0.0, 0.0
                if hasattr(ent, 'context') and ent.context and hasattr(ent.context, 'leaders'):
                    for ldr in ent.context.leaders:
                        if hasattr(ldr, 'lines') and ldr.lines:
                            for line in ldr.lines:
                                verts = list(line.vertices)
                                if verts:
                                    x, y = verts[0][0], verts[0][1]
                                    break
                            break
            results.append({"value": mtxt.strip(), "x": x, "y": y})
        except Exception:
            continue

    # DIMENSION — olcu etiketleri (bazi projelerde cap olcu olarak yazar)
    for ent in msp.query('DIMENSION'):
        try:
            # Dimension.dxf.text override (genelde bos, <>) veya measurement
            dim_txt = getattr(ent.dxf, 'text', '') or ""
            # Eger text <>'li ise asil measurement'i al
            if dim_txt in ('', '<>', '< >'):
                # Measurement'i ezdxf hesaplar
                if hasattr(ent, 'get_measurement'):
                    try:
                        meas = ent.get_measurement()
                        if isinstance(meas, (int, float)):
                            dim_txt = f"{meas:g}"
                    except Exception:
                        pass
            if not dim_txt:
                continue
            dim_txt = _autocad_decode(dim_txt)
            if not _has_diameter_pattern(dim_txt):
                continue
            # Dimension text midpoint
            tmp = getattr(ent.dxf, 'text_midpoint', None)
            if tmp:
                x, y = tmp.x, tmp.y
            else:
                # fallback: dim defpoint
                dp = getattr(ent.dxf, 'defpoint', None)
                x, y = (dp.x, dp.y) if dp else (0.0, 0.0)
            results.append({"value": dim_txt.strip(), "x": x, "y": y})
        except Exception:
            continue

    # 3) INSERT'lerin attribs'lerini ve block definition'larinin icerigini tara
    for ins in msp.query('INSERT'):
        try:
            ix, iy = ins.dxf.insert.x, ins.dxf.insert.y
            rotation_rad = _m.radians(getattr(ins.dxf, 'rotation', 0.0) or 0.0)
            xscale = getattr(ins.dxf, 'xscale', 1.0) or 1.0
            yscale = getattr(ins.dxf, 'yscale', 1.0) or 1.0
            cos_r = _m.cos(rotation_rad)
            sin_r = _m.sin(rotation_rad)

            # 2a) Attribs (varsa)
            if hasattr(ins, 'attribs'):
                for at in ins.attribs:
                    try:
                        at_txt = at.dxf.text or ""
                        at_txt = _autocad_decode(at_txt)
                        if _has_diameter_pattern(at_txt):
                            ap = at.dxf.insert
                            results.append({"value": at_txt.strip(), "x": ap.x, "y": ap.y})
                    except Exception:
                        continue

            # 2b) Block definition icindeki TEXT/MTEXT
            # KRITIK: invisible=1 olanlari atla — dynamic block'ta gizli state'ler
            block_name = ins.dxf.name
            if block_name and block_name in doc.blocks:
                for bent in doc.blocks[block_name]:
                    bt_type = bent.dxftype()
                    if bt_type not in ('TEXT', 'MTEXT'):
                        continue
                    # Gizli text (dynamic block'ta secilmemis seçenek) → atla
                    if getattr(bent.dxf, 'invisible', 0) == 1:
                        continue
                    try:
                        if bt_type == 'TEXT':
                            bt_txt = bent.dxf.text or ""
                        else:
                            bt_txt = bent.plain_text() if hasattr(bent, 'plain_text') else (bent.text or "")
                        bt_txt = _autocad_decode(bt_txt)
                        if not _has_diameter_pattern(bt_txt):
                            continue
                        # Block-local koordinatlari world'e transform et
                        local_pos = bent.dxf.insert
                        lx, ly = local_pos.x * xscale, local_pos.y * yscale
                        wx = lx * cos_r - ly * sin_r + ix
                        wy = lx * sin_r + ly * cos_r + iy
                        results.append({"value": bt_txt.strip(), "x": wx, "y": wy})
                    except Exception:
                        continue
        except Exception:
            continue

    return results


def _segment_midpoint(seg: Segment) -> tuple[float, float]:
    return ((seg["x1"] + seg["x2"]) / 2, (seg["y1"] + seg["y2"]) / 2)


def _nearest_texts(
    seg: Segment,
    texts: list[DiameterText],
    max_count: int = 5,
) -> list[dict]:
    """Segment'e en yakin N text'i mesafesiyle birlikte dondur."""
    mx, my = _segment_midpoint(seg)
    scored = []
    for t in texts:
        dist = math.sqrt((t["x"] - mx) ** 2 + (t["y"] - my) ** 2)
        scored.append((dist, t["value"]))
    scored.sort(key=lambda x: x[0])
    return [{"text": v, "mesafe": round(d, 1)} for d, v in scored[:max_count]]


# ─────────────────────────────────────────────────────────
#  Deterministic cap atama: text-mapping + graph inheritance
#  AI'dan ONCE calisan ucuz/deterministic katman.
# ─────────────────────────────────────────────────────────

def _point_to_segment_dist(
    px: float, py: float,
    x1: float, y1: float, x2: float, y2: float,
) -> float:
    """Point'in line segment'e olan en kisa mesafesi."""
    dx, dy = x2 - x1, y2 - y1
    len_sq = dx * dx + dy * dy
    if len_sq < 1e-12:
        return math.sqrt((px - x1) ** 2 + (py - y1) ** 2)
    t = ((px - x1) * dx + (py - y1) * dy) / len_sq
    if t < 0:
        t = 0.0
    elif t > 1:
        t = 1.0
    qx = x1 + t * dx
    qy = y1 + t * dy
    return math.sqrt((px - qx) ** 2 + (py - qy) ** 2)


def _assign_diameters_from_nearest_text(
    segments: list[Segment],
    texts: list[DiameterText],
    max_distance: float = 200.0,
) -> dict[int, str]:
    """Pass 1 — Spatial text-to-segment mapping (deterministic, AI'sis).

    Her cap text'ini (pattern matched) EN YAKIN segment'e atar. Birden fazla
    text ayni segmente cikarsa, en yakin olan kazanir.

    max_distance: text segmentten bu mesafeden uzaksa atama YOK (gurultu engeli).

    Returns: {sid: text_value} — sadece guvenle atananlar
    """
    if not segments or not texts:
        return {}

    # sid → (best_distance, value)
    best_for_seg: dict[int, tuple[float, str]] = {}
    for t in texts:
        if not _has_diameter_pattern(t["value"]):
            continue
        tx, ty = t["x"], t["y"]
        best_d = float('inf')
        best_sid = None
        for seg in segments:
            d = _point_to_segment_dist(
                tx, ty, seg["x1"], seg["y1"], seg["x2"], seg["y2"],
            )
            if d < best_d:
                best_d = d
                best_sid = seg["id"]
        if best_sid is None or best_d > max_distance:
            continue
        prev = best_for_seg.get(best_sid)
        if prev is None or best_d < prev[0]:
            best_for_seg[best_sid] = (best_d, t["value"].strip())

    return {sid: val for sid, (_, val) in best_for_seg.items()}


def _build_segment_adjacency(
    segments: list[Segment],
    node_tol: float,
) -> tuple[dict[int, list[tuple[int, tuple[float, float]]]], dict[tuple[float, float], int]]:
    """Segment endpoint'lerinden komsuluk haritasi cikar.

    Returns:
      seg_neighbors: {sid: [(neighbor_sid, shared_node_key), ...]}
      node_degree:   {node_key: count} — kac segment bu node'a deginiyor
    """
    node_to_segs: dict[tuple[float, float], list[int]] = {}
    for seg in segments:
        for x, y in ((seg["x1"], seg["y1"]), (seg["x2"], seg["y2"])):
            k = _node_key(x, y, node_tol)
            node_to_segs.setdefault(k, []).append(seg["id"])

    seg_neighbors: dict[int, list[tuple[int, tuple[float, float]]]] = {
        seg["id"]: [] for seg in segments
    }
    node_degree: dict[tuple[float, float], int] = {}
    for node_k, sids in node_to_segs.items():
        node_degree[node_k] = len(sids)
        for sid in sids:
            for other_sid in sids:
                if sid != other_sid:
                    seg_neighbors[sid].append((other_sid, node_k))

    return seg_neighbors, node_degree


def _propagate_diameters_via_bfs(
    segments: list[Segment],
    seed_diameters: dict[int, str],
    node_tol: float,
) -> dict[int, tuple[str, bool]]:
    """Pass 2 — Graph BFS ile bilinmeyen segmentlere komsulardan miras aktar.

    Kural: bir node'a SADECE 2 segment baglıysa (non-branching pass-through),
    diameter inherit edilir. degree >= 3 (tee/junction) noktada inherit YOK
    (hangi branş ayni cap belirsiz). degree == 1 (terminal) zaten propagation
    icin onemli degil.

    Args:
      segments: tum pipe segment'leri (sid + endpoint'ler)
      seed_diameters: pass 1'den (text-mapping) gelen kesin atamalar
      node_tol: endpoint birlestirme toleransi (graph.py'deki MERGE_DISTANCE benzeri)

    Returns: {sid: (diameter, is_inherited)} — seed'ler + miras alanlar
             Bilinmeyenler dahil DEGIL (caller AI fallback yapsin).
    """
    from collections import deque

    seg_neighbors, node_degree = _build_segment_adjacency(segments, node_tol)

    result: dict[int, tuple[str, bool]] = {}
    queue: deque[int] = deque()
    for sid, dia in seed_diameters.items():
        if dia and dia != "Belirtilmemis":
            result[sid] = (dia, False)
            queue.append(sid)

    while queue:
        sid = queue.popleft()
        cur_dia = result[sid][0]
        for neighbor_sid, shared_node_k in seg_neighbors.get(sid, []):
            if neighbor_sid in result:
                continue  # zaten atanmis (seed veya onceki BFS adimi)
            # Non-branching pass-through: degree == 2 (bu seg + neighbor)
            # Tee/junction (degree >= 3) -> inherit YOK
            if node_degree.get(shared_node_k, 0) == 2:
                result[neighbor_sid] = (cur_dia, True)
                queue.append(neighbor_sid)

    return result


def _build_prompt(
    segments_with_textnbrs: list[dict],
    hat_tipi_hint: str = "",
) -> str:
    """Claude icin prompt olustur — sıkıştırılmış, maliyet optimizeli.

    Atama mantigi:
    - Her segment'in yakin_textler'i mesafesiyle sirali olarak verilir
    - EN YAKIN text'in orjinal formati (DN50 / Ø100 / 2" / 50mm vb.) sonuc capidir
    - Mesafe esigi YOK — cizimdeki text boruya aitse, yakin olan dogrudur
    - Sadece yakın text'lerin hicbirinde cap ifadesi yoksa veya liste bossa → "Belirtilmemis"
    - Hat tipi varsa bilgilendirme amaciyla yorumla (zorla filtre DEGIL)
    """
    segs_json = json.dumps(segments_with_textnbrs, ensure_ascii=False)

    hint_line = f"\nHAT TIPI HINT (bilgi): {hat_tipi_hint}" if hat_tipi_hint else ""

    return f"""Tesisat muhendisligi cap atama. Her segment icin en yakin text'teki capi ata.{hint_line}

ATAMA KURALLARI:
- Segment'in yakin_textler listesi mesafeye gore sirali — en yakin text'in capini kullan
- Text'in orjinal formatini bozma: "DN50" → "DN50", "Ø100" → "Ø100", "1 1/4\"" → "1 1/4\"", "50mm" → "50mm"
- Mesafe esigi YOK — yakin listesinde varsa o segment'e ait say
- Kolinear komsu segment'ler genelde ayni captadir — yakinlari tutarsiz ise komsularin capina bak
- Yakin text'lerin HICBIRINDE cap ifadesi yoksa (sadece isim/aciklama gibi) veya liste bossa → "Belirtilmemis"

VERI (segments, yakin_textler mesafeye gore sirali):
{segs_json}

SADECE JSON dondur, aciklama yok:
{{"1":"DN50","2":"1 1/4\\"","3":"Belirtilmemis"}}"""


def assign_diameters_with_ai(
    dxf_path: str,
    pipe_layers: list[str],
    model: str = "claude-sonnet-4-5",
    hat_tipi_hint: str = "",
    sprinkler_layers: list[str] | None = None,
    doc=None,
) -> tuple[dict[int, tuple[str, bool]], dict]:
    """Boru segment'lerine cap atar (3-pass: text-map → BFS inheritance → AI fallback).

    Akis:
      0. auto_detect_sprinklers (AI/regex) — block sinif tanima
      1. _extract_segments — boru layer'larini topla, sprinkler/tee'de bol
      2. _extract_diameter_texts → cap-benzeri TEXT havuzu
      3. _filter_sprinkler_id_texts → sprinkler ID etiketlerini dus
      4. PASS 1 (deterministic, ucretsiz): _assign_diameters_from_nearest_text
         → text < 200 birim mesafedeki segmente atanir
      5. PASS 2 (deterministic, ucretsiz): _propagate_diameters_via_bfs
         → graph BFS, non-branching node'larda diameter miras alma
      6. PASS 3 (AI, ucretli): sadece pass 1+2'den sonra hala BOSTA olan
         segmentleri Claude'a sor — gereksiz token harcamasi YOK

    Returns:
      (segment_diameters, info_dict)
      segment_diameters: {sid: (diameter, is_inherited)}
        - diameter: "Ø50" | "DN100" | ... | "Belirtilmemis"
        - is_inherited: True = pass 2'de BFS ile miras alindi
                        False = pass 1 (text-map) veya pass 3 (AI) atadi
      info_dict: pass-bazli istatistik + AI maliyet
    """
    # 1) Otomatik sprinkler tespiti (AI ile, cache'li)
    # Defansif: auto_detect_sprinklers crash etse bile assign_diameters_with_ai
    # devam etsin — sprinkler_block_names bos kalir, mevcut akis (regex
    # fallback yoluyla) calismaya devam eder.
    # PERF: tek read_dxf — auto_detect + _extract_segments + _extract_diameter_texts
    # hepsi ayni doc'u paylasir. Render free tier'da 30sn x 3 = 90sn tasarruf.
    if doc is None:
        from converter import read_dxf
        doc = read_dxf(dxf_path)

    try:
        sprinkler_block_names, classify_info = auto_detect_sprinklers(
            dxf_path, hat_tipi_hint=hat_tipi_hint, model=model, doc=doc,
        )
    except Exception as _ee:
        sprinkler_block_names = set()
        classify_info = {"source": "error", "error": str(_ee)[:120]}

    # 2) Topology + segment uretim (sprinkler INSERT pozisyonlarinda LINE bol)
    segments, sp_centers = _extract_segments(
        dxf_path,
        pipe_layers,
        sprinkler_layers=sprinkler_layers,
        sprinkler_block_names=sprinkler_block_names,
        doc=doc,
    )

    # 3) Cap-benzeri text havuzu
    texts = _extract_diameter_texts(dxf_path, doc=doc)

    # 4) Sprinkler ID etiketlerini cap havuzundan dus (yanlislikla "S1" = "1"' lik
    #    olarak parse edilmesin)
    if sp_centers and texts:
        before = len(texts)
        texts = _filter_sprinkler_id_texts(texts, sp_centers)
        excluded_text_count = before - len(texts)
    else:
        excluded_text_count = 0

    if not segments:
        return {}, {"segment_count": 0, "text_count": 0, "error": "Secilen layer'larda segment yok"}

    # ── PASS 1: Spatial text-mapping (deterministic, ucretsiz) ──
    text_seed_diameters = _assign_diameters_from_nearest_text(segments, texts)
    pass1_count = len(text_seed_diameters)

    # ── PASS 2: Graph BFS inheritance (deterministic, ucretsiz) ──
    # node_tol: _compute_tolerances'den gelen tipik degerin (~5-25) iki kati
    # endpoint birlestirme icin yeterli buffer (fitting bosluklari)
    propagated = _propagate_diameters_via_bfs(
        segments, text_seed_diameters, node_tol=25.0,
    )
    pass2_count = sum(1 for v in propagated.values() if v[1])  # is_inherited=True olanlar

    # Pass 1+2 sonucunu seg_diameters'a yaz (tuple format: (dia, is_inherited))
    seg_diameters: dict[int, tuple[str, bool]] = dict(propagated)
    # Pass 1 atadigi ama BFS'in seed olarak almadigi (sonuc'a almasi gerek):
    # _propagate_diameters_via_bfs zaten seed'leri sonuca yaziyor — ekstra is yok.

    # Hala bos kalan segmentleri belirle (AI'a sorulacak)
    remaining = [s for s in segments if s["id"] not in seg_diameters]

    info_base = {
        "segment_count": len(segments),
        "text_count": len(texts),
        "pass1_text_count": pass1_count,
        "pass2_inherit_count": pass2_count,
        "pass3_ai_count": len(remaining),
        "sprinkler_detection": {
            "source": classify_info.get("source"),
            "block_count": len(sprinkler_block_names),
            "center_count": len(sp_centers),
            "excluded_text_count": excluded_text_count,
            "classify_cost_usd": classify_info.get("cost_usd", 0),
        },
    }

    # Pass 1+2 her seyi karsiladiysa AI'a hic gitme — token kazan
    if not remaining:
        info_base["note"] = "Tum segmentler text-mapping + inheritance ile cozuldu, AI cagrilmadi"
        return seg_diameters, info_base

    # ── PASS 3: AI fallback — sadece bos kalanlari sor ──

    if not texts:
        # Text yok → AI'in bilgi tabani da yok, kalanlari "Belirtilmemis" yap
        for s in remaining:
            seg_diameters[s["id"]] = ("Belirtilmemis", False)
        info_base["note"] = "Cap text bulunamadi, kalan segmentler 'Belirtilmemis'"
        return seg_diameters, info_base

    # Sadece bos kalanlar icin prompt_data uret
    prompt_data: list[dict] = []
    for seg in remaining:
        near = _nearest_texts(seg, texts, max_count=3)
        prompt_data.append({
            "id": seg["id"],
            "layer": seg["layer"],
            "uzunluk": round(seg["length"], 1),
            "yakin_textler": near,
        })

    # API key yukle
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        env_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", ".env")
        if os.path.isfile(env_path):
            with open(env_path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("ANTHROPIC_API_KEY="):
                        api_key = line.split("=", 1)[1].strip().strip('"').strip("'")
                        break
    if not api_key:
        # AI yok ama kalan segmentler var — onlari "Belirtilmemis" yap, hata firlatma
        for s in remaining:
            seg_diameters[s["id"]] = ("Belirtilmemis", False)
        info_base["error"] = "ANTHROPIC_API_KEY yok, AI fallback atlandi"
        return seg_diameters, info_base

    client = Anthropic(api_key=api_key)

    # Buyuk projelerde prompt token limitini (200K) asar — BATCH'lere bol
    BATCH_SIZE = 300
    batches: list[list[dict]] = []
    for i in range(0, len(prompt_data), BATCH_SIZE):
        batches.append(prompt_data[i : i + BATCH_SIZE])

    ai_diameters: dict[int, str] = {}
    total_in_tok = 0
    total_out_tok = 0
    errors: list[str] = []

    for batch_idx, batch in enumerate(batches, start=1):
        prompt = _build_prompt(batch, hat_tipi_hint=hat_tipi_hint)
        try:
            response = client.messages.create(
                model=model,
                max_tokens=8192,
                messages=[{"role": "user", "content": prompt}],
            )
            total_in_tok += response.usage.input_tokens
            total_out_tok += response.usage.output_tokens

            response_text = response.content[0].text.strip()
            json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', response_text, re.DOTALL)
            if json_match:
                response_text = json_match.group(0)

            result = json.loads(response_text)
            for k, v in result.items():
                try:
                    ai_diameters[int(k)] = str(v) if v else "Belirtilmemis"
                except (ValueError, TypeError):
                    continue
        except json.JSONDecodeError as e:
            errors.append(f"Batch {batch_idx}: JSON parse hatasi ({str(e)[:60]})")
        except Exception as e:
            errors.append(f"Batch {batch_idx}: {type(e).__name__} {str(e)[:100]}")

    # AI sonuclarini merge et — AI ile atanan is_inherited=False (text-based AI karari)
    for s in remaining:
        dia = ai_diameters.get(s["id"], "Belirtilmemis")
        seg_diameters[s["id"]] = (dia, False)

    cost_usd = (total_in_tok * 3.0 + total_out_tok * 15.0) / 1_000_000
    info_base.update({
        "batch_count": len(batches),
        "input_tokens": total_in_tok,
        "output_tokens": total_out_tok,
        "cost_usd": round(cost_usd, 4),
        "cost_tl": round(cost_usd * 34, 2),
        "model": model,
    })
    if errors:
        info_base["errors"] = errors

    return seg_diameters, info_base
