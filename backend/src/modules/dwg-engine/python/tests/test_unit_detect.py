"""Otomatik cizim birimi tespiti — coklu AILE testi.

Neden sentetik fixture: gercek dosyaya ozel "akilli" bir algoritma uretmemek icin
AYNI proje 6 farkli birim/olcek kombinasyonunda uretilir. Kural hepsinde dogru
cevap vermek zorunda. Tek bir aileye ozel cozum bu testlerde ANINDA kirilir.

Fixture matematigi (Turk/Avrupa CAD pratigi):
    kagit_mm = model_birimi * u_mm / S
  =>  model_birimi = kagit_mm * S / u_mm
Antet, yazi yuksekligi ve olcek metni bu bagintiya gore uretilir.
"""
import math
import os
import sys

import ezdxf
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from unit_detect import (  # noqa: E402
    STANDARD_UNITS,
    _antet_layer_candidates,
    _collect_plot_scales,
    _text_height_candidates,
    detect_unit,
)

# ── Fixture uretici ──────────────────────────────────────────────

SHEET = {"A0": (1189.0, 841.0), "A1": (841.0, 594.0), "A2": (594.0, 420.0),
         "A3": (420.0, 297.0)}


def build_doc(
    u_m: float,
    plot_scale: float = 100.0,
    sheet: str = "A0",
    antet: bool = True,
    olcek_text: bool = True,
    sprinklers: bool = True,
    paper_text_mm: float = 2.5,
    insunits: int | None = None,
    antet_layer: str = "A-ANNO-ANTET",
    sheet_width_mm: float | None = None,
):
    """AYNI projeyi verilen birim/olcekte uretir.

    u_m: 1 cizim birimi kac METRE (ground truth)
    """
    u_mm = u_m * 1000.0
    doc = ezdxf.new("R2010", setup=True)
    if insunits is not None:
        doc.header["$INSUNITS"] = insunits
    msp = doc.modelspace()

    def mu(paper_mm: float) -> float:
        """kagit mm -> model birimi"""
        return paper_mm * plot_scale / u_mm

    pw, ph = SHEET[sheet]
    if sheet_width_mm is not None:
        pw = sheet_width_mm

    if antet:
        doc.layers.add(antet_layer)
        W, H = mu(pw), mu(ph)
        msp.add_lwpolyline(
            [(0, 0), (W, 0), (W, H), (0, H)], close=True,
            dxfattribs={"layer": antet_layer},
        )
        # ISO 5457 ic cerceve (5 mm ust/alt, 54 mm ciltleme kenari)
        msp.add_lwpolyline(
            [(mu(54), mu(5)), (W - mu(5), mu(5)), (W - mu(5), H - mu(5)), (mu(54), H - mu(5))],
            close=True, dxfattribs={"layer": antet_layer},
        )
        if olcek_text:
            msp.add_text("ÖLÇEK", dxfattribs={
                "layer": antet_layer, "height": mu(2.0),
                "insert": (W - mu(90), mu(20)),
            })
            den = int(plot_scale) if float(plot_scale).is_integer() else plot_scale
            msp.add_text(f"1/{den}", dxfattribs={
                "layer": antet_layer, "height": mu(2.0),
                "insert": (W - mu(60), mu(20)),
            })

    # Anotasyon yazilari — baski yuksekligi sabit
    doc.layers.add("Mech-F-Pipe-Text")
    for i in range(40):
        msp.add_text(f"DN{25 + i}", dxfattribs={
            "layer": "Mech-F-Pipe-Text", "height": mu(paper_text_mm),
            "insert": (mu(100) + i * mu(3), mu(200)),
        })

    # Boru hatlari — gercek dunyada 3 m'lik parcalar
    doc.layers.add("Mech-F-Pipe")
    seg_du = 3.0 / u_m
    y0 = 20.0 / u_m
    for i in range(30):
        x = 10.0 / u_m + i * seg_du
        msp.add_line((x, y0), (x + seg_du, y0), dxfattribs={"layer": "Mech-F-Pipe"})

    # Sprinkler'lar — gercek dunyada 3.0 m arayla
    if sprinklers:
        doc.layers.add("Mech-F-Sprinkler")
        blk = doc.blocks.new(name="SPRA002")
        blk.add_circle((0, 0), radius=0.15 / u_m)
        step = 3.0 / u_m
        for r in range(6):
            for c in range(10):
                msp.add_blockref("SPRA002", (10.0 / u_m + c * step, 25.0 / u_m + r * step),
                                 dxfattribs={"layer": "Mech-F-Sprinkler"})
    return doc


