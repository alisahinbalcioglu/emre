"""
diameter_assigner.py — Çap Atama Motoru (5 Kural)

Kullanıcının tanımladığı 5 kural harfiyen uygulanır:

KURAL 1 — Ok Eşleştirme (Birincil)
  Aynı text bölgesinden çıkan okları grupla
  Ok uzunluklarını ölç (kısa/uzun)
  Text'e göre boruların mesafesini ölç (yakın/uzak)
  Kısa ok = yakın borunun çapı, uzun ok = uzak borunun çapı
  Ok geçerliyse (format + geçersiz çap kontrolü) → ata, bitir

KURAL 2 — Yakın Text (Ok Yoksa)
  pipe-centric: her boru için en yakın text
  Cross-system check: text başka layer borusuna daha yakınsa → atla
  En yakın geçerli text'in çapını ata

KURAL 3 — Walker Propagation (Ok ve Text Yoksa)
  Tee olmayan düz devamda → önceki borunun çapını miras al
  Tee'de → sadece devam yönüne miras, dallara miras yapma
  Güvenilirlik: uzak text (dist>50) varsa miras korunsun

KURAL 4 — Format Validasyonu (Her Zaman)
  Metric boru (pis su, yağmur) → sadece Ø kabul
  Imperial boru (temiz, gri, sprinkler) → sadece DN/inch kabul
  Pis su geçersiz çaplar: Ø25, Ø32, Ø40, Ø63 → reddet

KURAL 5 — Belirtilmemiş Kalan
  Kullanıcı PipeMapViewer'da tıklayıp düzeltir
"""

import math
from collections import Counter, defaultdict

import ezdxf

from graph import Point, Edge, PipeGraph
from diameter import (
    DiameterText, extract_diameters, detect_pipe_type,
    _is_metric, _is_imperial,
)

# ── Sabitler ──
PISSU_INVALID_CAPS = {"Ø25", "Ø32", "Ø40", "Ø63"}

# Ok algılama
MIN_ARROW_LENGTH = 5.0
MAX_ARROW_TEXT_DIST = 80.0    # ok ucu ↔ text arası max mesafe
TEXT_CLUSTER_DIST = 300.0     # aynı text bölgesi sayılma mesafesi
PIPE_RANK_GAP = 5.0           # boru rank geçiş eşiği (birim)
ARROW_RANK_GAP = 20.0         # ok rank geçiş eşiği (birim)

# Yakın text
MAX_TEXT_PIPE_DIST = 200.0    # text ↔ boru arası max mesafe

# Walker
DIST_TRUST_THRESHOLD = 50.0   # bu mesafenin üstündeki text "uzak" sayılır


# ═══════════════════════════════════════════════
#  YARDIMCI GEOMETRİ
# ═══════════════════════════════════════════════

def _pt_dist(x1, y1, x2, y2):
    return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)


def _perp_dist(px, py, x1, y1, x2, y2):
    """Nokta → segment dik mesafesi."""
    dx, dy = x2 - x1, y2 - y1
    lsq = dx * dx + dy * dy
    if lsq < 1.0:
        return math.sqrt((px - x1) ** 2 + (py - y1) ** 2)
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / lsq))
    cx, cy = x1 + t * dx, y1 + t * dy
    return math.sqrt((px - cx) ** 2 + (py - cy) ** 2)


def _polyline_len(pts):
    total = 0.0
    for i in range(len(pts) - 1):
        total += _pt_dist(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])
    return total


# ═══════════════════════════════════════════════
#  KURAL 4 — FORMAT VALİDASYONU
# ═══════════════════════════════════════════════

def _format_valid(cap: str, pipe_type: str, layer: str) -> bool:
    """Çap, boru tipine uygun mu? Her zaman kontrol edilir."""
    if not cap or cap == "Belirtilmemis":
        return False
    if pipe_type == "metric" and not _is_metric(cap):
        return False
    if pipe_type == "imperial" and _is_metric(cap):
        return False
    if pipe_type == "metric" and "pis" in layer.lower() and cap in PISSU_INVALID_CAPS:
        return False
    return True


# ═══════════════════════════════════════════════
#  KURAL 1 — OK EŞLEŞTİRME
# ═══════════════════════════════════════════════

