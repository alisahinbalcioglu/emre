"""/parse iptali (26.09.2026) — istemci koparsa parse alt sureci OLDURULUR.

SORUN (olculdu 26.09; yerel 4 cekirdek, 34 sn'lik ayirma, gercek denetleyici +
gercek motor): DWG Analiz birim degisince suren ayirmayi iptal edip yeni
birimle yeniden baslatiyor. Iptal yalniz tarayicidaydi: NestJS motor cagrisini,
motor da `subprocess.run` ile alt sureci sonuna kadar bekliyordu. 3. saniyede
kesilen ayirmanin alt sureci 44-48 sn daha kostu (tam CPU), yeni istek %51-63
uzadi; 3 sn arayla uc birim degisiminde %142-159.

SOZLESME:
  I1 iptal kurulunca alt surec DURUR (nabiz kesilir), ParseIptalEdildi
  I1b onceden iptal edilmis istek icin alt surec HIC baslatilmaz
  I2 iptalsiz yol aynen: sonuc doner
  I3 zaman asimi alt sureci oldurur (eskiden de olduruyordu — korunur)
  I4 alt surec hata koduyla biterse RuntimeError mesaji aynen
  I5 UCTAN UCA: gercek `main.app` (gercek ara katman yigini) + uvicorn; istemci
     baglantiyi kapatinca alt surec durur ve iz satiri yazilir.
     ⚠ `request.is_disconnected()` bu yiginda kopmayi GORMUYOR (olculdu:
     @app.middleware("http") receive'i sariyor) — I5 o hataya karsi kalkandir.
  I6 UCTAN UCA: kopmayan istek sonucunu alir ve ayni baglantida ikinci istek de
     calisir (bekci gorevinin iptali keep-alive baglantiyi bozmaz).
  I7 buyuk girdi + gec okuyan isci: girdinin TAMAMI gider (Python 3.11 POSIX
     `communicate` yeniden denemede kalan girdiyi yazmiyor — girdi donguden once
     yazilir). Ayirt edici yalniz Linux'ta; canli motor imajinda kosulur.

Alt surec yerine TAKLIT ISCI kosar (`main._PARSE_WORKER_YOLU`): 0,1 sn'de bir
nabiz dosyasina yazar. Nabzin durmasi surecin durmasinin davranis kanitidir
(isletim sisteminden bagimsiz; Windows'ta `os.kill(pid, 0)` sureci OLDURUR).
"""
import http.client
import json
import logging
import os
import socket
import subprocess
import sys
import threading
import time
import uuid

import pytest
import uvicorn

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main  # noqa: E402

TAKLIT_ISCI = r'''
import json, os, sys, time
kip = os.environ.get("IPTAL_TEST_KIP", "yavas")
if kip == "gec-okuyan":
    time.sleep(0.6)  # boru tamponu (64 KB) dolar, ilk 0,25 sn'lik yoklama dolar
girdi = json.loads(sys.stdin.read())
if kip == "hizli":
    print(json.dumps({"tamam": True, "scale": girdi.get("scale")}))
    sys.exit(0)
if kip == "gec-okuyan":
    print(json.dumps({"tamam": True, "dolgu": len(girdi.get("dolgu", ""))}))
    sys.exit(0)
if kip == "hata":
    sys.stderr.write("taklit isci bilerek dustu\n")
    sys.exit(1)
nabiz = os.environ["IPTAL_TEST_NABIZ"]
for _ in range(600):  # en cok 60 sn
    with open(nabiz, "a") as f:
        f.write(".")
    time.sleep(0.1)
print("{}")
'''


@pytest.fixture
def taklit(tmp_path, monkeypatch):
    isci = tmp_path / "taklit_isci.py"
    isci.write_text(TAKLIT_ISCI, encoding="utf-8")
    nabiz = tmp_path / "nabiz.txt"
    monkeypatch.setattr(main, "_PARSE_WORKER_YOLU", str(isci))
    monkeypatch.setenv("IPTAL_TEST_NABIZ", str(nabiz))
    monkeypatch.setenv("IPTAL_TEST_KIP", "yavas")
    return nabiz


def _nabiz(yol) -> int:
    try:
        return os.path.getsize(yol)
    except OSError:
        return 0