# ── AILELER: ayni proje, farkli birim/olcek ──────────────────────

AILELER = [
    # (id, u_m, plot_scale, sheet, beklenen_etiket)
    ("mm@1:100", 0.001, 100.0, "A0", "mm"),
    ("cm@1:100", 0.01, 100.0, "A0", "cm"),
    ("dm@1:100", 0.1, 100.0, "A0", "dm"),   # GERCEK dosyanin ailesi
    ("m@1:100", 1.0, 100.0, "A0", "m"),
    ("mm@1:50", 0.001, 50.0, "A1", "mm"),
    ("dm@1:50", 0.1, 50.0, "A1", "dm"),
    ("cm@1:20", 0.01, 20.0, "A2", "cm"),
    ("mm@1:200", 0.001, 200.0, "A0", "mm"),
]


@pytest.mark.parametrize("fid,u_m,S,sheet,beklenen", AILELER)
def test_antet_ve_olcek_ile_tespit(fid, u_m, S, sheet, beklenen):
    """KATMAN 1: antet kagit boyu + olcek metni -> kapali form cozum."""
    doc = build_doc(u_m, plot_scale=S, sheet=sheet)
    r = detect_unit(doc)
    assert r.unit_label == beklenen, f"{fid}: {r.unit_label} bulundu, kanit={r.evidence}"
    assert math.isclose(r.scale, u_m, rel_tol=1e-6), f"{fid}: scale={r.scale}"


@pytest.mark.parametrize("fid,u_m,S,sheet,beklenen", AILELER)
@pytest.mark.parametrize("insunits", [0, 4, 6], ids=["ins0", "ins4-mm-YALAN", "ins6-m-YALAN"])
def test_SPRINKLERSIZ_proje_de_dogru(fid, u_m, S, sheet, beklenen, insunits):
    """EN KRITIK TEST — sprinkler YOK, $INSUNITS YALAN SOYLUYOR.

    Isitma / sihhi tesisat / dogalgaz paftalarinda sprinkler yoktur; MetaPrice'in
    is yukunun cogunlugu budur. Onceki tasarimda (ilk tek-aday veren katmanda
    dur) karar tek bir sprinkler regex'ine biniyordu: sprinkler kalkinca zincir
    $INSUNITS'e dusuyor ve 100x hata veriyordu — hem de "orta" guvenle.
    Bu ailenin yesil kalmasi KESISIM mimarisinin varlik sebebidir.
    """
    doc = build_doc(u_m, plot_scale=S, sheet=sheet, sprinklers=False, insunits=insunits)
    r = detect_unit(doc)
    assert r.unit_label == beklenen, (
        f"{fid} (sprinklersiz, $INSUNITS={insunits}): {r.unit_label} bulundu — "
        f"kanit={r.evidence} | elenen={r.rejected}")
    assert math.isclose(r.scale, u_m, rel_tol=1e-6)
    assert r.confidence in ("kesin", "yuksek"), f"{fid}: guven={r.confidence}"


