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
import os
import sys
from collections import Counter, defaultdict

import ezdxf

from graph import Point, Edge, PipeGraph
from diameter import (
    DiameterText, extract_diameters, detect_pipe_type,
    _is_metric, _is_imperial,
)

# matcher_core import — backend/logic/ dizininden
sys.path.insert(
    0,
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "logic"),
)
from matcher_core import Pipe as MCPipe, Arrow as MCArrow, Text as MCText, PipeMatcher, MatchResult

# ── Sabitler ──
PISSU_INVALID_CAPS = {"Ø25", "Ø32", "Ø40", "Ø63"}

# Ok algılama
MIN_ARROW_LENGTH = 20.0   # arrowhead mark'ları 3-8 birim, gerçek oklar 30+
MAX_ARROW_TEXT_DIST = 20.0    # ok ucu ↔ text arası max mesafe (PRD v2: 20 birim)
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

def _collect_arrows(
    dxf_path: str,
    diameter_texts: list[DiameterText],
    cap_layers: list[str] | None = None,
) -> list[dict]:
    """
    DXF'teki okları topla: LINE, LWPOLYLINE (cap layer'lardan), LEADER, MULTILEADER.

    LWPOLYLINE ve LINE: sadece cap_layers'dan (boru layer'ları ok değil!).
    LEADER/MULTILEADER: tüm layer'lardan (zaten ok entity'si).

    Döndürür: [{length, diameter, text_x, text_y, pipe_x, pipe_y}, ...]
    """
    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()
    cap_set = set(cap_layers) if cap_layers else None
    stats = {"line": 0, "lwpoly": 0, "leader": 0,
             "skip_short": 0, "skip_notext": 0, "skip_layer": 0, "total_scanned": 0}

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

    # LINE — sadece cap layer'lardan (boru LINE'ları ok değil)
    for ent in msp.query('LINE'):
        if cap_set and ent.dxf.layer not in cap_set:
            stats["skip_layer"] += 1
            continue
        s, e = ent.dxf.start, ent.dxf.end
        _try_add(s.x, s.y, e.x, e.y, _pt_dist(s.x, s.y, e.x, e.y), "line")

    # LWPOLYLINE — sadece cap layer'lardan (boru LWPOLYLINE'ları ok değil)
    for ent in msp.query('LWPOLYLINE'):
        if cap_set and ent.dxf.layer not in cap_set:
            stats["skip_layer"] += 1
            continue
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


MAX_ARROW_PIPE_SNAP = 30.0  # ok ucu ile boru arası max snap mesafesi (legacy ref)


# ═══════════════════════════════════════════════
#  KURAL 1+2 — matcher_core KÖPRÜ FONKSİYONLARI
# ═══════════════════════════════════════════════

def _graph_to_matcher_inputs(
    graph: PipeGraph,
    collected_arrows: list[dict],
    diameter_texts: list[DiameterText],
    layer: str,
    other_coords: list[tuple[int, float, float, float, float]] | None = None,
) -> tuple[list[MCPipe], list[MCArrow], list[MCText]]:
    """PipeGraph + toplanan oklar + text'ler → matcher_core sinifarina donustur.

    Tum layer'lardaki borulari dahil eder (cross-system check icin).
    """
    # raw_coords: (edge_idx, x1, y1, x2, y2)
    raw_map: dict[int, tuple[float, float, float, float]] = {
        rc[0]: (rc[1], rc[2], rc[3], rc[4]) for rc in graph.raw_coords
    }

    # own edges → Pipe
    pipes: list[MCPipe] = []
    for edge in graph.edges:
        coords = raw_map.get(edge.idx)
        if coords is None:
            continue
        pipes.append(MCPipe(
            id=str(edge.idx),
            layer=edge.layer,
            start=(coords[0], coords[1]),
            end=(coords[2], coords[3]),
        ))

    # other layer pipes → Pipe (cross-system icin)
    if other_coords:
        for eidx, x1, y1, x2, y2 in other_coords:
            pipes.append(MCPipe(
                id=f"other_{eidx}",
                layer="__other__",
                start=(x1, y1),
                end=(x2, y2),
            ))

    # collected arrows → Arrow
    arrows: list[MCArrow] = []
    for i, a in enumerate(collected_arrows):
        arrows.append(MCArrow(
            id=str(i),
            start=(a["text_x"], a["text_y"]),
            end=(a["pipe_x"], a["pipe_y"]),
            length=a["length"],
            diameter=a.get("diameter", ""),
        ))

    # diameter texts → Text
    texts: list[MCText] = []
    for i, dt in enumerate(diameter_texts):
        texts.append(MCText(
            id=str(i),
            value=dt.value,
            position=(dt.position.x, dt.position.y),
        ))

    return pipes, arrows, texts


