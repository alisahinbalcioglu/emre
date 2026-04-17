"""
topology.py — Orkestratör + Pipe Walker

graph.py, diameter.py, arrows.py'yi birleştirip çap yayma (walker) yapar.
Walker: edge-by-edge yürür, tee'de dallanır, çap miras alır.
"""

import math
import re
from collections import defaultdict

from graph import Point, Edge, PipeGraph, build_graph
from diameter import DiameterText, extract_diameters, detect_pipe_type
from models import PipeSegment, BranchPoint

# Pis su icin gecersiz caplar (kesinlikle olmaz)
PISSU_INVALID_CAPS = {"Ø25", "Ø32", "Ø40", "Ø63"}

# ─────────────────────────────────────────────────────────
# Akıllı cap layer eşleştirme (hat-specific vs shared mode)
# ─────────────────────────────────────────────────────────

_TR_TOKEN_NORM = str.maketrans(
    "ığçşöüâîûİÇŞĞÖÜ",
    "igcsouaiuIcsgou",
)
_CAP_KEYWORDS = ('cap', 'çap', 'dim', 'diameter', 'anno', 'text')
_CAP_TOKENS = {'cap', 'dim', 'diameter', 'anno', 'text', 'dimension'}
_STOPWORDS = {'a', 've', 'ile', 'ana', 'hat', 'the', 'of', 'system'}


def _tokenize_layer(name: str) -> set[str]:
    """Layer adını Türkçe-friendly token'lara ayır."""
    s = name.lower().translate(_TR_TOKEN_NORM).lower()
    tokens = re.findall(r'[a-z0-9]+', s)
    return {t for t in tokens if t not in _STOPWORDS and len(t) >= 2}


def _is_cap_layer(layer_name: str) -> bool:
    low = layer_name.lower()
    return any(kw in low for kw in _CAP_KEYWORDS)


def _classify_cap_layers(
    all_cap_layers: list[str],
    all_pipe_layers: list[str],
) -> tuple[dict[str, list[str]], list[str]]:
    """Her cap layer'ın hangi pipe layer'larına hitap ettiğini belirle.

    Returns:
      pipe_to_specific_caps: {pipe_layer: [sadece-ona-ait cap layer'lar]}
      shared_caps: birden fazla pipe'a hitap eden cap layer'lar
    """
    cap_to_pipes: dict[str, list[str]] = {}
    for cap in all_cap_layers:
        cap_toks = _tokenize_layer(cap) - _CAP_TOKENS
        if not cap_toks:
            cap_to_pipes[cap] = []
            continue
        matches = []
        for pipe in all_pipe_layers:
            pipe_toks = _tokenize_layer(pipe)
            if cap_toks & pipe_toks:
                matches.append(pipe)
        cap_to_pipes[cap] = matches

    pipe_to_specific: dict[str, list[str]] = {p: [] for p in all_pipe_layers}
    shared: list[str] = []
    for cap, pipes in cap_to_pipes.items():
        if len(pipes) == 1:
            pipe_to_specific[pipes[0]].append(cap)
        elif len(pipes) >= 2:
            shared.append(cap)
    return pipe_to_specific, shared


def _resolve_cap_layers_for(
    pipe_layer: str,
    all_layers: list[str],
) -> list[str] | None:
    """Seçilen pipe layer için cap layer havuzu çöz.

    Returns:
      list[str] → hat-specific mode (sadece bu cap'lerden text al)
      None     → shared mode (tüm layer'lardan, geometrik eşleşme)
    """
    all_cap = [l for l in all_layers if _is_cap_layer(l)]
    all_pipe = [l for l in all_layers if not _is_cap_layer(l)]

    pipe_to_specific, _shared = _classify_cap_layers(all_cap, all_pipe)
    specific = pipe_to_specific.get(pipe_layer, [])

    if specific:
        # MOD A: hat-specific — sadece kendi cap'i + pipe layer'ın kendisi
        # (pipe layer'da yazılı text'ler olabilir)
        return list(dict.fromkeys(specific + [pipe_layer]))
    return None  # MOD B: shared


