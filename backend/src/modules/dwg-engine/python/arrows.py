"""
arrows.py — Ok Takibi + Yakın Text Eşleştirme

Çap atama kuralları (öncelik sırası):
1. Ok eşleştirme:
   - Aynı text bölgesinden çıkan okları grupla
   - Ok uzunluklarını ölç (kısa/uzun)
   - Text'e göre boruların mesafesini ölç (yakın/uzak)
   - Kısa ok = yakın borunun çapı, uzun ok = uzak borunun çapı
   - Bizim boru text'e yakınsa → kısa okun çapını al
   - Bizim boru text'e uzaksa → uzun okun çapını al
2. Ok yoksa: text doğrudan borunun yanında (yakın text eşleştirme)
"""

import math
from collections import defaultdict

import ezdxf

from graph import Point
from diameter import DiameterText


MAX_ARROW_TEXT_DISTANCE = 80.0
MAX_ARROW_PIPE_DISTANCE = 200.0
MAX_TEXT_PIPE_DISTANCE = 200.0
MIN_ARROW_LENGTH = 5.0
TEXT_CLUSTER_DISTANCE = 300.0


def _perp_to_segment(
    px: float, py: float,
    x1: float, y1: float, x2: float, y2: float,
) -> float:
    """Nokta (px,py)'nin segment (x1,y1)-(x2,y2)'ye dik mesafesi."""
    dx, dy = x2 - x1, y2 - y1
    len_sq = dx * dx + dy * dy
    if len_sq < 1.0:
        return math.sqrt((px - x1) ** 2 + (py - y1) ** 2)
    t = ((px - x1) * dx + (py - y1) * dy) / len_sq
    t = max(0.0, min(1.0, t))
    cx, cy = x1 + t * dx, y1 + t * dy
    return math.sqrt((px - cx) ** 2 + (py - cy) ** 2)


def _find_nearest_pipe(
    px: float, py: float,
    raw_coords: list[tuple[int, float, float, float, float]],
    max_dist: float,
) -> tuple[int, float]:
    """Noktaya en yakın boru segmentini bul."""
    best_idx = -1
    best_dist = max_dist
    for eidx, x1, y1, x2, y2 in raw_coords:
        d = _perp_to_segment(px, py, x1, y1, x2, y2)
        if d < best_dist:
            best_dist = d
            best_idx = eidx
    return best_idx, best_dist


def _polyline_length(pts: list[tuple[float, float]]) -> float:
    """Polyline toplam uzunlugu."""
    total = 0.0
    for i in range(len(pts) - 1):
        dx = pts[i + 1][0] - pts[i][0]
        dy = pts[i + 1][1] - pts[i][1]
        total += math.sqrt(dx * dx + dy * dy)
    return total


def _point_dist(x1: float, y1: float, x2: float, y2: float) -> float:
    return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)


