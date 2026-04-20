"""
graph.py — Boru Ağı Oluşturma

DXF'ten boru edge'lerini çıkarır, Union-Find ile fitting boşluklarını kapatır,
tee/end noktalarını tespit eder. Raw koordinatları da döndürür (ok eşleştirme için).
"""

import math
from collections import defaultdict
from typing import NamedTuple


class Point(NamedTuple):
    x: float
    y: float


class Edge:
    __slots__ = ('node_a', 'node_b', 'length', 'layer', 'idx')

    def __init__(self, node_a: Point, node_b: Point, length: float, layer: str, idx: int):
        self.node_a = node_a
        self.node_b = node_b
        self.length = length
        self.layer = layer
        self.idx = idx


class PipeGraph:
    """build_graph() sonucu."""
    __slots__ = ('edges', 'raw_coords', 'tees', 'ends', 'adj', 'sprinkler_points')

    def __init__(self, edges, raw_coords, tees, ends, adj, sprinkler_points=None):
        self.edges = edges
        self.raw_coords = raw_coords
        self.tees = tees       # set[Point]
        self.ends = ends       # set[Point]
        self.adj = adj         # dict[Point, list[tuple[Point, Edge]]]
        # Sprinkler INSERT pozisyonlari icin borular bolunmus noktalar.
        self.sprinkler_points: set[Point] = sprinkler_points or set()


# Fitting boşlukları 7-25 birim. 25 ile %88 bağlantı sağlanır.
MERGE_DISTANCE = 25.0
MAX_CLUSTER = 60.0  # Zincir birleşmeyi önler
MIN_EDGE_LENGTH = 5.0  # Çok kısa çizgiler (< 5 birim) atla
# Sprinkler INSERT'i boru edge'ine bu mesafede ise edge'i boleriz
SPRINKLER_SNAP_DIST = 50.0
# Sprinkler projeksiyonu edge uclarina cok yakinsa bolme (anlamsiz parca olusmasin)
SPRINKLER_EDGE_EPS = 0.05  # t parametresi icin [0.05, 0.95] araligi
# AutoCAD'de sprinkler bazen borunun bir vertex'ine cakistiriliyor. Bu durumda
# edge bolmeye gerek yok — mevcut node'u sprinkler olarak isaretlemek yeterli.
SPRINKLER_VERTEX_SNAP = 5.0


def _merge_close_points(raw_points: list[tuple[float, float]]) -> dict[int, Point]:
    """
    MERGE_DISTANCE içindeki noktaları birleştir.
    Bounded Union-Find: tee'deki 3 noktayı birleştirir ama
    uzun zincirleri önler (cluster çap max MAX_CLUSTER).
    """
    n = len(raw_points)
    merge_dist_sq = MERGE_DISTANCE * MERGE_DISTANCE

    parent = list(range(n))
    bbox: dict[int, tuple[float, float, float, float]] = {
        i: (raw_points[i][0], raw_points[i][1],
            raw_points[i][0], raw_points[i][1])
        for i in range(n)
    }

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    # Yakın çiftleri bul ve mesafeye göre sırala
    pairs: list[tuple[float, int, int]] = []
    for i in range(n):
        for j in range(i + 1, n):
            dx = raw_points[i][0] - raw_points[j][0]
            dy = raw_points[i][1] - raw_points[j][1]
            d_sq = dx * dx + dy * dy
            if d_sq <= merge_dist_sq:
                pairs.append((d_sq, i, j))
    pairs.sort()

    for _, i, j in pairs:
        ri, rj = find(i), find(j)
        if ri == rj:
            continue

        bi, bj = bbox[ri], bbox[rj]
        new_min_x = min(bi[0], bj[0])
        new_min_y = min(bi[1], bj[1])
        new_max_x = max(bi[2], bj[2])
        new_max_y = max(bi[3], bj[3])

        if (new_max_x - new_min_x) > MAX_CLUSTER or \
           (new_max_y - new_min_y) > MAX_CLUSTER:
            continue

        parent[rj] = ri
        bbox[ri] = (new_min_x, new_min_y, new_max_x, new_max_y)

    rep_cache: dict[int, Point] = {}
    result: dict[int, Point] = {}
    for i in range(n):
        root = find(i)
        if root not in rep_cache:
            rep_cache[root] = Point(
                round(raw_points[root][0], 1),
                round(raw_points[root][1], 1),
            )
        result[i] = rep_cache[root]
    return result


