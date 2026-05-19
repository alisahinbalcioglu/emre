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

def _collect_all_pipe_layers(msp) -> set[str]:
    """DXF modelspace'deki LINE/LWPOLYLINE/POLYLINE iceren tum layer'lari topla.

    Cross-layer T-junction tespiti icin: yatay ana hat (layer A) ile dikey
    bransh hatlari (layer B) ayri layer'lardaysa bile, ikisinin node'lari
    ortak grid'e toplansin ki orta nokta T olarak yakalansin.

    Sadece pipe-benzeri entity'ler (LINE/POLYLINE) dahil — TEXT/INSERT/CIRCLE
    layer'lari dahil edilmez, cunku onlar topology'ye katki saglamaz.
    """
    layers: set[str] = set()
    for ent in msp.query('LINE'):
        layers.add(ent.dxf.layer)
    for ent in msp.query('LWPOLYLINE'):
        layers.add(ent.dxf.layer)
    for ent in msp.query('POLYLINE'):
        layers.add(ent.dxf.layer)
    return layers


def _extract_segments(
    dxf_path: str,
    pipe_layers: list[str],
    sprinkler_layers: list[str] | None = None,
    sprinkler_block_names: set[str] | None = None,
    all_pipe_layers: list[str] | None = None,
    doc=None,
) -> tuple[list[Segment], list[tuple[float, float]]]:
    """Secilen boru layer'larindan topology-aware pipe-run segment'leri uret.

    Her segment = bir pipe-run (iki junction/terminal/sprinkler arasinda).

    Parametreler:
      pipe_layers: SEGMENT ciktisi bu layer'lardan uretilir (secilen layer'lar)
      sprinkler_layers: kullanici manuel sprinkler isaretledigi layer'lar
      sprinkler_block_names: layer-agnostik sprinkler block adlari (kullanim
        alani kalmadi ama backward-compat icin signature'da tutuldu)
      all_pipe_layers: TOPOLOGY hesabi icin kullanilacak tum boru layer'lari.
        None ise: DXF'teki LINE/POLYLINE iceren tum layer'lar otomatik tespit
        edilir → cross-layer T-junction yakalanir (yatay ana hat farkli
        layer'daki dikey bransh ile orta noktada birlesirse parcalanir).
        Ciktidaki run'lar yine sadece pipe_layers'tan gelir.

    Returns:
      (segments, sprinkler_centers) — sprinkler_centers ham (cx, cy) listesi.

    PERF: doc opsiyonel — caller'dan paylasilirsa tekrar ezdxf.readfile YOK.
    """
    if doc is None:
        from converter import read_dxf
        doc = read_dxf(dxf_path)
    msp = doc.modelspace()

    # Topology icin tum boru layer'lari (cross-layer T tespiti)
    if all_pipe_layers is not None:
        topology_layer_set = set(all_pipe_layers)
    else:
        topology_layer_set = _collect_all_pipe_layers(msp)
    # Selected mutlaka dahil olsun (caller bilmediyse bile)
    topology_layer_set |= set(pipe_layers)

    edges = _collect_raw_edges(msp, topology_layer_set)
    if not edges:
        return [], []

    # Adaptif tolerance — edge median'ina gore olcek-bagimsiz
    node_tol, sprinkler_tol = _compute_tolerances(edges)
    # Virtual tee tespiti — LINE ortasindaki endpoint degmelerini yeni edge olarak ayir
    # (tum boru layer'lari dahil → cross-layer T yakalanir)
    edges = _split_edges_on_intersections(edges, node_tol)

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

    graph = _build_node_graph(edges, node_tol)
    sprinkler_keys, _ = _detect_sprinkler_positions(
        doc, node_tol, sprinkler_tol,
        sprinkler_layers=sprinkler_layers,
        sprinkler_block_names=sprinkler_block_names,
    )
    sprinkler_keys |= split_sprinkler_keys
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