def walk_and_propagate(
    graph: PipeGraph,
    edge_diameters: dict[int, str],
    edge_distances: dict[int, float] | None = None,
    edge_sources: dict[int, str] | None = None,
) -> list[dict]:
    """
    Pipe-Walker: boru ağında yürür, çap yayar.

    edge_diameters: {edge_idx: çap} — ok veya text'ten gelen kesin çaplar.
    edge_distances: {edge_idx: mesafe} — eslestirme mesafesi (guvenilirlik).
    edge_sources: {edge_idx: kaynak} — "arrow"/"text"/"walker" takibi.
    Diğer edge'ler komşudan miras alır (tee'ye kadar).
    Tee yoksa + uzak text ise miras korunur (devam eden boru ayni captir).
    """
    _dists = edge_distances or {}
    _sources = edge_sources if edge_sources is not None else {}
    adj = graph.adj
    split_nodes = graph.tees
    visited: set[int] = set()
    raw_segments: list[dict] = []

    def _walk(
        start_node: Point,
        inherited_diameter: str | None = None,
        prev_node: Point | None = None,
    ) -> list[dict]:
        """Bir hat sonundan veya tee'den başlayıp yürür."""
        segments: list[dict] = []
        current_node = start_node
        current_diameter = inherited_diameter
        seg_length = 0.0
        seg_lines = 0
        seg_layer = ""

        while True:
            next_edges = [
                (n, e) for n, e in adj.get(current_node, [])
                if e.idx not in visited
            ]

            if not next_edges:
                break

            if len(next_edges) == 1 and current_node not in split_nodes:
                # Düz devam (degree-2 node)
                neighbor, edge = next_edges[0]
                visited.add(edge.idx)

                # Layer değiştiyse segmenti kapat, çap mirası YAPMA
                if seg_layer and edge.layer != seg_layer:
                    if seg_length > 0:
                        segments.append({
                            "length": seg_length,
                            "layer": seg_layer,
                            "diameter": current_diameter or "Belirtilmemis",
                            "line_count": seg_lines,
                        })
                        seg_length = 0.0
                        seg_lines = 0
                    current_diameter = edge_diameters.get(edge.idx)
                    seg_layer = edge.layer
                else:
                    # Aynı layer, tee yok → cap DEGISMEZ
                    # Ilk cap atandiginda current_diameter set edilir
                    # Sonraki edge'ler farkli cap gosterse bile miras korunur
                    edge_diam = edge_diameters.get(edge.idx)
                    if not current_diameter and edge_diam:
                        # Henuz cap atanmamis — ilk cap'i al
                        current_diameter = edge_diam
                    elif current_diameter and not edge_diam:
                        # Miras: bu edge'e walker cap'i yay
                        if edge.idx not in _sources:
                            _sources[edge.idx] = "walker"

                    if not seg_layer:
                        seg_layer = edge.layer

                seg_length += edge.length
                seg_lines += 1
                prev_node = current_node
                current_node = neighbor

            elif current_node in split_nodes or len(next_edges) > 1:
                # Tee / dallanma
                if seg_length > 0:
                    segments.append({
                        "length": seg_length,
                        "layer": seg_layer,
                        "diameter": current_diameter or "Belirtilmemis",
                        "line_count": seg_lines,
                    })
                    seg_length = 0.0
                    seg_lines = 0

                # Gelen yönü hesapla (son edge'in yönü)
                ref = prev_node if prev_node else start_node
                inc_dx = current_node.x - ref.x
                inc_dy = current_node.y - ref.y
                inc_len = math.sqrt(inc_dx ** 2 + inc_dy ** 2)

                # Devam eden hat = gelen yönle aynı doğrultu (< 45°)
                continuation_idx = -1
                best_align = -1.0

                available = []
                for i, (neighbor, edge) in enumerate(next_edges):
                    if edge.idx in visited:
                        continue
                    available.append((i, neighbor, edge))

                    if inc_len > 1.0:
                        e_dx = neighbor.x - current_node.x
                        e_dy = neighbor.y - current_node.y
                        e_len = math.sqrt(e_dx ** 2 + e_dy ** 2)
                        if e_len > 1.0:
                            cos_a = (inc_dx * e_dx + inc_dy * e_dy) / (inc_len * e_len)
                            if cos_a > best_align:
                                best_align = cos_a
                                continuation_idx = i

                is_cont = best_align > 0.7

                for i, neighbor, edge in available:
                    visited.add(edge.idx)
                    edge_diam = edge_diameters.get(edge.idx)

                    if is_cont and i == continuation_idx and edge.layer == seg_layer:
                        # Ayni layer + duz devam -> cap miras
                        branch_diam = edge_diam or current_diameter
                        # Walker miras kaynagi isaretle
                        if not edge_diam and current_diameter and edge.idx not in _sources:
                            _sources[edge.idx] = "walker"
                    else:
                        # Farkli layer veya branch -> miras YAPMA
                        branch_diam = edge_diam

                    if not seg_layer:
                        seg_layer = edge.layer

                    sub = _walk(neighbor, inherited_diameter=branch_diam, prev_node=current_node)

                    if sub:
                        sub[0]["length"] += edge.length
                        sub[0]["line_count"] += 1
                        if not sub[0]["layer"]:
                            sub[0]["layer"] = edge.layer
                    else:
                        sub = [{
                            "length": edge.length,
                            "layer": edge.layer,
                            "diameter": branch_diam or "Belirtilmemis",
                            "line_count": 1,
                        }]

                    segments.extend(sub)
                break
            else:
                break

        # Son segmenti kapat
        if seg_length > 0:
            segments.append({
                "length": seg_length,
                "layer": seg_layer,
                "diameter": current_diameter or "Belirtilmemis",
                "line_count": seg_lines,
            })

        return segments

    # Çap bilgisi olan edge'lere yakın end node'lardan başla
    end_nodes = list(graph.ends)

    def _has_diameter_nearby(node: Point) -> bool:
        for n, e in adj.get(node, []):
            if e.idx in edge_diameters:
                return True
        return False

    # Öncelik: çap bilgisi olan end node'lar
    end_nodes.sort(key=lambda n: (0 if _has_diameter_nearby(n) else 1))

    for sn in end_nodes:
        if all(e.idx in visited for _, e in adj.get(sn, [])):
            continue
        segs = _walk(sn)
        raw_segments.extend(segs)

    # Tee node'lardan kalan edge'ler
    for sn in graph.tees:
        remaining = [(n, e) for n, e in adj.get(sn, []) if e.idx not in visited]
        if not remaining:
            continue
        segs = _walk(sn)
        raw_segments.extend(segs)

    # Loop/döngü edge'leri
    for edge in graph.edges:
        if edge.idx not in visited:
            visited.add(edge.idx)
            ed = edge_diameters.get(edge.idx)
            raw_segments.append({
                "length": edge.length,
                "layer": edge.layer,
                "diameter": ed or "Belirtilmemis",
                "line_count": 1,
            })
            sub = _walk(edge.node_b, inherited_diameter=ed, prev_node=edge.node_a)
            raw_segments.extend(sub)

    return raw_segments


