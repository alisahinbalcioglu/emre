"""Sprinkler sembolu = HERHANGI geometri kumesi — bolme testleri.

GERCEK DOSYADA OLCULDU (02.09, `3-SPRINK` katmani, 743 sembol): sprinkler
isaretleri blok DEGIL; `YNG SPRİNK PENDENT` katmaninda 2 LINE (capraz) +
2 ELLIPSE + 1 HATCH olarak cizilmis. Motor sprinkler olarak yalniz
INSERT / kucuk CIRCLE / POINT tanidigi icin katman 💧 ile isaretlense bile
SIFIR merkez buluyor -> "T noktalarinda bol" sprinkler'da hic bolmuyordu.

Sozlesme (bu dosya muhurler):
  - 💧 isaretli katmandaki TUM cizim varliklari sembol parcasidir; bbox
    kesisimiyle kumelenir, kume merkezi sprinkler konumudur.
  - Boru kumenin icinden geciyorsa (merkez -> boru mesafesi <= yari-kosegen)
    boru o noktadan bolunur. Birim/olcek yanlis secilmis olsa bile calisir.
  - Secili boru katmaninin LINE/POLYLINE'lari ASLA sembol degildir (ayni
    katman kurali korunur).
  - Kume boyutu ag olcegine gore asiri buyukse (yanlislikla sembol katmanina
    cizilmis boru gibi) sembol sayilmaz ve komsu sembolleri yutmaz.
  - Ust uste kopyalanmis sembol (ayni yerde iki tane) TEK bolme uretir.

FIXTURE KANITI: her fixture'in dogru dali surdugu ayrica assert edilir
(sembol katmaninda INSERT/CIRCLE/POINT YOK — eski yol bos donmeli).
"""
from __future__ import annotations

import math
import os
import sys

import ezdxf
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pipe_segments import (  # noqa: E402
    _extract_segments,
    _network_diag,
    _sprinkler_centers_from_layers,
    _sprinkler_symbols_from_layers,
    sprinkler_layer_candidates,
)


def test_ag_kosegeni_az_kenarda_cokmez():
    """Boyut kapilari bu kosegene bagli: tek kenarli agda 0 donerse kapilar
    ya kapanir ya devre disi kalir. p5-p95 indeksi az kenarda cokuyordu."""
    tek = [{"x1": 0, "y1": 0, "x2": 3000, "y2": 0}]
    assert math.isclose(_network_diag(tek), 3000.0)
    iki = tek + [{"x1": 1000, "y1": 0, "x2": 1000, "y2": 900}]
    assert _network_diag(iki) > 2000.0
    assert _network_diag([]) == 0.0

BORU = "3-SPRINK"
SEMBOL = "YNG SPRİNK PENDENT"
SPACING = 300.0  # gercek dosyadaki komsu araligi (cm cizim, 3.0 m)


def _capraz_elips_tarama(msp, x: float, y: float, layer: str = SEMBOL) -> None:
    """Gercek dosyadaki sembol: 2 LINE capraz + 2 ELLIPSE + 1 HATCH (kare)."""
    msp.add_line((x - 11, y), (x + 11, y), dxfattribs={"layer": layer})
    msp.add_line((x, y - 11), (x, y + 11), dxfattribs={"layer": layer})
    msp.add_ellipse((x, y), major_axis=(18, 0), ratio=0.5, dxfattribs={"layer": layer})
    msp.add_ellipse((x, y), major_axis=(0, 18), ratio=0.5, dxfattribs={"layer": layer})
    h = msp.add_hatch(color=1, dxfattribs={"layer": layer})
    h.paths.add_polyline_path(
        [(x - 8, y - 8), (x + 8, y - 8), (x + 8, y + 8), (x - 8, y + 8)], is_closed=True,
    )


def _kapali_kare(msp, x: float, y: float, layer: str) -> None:
    """Ikinci aile: sembol = kapali LWPOLYLINE kare (blok/daire YOK)."""
    msp.add_lwpolyline(
        [(x - 8, y - 8), (x + 8, y - 8), (x + 8, y + 8), (x - 8, y + 8)],
        close=True, dxfattribs={"layer": layer},
    )


