"""
Topoloji Analizi v2 — Pipe-Walker + LEADER takibi + dik mesafe cap eslestirme.

Pipe-Walker: Hat sonundan baslayip boru boyunca yurur, dallanma
noktalarinda segmentlere ayirir, her edge'e dik mesafe ile cap text'i atar.
Bulamazsa ust hat'tan cap miras alir.

LEADER takibi: Ok cizgilerinin ucunu boruya, kuyruğunu text'e eslestirir.

Kullanim:
    from topology import analyze_topology
    result = analyze_topology(dxf_path, selected_layers, scale)
"""

import math
import re
from collections import defaultdict
from typing import NamedTuple

import ezdxf

from models import PipeSegment, BranchPoint


# ═══════════════════════════════════════════════════════
#  VERI YAPILARI
# ═══════════════════════════════════════════════════════

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


class DiameterText(NamedTuple):
    value: str          # "Ø200", "DN150", '2"' vb.
    position: Point     # text pozisyonu


# Tolerans: bu kadar yakin uclar ayni nokta sayilir
NODE_TOLERANCE = 5.0

# Dik mesafe esigi: text boruya bu kadar yakin olmali (cizim birimi)
MAX_PERP_DISTANCE = 800.0

# LEADER kuyrugu ile text arasi max mesafe
MAX_LEADER_TEXT_DISTANCE = 500.0

# LEADER ok ucu ile edge node'u arasi max mesafe
MAX_LEADER_ARROW_DISTANCE = 100.0


# ═══════════════════════════════════════════════════════
#  1. GRAPH OLUSTURMA (KORUNDU)
# ═══════════════════════════════════════════════════════

def _round_point(x: float, y: float) -> Point:
    """Koordinatlari tolerans'a gore yuvarla."""
    tol = NODE_TOLERANCE
    return Point(round(x / tol) * tol, round(y / tol) * tol)


def build_pipe_graph(
    dxf_path: str,
    selected_layers: list[str] | None = None,
) -> list[Edge]:
    """
    Secilen layer'lardaki LINE/LWPOLYLINE/POLYLINE entity'lerinden
    edge listesi olusturur.
    """
    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()
    edges: list[Edge] = []
    edge_idx = 0

    def _should_include(layer: str) -> bool:
        if selected_layers is None:
            return True
        return layer in selected_layers

    for entity in msp.query('LINE'):
        layer = entity.dxf.layer
        if not _should_include(layer):
            continue
        start = entity.dxf.start
        end = entity.dxf.end
        length = math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2)
        if length < 10.0:
            continue
        node_a = _round_point(start.x, start.y)
        node_b = _round_point(end.x, end.y)
        if node_a == node_b:
            continue
        edges.append(Edge(node_a, node_b, length, layer, edge_idx))
        edge_idx += 1

    for entity in msp.query('LWPOLYLINE'):
        layer = entity.dxf.layer
        if not _should_include(layer):
            continue
        points = list(entity.get_points(format="xy"))
        for i in range(len(points) - 1):
            sx, sy = points[i]
            ex, ey = points[i + 1]
            length = math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2)
            if length < 10.0:
                continue
            node_a = _round_point(sx, sy)
            node_b = _round_point(ex, ey)
            if node_a == node_b:
                continue
            edges.append(Edge(node_a, node_b, length, layer, edge_idx))
            edge_idx += 1

    for entity in msp.query('POLYLINE'):
        layer = entity.dxf.layer
        if not _should_include(layer):
            continue
        vertices = list(entity.vertices)
        for i in range(len(vertices) - 1):
            sx = vertices[i].dxf.location.x
            sy = vertices[i].dxf.location.y
            ex = vertices[i + 1].dxf.location.x
            ey = vertices[i + 1].dxf.location.y
            length = math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2)
            if length < 10.0:
                continue
            node_a = _round_point(sx, sy)
            node_b = _round_point(ex, ey)
            if node_a == node_b:
                continue
            edges.append(Edge(node_a, node_b, length, layer, edge_idx))
            edge_idx += 1

    return edges


