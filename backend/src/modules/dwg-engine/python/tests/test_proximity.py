"""
Proximity diameter assignment — unit tests.

Kapsam:
  1. Regex (`_CAP_PATTERN`): kabul/reddet matrisleri, kesir whitelist (payda 2/4/8/16),
     Unicode kesirler (½¼¾), inç varyantlari (", ″, '').
  2. `_autocad_decode`: %%c, %%d, %%p ve MTEXT stacked fraction (\\S2/3; \\S2#3; \\S2^3;).
  3. `_extract_block_texts`: tek seviye + nested INSERT + cyclic guard + max depth
     + rotation + scale + negatif scale (mirror) + layer-0 BYLAYER konvansiyonu.
  4. `_extract_all_texts` entegrasyon: modelspace + INSERT block_text + sprinkler exclude.
  5. `assign_diameters_by_proximity`: mutual nearest atama, manuel override koruma,
     pool size guard warning.

ezdxf 1.x ile synthetic DXF dosyalari uretip test eder — gercek DWG'ye gerek yok.
"""
from __future__ import annotations

import math
import os
import sys

# proximity_diameter.py'i import edebilmek icin parent path
_HERE = os.path.dirname(os.path.abspath(__file__))
_PARENT = os.path.dirname(_HERE)
if _PARENT not in sys.path:
    sys.path.insert(0, _PARENT)

import pytest
import ezdxf

from proximity_diameter import (
    _CAP_PATTERN,
    _autocad_decode,
    _extract_block_texts,
    _extract_all_texts,
    assign_diameters_by_proximity,
)


# ════════════════════════════════════════════════════════════════════════
#  1) REGEX — _CAP_PATTERN
# ════════════════════════════════════════════════════════════════════════

class TestCapPatternAccepts:
    """Kabul edilmesi gereken cap formatlari."""

    @pytest.mark.parametrize("txt,expected", [
        ("Ø50", "Ø50"),
        ("Ø 200", "Ø 200"),
        ("Ø125", "Ø125"),
        ("DN100", "DN100"),
        ("DN 150", "DN 150"),
        ("dn50", "dn50"),
        ("50mm", "50mm"),
        ("100 mm", "100 mm"),
        ('1"', '1"'),
        ('2"', '2"'),
        ('1 "', '1 "'),
        ("1''", "1''"),       # iki tek-tirnak (AutoCAD/TR klavye)
        ("1 ''", "1 ''"),     # bosluklu
        ("1/2", "1/2"),       # cıplak inc kesir
        ('1/2"', '1/2"'),
        ("3/4", "3/4"),
        ("5/8", "5/8"),
        ("7/16", "7/16"),
        ("1 1/4", "1 1/4"),   # mixed
        ('1 1/2"', '1 1/2"'),
        ("21/2", "21/2"),     # stacked fraction bitisik
        ('21/2"', '21/2"'),
        ("1¼", "1¼"),         # Unicode kesir
        ('1¼"', '1¼"'),
        ('2½"', '2½"'),
        ("HDPE 100 PN 16 Ø200", "Ø200"),  # kombine icinde
        ("BANYO Ø20", "Ø20"),
    ])
    def test_accepts(self, txt, expected):
        m = _CAP_PATTERN.search(txt)
        assert m is not None, f"{txt!r} cap olarak yakalanmaliydi"
        assert m.group(0) == expected, f"{txt!r} -> {m.group(0)!r}, beklenen {expected!r}"


class TestCapPatternRejects:
    """Reddedilmesi gereken (sahte cap) text'ler."""

    @pytest.mark.parametrize("txt", [
        # Sahte kesir formatlari (payda whitelist disi: 2/4/8/16)
        "100/210",     # kanal olcusu
        "90/210",
        "1/50",
        "50/50",
        "1/3",         # tek paydasi standart inc degil
        "1/5",
        "1/7",
        # Sembol/baslik
        "YD",
        "YK",
        "YANGIN DOLABI",
        "F",
        # Ciplak sayilar (cap belirteci yok)
        "5",
        "10",
        "100",
        # Bos
        "",
        # Cap belirteci olmayan etiketler
        "PAFTA",
        "Plan üzerinde",
    ])
    def test_rejects(self, txt):
        m = _CAP_PATTERN.search(txt)
        assert m is None, f"{txt!r} reddedilmeliydi ama yakalandi: {m.group(0)!r}"