@pytest.mark.parametrize("fid,u_m,S,sheet,beklenen", AILELER)
def test_kesisim_sprinkleri_gereksiz_kiliyor(fid, u_m, S, sheet, beklenen):
    """Antet TEK BASINA tekillestirmiyor — bunu ACIKCA olc ve muhurle.

    Gercek dosyada olculdu: antet kisa kenari 841 + '1/100' -> {dm, inch}.
    Cakisma yapisal (A-serisi sqrt2 ile 100/25.4=3.937 orani). Dolayisiyla
    tekil sonucu KESISIM uretmeli, fizik degil.
    """
    doc = build_doc(u_m, plot_scale=S, sheet=sheet, sprinklers=False)
    scales = _collect_plot_scales(doc)
    antet_only, _, _ = _antet_layer_candidates(doc, scales)
    text_only, _ = _text_height_candidates(doc, scales)
    assert antet_only, f"{fid}: antet hiç aday üretmedi"
    assert text_only, f"{fid}: yazı yüksekliği hiç aday üretmedi"
    ortak = set(antet_only) & set(text_only)
    assert ortak == {beklenen}, (
        f"{fid}: kesişim {sorted(ortak)} — tek ve doğru olmalıydı "
        f"(antet={sorted(antet_only)}, yazı={sorted(text_only)})")


@pytest.mark.parametrize("fid,u_m,S,sheet,beklenen", AILELER)
def test_antet_yolu_GERCEKTEN_calisiyor(fid, u_m, S, sheet, beklenen):
    """MUTASYON DERSI: sonuca bakmak yetmez — HANGI mekanizmanin urettigini olc.

    Alt katmanlar (fizik) bu fixture'larda dogru cevabi zaten bulabiliyor; bu
    yuzden KATMAN 1 tamamen bozuk olsa bile sonuc-testi yesil kaliyordu.
    Bu test kapali formun kendisini muhurler.
    """
    doc = build_doc(u_m, plot_scale=S, sheet=sheet)
    r = detect_unit(doc)
    assert r.method.startswith("antet"), (
        f"{fid}: kapali form calismadi, {r.method} devraldi — kanit={r.evidence}")
    assert r.confidence == "kesin", f"{fid}: guven={r.confidence}"
    assert r.unit_label == beklenen


@pytest.mark.parametrize("fid,u_m,S,sheet,beklenen", AILELER)
def test_antet_yokken_yazi_ve_olcek_ile_tespit(fid, u_m, S, sheet, beklenen):
    """KATMAN 2: antet YOK ama olcek metni VAR -> yazi yuksekligi kapali formu.

    Olcek metnini korumak icin ayri bir layer'a kopyalanir.
    """
    doc = build_doc(u_m, plot_scale=S, sheet=sheet)
    msp = doc.modelspace()
    # Anteti sil, olcek metnini birak (baska bir layer'a tasi)
    for e in list(msp.query("LWPOLYLINE")):
        if e.dxf.layer == "A-ANNO-ANTET":
            msp.delete_entity(e)
    for e in list(msp.query("TEXT")):
        if e.dxf.layer == "A-ANNO-ANTET":
            e.dxf.layer = "Mech-Notlar"
    r = detect_unit(doc)
    assert r.unit_label == beklenen, f"{fid}: {r.unit_label} bulundu, kanit={r.evidence}"


@pytest.mark.parametrize("fid,u_m,S,sheet,beklenen", AILELER)
def test_antet_ve_olcek_yokken_fizik_ile_tespit(fid, u_m, S, sheet, beklenen):
    """KATMAN 3: hicbir kagit beyani yok -> sadece fizik (sprinkler araligi) eler.

    NOT: antet ve yazi yuksekligi yalniz u/S ORANINI belirler, u'yu TEK BASINA
    belirlemez. S bilinmiyorsa gercek-dunya capasi sart. Bu test o siniri kodlar.
    """
    doc = build_doc(u_m, plot_scale=S, sheet=sheet, antet=False, olcek_text=False)
    r = detect_unit(doc)
    assert r.unit_label == beklenen, f"{fid}: {r.unit_label} bulundu, kanit={r.evidence}"


