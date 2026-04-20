"""Sprinkler-layer tespit testi.

Kullanici belirttigi sprinkler layer adini alip o layer'daki tum CIRCLE/INSERT/
POINT/TEXT pozisyonlarini sprinkler ucu olarak isaretler. Sonrasinda topoloji
(tee, chain) ve opsiyonel AI cap atama sonuclarini raporlar.

Usage:
    python test_sprinkler_layer.py <dxf_path> --pipe "LAYER1,LAYER2" --sprinkler "SPRINK"
    python test_sprinkler_layer.py <dxf_path> --pipe "YANGIN" --sprinkler "SPRINK" --ai
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import ezdxf

from ai_diameter import (
    _build_node_graph,
    _collect_raw_edges,
    _compute_tolerances,
    _detect_sprinkler_positions,
    _extract_segments,
    _group_into_runs,
    _sprinkler_centers_from_layers,
    _split_edges_on_intersections,
)


def _degree_counts(graph):
    d = {1: 0, 2: 0, 3: 0, 4: 0}
    gt = 0
    for _, el in graph.items():
        k = len(el)
        if k >= 5:
            gt += 1
        elif k in d:
            d[k] += 1
    return d, gt


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dxf_path")
    ap.add_argument("--pipe", required=True, help="Boru layer(lari), virgulle ayir")
    ap.add_argument("--sprinkler", default="", help="Sprinkler layer(lari), virgulle ayir (opsiyonel)")
    ap.add_argument("--ai", action="store_true", help="AI cap atamasi da calistir")
    ap.add_argument("--hat-hint", default="", help="AI icin hat tipi ipucu (ornek: 'Sprinkler Hatti')")
    args = ap.parse_args()

    dxf = Path(args.dxf_path)
    if not dxf.is_file():
        print(f"[HATA] DXF bulunamadi: {dxf}")
        return 2

    pipe_layers = [s.strip() for s in args.pipe.split(",") if s.strip()]
    sprinkler_layers = [s.strip() for s in args.sprinkler.split(",") if s.strip()] or None

    print(f"[1/4] DXF: {dxf.name} ({dxf.stat().st_size/(1024*1024):.1f} MB)")
    print(f"       pipe_layers     : {pipe_layers}")
    print(f"       sprinkler_layers: {sprinkler_layers or '(yok — block regex fallback)'}")

    doc = ezdxf.readfile(str(dxf))
    msp = doc.modelspace()

    # 1) Raw topology
    edges_raw = _collect_raw_edges(msp, set(pipe_layers))
    if not edges_raw:
        print(f"[HATA] Secilen pipe layer'lar icinde cizgi bulunamadi")
        return 3
    node_tol, sprinkler_tol = _compute_tolerances(edges_raw)
    print(f"[2/4] Raw edge: {len(edges_raw)}, node_tol={node_tol:.2f}, sprinkler_tol={sprinkler_tol:.2f}")

    # Sprinkler centers (layer-based)
    centers = _sprinkler_centers_from_layers(doc, sprinkler_layers or [])
    print(f"[3/4] Sprinkler layer entity sayisi: {len(centers)}")

    # GERCEK pipeline: _extract_segments — sprinkler split dahil
    from ai_diameter import _extract_segments, _split_edges_on_points
    # Iki adim edge sayisini gorelim
    edges_ix = _split_edges_on_intersections(edges_raw, node_tol)
    if centers:
        edges_sp, _split_pos = _split_edges_on_points(edges_ix, centers, radius=sprinkler_tol)
    else:
        edges_sp, _split_pos = edges_ix, []
    print(f"       intersection split: {len(edges_raw)} -> {len(edges_ix)} (+{len(edges_ix)-len(edges_raw)} virtual tee)")
    print(f"       sprinkler   split: {len(edges_ix)} -> {len(edges_sp)} (+{len(edges_sp)-len(edges_ix)} sprinkler split)")

    # Final segments (gercek pipeline)
    segments = _extract_segments(str(dxf), pipe_layers, sprinkler_layers=sprinkler_layers)
    graph = _build_node_graph(edges_sp, node_tol)
    sk = _detect_sprinkler_positions(
        doc, node_tol, sprinkler_tol, sprinkler_layers=sprinkler_layers
    )
    sp_matched = sum(1 for k in graph if k in sk)
    print(f"       boru endpoint'inde sprinkler: {sp_matched}/{len(centers) or '?'}")

    runs = segments
    degs, gt5 = _degree_counts(graph)
    print(f"[4/4] Topoloji sonuc:")
    print(f"       node      : {len(graph)}")
    print(f"       degree=1 (terminal) : {degs[1]}")
    print(f"       degree=2            : {degs[2]}")
    print(f"       degree=3 (tee)      : {degs[3]}")
    print(f"       degree=4 (cross)    : {degs[4]}")
    print(f"       degree>=5           : {gt5}")
    print(f"       chain/run sayisi    : {len(runs)}")

    total_m = sum(r["length"] for r in runs) / 1000  # assume mm
    print(f"       toplam uzunluk (raw){'':10}: {total_m:.1f} m (birimler mm varsayildi)")
    lengths = sorted((r["length"] for r in runs), reverse=True)
    if lengths:
        print(f"       en uzun 3 chain     : {[int(L) for L in lengths[:3]]}")

    # 4) Opsiyonel AI cap atama
    if args.ai:
        print()
        print("=" * 74)
        print("[AI CAP ATAMA]")
        from ai_diameter import assign_diameters_with_ai
        seg_dia, info = assign_diameters_with_ai(
            str(dxf), pipe_layers,
            hat_tipi_hint=args.hat_hint,
            sprinkler_layers=sprinkler_layers,
        )
        print(f"  segments    : {info.get('segment_count', '?')}")
        print(f"  diameter tx : {info.get('text_count', '?')}")
        print(f"  tokens in/out: {info.get('input_tokens','?')} / {info.get('output_tokens','?')}")
        print(f"  cost        : ~${info.get('cost_usd', 0):.4f}")
        # Cap dagilimi
        from collections import Counter
        dia_count = Counter(v or "Belirtilmemis" for v in seg_dia.values())
        # Toplam uzunluk per cap
        seg_map = {s["id"]: s for s in _extract_segments(str(dxf), pipe_layers, sprinkler_layers=sprinkler_layers)}
        dia_len: dict[str, float] = {}
        for sid, dia in seg_dia.items():
            key = dia or "Belirtilmemis"
            seg = seg_map.get(sid)
            if seg:
                dia_len[key] = dia_len.get(key, 0.0) + seg["length"]
        print(f"\n  {'Cap':<20} {'Segment':>8} {'Uzunluk (m)':>14}")
        print("  " + "-" * 48)
        for dia, cnt in sorted(dia_count.items(), key=lambda kv: -dia_len.get(kv[0], 0)):
            print(f"  {dia:<20} {cnt:>8} {dia_len.get(dia, 0)/1000:>14.1f}")

    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
