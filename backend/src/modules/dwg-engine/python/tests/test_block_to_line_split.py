"""Block-to-Line parcalama (PRD) — insertion point'ten boru bolme testleri.

Degismez kural: sprinkler blogunun insertion point'i her zaman boru cizgisinin
TAM UZERINDEDIR. Blok adi/sekli/layer'i onemsizdir — sprinkler_layers hic
verilmese bile boru, uzerindeki INSERT noktalarindan ayri segmentlere bolunmeli.
"""
from __future__ import annotations
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ezdxf
from pipe_segments import (
    _extract_segments,
    _split_edges_on_insert_points,
)


def _make_doc_with_inserts(insert_positions, block_name="RASGELE_BLOK_X99",
                           insert_layer="EKIPMAN-LAYER"):
    """10m yatay boru (0,0)-(10000,0) 'BORU' layer'inda + verilen noktalarda
    INSERT'ler. Blok icinde kasitli olarak ALAKASIZ geometri (kare) var —
    sekil analizi yapilmadigini kanitlar."""
    doc = ezdxf.new()
    blk = doc.blocks.new(name=block_name)
    # Blok icerigi: insertion point'ten UZAKTA bir kare (sekil yaniltmasin)
    blk.add_lwpolyline([(500, 500), (600, 500), (600, 600), (500, 600)], close=True)
    msp = doc.modelspace()
    msp.add_line((0, 0), (10000, 0), dxfattribs={"layer": "BORU"})
    for x, y in insert_positions:
        msp.add_blockref(block_name, (x, y), dxfattribs={"layer": insert_layer})
    return doc


class TestBlockToLineSplit:
    def test_sprinkler_layer_isaretsiz_bile_bolunur(self):
        """3 INSERT boru ustunde, sprinkler_layers=None → 4 ayri segment."""
        doc = _make_doc_with_inserts([(2500, 0), (5000, 0), (7500, 0)])
        segments, _ = _extract_segments(
            "", ["BORU"], sprinkler_layers=None, doc=doc,
        )
        assert len(segments) == 4, f"4 parca bekleniyordu, {len(segments)} geldi"
        lengths = sorted(round(s["length"]) for s in segments)
        assert lengths == [2500, 2500, 2500, 2500]

    def test_farkli_layer_ve_isim_farketmez(self):
        """Blok adi rastgele, INSERT farkli layer'da — yine boler."""
        doc = _make_doc_with_inserts(
            [(4000, 0)], block_name="ABC", insert_layer="BAMBASKA",
        )
        segments, _ = _extract_segments("", ["BORU"], doc=doc)
        assert len(segments) == 2
        lengths = sorted(round(s["length"]) for s in segments)
        assert lengths == [4000, 6000]

    def test_boru_disindaki_insert_dokunmaz(self):
        """Insertion point boru guzergahinda DEGIL (500 birim uzakta) → bolme yok."""
        doc = _make_doc_with_inserts([(5000, 500)])
        segments, _ = _extract_segments("", ["BORU"], doc=doc)
        assert len(segments) == 1
        assert round(segments[0]["length"]) == 10000

    def test_uc_noktasindaki_insert_bolmez_ama_ayirir(self):
        """INSERT borunun UCUNDA (0,0) → yeni bolme yok, segment sayisi ayni."""
        doc = _make_doc_with_inserts([(0, 0)])
        segments, _ = _extract_segments("", ["BORU"], doc=doc)
        assert len(segments) == 1
        assert round(segments[0]["length"]) == 10000


class TestSplitEdgesPure:
    """ezdxf'siz saf fonksiyon testleri."""

    def _edge(self, x1, y1, x2, y2, layer="L"):
        import math
        return {"layer": layer, "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                "length": math.hypot(x2 - x1, y2 - y1)}

    def test_orta_nokta_boler(self):
        edges = [self._edge(0, 0, 100, 0)]
        new_edges, keys = _split_edges_on_insert_points(edges, [(50, 0)], node_tol=1.0)
        assert len(new_edges) == 2
        assert len(keys) == 1

    def test_epsilon_ici_hafif_sapma_boler(self):
        """Nokta cizgiden 0.5 birim sapmis (epsilon=1.0 ici) → yine boler."""
        edges = [self._edge(0, 0, 100, 0)]
        new_edges, keys = _split_edges_on_insert_points(edges, [(50, 0.5)], node_tol=1.0)
        assert len(new_edges) == 2

    def test_epsilon_disi_dokunmaz(self):
        edges = [self._edge(0, 0, 100, 0)]
        new_edges, keys = _split_edges_on_insert_points(edges, [(50, 5.0)], node_tol=1.0)
        assert len(new_edges) == 1
        assert len(keys) == 0

    def test_ayni_cizgide_coklu_nokta(self):
        edges = [self._edge(0, 0, 100, 0)]
        new_edges, _ = _split_edges_on_insert_points(
            edges, [(25, 0), (50, 0), (75, 0)], node_tol=1.0,
        )
        assert len(new_edges) == 4