@pytest.mark.parametrize("fid,u_m,S,sheet,beklenen", AILELER)
def test_insunits_YANLIS_olsa_bile_dogru(fid, u_m, S, sheet, beklenen):
    """GERCEK DOSYA DERSI: $INSUNITS=4 (mm) yalan soyluyordu.

    Header yanlis olsa bile cizimin kendi beyani (antet+olcek) kazanmali.
    """
    doc = build_doc(u_m, plot_scale=S, sheet=sheet, insunits=4)  # hepsinde "mm" iddiasi
    r = detect_unit(doc)
    assert r.unit_label == beklenen, (
        f"{fid}: $INSUNITS=4 yalanina kanildi -> {r.unit_label}, kanit={r.evidence}")


def test_insunits_dogruysa_ve_baska_kanit_yoksa_kullanilir():
    """KATMAN 3: antet+olcek+yazi yoksa $INSUNITS son caredir (ama tek basina degil)."""
    doc = build_doc(0.001, plot_scale=100.0, antet=False, olcek_text=False,
                    sprinklers=False, insunits=4)
    # yazilari da sil
    msp = doc.modelspace()
    for t in list(msp.query("TEXT")):
        msp.delete_entity(t)
    r = detect_unit(doc)
    assert r.unit_label == "mm"
    assert "INSUNITS" in " ".join(r.evidence).upper()


def test_insunits_desimetre_kodu_14_taninir():
    """KOD 14 = Decimeters. Eski tabloda YOKTU, sessizce mm'e dusuyordu."""
    doc = build_doc(0.1, plot_scale=100.0, antet=False, olcek_text=False,
                    sprinklers=False, insunits=14)
    msp = doc.modelspace()
    for t in list(msp.query("TEXT")):
        msp.delete_entity(t)
    r = detect_unit(doc)
    assert r.unit_label == "dm"
    assert math.isclose(r.scale, 0.1)


def test_hicbir_kanit_yoksa_dusuk_guven_ve_mm_varsayilan():
    """Bilgi gercekten yoksa UYDURMA — dusuk guven bayragi kaldir."""
    doc = ezdxf.new("R2010")
    doc.header["$INSUNITS"] = 0
    msp = doc.modelspace()
    msp.add_line((0, 0), (100, 0))
    r = detect_unit(doc)
    assert r.confidence == "dusuk"
    assert r.unit_label == "mm"  # deterministik varsayilan


def test_olcek_ayiklayici_boru_kesirlerini_ELEMELI():
    """Ayiklayiciyi DOGRUDAN sina — boru hattindan gecirme.

    '1/2"' ve '3/4"' boru olculeri plot olcegi DEGILDIR. Bunu tum akisin
    sonucundan olcmek yaniltici: alt katmanlar hatayi orterek testi yesil tutar.
    """
    doc = build_doc(0.1, plot_scale=100.0)
    msp = doc.modelspace()
    doc.layers.add("Mech-F-Pipe-Text2")
    for i in range(30):
        msp.add_text('1/2"', dxfattribs={"layer": "Mech-F-Pipe-Text2", "height": 2.5,
                                          "insert": (i * 5.0, 500.0)})
        msp.add_text('3/4"', dxfattribs={"layer": "Mech-F-Pipe-Text2", "height": 2.5,
                                          "insert": (i * 5.0, 510.0)})
    paydalar = [den for den, _ in _collect_plot_scales(doc)]
    assert 2 not in paydalar, f"1/2\" boru ölçüsü plot ölçeği sanıldı: {paydalar}"
    assert 4 not in paydalar, f"3/4\" boru ölçüsü plot ölçeği sanıldı: {paydalar}"
    assert 100 in paydalar, f"gerçek ölçek 1/100 kaçırıldı: {paydalar}"
    assert detect_unit(doc).unit_label == "dm"


def test_antet_farkli_layer_adlariyla_da_bulunur():
    """Her ofis anteti farkli adlandirir. KAPALI FORMUN calistigini muhurler."""
    for lay in ("ANTET", "TITLE", "PAFTA", "CERCEVE", "A-ANNO-TTLB", "FRAME", "BORDER"):
        doc = build_doc(0.1, plot_scale=100.0, antet_layer=lay)
        r = detect_unit(doc)
        assert r.method.startswith("antet"), f"layer={lay}: antet tanınmadı ({r.method})"
        assert r.unit_label == "dm", f"layer={lay} -> {r.unit_label}"