def _doc_yatay_boru(n_sembol: int, sembol=_capraz_elips_tarama, sembol_layer: str = SEMBOL):
    """(0,0)-(3000,0) tek LINE boru + SPACING araliginda n sembol (ilk x=300)."""
    doc = ezdxf.new("R2010", setup=True)
    doc.layers.add(BORU)
    doc.layers.add(sembol_layer)
    msp = doc.modelspace()
    msp.add_line((0, 0), (3000, 0), dxfattribs={"layer": BORU})
    for i in range(n_sembol):
        sembol(msp, SPACING * (i + 1), 0.0, sembol_layer)
    return doc


def _segs(doc, split_mode="t", sprinkler_layers=(SEMBOL,), unit_scale=0.01):
    segs, _ = _extract_segments(
        "", [BORU], sprinkler_layers=list(sprinkler_layers) or None,
        unit_scale=unit_scale, doc=doc, split_mode=split_mode,
    )
    return segs


def test_fixture_kaniti_eski_yol_bos_donuyordu():
    """FIXTURE KANITI: sembol katmaninda INSERT/CIRCLE/POINT yok — eski
    tanima yolu bu fixture icin SIFIR merkez uretir. Dolayisiyla asagidaki
    testler yeni kumeleme yolunu suruyor, tesadufen gecmiyor."""
    doc = _doc_yatay_boru(9)
    msp = doc.modelspace()
    eski_tipler = [e for e in msp if e.dxf.layer == SEMBOL
                   and e.dxftype() in ("INSERT", "CIRCLE", "POINT")]
    assert eski_tipler == []
    assert {e.dxftype() for e in msp if e.dxf.layer == SEMBOL} == {"LINE", "ELLIPSE", "HATCH"}


def test_gercek_aile_capraz_elips_tarama_her_sembolde_boler():
    """9 sembol -> 10 parca, hepsi 300 birim. Metraj toplami degismez."""
    doc = _doc_yatay_boru(9)
    segs = _segs(doc)
    lens = sorted(round(s["length"], 1) for s in segs)
    assert len(segs) == 10, f"{len(segs)} segment: {lens}"
    assert lens == [300.0] * 10, lens
    assert math.isclose(sum(s["length"] for s in segs), 3000.0, rel_tol=1e-6)


def test_ikinci_aile_kapali_polyline_kare_boler():
    """Genellik kaniti: farkli bir geometri ailesi (kapali LWPOLYLINE) de sembol."""
    doc = _doc_yatay_boru(5, sembol=_kapali_kare, sembol_layer="SPRINKLER-SYM")
    segs = _segs(doc, sprinkler_layers=("SPRINKLER-SYM",))
    assert len(segs) == 6, f"{len(segs)} segment"
    assert sorted(round(s["length"]) for s in segs) == [300] * 5 + [1500]


def test_isaret_yoksa_bolme_yok_ve_none_modu_etkilenmez():
    """Isaretsiz: eski davranis (T yok, sembol yok -> tek parca). none: tek parca."""
    doc = _doc_yatay_boru(9)
    assert len(_segs(doc, sprinkler_layers=())) == 1
    assert len(_segs(doc, split_mode="none")) == 1


@pytest.mark.parametrize("unit_scale", [1.0, 0.001, 0.0254])
def test_yanlis_olcek_secilse_bile_boler(unit_scale):
    """Kullanici birimi yanlis secmis olabilir (gercek vakada cm cizime m
    secilmisti). Bolme mekanizmasi olcek varsayimina bagli OLMAMALI."""
    doc = _doc_yatay_boru(9)
    segs = _segs(doc, unit_scale=unit_scale)
    assert len(segs) == 10, f"unit_scale={unit_scale}: {len(segs)} segment"