# ════════════════════════════════════════════════════════════════════════
#  2) _autocad_decode — escape + stacked fraction normalize
# ════════════════════════════════════════════════════════════════════════

class TestAutocadDecode:

    def test_diameter_escape(self):
        assert _autocad_decode("%%c50") == "Ø50"
        assert _autocad_decode("%%C100") == "Ø100"

    def test_degree_escape(self):
        assert _autocad_decode("90%%d") == "90°"

    def test_plusminus_escape(self):
        assert _autocad_decode("%%p5") == "±5"

    def test_stacked_fraction_slash(self):
        # MTEXT \S2/3; -> 2/3
        assert _autocad_decode(r"\S2/3;") == "2/3"
        assert _autocad_decode(r"size: \S1/2; inch") == "size: 1/2 inch"

    def test_stacked_fraction_hash(self):
        # \S2#3; -> 2/3 (hash separator slash'a normalize)
        assert _autocad_decode(r"\S2#3;") == "2/3"
        # Inch ekiyle: raw string ile \S + normal string ile " concat
        assert _autocad_decode(r'\S1#2;' + '"') == '1/2"'

    def test_stacked_fraction_caret(self):
        # \S2^3; -> 2/3
        assert _autocad_decode(r"\S2^3;") == "2/3"

    def test_stacked_fraction_with_spaces(self):
        # White space tolerance — \S 2 / 3 ;
        assert _autocad_decode(r"\S 2 / 3 ;") == "2/3"

    def test_standalone_hash_NOT_touched(self):
        # Guvenlik: \S...; disindaki "Profil#3" tarzi text'ler degismemeli
        assert _autocad_decode("Profil#3") == "Profil#3"
        assert _autocad_decode("A^B") == "A^B"

    def test_empty(self):
        assert _autocad_decode("") == ""
        assert _autocad_decode(None) == ""


# ════════════════════════════════════════════════════════════════════════
#  3) _extract_block_texts — block expansion + transforms
# ════════════════════════════════════════════════════════════════════════

def _make_doc_with_block(
    block_name="CAP_TAG",
    block_text='1¼"',
    text_local_pos=(0.0, 0.0),
    text_layer="0",
):
    """Helper: bir block tanimi + bir INSERT iceren synthetic DXF doc uretir."""
    doc = ezdxf.new(dxfversion="R2018")
    block = doc.blocks.new(name=block_name)
    block.add_text(
        block_text,
        dxfattribs={"insert": text_local_pos, "height": 50, "layer": text_layer},
    )
    return doc, block