def test_uzatilmis_antet_genisligi_sonucu_bozmaz():
    """ISO 5457 uzatilmis pafta: yukseklik standart, GENISLIK standart degil.

    Gercek dosya boyleydi: 1345 x 841 (A0 yuksekligi, uzatilmis genislik).
    Kapali form bu paftada da calismali — alt katmana dusmemeli.
    """
    for w in (1345.0, 1682.0, 2378.0):
        doc = build_doc(0.1, plot_scale=100.0, sheet="A0", sheet_width_mm=w)
        r = detect_unit(doc)
        assert r.method.startswith("antet"), f"uzatılmış pafta {w}mm reddedildi: {r.rejected} / {r.evidence}"
        assert r.unit_label == "dm", f"uzatilmis pafta bozdu: {r.evidence}"


def test_fizik_elemesi_absurt_adaylari_dusurur():
    """Sprinkler araligi 3 m'lik projede 'm' birimi 300 m aralik demek — imkansiz."""
    doc = build_doc(0.1, plot_scale=100.0, antet=False, olcek_text=False)
    r = detect_unit(doc)
    red = " ".join(r.rejected).lower()
    assert "m" in r.unit_label or r.unit_label == "dm"
    assert r.unit_label == "dm"
    assert red, "hicbir aday elenmemis — fizik kontrolu calismiyor"


def test_pafta_olamayacak_kadar_uzun_dikdortgen_antet_sanilmaz():
    """ANTET adi tasiyan her dikdortgen pafta degildir.

    Bir ofis "CERCEVE" layer'ina uzun bir sutun bandi cizmisse (en-boy 8:1),
    o bbox pafta olarak KABUL EDILMEMELI — yoksa kapali form saçma bir birim
    uretir. Alt katmanlar devralmali.
    """
    doc = build_doc(0.1, plot_scale=100.0, antet=False, olcek_text=False)
    msp = doc.modelspace()
    doc.layers.add("CERCEVE")
    # 841 x 6728 (en-boy 8) — hicbir ISO paftasi bu kadar uzamaz
    msp.add_lwpolyline([(0, 0), (6728, 0), (6728, 841), (0, 841)], close=True,
                       dxfattribs={"layer": "CERCEVE"})
    msp.add_text("ÖLÇEK", dxfattribs={"layer": "CERCEVE", "height": 2.0, "insert": (10, 10)})
    msp.add_text("1/100", dxfattribs={"layer": "CERCEVE", "height": 2.0, "insert": (60, 10)})
    r = detect_unit(doc)
    assert not r.method.startswith("antet"), f"8:1 bant pafta sanıldı: {r.evidence}"
    assert r.unit_label == "dm", f"alt katman doğru cevabı vermedi: {r.evidence}"
    assert any("en-boy" in x for x in r.rejected), f"en-boy reddi kaydedilmemiş: {r.rejected}"


def test_gercek_orandaki_uzatilmis_pafta_KABUL_edilir():
    """4.0 en-boy (A0.4 = 841x3364) gecerlidir — kelepce fazla dar olmamali."""
    doc = build_doc(0.1, plot_scale=100.0, sheet="A0", sheet_width_mm=3364.0)
    r = detect_unit(doc)
    assert r.method.startswith("antet"), f"gerçek uzatılmış pafta reddedildi: {r.rejected} / {r.evidence}"
    assert r.unit_label == "dm"