def _nabiz_basladi(yol, sure: float = 15.0) -> bool:
    son = time.monotonic() + sure
    while time.monotonic() < son:
        if _nabiz(yol) >= 3:
            return True
        time.sleep(0.05)
    return False


def _nabiz_durdu(yol, bekle: float = 0.8) -> bool:
    """Nabiz `bekle` sn boyunca buyumuyorsa alt surec durmustur (canli surec 0,1 sn'de bir yazar)."""
    once = _nabiz(yol)
    time.sleep(bekle)
    return _nabiz(yol) == once


def _arka_planda(hedef):
    kutu: dict = {}

    def kos():
        try:
            kutu["sonuc"] = hedef()
        except BaseException as e:  # noqa: BLE001 — testte her sonuc olculur
            kutu["hata"] = e
        kutu["bitis"] = time.monotonic()

    t = threading.Thread(target=kos, daemon=True)
    t.start()
    return t, kutu


def test_I1_iptal_alt_sureci_oldurur(taklit):
    iptal = threading.Event()
    t, kutu = _arka_planda(lambda: main._run_parse_subprocess("yok.dxf", {}, 60, iptal))
    assert _nabiz_basladi(taklit), "OLCUT: taklit isci hic baslamadi"
    iptal_ani = time.monotonic()
    iptal.set()
    t.join(5)
    assert not t.is_alive(), "iptalden 5 sn sonra hala bekliyor"
    assert isinstance(kutu.get("hata"), main.ParseIptalEdildi), f"hata={kutu.get('hata')!r}"
    assert kutu["bitis"] - iptal_ani < 2.0, f"iptal {kutu['bitis'] - iptal_ani:.2f} sn surdu"
    assert _nabiz_durdu(taklit), "iptalden sonra alt surec HALA kosuyor (yetim is)"


def test_I1b_onceden_kurulmus_iptal_sureci_hic_baslatmaz(taklit, monkeypatch):
    baslatilan: list = []
    asil_popen = subprocess.Popen

    def sayan_popen(*a, **k):
        baslatilan.append(a)
        return asil_popen(*a, **k)

    monkeypatch.setattr(subprocess, "Popen", sayan_popen)
    iptal = threading.Event()
    iptal.set()
    with pytest.raises(main.ParseIptalEdildi):
        main._run_parse_subprocess("yok.dxf", {}, 60, iptal)
    assert baslatilan == [], "iptal edilmis istek icin alt surec BASLATILDI"
    # OLCUT: ayni sayac iptalsiz cagride baslatmayi GORUYOR
    monkeypatch.setenv("IPTAL_TEST_KIP", "hizli")
    main._run_parse_subprocess("yok.dxf", {}, 60, threading.Event())
    assert len(baslatilan) == 1, f"sayac baslatmayi gormedi: {baslatilan}"


def test_I2_iptalsiz_yol_sonucu_dondurur(taklit, monkeypatch):
    monkeypatch.setenv("IPTAL_TEST_KIP", "hizli")
    assert main._run_parse_subprocess("yok.dxf", {"scale": 0.01}, 60, threading.Event()) == {
        "tamam": True, "scale": 0.01,
    }
    # iptal parametresi verilmeyen eski cagri bicimi de calisir
    assert main._run_parse_subprocess("yok.dxf", {"scale": 1}, 60) == {"tamam": True, "scale": 1}


def test_I3_zaman_asimi_alt_sureci_oldurur(taklit):
    t0 = time.monotonic()
    with pytest.raises(RuntimeError, match="timeout"):
        main._run_parse_subprocess("yok.dxf", {}, 1, threading.Event())
    assert time.monotonic() - t0 < 3.0
    assert _nabiz_durdu(taklit), "zaman asimindan sonra alt surec HALA kosuyor"


def test_I4_hata_kodu_mesaji_aynen(taklit, monkeypatch):
    monkeypatch.setenv("IPTAL_TEST_KIP", "hata")
    with pytest.raises(RuntimeError, match="taklit isci bilerek dustu"):
        main._run_parse_subprocess("yok.dxf", {}, 60, threading.Event())