def build_graph(
    dxf_path: str,
    pipe_layers: list[str],
    sprinkler_layers: list[str] | None = None,
) -> PipeGraph:
    """
    Seçilen boru layer'larından graph oluştur.
    Cap layer'ları DAHİL ETMEYİN — sadece gerçek boru layer'ları.

    sprinkler_layers: sprinkler INSERT layer'lari. Verilirse her INSERT
    pozisyonu en yakin boru edge'ine projekte edilir ve edge o noktada
    bolunur — her sprinkler bir tee gibi davranir.

    Döndürür: PipeGraph (edges, raw_coords, tees, ends, adj, sprinkler_points)
    """
    import ezdxf

    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()
    pipe_set = set(pipe_layers)

    # 1. Raw edge'leri topla
    raw_edges: list[tuple[int, int, float, str]] = []
    raw_points: list[tuple[float, float]] = []
    point_index: dict[tuple[float, float], int] = {}

    def _get_idx(x: float, y: float) -> int:
        key = (round(x), round(y))
        if key not in point_index:
            point_index[key] = len(raw_points)
            raw_points.append((x, y))
        return point_index[key]

    for entity in msp.query('LINE'):
        if entity.dxf.layer not in pipe_set:
            continue
        s, e = entity.dxf.start, entity.dxf.end
        length = math.sqrt((e.x - s.x) ** 2 + (e.y - s.y) ** 2)
        if length < MIN_EDGE_LENGTH:
            continue
        ia, ib = _get_idx(s.x, s.y), _get_idx(e.x, e.y)
        if ia != ib:
            raw_edges.append((ia, ib, length, entity.dxf.layer))

    for entity in msp.query('LWPOLYLINE'):
        if entity.dxf.layer not in pipe_set:
            continue
        pts = list(entity.get_points(format="xy"))
        for i in range(len(pts) - 1):
            sx, sy = pts[i]
            ex, ey = pts[i + 1]
            length = math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2)
            if length < MIN_EDGE_LENGTH:
                continue
            ia, ib = _get_idx(sx, sy), _get_idx(ex, ey)
            if ia != ib:
                raw_edges.append((ia, ib, length, entity.dxf.layer))

    for entity in msp.query('POLYLINE'):
        if entity.dxf.layer not in pipe_set:
            continue
        vertices = list(entity.vertices)
        for i in range(len(vertices) - 1):
            sx, sy = vertices[i].dxf.location.x, vertices[i].dxf.location.y
            ex, ey = vertices[i + 1].dxf.location.x, vertices[i + 1].dxf.location.y
            length = math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2)
            if length < MIN_EDGE_LENGTH:
                continue
            ia, ib = _get_idx(sx, sy), _get_idx(ex, ey)
            if ia != ib:
                raw_edges.append((ia, ib, length, entity.dxf.layer))

    if not raw_points:
        return PipeGraph([], [], set(), set(), {})

    # 1.5. Sprinkler INSERT'leri topla ve borulari bu noktalarda bol
    # Her sprinkler position'a en yakin edge'i bulup bolmek: ayni boru iki
    # edge'e donusur, ortasinda yeni node olur.
    sprinkler_raw_indices: set[int] = set()
    if sprinkler_layers:
        sprinkler_set = set(sprinkler_layers)
        sprinkler_positions: list[tuple[float, float]] = []
        for entity in msp.query('INSERT'):
            if entity.dxf.layer in sprinkler_set:
                sprinkler_positions.append((entity.dxf.insert.x, entity.dxf.insert.y))

        snap_dist_sq = SPRINKLER_SNAP_DIST ** 2
        vertex_snap_sq = SPRINKLER_VERTEX_SNAP ** 2

        for sx, sy in sprinkler_positions:
            # Mevcut node'a cakisim kontrolu
            best_pt_idx = -1
            best_pt_dsq = vertex_snap_sq
            for i, (rx, ry) in enumerate(raw_points):
                dd = (sx - rx) * (sx - rx) + (sy - ry) * (sy - ry)
                if dd < best_pt_dsq:
                    best_pt_dsq = dd
                    best_pt_idx = i
            if best_pt_idx >= 0:
                sprinkler_raw_indices.add(best_pt_idx)
                continue

            # Edge uzerine snap + bolme
            best_edge_i = -1
            best_dist_sq = snap_dist_sq
            best_proj: tuple[float, float] | None = None

            for i in range(len(raw_edges)):
                ia, ib, length, layer = raw_edges[i]
                ax, ay = raw_points[ia]
                bx, by = raw_points[ib]
                dx = bx - ax
                dy = by - ay
                seg_len_sq = dx * dx + dy * dy
                if seg_len_sq < 1e-6:
                    continue
                t = ((sx - ax) * dx + (sy - ay) * dy) / seg_len_sq
                if t < SPRINKLER_EDGE_EPS or t > (1.0 - SPRINKLER_EDGE_EPS):
                    continue
                px = ax + t * dx
                py = ay + t * dy
                dsq = (sx - px) ** 2 + (sy - py) ** 2
                if dsq < best_dist_sq:
                    best_dist_sq = dsq
                    best_edge_i = i
                    best_proj = (px, py)

            if best_edge_i < 0 or best_proj is None:
                continue

            ia, ib, _old_length, layer = raw_edges[best_edge_i]
            ax, ay = raw_points[ia]
            bx, by = raw_points[ib]
            px, py = best_proj

            ic = _get_idx(px, py)
            sprinkler_raw_indices.add(ic)

            len_a = math.sqrt((px - ax) ** 2 + (py - ay) ** 2)
            len_b = math.sqrt((bx - px) ** 2 + (by - py) ** 2)

            if len_a < MIN_EDGE_LENGTH or len_b < MIN_EDGE_LENGTH:
                continue

            raw_edges[best_edge_i] = (ia, ic, len_a, layer)
            raw_edges.append((ic, ib, len_b, layer))

    # 2. Yakın noktaları birleştir
    merged = _merge_close_points(raw_points)

    # Sprinkler raw indekslerini merge sonrasi final Point'lere cevir
    sprinkler_points: set[Point] = {merged[idx] for idx in sprinkler_raw_indices
                                     if idx in merged}

    # 3. Edge listesi + raw koordinatlar
    edges: list[Edge] = []
    raw_coords: list[tuple[int, float, float, float, float]] = []
    edge_idx = 0

    for ia, ib, length, layer in raw_edges:
        node_a = merged[ia]
        node_b = merged[ib]
        if node_a == node_b:
            continue
        edges.append(Edge(node_a, node_b, length, layer, edge_idx))
        raw_coords.append((edge_idx, raw_points[ia][0], raw_points[ia][1],
                           raw_points[ib][0], raw_points[ib][1]))
        edge_idx += 1

    # 4. Tee/end noktaları
    degree: dict[Point, int] = defaultdict(int)
    for e in edges:
        degree[e.node_a] += 1
        degree[e.node_b] += 1

    tees: set[Point] = set()
    ends: set[Point] = set()
    for pt, deg in degree.items():
        if deg >= 3:
            tees.add(pt)
        elif deg == 1:
            ends.add(pt)

    # 5. Adjacency list
    adj: dict[Point, list[tuple[Point, Edge]]] = defaultdict(list)
    for edge in edges:
        adj[edge.node_a].append((edge.node_b, edge))
        adj[edge.node_b].append((edge.node_a, edge))

    return PipeGraph(edges, raw_coords, tees, ends, adj, sprinkler_points)


