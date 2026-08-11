"""Segmentasyon toleransi BIRIMDEN BAGIMSIZ olmali.

OLCULEN SORUN (gercek dosya: 7- M30 YANGIN TESISATI_R1.dwg, 458 boru kenari):
  birim cm sanildiginda node_tol 5.0 cizim birimi cikiyordu; 629 dugumun 96'si
  (%15.3) SAHTE KAYNAK oluyordu — gercekte 0.48 m'ye kadar ayri noktalar tek
  dugume kaynakliyor, chain'ler capraz atliyor, kullanici "cizgilerde yamulma"
  goruyordu. Dogru birimde (dm) ayni oran %0.27 idi.

Birim tespiti artik otomatik; ama tespit YANILSA BILE segmentasyon cokmemeli.
Bu dosya o ikinci savunmayi muhurler.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pipe_segments import _compute_tolerances, _node_key  # noqa: E402

BIRIMLER = {"mm": 0.001, "cm": 0.01, "dm": 0.1, "m": 1.0}


def _ag(u_m: float, kisa_parca_m: float = 0.20, uzun_parca_m: float = 3.0):
    """Gercek dunyada AYNI olan boru agi, verilen birimde ifade edilir.

    Kisa parcalar (20 cm dirsek baglantilari) sahte kaynaklanmaya en acik
    olanlardir — gercek dosyadaki durum da buydu.
    """
    kisa = kisa_parca_m / u_m
    uzun = uzun_parca_m / u_m
    edges = []
    x = 0.0
    for i in range(60):
        L = kisa if i % 3 == 0 else uzun
        edges.append({"x1": x, "y1": 0.0, "x2": x + L, "y2": 0.0, "layer": "P"})
        x += L
    # Paralel ikinci hat — 0.5 m otede (sahte kaynak icin en cazip mesafe)
    y2 = 0.5 / u_m
    x = 0.0
    for i in range(60):
        L = kisa if i % 3 == 1 else uzun
        edges.append({"x1": x, "y1": y2, "x2": x + L, "y2": y2, "layer": "P"})
        x += L
    return edges


def _sahte_kaynak_orani(edges, node_tol):
    """Ayni node_key'e dusen ama gercekte >node_tol/2 uzak nokta ciftleri."""
    buckets = {}
    for e in edges:
        for x, y in ((e["x1"], e["y1"]), (e["x2"], e["y2"])):
            buckets.setdefault(_node_key(x, y, node_tol), []).append((x, y))
    sahte = 0
    for pts in buckets.values():
        uniq = list({(round(p[0], 9), round(p[1], 9)) for p in pts})
        if len(uniq) < 2:
            continue
        yayilim = max(
            math.hypot(a[0] - b[0], a[1] - b[1])
            for i, a in enumerate(uniq) for b in uniq[i + 1:]
        )
        if yayilim > node_tol / 2:
            sahte += 1
    return sahte / len(buckets) if buckets else 0.0


def test_node_tol_gercek_dunyada_guvenli_bantta_kaliyor():
    """Ayni fiziksel ag farkli birimde ifade edilince tolerans GERCEK dunyada
    kucuk ve yakin kalmali.

    NEDEN TAM ESITLIK BEKLENMIYOR (olculdu): _compute_tolerances'taki
    `max(1.0, ...)` tabani MUTLAK bir cizim-birimi sabiti. Metre birimli bir
    cizimde bu taban tek basina 1 METRE tolerans demek. Yeni kenar-uzunlugu
    kelepcesi bunu 0.08 m'ye cekiyor, ama taban hala birime duyarli oldugu icin
    mm/cm (0.05 m) ile dm/m (0.08 m) arasinda ~1.6x fark kaliyor.
    BILINEN SINIR: 20'den az kenarli cizimlerde kelepce devreye girmez ve o
    taban yeniden baskin olur. Pratikte boru agi her zaman 20+ kenardir.
    """
    gercek_m = {}
    for ad, u in BIRIMLER.items():
        edges = _ag(u)
        nt, _ = _compute_tolerances(edges, unit_scale=u)
        gercek_m[ad] = nt * u  # cizim birimi -> metre

    degerler = list(gercek_m.values())
    for ad, v in gercek_m.items():
        assert 0.005 <= v <= 0.15, f"{ad}: gerçek tolerans {v:.3f} m — güvenli bant dışı"
    assert max(degerler) / min(degerler) <= 2.0, (
        f"tolerans birime göre 2x'ten fazla kayıyor: {gercek_m}")


def test_yanlis_birim_secilse_bile_sahte_kaynak_olmuyor():
    """KRITIK: birim 10x/100x yanlis verilse bile dugum kaynaklamasi patlamamali."""
    edges = _ag(0.1)  # gercek birim dm
    for ad, yanlis_u in BIRIMLER.items():
        nt, _ = _compute_tolerances(edges, unit_scale=yanlis_u)
        oran = _sahte_kaynak_orani(edges, nt)
        assert oran < 0.02, (
            f"birim '{ad}' sanıldığında sahte kaynak oranı %{oran * 100:.1f} "
            f"(node_tol={nt:.3f}) — yamulma geri geldi")


def test_kelepce_kisa_kenarlari_yutmuyor():
    """node_tol, kenarlarin 10. yuzdeliginin %40'ini gecmemeli."""
    for ad, u in BIRIMLER.items():
        edges = _ag(u)
        nt, _ = _compute_tolerances(edges, unit_scale=u)
        lens = sorted(math.hypot(e["x2"] - e["x1"], e["y2"] - e["y1"]) for e in edges)
        p10 = lens[int(len(lens) * 0.10)]
        assert nt <= p10 * 0.4 + 1e-9, f"{ad}: node_tol={nt} > p10*0.4={p10 * 0.4}"


def test_az_kenarda_kelepce_devreye_girmiyor():
    """20 kenardan az veri varsa istatistik guvenilmez — eski davranis korunur."""
    edges = [{"x1": 0.0, "y1": 0.0, "x2": 100.0, "y2": 0.0, "layer": "P"}]
    nt, st = _compute_tolerances(edges, unit_scale=0.001)
    assert nt > 0 and st > 0