def test_I7_girdi_ilk_yoklamada_bitmese_de_tamami_gider(taklit, monkeypatch):
    """Girdi boru tamponunu (64 KB) asar ve isci ilk 0,25 sn'lik yoklama dolana kadar
    okumaz. Girdi communicate()'e verilseydi Python 3.11 POSIX yeniden denemede
    (input=None) kalanini YAZMAZ, stdin'i KAPATMAZ: isci stdin.read()'de takilir,
    ancak zaman asimi kurtarir (olculdu: canli motor imajinda eski dongu KIRMIZI).
    Windows girdiyi zaman asimindan once tek seferde yazdigi icin orada ayirt etmez."""
    monkeypatch.setenv("IPTAL_TEST_KIP", "gec-okuyan")
    t0 = time.monotonic()
    sonuc = main._run_parse_subprocess("yok.dxf", {"dolgu": "x" * 200_000}, 8, threading.Event())
    assert sonuc == {"tamam": True, "dolgu": 200_000}, sonuc
    assert time.monotonic() - t0 < 5.0, f"girdi gec gitti: {time.monotonic() - t0:.1f} sn"


# ── UCTAN UCA: gercek uygulama + gercek ara katmanlar + gercek sunucu ────────

@pytest.fixture
def sunucu(taklit, monkeypatch):
    monkeypatch.setattr(main, "_INTERNAL_API_TOKEN", "")
    # Motor bicimi (`uuid4().hex[:12]`): bicimsiz kimlige yol kurulmaz (26.09, test_dedup_kapsam V4).
    file_id = uuid.uuid4().hex[:12]
    onbellek = main._cache_path(file_id)
    with open(onbellek, "w", encoding="utf-8") as f:
        f.write("0\nEOF\n")  # taklit isci DXF okumaz; uc yalniz varligina bakar
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    srv = uvicorn.Server(uvicorn.Config(main.app, host="127.0.0.1", port=port, log_level="warning"))
    th = threading.Thread(target=srv.run, daemon=True)
    th.start()
    son = time.monotonic() + 15
    while not srv.started and time.monotonic() < son:
        time.sleep(0.05)
    assert srv.started, "OLCUT: uvicorn ayaga kalkmadi"
    yield port, file_id
    srv.should_exit = True
    th.join(10)
    try:
        os.unlink(onbellek)
    except OSError:
        pass


def _parse_istegi(conn: http.client.HTTPConnection, file_id: str, scale: str) -> None:
    # On yuzun gonderdigi gibi BOS multipart govde (yalniz kapanis siniri)
    sinir = "----iptaltest"
    conn.request(
        "POST", f"/parse?file_id={file_id}&scale={scale}",
        body=f"--{sinir}--\r\n".encode(),
        headers={"Content-Type": f"multipart/form-data; boundary={sinir}"},
    )


def test_I5_istemci_koparsa_alt_surec_durur(sunucu, taklit, caplog):
    port, file_id = sunucu
    caplog.set_level(logging.WARNING)
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=30)
    _parse_istegi(conn, file_id, "0.01")
    assert _nabiz_basladi(taklit), "OLCUT: istek alt sureci hic baslatmadi"
    conn.sock.shutdown(socket.SHUT_RDWR)
    conn.close()
    time.sleep(1.0)  # 250 ms yoklama + oldurme payi
    assert _nabiz_durdu(taklit), "istemci koptu ama alt surec HALA kosuyor (yetim is)"
    son = time.monotonic() + 3
    while time.monotonic() < son and not any("Parse iptal" in r.getMessage() for r in caplog.records):
        time.sleep(0.05)
    assert any("Parse iptal" in r.getMessage() for r in caplog.records), "iptal iz satiri yazilmadi"


def test_I6_kopmayan_istek_sonucunu_alir_ve_baglanti_saglam(sunucu, taklit, monkeypatch):
    port, file_id = sunucu
    monkeypatch.setenv("IPTAL_TEST_KIP", "hizli")
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=30)
    for scale in ("0.001", "0.01"):  # ayni keep-alive baglantisinda iki istek
        _parse_istegi(conn, file_id, scale)
        yanit = conn.getresponse()
        govde = yanit.read()
        assert yanit.status == 200, f"{yanit.status} {govde[:200]!r}"
        assert json.loads(govde) == {"tamam": True, "scale": float(scale)}
    conn.close()