# ═══════════════════════════════════════════════════════
#  2. DALLANMA NOKTALARI (KORUNDU)
# ═══════════════════════════════════════════════════════

def find_branch_points(edges: list[Edge]) -> dict[Point, str]:
    """3+ edge → tee, 1 edge → end."""
    degree: dict[Point, int] = defaultdict(int)
    for edge in edges:
        degree[edge.node_a] += 1
        degree[edge.node_b] += 1

    result: dict[Point, str] = {}
    for point, deg in degree.items():
        if deg >= 3:
            result[point] = "tee"
        elif deg == 1:
            result[point] = "end"
    return result


# ═══════════════════════════════════════════════════════
#  3. CAP TEXT CIKARMA (+ EKIPMAN FILTRESI)
# ═══════════════════════════════════════════════════════

# Ekipman keyword'leri — bu kelimeler iceren text'ler cap degil
_EQUIPMENT_KEYWORDS = {
    "NPT", "SPRINKLER", "TEPKIMEL", "UPRIGHT", "PENDENT",
    "CONCEALED", "SIDEWALL", "PENDANT", "FIRE HOSE",
}

# Cap regex pattern'leri — oncelik sirasina gore
_DIAMETER_PATTERNS = [
    (re.compile(r'[ØøÖö]\s*(\d+)', re.IGNORECASE), lambda m: f"Ø{m.group(1)}"),
    (re.compile(r'DN\s*(\d+)', re.IGNORECASE), lambda m: f"DN{m.group(1)}"),
    (re.compile(r'(\d+)\s*½\s*["\u2033]'), lambda m: f'{m.group(1)}½"'),
    (re.compile(r'(\d+)\s*¼\s*["\u2033]'), lambda m: f'{m.group(1)}¼"'),
    (re.compile(r'(\d+)\s*¾\s*["\u2033]'), lambda m: f'{m.group(1)}¾"'),
    (re.compile(r'(\d+)\s+(\d+/\d+)\s*["\u2033]'), lambda m: f'{m.group(1)} {m.group(2)}"'),
    (re.compile(r'(\d+/\d+)\s*["\u2033]'), lambda m: f'{m.group(1)}"'),
    (re.compile(r'(?<!\d)(\d+)\s*["\u2033]'), lambda m: f'{m.group(1)}"'),
]

# Malzeme aciklamasi pattern'i — icinde cap olabilir, kabul et
_MATERIAL_DESC_PATTERN = re.compile(r'HDPE|PPR|PE\s*100|PN\s*\d+', re.IGNORECASE)


def _parse_diameter(text: str) -> str | None:
    """
    Text'ten cap bilgisi cikar. Ekipman text'lerini filtreler.
    "HDPE 100 PN 16 Ø200" kabul edilir, "1/2\" NPT SPRINKLER" reddedilir.
    """
    upper = text.upper()

    # Ekipman keyword'u var MI?
    has_equipment_kw = any(kw in upper for kw in _EQUIPMENT_KEYWORDS)

    if has_equipment_kw:
        # Malzeme aciklamasi MI kontrol et (HDPE, PPR, PE100 vb.)
        # Malzeme aciklamasi ise cap'i kabul et, degilse reddet
        if not _MATERIAL_DESC_PATTERN.search(text):
            return None

    for pattern, formatter in _DIAMETER_PATTERNS:
        match = pattern.search(text)
        if match:
            return formatter(match)
    return None


def extract_diameters(dxf_path: str) -> list[DiameterText]:
    """TUM TEXT/MTEXT entity'lerinden cap bilgisi cikarir."""
    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()
    results: list[DiameterText] = []

    for entity in msp:
        text_content = ""
        position = Point(0.0, 0.0)

        if entity.dxftype() == 'TEXT':
            text_content = entity.dxf.text or ""
            insert = entity.dxf.insert
            position = Point(insert.x, insert.y)
        elif entity.dxftype() == 'MTEXT':
            text_content = entity.text if hasattr(entity, 'text') else ""
            insert = entity.dxf.insert
            position = Point(insert.x, insert.y)
        else:
            continue

        if not text_content:
            continue

        diameter = _parse_diameter(text_content)
        if diameter:
            results.append(DiameterText(value=diameter, position=position))

    return results