def _matcher_results_to_edge_maps(
    results: list[MatchResult],
) -> tuple[dict[int, str], dict[int, str], dict[int, float]]:
    """MatchResult listesini eski assign_diameters donusune cevir.

    Dondurur: (edge_caps, edge_sources, edge_dists)
    """
    edge_caps: dict[int, str] = {}
    edge_sources: dict[int, str] = {}
    edge_dists: dict[int, float] = {}

    for r in results:
        # other_ ile baslayan pipe_id'leri atla (cross-system pipes)
        if r.pipe_id.startswith("other_"):
            continue
        if r.source == "unmatched":
            continue

        eidx = int(r.pipe_id)
        edge_caps[eidx] = r.diameter
        edge_sources[eidx] = r.source
        edge_dists[eidx] = r.distance

    return edge_caps, edge_sources, edge_dists


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
    Walker Propagation — SADECE bos borulari doldur.

    PRD v2 sirasi:
      1. Atanmis caplar ASLA ezilmez (arrow, text, walker farketmez)
      2. Sadece "Belirtilmemis" edge'ler komsu captan miras alir
      3. Tee olmayan duz devamda yayilir
      4. Ayni layer zorunlu

    In-place gunceller: edge_caps, edge_sources
    """
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

            # SADECE bos olani doldur — atanmis capi ASLA ezme
            if d1 == "Belirtilmemis" and d2 != "Belirtilmemis":
                edge_caps[e1.idx] = d2
                edge_sources[e1.idx] = "walker"
                changed = True
            elif d2 == "Belirtilmemis" and d1 != "Belirtilmemis":
                edge_caps[e2.idx] = d1
                edge_sources[e2.idx] = "walker"
                changed = True
            # else: ikisi de atanmis ama farkli → DOKUNMA

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

    # ── KURAL 1+2: matcher_core ile Ok + Text Eşleştirme ──
    collected_arrows, arrow_stats = _collect_arrows(dxf_path, texts, cap_layers)

    warnings.append(
        f"Ok: toplanan={len(collected_arrows)} | "
        f"line={arrow_stats['line']} lwpoly={arrow_stats['lwpoly']} "
        f"leader={arrow_stats['leader']} | "
        f"skip: kisa={arrow_stats['skip_short']} textsiz={arrow_stats['skip_notext']} "
        f"(toplam taranan={arrow_stats['total_scanned']})"
    )

    # PipeGraph → matcher_core siniflarına dönüştür
    mc_pipes, mc_arrows, mc_texts = _graph_to_matcher_inputs(
        graph, collected_arrows, texts, layer, other_coords,
    )

    # PipeMatcher çalıştır (ok + text + cross-system check)
    match_results = PipeMatcher(mc_pipes, mc_arrows, mc_texts, layer).match()

    # MatchResult → eski edge dict formatına dönüştür
    edge_caps, edge_sources, edge_dists = _matcher_results_to_edge_maps(
        match_results,
    )

    # Format validasyonu (matcher_core'un Ø filtresi dışında kalan durumlar)
    for eidx in list(edge_caps.keys()):
        if not _format_valid(edge_caps[eidx], pipe_type, layer):
            del edge_caps[eidx]
            edge_sources.pop(eidx, None)
            edge_dists.pop(eidx, None)

    n_arrow = sum(1 for s in edge_sources.values() if s == "arrow")
    n_text = sum(1 for s in edge_sources.values() if s == "text")
    warnings.append(f"matcher_core: ok={n_arrow} text={n_text}")

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