def test_borudan_uzak_sembol_bolmez():
    """Sembol borunun 200 birim uzaginda (baska hat) -> dokunulmaz."""
    doc = _doc_yatay_boru(0)
    _capraz_elips_tarama(doc.modelspace(), 1500, 200)
    assert len(_segs(doc)) == 1


def test_ust_uste_kopya_sembol_tek_bolme():
    """Gercek dosyada 279 kume ikiz (ayni yerde iki sembol) — TEK bolme."""
    doc = _doc_yatay_boru(3)
    msp = doc.modelspace()
    _capraz_elips_tarama(msp, 600, 0)  # 2. sembolun ustune kopya
    segs = _segs(doc)
    assert len(segs) == 4, f"{len(segs)} segment"


def test_asimetrik_sembol_tek_bolme_kumeleme_sart():
    """Sidewall benzeri asimetrik sembol: daire + boru yonunde 30 birimlik ok
    cizgisi. Parcalar AYRI AYRI nokta sayilsa okun orta noktasi (x+15) ikinci
    bir bolme uretir -> 15 birimlik sahte parca. Kumeleme = tek bolme."""
    doc = _doc_yatay_boru(0)
    msp = doc.modelspace()
    for x in (600.0, 1200.0, 1800.0, 2400.0):
        msp.add_circle((x, 0), radius=8, dxfattribs={"layer": SEMBOL})
        msp.add_line((x, 0), (x + 30, 0), dxfattribs={"layer": SEMBOL})
    segs = _segs(doc)
    lens = sorted(round(s["length"]) for s in segs)
    assert len(segs) == 5, f"{len(segs)} segment: {lens}"
    assert min(lens) > 100, f"sahte mikro parca: {lens}"


def test_sembol_katmanindaki_uzun_cizgi_sembol_degil_ve_komsulari_yutmaz():
    """Sembol katmanina yanlislikla cizilmis 1000 birimlik boru benzeri LINE:
    kendisi sembol sayilmaz (orta noktasindan sahte bolme yok) VE ustunden
    gectigi 300/600/900'deki sembolleri kumeye yutup kaybettirmez."""
    doc = _doc_yatay_boru(9)
    doc.modelspace().add_line((100, 0), (1100, 0), dxfattribs={"layer": SEMBOL})
    segs = _segs(doc)
    lens = sorted(round(s["length"], 1) for s in segs)
    assert len(segs) == 10, f"{len(segs)} segment: {lens}"
    assert lens == [300.0] * 10, lens


def test_ayni_katman_kurali_boru_cizgileri_sembol_degil():
    """Boru katmani 💧 ile isaretlenirse LINE'lar boru kalir; yalniz gercek
    semboller (burada CIRCLE) boler. Boru kendi orta noktasindan bolunmez."""
    doc = ezdxf.new("R2010", setup=True)
    doc.layers.add(BORU)
    msp = doc.modelspace()
    msp.add_line((0, 0), (3000, 0), dxfattribs={"layer": BORU})
    msp.add_circle((1500, 0), radius=7.5, dxfattribs={"layer": BORU})
    # AYIRT EDICI: ana hattin 10 birim ustunde, ona DEGMEYEN 100 birimlik boru
    # parcasi. Boru olarak: baglantisiz ayri run (100). LINE'lar sembol
    # sayilsaydi: kume yaricapi 50 > mesafe 10 -> 2500'de SAHTE bolme cikardi.
    msp.add_line((2450, 10), (2550, 10), dxfattribs={"layer": BORU})
    segs = _segs(doc, sprinkler_layers=(BORU,))
    lens = sorted(round(s["length"]) for s in segs)
    assert lens == [100, 1500, 1500], lens


