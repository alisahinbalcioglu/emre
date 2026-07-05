"""
pipe_segments.py — DXF boru topology'sinden pipe-run segment'leri uretir.

Her segment = bir pipe-run (iki junction/terminal/sprinkler arasi). Bu sayede
ana hat ve her dal ayri segment olur, frontend'de tek tek isaretlenebilir ve
metraj tablosuna girer.

AI yok — saf geometri + graph topology. (Daha onceki AI cap atama 3-pass
algoritmasi devre disi birakildi — Render free tier gateway timeout sebebiyle).
"""

import math
import re
from typing import TypedDict


# ── Tolerance ve sabitler ─────────────────────────────────────────

# Endpoint eslestirme tolerans DEFAULT'lari — `_compute_tolerances` runtime'da
# edge length median'ina gore dinamik hesaplar, proje-bagimsiz calisir.
_NODE_TOL = 1.0
_SPRINKLER_TOL = 10.0

# Block radius < bu deger ise (DXF birimi mm varsayilir) sprinkler kandidati sayilir
_SPRINKLER_MAX_RADIUS_MM = 50.0

# Sprinkler tespit regex — block name bu pattern'i iceren INSERT'ler sprinkler sayilir
_SPRINKLER_RE = re.compile(
    r'spr(?:ink)?|upright|pendant|sidewall|fire.?head|yağmur',
    re.IGNORECASE,
)


class Segment(TypedDict, total=False):
    id: int
    layer: str
    x1: float
    y1: float
    x2: float
    y2: float
    length: float
    polyline: list[list[float]]  # opsiyonel — chain'in sirali vertex'leri


# ── Tolerance hesaplama ──────────────────────────────────────────

def _node_key(x: float, y: float, tol: float = _NODE_TOL) -> tuple[float, float]:
    """Koordinatlari toleransa gore quantize et (endpoint matching icin)."""
    return (round(x / tol) * tol, round(y / tol) * tol)


def _compute_tolerances(
    edges: list[dict],
    unit_scale: float = 0.001,
) -> tuple[float, float]:
    """Tolerance hesabi — PRD epsilon=5cm hedefli, scale + bbox cift-koruma.

    Iki kaynaktan tolerance hesaplanir, daha kucugu (daha sert) kullanilir:

    1. SCALE-BASED: PRD 5cm world-unit cinsinden (unit_scale carpani ile).
       - mm proje (scale=0.001) -> 50 world units
       - cm proje (scale=0.01)  -> 5 world units
       - m proje  (scale=1.0)   -> 0.05 world units

    2. BBOX-BASED: Cizimin bounding box'inin %0.05 (yarim binde). 50m projede ~2.5cm.
       Kullanici unit'i yanlis sectiyse scale-based tolerance 10x kayar; bbox-based
       koruma yanlis pozitif veya negatif tespiti engeller.

    Sprinkler: 5x daha gevsek (sprinkler block typical 5-25cm uzaklikta).

    Genel kullanim: scale parametresi dogruysa scale-based win; yanlissa bbox-based.
    """
    epsilon_scale = 0.05 / max(unit_scale, 1e-9)
    sprinkler_scale = 0.25 / max(unit_scale, 1e-9)

    if not edges:
        return max(_NODE_TOL, epsilon_scale), max(_SPRINKLER_TOL, sprinkler_scale)

    # Bbox-based fallback (scale-independent)
    xs: list[float] = []
    ys: list[float] = []
    for e in edges:
        xs.append(e["x1"]); xs.append(e["x2"])
        ys.append(e["y1"]); ys.append(e["y2"])
    bbox_diag = math.hypot(max(xs) - min(xs), max(ys) - min(ys)) if xs else 0.0
    # %0.05 of diagonal — 50m cizimde ~2.5cm; 10m'de 0.5cm; 100m'de 5cm
    bbox_node_tol = bbox_diag * 0.0005
    bbox_sprinkler_tol = bbox_diag * 0.0025  # 5x daha gevsek

    # Final: scale-based ile bbox-based'in MIN'i (daha sert olan).
    # Eger scale yanlissa scale-based aci derece buyur; bbox-based onu sinirlar.
    # Eger scale dogru ise zaten ikisi yakin olur, fark etmez.
    # Alt sinir 1.0 (yuvarlama hatasi koruma) + maksimum 2x bbox (sertlik).
    node_tol = max(1.0, min(epsilon_scale, bbox_node_tol * 2.0))
    sprinkler_tol = max(5.0, min(sprinkler_scale, bbox_sprinkler_tol * 2.0))
    return node_tol, sprinkler_tol