class TestBlockTextExtraction:

    def test_single_level_no_transform(self):
        """Block icinde TEXT(0,0), INSERT(100,200), rot=0, scale=1 -> world (100,200)."""
        doc, _ = _make_doc_with_block(block_text='1¼"', text_local_pos=(0, 0))
        ins = doc.modelspace().add_blockref(
            "CAP_TAG", insert=(100, 200),
            dxfattribs={"layer": "A_Yangin_Cap"},
        )
        results = _extract_block_texts(doc, ins)
        assert len(results) == 1
        txt, wx, wy, layer = results[0]
        assert txt == '1¼"'
        assert math.isclose(wx, 100.0, abs_tol=1e-6)
        assert math.isclose(wy, 200.0, abs_tol=1e-6)
        # Block TEXT layer "0" -> parent INSERT layer
        assert layer == "A_Yangin_Cap"

    def test_single_level_with_local_offset(self):
        """TEXT lokal (5,3), INSERT (100,200) -> world (105, 203)."""
        doc, _ = _make_doc_with_block(text_local_pos=(5, 3))
        ins = doc.modelspace().add_blockref(
            "CAP_TAG", insert=(100, 200), dxfattribs={"layer": "L1"},
        )
        results = _extract_block_texts(doc, ins)
        assert len(results) == 1
        _, wx, wy, _ = results[0]
        assert math.isclose(wx, 105.0, abs_tol=1e-6)
        assert math.isclose(wy, 203.0, abs_tol=1e-6)

    def test_rotation_90_deg(self):
        """Rotation 90°: lokal (10, 0) -> world (0, 10) (+ insert offset)."""
        doc, _ = _make_doc_with_block(text_local_pos=(10, 0))
        ins = doc.modelspace().add_blockref(
            "CAP_TAG", insert=(100, 100),
            dxfattribs={"layer": "L1", "rotation": 90.0},
        )
        results = _extract_block_texts(doc, ins)
        _, wx, wy, _ = results[0]
        # (10, 0) rotate 90 -> (0, 10), + insert (100, 100) -> (100, 110)
        assert math.isclose(wx, 100.0, abs_tol=1e-6)
        assert math.isclose(wy, 110.0, abs_tol=1e-6)

    def test_negative_scale_mirror(self):
        """sx=-1 (X mirror): lokal (5, 3) -> world (insert.x - 5, insert.y + 3)."""
        doc, _ = _make_doc_with_block(text_local_pos=(5, 3))
        ins = doc.modelspace().add_blockref(
            "CAP_TAG", insert=(100, 200),
            dxfattribs={"layer": "L1", "xscale": -1.0, "yscale": 1.0},
        )
        results = _extract_block_texts(doc, ins)
        _, wx, wy, _ = results[0]
        # X mirror: lokal x=5 -> -5 -> world 100 + (-5) = 95
        # Y aynı: 200 + 3 = 203
        assert math.isclose(wx, 95.0, abs_tol=1e-6)
        assert math.isclose(wy, 203.0, abs_tol=1e-6)

    def test_uniform_scale(self):
        """sx=sy=2: lokal (5, 3) -> world (insert + (10, 6))."""
        doc, _ = _make_doc_with_block(text_local_pos=(5, 3))
        ins = doc.modelspace().add_blockref(
            "CAP_TAG", insert=(0, 0),
            dxfattribs={"layer": "L1", "xscale": 2.0, "yscale": 2.0},
        )
        results = _extract_block_texts(doc, ins)
        _, wx, wy, _ = results[0]
        assert math.isclose(wx, 10.0, abs_tol=1e-6)
        assert math.isclose(wy, 6.0, abs_tol=1e-6)

    def test_block_text_explicit_layer_kept(self):
        """Block icindeki TEXT'in kendi layer'i '0' degilse o kullanilmali."""
        doc, _ = _make_doc_with_block(text_layer="THEME_LAYER")
        ins = doc.modelspace().add_blockref(
            "CAP_TAG", insert=(0, 0), dxfattribs={"layer": "A_Yangin"},
        )
        results = _extract_block_texts(doc, ins)
        _, _, _, layer = results[0]
        # Block TEXT layer THEME_LAYER (degil "0") -> oldugu gibi
        assert layer == "THEME_LAYER"

    def test_block_text_layer_zero_inherits_parent(self):
        """Block icindeki TEXT layer '0' ise parent INSERT layer'ina dusurulur."""
        doc, _ = _make_doc_with_block(text_layer="0")
        ins = doc.modelspace().add_blockref(
            "CAP_TAG", insert=(0, 0), dxfattribs={"layer": "A_Parent"},
        )
        results = _extract_block_texts(doc, ins)
        _, _, _, layer = results[0]
        assert layer == "A_Parent"

    def test_nested_insert(self):
        """Block A icinde INSERT B, B icinde TEXT. Tek INSERT modelspace'te.

        Beklenen: TEXT pool'a girer (depth 1 nested), koordinatlar zincirleme."""
        doc = ezdxf.new(dxfversion="R2018")
        # Block B (inner): icinde TEXT
        block_b = doc.blocks.new(name="INNER")
        block_b.add_text('Ø75', dxfattribs={"insert": (0, 0), "height": 50, "layer": "0"})
        # Block A (outer): icinde INSERT B
        block_a = doc.blocks.new(name="OUTER")
        block_a.add_blockref("INNER", insert=(10, 20), dxfattribs={"layer": "0"})
        # Modelspace'te outer INSERT
        ins_outer = doc.modelspace().add_blockref(
            "OUTER", insert=(100, 200), dxfattribs={"layer": "L_OUTER"},
        )
        results = _extract_block_texts(doc, ins_outer)
        # TEXT inner blok'tan, parent outer'in transform'una ek olarak (10,20) inner
        # offset. Toplam world: (100+10, 200+20) = (110, 220).
        assert any(t[0] == 'Ø75' for t in results)
        ø75 = next(t for t in results if t[0] == 'Ø75')
        _, wx, wy, layer = ø75
        assert math.isclose(wx, 110.0, abs_tol=1e-6)
        assert math.isclose(wy, 220.0, abs_tol=1e-6)
        # Nested INSERT'in layer'i "0" -> outer layer'i devralir
        assert layer == "L_OUTER"

    def test_cyclic_block_reference_guard(self):
        """Block A INSERT B, Block B INSERT A — cyclic. Patlamasin, sonsuz dongu olmasin."""
        doc = ezdxf.new(dxfversion="R2018")
        block_a = doc.blocks.new(name="CYCLE_A")
        block_b = doc.blocks.new(name="CYCLE_B")
        block_a.add_blockref("CYCLE_B", insert=(0, 0))
        block_b.add_blockref("CYCLE_A", insert=(0, 0))
        block_a.add_text("Ø50", dxfattribs={"insert": (0, 0), "height": 50, "layer": "0"})
        ins = doc.modelspace().add_blockref("CYCLE_A", insert=(0, 0), dxfattribs={"layer": "L1"})
        # Stack overflow olmamali — guard set ile durur
        results = _extract_block_texts(doc, ins)
        # En azindan Ø50 bir kez gelmeli
        assert any(t[0] == "Ø50" for t in results)

    def test_unknown_block_name_returns_empty(self):
        doc = ezdxf.new()
        ins = doc.modelspace().add_blockref("NOEXIST", insert=(0, 0))
        results = _extract_block_texts(doc, ins)
        assert results == []