def test_standart_birime_kenetlenemezse_guvenilmez():
    """Kapali form saskin bir sayi verirse KABUL EDILMEMELI.

    Antet x1.15 olceklenirse hicbir standart pafta/birim ikilisine %3 icinde
    oturmaz -> KATMAN 1 comelidir, alt katmanlar dogru cevabi vermelidir.
    NOT: x1.414 (=sqrt2) SECILMEDI, cunku A-serisi zaten sqrt2 oranlidir ve
    o carpan bilerek bir sonraki pafta boyuna oturur (gercek belirsizlik).
    """
    doc = build_doc(0.1, plot_scale=100.0, antet=True, olcek_text=True)
    msp = doc.modelspace()
    for e in list(msp.query("LWPOLYLINE")):
        if e.dxf.layer == "A-ANNO-ANTET":
            pts = [(p[0] * 1.15, p[1] * 1.15) for p in e.get_points(format="xy")]
            msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": "A-ANNO-ANTET"})
            msp.delete_entity(e)
    r = detect_unit(doc)
    assert r.unit_label == "dm", f"alt katmanlar devralmadi: {r.method} {r.evidence}"
    assert not r.method.startswith("antet"), "standart-disi antete güvenildi"


def test_sonuc_daima_standart_birim_kumesinde():
    for fid, u_m, S, sheet, beklenen in AILELER:
        doc = build_doc(u_m, plot_scale=S, sheet=sheet)
        r = detect_unit(doc)
        assert r.scale in set(STANDARD_UNITS.values()), f"{fid}: {r.scale} standart degil"


def test_antet_BLOK_icindeyse_ve_olcek_ATTRIB_ise_bulunur():
    """Turk ofis standardi: antet bir BLOK, 'ÖLÇEK' bir ATTRIB.

    ATTRIB entity space'te DEGIL, INSERT'in alt-entity'sidir — msp.query("ATTRIB")
    HIC sonuc dondurmez. Bu test o yolu muhurler.
    """
    u_m, S = 0.1, 100.0
    u_mm = u_m * 1000.0

    def mu(mm):
        return mm * S / u_mm

    doc = ezdxf.new("R2010", setup=True)
    doc.header["$INSUNITS"] = 4  # YALAN: mm diyor, gercek dm
    blk = doc.blocks.new(name="ANTET_A0")
    blk.add_lwpolyline([(0, 0), (mu(1189), 0), (mu(1189), mu(841)), (0, mu(841))], close=True)
    blk.add_attdef("OLCEK_DEG", (mu(50), mu(20)), dxfattribs={"height": mu(2.5)})
    msp = doc.modelspace()
    ins = msp.add_blockref("ANTET_A0", (0, 0), dxfattribs={"layer": "0"})
    ins.add_auto_attribs({"OLCEK_DEG": "ÖLÇEK 1/100"})

    doc.layers.add("Mech-Pipe-Text")
    for i in range(30):
        msp.add_text("DN50", dxfattribs={"layer": "Mech-Pipe-Text", "height": mu(2.5),
                                          "insert": (mu(100) + i * mu(4), mu(300))})
    doc.layers.add("Mech-Pipe")
    for i in range(30):
        msp.add_line((i * 30.0, 0.0), ((i + 1) * 30.0, 0.0), dxfattribs={"layer": "Mech-Pipe"})

    scales = _collect_plot_scales(doc)
    assert 100 in [d for d, _ in scales], f"ATTRIB içindeki ölçek bulunamadı: {scales}"
    antet_c, _, _ = _antet_layer_candidates(doc, scales)
    assert antet_c, "blok içindeki antet geometrisi açılmadı (virtual_entities)"
    r = detect_unit(doc)
    assert r.unit_label == "dm", f"blok antet çözülemedi: {r.method} {r.evidence} {r.rejected}"
    assert r.method.startswith("antet"), (
        f"blok antet yolu kullanılmadı, {r.method} devraldı — {r.evidence}")