# ═══════════════════════════════════════════════════════
#  4. LEADER (OK) TAKIBI
# ═══════════════════════════════════════════════════════

def extract_leader_diameters(
    dxf_path: str,
    diameter_texts: list[DiameterText],
) -> dict[Point, str]:
    """
    LEADER entity'lerinin ok ucunu cap text'iyle eslestirir.

    LEADER yapisi:
      vertices[0]  = ok ucu (boruya isaret eder)
      vertices[-1] = kuyruk (text'in yani)

    Algoritma:
      1. Her LEADER'in kuyruk ucuna en yakin cap text'ini bul
      2. O text'in cap degerini ok ucuyla esle
      3. Donus: {ok_ucu_rounded: cap_degeri}
    """
    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()
    leader_map: dict[Point, str] = {}

    for entity in msp:
        if entity.dxftype() not in ('LEADER', 'MULTILEADER'):
            continue

        # LEADER vertex'lerini al
        arrow_tip: Point | None = None
        tail_tip: Point | None = None

        if entity.dxftype() == 'LEADER':
            verts = list(entity.vertices)
            if len(verts) < 2:
                continue
            arrow_tip = Point(verts[0][0], verts[0][1])
            tail_tip = Point(verts[-1][0], verts[-1][1])

        elif entity.dxftype() == 'MULTILEADER':
            try:
                ctx = entity.context
                if hasattr(ctx, 'leaders') and ctx.leaders:
                    for ldr in ctx.leaders:
                        if hasattr(ldr, 'lines') and ldr.lines:
                            for line in ldr.lines:
                                line_verts = list(line.vertices)
                                if len(line_verts) >= 2:
                                    arrow_tip = Point(line_verts[0][0], line_verts[0][1])
                                    tail_tip = Point(line_verts[-1][0], line_verts[-1][1])
                                    break
                            if arrow_tip:
                                break
            except Exception:
                continue

        if not arrow_tip or not tail_tip:
            continue

        # Kuyruk ucuna en yakin cap text'ini bul
        best_text: str | None = None
        best_dist = MAX_LEADER_TEXT_DISTANCE

        for dt in diameter_texts:
            dist = math.sqrt(
                (tail_tip.x - dt.position.x) ** 2 +
                (tail_tip.y - dt.position.y) ** 2
            )
            if dist < best_dist:
                best_dist = dist
                best_text = dt.value

        if best_text:
            # Ok ucunu rounded node'a cevir (edge node'lariyla eslesmesi icin)
            rounded_arrow = _round_point(arrow_tip.x, arrow_tip.y)
            leader_map[rounded_arrow] = best_text

    return leader_map


# ═══════════════════════════════════════════════════════
#  5. DIK MESAFE HESAPLAMA
# ═══════════════════════════════════════════════════════

def _perpendicular_distance(
    text_pos: Point,
    edge_start: Point,
    edge_end: Point,
) -> tuple[float, float]:
    """
    Text'in edge cizgisine dik mesafesi ve paralel konumu.

    Donus: (dik_mesafe, t_parametresi)
      - dik_mesafe: text'in edge'e en yakin mesafesi
      - t: 0.0 = edge baslangici, 1.0 = edge sonu, <0 veya >1 = disinda
    """
    dx = edge_end.x - edge_start.x
    dy = edge_end.y - edge_start.y
    len_sq = dx * dx + dy * dy

    if len_sq < 1e-10:
        # Dejenere edge (cok kisa)
        dist = math.sqrt(
            (text_pos.x - edge_start.x) ** 2 +
            (text_pos.y - edge_start.y) ** 2
        )
        return (dist, 0.0)

    # Parametrik projeksiyon: t = dot(text-start, edge) / |edge|^2
    t = ((text_pos.x - edge_start.x) * dx + (text_pos.y - edge_start.y) * dy) / len_sq

    # En yakin noktayi hesapla (t'yi [0,1] araligina clamp et)
    t_clamped = max(0.0, min(1.0, t))
    closest_x = edge_start.x + t_clamped * dx
    closest_y = edge_start.y + t_clamped * dy

    perp_dist = math.sqrt(
        (text_pos.x - closest_x) ** 2 +
        (text_pos.y - closest_y) ** 2
    )

    return (perp_dist, t)


