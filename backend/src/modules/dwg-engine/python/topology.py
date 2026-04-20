"""
topology.py — Boru graph'ı + layer bazlı uzunluk metrajı.

ÇAP ATAMA YOK. Sadece:
  - Graph kurma (build_graph)
  - Sprinkler layer tespiti (manuel + hat ismi + layer adı keyword)
  - Layer bazlı toplam uzunluk + çizgi sayısı
  - BranchPoint listesi (tee + sprinkler + end) — her biri dominant layer'ı ile
"""

import math
from collections import defaultdict

from graph import Point, PipeGraph, build_graph
from models import PipeSegment, BranchPoint


def compute_edge_branches(graph: PipeGraph) -> dict[int, str]:
    """Edge'leri kolinear zincir gruplarına (branch_id) böl.

    Kurallar:
    - Degree-2 node: iki edge aynı dal (kolinear varsayılır)
    - Tee (degree >= 3): kolinear çift varsa onlar aynı dal, diğerleri ayrı
    - Sprinkler node: kolinear çift olsa bile AYIRICI (her sprinkler = yeni dal)
    """
    parent: dict[int, int] = {e.idx: e.idx for e in graph.edges}

    def find(x: int) -> int:
        root = x
        while parent[root] != root:
            root = parent[root]
        while parent[x] != root:
            parent[x], x = root, parent[x]
        return root

    def union(x: int, y: int) -> None:
        rx, ry = find(x), find(y)
        if rx != ry:
            parent[rx] = ry

    COLLINEAR_DOT_MAX = -0.966  # 180 +/- 15 derece
    sprinkler_points = getattr(graph, 'sprinkler_points', set()) or set()

    for node, neighbors in graph.adj.items():
        edge_list = [e for _, e in neighbors]
        if len(edge_list) < 2:
            continue

        if node in sprinkler_points:
            continue

        if node not in graph.tees and len(edge_list) == 2:
            union(edge_list[0].idx, edge_list[1].idx)
            continue

        dirs: list[tuple[int, float, float]] = []
        for e in edge_list:
            if e.node_a == node:
                dx = e.node_b.x - node.x
                dy = e.node_b.y - node.y
            else:
                dx = e.node_a.x - node.x
                dy = e.node_a.y - node.y
            length = math.sqrt(dx * dx + dy * dy)
            if length > 1e-9:
                dirs.append((e.idx, dx / length, dy / length))

        used: set[int] = set()
        for i in range(len(dirs)):
            idx_i, dx_i, dy_i = dirs[i]
            if idx_i in used:
                continue
            best_j = -1
            best_dot = COLLINEAR_DOT_MAX
            for j in range(len(dirs)):
                if i == j:
                    continue
                idx_j, dx_j, dy_j = dirs[j]
                if idx_j in used:
                    continue
                dot = dx_i * dx_j + dy_i * dy_j
                if dot < best_dot:
                    best_dot = dot
                    best_j = j
            if best_j >= 0:
                union(idx_i, dirs[best_j][0])
                used.add(idx_i)
                used.add(dirs[best_j][0])

    roots_to_branch: dict[int, str] = {}
    counter = 0
    result: dict[int, str] = {}
    for e in sorted(graph.edges, key=lambda x: x.idx):
        root = find(e.idx)
        if root not in roots_to_branch:
            counter += 1
            roots_to_branch[root] = f"b_{counter}"
        result[e.idx] = roots_to_branch[root]

    return result


def _norm_tr(s: str) -> str:
    """Türkçe karakterleri ASCII'ye çevir + küçük harf."""
    trans = str.maketrans({
        '\u0130': 'I', '\u0049': 'I', '\u0131': 'i',
        '\u015e': 'S', '\u015f': 's',
        '\u011e': 'G', '\u011f': 'g',
        '\u00d6': 'O', '\u00f6': 'o',
        '\u00dc': 'U', '\u00fc': 'u',
        '\u00c7': 'C', '\u00e7': 'c',
    })
    return s.translate(trans).lower()


_SPRINKLER_KEYWORDS = ('sprink', 'upright', 'pendant', 'sidewall')


def _is_sprinkler_hint(text: str) -> bool:
    return any(kw in _norm_tr(text) for kw in _SPRINKLER_KEYWORDS)