# ════════════════════════════════════════════════════════════════════════
#  4) _extract_all_texts — entegrasyon (modelspace + block_text + filter)
# ════════════════════════════════════════════════════════════════════════

class TestExtractAllTexts:

    def test_modelspace_text_picked(self):
        doc = ezdxf.new()
        msp = doc.modelspace()
        msp.add_text("Ø50", dxfattribs={"insert": (0, 0), "height": 50, "layer": "L1"})
        msp.add_text("YANGIN DOLABI", dxfattribs={"insert": (50, 50), "height": 30, "layer": "L1"})
        texts = _extract_all_texts(doc)
        values = [t["value"] for t in texts]
        assert "Ø50" in values
        # YANGIN DOLABI cap belirteci icermez -> reddedilir
        assert "YANGIN DOLABI" not in values

    def test_insert_block_text_picked(self):
        """INSERT block icindeki TEXT pool'a girmeli."""
        doc = ezdxf.new()
        block = doc.blocks.new(name="CAP")
        block.add_text('1¼"', dxfattribs={"insert": (0, 0), "height": 50, "layer": "0"})
        doc.modelspace().add_blockref("CAP", insert=(100, 200), dxfattribs={"layer": "A_Cap"})
        doc.modelspace().add_blockref("CAP", insert=(300, 400), dxfattribs={"layer": "A_Cap"})
        texts = _extract_all_texts(doc)
        # 2 INSERT = 2 ayri pozisyonda '1¼"' text
        positions = [(t["x"], t["y"]) for t in texts if t["value"] == '1¼"']
        assert len(positions) == 2
        assert (100, 200) in positions
        assert (300, 400) in positions
        # Layer parent INSERT'inden devraldi (block TEXT layer "0")
        for t in texts:
            if t["value"] == '1¼"':
                assert t["layer"] == "A_Cap"

    def test_sprinkler_layer_excluded(self):
        """Sprinkler layer'larindaki block TEXT'ler de filtrelenmeli."""
        doc = ezdxf.new()
        block = doc.blocks.new(name="CAP")
        block.add_text("Ø50", dxfattribs={"insert": (0, 0), "height": 50, "layer": "0"})
        doc.modelspace().add_blockref("CAP", insert=(0, 0), dxfattribs={"layer": "Sprinkler"})
        doc.modelspace().add_blockref("CAP", insert=(100, 0), dxfattribs={"layer": "NotSprinkler"})
        texts = _extract_all_texts(doc, excluded_layers={"Sprinkler"})
        layers = [t["layer"] for t in texts]
        assert "NotSprinkler" in layers
        assert "Sprinkler" not in layers

    def test_debug_rejected_captured(self):
        """debug_rejected verildiyse cap belirteci olmayan text'ler oraya gider."""
        doc = ezdxf.new()
        msp = doc.modelspace()
        msp.add_text("Ø50", dxfattribs={"insert": (0, 0), "height": 50, "layer": "L1"})
        msp.add_text("YD", dxfattribs={"insert": (10, 10), "height": 30, "layer": "L1"})
        rejected: list[dict] = []
        texts = _extract_all_texts(doc, debug_rejected=rejected)
        assert len(texts) == 1  # sadece Ø50
        assert any(r["raw"] == "YD" for r in rejected)