def trace_arrows(
    dxf_path: str,
    cap_layers: list[str],
    diameter_texts: list[DiameterText],
    raw_coords: list[tuple[int, float, float, float, float]],
    other_pipes: list[tuple] | None = None,
) -> dict[int, str]:
    """
    KURAL 1 — Ok Eşleştirme (Birincil):
    1. Aynı text bölgesinden çıkan okları grupla
    2. Ok uzunluklarını ölç (kısa/uzun)
    3. Text'e göre TÜM boruların mesafesini ölç (yakın/uzak)
    4. Kısa ok = yakın borunun çapı, uzun ok = uzak borunun çapı
    5. Bizim boru text'e yakınsa → kısa okun çapını al
    6. Bizim boru text'e uzaksa → uzun okun çapını al
    """
    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()
    cap_set = set(cap_layers)
    own_eidxs = {rc[0] for rc in raw_coords}
    all_pipe_coords = list(raw_coords) + (other_pipes or [])

    def _find_text_at_point(x: float, y: float) -> tuple[str, float, float, float]:
        best_val = ""
        best_dist = MAX_ARROW_TEXT_DISTANCE
        best_x, best_y = 0.0, 0.0
        for dt in diameter_texts:
            d = _point_dist(dt.position.x, dt.position.y, x, y)
            if d < best_dist:
                best_dist = d
                best_val = dt.value
                best_x, best_y = dt.position.x, dt.position.y
        return best_val, best_dist, best_x, best_y

    # ── Adım 1: TÜM okları topla ──
    # TÜM entity tiplerini ok olarak tara: LINE, LWPOLYLINE, LEADER, MULTILEADER
    # Layer filtresi YOK — text'e yakınlık kontrolü zaten gereksizleri eler
    # (arrow_len, diameter, text_x, text_y, pipe_x, pipe_y)
    all_arrows: list[tuple[float, str, float, float, float, float]] = []
    _debug_stats = {"lwpoly": 0, "line": 0, "leader": 0, "skipped_short": 0, "skipped_notext": 0}

    def _try_add_arrow(start_x, start_y, end_x, end_y, arrow_len, src):
        """Ortak ok ekleme mantığı: bir ucu text'e yakın → ok."""
        if arrow_len < MIN_ARROW_LENGTH:
            _debug_stats["skipped_short"] += 1
            return
        s_val, s_dist, s_tx, s_ty = _find_text_at_point(start_x, start_y)
        e_val, e_dist, e_tx, e_ty = _find_text_at_point(end_x, end_y)
        if not s_val and not e_val:
            _debug_stats["skipped_notext"] += 1
            return
        if s_dist < e_dist and s_val:
            all_arrows.append((arrow_len, s_val, s_tx, s_ty, end_x, end_y))
        elif e_val:
            all_arrows.append((arrow_len, e_val, e_tx, e_ty, start_x, start_y))
        _debug_stats[src] += 1

    # LWPOLYLINE okları — TÜM layer'lardan (filtre yok)
    for entity in msp.query('LWPOLYLINE'):
        pts = list(entity.get_points(format='xy'))
        if len(pts) < 2:
            continue
        start_x, start_y = pts[0]
        end_x, end_y = pts[-1]
        arrow_len = _polyline_length(pts)
        _try_add_arrow(start_x, start_y, end_x, end_y, arrow_len, "lwpoly")

    # LINE okları — TÜM layer'lardan
    for entity in msp.query('LINE'):
        s = entity.dxf.start
        e = entity.dxf.end
        line_len = _point_dist(s.x, s.y, e.x, e.y)
        _try_add_arrow(s.x, s.y, e.x, e.y, line_len, "line")

    # LEADER / MULTILEADER
    for entity in msp:
        etype = entity.dxftype()
        if etype not in ('LEADER', 'MULTILEADER'):
            continue

        arrow_tip = None
        tail_tip = None

        if etype == 'LEADER':
            verts = list(entity.vertices)
            if len(verts) < 2:
                continue
            arrow_tip = (verts[0][0], verts[0][1])
            tail_tip = (verts[-1][0], verts[-1][1])
        elif etype == 'MULTILEADER':
            try:
                ctx = entity.context
                if hasattr(ctx, 'leaders') and ctx.leaders:
                    for ldr in ctx.leaders:
                        if hasattr(ldr, 'lines') and ldr.lines:
                            for line in ldr.lines:
                                lv = list(line.vertices)
                                if len(lv) >= 2:
                                    arrow_tip = (lv[0][0], lv[0][1])
                                    tail_tip = (lv[-1][0], lv[-1][1])
                                    break
                            if arrow_tip:
                                break
            except Exception:
                continue

        if not arrow_tip or not tail_tip:
            continue

        leader_len = _point_dist(arrow_tip[0], arrow_tip[1], tail_tip[0], tail_tip[1])
        if leader_len < MIN_ARROW_LENGTH:
            _debug_stats["skipped_short"] += 1
            continue
        text_val, _, t_x, t_y = _find_text_at_point(tail_tip[0], tail_tip[1])
        if not text_val:
            _debug_stats["skipped_notext"] += 1
            continue
        _debug_stats["leader"] += 1
        all_arrows.append((leader_len, text_val, t_x, t_y, arrow_tip[0], arrow_tip[1]))

    # ── Adım 2: Kural 1 uygula ──
    # Ok uzunluğu + text'in boruya mesafesi eşleştirmesi:
    # - Text'e en yakın boru = kısa okun çapını alır
    # - Text'e uzak boru = uzun okun çapını alır
    #
    # Her ok için:
    # 1. Text pozisyonunun TÜM borulara mesafesini hesapla
    # 2. Bizim boru text'e kaçıncı sırada yakın? (rank)
    # 3. Okları uzunluğa göre sırala — aynı rank'taki okun çapını al

    # Okları text pozisyonuna göre grupla
    clusters: list[list[tuple[float, str, float, float, float, float]]] = []
    for arrow in all_arrows:
        _, _, tx, ty, _, _ = arrow
        placed = False
        for cluster in clusters:
            for _, _, ctx, cty, _, _ in cluster:
                if _point_dist(tx, ty, ctx, cty) < TEXT_CLUSTER_DISTANCE:
                    cluster.append(arrow)
                    placed = True
                    break
            if placed:
                break
        if not placed:
            clusters.append([arrow])

    arrow_map: dict[int, str] = {}

    for cluster in clusters:
        if not cluster:
            continue

        # Text merkez noktası
        avg_tx = sum(a[2] for a in cluster) / len(cluster)
        avg_ty = sum(a[3] for a in cluster) / len(cluster)

        # Text'e göre TÜM boruların mesafesini hesapla
        pipe_dists: list[tuple[float, int, bool]] = []

        for eidx, x1, y1, x2, y2 in raw_coords:
            d = _perp_to_segment(avg_tx, avg_ty, x1, y1, x2, y2)
            if d < MAX_ARROW_PIPE_DISTANCE * 3:
                pipe_dists.append((d, eidx, True))

        if other_pipes:
            for eidx, x1, y1, x2, y2 in other_pipes:
                d = _perp_to_segment(avg_tx, avg_ty, x1, y1, x2, y2)
                if d < MAX_ARROW_PIPE_DISTANCE * 3:
                    pipe_dists.append((d, eidx, False))

        pipe_dists.sort(key=lambda x: x[0])

        # Boruları rank'la (yakın→uzak, >5 birim fark = yeni rank)
        pipe_ranks: list[list[tuple[float, int, bool]]] = []
        for pd in pipe_dists:
            if not pipe_ranks or pd[0] - pipe_ranks[-1][0][0] > 5:
                pipe_ranks.append([pd])
            else:
                pipe_ranks[-1].append(pd)

        # Okları uzunluğa göre sırala
        arrows_sorted = sorted(cluster, key=lambda x: x[0])

        # Okları rank'la (>20 birim fark = yeni rank)
        arrow_ranks: list[list[tuple[float, str, float, float, float, float]]] = []
        for arrow in arrows_sorted:
            if not arrow_ranks or arrow[0] - arrow_ranks[-1][0][0] > 20:
                arrow_ranks.append([arrow])
            else:
                arrow_ranks[-1].append(arrow)

        # TÜM own pipe'ları rank'larına göre eşle
        # Boru Rank N → Ok Rank N'in çapını al
        from collections import Counter
        for rank_idx, rank_group in enumerate(pipe_ranks):
            if rank_idx >= len(arrow_ranks):
                break  # ok rank'ı bitti
            # Bu ok rank'ının dominant çapı
            cap_counter = Counter(a[1] for a in arrow_ranks[rank_idx])
            dominant_cap = cap_counter.most_common(1)[0][0]

            for _, eidx, is_own in rank_group:
                if is_own and eidx not in arrow_map:
                    arrow_map[eidx] = dominant_cap

    return arrow_map, _debug_stats