def test_kume_merkezleri_boru_ustunde_ve_yaricapli():
    """Kumeleme API'si: 9 kume, merkezler (300k, 0), yaricap sembol yari-kosegeni."""
    doc = _doc_yatay_boru(9)
    syms = _sprinkler_symbols_from_layers(doc, [SEMBOL], pipe_layers={BORU},
                                          node_tol=1.0)
    assert len(syms) == 9
    xs = sorted(round(s[0]) for s in syms)
    assert xs == [300 * (i + 1) for i in range(9)], xs
    assert all(abs(s[1]) < 0.5 for s in syms)
    assert all(15.0 <= s[2] <= 30.0 for s in syms), [s[2] for s in syms]
    # Geriye uyumlu merkez listesi ayni kumeleri dondurur
    centers = _sprinkler_centers_from_layers(doc, sprinkler_layers=[SEMBOL],
                                             pipe_layers={BORU}, node_tol=1.0)
    assert len(centers) == 9


def test_sembol_iki_kolinear_cizginin_birlesim_noktasinda_ise_run_kirilir():
    """Sprinkler tam vertex ustunde (iki LINE uc uca): bolme gerekmez ama
    run o dugumde KIRILMALI (aura). 2 parca, 1 degil."""
    doc = ezdxf.new("R2010", setup=True)
    doc.layers.add(BORU)
    doc.layers.add(SEMBOL)
    msp = doc.modelspace()
    msp.add_line((0, 0), (1500, 0), dxfattribs={"layer": BORU})
    msp.add_line((1500, 0), (3000, 0), dxfattribs={"layer": BORU})
    _capraz_elips_tarama(msp, 1500, 0)
    segs = _segs(doc)
    assert len(segs) == 2, f"{len(segs)} segment"


def test_aday_katmanlar_isaretsizken_olculur():
    """Kullanici 💧 isaretlemedi: adinda sprinkler gecen katmanlardan yalniz
    borunun USTUNDE sembol tasiyanlar, sayilariyla listelenir. Borudan uzak
    sembol katmani listelenmez; boru katmaninin kendisi ('3-SPRINK' adi
    sprinkler icerir!) aday DEGILDIR."""
    doc = _doc_yatay_boru(9)
    doc.layers.add("SPRINKLER-UZAK")
    for x in (400.0, 800.0, 1200.0):
        _kapali_kare(doc.modelspace(), x, 500.0, "SPRINKLER-UZAK")
    adaylar = sprinkler_layer_candidates(doc, [BORU], unit_scale=0.01)
    assert [a["layer"] for a in adaylar] == [SEMBOL], adaylar
    assert adaylar[0]["on_pipe"] == 9, adaylar
    # isaretlenince bolunuyor, isaretsizken bolunmuyor — ipucu bolme YAPMAZ
    assert len(_segs(doc, sprinkler_layers=())) == 1
    assert len(_segs(doc)) == 10


def test_kapsama_daireli_blok_komsuya_binse_de_her_blok_ayri_sembol():
    """UCUNCU GERCEK AILE (metaprice-test: 906 blok, 'A$C7dfb8eea'): blok
    icinde kafa + KAPSAMA DAIRESI (yaricap 200 > aralik 300'un yarisi). Blok
    bbox'lari komsularina biner; bbox-kesisim kumelemesi hepsini TEK dev
    kumeye zincirleyip boyut kapisinda kaybediyordu (0 sembol). Kural: blok
    ornegi tek basina semboldur, komsuyla birlesmez -> 9 blok = 9 bolme."""
    doc = ezdxf.new("R2010", setup=True)
    doc.layers.add(BORU)
    doc.layers.add("SPR-KAPSAMA")
    blk = doc.blocks.new(name="SPR_KAPSAMA")
    blk.add_circle((0, 0), radius=8)      # kafa
    blk.add_circle((0, 0), radius=200)    # kapsama dairesi — komsuya biner
    msp = doc.modelspace()
    msp.add_line((0, 0), (3000, 0), dxfattribs={"layer": BORU})
    for i in range(9):
        msp.add_blockref("SPR_KAPSAMA", (SPACING * (i + 1), 0), dxfattribs={"layer": "SPR-KAPSAMA"})
    syms = _sprinkler_symbols_from_layers(doc, ["SPR-KAPSAMA"], pipe_layers={BORU}, node_tol=3.0)
    assert len(syms) == 9, f"{len(syms)} sembol (dev kume zinciri?)"
    # yaricap komsu araliginin ceyregini asmaz — kapsama dairesi boruyu
    # "iceriden geciyor" saydirip 2 m uzaktaki baska hatti bolmesin
    assert all(r <= SPACING / 4.0 + 1e-9 for _, _, r in syms), [round(r) for _, _, r in syms]
    segs = _segs(doc, sprinkler_layers=("SPR-KAPSAMA",))
    assert len(segs) == 10, f"{len(segs)} segment"
    adaylar = sprinkler_layer_candidates(doc, [BORU], unit_scale=0.01)
    assert [(a["layer"], a["on_pipe"]) for a in adaylar] == [("SPR-KAPSAMA", 9)], adaylar