# ════════════════════════════════════════════════════════════════════════
#  5) assign_diameters_by_proximity — segment-perspective naive nearest
#     (max_distance, paylasimli atama, diagnostic)
# ════════════════════════════════════════════════════════════════════════

class _FakeEdge:
    """Test icin minimal edge_segment stub (proximity'nin bekledigi interface)."""
    def __init__(self, segment_id, x1, y1, x2, y2, layer="L1", diameter=""):
        self.segment_id = segment_id
        self.coords = (x1, y1, x2, y2)
        self.polyline: list = []
        self.layer = layer
        self.diameter = diameter


class TestAssignDiametersByProximity:

    def test_basic_assignment(self):
        """Bir segment + onun yakininda bir cap text -> atama yapilmali."""
        doc = ezdxf.new()
        msp = doc.modelspace()
        msp.add_text("Ø50", dxfattribs={"insert": (5, 0), "height": 50, "layer": "L1"})
        edges = [_FakeEdge(1, 0, 0, 10, 0)]
        result = assign_diameters_by_proximity(doc, edges)
        assert result["assigned_count"] == 1
        assert edges[0].diameter == "Ø50"

    def test_manual_override_preserved(self):
        """Onceden manuel cap girilmis segment otomatik override edilmez."""
        doc = ezdxf.new()
        msp = doc.modelspace()
        msp.add_text("Ø100", dxfattribs={"insert": (5, 0), "height": 50, "layer": "L1"})
        edges = [_FakeEdge(1, 0, 0, 10, 0, diameter="DN200")]
        assign_diameters_by_proximity(doc, edges)
        assert edges[0].diameter == "DN200"  # degismedi

    def test_no_text_pool(self):
        """Hicbir cap-text yoksa warning + atama yok."""
        doc = ezdxf.new()
        doc.modelspace().add_text("YANGIN DOLABI",
                                   dxfattribs={"insert": (0, 0), "height": 30, "layer": "L1"})
        edges = [_FakeEdge(1, 0, 0, 10, 0)]
        result = assign_diameters_by_proximity(doc, edges)
        assert result["assigned_count"] == 0
        assert result["text_pool_size"] == 0
        assert any("cap belirteci" in w.lower() for w in result["warnings"])

    def test_far_segment_not_assigned_due_to_max_distance(self):
        """Tek text + 2 segment: yakin segment alir, uzak segment Belirtilmemis kalir.

        Default max_distance = 2000mm. Uzak segment 1000 birim ileride (DWG world)
        ama text'le aralarinda 1000-3000mm mesafe -> max_distance asilir, atanmaz."""
        doc = ezdxf.new()
        doc.modelspace().add_text("Ø75",
                                   dxfattribs={"insert": (5, 0), "height": 50, "layer": "L1"})
        edges = [
            _FakeEdge(1, 0, 0, 10, 0),                    # text yakin
            _FakeEdge(2, 0, 5000, 10, 5000),              # text 5000 uzak (>2000)
        ]
        result = assign_diameters_by_proximity(doc, edges)
        assert edges[0].diameter == "Ø75"
        assert edges[1].diameter in ("", "Belirtilmemis", None)
        assert result["assigned_count"] == 1

    def test_shared_text_between_two_close_segments(self):
        """Ayni cap-text 2 yakin segmente paylasilabilir (T-junction senaryosu).

        Onceki mutual nearest mantigi text'i sadece TEK segmente atadigi icin
        diger segment Belirtilmemis kaliyordu. Segment-perspective: ikisi de alir."""
        doc = ezdxf.new()
        doc.modelspace().add_text("Ø50",
                                   dxfattribs={"insert": (5, 0), "height": 50, "layer": "L1"})
        edges = [
            _FakeEdge(1, 0, 0, 10, 0),    # text segment uzerinde
            _FakeEdge(2, 5, 0, 5, 50),    # text bu segment'in baslangic noktasinda
        ]
        result = assign_diameters_by_proximity(doc, edges)
        # IKISI de Ø50 almalı — paylasimli atama (T-junction'da dogal)
        assert edges[0].diameter == "Ø50"
        assert edges[1].diameter == "Ø50"
        assert result["assigned_count"] == 2

    def test_max_distance_override_to_unlimited(self):
        """max_distance=0 verildiginde sinir kapanmali (eski davranis)."""
        doc = ezdxf.new()
        doc.modelspace().add_text("Ø100",
                                   dxfattribs={"insert": (10000, 0), "height": 50, "layer": "L1"})
        edges = [_FakeEdge(1, 0, 0, 10, 0)]
        # Default ile uzak (10000 birim) -> atanmaz
        result_default = assign_diameters_by_proximity(doc, edges)
        assert result_default["assigned_count"] == 0
        # max_distance=0 (sinir kapali) -> atanir
        edges2 = [_FakeEdge(1, 0, 0, 10, 0)]
        result_unlimited = assign_diameters_by_proximity(doc, edges2, max_distance_world=0)
        assert result_unlimited["assigned_count"] == 1
        assert edges2[0].diameter == "Ø100"

    def test_uzak_text_kazanamaz_bug_regression(self):
        """REGRESYON TESTI: kullanici raporu — borunun yaninda 'Ø50' var ama
        baska layer'da uzakta '1\"' var; mevcut mantik '1\"' atadi. Yeni mantik
        (segment-perspective + max_distance) yakin Ø50'yi atamali."""
        doc = ezdxf.new()
        msp = doc.modelspace()
        # Borunun YANINDA Ø50 text
        msp.add_text("Ø50", dxfattribs={"insert": (5, 5), "height": 50, "layer": "L1"})
        # UZAKTA, baska layer'da, 1" text
        msp.add_text('1"', dxfattribs={"insert": (10000, 10000), "height": 50,
                                       "layer": "BAŞKA_LAYER"})
        edges = [_FakeEdge(1, 0, 0, 10, 0, layer="L1")]
        result = assign_diameters_by_proximity(doc, edges)
        assert edges[0].diameter == "Ø50", (
            f"Yakin Ø50 yerine uzak text atanmis: {edges[0].diameter!r}"
        )

    def test_pool_size_guard_warning(self):
        """Pool >3000 olunca uyari ekleniyor (synthetic test)."""
        doc = ezdxf.new()
        msp = doc.modelspace()
        # 3010 cap text ekle — pool size guard'i tetiklesin
        for i in range(3010):
            msp.add_text(f"Ø{i % 200}",
                         dxfattribs={"insert": (i * 10, 0), "height": 50, "layer": "L1"})
        edges = [_FakeEdge(1, 0, 0, 10, 0)]
        result = assign_diameters_by_proximity(doc, edges)
        # Warning iceriginde "BUYUK" geciyor mu
        assert any("buyuk" in w.lower() or "büyük" in w.lower() for w in result["warnings"])

    def test_block_text_to_segment_assignment(self):
        """INSERT block icinde TEXT olan cap -> yakindaki segmente atanir."""
        doc = ezdxf.new()
        block = doc.blocks.new(name="CAP_TAG")
        block.add_text('1¼"',
                       dxfattribs={"insert": (0, 0), "height": 50, "layer": "0"})
        doc.modelspace().add_blockref("CAP_TAG", insert=(5, 0),
                                       dxfattribs={"layer": "A_Cap"})
        edges = [_FakeEdge(1, 0, 0, 10, 0)]
        result = assign_diameters_by_proximity(doc, edges)
        assert result["assigned_count"] == 1
        assert edges[0].diameter == '1¼"'

    def test_diagnostic_fields_present(self):
        """assign sonucunda debug_rejected_texts + debug_accepted_sample dolu olmali."""
        doc = ezdxf.new()
        msp = doc.modelspace()
        msp.add_text("Ø50", dxfattribs={"insert": (0, 0), "height": 50, "layer": "L1"})
        msp.add_text("YD", dxfattribs={"insert": (50, 50), "height": 30, "layer": "L1"})
        edges = [_FakeEdge(1, 0, 0, 10, 0)]
        result = assign_diameters_by_proximity(doc, edges)
        assert "debug_rejected_texts" in result
        assert "debug_accepted_sample" in result
        assert "debug_assignment_sample" in result
        assert any(r["raw"] == "YD" for r in result["debug_rejected_texts"])
        assert any(s["value"] == "Ø50" for s in result["debug_accepted_sample"])
        # assignment_sample'da segmente atanan cap + mesafe gozukmeli
        assert len(result["debug_assignment_sample"]) >= 1
        first = result["debug_assignment_sample"][0]
        assert first["assigned_diameter"] == "Ø50"
        assert first["distance_world"] >= 0.0
        assert "text_layer" in first
        assert "segment_layer" in first
