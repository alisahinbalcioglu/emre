"""Unit tests for `_auto_detect_scale` in main.py.

Senaryolar:
  1. Bound dominant: tek scale (5m-500m) gecerli -> definitive.
  2. Bound coklu + metadata tutarli -> metadata tie-break.
  3. Bound coklu + metadata yok -> orta-yas (40m hedef).
  4. Bound yok + pipe physics yeterli sample (>=50) -> pipe physics.
  5. Pipe physics sample yetersiz (<50) + bound makul -> bound dominant.
  6. Regresyon: yangin DWG benzeri 66m × 24m bound + $INSUNITS=mm + zayif
     pipe sample -> mm (eski versiyonda m donerdi).
"""
from __future__ import annotations

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_PARENT = os.path.dirname(_HERE)
if _PARENT not in sys.path:
    sys.path.insert(0, _PARENT)

import pytest
import ezdxf

from main import _auto_detect_scale


def _new_doc(insunits: int, extmin=(0.0, 0.0, 0.0), extmax=(100.0, 100.0, 0.0)) -> ezdxf.document.Drawing:
    doc = ezdxf.new("R2018", setup=True)
    doc.header["$INSUNITS"] = insunits
    # ezdxf 3-tuple (x,y,z) bekliyor
    if len(extmin) == 2:
        extmin = (extmin[0], extmin[1], 0.0)
    if len(extmax) == 2:
        extmax = (extmax[0], extmax[1], 0.0)
    doc.header["$EXTMIN"] = extmin
    doc.header["$EXTMAX"] = extmax
    return doc


def _add_pipe_lines(doc, layer: str, lengths_units: list[float]):
    if layer not in doc.layers:
        doc.layers.add(layer)
    msp = doc.modelspace()
    x = 0.0
    for L in lengths_units:
        msp.add_line((x, 0), (x + L, 0), dxfattribs={"layer": layer})
        x += L + 1.0


class TestBoundDominant:
    def test_mm_bound_single_candidate(self):
        # 66m × 24m bina (mm cinsinden 66324 × 24000)
        doc = _new_doc(insunits=4, extmin=(0, 0), extmax=(66324, 24000))
        scale, label, reason = _auto_detect_scale(doc)
        assert scale == 0.001
        assert label == "mm"
        assert "Bound geometrisi" in reason

    def test_m_bound_single_candidate(self):
        # 50m × 30m bina (m cinsinden 50 × 30)
        doc = _new_doc(insunits=6, extmin=(0, 0), extmax=(50, 30))
        scale, label, _ = _auto_detect_scale(doc)
        assert scale == 1.0
        assert label == "m"

    def test_cm_bound_single_candidate(self):
        # 30m bina (cm cinsinden 3000)
        doc = _new_doc(insunits=5, extmin=(0, 0), extmax=(3000, 1500))
        # 3000 unit: mm=3m (out, <5m), cm=30m (in), m=3000m (out, >500m)
        scale, label, _ = _auto_detect_scale(doc)
        assert scale == 0.01
        assert label == "cm"


class TestBoundMultiCandidate:
    def test_metadata_tie_break(self):
        # 1000 unit bound: mm=1m (out), cm=10m (in), m=1000m (out, >500)
        # Sadece cm gecerli -> tek aday. Coklu icin daha kucuk bound lazim.
        # 500 unit: mm=0.5m (out), cm=5m (in, edge), m=500m (in, edge)
        doc = _new_doc(insunits=5, extmin=(0, 0), extmax=(500, 500))
        scale, label, reason = _auto_detect_scale(doc)
        # Hem cm hem m candidate; metadata cm dedi
        assert scale == 0.01
        assert label == "cm"

    def test_metadata_unknown_uses_middle_age(self):
        # Coklu aday, metadata yok -> orta-yas (40m hedef)
        # 500 unit + insunits=0 (bilinmiyor): cm=5m, m=500m
        # 40m'e en yakin: cm=5m (|5-40|=35), m=500m (|500-40|=460) -> cm
        doc = _new_doc(insunits=0, extmin=(0, 0), extmax=(500, 500))
        scale, label, _ = _auto_detect_scale(doc)
        assert scale == 0.01
        assert label == "cm"


class TestPipePhysicsFallback:
    def test_no_bound_pipe_physics_decides(self):
        # Bound yok -> pipe physics zorunlu fallback
        doc = ezdxf.new("R2018", setup=True)
        doc.header["$INSUNITS"] = 0
        # Pipe lengths: 60 segment, hepsi 500-3000 unit (mm cinsinde 0.5-3m: in range)
        _add_pipe_lines(doc, "PIS SU", [1000.0] * 60)
        scale, label, reason = _auto_detect_scale(doc)
        assert scale == 0.001
        assert label == "mm"
        assert "Pipe physics" in reason

    def test_insufficient_pipe_sample_ignored(self):
        # 18 sample (test DWG durumu) -> pipe physics ignored, bound dominant
        # Bound 66m mm makul, sample yetersiz oldugu icin pipe physics atlanir
        doc = _new_doc(insunits=4, extmin=(0, 0), extmax=(66000, 24000))
        # 18 segment uzun (m gibi gozukur ama sample yetersiz)
        _add_pipe_lines(doc, "PIS SU", [2.0] * 18)  # 2 unit each
        scale, label, _ = _auto_detect_scale(doc)
        assert scale == 0.001  # Bound mm zorlar
        assert label == "mm"


class TestRegressionYanginDWG:
    """Onceki bug: 66m × 24m yangin projesi (mm) yanlislikla m oluyordu."""

    def test_metaprice_yangin_scenario(self):
        doc = _new_doc(insunits=4, extmin=(0, 0), extmax=(66324, 23745))
        # Sample: 12x kucuk segment (0.86 unit avg) + 6x uzun (20-48 unit)
        # m scale ile %67 in-range gosterir AMA sample yetersiz (18 < 50)
        small_lens = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6]
        large_lens = [6.0, 10.0, 20.0, 30.0, 40.0, 48.0]
        _add_pipe_lines(doc, "TESISAT", small_lens + large_lens)
        scale, label, reason = _auto_detect_scale(doc)
        assert scale == 0.001, f"Beklenen mm, gelen {label} (reason: {reason})"
        assert label == "mm"
        # Bound dominant secimi yapmali
        assert "Bound geometrisi" in reason or "bound" in reason.lower()


class TestNoBoundFallback:
    def test_no_signals_falls_back_mm(self):
        doc = ezdxf.new("R2018", setup=True)
        doc.header["$INSUNITS"] = 0
        scale, label, _ = _auto_detect_scale(doc)
        assert scale == 0.001
        assert label == "mm"

    def test_metadata_only_no_bound(self):
        doc = ezdxf.new("R2018", setup=True)
        doc.header["$INSUNITS"] = 5  # cm
        scale, label, _ = _auto_detect_scale(doc)
        assert scale == 0.01
        assert label == "cm"