# ── IC ICE BLOK: sprinkler'lar bir ust blogun icinde ────────────────
# Motor onceden yalniz modelspace ust duzeyini geziyordu; goruntuleyici ic
# bloklari acip gosterdigi icin kullanici sembolu goruyor, motor gormuyordu.


def _kafa_blogu(doc, name="SPR_HEAD", layer="0"):
    """Kafa sembolu blogu: daire + capraz. Katman '0' -> ust INSERT'in katmani."""
    blk = doc.blocks.new(name=name)
    blk.add_circle((0, 0), radius=8, dxfattribs={"layer": layer})
    blk.add_line((-11, 0), (11, 0), dxfattribs={"layer": layer})
    blk.add_line((0, -11), (0, 11), dxfattribs={"layer": layer})
    return blk


def _doc_grup_blogu(n=9, grup_layer="0", kafa_layer=SEMBOL):
    """Boru + tek bir 'GRUP' blogu; sprinkler kafalari grubun ICINDE nested
    INSERT olarak, isaretli katmanda. Grubun kendisi isaretsiz katmanda."""
    doc = ezdxf.new("R2010", setup=True)
    doc.layers.add(BORU); doc.layers.add(SEMBOL)
    _kafa_blogu(doc)
    grp = doc.blocks.new(name="GRUP")
    for i in range(n):
        grp.add_blockref("SPR_HEAD", (SPACING * (i + 1), 0), dxfattribs={"layer": kafa_layer})
    msp = doc.modelspace()
    msp.add_line((0, 0), (3000, 0), dxfattribs={"layer": BORU})
    msp.add_blockref("GRUP", (0, 0), dxfattribs={"layer": grup_layer})
    return doc


def test_ust_blok_icine_gomulu_sprinkler_bloklari_bulunur():
    """9 kafa 'GRUP' blogunun icinde, grup katman '0'da (isaretsiz). Isaretli
    katman kafalarin katmani -> 10 segment; aday ipucu da 9 sayar."""
    doc = _doc_grup_blogu()
    segs = _segs(doc)
    assert len(segs) == 10, f"{len(segs)} segment — ic blok acilmadi mi?"
    assert sorted(round(s["length"]) for s in segs) == [300] * 10
    adaylar = sprinkler_layer_candidates(doc, [BORU], unit_scale=0.01)
    assert [(a["layer"], a["on_pipe"]) for a in adaylar] == [(SEMBOL, 9)], adaylar


def test_ic_blok_katman_sifir_ust_insertin_katmanini_alir():
    """AutoCAD kurali: blok icindeki katman-'0' varliklar ust INSERT'in
    katmanina gecer. Kafa bloklari katman '0' icerikli, GRUP icinde nested
    INSERT'ler isaretli katmanda -> kafalar isaretli sayilir (zaten oyle).
    Ters durum: nested INSERT'ler katman '0'da, GRUP isaretli katmanda ->
    kafalar GRUP'un katmanini miras alir ve yine bulunur."""
    doc = _doc_grup_blogu(grup_layer=SEMBOL, kafa_layer="0")
    assert len(_segs(doc)) == 10
    # Isaretli YOL bulmali (Block-to-Line grup acilimi degil): 9 sembol
    syms = _sprinkler_symbols_from_layers(doc, [SEMBOL], pipe_layers={BORU}, node_tol=3.0)
    assert len(syms) == 9, f"{len(syms)} sembol — katman-0 mirasi calismadi mi?"