def _collect_arrows(dxf_path: str, diameter_texts: list[DiameterText]) -> list[dict]:
    """
    DXF'teki TÜM okları topla: LINE, LWPOLYLINE, LEADER, MULTILEADER.
    Layer filtresi YOK — text yakınlık kontrolü gereksizleri eler.

    Döndürür: [{length, diameter, text_x, text_y, pipe_x, pipe_y}, ...]
    """
    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()
    stats = {"line": 0, "lwpoly": 0, "leader": 0,
             "skip_short": 0, "skip_notext": 0, "total_scanned": 0}

    def _nearest_text(x, y):
        best_val, best_d = "", MAX_ARROW_TEXT_DIST
        best_x, best_y = 0.0, 0.0
        for dt in diameter_texts:
            d = _pt_dist(dt.position.x, dt.position.y, x, y)
            if d < best_d:
                best_d, best_val = d, dt.value
                best_x, best_y = dt.position.x, dt.position.y
        return best_val, best_d, best_x, best_y

    arrows: list[dict] = []

    def _try_add(sx, sy, ex, ey, length, src):
        stats["total_scanned"] += 1
        if length < MIN_ARROW_LENGTH:
            stats["skip_short"] += 1
            return
        sv, sd, stx, sty = _nearest_text(sx, sy)
        ev, ed, etx, ety = _nearest_text(ex, ey)
        if not sv and not ev:
            stats["skip_notext"] += 1
            return
        # Text'e yakın uç = text tarafı, diğer uç = boru tarafı
        if sd < ed and sv:
            arrows.append({"length": length, "diameter": sv,
                           "text_x": stx, "text_y": sty,
                           "pipe_x": ex, "pipe_y": ey})
        elif ev:
            arrows.append({"length": length, "diameter": ev,
                           "text_x": etx, "text_y": ety,
                           "pipe_x": sx, "pipe_y": sy})
        stats[src] += 1

    # LINE
    for ent in msp.query('LINE'):
        s, e = ent.dxf.start, ent.dxf.end
        _try_add(s.x, s.y, e.x, e.y, _pt_dist(s.x, s.y, e.x, e.y), "line")

    # LWPOLYLINE
    for ent in msp.query('LWPOLYLINE'):
        pts = list(ent.get_points(format='xy'))
        if len(pts) < 2:
            continue
        _try_add(pts[0][0], pts[0][1], pts[-1][0], pts[-1][1],
                 _polyline_len(pts), "lwpoly")

    # LEADER / MULTILEADER
    for ent in msp:
        etype = ent.dxftype()
        if etype == 'LEADER':
            verts = list(ent.vertices)
            if len(verts) < 2:
                continue
            tip = (verts[0][0], verts[0][1])
            tail = (verts[-1][0], verts[-1][1])
            _try_add(tip[0], tip[1], tail[0], tail[1],
                     _pt_dist(tip[0], tip[1], tail[0], tail[1]), "leader")
        elif etype == 'MULTILEADER':
            try:
                ctx = ent.context
                if hasattr(ctx, 'leaders') and ctx.leaders:
                    for ldr in ctx.leaders:
                        if hasattr(ldr, 'lines') and ldr.lines:
                            for line in ldr.lines:
                                lv = list(line.vertices)
                                if len(lv) >= 2:
                                    _try_add(lv[0][0], lv[0][1],
                                             lv[-1][0], lv[-1][1],
                                             _pt_dist(lv[0][0], lv[0][1],
                                                      lv[-1][0], lv[-1][1]),
                                             "leader")
                                    break
                            break
            except Exception:
                continue

    return arrows, stats


