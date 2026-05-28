"""Birim normalizasyon entegrasyon testi (PRD: TAHMIN YOK, kullanici secimi).

analyze_dxf_metraj scale parametresini deterministik uygular:
  scale=None -> mm varsayilan (0.001)
  scale=0.01 -> cm, scale=1.0 -> m
Metraj = ham_uzunluk * scale (= ham / UNIT_SCALE_TO_METER).

Bu test kullanicinin 10x sorununu da belgeler: ayni ham uzunluk farkli birim
secimiyle farkli metre verir -> dogru birimi kullanici secer.
"""
from __future__ import annotations
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ezdxf
from main import analyze_dxf_metraj


def _make_dxf(length_units: float) -> str:
    doc = ezdxf.new()
    doc.modelspace().add_line((0, 0), (length_units, 0), dxfattribs={"layer": "PIS SU"})
    path = tempfile.mktemp(suffix=".dxf")
    doc.saveas(path)
    return path


class TestScaleNormalization:
    def test_scale_none_mm_varsayilan(self):
        """scale=None -> mm varsayilan (tahmin YOK). 3810 unit * 0.001 = 3.81m."""
        path = _make_dxf(3810)
        try:
            res = analyze_dxf_metraj(path, scale=None, selected_layers=["PIS SU"])
            assert res.detected_unit == "mm", f"unit={res.detected_unit}"
            assert abs(res.total_length - 3.81) < 0.05, f"total={res.total_length}"
        finally:
            os.remove(path)

    def test_scale_cm_uygulanir(self):
        """scale=0.01 (cm) -> 381 unit * 0.01 = 3.81m. Kullanici cm secince 10x duzelir."""
        path = _make_dxf(381)
        try:
            res = analyze_dxf_metraj(path, scale=0.01, selected_layers=["PIS SU"])
            assert res.detected_unit == "cm", f"unit={res.detected_unit}"
            assert abs(res.total_length - 3.81) < 0.05, f"total={res.total_length}"
        finally:
            os.remove(path)

    def test_scale_m_uygulanir(self):
        """scale=1.0 (m) -> 4 unit * 1 = 4m."""
        path = _make_dxf(4)
        try:
            res = analyze_dxf_metraj(path, scale=1.0, selected_layers=["PIS SU"])
            assert res.detected_unit == "m", f"unit={res.detected_unit}"
            assert abs(res.total_length - 4.0) < 0.05, f"total={res.total_length}"
        finally:
            os.remove(path)

    def test_10x_senaryo_birim_secimi(self):
        """KULLANICI 10x KONTROLU: ayni 381 unit ham cizgi.
        mm secilirse 0.381m, cm secilirse 3.81m -> dogru birimi kullanici secer."""
        path = _make_dxf(381)
        try:
            res_mm = analyze_dxf_metraj(path, scale=0.001, selected_layers=["PIS SU"])
            res_cm = analyze_dxf_metraj(path, scale=0.01, selected_layers=["PIS SU"])
            assert abs(res_mm.total_length - 0.381) < 0.02, f"mm={res_mm.total_length}"
            assert abs(res_cm.total_length - 3.81) < 0.05, f"cm={res_cm.total_length}"
        finally:
            os.remove(path)