def test_bilesik_sembol_blogu_govde_arti_nested_ok_tek_bolme():
    """Sembol blogu = daire govde + nested 'OK' blogu (boru yonunde 12 birim
    kaymis). Acilinca govde serbest parca, ok ayri blok olur; ayni yerdeki
    ikisi TEK sprinkler sayilmali — aksi halde her sprinkler'da 12 birimlik
    sahte ara parca cikar."""
    doc = ezdxf.new("R2010", setup=True)
    doc.layers.add(BORU); doc.layers.add(SEMBOL)
    ok = doc.blocks.new(name="OK")
    ok.add_line((0, 0), (20, 0)); ok.add_line((20, 0), (14, 4)); ok.add_line((20, 0), (14, -4))
    sym = doc.blocks.new(name="SPR_BILESIK")
    sym.add_circle((0, 0), radius=8)
    sym.add_blockref("OK", (12, 0))
    msp = doc.modelspace()
    msp.add_line((0, 0), (3000, 0), dxfattribs={"layer": BORU})
    for i in range(9):
        msp.add_blockref("SPR_BILESIK", (SPACING * (i + 1), 0), dxfattribs={"layer": SEMBOL})
    segs = _segs(doc)
    lens = sorted(round(s["length"]) for s in segs)
    assert len(segs) == 10, f"{len(segs)} segment: {lens}"
    assert min(lens) > 100, f"sahte mikro parca: {lens}"
    # Bolme noktasi KAFANIN (govdenin) merkezinde olmali, okla ortalanmis
    # (x+6) degil: uclar 300'un katlarinda
    uclar = sorted({round(s["x1"]) for s in segs} | {round(s["x2"]) for s in segs})
    assert uclar == [300 * i for i in range(11)], uclar


def test_iki_nested_bloktan_olusan_bilesik_sembol_tek_bolme():
    """Bilesik sembol = nested GOVDE blogu (0,0) + nested OK blogu (12,0), serbest
    parca YOK. Acilinca iki yaprak blok = iki anchor; birlesik merkez x+6'ya
    kayar. Block-to-Line ise ust blogun anchor'ini (x) gorur: iki mekanizma iki
    ayri noktada bolerse 6 birimlik sahte parca cikar. Bir sprinkler = bir bolme."""
    doc = ezdxf.new("R2010", setup=True)
    doc.layers.add(BORU); doc.layers.add(SEMBOL)
    govde = doc.blocks.new(name="GOVDE"); govde.add_circle((0, 0), radius=8)
    ok = doc.blocks.new(name="OK"); ok.add_line((0, 0), (20, 0))
    sym = doc.blocks.new(name="SPR_IKI")
    sym.add_blockref("GOVDE", (0, 0)); sym.add_blockref("OK", (12, 0))
    msp = doc.modelspace()
    msp.add_line((0, 0), (3000, 0), dxfattribs={"layer": BORU})
    for i in range(9):
        msp.add_blockref("SPR_IKI", (SPACING * (i + 1), 0), dxfattribs={"layer": SEMBOL})
    segs = _segs(doc)
    lens = sorted(round(s["length"]) for s in segs)
    assert len(segs) == 10, f"{len(segs)} segment: {lens}"
    assert min(lens) > 100, f"sahte mikro parca: {lens}"


