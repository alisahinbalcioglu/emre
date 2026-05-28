"""pipe_segments segment uzunluk dogrulugu — 10x hata (0.38 vs 3.81) hipotez testi.

Kullanici raporu: P2-P3 boru gercekte 3.81m ama tooltip 0.38m (10x kucuk).
Bu testler pipe_segments'in duz cizgiyi ve T-junction'i dogru uzunlukta
uretip uretmedigini izole dogrular.
"""
from __future__ import annotations
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
import ezdxf
from pipe_segments import _extract_segments


def _seg_length(seg) -> float:
    """Segment dict veya obje — length alanini don."""
    if isinstance(seg, dict):
        return float(seg["length"])
    return float(getattr(seg, "length"))


class TestSegmentLengthAccuracy:
    def test_duz_cizgi_tek_segment_ham_uzunluk(self):
        """T-junction YOK, duz 3810mm yatay cizgi -> tek segment, length=3810 ham unit.
        (scale main.py'de uygulanir; burada ham beklenir.)"""
        doc = ezdxf.new()
        doc.modelspace().add_line((0, 0), (3810, 0), dxfattribs={"layer": "PIS SU"})
        segments, _ = _extract_segments(
            dxf_path=None, pipe_layers=["PIS SU"], unit_scale=0.001, doc=doc,
        )
        assert len(segments) == 1, f"duz cizgi {len(segments)} parcaya bolundu (1 olmali)"
        L = _seg_length(segments[0])
        assert abs(L - 3810) < 1.0, f"length={L}, beklenen 3810 (10x hata?)"

    def test_t_junction_toplam_uzunluk_korunur(self):
        """Yatay ana hat (4000mm) + ortada degen dikey kol (1000mm).
        T-noktasinda bolunur ama TOPLAM uzunluk korunur (4000+1000=5000)."""
        doc = ezdxf.new()
        msp = doc.modelspace()
        msp.add_line((0, 0), (4000, 0), dxfattribs={"layer": "PIS SU"})      # ana hat
        msp.add_line((2000, 0), (2000, 1000), dxfattribs={"layer": "PIS SU"})  # dikey kol
        segments, _ = _extract_segments(
            dxf_path=None, pipe_layers=["PIS SU"], unit_scale=0.001, doc=doc,
        )
        total = sum(_seg_length(s) for s in segments)
        assert abs(total - 5000) < 5.0, f"toplam={total}, beklenen 5000 (kayip/sisme var)"

    def test_lwpolyline_uzunluk_dogru(self):
        """LWPOLYLINE 3 vertex (L-sekli): 3000 + 4000 = 7000mm toplam."""
        doc = ezdxf.new()
        msp = doc.modelspace()
        msp.add_lwpolyline([(0, 0), (3000, 0), (3000, 4000)], dxfattribs={"layer": "PIS SU"})
        segments, _ = _extract_segments(
            dxf_path=None, pipe_layers=["PIS SU"], unit_scale=0.001, doc=doc,
        )
        total = sum(_seg_length(s) for s in segments)
        assert abs(total - 7000) < 5.0, f"toplam={total}, beklenen 7000"

    @pytest.mark.xfail(reason="BILINEN SINIRLAMA: pipe_segments block (INSERT) icindeki "
                              "borulari almiyor -> block-ici borular metrajda kayip. "
                              "Kullanicinin 0.38m segmenti top-level oldugu icin bu bug onu "
                              "etkilemiyor; ayri issue.")
    def test_block_insert_scale_uygulanir(self):
        """Block icinde 381mm boru, insert scale=10 -> world 3810mm beklenir.
        Su an 0 segment (block icine girilmiyor) -> xfail. Eleme: kullanicinin
        gorunen segmenti top-level, yani 10x hata block-scale'den DEGIL."""
        doc = ezdxf.new()
        blk = doc.blocks.new(name="PIPE_BLK")
        blk.add_line((0, 0), (381, 0), dxfattribs={"layer": "PIS SU"})  # block-space 381
        msp = doc.modelspace()
        msp.add_blockref("PIPE_BLK", (0, 0), dxfattribs={"xscale": 10, "yscale": 10})  # world 3810
        segments, _ = _extract_segments(
            dxf_path=None, pipe_layers=["PIS SU"], unit_scale=0.001, doc=doc,
        )
        total = sum(_seg_length(s) for s in segments)
        # Teshis: 3810=dogru, 381=block-scale kacti (BUG), 0=block icine girmiyor
        assert len(segments) > 0, "block icindeki boru HIC alinmadi (0 segment)"
        assert abs(total - 3810) < 5.0, (
            f"toplam={total}: 381 ise block-scale kacti (10x bug), 3810 ise dogru"
        )
