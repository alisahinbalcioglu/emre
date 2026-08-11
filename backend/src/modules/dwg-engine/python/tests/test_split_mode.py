"""split_mode="none" — bolmesiz hesaplama (cizgi bastan sona tek parca).

KULLANICI ISTEGI (11.08, PANOVA): "segmentlerine ayirmadigimiz zaman cizginin
BASLADIGI ve BITTIGI yere cap atayabilmeliyim". Granularite = cizim entity'si;
T noktasi, kesisme, sprinkler bolmesi YOK. Metraj toplami degismez — yalniz
parca sinirlari kalkar.

split_mode="t" (varsayilan) mevcut davranistir ve mevcut testler onu muhurler;
bu dosya yalniz "none" sozlesmesini muhurler.
"""
import math
import os
import sys
import tempfile

import ezdxf
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pipe_segments import _extract_segments  # noqa: E402


def _fixture_doc():
    """Ana saft + 3 kol + sprinkler daireleri: bolme modunda 60+ parca olacak
    turden bir geometri; bolmesiz modda TAM 5 entity = 5 segment olmali."""
    doc = ezdxf.new("R2010", setup=True)
    msp = doc.modelspace()
    doc.layers.add("BORU")
    doc.layers.add("SPRİNK")

    # 1) Ana saft: tek LINE, 3 kolun tam ustunden geciyor (T noktalari olusur)
    msp.add_line((0, 0), (3000, 0), dxfattribs={"layer": "BORU"})
    # 2) Kollar: ana safta DEGEN 3 dikey LINE
    for x in (500, 1500, 2500):
        msp.add_line((x, 0), (x, 900), dxfattribs={"layer": "BORU"})
    # 3) L seklinde LWPOLYLINE (3 vertex) — entity butunlugu korunmali
    msp.add_lwpolyline([(0, 2000), (1000, 2000), (1000, 2600)],
                       dxfattribs={"layer": "BORU"})
    # 4) Kollarin ustune sprinkler daireleri (isaretlenirse "t" modunda boler)
    for x in (500, 1500, 2500):
        for y in (300, 600):
            msp.add_circle((x, y), radius=7.5, dxfattribs={"layer": "SPRİNK"})

    path = tempfile.mktemp(suffix=".dxf")
    doc.saveas(path)
    return doc, path


def test_none_modda_entity_esittir_segment():
    """5 entity (4 LINE + 1 LWPOLYLINE) -> TAM 5 segment. Bolme YOK."""
    doc, path = _fixture_doc()
    try:
        segs, centers = _extract_segments(
            path, ["BORU"], sprinkler_layers=["SPRİNK"],
            unit_scale=0.01, doc=doc, split_mode="none",
        )
        assert len(segs) == 5, f"{len(segs)} segment cikti: {[round(s['length']) for s in segs]}"
        # sprinkler isaretli OLSA BILE bolme yok — mod her seyi kapatir
        lens = sorted(round(s["length"], 1) for s in segs)
        assert lens == [900.0, 900.0, 900.0, 1600.0, 3000.0], lens
    finally:
        os.remove(path)


def test_none_modda_toplam_metraj_degismez():
    """Ayni geometri iki modda AYNI toplami vermeli — bolme uzunluk degistirmez."""
    doc, path = _fixture_doc()
    try:
        segs_t, _ = _extract_segments(
            path, ["BORU"], sprinkler_layers=["SPRİNK"],
            unit_scale=0.01, doc=doc, split_mode="t",
        )
        segs_n, _ = _extract_segments(
            path, ["BORU"], sprinkler_layers=["SPRİNK"],
            unit_scale=0.01, doc=doc, split_mode="none",
        )
        assert len(segs_t) > len(segs_n), "t modu bolmuyor — fixture bozuk"
        top_t = sum(s["length"] for s in segs_t)
        top_n = sum(s["length"] for s in segs_n)
        assert math.isclose(top_t, top_n, rel_tol=1e-6), f"{top_t} != {top_n}"
    finally:
        os.remove(path)


def test_none_modda_polyline_butunlugu_ve_vertexler():
    """LWPOLYLINE tek segment olur; vertex yolu polyline alaninda tasinir
    (viewer gercek L seklini cizebilsin, uzunluk yol toplamidir)."""
    doc, path = _fixture_doc()
    try:
        segs, _ = _extract_segments(
            path, ["BORU"], unit_scale=0.01, doc=doc, split_mode="none",
        )
        lpoly = [s for s in segs if round(s["length"], 1) == 1600.0]
        assert len(lpoly) == 1
        pl = lpoly[0]["polyline"]
        assert len(pl) == 3, f"vertex yolu tasinmadi: {pl}"
        # uclar: ilk ve son vertex
        assert (lpoly[0]["x1"], lpoly[0]["y1"]) == (0.0, 2000.0)
        assert (lpoly[0]["x2"], lpoly[0]["y2"]) == (1000.0, 2600.0)
    finally:
        os.remove(path)


def test_none_modda_layer_filtresi_calisir():
    """Secilmeyen layer'in entity'leri segmente girmez (SPRİNK daireleri zaten
    LINE degil; TARAMA benzeri baska layer eklenip dogrulanir)."""
    doc, path = _fixture_doc()
    try:
        msp = doc.modelspace()
        doc.layers.add("TARAMA")
        msp.add_line((0, -500), (1000, -500), dxfattribs={"layer": "TARAMA"})
        doc.saveas(path)
        segs, _ = _extract_segments(
            path, ["BORU"], unit_scale=0.01, doc=doc, split_mode="none",
        )
        assert all(s["layer"] == "BORU" for s in segs)
        assert len(segs) == 5
    finally:
        os.remove(path)


def test_gecersiz_mod_reddedilir():
    """Yazim hatasi sessizce 't' gibi davranmasin — gurultulu red."""
    doc, path = _fixture_doc()
    try:
        with pytest.raises(ValueError):
            _extract_segments(path, ["BORU"], unit_scale=0.01, doc=doc,
                              split_mode="hatali")
    finally:
        os.remove(path)


def test_varsayilan_mod_t_ve_davranis_degismedi():
    """split_mode verilmezse 't' — mevcut cagiranlarin davranisi AYNEN korunur."""
    doc, path = _fixture_doc()
    try:
        segs_default, _ = _extract_segments(
            path, ["BORU"], sprinkler_layers=["SPRİNK"], unit_scale=0.01, doc=doc,
        )
        segs_t, _ = _extract_segments(
            path, ["BORU"], sprinkler_layers=["SPRİNK"], unit_scale=0.01, doc=doc,
            split_mode="t",
        )
        assert len(segs_default) == len(segs_t)
        assert len(segs_default) > 5  # T + sprinkler bolmeleri gercekten var
    finally:
        os.remove(path)