def test_YALNIZ_KESISIM_cozebilir_YAPISAL_pafta_cakismasi():
    """KESISIM mimarisinin varlik kaniti — YAPISAL cakisma uzerinden.

    Cakisma matematigi: pafta kisa kenarlari sqrt(2) katlariyla dizili, en uc
    ikili 1189/297 = 4.0048. Birim ikilisi dm/inch = 100/25.4 = 3.9370.
    Ikisi arasindaki fark yalnizca %1.69 — SNAP_TOLERANCE %2'nin ALTINDA.
    Yani antet kisa kenari 297*S/25.4 olan bir cizimde kapali form HEM inch
    (P=297) HEM dm (P=1189) uretir ve TOLERANSI DARALTMADAN ayrilamaz.
    Toleransi daraltmak baska ailelerde kaybettirir; dogru cozum KESISIM.

    Burada gercek birim inch; yazi yuksekligi tek basina inch'i secer,
    antet tek basina secemez. Kesisim kapatilirsa bu test KIRMIZI olur.
    """
    u_m = 0.0254  # inch
    S = 100.0
    u_mm = u_m * 1000.0

    def mu(paper_mm):
        return paper_mm * S / u_mm

    doc = ezdxf.new("R2010", setup=True)
    doc.header["$INSUNITS"] = 0
    msp = doc.modelspace()
    doc.layers.add("A-ANNO-ANTET")
    W, H = mu(420.0), mu(297.0)  # A3
    msp.add_lwpolyline([(0, 0), (W, 0), (W, H), (0, H)], close=True,
                       dxfattribs={"layer": "A-ANNO-ANTET"})
    msp.add_text("ÖLÇEK", dxfattribs={"layer": "A-ANNO-ANTET", "height": mu(2.0),
                                       "insert": (mu(10), mu(10))})
    msp.add_text("1/100", dxfattribs={"layer": "A-ANNO-ANTET", "height": mu(2.0),
                                       "insert": (mu(40), mu(10))})
    doc.layers.add("Mech-Text")
    for i in range(40):
        msp.add_text("DN50", dxfattribs={"layer": "Mech-Text", "height": mu(2.5),
                                          "insert": (mu(60) + i * mu(4), mu(150))})
    doc.layers.add("Mech-Pipe")
    for i in range(30):
        msp.add_line((i * 120.0, 0.0), ((i + 1) * 120.0, 0.0),
                     dxfattribs={"layer": "Mech-Pipe"})

    scales = _collect_plot_scales(doc)
    antet_c, _, _ = _antet_layer_candidates(doc, scales)
    text_c, _ = _text_height_candidates(doc, scales)
    assert len(antet_c) > 1, (
        f"antet tek başına zaten tekil ({sorted(antet_c)}) — bu test kesişimi ölçemez")
    assert set(antet_c) & set(text_c) == {"inch"}, (
        f"kesişim tek değil: antet={sorted(antet_c)} yazı={sorted(text_c)}")

    r = detect_unit(doc)
    assert r.unit_label == "inch", (
        f"kesişim çözemedi: {r.method} | {r.evidence} | {r.rejected}")


def test_INSUNITS_hayatta_kalan_kume_disindaysa_DUSUK_guven():
    """Header, elenen bir birimi soyluyorsa sessizce kabul edilmemeli.

    Fizik 'm'yi eliyor (kosegen 9000 birim -> 9000 m > 5000 m), $INSUNITS ise
    'm' diyor. Sonuc yine 'm' olabilir (baska kanit yok) AMA guven 'dusuk'
    olmali ve kanit metni celiskiyi YAZMALI.
    """
    doc = ezdxf.new("R2010", setup=True)
    doc.header["$INSUNITS"] = 6  # m
    msp = doc.modelspace()
    doc.layers.add("Mech-Pipe")
    for i in range(40):
        msp.add_line((i * 225.0, 0.0), ((i + 1) * 225.0, 0.0),
                     dxfattribs={"layer": "Mech-Pipe"})  # bbox ~9000 birim
    r = detect_unit(doc)
    assert r.confidence == "dusuk", f"çelişki düşük güvenle işaretlenmedi: {r.confidence} / {r.evidence}"
    assert r.method == "insunits-celiskili", f"method={r.method}"
    assert any("ÇELİŞ" in e.upper() for e in r.evidence), f"çelişki metni yok: {r.evidence}"