def extract_background_lines(
    dxf_path: str,
    exclude_layers: list[str] | None = None,
    max_lines: int = 5000,
) -> list[list[float]]:
    """
    Arka plan icin: tum layer'lardan LINE/LWPOLYLINE koordinatlarini cikar.
    Secili boru layer'lari haric (exclude_layers).
    Donduruyor: [[x1,y1,x2,y2], ...] — max_lines kadar.
    """
    import ezdxf

    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()
    exclude = set(exclude_layers or [])
    lines: list[list[float]] = []

    for entity in msp.query('LINE'):
        if len(lines) >= max_lines:
            break
        if entity.dxf.layer in exclude:
            continue
        s, e = entity.dxf.start, entity.dxf.end
        lines.append([round(s.x, 1), round(s.y, 1), round(e.x, 1), round(e.y, 1)])

    for entity in msp.query('LWPOLYLINE'):
        if len(lines) >= max_lines:
            break
        if entity.dxf.layer in exclude:
            continue
        pts = list(entity.get_points(format="xy"))
        for i in range(len(pts) - 1):
            if len(lines) >= max_lines:
                break
            lines.append([
                round(pts[i][0], 1), round(pts[i][1], 1),
                round(pts[i + 1][0], 1), round(pts[i + 1][1], 1),
            ])

    return lines
