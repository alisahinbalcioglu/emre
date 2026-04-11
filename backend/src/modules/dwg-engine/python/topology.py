"""
Topoloji Analizi — Boru graph'i, dallanma, segment ayirma, cap eslestirme.

Faz 2: Tek layer'daki boruları dallanma noktalarından segmentlere ayırır,
her segment'e en yakın çap text'ini atar.

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
#  VERİ YAPILARI
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
        self.idx = idx  # benzersiz edge indeksi


class DiameterText(NamedTuple):
    value: str          # "Ø200", "DN150", "2\"" vb.
    position: Point     # text pozisyonu


# Tolerans: bu kadar yakin uclar ayni nokta sayilir
NODE_TOLERANCE = 5.0

# Cap text'inin segment'e atanabilecegi maksimum mesafe
MAX_DIAMETER_DISTANCE = 2000.0


# ═══════════════════════════════════════════════════════
#  1. GRAPH OLUSTURMA
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
    edge listesi olusturur. Her edge benzersiz idx'e sahiptir.
    """
    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()
    edges: list[Edge] = []
    edge_idx = 0

    def _should_include(layer: str) -> bool:
        if selected_layers is None:
            return True
        return layer in selected_layers

    # LINE entity'leri
    for entity in msp.query('LINE'):
        layer = entity.dxf.layer
        if not _should_include(layer):
            continue

        start = entity.dxf.start
        end = entity.dxf.end
        length = math.sqrt(
            (end.x - start.x) ** 2 + (end.y - start.y) ** 2
        )
        if length < 10.0:
            continue

        node_a = _round_point(start.x, start.y)
        node_b = _round_point(end.x, end.y)
        if node_a == node_b:
            continue

        edges.append(Edge(node_a, node_b, length, layer, edge_idx))
        edge_idx += 1

    # LWPOLYLINE entity'leri — her vertex arasi ayri edge
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

    # POLYLINE entity'leri
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
#  2. DALLANMA NOKTALARI
# ═══════════════════════════════════════════════════════

def find_branch_points(edges: list[Edge]) -> dict[Point, str]:
    """
    Her node'a kac edge baglandigini hesapla.
    3+ → tee, 1 → hat sonu.
    Degree 2 → devam noktasi (dallanma degil, segment kesmez).
    """
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
#  3. SEGMENT AYIRMA
# ═══════════════════════════════════════════════════════

def split_into_segments(
    edges: list[Edge],
    branch_points: dict[Point, str],
) -> list[dict]:
    """
    Graph'i dallanma noktalarindan (tee) ve hat sonlarindan (end)
    keserek segmentlere ayirir.

    Algoritma: Her edge'den baslayarak, ayni layer'daki komsu edge'leri
    degree-2 node'lardan gecip topla. Tee veya end node'larda dur.

    Her segment: ardisik edge'lerin birlesimi — ayni cap'ta oldugu
    varsayilan boru parcasi.
    """
    if not edges:
        return []

    # Adjacency list: node → [(komu_node, edge)]
    adj: dict[Point, list[tuple[Point, Edge]]] = defaultdict(list)
    for edge in edges:
        adj[edge.node_a].append((edge.node_b, edge))
        adj[edge.node_b].append((edge.node_a, edge))

    visited: set[int] = set()  # ziyaret edilen edge idx'leri
    segments: list[dict] = []

    # Dallanma/sonlanma noktalari
    split_nodes = set(branch_points.keys())

    for edge in edges:
        if edge.idx in visited:
            continue

        # Bu edge'den baslayarak segment olustur
        visited.add(edge.idx)
        segment_edges: list[Edge] = [edge]
        layer = edge.layer

        # Iki yonde genislet
        for direction_start in [edge.node_a, edge.node_b]:
            current_node = direction_start
            while True:
                # Bu node bir kesilme noktasi mi (tee veya end)?
                if current_node in split_nodes:
                    break

                # Komsu edge'ler arasinda ziyaret edilmemis, ayni layer olanı bul
                found_next = False
                for neighbor_node, neighbor_edge in adj[current_node]:
                    if neighbor_edge.idx in visited:
                        continue
                    if neighbor_edge.layer != layer:
                        continue

                    # Bu edge'i segment'e ekle
                    visited.add(neighbor_edge.idx)
                    segment_edges.append(neighbor_edge)
                    current_node = neighbor_node
                    found_next = True
                    break

                if not found_next:
                    break

        # Segment bilgilerini hesapla
        total_length = sum(e.length for e in segment_edges)

        # Orta noktayi hesapla (cap text eslestirme icin)
        all_x: list[float] = []
        all_y: list[float] = []
        for e in segment_edges:
            all_x.append(e.node_a.x)
            all_x.append(e.node_b.x)
            all_y.append(e.node_a.y)
            all_y.append(e.node_b.y)
        midpoint = Point(sum(all_x) / len(all_x), sum(all_y) / len(all_y))

        segments.append({
            "length": total_length,
            "layer": layer,
            "midpoint": midpoint,
            "line_count": len(segment_edges),
        })

    return segments