def test_uc_parcali_bilesik_sembol_parcalar_uzak_olsa_da_atomik():
    """Bilesik sembol = 3 nested blok: govde (0), ok (12) ve 40 birim otede
    kucuk isaret cizgisi. Parcalarin daireleri KESISMEZ (11 + 1 < 40) — daire
    birlestirmesi kurtaramaz; sembol BOYUTUYLA (kosegen < komsu aralik/2)
    bilesik sayilip atomik kalmali. Aksi halde sprinkler basina 40'lik sahte parca."""
    doc = ezdxf.new("R2010", setup=True)
    doc.layers.add(BORU); doc.layers.add(SEMBOL)
    govde = doc.blocks.new(name="GOVDE"); govde.add_circle((0, 0), radius=8)
    ok = doc.blocks.new(name="OK"); ok.add_line((0, 0), (20, 0))
    tik = doc.blocks.new(name="TIK"); tik.add_line((0, -1), (0, 1))
    sym = doc.blocks.new(name="SPR_UC")
    sym.add_blockref("GOVDE", (0, 0)); sym.add_blockref("OK", (12, 0)); sym.add_blockref("TIK", (40, 0))
    msp = doc.modelspace()
    msp.add_line((0, 0), (3000, 0), dxfattribs={"layer": BORU})
    for i in range(9):
        msp.add_blockref("SPR_UC", (SPACING * (i + 1), 0), dxfattribs={"layer": SEMBOL})
    segs = _segs(doc)
    lens = sorted(round(s["length"]) for s in segs)
    assert len(segs) == 10, f"{len(segs)} segment: {lens}"
    assert min(lens) > 100, f"sahte mikro parca: {lens}"


def test_serbest_sembolun_yanindaki_isaretli_kucuk_blok_tek_bolme_ve_merkez_govde():
    """Isaretli katmanda hem serbest capraz (kafa, x) hem kafanin 6 birim
    yanina konmus kucuk etiket BLOGU (anchor x+6, boru ustunde). Ikisi ayni
    sprinkler: (1) tek bolme — Block-to-Line etiket anchor'ini ikinci kez
    bolmemeli; (2) bolme noktasi KAFANIN merkezinde (300'un kati), etiketle
    ortalanmis x+3 degil."""
    doc = ezdxf.new("R2010", setup=True)
    doc.layers.add(BORU); doc.layers.add(SEMBOL)
    tag = doc.blocks.new(name="TAG")
    tag.add_lwpolyline([(-4, -4), (4, -4), (4, 4), (-4, 4)], close=True)
    msp = doc.modelspace()
    msp.add_line((0, 0), (3000, 0), dxfattribs={"layer": BORU})
    for i in range(9):
        x = SPACING * (i + 1)
        msp.add_line((x - 11, 0), (x + 11, 0), dxfattribs={"layer": SEMBOL})
        msp.add_line((x, -11), (x, 11), dxfattribs={"layer": SEMBOL})
        msp.add_blockref("TAG", (x + 6, 0), dxfattribs={"layer": SEMBOL})
    segs = _segs(doc)
    lens = sorted(round(s["length"]) for s in segs)
    assert len(segs) == 10, f"{len(segs)} segment: {lens}"
    uclar = sorted({round(s["x1"]) for s in segs} | {round(s["x2"]) for s in segs})
    assert uclar == [300 * i for i in range(11)], uclar


def test_kat_buyuklugunde_blok_icindeki_patlatilmis_capraz_semboller():
    """Butun kat tek blok, icinde sprinkler'lar SERBEST capraz cizgi olarak
    isaretli katmanda; blok isaretsiz 'MIM' katmaninda ve boru agindan buyuk.
    Blok sembol degil ama ICI acilmali."""
    doc = ezdxf.new("R2010", setup=True)
    doc.layers.add(BORU); doc.layers.add(SEMBOL); doc.layers.add("MIM")
    kat = doc.blocks.new(name="KAT")
    for i in range(9):
        x = SPACING * (i + 1)
        kat.add_line((x - 11, 0), (x + 11, 0), dxfattribs={"layer": SEMBOL})
        kat.add_line((x, -11), (x, 11), dxfattribs={"layer": SEMBOL})
    kat.add_lwpolyline([(-500, -500), (3500, -500), (3500, 800), (-500, 800)], close=True,
                       dxfattribs={"layer": "MIM"})  # dis duvar — blogu buyutur
    msp = doc.modelspace()
    msp.add_line((0, 0), (3000, 0), dxfattribs={"layer": BORU})
    msp.add_blockref("KAT", (0, 0), dxfattribs={"layer": "MIM"})
    assert len(_segs(doc)) == 10