def _backfill(raw_segments: list[dict], layer_pipe_types: dict[str, str] | None = None) -> None:
    """Layer bazlı dominant çap ile kısa Belirtilmemiş segmentleri doldur.
    Format kontrolü: dominant çap layer'ın pipe_type'ıyla uyumlu olmalı."""
    layer_diameters: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    layer_lengths: dict[str, list[float]] = defaultdict(list)

    for seg in raw_segments:
        layer = seg["layer"]
        d = seg["diameter"]
        length = seg["length"]
        if length <= 0:
            continue
        layer_lengths[layer].append(length)
        if d and d != "Belirtilmemis":
            layer_diameters[layer][d] += length

    layer_dominant: dict[str, str] = {}
    layer_avg: dict[str, float] = {}
    for layer, dmap in layer_diameters.items():
        if dmap:
            layer_dominant[layer] = max(dmap, key=dmap.get)
        lengths = layer_lengths.get(layer, [])
        if lengths:
            layer_avg[layer] = sum(lengths) / len(lengths)

    for seg in raw_segments:
        if seg["diameter"] != "Belirtilmemis":
            continue
        layer = seg["layer"]
        dominant = layer_dominant.get(layer)
        if not dominant:
            continue
        avg = layer_avg.get(layer, 0)
        if avg > 0 and seg["length"] <= avg * 1.5:
            seg["diameter"] = dominant