# ═══════════════════════════════════════════════════════
#  4. CAP TEXT CIKARMA
# ═══════════════════════════════════════════════════════

# Cap regex pattern'leri — oncelik sirasina gore
_DIAMETER_PATTERNS = [
    # Ø200, Ø63, Ø125 (unicode veya latin harfler)
    (re.compile(r'[ØøÖö]\s*(\d+)', re.IGNORECASE), lambda m: f"Ø{m.group(1)}"),
    # DN150, DN50
    (re.compile(r'DN\s*(\d+)', re.IGNORECASE), lambda m: f"DN{m.group(1)}"),
    # 2½", 1¼", 6" (unicode kesirler)
    (re.compile(r'(\d+)\s*½\s*["\u2033]'), lambda m: f'{m.group(1)}½"'),
    (re.compile(r'(\d+)\s*¼\s*["\u2033]'), lambda m: f'{m.group(1)}¼"'),
    (re.compile(r'(\d+)\s*¾\s*["\u2033]'), lambda m: f'{m.group(1)}¾"'),
    # 1 1/2", 3/4", 1 1/4" (slash kesirler)
    (re.compile(r'(\d+)\s+(\d+/\d+)\s*["\u2033]'), lambda m: f'{m.group(1)} {m.group(2)}"'),
    (re.compile(r'(\d+/\d+)\s*["\u2033]'), lambda m: f'{m.group(1)}"'),
    # 2", 6" (tam sayi inc)
    (re.compile(r'(?<!\d)(\d+)\s*["\u2033]'), lambda m: f'{m.group(1)}"'),
]


def _parse_diameter(text: str) -> str | None:
    """Text'ten cap bilgisi cikar. Donus: normalize edilmis cap string'i veya None."""
    for pattern, formatter in _DIAMETER_PATTERNS:
        match = pattern.search(text)
        if match:
            return formatter(match)
    return None


def extract_diameters(dxf_path: str) -> list[DiameterText]:
    """
    DXF dosyasindaki TUM TEXT/MTEXT entity'lerinden cap bilgisi cikarir.
    Tum layer'lar taranir — cap text'i farkli layer'da olabilir.
    """
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
#  5. CAP ATAMA
# ═══════════════════════════════════════════════════════