def _arrow_match(
    arrows: list[dict],
    own_coords: list[tuple[int, float, float, float, float]],
    other_coords: list[tuple[int, float, float, float, float]],
    pipe_type: str,
    layer: str,
) -> tuple[dict[int, str], dict[int, float]]:
    """
    KURAL 1: Ok Eşleştirme.

    1. Okları text pozisyonuna göre grupla (cluster)
    2. Her cluster için:
       a. Tüm boruların text'e mesafesini ölç → rank'la (yakın→uzak)
       b. Okları uzunluğa göre sırala → rank'la (kısa→uzun)
       c. Boru Rank N → Ok Rank N'in çapını al
    3. Format + geçersiz çap kontrolü → geçerliyse ata

    Döndürür: (edge_idx→çap, edge_idx→mesafe)
    """
    if not arrows:
        return {}, {}

    all_pipes = list(own_coords) + list(other_coords)
    own_set = {rc[0] for rc in own_coords}

    # Okları text pozisyonuna göre cluster'la
    clusters: list[list[dict]] = []
    for a in arrows:
        placed = False
        for cl in clusters:
            for c in cl:
                if _pt_dist(a["text_x"], a["text_y"],
                            c["text_x"], c["text_y"]) < TEXT_CLUSTER_DIST:
                    cl.append(a)
                    placed = True
                    break
            if placed:
                break
        if not placed:
            clusters.append([a])

    cap_map: dict[int, str] = {}
    dist_map: dict[int, float] = {}

    for cl in clusters:
        if not cl:
            continue

        # Text merkez noktası
        tx = sum(a["text_x"] for a in cl) / len(cl)
        ty = sum(a["text_y"] for a in cl) / len(cl)

        # Tüm boruların text'e mesafesi
        pipe_dists: list[tuple[float, int, bool]] = []
        for eidx, x1, y1, x2, y2 in all_pipes:
            d = _perp_dist(tx, ty, x1, y1, x2, y2)
            pipe_dists.append((d, eidx, eidx in own_set))
        pipe_dists.sort()

        # Boru rank'la (>PIPE_RANK_GAP fark = yeni rank)
        pipe_ranks: list[list[tuple[float, int, bool]]] = []
        for pd in pipe_dists:
            if not pipe_ranks or pd[0] - pipe_ranks[-1][0][0] > PIPE_RANK_GAP:
                pipe_ranks.append([pd])
            else:
                pipe_ranks[-1].append(pd)

        # Okları uzunluğa göre sırala + rank'la
        sorted_arrows = sorted(cl, key=lambda a: a["length"])
        arrow_ranks: list[list[dict]] = []
        for a in sorted_arrows:
            if not arrow_ranks or a["length"] - arrow_ranks[-1][0]["length"] > ARROW_RANK_GAP:
                arrow_ranks.append([a])
            else:
                arrow_ranks[-1].append(a)

        # Boru Rank N → Ok Rank N'in dominant çapını al
        for rank_idx, rank_group in enumerate(pipe_ranks):
            if rank_idx >= len(arrow_ranks):
                break
            # Bu ok rank'ının dominant çapı
            dominant = Counter(a["diameter"] for a in arrow_ranks[rank_idx]).most_common(1)[0][0]

            for _, eidx, is_own in rank_group:
                if is_own and eidx not in cap_map:
                    # KURAL 4: Format kontrolü
                    if _format_valid(dominant, pipe_type, layer):
                        cap_map[eidx] = dominant
                        dist_map[eidx] = 0.0  # ok = en güvenilir

    return cap_map, dist_map


# ═══════════════════════════════════════════════
#  KURAL 2 — YAKIN TEXT
# ═══════════════════════════════════════════════