def test_isaretsiz_block_to_line_grup_icindeki_kafalari_da_boler():
    """Isaret YOK: otomatik Block-to-Line yolu grup blogunun icindeki kafa
    INSERT'lerinin ekleme noktalarini da gormeli (grup >= 3 nested)."""
    doc = _doc_grup_blogu()
    assert len(_segs(doc, sprinkler_layers=())) == 10


def test_isaretsiz_iki_kafalik_buyuk_blok_grup_sayilir():
    """Isaret YOK: 2 nested kafa iceren ama 1200 birim genis blok (kafa cifti)
    GRUPTUR — karar SAYIYLA degil BOYUTLA (kosegen > boru kenar medyaninin
    ceyregi). Sayi kurali (>=3) bu blogu acmazdi, iki kafa kaybolurdu."""
    doc = ezdxf.new("R2010", setup=True)
    doc.layers.add(BORU); doc.layers.add(SEMBOL)
    _kafa_blogu(doc)
    cift = doc.blocks.new(name="CIFT")
    cift.add_blockref("SPR_HEAD", (600, 0), dxfattribs={"layer": SEMBOL})
    cift.add_blockref("SPR_HEAD", (1800, 0), dxfattribs={"layer": SEMBOL})
    msp = doc.modelspace()
    msp.add_line((0, 0), (3000, 0), dxfattribs={"layer": BORU})
    msp.add_blockref("CIFT", (0, 0), dxfattribs={"layer": "0"})
    segs = _segs(doc, sprinkler_layers=())
    assert sorted(round(s["length"]) for s in segs) == [600, 1200, 1200], \
        sorted(round(s["length"]) for s in segs)


def test_isaretsiz_block_to_line_bilesik_sembolun_okunu_saymaz():
    """Isaret YOK, bilesik sembol (govde + 1 nested ok, ok boru yonunde 12
    birim otede, TAM cizgi ustunde). Ok bir 'grup' degil -> ekleme noktasi
    eklenmez -> sprinkler basina TEK bolme, sahte 12'lik parca yok."""
    doc = ezdxf.new("R2010", setup=True)
    doc.layers.add(BORU); doc.layers.add(SEMBOL)
    ok = doc.blocks.new(name="OK"); ok.add_line((0, 0), (20, 0))
    sym = doc.blocks.new(name="SPR_BILESIK"); sym.add_circle((0, 0), radius=8); sym.add_blockref("OK", (12, 0))
    msp = doc.modelspace()
    msp.add_line((0, 0), (3000, 0), dxfattribs={"layer": BORU})
    for i in range(9):
        msp.add_blockref("SPR_BILESIK", (SPACING * (i + 1), 0), dxfattribs={"layer": SEMBOL})
    segs = _segs(doc, sprinkler_layers=())
    lens = sorted(round(s["length"]) for s in segs)
    assert len(segs) == 10, f"{len(segs)} segment: {lens}"


def test_insert_sembol_ekseni_disina_kaymis_olsa_da_boler():
    """💧 katmandaki INSERT'in ekleme noktasi borudan 6 birim kaymis (blok
    geometrisi yaricap 20, boru blogun icinden geciyor). Yanlis olcek
    (unit_scale=1.0 -> sprinkler_tol 5) altinda eski kod BOLMEZDI."""
    doc = ezdxf.new("R2010", setup=True)
    doc.layers.add(BORU)
    doc.layers.add("SPR-BLK")
    blk = doc.blocks.new(name="SPR_X")
    blk.add_circle((0, 0), radius=20)
    blk.add_line((-20, 0), (20, 0))
    msp = doc.modelspace()
    msp.add_line((0, 0), (3000, 0), dxfattribs={"layer": BORU})
    msp.add_blockref("SPR_X", (1500, 6), dxfattribs={"layer": "SPR-BLK"})
    segs = _segs(doc, sprinkler_layers=("SPR-BLK",), unit_scale=1.0)
    assert sorted(round(s["length"]) for s in segs) == [1500, 1500]