def _find_edge_diameter(
    edge: Edge,
    diameter_texts: list[DiameterText],
    leader_map: dict[Point, str],
    max_perp: float = MAX_PERP_DISTANCE,
) -> str | None:
    """
    Bir edge'in cap'ini bul. Oncelik sirasi:
      1. LEADER ok ucu edge node'larinin yakinindaysa → o cap
      2. Edge'e dik mesafesi < max_perp olan en yakin text → o cap
      3. Hicbiri yoksa → None (miras alinacak)
    """
    # 1. LEADER kontrolu — ok ucu edge'in node'larina yakin mi?
    for arrow_point, diameter in leader_map.items():
        dist_a = math.sqrt(
            (arrow_point.x - edge.node_a.x) ** 2 +
            (arrow_point.y - edge.node_a.y) ** 2
        )
        dist_b = math.sqrt(
            (arrow_point.x - edge.node_b.x) ** 2 +
            (arrow_point.y - edge.node_b.y) ** 2
        )
        if min(dist_a, dist_b) < MAX_LEADER_ARROW_DISTANCE:
            return diameter

    # 2. Dik mesafe ile text ara
    best_diameter: str | None = None
    best_perp = max_perp

    for dt in diameter_texts:
        perp_dist, t = _perpendicular_distance(dt.position, edge.node_a, edge.node_b)

        # Text edge boyunca olmali (biraz toleransla)
        if t < -0.3 or t > 1.3:
            continue

        if perp_dist < best_perp:
            best_perp = perp_dist
            best_diameter = dt.value

    return best_diameter


# ═══════════════════════════════════════════════════════
#  6. PIPE-WALKER — BORU BOYUNCA YURU
# ═══════════════════════════════════════════════════════