# ── Sprinkler pozisyon tespiti ───────────────────────────────────

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
         set'te olan tum INSERT'ler.

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
            try:
                if ent.dxf.layer not in layer_set:
                    continue
                radius = float(ent.dxf.radius)
                if radius > _SPRINKLER_MAX_RADIUS_MM:
                    continue  # Buyuk daire — sprinkler degil (vana, tank vb.)
                centers.append((float(ent.dxf.center.x), float(ent.dxf.center.y)))
            except Exception:
                continue

        # POINT — sadece sprinkler layer'inda
        for ent in msp.query('POINT'):
            try:
                if ent.dxf.layer not in layer_set:
                    continue
                centers.append((float(ent.dxf.location.x), float(ent.dxf.location.y)))
            except Exception:
                continue

    # NOT: LINE/LWPOLYLINE/POLYLINE asla sprinkler degil — ayni layer
    # durumunda boru olarak topology'ye girmesi sart.
    return centers


def _detect_sprinkler_positions(
    doc,
    node_tol: float = _NODE_TOL,
    sprinkler_tol: float = _SPRINKLER_TOL,
    sprinkler_layers: list[str] | None = None,
    sprinkler_block_names: set[str] | None = None,
) -> tuple[set[tuple[float, float]], list[tuple[float, float]]]:
    """Sprinkler pozisyonlarini aura-fill seklinde node_key seti olarak dondur.

    Kaynaklari birlestirir:
      1) `sprinkler_layers` → entity-type filtre (INSERT + kucuk CIRCLE + POINT,
         LINE/TEXT atlanir, "ayni layer" sorununu cozer)
      2) `sprinkler_block_names` → block adina gore (layer'dan bagimsiz)
      3) Hicbiri yoksa → block adi regex'i (_SPRINKLER_RE) fallback

    Returns:
      (positions_set, centers_list) — positions aura-fill node key'ler,
      centers ham (cx, cy) listesi.
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
        # Fallback: block adi regex
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


# ── Edge toplama ve splitting ────────────────────────────────────

def _collect_raw_edges(msp, layer_set: set[str]) -> list[dict]:
    """Tum LINE + LWPOLYLINE + POLYLINE edge'lerini toplar (vertex-level).

    PER-ENTITY TOLERANCE: ezdxf bazi bozuk entity'lerde attribute access'te
    DXFValueError atiyor. Tum try'ler kapsayici — layer access dahil her sey
    icinde, bozuk entity atlanip kalan dosya parse edilebilsin diye.
    """
    edges: list[dict] = []
    for ent in msp.query('LINE'):
        try:
            layer = ent.dxf.layer
            if layer not in layer_set:
                continue
            x1, y1 = float(ent.dxf.start.x), float(ent.dxf.start.y)
            x2, y2 = float(ent.dxf.end.x), float(ent.dxf.end.y)
        except Exception:
            continue
        length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
        if length < 1.0:
            continue
        edges.append({"layer": layer, "x1": x1, "y1": y1, "x2": x2, "y2": y2, "length": length})

    for ent in msp.query('LWPOLYLINE'):
        try:
            layer = ent.dxf.layer
            if layer not in layer_set:
                continue
            pts = [(float(p[0]), float(p[1])) for p in ent.get_points(format='xy')]
            closed = bool(getattr(ent, "closed", False))
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
            edges.append({"layer": layer, "x1": x1, "y1": y1, "x2": x2, "y2": y2, "length": length})
        if closed and len(pts) > 2:
            x1, y1 = pts[-1]
            x2, y2 = pts[0]
            length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            if length >= 1.0:
                edges.append({"layer": layer, "x1": x1, "y1": y1, "x2": x2, "y2": y2, "length": length})

    for ent in msp.query('POLYLINE'):
        try:
            layer = ent.dxf.layer
            if layer not in layer_set:
                continue
            pts = [(float(v.dxf.location.x), float(v.dxf.location.y)) for v in ent.vertices]
        except Exception:
            continue
        for i in range(len(pts) - 1):
            x1, y1 = pts[i]
            x2, y2 = pts[i + 1]
            length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            if length < 1.0:
                continue
            edges.append({"layer": layer, "x1": x1, "y1": y1, "x2": x2, "y2": y2, "length": length})

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
    """
    if not edges:
        return edges

    nodes: dict[tuple[float, float], tuple[float, float]] = {}
    for e in edges:
        for x, y in ((e["x1"], e["y1"]), (e["x2"], e["y2"])):
            nk = _node_key(x, y, node_tol)
            nodes.setdefault(nk, (x, y))

    cs = max(node_tol * 20.0, 1.0)
    cell: dict[tuple[int, int], list[tuple[float, float]]] = {}
    for nk, (nx, ny) in nodes.items():
        ck = (int(nx // cs), int(ny // cs))
        cell.setdefault(ck, []).append(nk)

    splits: dict[int, list[tuple[float, float, float]]] = {}
    for i, e in enumerate(edges):
        x1, y1, x2, y2 = e["x1"], e["y1"], e["x2"], e["y2"]
        dx, dy = x2 - x1, y2 - y1
        L = e["length"]
        if L < max(3.0 * node_tol, 3.0):
            continue
        k_start = _node_key(x1, y1, node_tol)
        k_end = _node_key(x2, y2, node_tol)
        # BBOX'a node_tol kadar genislet — yakin (mikro bosluk) node'lar
        # ayri cell'e dustugu icin kacirilmasin. Onceki bug: tolerance
        # eklenmemis, 3mm yakin node yatay LINE'in cell range'i disinda kaliyor.
        min_cx = int((min(x1, x2) - node_tol) // cs)
        max_cx = int((max(x1, x2) + node_tol) // cs)
        min_cy = int((min(y1, y2) - node_tol) // cs)
        max_cy = int((max(y1, y2) + node_tol) // cs)
        L2 = L * L
        for cx in range(min_cx, max_cx + 1):
            for cy in range(min_cy, max_cy + 1):
                for nk in cell.get((cx, cy), ()):
                    if nk == k_start or nk == k_end:
                        continue
                    nx, ny = nodes[nk]
                    t = ((nx - x1) * dx + (ny - y1) * dy) / L2
                    if t <= 0.001 or t >= 0.999:
                        continue
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


def _split_edges_on_crossings(
    edges: list[dict],
    node_tol: float,
) -> list[dict]:
    """Iki LINE'in birbirini ortasindan kesistiği (proper crossing) durumlar
    icin gercek geometric intersection bul ve her iki LINE'i kesisim
    noktasinda bol.

    Mevcut `_split_edges_on_intersections` SADECE endpoint-on-line durumunu
    yakalar (bir LINE'in endpoint'i digerinin ortasina degiyor). Ama:
      - Iki LINE klasik '+' seklinde kesisiyorsa (hicbiri endpoint degil)
      - Bir LINE digerini gecip overshoot yapiyorsa
      - LINE'lar arasi mikro bosluk varsa (gap < tolerance)
    bunlar yakalanmaz. Bu fonksiyon yakalar.

    Algoritma: O(N) grid spatial + O(K) pair check (K = ortalama komsu).
    Her LINE icin bbox cell'lerini tara, ayni cell'deki diger LINE'larla
    pair-wise crossing kontrolu yap.

    Crossing kosulu:
      - Iki LINE paralel degil (det != 0)
      - Intersection parametreleri t, u her ikisi de [tol_param, 1-tol_param]
        araliginda (yani her iki LINE'in da IC bolgesinde kesisiyor)
      - tol_param = node_tol / line_length (relative tolerance)

    PRD section 2.1 'Snap & Split': mikro bosluk + overshoot durumlarini bu
    fonksiyon halleder. Endpoint-on-line ise zaten oncesinde calistirilmis.
    """
    if not edges or len(edges) < 2:
        return edges

    # Grid spatial index — her edge'in bbox'unu cell'lere yerlestir
    cs = max(node_tol * 50.0, 10.0)
    cell_to_edges: dict[tuple[int, int], list[int]] = {}
    edge_bbox: list[tuple[float, float, float, float]] = []
    for i, e in enumerate(edges):
        x1, y1, x2, y2 = e["x1"], e["y1"], e["x2"], e["y2"]
        mnx, mxx = min(x1, x2), max(x1, x2)
        mny, mxy = min(y1, y2), max(y1, y2)
        edge_bbox.append((mnx, mny, mxx, mxy))
        c_min_x = int(mnx // cs)
        c_max_x = int(mxx // cs)
        c_min_y = int(mny // cs)
        c_max_y = int(mxy // cs)
        for cx in range(c_min_x, c_max_x + 1):
            for cy in range(c_min_y, c_max_y + 1):
                cell_to_edges.setdefault((cx, cy), []).append(i)

    # Her edge'in komsularini bul, pair-wise crossing kontrol
    checked: set[tuple[int, int]] = set()
    splits: dict[int, list[tuple[float, float, float]]] = {}

    for i, e in enumerate(edges):
        x1, y1, x2, y2 = e["x1"], e["y1"], e["x2"], e["y2"]
        mnx_i, mny_i, mxx_i, mxy_i = edge_bbox[i]
        c_min_x = int(mnx_i // cs)
        c_max_x = int(mxx_i // cs)
        c_min_y = int(mny_i // cs)
        c_max_y = int(mxy_i // cs)

        neighbors: set[int] = set()
        for cx in range(c_min_x, c_max_x + 1):
            for cy in range(c_min_y, c_max_y + 1):
                for j in cell_to_edges.get((cx, cy), ()):
                    if j != i:
                        neighbors.add(j)

        for j in neighbors:
            pair = (i, j) if i < j else (j, i)
            if pair in checked:
                continue
            checked.add(pair)

            # bbox overlap kontrolu (hizli filtre)
            mnx_j, mny_j, mxx_j, mxy_j = edge_bbox[j]
            if mxx_i < mnx_j - node_tol or mxx_j < mnx_i - node_tol:
                continue
            if mxy_i < mny_j - node_tol or mxy_j < mny_i - node_tol:
                continue

            ej = edges[j]
            x3, y3, x4, y4 = ej["x1"], ej["y1"], ej["x2"], ej["y2"]

            # Iki LINE parametrik kesisim
            # P_i(t) = (x1,y1) + t * ((x2,y2) - (x1,y1)), t in [0,1]
            # P_j(u) = (x3,y3) + u * ((x4,y4) - (x3,y3)), u in [0,1]
            dx_i, dy_i = x2 - x1, y2 - y1
            dx_j, dy_j = x4 - x3, y4 - y3
            denom = dx_i * dy_j - dy_i * dx_j
            if abs(denom) < 1e-9:
                continue  # paralel veya kesiniti hata payinda

            # Cramer
            t = ((x3 - x1) * dy_j - (y3 - y1) * dx_j) / denom
            u = ((x3 - x1) * dy_i - (y3 - y1) * dx_i) / denom

            # Her iki LINE da IC bolgesinde kesisiyor mu?
            # Relative tolerance: node_tol / line_length
            L_i = e["length"]
            L_j = ej["length"]
            tol_t = max(0.001, node_tol / L_i if L_i > 0 else 0.001)
            tol_u = max(0.001, node_tol / L_j if L_j > 0 else 0.001)

            # IC bolge: endpoint'lere cok yakin degil (zaten endpoint-on-line ile yakalanmis)
            if t <= tol_t or t >= 1 - tol_t:
                continue
            if u <= tol_u or u >= 1 - tol_u:
                continue

            # Intersection point
            ix = x1 + t * dx_i
            iy = y1 + t * dy_i

            # Her iki edge icin split point ekle
            splits.setdefault(i, []).append((ix, iy, t))
            splits.setdefault(j, []).append((ix, iy, u))

    if not splits:
        return edges

    # Yeniden bol — _split_edges_on_intersections ile ayni pattern
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


# ── Block-to-Line parcalama (insertion point split) ─────────────

def _collect_all_insert_points(doc) -> list[tuple[float, float]]:
    """TUM INSERT'lerin insertion point'lerini topla — blok ADI, SEKLI ve
    LAYER'i ONEMSIZ. Blogun icindeki geometri tamamen yoksayilir.

    Degismez kural (PRD): sprinkler/ekipman blogu cizimde her zaman borunun
    TAM USTUNE eklenir. Cizer blogu istedigi isimle/sekille cizebilir; tek
    guvenilir sinyal insertion point'in cizgi guzergahinda olmasidir.
    """
    pts: list[tuple[float, float]] = []
    for ent in doc.modelspace().query('INSERT'):
        try:
            pts.append((float(ent.dxf.insert.x), float(ent.dxf.insert.y)))
        except Exception:
            continue
    return pts


def _split_edges_on_insert_points(
    edges: list[dict],
    points: list[tuple[float, float]],
    node_tol: float,
) -> tuple[list[dict], set[tuple[float, float]]]:
    """Point-on-Line kesisimi + dugumden parcalama (Block-to-Line).

    Her insertion point icin:
      1. Nokta herhangi bir boru cizgisinin guzergahi uzerinde mi?
         (dik mesafe <= node_tol — "cok kucuk epsilon", sekil analizi YOK)
      2. Uzerindeyse: o node run-AYIRICI olarak isaretlenir (separator key)
         — kullanici arayuzde sprinkler'lar arasi ayri ayri parcalara tiklar.
      3. Projeksiyon cizginin IC bolgesindeyse (uclara yakin degilse) cizgi
         o noktadan IKI yeni segmente bolunur.

    Grid-bucketed: nokta yalniz kendi hucre komsulugundaki edge'lerle test
    edilir — binlerce INSERT × on binlerce edge'de O(P×E) patlamasi olmaz.

    Donus: (yeni edge listesi, separator node key seti).
    """
    if not edges or not points:
        return edges, set()

    cs = max(node_tol * 50.0, 10.0)
    cell_to_edges: dict[tuple[int, int], list[int]] = {}
    for i, e in enumerate(edges):
        mnx, mxx = min(e["x1"], e["x2"]), max(e["x1"], e["x2"])
        mny, mxy = min(e["y1"], e["y2"]), max(e["y1"], e["y2"])
        for cx in range(int((mnx - node_tol) // cs), int((mxx + node_tol) // cs) + 1):
            for cy in range(int((mny - node_tol) // cs), int((mxy + node_tol) // cs) + 1):
                cell_to_edges.setdefault((cx, cy), []).append(i)

    splits: dict[int, list[tuple[float, float, float]]] = {}
    separator_keys: set[tuple[float, float]] = set()

    for px, py in points:
        ck_x, ck_y = int(px // cs), int(py // cs)
        best: tuple[int, float, float, float, float] | None = None  # (i, t, projx, projy, d)
        for ncx in (ck_x - 1, ck_x, ck_x + 1):
            for ncy in (ck_y - 1, ck_y, ck_y + 1):
                for i in cell_to_edges.get((ncx, ncy), ()):
                    e = edges[i]
                    x1, y1, x2, y2 = e["x1"], e["y1"], e["x2"], e["y2"]
                    dx, dy = x2 - x1, y2 - y1
                    L2 = dx * dx + dy * dy
                    if L2 < 1.0:
                        continue
                    t = ((px - x1) * dx + (py - y1) * dy) / L2
                    t_cl = min(1.0, max(0.0, t))
                    qx = x1 + t_cl * dx
                    qy = y1 + t_cl * dy
                    d = math.hypot(px - qx, py - qy)
                    if d > node_tol:
                        continue
                    if best is None or d < best[4]:
                        best = (i, t, qx, qy, d)
        if best is None:
            continue  # nokta hicbir borunun uzerinde degil — blok alakasiz, dokunma
        i, t, qx, qy, _d = best
        # Run ayirici: nokta cizgi UZERINDE (uc noktada bile olsa) — her
        # sprinkler yeni parca baslatir
        separator_keys.add(_node_key(qx, qy, node_tol))
        # IC bolgede ise gercek bolme (uclara cok yakinsa mevcut node yeterli)
        if 0.001 < t < 0.999:
            splits.setdefault(i, []).append((qx, qy, t))

    if not splits:
        return edges, separator_keys

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
    return new_edges, separator_keys


# ── Run gruplama ─────────────────────────────────────────────────

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

    terminal = None
    for node, elist in node_edges.items():
        if len(elist) == 1:
            terminal = node
            break
    if terminal is None:
        terminal = next(iter(node_edges))

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

        node_deg_in_chain: dict[tuple[float, float], int] = {}
        for ei in chain:
            e = edges[ei]
            k1 = _node_key(e["x1"], e["y1"], node_tol)
            k2 = _node_key(e["x2"], e["y2"], node_tol)
            node_deg_in_chain[k1] = node_deg_in_chain.get(k1, 0) + 1
            node_deg_in_chain[k2] = node_deg_in_chain.get(k2, 0) + 1
        endpoints = [n for n, d in node_deg_in_chain.items() if d == 1]
        total_length = sum(edges[ei]["length"] for ei in chain)

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


# ── Ana API ──────────────────────────────────────────────────────

def _collect_raw_edges_all_layers(msp) -> list[dict]:
    """Tum LINE+LWPOLYLINE+POLYLINE edge'lerini topla (layer filtresi YOK).

    `_collect_raw_edges`'in layer-bagimsiz versiyonu — cross-layer T-junction
    tespiti icin tek bir scan'de tum boru layer'larinin edge'lerini toplar
    (cift tarama yerine). Per-entity tolerance (bozuk entity atlanir).
    """
    edges: list[dict] = []
    for ent in msp.query('LINE'):
        try:
            layer = ent.dxf.layer
            x1, y1 = float(ent.dxf.start.x), float(ent.dxf.start.y)
            x2, y2 = float(ent.dxf.end.x), float(ent.dxf.end.y)
        except Exception:
            continue
        length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
        if length < 1.0:
            continue
        edges.append({"layer": layer, "x1": x1, "y1": y1, "x2": x2, "y2": y2, "length": length})

    for ent in msp.query('LWPOLYLINE'):
        try:
            layer = ent.dxf.layer
            pts = [(float(p[0]), float(p[1])) for p in ent.get_points(format='xy')]
            closed = bool(getattr(ent, "closed", False))
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
            edges.append({"layer": layer, "x1": x1, "y1": y1, "x2": x2, "y2": y2, "length": length})
        if closed and len(pts) > 2:
            x1, y1 = pts[-1]
            x2, y2 = pts[0]
            length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            if length >= 1.0:
                edges.append({"layer": layer, "x1": x1, "y1": y1, "x2": x2, "y2": y2, "length": length})

    for ent in msp.query('POLYLINE'):
        try:
            layer = ent.dxf.layer
            pts = [(float(v.dxf.location.x), float(v.dxf.location.y)) for v in ent.vertices]
        except Exception:
            continue
        for i in range(len(pts) - 1):
            x1, y1 = pts[i]
            x2, y2 = pts[i + 1]
            length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            if length < 1.0:
                continue
            edges.append({"layer": layer, "x1": x1, "y1": y1, "x2": x2, "y2": y2, "length": length})

    return edges


def _extract_segments(
    dxf_path: str,
    pipe_layers: list[str],
    sprinkler_layers: list[str] | None = None,
    sprinkler_block_names: set[str] | None = None,
    all_pipe_layers: list[str] | None = None,
    unit_scale: float = 0.001,
    doc=None,
) -> tuple[list[Segment], list[tuple[float, float]]]:
    """Secilen boru layer'larindan topology-aware pipe-run segment'leri uret.

    PRD v2.0 destegi:
    - Snap & Split: dikey bransh endpoint'i yatay ana hatta tam degmiyorsa
      (mikro bosluk veya overshoot), node_tol icinde otomatik yakalanir.
    - Sprinkler izdusum: sprinkler block borunun yakininda (5-20cm) ise,
      en yakin LINE'a izdusumden bolme yapilir.

    Parametreler:
      pipe_layers: SEGMENT ciktisi bu layer'lardan uretilir (secilen layer'lar)
      sprinkler_layers: kullanici manuel sprinkler isaretledigi layer'lar
      sprinkler_block_names: layer-agnostik sprinkler block adlari (kullanim
        alani kalmadi ama backward-compat icin signature'da tutuldu)
      all_pipe_layers: TOPOLOGY hesabi icin kullanilacak tum boru layer'lari.
        None ise: DXF'teki LINE/POLYLINE iceren tum layer'lar otomatik tespit
        edilir → cross-layer T-junction yakalanir.
      unit_scale: DWG birim -> metre carpani (mm=0.001 default, cm=0.01, m=1.0).
        Tolerance hesabinda PRD epsilon=5cm world-unit'e cevrilir.

    Returns:
      (segments, sprinkler_centers) — sprinkler_centers ham (cx, cy) listesi.

    PERF: doc opsiyonel — caller'dan paylasilirsa tekrar ezdxf.readfile YOK.
    """
    if doc is None:
        from converter import read_dxf
        doc = read_dxf(dxf_path)
    msp = doc.modelspace()

    # Topology icin edge'leri topla — SADECE secili layer (pipe_layers) icinden.
    #
    # ESKI DAVRANIS: cross-layer (tum boru layer'lari) T tespiti yapiyordu.
    # Bu yanlisti cunku:
    #   - SICAK SU borusu ile SOGUK SU borusu gorsel olarak ayni noktadan
    #     gecse bile FIZIKSEL OLARAK farkli sistemlerdir, baglanti yok
    #   - Cross-layer kesisim T-noktasi sanilip segment'ler gereksiz boluniyordu
    #   - Sonuc: sismis segment sayisi + hatali T markerlari + gorsel kaos
    #
    # YENI DAVRANIS: T-noktasi = AYNI LAYER icindeki 3+ boru birlesimi.
    # Farkli layer'larin kesisimi (just visual overlap) GORMEZDEN GELINIR.
    # all_pipe_layers parametresi backward-compat icin tutuluyor ama kullanilmiyor.
    edges = _collect_raw_edges(msp, set(pipe_layers))
    if not edges:
        return [], []

    # PRD v2.0 — scale-aware adaptif tolerance (min 5cm node_tol, min 20cm sprinkler_tol)
    node_tol, sprinkler_tol = _compute_tolerances(edges, unit_scale=unit_scale)
    # STEP 1: Virtual tee — LINE ortasindaki endpoint degmeleri yakalar
    # (endpoint-on-line, ana hat yatay + dikey branshin endpoint'i ortada)
    edges_before_1 = len(edges)
    edges = _split_edges_on_intersections(edges, node_tol)
    edges_after_1 = len(edges)
    # STEP 2: Proper LINE-LINE crossing — iki LINE birbirini ortadan kesiyor
    # (klasik + kesisim, overshoot, mikro bosluk — PRD section 2.1 Snap & Split)
    edges = _split_edges_on_crossings(edges, node_tol)
    edges_after_2 = len(edges)
    # NOT: file=sys.stderr — parse_worker.py subprocess stdout'unu JSON output
    # icin kullaniyor, stdout'a print yazarsak JSON parse fail eder.
    import sys as _sys
    print(f"[pipe_segments] split: {edges_before_1} -> {edges_after_1} (endpoint-on-line) "
          f"-> {edges_after_2} (crossings) | node_tol={node_tol:.2f}",
          file=_sys.stderr)

    # Sprinkler merkezleri LINE orta kisminda ise LINE'i o noktada bol
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
            split_sprinkler_keys = {_node_key(x, y, node_tol) for x, y in split_positions}

    # STEP 3 — Block-to-Line parcalama (PRD): TUM INSERT insertion point'leri,
    # blok adi/sekli/layer'i ONEMSIZ. Nokta boru cizgisinin TAM USTUNDEYSE
    # (dik mesafe <= node_tol) cizgi o dugumden bolunur + run ayirici olur.
    # Boylece sprinkler layer'i hic isaretlenmese bile boru uzerine dizilmis
    # sprinkler bloklarinin arasindaki her parca ayri tiklanabilir segment olur.
    insert_points = _collect_all_insert_points(doc)
    insert_separator_keys: set[tuple[float, float]] = set()
    if insert_points:
        edges, insert_separator_keys = _split_edges_on_insert_points(
            edges, insert_points, node_tol,
        )
        print(f"[pipe_segments] block-to-line: {len(insert_points)} INSERT point, "
              f"{len(insert_separator_keys)} boru-ustu dugum",
              file=_sys.stderr)

    graph = _build_node_graph(edges, node_tol)
    sprinkler_keys, _ = _detect_sprinkler_positions(
        doc, node_tol, sprinkler_tol,
        sprinkler_layers=sprinkler_layers,
        sprinkler_block_names=sprinkler_block_names,
    )
    sprinkler_keys |= split_sprinkler_keys
    sprinkler_keys |= insert_separator_keys
    runs = _group_into_runs(edges, graph, sprinkler_keys, node_tol)

    # SEGMENT ciktisi sadece secilen layer'lardan
    # (diger layer'lar topology icin gerekli ama metraj'a girmesin)
    selected_set = set(pipe_layers)
    segments: list[Segment] = []
    sid = 0
    for run in runs:
        if run["layer"] not in selected_set:
            continue
        sid += 1
        segments.append({
            "id": sid,
            "layer": run["layer"],
            "x1": run["x1"], "y1": run["y1"],
            "x2": run["x2"], "y2": run["y2"],
            "length": run["length"],
            "polyline": run.get("polyline", []),
        })
    return segments, sp_centers


def _extract_junction_points(
    segments: list[Segment],
    node_tol: float,
) -> list[tuple[float, float]]:
    """Cikan segment'lerin endpoint'lerinden T-junction (degree>=3) noktalarini bul.

    Frontend Canvas2D viewer'da kucuk marker olarak gosterilir → kullanici
    her T noktasinda gercekten 3 ayri segment buluştugunu gorur.
    """
    from collections import defaultdict
    endpoint_count: dict[tuple[float, float], list[tuple[float, float]]] = defaultdict(list)
    for s in segments:
        k1 = _node_key(s["x1"], s["y1"], node_tol)
        k2 = _node_key(s["x2"], s["y2"], node_tol)
        endpoint_count[k1].append((s["x1"], s["y1"]))
        endpoint_count[k2].append((s["x2"], s["y2"]))
    junctions: list[tuple[float, float]] = []
    for k, coords_list in endpoint_count.items():
        if len(coords_list) >= 3:
            # Gercek koordinat (ilk gorulen) — node_key zaten quantize
            junctions.append(coords_list[0])
    return junctions
