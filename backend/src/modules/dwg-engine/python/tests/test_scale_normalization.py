"""Birim normalizasyon entegrasyon testi.

SOZLESME DEGISTI (kullanici istegi: "tam otomatik"):
  ESKI: scale=None -> KOSULSUZ mm (sistem asla tahmin etmez).
  YENI: scale=None -> OTOMATIK TESPIT (unit_detect.detect_unit).
        Kanit hiyerarsisi: antet+olcek > yazi+olcek > fizik > $INSUNITS >
        (hicbiri yoksa) mm + "dusuk guven" bayragi.
  scale VERILMISSE kullanici override eder — davranis DEGISMEDI.

NEDEN DEGISTI: gercek bir yangin projesinde ($INSUNITS "mm" derken cizim
desimetreydi) kosulsuz mm varsayimi metraji 100x, kullanicinin elle sectigi
cm ise 10x yanlis veriyordu. Ayrinti: unit_detect.py modul basligi.

Metraj = ham_uzunluk * scale (= ham / UNIT_SCALE_TO_METER).
"""
from __future__ import annotations
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ezdxf
from main import analyze_dxf_metraj


def _make_dxf(length_units: float, insunits: int | None = None) -> str:
    doc = ezdxf.new()
    # DIKKAT: ezdxf.new() varsayilani $INSUNITS = 6 (METRE) — olculdu.
    # Bu yuzden birim testlerinde header'i DAIMA acikca ayarla, yoksa test
    # farkinda olmadan "metre" beyan eden bir cizimi olcer.
    if insunits is not None:
        doc.header["$INSUNITS"] = insunits
    doc.modelspace().add_line((0, 0), (length_units, 0), dxfattribs={"layer": "PIS SU"})
    path = tempfile.mktemp(suffix=".dxf")
    doc.saveas(path)
    return path


class TestScaleNormalization:
    def test_scale_none_INSUNITS_beyanina_uyar(self):
        """scale=None -> otomatik tespit. Baska kanit yoksa $INSUNITS beyani gecerli.

        $INSUNITS=4 (mm) diyorsa 3810 unit = 3.81 m.
        """
        path = _make_dxf(3810, insunits=4)
        try:
            res = analyze_dxf_metraj(path, scale=None, selected_layers=["PIS SU"])
            assert res.detected_unit == "mm", f"unit={res.detected_unit}"
            assert res.detection_method.startswith("insunits"), (
                f"method={res.detection_method}")
            assert abs(res.total_length - 3.81) < 0.05, f"total={res.total_length}"
        finally:
            os.remove(path)

    def test_scale_none_INSUNITS_metre_ise_metre(self):
        """Ayni cizim $INSUNITS=6 (m) beyan ediyorsa 3810 unit = 3810 m.

        Eskiden bu durum KOSULSUZ mm sayiliyor ve 3.81 m veriyordu — cizimin
        kendi beyanina ragmen 1000x hata.
        """
        path = _make_dxf(3810, insunits=6)
        try:
            res = analyze_dxf_metraj(path, scale=None, selected_layers=["PIS SU"])
            assert res.detected_unit == "m", f"unit={res.detected_unit}"
            assert abs(res.total_length - 3810.0) < 1.0, f"total={res.total_length}"
        finally:
            os.remove(path)

    def test_scale_none_hicbir_kanit_yoksa_mm_ve_DUSUK_GUVEN(self):
        """$INSUNITS=0 (unitless) + antet/olcek/yazi/sprinkler yok -> uydurma YOK.

        Deterministik mm varsayilir AMA guven 'dusuk' isaretlenir ki arayuz
        kullaniciyi uyarabilsin.
        """
        path = _make_dxf(3810, insunits=0)
        try:
            res = analyze_dxf_metraj(path, scale=None, selected_layers=["PIS SU"])
            assert res.detected_unit == "mm", f"unit={res.detected_unit}"
            assert res.detection_confidence == "dusuk", f"guven={res.detection_confidence}"
            assert abs(res.total_length - 3.81) < 0.05, f"total={res.total_length}"
        finally:
            os.remove(path)

    def test_kullanici_override_otomatigi_EZER(self):
        """scale acikca verilirse tespit calismaz — kullanici son sozu soyler."""
        path = _make_dxf(3810, insunits=6)  # cizim "metre" diyor
        try:
            res = analyze_dxf_metraj(path, scale=0.001, selected_layers=["PIS SU"])
            assert res.detected_unit == "mm", f"unit={res.detected_unit}"
            assert res.detection_confidence == "kullanici"
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