def match_nearby_texts(
    diameter_texts: list[DiameterText],
    raw_coords: list[tuple[int, float, float, float, float]],
    other_pipes: list[tuple] | None = None,
) -> tuple[dict[int, str], dict[int, float]]:
    """
    KURAL 2 — Yakın Text (Ok Yoksa):
    Her pipe için en yakın text'i bul.
    Cross-system: text başka layer borusuna daha yakınsa → atla.
    """
    text_map: dict[int, str] = {}
    dist_map: dict[int, float] = {}

    own_eidxs = {rc[0] for rc in raw_coords}
    all_pipes = list(raw_coords) + (other_pipes or []) if other_pipes else list(raw_coords)

    for eidx, x1, y1, x2, y2 in raw_coords:
        best_val = ""
        best_dist = MAX_TEXT_PIPE_DISTANCE
        for dt in diameter_texts:
            d = _perp_to_segment(dt.position.x, dt.position.y, x1, y1, x2, y2)
            if d < best_dist:
                # Cross-system: bu text'in en yakin borusu biz miyiz?
                if other_pipes:
                    nearest_all, _ = _find_nearest_pipe(dt.position.x, dt.position.y, all_pipes, d)
                    if nearest_all >= 0 and nearest_all not in own_eidxs:
                        continue
                best_dist = d
                best_val = dt.value
        if best_val:
            text_map[eidx] = best_val
            dist_map[eidx] = best_dist

    return text_map, dist_map