def walk_pipe(
    adj: dict[Point, list[tuple[Point, Edge]]],
    start_node: Point,
    diameter_texts: list[DiameterText],
    leader_map: dict[Point, str],
    split_nodes: set[Point],
    visited: set[int],
    inherited_diameter: str | None = None,
) -> list[dict]:
    """
    Bir hat sonundan (veya tee'den) baslayip boru boyunca yurur.
    Dallanma noktalarinda segmenti kapatir, branch'lara recursive devam eder.

    Cap miras alma: edge'e cap atanamadiysa bir onceki edge'in cap'ini kullan.

    Donus: [{"length": float, "layer": str, "diameter": str, "line_count": int}]
    """
    segments: list[dict] = []

    current_node = start_node
    current_diameter = inherited_diameter
    segment_length = 0.0
    segment_line_count = 0
    segment_layer = ""

    while True:
        # Komsulari bul — ziyaret edilmemis edge'ler
        next_edges: list[tuple[Point, Edge]] = []
        for neighbor_node, edge in adj.get(current_node, []):
            if edge.idx not in visited:
                next_edges.append((neighbor_node, edge))

        if not next_edges:
            # Hat sonu — mevcut segmenti kapat
            break

        if len(next_edges) == 1 and current_node not in split_nodes:
            # Tek yol var, devam et (degree-2 node)
            neighbor_node, edge = next_edges[0]
            visited.add(edge.idx)

            # Bu edge'in cap'ini bul
            edge_diameter = _find_edge_diameter(edge, diameter_texts, leader_map)

            if edge_diameter:
                if current_diameter and edge_diameter != current_diameter and segment_length > 0:
                    # Cap degisti — onceki segmenti kapat
                    segments.append({
                        "length": segment_length,
                        "layer": segment_layer,
                        "diameter": current_diameter,
                        "line_count": segment_line_count,
                    })
                    segment_length = 0.0
                    segment_line_count = 0
                current_diameter = edge_diameter

            if not segment_layer:
                segment_layer = edge.layer

            segment_length += edge.length
            segment_line_count += 1
            current_node = neighbor_node

        elif current_node in split_nodes or len(next_edges) > 1:
            # Dallanma noktasi (tee) — mevcut segmenti kapat
            if segment_length > 0:
                segments.append({
                    "length": segment_length,
                    "layer": segment_layer,
                    "diameter": current_diameter or "Belirtilmemis",
                    "line_count": segment_line_count,
                })
                segment_length = 0.0
                segment_line_count = 0

            # Her branch'a recursive devam et
            for neighbor_node, edge in next_edges:
                if edge.idx in visited:
                    continue
                visited.add(edge.idx)

                # Branch'in ilk edge'ine cap ara
                edge_diameter = _find_edge_diameter(edge, diameter_texts, leader_map)
                branch_diameter = edge_diameter or current_diameter  # miras al

                if not segment_layer:
                    segment_layer = edge.layer

                # Bu branch edge'ini segment olarak baslat
                branch_segments = walk_pipe(
                    adj, neighbor_node, diameter_texts, leader_map,
                    split_nodes, visited,
                    inherited_diameter=branch_diameter,
                )

                # Branch'in ilk edge'ini dahil et
                if branch_segments:
                    # Ilk segment'e bu edge'in uzunlugunu ekle
                    branch_segments[0]["length"] += edge.length
                    branch_segments[0]["line_count"] += 1
                    if not branch_segments[0]["layer"]:
                        branch_segments[0]["layer"] = edge.layer
                else:
                    # Branch tek edge'lik
                    branch_segments = [{
                        "length": edge.length,
                        "layer": edge.layer,
                        "diameter": branch_diameter or "Belirtilmemis",
                        "line_count": 1,
                    }]

                segments.extend(branch_segments)

            break  # Tee'deki tum branch'lar islendi

        else:
            break

    # Son segmenti kapat
    if segment_length > 0:
        segments.append({
            "length": segment_length,
            "layer": segment_layer,
            "diameter": current_diameter or "Belirtilmemis",
            "line_count": segment_line_count,
        })

    return segments


# ═══════════════════════════════════════════════════════
#  7. ANA FONKSIYON
# ═══════════════════════════════════════════════════════