def assign_diameters(
    segments: list[dict],
    diameter_texts: list[DiameterText],
    max_distance: float | None = None,
) -> None:
    """
    Her segment'in orta noktasina en yakin cap text'ini atar.
    Segment dict'ine "diameter" key'i ekler.

    max_distance: None ise otomatik hesaplanir (cizim alaninin %20'si).
    """
    if not diameter_texts:
        for segment in segments:
            segment["diameter"] = "Belirtilmemis"
        return

    # Otomatik max_distance: cizim alaninin %20'si
    if max_distance is None:
        all_x = [s["midpoint"].x for s in segments] + [dt.position.x for dt in diameter_texts]
        all_y = [s["midpoint"].y for s in segments] + [dt.position.y for dt in diameter_texts]
        if all_x and all_y:
            diag = math.sqrt(
                (max(all_x) - min(all_x)) ** 2 +
                (max(all_y) - min(all_y)) ** 2
            )
            max_distance = max(diag * 0.20, MAX_DIAMETER_DISTANCE)
        else:
            max_distance = MAX_DIAMETER_DISTANCE

    for segment in segments:
        midpoint = segment["midpoint"]
        best_diameter = "Belirtilmemis"
        best_distance = max_distance

        for dt in diameter_texts:
            dist = math.sqrt(
                (midpoint.x - dt.position.x) ** 2 +
                (midpoint.y - dt.position.y) ** 2
            )
            if dist < best_distance:
                best_distance = dist
                best_diameter = dt.value

        segment["diameter"] = best_diameter


# ═══════════════════════════════════════════════════════
#  6. ANA FONKSIYON
# ═══════════════════════════════════════════════════════

def analyze_topology(
    dxf_path: str,
    selected_layers: list[str] | None = None,
    scale: float = 0.001,
) -> tuple[list[PipeSegment], list[BranchPoint], list[str]]:
    """
    Tam topoloji analizi: graph → dallanma → segment → cap eslestirme.

    Donus: (segments, branch_points, warnings)
    """
    warnings: list[str] = []

    # 1. Graph olustur
    edges = build_pipe_graph(dxf_path, selected_layers)
    if not edges:
        warnings.append("Secilen layer'larda hicbir boru cizgisi bulunamadi")
        return [], [], warnings

    # 2. Dallanma noktalarini bul
    bp_map = find_branch_points(edges)

    # Degree hesapla (branch_point icin connections)
    degree: dict[Point, int] = defaultdict(int)
    for e in edges:
        degree[e.node_a] += 1
        degree[e.node_b] += 1

    branch_points = [
        BranchPoint(
            x=round(pt.x, 1),
            y=round(pt.y, 1),
            connections=degree[pt],
            point_type=ptype,
        )
        for pt, ptype in bp_map.items()
    ]

    tee_count = sum(1 for bp in branch_points if bp.point_type == "tee")
    end_count = sum(1 for bp in branch_points if bp.point_type == "end")

    # 3. Segmentlere ayir
    raw_segments = split_into_segments(edges, bp_map)
    if not raw_segments:
        warnings.append("Segment ayirma basarisiz")
        return [], branch_points, warnings

    # 4. Cap text'lerini cikar
    diameter_texts = extract_diameters(dxf_path)
    if not diameter_texts:
        warnings.append("Hicbir cap text'i bulunamadi — tum segmentler 'Belirtilmemis' olarak isaretlendi")

    # 5. Cap ata
    assign_diameters(raw_segments, diameter_texts)

    # 6. Ayni layer + ayni cap olan segmentleri birlestir
    # (kullanicinin gorecegi nihai sonuc)
    merged: dict[tuple[str, str], dict] = {}
    for seg in raw_segments:
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
            length=round(data["length"] * scale, 2),  # birimden metreye
            line_count=data["line_count"],
        ))

    # Ozet bilgi
    unmatched_length = sum(
        s.length for s in pipe_segments if s.diameter == "Belirtilmemis"
    )
    total_length = sum(s.length for s in pipe_segments)
    if unmatched_length > 0 and diameter_texts:
        pct = round(unmatched_length / total_length * 100) if total_length > 0 else 0
        warnings.append(
            f"Toplam {total_length:.1f}m'nin {unmatched_length:.1f}m'sine ({pct}%) cap atanamadi"
        )

    warnings.append(
        f"Topoloji: {len(edges)} edge, {tee_count} tee, {end_count} hat sonu, "
        f"{len(raw_segments)} ham segment → {len(pipe_segments)} birlesik segment, "
        f"{len(diameter_texts)} cap text'i"
    )

    return pipe_segments, branch_points, warnings