def merge_segments(raw_segments: list[dict], scale: float) -> list[PipeSegment]:
    """Aynı layer + çap segmentlerini birleştir."""
    merged: dict[tuple[str, str], dict] = {}
    for seg in raw_segments:
        if seg["length"] <= 0:
            continue
        key = (seg["layer"], seg["diameter"])
        if key not in merged:
            merged[key] = {"length": 0.0, "line_count": 0}
        merged[key]["length"] += seg["length"]
        merged[key]["line_count"] += seg["line_count"]

    result: list[PipeSegment] = []
    sid = 0
    for (layer, diameter), data in sorted(merged.items()):
        sid += 1
        result.append(PipeSegment(
            segment_id=sid,
            layer=layer,
            diameter=diameter,
            length=round(data["length"] * scale, 2),
            line_count=data["line_count"],
            material_type="",
        ))
    return result


def analyze_topology(
    dxf_path: str,
    selected_layers: list[str] | None = None,
    scale: float = 0.001,
    material_type_map: dict[str, str] | None = None,
    cap_layers: list[str] | None = None,
    hat_tipi_map: dict[str, str] | None = None,
) -> tuple[list[PipeSegment], list[BranchPoint], list[str]]:
    """
    Ana orkestratör. Eski API ile uyumlu.

    cap_layers: Çap layer'ları. None ise otomatik tespit (layer adında "cap" geçenler).
    """
    warnings: list[str] = []

    if not selected_layers:
        return [], [], ["Boru layer'ları seçilmedi"], []

    # Her layer'i kendi pipe_type'iyla AYRI analiz et, sonuclari birlestir.
    # Birlikte analiz edilince graph birlesir, edge idx'ler degisir,
    # ok eslesmesi bozulur ve caplar yanlis layer'a sizdirilir.
    if len(selected_layers) > 1:
        all_segs: list[PipeSegment] = []
        all_bps: list[BranchPoint] = []
        all_warns: list[str] = []
        all_edges: list[PipeSegment] = []

        for layer in selected_layers:
            result = analyze_topology(
                dxf_path, [layer], scale, material_type_map, cap_layers,
                hat_tipi_map=hat_tipi_map,
            )
            all_segs.extend(result[0])
            all_bps.extend(result[1])
            all_warns.extend(result[2])
            if len(result) > 3:
                all_edges.extend(result[3])

        return all_segs, all_bps, all_warns, all_edges

    # Tek layer analizi
    # 1. Boru ağı
    graph = build_graph(dxf_path, selected_layers)
    if not graph.edges:
        return [], [], ["Seçilen layer'larda boru bulunamadı"], []

    warnings.append(
        f"Topoloji: {len(graph.edges)} edge, {len(graph.tees)} tee, {len(graph.ends)} hat sonu"
    )

    # BranchPoint listesi (uyumluluk için)
    degree: dict[Point, int] = defaultdict(int)
    for e in graph.edges:
        degree[e.node_a] += 1
        degree[e.node_b] += 1

    branch_points = []
    for pt in graph.tees:
        branch_points.append(BranchPoint(
            x=round(pt.x, 1), y=round(pt.y, 1),
            connections=degree[pt], point_type="tee",
        ))
    for pt in graph.ends:
        branch_points.append(BranchPoint(
            x=round(pt.x, 1), y=round(pt.y, 1),
            connections=degree[pt], point_type="end",
        ))

    # 2. Akıllı cap layer seçimi (hat-specific vs shared)
    #    - Her hat için ayrı cap layer varsa (temizsu_cap, pissu_cap) → sadece o cap kullanılır
    #    - Tek ortak cap layer varsa → tüm layer'lardan (geometrik eşleşme)
    if cap_layers is None:
        import ezdxf as _ezdxf_cap
        _doc_cap = _ezdxf_cap.readfile(dxf_path)
        _all_layers = list({e.dxf.layer for e in _doc_cap.modelspace() if hasattr(e.dxf, 'layer')})
        resolved = _resolve_cap_layers_for(selected_layers[0], _all_layers)
        if resolved is not None:
            cap_layers = resolved
            warnings.append(f"Hat-specific cap: {resolved}")
        else:
            warnings.append("Shared cap — tüm layer'lardan (geometrik)")

    # Pipe type'i once belirle (cross-system filtresi icin gerekli)
    from diameter_assigner import assign_diameters

    _hat_map = hat_tipi_map or {}

    def _resolve_pipe_type(layer_name: str) -> str:
        ht = _hat_map.get(layer_name, "").lower()
        if ht:
            if any(kw in ht for kw in ['pis', 'atik', 'yagmur', 'yamur', 'yağmur']):
                return "metric"
            if any(kw in ht for kw in ['temiz', 'gri', 'sicak', 'sıcak', 'sprinkler', 'dolap']):
                return "imperial"
            if 'hidrant' in ht:
                return "all"
        return detect_pipe_type(layer_name)

    layer = selected_layers[0]
    pipe_type = _resolve_pipe_type(layer)

    # 3. Diger boru layer'larinin koordinatlari (cross-system check icin)
    #    Sadece AYNI format'taki noise layer'lar dikkate alinir.
    #    imperial layer icin metric (pis/yagmur) noise filtrelenir (format uyusmaz).
    import ezdxf as _ezdxf
    _doc = _ezdxf.readfile(dxf_path)
    _all_dxf_layers = set()
    for _ent in _doc.modelspace():
        if hasattr(_ent.dxf, 'layer'):
            _all_dxf_layers.add(_ent.dxf.layer)
    _pipe_keywords = ['sihhi', 'su', 'yangin', 'temiz', 'pis', 'gri', 'yagmur']
    _sel_set = set(selected_layers)
    other_pipe_layers = []
    for l in _all_dxf_layers:
        if l in _sel_set or 'cap' in l.lower():
            continue
        if not any(kw in l.lower() for kw in _pipe_keywords):
            continue
        # Format uyumu kontrolu: farkli format layer'lari cross-system'e dahil etme
        other_pt = _resolve_pipe_type(l)
        if pipe_type == "imperial" and other_pt == "metric":
            continue  # temiz su icin pissu/yagmur noise degil
        if pipe_type == "metric" and other_pt == "imperial":
            continue  # pissu icin temiz su noise degil
        other_pipe_layers.append(l)
    other_raw: list[tuple] = []
    if other_pipe_layers:
        _other_graph = build_graph(dxf_path, other_pipe_layers)
        _offset = 100000
        other_raw = [(rc[0] + _offset, rc[1], rc[2], rc[3], rc[4])
                     for rc in _other_graph.raw_coords]

    # 4. Çap atama — diameter_assigner.py (5 kural harfiyen)

    edge_caps, edge_sources, edge_dists, assign_warnings = assign_diameters(
        dxf_path, graph, pipe_type, layer, cap_layers, other_pipes=other_raw,
    )
    warnings.extend(assign_warnings)

    # ── Edge final çapları ──
    edge_final_diameters: dict[int, str] = {}
    for e in graph.edges:
        edge_final_diameters[e.idx] = edge_caps.get(e.idx, "Belirtilmemis")

    # ── Malzeme tipi ──
    _mat_map = material_type_map or {}

    # ── Merge segments (metraj tablosu için) ──
    raw_segments_for_merge: list[dict] = []
    for e in graph.edges:
        raw_segments_for_merge.append({
            "length": e.length,
            "layer": e.layer,
            "diameter": edge_final_diameters[e.idx],
            "line_count": 1,
            "material_type": _mat_map.get(e.layer, ""),
        })

    merged_segments = merge_segments(raw_segments_for_merge, scale)

    # ── Edge-bazlı segment listesi (PipeMapViewer için) ──
    raw_coords_map = {rc[0]: [round(rc[1], 1), round(rc[2], 1),
                              round(rc[3], 1), round(rc[4], 1)]
                      for rc in graph.raw_coords}

    edge_segments: list[PipeSegment] = []
    for e in graph.edges:
        coord = raw_coords_map.get(e.idx)
        if not coord:
            continue
        edge_segments.append(PipeSegment(
            segment_id=e.idx,
            layer=e.layer,
            diameter=edge_final_diameters[e.idx],
            length=round(e.length * scale, 2),
            line_count=1,
            material_type=_mat_map.get(e.layer, ""),
            coords=[coord],
        ))

    # merged_segments'e coords ekle
    for ps in merged_segments:
        coords = []
        for e in graph.edges:
            if e.layer == ps.layer and edge_final_diameters.get(e.idx) == ps.diameter:
                if e.idx in raw_coords_map:
                    coords.append(raw_coords_map[e.idx])
        ps.coords = coords

    # Özet
    total = sum(s.length for s in merged_segments)
    unmatched = sum(s.length for s in merged_segments if s.diameter == "Belirtilmemis")
    if unmatched > 0:
        pct = round(unmatched / total * 100) if total > 0 else 0
        warnings.append(f"Belirtilmemiş: {unmatched:.1f}m ({pct}%)")

    return merged_segments, branch_points, warnings, edge_segments