def analyze_topology(
    dxf_path: str,
    selected_layers: list[str] | None = None,
    scale: float = 0.001,
) -> tuple[list[PipeSegment], list[BranchPoint], list[str]]:
    """
    Pipe-Walker topoloji analizi:
      graph → dallanma → cap text'leri → LEADER eslestirme
      → pipe-walker (yuru, dik mesafe, miras) → merge → sonuc
    """
    warnings: list[str] = []

    # 1. Graph olustur
    edges = build_pipe_graph(dxf_path, selected_layers)
    if not edges:
        warnings.append("Secilen layer'larda hicbir boru cizgisi bulunamadi")
        return [], [], warnings

    # 2. Dallanma noktalarini bul
    bp_map = find_branch_points(edges)
    split_nodes = set(bp_map.keys())

    degree: dict[Point, int] = defaultdict(int)
    for e in edges:
        degree[e.node_a] += 1
        degree[e.node_b] += 1

    branch_points = [
        BranchPoint(
            x=round(pt.x, 1), y=round(pt.y, 1),
            connections=degree[pt], point_type=ptype,
        )
        for pt, ptype in bp_map.items()
    ]

    tee_count = sum(1 for bp in branch_points if bp.point_type == "tee")
    end_count = sum(1 for bp in branch_points if bp.point_type == "end")

    # 3. Cap text'lerini cikar (ekipman filtreli)
    diameter_texts = extract_diameters(dxf_path)
    if not diameter_texts:
        warnings.append("Hicbir cap text'i bulunamadi")

    # 4. LEADER ok→cap eslestirme
    leader_map = extract_leader_diameters(dxf_path, diameter_texts)
    if leader_map:
        warnings.append(f"{len(leader_map)} LEADER ok eslestirmesi bulundu")

    # 5. Adjacency list olustur
    adj: dict[Point, list[tuple[Point, Edge]]] = defaultdict(list)
    for edge in edges:
        adj[edge.node_a].append((edge.node_b, edge))
        adj[edge.node_b].append((edge.node_a, edge))

    # 6. Pipe-Walker: cap text'ine yakin node'lardan baslayarak yuru
    #    Bu sayede cap bilgisi olan yerden baslanir ve miras ile yayilir
    visited: set[int] = set()
    raw_segments: list[dict] = []

    # Oncelik 1: Cap text'ine en yakin end node'lardan basla
    end_nodes = [pt for pt, ptype in bp_map.items() if ptype == "end"]

    # End node'lari cap text'ine yakinligina gore sirala
    def _min_text_distance(node: Point) -> float:
        if not diameter_texts:
            return 999999.0
        return min(
            math.sqrt((node.x - dt.position.x) ** 2 + (node.y - dt.position.y) ** 2)
            for dt in diameter_texts
        )

    end_nodes.sort(key=_min_text_distance)

    for start_node in end_nodes:
        if all(e.idx in visited for _, e in adj.get(start_node, [])):
            continue
        segs = walk_pipe(adj, start_node, diameter_texts, leader_map, split_nodes, visited)
        raw_segments.extend(segs)

    # Oncelik 2: Tee node'lardan baslayarak kalan edge'leri isle
    tee_nodes = [pt for pt, ptype in bp_map.items() if ptype == "tee"]
    for start_node in tee_nodes:
        remaining = [(n, e) for n, e in adj.get(start_node, []) if e.idx not in visited]
        if not remaining:
            continue
        segs = walk_pipe(adj, start_node, diameter_texts, leader_map, split_nodes, visited)
        raw_segments.extend(segs)

    # Ziyaret edilmemis edge'ler varsa (donguler/loop'lar)
    for edge in edges:
        if edge.idx not in visited:
            visited.add(edge.idx)
            edge_diameter = _find_edge_diameter(edge, diameter_texts, leader_map)
            segs = walk_pipe(
                adj, edge.node_b, diameter_texts, leader_map,
                split_nodes, visited,
                inherited_diameter=edge_diameter,
            )
            # Bu edge'i dahil et
            raw_segments.append({
                "length": edge.length,
                "layer": edge.layer,
                "diameter": edge_diameter or "Belirtilmemis",
                "line_count": 1,
            })
            raw_segments.extend(segs)

    # 7. Ayni layer + ayni cap olan segment'leri birlestir
    merged: dict[tuple[str, str], dict] = {}
    for seg in raw_segments:
        if seg["length"] <= 0:
            continue
        key = (seg["layer"], seg["diameter"])
        if key not in merged:
            merged[key] = {"length": 0.0, "line_count": 0}
        merged[key]["length"] += seg["length"]
        merged[key]["line_count"] += seg["line_count"]

    pipe_segments: list[PipeSegment] = []
    seg_id = 0
    for (layer, diameter), data in sorted(merged.items()):
        seg_id += 1
        pipe_segments.append(PipeSegment(
            segment_id=seg_id,
            layer=layer,
            diameter=diameter,
            length=round(data["length"] * scale, 2),
            line_count=data["line_count"],
        ))

    # Ozet
    total_length = sum(s.length for s in pipe_segments)
    unmatched_length = sum(s.length for s in pipe_segments if s.diameter == "Belirtilmemis")
    if unmatched_length > 0 and diameter_texts:
        pct = round(unmatched_length / total_length * 100) if total_length > 0 else 0
        warnings.append(f"Toplam {total_length:.1f}m'nin {unmatched_length:.1f}m'sine ({pct}%) cap atanamadi")

    warnings.append(
        f"Topoloji: {len(edges)} edge, {tee_count} tee, {end_count} hat sonu, "
        f"{len(raw_segments)} ham segment -> {len(pipe_segments)} birlesik, "
        f"{len(diameter_texts)} cap text, {len(leader_map)} leader"
    )

    return pipe_segments, branch_points, warnings
