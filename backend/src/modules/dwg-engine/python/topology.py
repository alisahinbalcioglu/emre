"""
topology.py — Orkestratör + Pipe Walker

graph.py, diameter.py, arrows.py'yi birleştirip çap yayma (walker) yapar.
Walker: edge-by-edge yürür, tee'de dallanır, çap miras alır.
"""

import math
from collections import defaultdict

from graph import Point, Edge, PipeGraph, build_graph
from diameter import DiameterText, extract_diameters, detect_pipe_type
from arrows import trace_arrows, match_nearby_texts
from models import PipeSegment, BranchPoint

# Pis su icin gecersiz caplar (kesinlikle olmaz)
PISSU_INVALID_CAPS = {"Ø25", "Ø32", "Ø40", "Ø63"}


def walk_and_propagate(
    graph: PipeGraph,
    edge_diameters: dict[int, str],
    edge_distances: dict[int, float] | None = None,
) -> list[dict]:
    """
    Pipe-Walker: boru ağında yürür, çap yayar.

    edge_diameters: {edge_idx: çap} — ok veya text'ten gelen kesin çaplar.
    edge_distances: {edge_idx: mesafe} — eslestirme mesafesi (guvenilirlik).
    Diğer edge'ler komşudan miras alır (tee'ye kadar).
    Tee yoksa + uzak text ise miras korunur (devam eden boru ayni captir).
    """
    _dists = edge_distances or {}
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

    # 2. Cap layer'ları tespit et
    if cap_layers is None:
        # Otomatik: layer adında "cap" veya "çap" geçenler
        import ezdxf
        doc = ezdxf.readfile(dxf_path)
        all_layers = set()
        for e in doc.modelspace():
            if hasattr(e.dxf, 'layer'):
                all_layers.add(e.dxf.layer)
        cap_layers = [l for l in all_layers if 'cap' in l.lower()]
        if cap_layers:
            warnings.append(f"Otomatik cap layer: {cap_layers}")
        else:
            # Cap layer bulunamadi — tum layer'lardan text ara
            cap_layers = None
            warnings.append("Cap layer bulunamadi, tum layer'lardan text araniyor")

    # 3. Diger boru layer'larinin koordinatlari (cross-system check icin)
    #    Ok/text eslestirmede baska layer'in borusuna daha yakin olani filtreler
    import ezdxf as _ezdxf
    _doc = _ezdxf.readfile(dxf_path)
    _all_dxf_layers = set()
    for _ent in _doc.modelspace():
        if hasattr(_ent.dxf, 'layer'):
            _all_dxf_layers.add(_ent.dxf.layer)
    _pipe_keywords = ['sihhi', 'su', 'yangin', 'temiz', 'pis', 'gri', 'yagmur']
    _sel_set = set(selected_layers)
    other_pipe_layers = [
        l for l in _all_dxf_layers
        if l not in _sel_set and 'cap' not in l.lower()
        and any(kw in l.lower() for kw in _pipe_keywords)
    ]
    other_raw: list[tuple] = []
    if other_pipe_layers:
        _other_graph = build_graph(dxf_path, other_pipe_layers)
        # Index offset: own edge'lerle cakmamasi icin 100000 ekle
        _offset = 100000
        other_raw = [(rc[0] + _offset, rc[1], rc[2], rc[3], rc[4])
                     for rc in _other_graph.raw_coords]

    # 4. Her pipe_type grubu icin ayri cap analizi
    #    Pis su (metric) ve temiz su (imperial) ayni cap layer'i paylasir
    #    ama farkli formatta text'ler kullanir.
    from collections import Counter

    # Layer'lari pipe_type'a gore grupla
    type_groups: dict[str, list[str]] = defaultdict(list)
    for layer in selected_layers:
        pt = detect_pipe_type(layer)
        type_groups[pt].append(layer)

    # Her grubun edge idx'lerini bul
    edge_layer_map = {e.idx: e.layer for e in graph.edges}

    edge_diameters: dict[int, str] = {}
    edge_distances: dict[int, float] = {}  # eslestirme mesafesi (guvenilirlik icin)
    total_arrow = 0
    total_text = 0

    for pipe_type, layers_in_group in type_groups.items():
        group_edge_idxs = {e.idx for e in graph.edges if e.layer in set(layers_in_group)}
        group_raw = [rc for rc in graph.raw_coords if rc[0] in group_edge_idxs]

        # Çap text'leri (bu grup icin format filtreli)
        texts = extract_diameters(dxf_path, cap_layers, pipe_type=pipe_type)

        # Ok takibi (other_pipes: baska layer borulari — cross-system check)
        arrow_caps: dict[int, str] = {}
        if cap_layers:
            arrow_caps = trace_arrows(dxf_path, cap_layers, texts, group_raw, other_pipes=other_raw)
        total_arrow += len(arrow_caps)

        # Yakin text (mesafe bilgisiyle, other_pipes: cross-system check)
        text_caps, text_dists = match_nearby_texts(texts, group_raw, other_pipes=other_raw)
        total_text += len(text_caps)

        # Birlestir: 1) ok ustun (kesin, format gecerliyse), 2) yakin text yedek
        from diameter import _is_metric, _is_imperial
        for eidx, cap in text_caps.items():
            if eidx not in edge_diameters:
                edge_diameters[eidx] = cap
                edge_distances[eidx] = text_dists[eidx]
        for eidx, cap in arrow_caps.items():
            # Ok sonucu format + gecerlilik validasyonundan gecmeli
            ok_valid = True
            if pipe_type == "metric" and not _is_metric(cap):
                ok_valid = False
            elif pipe_type == "imperial" and _is_metric(cap):
                ok_valid = False
            # Pis su gecersiz caplar (ok da olsa reddet)
            layer = edge_layer_map.get(eidx, "")
            if pipe_type == "metric" and "pis" in layer.lower() and cap in PISSU_INVALID_CAPS:
                ok_valid = False
            if ok_valid:
                edge_diameters[eidx] = cap  # ok HER ZAMAN ustun (kisa ok kurali)
                edge_distances[eidx] = 0.0

        warnings.append(f"{pipe_type} ({', '.join(layers_in_group)}): {len(texts)} text, {len(arrow_caps)} ok, {len(text_caps)} yakin")

    matched_len = sum(
        e.length for e in graph.edges if e.idx in edge_diameters
    ) * scale
    total_len = sum(e.length for e in graph.edges) * scale
    warnings.append(
        f"Cap atanan: {len(edge_diameters)}/{len(graph.edges)} edge "
        f"({matched_len:.1f}m / {total_len:.1f}m)"
    )

    # 8. Walker: çap yayma
    raw_segments = walk_and_propagate(graph, edge_diameters, edge_distances)

    # 9. Backfill DEVRE DISI — kullanici PipeMapViewer'da kendisi duzeltir
    # _backfill(raw_segments)

    # 9b. Format dogrulama: yanlis format cap'i temizle
    #     Walker veya backfill cross-layer cap sizdirabilir
    from diameter import _is_metric, _is_imperial

    for seg in raw_segments:
        d = seg["diameter"]
        if d == "Belirtilmemis" or not d:
            continue
        layer = seg["layer"]
        pt = detect_pipe_type(layer)
        if pt == "metric" and not _is_metric(d):
            seg["diameter"] = "Belirtilmemis"
        elif pt == "imperial" and _is_metric(d):
            seg["diameter"] = "Belirtilmemis"
        # Pis su layer'inda Ø25, Ø32, Ø63 reddet
        elif pt == "metric" and "pis" in layer.lower() and d in PISSU_INVALID_CAPS:
            seg["diameter"] = "Belirtilmemis"

    # 10. Malzeme tipi
    _mat_map = material_type_map or {}
    for seg in raw_segments:
        layer = seg["layer"]
        seg["material_type"] = _mat_map.get(layer, "")

    # 11. Merge + scale (metraj icin)
    merged_segments = merge_segments(raw_segments, scale)

    # 12. Edge-bazli segment listesi (frontend harita icin)
    #     Her edge = ayri tiklanabilir segment, kendi capi ile
    raw_coords_map = {rc[0]: [round(rc[1], 1), round(rc[2], 1),
                              round(rc[3], 1), round(rc[4], 1)]
                      for rc in graph.raw_coords}

    # Her edge'in final capini belirle
    edge_final_diameters: dict[int, str] = {}
    for e in graph.edges:
        edge_final_diameters[e.idx] = edge_diameters.get(e.idx, "Belirtilmemis")

    # 9b validasyonunu edge_final_diameters'a da uygula
    # (raw_segments duzeltildi ama edge_final_diameters orijinal edge_diameters'dan okundu)
    for e in graph.edges:
        d = edge_final_diameters[e.idx]
        if d == "Belirtilmemis" or not d:
            continue
        pt = detect_pipe_type(e.layer)
        if pt == "metric" and not _is_metric(d):
            edge_final_diameters[e.idx] = "Belirtilmemis"
        elif pt == "imperial" and _is_metric(d):
            edge_final_diameters[e.idx] = "Belirtilmemis"
        elif pt == "metric" and "pis" in e.layer.lower() and d in PISSU_INVALID_CAPS:
            edge_final_diameters[e.idx] = "Belirtilmemis"

    # Tee olmayan duz gecislerde cap tutarliligi: cap DEGISMEZ
    # Birden fazla pass yaparak tum zincir boyunca yay
    # Ok ile atanmis cap (edge_distances=0) en guvenilir
    for _pass in range(len(graph.edges)):
        changed = False
        for node, neighbors in graph.adj.items():
            if node in graph.tees:
                continue
            if len(neighbors) != 2:
                continue
            e1, e2 = neighbors[0][1], neighbors[1][1]
            if e1.layer != e2.layer:
                continue
            d1 = edge_final_diameters.get(e1.idx, "Belirtilmemis")
            d2 = edge_final_diameters.get(e2.idx, "Belirtilmemis")
            if d1 == d2:
                continue
            # Tee yok + ayni layer → cap ayni olmali
            dist1 = edge_distances.get(e1.idx, 9999)
            dist2 = edge_distances.get(e2.idx, 9999)
            if d1 == "Belirtilmemis":
                edge_final_diameters[e1.idx] = d2
                changed = True
            elif d2 == "Belirtilmemis":
                edge_final_diameters[e2.idx] = d1
                changed = True
            else:
                # Ikisi de atanmis ama farkli — daha guvenilir olan kazanir
                # Ok (dist=0) > yakin text < uzak text
                if dist1 < dist2:
                    edge_final_diameters[e2.idx] = d1
                    changed = True
                else:
                    edge_final_diameters[e1.idx] = d2
                    changed = True
        if not changed:
            break

    # Her edge'i ayri PipeSegment olarak olustur (tiklanabilir harita icin)
    edge_segments: list[PipeSegment] = []
    for e in graph.edges:
        coord = raw_coords_map.get(e.idx)
        if not coord:
            continue
        edge_segments.append(PipeSegment(
            segment_id=e.idx,
            layer=e.layer,
            diameter=edge_final_diameters.get(e.idx, "Belirtilmemis"),
            length=round(e.length * scale, 2),
            line_count=1,
            material_type=(_mat_map.get(e.layer, "")),
            coords=[coord],
        ))

    # merged_segments'e de coords ekle (metraj tablosu icin)
    for ps in merged_segments:
        coords = []
        for e in graph.edges:
            if e.layer == ps.layer and edge_final_diameters.get(e.idx) == ps.diameter:
                if e.idx in raw_coords_map:
                    coords.append(raw_coords_map[e.idx])
        ps.coords = coords

    # Ozet
    total = sum(s.length for s in merged_segments)
    unmatched = sum(s.length for s in merged_segments if s.diameter == "Belirtilmemis")
    if unmatched > 0:
        pct = round(unmatched / total * 100) if total > 0 else 0
        warnings.append(f"Belirtilmemiş: {unmatched:.1f}m ({pct}%)")

    return merged_segments, branch_points, warnings, edge_segments