def _text_match(
    diameter_texts: list[DiameterText],
    own_coords: list[tuple[int, float, float, float, float]],
    other_coords: list[tuple[int, float, float, float, float]],
    pipe_type: str,
    layer: str,
    already_assigned: set[int],
) -> tuple[dict[int, str], dict[int, float]]:
    """
    KURAL 2: Yakın Text (Ok Yoksa).
    Sadece ok ile atanMAMIŞ edge'ler için.

    - pipe-centric: her boru için en yakın text
    - cross-system: text başka layer borusuna daha yakınsa → atla
    """
    own_set = {rc[0] for rc in own_coords}
    all_pipes = list(own_coords) + list(other_coords)

    cap_map: dict[int, str] = {}
    dist_map: dict[int, float] = {}

    for eidx, x1, y1, x2, y2 in own_coords:
        if eidx in already_assigned:
            continue  # ok ile zaten atandı → ATLA

        best_val, best_dist = "", MAX_TEXT_PIPE_DIST
        for dt in diameter_texts:
            d = _perp_dist(dt.position.x, dt.position.y, x1, y1, x2, y2)
            if d >= best_dist:
                continue

            # Cross-system check: bu text'in en yakın borusu biz miyiz?
            if other_coords:
                nearest_eidx = -1
                nearest_d = d  # bizim mesafemiz baseline
                for oeidx, ox1, oy1, ox2, oy2 in all_pipes:
                    od = _perp_dist(dt.position.x, dt.position.y, ox1, oy1, ox2, oy2)
                    if od < nearest_d:
                        nearest_d = od
                        nearest_eidx = oeidx
                if nearest_eidx >= 0 and nearest_eidx not in own_set:
                    continue  # text başka layer borusuna daha yakın → atla

            # KURAL 4: Format kontrolü
            if not _format_valid(dt.value, pipe_type, layer):
                continue

            best_dist = d
            best_val = dt.value

        if best_val:
            cap_map[eidx] = best_val
            dist_map[eidx] = best_dist

    return cap_map, dist_map


# ═══════════════════════════════════════════════
#  KURAL 3 — WALKER PROPAGATION
# ═══════════════════════════════════════════════

def _walker_propagate(
    graph: PipeGraph,
    edge_caps: dict[int, str],
    edge_dists: dict[int, float],
    edge_sources: dict[int, str],
) -> None:
    """
    KURAL 3: Walker Propagation (Ok ve Text Yoksa).

    - Tee olmayan düz devam → önceki borunun çapını miras al
    - Tee'de → sadece devam yönüne miras, dallara yapma
    - Güvenilirlik: uzak text (dist>50) varsa miras korunsun

    In-place günceller: edge_caps, edge_sources
    """
    DIST_THRESHOLD = DIST_TRUST_THRESHOLD

    # Birden fazla pass: tüm zincir boyunca yay
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

            d1 = edge_caps.get(e1.idx, "Belirtilmemis")
            d2 = edge_caps.get(e2.idx, "Belirtilmemis")
            if d1 == d2:
                continue

            src1 = edge_sources.get(e1.idx, "")
            src2 = edge_sources.get(e2.idx, "")
            dist1 = edge_dists.get(e1.idx, 9999)
            dist2 = edge_dists.get(e2.idx, 9999)

            # Arrow DOKUNULMAZ
            if src1 == "arrow" and src2 == "arrow":
                continue
            if src1 == "arrow":
                if d2 == "Belirtilmemis":
                    edge_caps[e2.idx] = d1
                    edge_sources[e2.idx] = "walker"
                    changed = True
                else:
                    # arrow her zaman kazanır
                    edge_caps[e2.idx] = d1
                    edge_sources[e2.idx] = "walker"
                    changed = True
                continue
            if src2 == "arrow":
                if d1 == "Belirtilmemis":
                    edge_caps[e1.idx] = d2
                    edge_sources[e1.idx] = "walker"
                    changed = True
                else:
                    edge_caps[e1.idx] = d2
                    edge_sources[e1.idx] = "walker"
                    changed = True
                continue

            # Belirtilmemiş → komşudan al
            if d1 == "Belirtilmemis" and d2 != "Belirtilmemis":
                edge_caps[e1.idx] = d2
                edge_sources[e1.idx] = "walker"
                changed = True
            elif d2 == "Belirtilmemis" and d1 != "Belirtilmemis":
                edge_caps[e2.idx] = d1
                edge_sources[e2.idx] = "walker"
                changed = True
            else:
                # İkisi de atanmış ama farklı
                # Walker mirası + uzak text → miras korunsun
                if src1 == "walker" and dist2 > DIST_THRESHOLD:
                    continue
                if src2 == "walker" and dist1 > DIST_THRESHOLD:
                    continue
                # Daha güvenilir (yakın mesafe) kazanır
                if dist1 < dist2:
                    edge_caps[e2.idx] = d1
                    edge_sources[e2.idx] = "walker"
                    changed = True
                elif dist2 < dist1:
                    edge_caps[e1.idx] = d2
                    edge_sources[e1.idx] = "walker"
                    changed = True

        if not changed:
            break