def test_egim_tarih_pafta_no_metinleri_olcek_SANILMAZ():
    """'MIN. 1/100 EGIMLI' bir olcek beyani DEGILDIR — pissu paftalarinda standarttir."""
    doc = build_doc(0.1, plot_scale=100.0)
    msp = doc.modelspace()
    doc.layers.add("Notlar")
    for t in ("MIN. 1/50 EGIMLI", "PISSU BORUSU 1/20 EGIM", "TARIH: 1/10/2025",
              "PAFTA NO 1/200", "REV 1/500", "KOT 1/25 MEYIL"):
        msp.add_text(t, dxfattribs={"layer": "Notlar", "height": 2.5, "insert": (0, 900)})
    paydalar = [d for d, _ in _collect_plot_scales(doc)]
    for yasak in (50, 20, 10, 200, 500, 25):
        assert yasak not in paydalar, f"'{yasak}' eğim/tarih metninden ölçek sanıldı: {paydalar}"
    assert paydalar == [100], f"gerçek ölçek kayboldu ya da kirlendi: {paydalar}"


def test_ayni_paftada_plan_ve_detay_olcegi_varsa_ANA_PLAN_once():
    """1/100 plan + 1/20 kollektor detayi ayni paftada — Turk projelerinde standart.

    Ikisi de aday olarak denenir ama ANA PLAN olcegi (buyuk payda) once gelir.
    """
    doc = build_doc(0.1, plot_scale=100.0)
    msp = doc.modelspace()
    msp.add_text("DETAY ÖLÇEK 1/20", dxfattribs={
        "layer": "A-ANNO-ANTET", "height": 2.0, "insert": (0, 900)})
    paydalar = [d for d, _ in _collect_plot_scales(doc)]
    assert paydalar[0] == 100, f"ana plan ölçeği önde değil: {paydalar}"
    r = detect_unit(doc)
    assert r.unit_label == "dm", f"çoklu ölçek sonucu bozdu: {r.evidence} / {r.rejected}"


def test_fizik_vetosu_TUM_beyan_adaylarini_elerse_BEYAN_korunur():
    """Sprinkler layer'inda 10 LEJANT sembolu var — kagit araligi, bina araligi degil.

    Veto tum beyan adaylarini silerse veri guvenilmez demektir; veto YOK SAYILIR.
    Aksi halde 'fizik yalniz eler' iddiasi yalan olur ve veto DOGRU cevabi siler.
    """
    doc = build_doc(0.001, plot_scale=100.0, sprinklers=False)  # gercek birim mm
    msp = doc.modelspace()
    doc.layers.add("Mech-F-Sprinkler")
    blk = doc.blocks.new(name="SPR-LEJANT")
    blk.add_circle((0, 0), radius=50.0)
    for i in range(10):  # kagitta 8 mm arayla dizilmis lejant -> 800 model birimi
        msp.add_blockref("SPR-LEJANT", (i * 800.0, 500000.0),
                         dxfattribs={"layer": "Mech-F-Sprinkler"})
    r = detect_unit(doc)
    assert r.unit_label == "mm", (
        f"lejant sembolleri doğru cevabı sildi: {r.unit_label} — {r.evidence} / {r.rejected}")


def test_INSUNITS_elenmis_adayi_geri_getiremez():
    """Fizik 'imkansiz' dedigi birimi $INSUNITS geri getirmemeli; getirirse guven DUSUK."""
    doc = build_doc(0.1, plot_scale=100.0, antet=False, olcek_text=False, insunits=4)
    msp = doc.modelspace()
    for t in list(msp.query("TEXT")):
        msp.delete_entity(t)
    r = detect_unit(doc)
    # sprinkler araligi 3 m -> yalniz dm mumkun; header mm diyor
    assert r.unit_label == "dm", f"header vetoyu ezdi: {r.unit_label} / {r.evidence}"
    assert any("$INSUNITS" in e for e in r.evidence), f"çelişki kaydedilmemiş: {r.evidence}"


def test_kanit_daima_doldurulur():
    """detection_reason bos donerse kullanici neye guvenecegini bilemez."""
    doc = build_doc(0.1, plot_scale=100.0)
    r = detect_unit(doc)
    assert r.evidence and len(r.evidence) >= 2
    assert r.method
    assert r.confidence in ("kesin", "yuksek", "orta", "dusuk")