def analyze_topology(
    dxf_path: str,
    selected_layers: list[str] | None = None,
    scale: float = 0.001,
    material_type_map: dict[str, str] | None = None,
    hat_tipi_map: dict[str, str] | None = None,
    sprinkler_layers_manual: list[str] | None = None,
) -> tuple[list[PipeSegment], list[BranchPoint], list[str]]:
    """Layer bazlı uzunluk metrajı + BranchPoint listesi. Çap YOK."""
    warnings: list[str] = []

    if not selected_layers:
        return [], [], ["Boru layer'ları seçilmedi"]

    # Multi-layer: her layer'i ayri analiz et (cross-system bozulmasin)
    if len(selected_layers) > 1:
        all_segs: list[PipeSegment] = []
        all_bps: list[BranchPoint] = []
        all_warns: list[str] = []

        for layer in selected_layers:
            result = analyze_topology(
                dxf_path, [layer], scale, material_type_map,
                hat_tipi_map=hat_tipi_map,
                sprinkler_layers_manual=sprinkler_layers_manual,
            )
            all_segs.extend(result[0])
            all_bps.extend(result[1])
            all_warns.extend(result[2])

        return all_segs, all_bps, all_warns

    # Tek layer analizi
    # 1. Sprinkler layer'larini belirle (manuel + hat ismi + layer adi keyword)
    sprinkler_set: set[str] = set()

    if sprinkler_layers_manual:
        for l in sprinkler_layers_manual:
            sprinkler_set.add(l)

    if hat_tipi_map:
        for layer_name, hat_ismi in hat_tipi_map.items():
            if hat_ismi and _is_sprinkler_hint(hat_ismi):
                sprinkler_set.add(layer_name)

    # Layer adinda keyword — otomatik fallback
    import ezdxf
    doc = ezdxf.readfile(dxf_path)
    all_layers = {e.dxf.layer for e in doc.modelspace() if hasattr(e.dxf, 'layer')}
    for l in all_layers:
        if _is_sprinkler_hint(l):
            sprinkler_set.add(l)

    sprinkler_layers_auto = sorted(sprinkler_set)
    if sprinkler_layers_auto:
        warnings.append(f"Sprinkler layer'lari: {sprinkler_layers_auto}")

    # 2. Graph kur (sprinkler INSERT'ler boruyu boler)
    graph = build_graph(dxf_path, selected_layers, sprinkler_layers=sprinkler_layers_auto)
    if not graph.edges:
        return [], [], ["Seçilen layer'larda boru bulunamadı"]

    warnings.append(
        f"Topoloji: {len(graph.edges)} edge, {len(graph.tees)} tee, "
        f"{len(graph.ends)} hat sonu, {len(graph.sprinkler_points)} sprinkler"
    )

    # 3. Layer bazli uzunluk topla
    _mat_map = material_type_map or {}
    layer_totals: dict[str, dict] = defaultdict(lambda: {'length': 0.0, 'lines': 0})
    for e in graph.edges:
        layer_totals[e.layer]['length'] += e.length
        layer_totals[e.layer]['lines'] += 1

    merged_segments: list[PipeSegment] = []
    sid = 0
    for layer, data in sorted(layer_totals.items()):
        sid += 1
        merged_segments.append(PipeSegment(
            segment_id=sid,
            layer=layer,
            length=round(data['length'] * scale, 2),
            line_count=data['lines'],
            material_type=_mat_map.get(layer, ""),
        ))

    # 4. BranchPoint listesi (tee + sprinkler + end), her nokta dominant layer ile
    degree: dict[Point, int] = defaultdict(int)
    for e in graph.edges:
        degree[e.node_a] += 1
        degree[e.node_b] += 1

    node_layer_votes: dict[Point, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for e in graph.edges:
        node_layer_votes[e.node_a][e.layer] += 1
        node_layer_votes[e.node_b][e.layer] += 1

    def _dominant_layer(pt: Point) -> str:
        votes = node_layer_votes.get(pt, {})
        if not votes:
            return ""
        return max(votes.items(), key=lambda kv: kv[1])[0]

    branch_points: list[BranchPoint] = []
    # Sprinkler noktalari once eklenir (tee/end ile cakisirsa sprinkler onceliklidir)
    seen_points: set = set()
    for pt in graph.sprinkler_points:
        branch_points.append(BranchPoint(
            x=round(pt.x, 1), y=round(pt.y, 1),
            connections=degree.get(pt, 0),
            point_type="sprinkler",
            layer=_dominant_layer(pt),
        ))
        seen_points.add(pt)
    for pt in graph.tees:
        if pt in seen_points:
            continue
        branch_points.append(BranchPoint(
            x=round(pt.x, 1), y=round(pt.y, 1),
            connections=degree[pt],
            point_type="tee",
            layer=_dominant_layer(pt),
        ))
    for pt in graph.ends:
        if pt in seen_points:
            continue
        branch_points.append(BranchPoint(
            x=round(pt.x, 1), y=round(pt.y, 1),
            connections=degree[pt],
            point_type="end",
            layer=_dominant_layer(pt),
        ))

    return merged_segments, branch_points, warnings