# ═══════════════════════════════════════════════
#  ANA FONKSİYON — 5 KURAL UYGULA
# ═══════════════════════════════════════════════

def assign_diameters(
    dxf_path: str,
    graph: PipeGraph,
    pipe_type: str,
    layer: str,
    cap_layers: list[str] | None,
    other_pipes: list[tuple] | None = None,
) -> tuple[dict[int, str], dict[int, str], dict[int, float], list[str]]:
    """
    5 Kuralı sırayla uygular.

    Parametreler:
      dxf_path: DXF dosya yolu
      graph: bu layer'ın PipeGraph'ı
      pipe_type: "metric" | "imperial" | "all"
      layer: layer adı (format validasyon için)
      cap_layers: çap text layer'ları (None = tüm layer'lar)
      other_pipes: diğer layer'ların boru koordinatları (cross-system)

    Döndürür: (edge_caps, edge_sources, edge_dists, warnings)
      edge_caps: {edge_idx: çap}
      edge_sources: {edge_idx: "arrow"|"text"|"walker"}
      edge_dists: {edge_idx: mesafe}
      warnings: debug bilgileri
    """
    warnings: list[str] = []
    own_coords = graph.raw_coords
    other_coords = list(other_pipes or [])

    # ── Çap text'leri çıkar (format filtreli) ──
    texts = extract_diameters(dxf_path, cap_layers, pipe_type=pipe_type)
    warnings.append(f"Text: {len(texts)} adet ({pipe_type} format)")

    # ── KURAL 1: Ok Eşleştirme ──
    arrows, arrow_stats = _collect_arrows(dxf_path, texts)
    arrow_caps, arrow_dists = _arrow_match(
        arrows, own_coords, other_coords, pipe_type, layer,
    )

    warnings.append(
        f"Ok: {len(arrow_caps)} eslesti | "
        f"line={arrow_stats['line']} lwpoly={arrow_stats['lwpoly']} "
        f"leader={arrow_stats['leader']} | "
        f"skip: kisa={arrow_stats['skip_short']} textsiz={arrow_stats['skip_notext']} "
        f"(toplam taranan={arrow_stats['total_scanned']})"
    )

    # ── KURAL 2: Yakın Text (ok ile atanmamışlar için) ──
    text_caps, text_dists = _text_match(
        texts, own_coords, other_coords, pipe_type, layer,
        already_assigned=set(arrow_caps.keys()),
    )

    warnings.append(f"Yakin text: {len(text_caps)} eslesti")

    # ── Birleştir: kaynak takibi ──
    edge_caps: dict[int, str] = {}
    edge_sources: dict[int, str] = {}
    edge_dists: dict[int, float] = {}

    for eidx, cap in arrow_caps.items():
        edge_caps[eidx] = cap
        edge_sources[eidx] = "arrow"
        edge_dists[eidx] = arrow_dists[eidx]

    for eidx, cap in text_caps.items():
        if eidx not in edge_caps:  # ok zaten atadıysa dokunma
            edge_caps[eidx] = cap
            edge_sources[eidx] = "text"
            edge_dists[eidx] = text_dists[eidx]

    # ── KURAL 3: Walker Propagation ──
    _walker_propagate(graph, edge_caps, edge_dists, edge_sources)

    # ── KURAL 4: Son format kontrolü (walker sızdırma önlemi) ──
    for e in graph.edges:
        d = edge_caps.get(e.idx)
        if not d or d == "Belirtilmemis":
            continue
        if not _format_valid(d, pipe_type, e.layer):
            edge_caps[e.idx] = "Belirtilmemis"
            edge_sources.pop(e.idx, None)

    # ── İstatistik ──
    src_counts = Counter(edge_sources.get(e.idx, "") for e in graph.edges)
    n_arr = src_counts.get("arrow", 0)
    n_txt = src_counts.get("text", 0)
    n_wlk = src_counts.get("walker", 0)
    n_unk = len(graph.edges) - n_arr - n_txt - n_wlk
    warnings.append(
        f"Kaynak: ok={n_arr} text={n_txt} walker={n_wlk} belirtilmemis={n_unk}"
    )

    return edge_caps, edge_sources, edge_dists, warnings
