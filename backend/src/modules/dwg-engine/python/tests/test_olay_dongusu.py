"""Olay dongusu SERBEST (26.09.2026) — agir is surerken motor baska isteklere cevap verir.

SORUN (kod okunarak dogrulandi, kullanim canlida olculdu — 26.09): motor TEK
uvicorn iscisiyle (WORKERS=1) butun kiracilara hizmet eder ve `async def` uclar
olay dongusunde kosar. POST /layers, POST /convert ve dosya govdeli /parse
DWG→DXF donusumunu (`subprocess.run(dwg2dxf, timeout=120)`) ve ezdxf okumasini
DOGRUDAN dongude yapiyordu: donusum bitene kadar motor baska HICBIR istege (baska
kiracinin /status yoklamasi, /geometry, /parse, kopma bekcisi) cevap veremiyordu.
Olculdu: 3 sn'lik taklit donusum surerken /health 3,15 sn bekledi. Canlida uc
yolun kullanimi SIFIR olculdu (kalici /tmp biriminde 04.07'den beri tek
`dwg2dxf_*` artigi yok; 28.08'den beri 7 DwgDosya kaydinin 7'si /upload) ve yollar
kaldirildi. Agir is artik yalniz alt surecte; alt surec `asyncio.to_thread` icinde beklenir.

SOZLESME (esik 1 sn; taklit agir is 6 sn surer, dongu serbestken /health ms'lerde doner):
  D1 ⭐ gercek /upload → upload_worker alt sureci → converter → TAKLIT `dwg2dxf`.
     Donusum SURERKEN /health ve /status esigin altinda doner; is bitince durum
     "ready" ve layer listesi dolu (yol uctan uca kostu, yalanci yesil yok);
     /geometry iscinin yazdigi dosyayi bayt bayt dondurur.
  D2 ⭐ gercek /parse → taklit parse iscisi. Parse SURERKEN /health esigin altinda.
  D3 ⭐ ESKI YOLLAR KAPALI: POST /layers, POST /convert → 404; dosya govdeli,
     file_id'siz /parse → 400. Uc istek de hizli doner ve donusturucu HIC cagrilmaz
     (olcut: ayni taklit dogrudan cagrilinca iz birakiyor).
  D4 YAPI: modul duzeyindeki her `async def` (uclar, ara katman, bekci, sinif
     yontemleri) govdesinde agir cagri YOK — donusum, ezdxf okumasi, alt surec,
     uyku; ad ya da oznitelik olarak (`ezdxf.readfile`), takma adla, main.py
     yardimcilari ya da DOGRUDAN cagrilan ic def/lambda uzerinden DOLAYLI olan da.
     `def` UCLARDA (is parcacigi) SUREC ICI DXF isi YOK — GIL dongu ile paylasilir,
     OOM tum kiracilari dusurur; alt surec/uyku orada serbest (bekleyen GIL'i birakir).
     Olcut kendi sinanir: uydurma kotu uclari yakalar, `to_thread`e verileni yakalamaz.
  D5 ⭐ GEOMETRI YUKU (26.09): canlidaki en buyuk geometri boyutunda (17 MB) hazir
     yanita PARALEL /geometry — Nest gibi `Accept-Encoding: gzip`, yarisi eski saldiri
     bicimi `?layers=` — SURERKEN /health esigin altinda; her yanit 200, SIKISTIRILMAMIS
     ve dosyanin baytlarinin AYNISI. Olcut: yoklamalarin en az ucu, isteklerin yarisi
     akarken yapildi.
  D6 ⭐ ONBELLEK YOKSA 409 (26.09): DXF var, geometri yok (isci oldu / deploy oncesi
     eski bicim) → paralel istekler hizli 409; DXF surec icinde OKUNMAZ (tuzak:
     converter/main `read_dxf`, `ezdxf.readfile` — olcut: tuzak gercek okuma yolunu
     yakaliyor). "processing" → 409 "isleniyor"; bilinmeyen → 404. Dedup geometrisi
     olmayan "ready" kaydi DONDURMEZ (dondurseydi kullanici 24 saat 409'da kalirdi).
  D7 YARIM CIKTI (26.09): isci OOM cikisiyla (137) DXF'i ve yarim geometriyi birakip
     olurse ana surec siler, durum "error"; gercek upload_worker Python hatasinda
     (DXF tasindiktan sonra) kendisi siler — olcut: ayni girdi basarida iki ciktiyi uretir.
  D8 /parse YANITI = ISCI BAYTLARI (26.09): ana surec JSON COZMEZ/YAZMAZ (is
     parcacigindaki C json GIL'i birakmaz); kanonik olmayan bicim ve UTF-8 aynen gecer.

Donusturucu, gercek LibreDWG yerine PATH'in basina konan TAKLIT `dwg2dxf`tir:
converter.py onu `shutil.which` ile bulur, upload_worker alt sureci PATH'i miras
alir. Taklit iz dosyasina basladi/bitti damgasi (duvar saati) yazar — olcumlerin
donusum SURERKEN yapildiginin kaniti. Gecici dosyalar `tmp_path`e yonlendirilir:
kapi, canli konteynerde kosulsa bile kalici birime `dwg2dxf_*` BIRAKMAZ (o artik
kullanim olcumunun kanitidir; `ortam` bunu kendisi olcer).

BILINEN SINIRLAR (bu kapi olcmez; boyutla orantili, 120 sn'lik donusumun yaninda kucuk;
yerel olcum 26.09):
  - /upload govdenin sha256'sini ve diske yazimini dongude yapar: 10 MB ~20 ms,
    60 MB ~250 ms, 200 MB ~1 sn.
  (26.09'da KAPANANLAR: /geometry'nin surec ici ezdxf'i ve her istekteki json.load +
   json.dumps'i, GZip-9 ara katmani, /parse sonucunun ana surecte json.loads + dumps'i
   — D5-D8.)
"""
import ast
import hashlib
import http.client
import json
import os
import random
import shlex
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import uuid

import pytest
import uvicorn

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main  # noqa: E402

ESIK_SN = 1.0
AGIR_IS_SN = 6.0

TAKLIT_DWG2DXF = r'''
import os, shutil, sys, time
arg = sys.argv[1:]
cikti = arg[arg.index("-o") + 1]
iz = os.environ["DONGU_TEST_IZ"]
with open(iz, "a", encoding="utf-8") as f:
    f.write(f"basladi {time.time()}\n")
time.sleep(float(os.environ["DONGU_TEST_SURE"]))
shutil.copyfile(os.environ["DONGU_TEST_DXF"], cikti)
with open(iz, "a", encoding="utf-8") as f:
    f.write(f"bitti {time.time()}\n")
'''

TAKLIT_PARSE_ISCISI = r'''
import json, os, sys, time
sys.stdin.read()
iz = os.environ["DONGU_TEST_IZ"]
with open(iz, "a", encoding="utf-8") as f:
    f.write(f"basladi {time.time()}\n")
time.sleep(float(os.environ["DONGU_TEST_SURE"]))
with open(iz, "a", encoding="utf-8") as f:
    f.write(f"bitti {time.time()}\n")
cikti = os.environ.get("DONGU_TEST_CIKTI")
if cikti:  # D8: verilen baytlar aynen (gercek isci de bayt yazar)
    with open(cikti, "rb") as f:
        sys.stdout.buffer.write(f.read())
else:
    print(json.dumps({"taklit": True}))
'''


def _damgalar(iz, olay: str) -> list[float]:
    try:
        with open(iz, encoding="utf-8") as f:
            return [float(s.split()[1]) for s in f if s.startswith(olay + " ")]
    except OSError:
        return []


def _bekle(kosul, sure: float) -> bool:
    son = time.monotonic() + sure
    while time.monotonic() < son:
        if kosul():
            return True
        time.sleep(0.02)
    return bool(kosul())


def _istek(port: int, yontem: str, yol: str, govde: bytes | None = None,
           basliklar: dict | None = None, zaman_asimi: float = 30.0):
    """Yeni baglantida tek istek → (durum, govde, sure_sn, bitis_duvar_saati)."""
    t0 = time.monotonic()
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=zaman_asimi)
    try:
        conn.request(yontem, yol, body=govde, headers=basliklar or {})
        yanit = conn.getresponse()
        veri = yanit.read()
        return yanit.status, veri, time.monotonic() - t0, time.time()
    finally:
        conn.close()


def _multipart(ad: str, icerik: bytes) -> tuple[bytes, dict]:
    sinir = "----dongutest" + uuid.uuid4().hex[:8]
    govde = (
        f"--{sinir}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{ad}\"\r\n"
        "Content-Type: application/octet-stream\r\n\r\n"
    ).encode() + icerik + f"\r\n--{sinir}--\r\n".encode()
    return govde, {"Content-Type": f"multipart/form-data; boundary={sinir}"}


def _saglik_olc(port: int, kez: int = 3) -> list[tuple[int, float, float]]:
    """/health'i `kez` kez olcer → [(durum, sure_sn, bitis_duvar_saati)]."""
    olcumler = []
    for _ in range(kez):
        durum, _veri, sure, bitis = _istek(port, "GET", "/health", zaman_asimi=AGIR_IS_SN * 5)
        olcumler.append((durum, sure, bitis))
        time.sleep(0.1)
    return olcumler


def _donusum_artiklari(dizin: str) -> set[str]:
    try:
        return {ad for ad in os.listdir(dizin) if ad.startswith("dwg2dxf_")}
    except OSError:
        return set()


@pytest.fixture
def ortam(tmp_path, monkeypatch):
    """Yalitilmis onbellek + gecici dizin, PATH'in basinda taklit `dwg2dxf`, gecerli kucuk DXF."""
    gercek_gecici = tempfile.gettempdir()
    artik_once = _donusum_artiklari(gercek_gecici)

    onbellek = tmp_path / "onbellek"
    onbellek.mkdir()
    monkeypatch.setattr(main, "_CACHE_DIR", str(onbellek))
    monkeypatch.setattr(main, "_INTERNAL_API_TOKEN", "")
    # converter'in `mkdtemp(prefix="dwg2dxf_")` dizini (bu surecte ve upload_worker
    # alt surecinde) kalici birime degil buraya duser.
    gecici = tmp_path / "gecici"
    gecici.mkdir()
    monkeypatch.setattr(tempfile, "tempdir", str(gecici))
    for ad in ("TMPDIR", "TEMP", "TMP"):
        monkeypatch.setenv(ad, str(gecici))

    import ezdxf
    doc = ezdxf.new()
    msp = doc.modelspace()
    for i in range(5):
        msp.add_line((0, i * 1000), (5000, i * 1000), dxfattribs={"layer": "BORU"})
    kaynak = tmp_path / "kaynak.dxf"
    doc.saveas(kaynak)

    bin_dizini = tmp_path / "bin"
    bin_dizini.mkdir()
    betik = bin_dizini / "taklit_dwg2dxf.py"
    betik.write_text(TAKLIT_DWG2DXF, encoding="utf-8")
    if os.name == "nt":
        (bin_dizini / "dwg2dxf.bat").write_text(f'@"{sys.executable}" "{betik}" %*\r\n', encoding="utf-8")
    else:
        sarici = bin_dizini / "dwg2dxf"
        sarici.write_text(
            f'#!/bin/sh\nexec {shlex.quote(sys.executable)} {shlex.quote(str(betik))} "$@"\n',
            encoding="utf-8",
        )
        sarici.chmod(0o755)
    monkeypatch.setenv("PATH", str(bin_dizini) + os.pathsep + os.environ.get("PATH", ""))

    iz = tmp_path / "iz.txt"
    monkeypatch.setenv("DONGU_TEST_IZ", str(iz))
    monkeypatch.setenv("DONGU_TEST_SURE", str(AGIR_IS_SN))
    monkeypatch.setenv("DONGU_TEST_DXF", str(kaynak))

    # OLCUT: converter gercek LibreDWG'yi degil TAKLIDI bulur (canli imajda gercegi de PATH'te).
    import converter
    bulunan = converter.find_libredwg()
    assert bulunan and os.path.samefile(os.path.dirname(bulunan), bin_dizini), (
        f"OLCUT: converter taklit dwg2dxf'i bulmadi: {bulunan}")
    yield iz
    yeni_artik = _donusum_artiklari(gercek_gecici) - artik_once
    assert not yeni_artik, (
        f"kapi gercek gecici dizine {sorted(yeni_artik)} birakti — kalici birimdeki "
        "`dwg2dxf_*` sayimi (kullanim kaniti) bozulur")


@pytest.fixture
def sunucu(ortam):
    """Gercek `main.app` (gercek ara katman yigini) + gercek uvicorn, tek isci.
    `http="h11"`: canli imajda httptools YOK (uvicorn [standard] degil), yerelde olabilir."""
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    srv = uvicorn.Server(uvicorn.Config(main.app, host="127.0.0.1", port=port,
                                        log_level="warning", http="h11"))
    th = threading.Thread(target=srv.run, daemon=True)
    th.start()
    son = time.monotonic() + 15
    while not srv.started and time.monotonic() < son:
        time.sleep(0.05)
    assert srv.started, "OLCUT: uvicorn ayaga kalkmadi"
    yield port
    srv.should_exit = True
    th.join(30)
    # Arka plan isi hala suruyorsa monkeypatch geri alininca GERCEK onbellege yazar.
    assert not th.is_alive(), "sunucu 30 sn'de kapanmadi (arka plan isi suruyor)"


def _esik_altinda(olcumler, ne: str) -> None:
    for durum, sure, _bitis in olcumler:
        assert durum == 200, f"{ne}: HTTP {durum}"
        assert sure < ESIK_SN, (
            f"{ne} {sure:.2f} sn surdu (esik {ESIK_SN} sn) — agir is OLAY DONGUSUNU BLOKLUYOR")


def test_D1_donusum_surerken_dongu_serbest(sunucu, ortam):
    port, iz = sunucu, ortam
    govde, basliklar = _multipart("proje.dwg", b"AC1018" + os.urandom(4096))
    kutu: dict = {}

    def yukle():
        kutu["yanit"] = _istek(port, "POST", "/upload", govde, basliklar, zaman_asimi=AGIR_IS_SN * 10)

    yukleyici = threading.Thread(target=yukle, daemon=True)
    yukleyici.start()
    assert _bekle(lambda: _damgalar(iz, "basladi"), 60), "OLCUT: taklit donusturucu hic cagrilmadi"

    saglik = _saglik_olc(port)
    _esik_altinda(saglik, "donusum surerken /health")

    yukleyici.join(AGIR_IS_SN * 10)
    assert "yanit" in kutu, "/upload donmedi"
    durum, veri, _sure, _bitis = kutu["yanit"]
    assert durum == 200, veri[:300]
    file_id = json.loads(veri)["file_id"]

    durumlar = []
    for _ in range(3):
        d, v, sure, bitis = _istek(port, "GET", f"/status/{file_id}", zaman_asimi=AGIR_IS_SN * 5)
        durumlar.append((d, sure, bitis))
        assert json.loads(v).get("status") == "processing", v[:300]
        time.sleep(0.1)
    _esik_altinda(durumlar, "donusum surerken /status")

    assert _bekle(lambda: _damgalar(iz, "bitti"), AGIR_IS_SN * 5), "taklit donusum bitmedi"
    bitti = _damgalar(iz, "bitti")[0]
    son_olcum = max(b for _d, _s, b in saglik + durumlar)
    assert son_olcum < bitti, (
        f"OLCUT: olcumler donusum SURERKEN yapilmadi (son olcum {son_olcum:.2f}, bitis {bitti:.2f})")

    def hazir():
        _d, v, _s, _b = _istek(port, "GET", f"/status/{file_id}")
        kutu["durum"] = json.loads(v)
        return kutu["durum"].get("status") != "processing"

    assert _bekle(hazir, 60), "arka plan isi bitmedi"
    assert kutu["durum"].get("status") == "ready", kutu["durum"]
    assert [l["layer"] for l in kutu["durum"].get("layers", [])] == ["BORU"], kutu["durum"]

    # Gercek iscinin yazdigi geometri: /geometry onu BAYT BAYT dondurur, katı JSON.
    d, v, _s, _b = _istek(port, "GET", f"/geometry/{file_id}")
    assert d == 200, v[:300]
    with open(main._geometry_cache_path(file_id), "rb") as f:
        assert v == f.read(), "/geometry dosyanin baytlarini degistirdi"
    cizgiler = json.loads(v, parse_constant=lambda c: pytest.fail(f"katı olmayan JSON: {c}"))["lines"]
    assert [c["layer"] for c in cizgiler] == ["BORU"] * 5, cizgiler


@pytest.fixture
def taklit_parse(ortam, tmp_path, monkeypatch):
    isci = tmp_path / "taklit_parse_iscisi.py"
    isci.write_text(TAKLIT_PARSE_ISCISI, encoding="utf-8")
    monkeypatch.setattr(main, "_PARSE_WORKER_YOLU", str(isci))
    file_id = "dongutest" + uuid.uuid4().hex[:3]
    with open(main._cache_path(file_id), "w", encoding="utf-8") as f:
        f.write("0\nEOF\n")  # taklit isci DXF okumaz; uc yalniz varligina bakar
    return file_id


def test_D2_parse_surerken_dongu_serbest(sunucu, ortam, taklit_parse):
    port, iz, file_id = sunucu, ortam, taklit_parse
    sinir = "----dongutest"
    kutu: dict = {}

    def ayir():
        kutu["yanit"] = _istek(
            port, "POST", f"/parse?file_id={file_id}&scale=0.01",
            f"--{sinir}--\r\n".encode(),  # NestJS'in gonderdigi bos multipart
            {"Content-Type": f"multipart/form-data; boundary={sinir}"},
            zaman_asimi=AGIR_IS_SN * 10,
        )

    ayirici = threading.Thread(target=ayir, daemon=True)
    ayirici.start()
    assert _bekle(lambda: _damgalar(iz, "basladi"), 30), "OLCUT: taklit parse iscisi hic baslamadi"

    saglik = _saglik_olc(port)
    _esik_altinda(saglik, "parse surerken /health")

    ayirici.join(AGIR_IS_SN * 10)
    assert "yanit" in kutu, "/parse donmedi"
    durum, veri, _sure, _bitis = kutu["yanit"]
    assert durum == 200 and json.loads(veri) == {"taklit": True}, (durum, veri[:300])
    bitti = _damgalar(iz, "bitti")[0]
    assert max(b for _d, _s, b in saglik) < bitti, "OLCUT: olcumler parse SURERKEN yapilmadi"


def test_D3_eski_yollar_kapali_donusum_baslamaz(sunucu, ortam, tmp_path, monkeypatch):
    port, iz = sunucu, ortam
    for yol, beklenen in (("/layers", 404), ("/convert", 404), ("/parse?discipline=mechanical", 400)):
        govde, basliklar = _multipart("proje.dwg", b"AC1018" + os.urandom(4096))
        durum, veri, sure, _bitis = _istek(port, "POST", yol, govde, basliklar, zaman_asimi=AGIR_IS_SN * 10)
        assert durum == beklenen, f"POST {yol}: HTTP {durum} (beklenen {beklenen}) {veri[:200]!r}"
        assert sure < ESIK_SN, f"POST {yol} {sure:.2f} sn surdu (esik {ESIK_SN} sn)"
    time.sleep(0.3)
    assert _damgalar(iz, "basladi") == [], "eski yol DWG→DXF donusumunu BASLATTI"

    # OLCUT: ayni zincir (converter → PATH → taklit) cagrilirsa iz BIRAKIR —
    # yukaridaki "iz yok" sonucu bozuk olcumden degil gercek yokluktan gelir.
    import converter
    monkeypatch.setenv("DONGU_TEST_SURE", "0")
    ornek = tmp_path / "olcut.dwg"
    ornek.write_bytes(b"AC1018")
    cikti = converter.convert_dwg_to_dxf(str(ornek))
    try:
        assert len(_damgalar(iz, "basladi")) == 1, "OLCUT: taklit donusturucu iz birakmiyor"
    finally:
        shutil.rmtree(os.path.dirname(cikti), ignore_errors=True)


# ── D5-D8: GEOMETRI ONBELLEGI + YANIT BAYTLARI (26.09) ───────────────────────

# Canli olcum (26.09, kalici birim): geometri yanitlari 11,48 MB ve 17,04 MB.
GEOMETRI_MB = 17.0
PARALEL = 16


def _yeni_kimlik() -> str:
    """Motorun urettigi bicimde (upload_async: `uuid4().hex[:12]`) kimlik — yol
    yardimcilari bicimsiz kimlige yol kurmaz; bicim degisirse TEK yer burasi."""
    return uuid.uuid4().hex[:12]


def _geometri_govdesi(hedef_mb: float) -> bytes:
    """GeometryResult bicimli, canlidaki karisimla (yay agirlikli) sentetik yanit."""
    rnd = random.Random(26)

    def n() -> float:
        return round(rnd.uniform(-5e4, 5e4), 6)

    parti = {
        "lines": [{"layer": f"BORU-{i % 40}", "color": 256, "coords": [n(), n(), n(), n()]}
                  for i in range(4000)],
        "inserts": [{"insert_index": i, "layer": "YNG SPRİNK", "color": 256, "insert_name": "SPR",
                     "position": [n(), n()], "rotation": 90.0, "scale": [1.0, 1.0]} for i in range(250)],
        "texts": [{"text": "Ø50 ÇİĞÖŞÜ �", "layer": "YAZI", "color": 7, "position": [n(), n()],
                   "height": 2.5, "rotation": 0.0} for _ in range(120)],
        "circles": [{"circle_index": i, "layer": "DAIRE", "color": 3, "center": [n(), n()],
                     "radius": 12.5} for i in range(900)],
        "arcs": [{"layer": "YAY", "color": 256, "center": [n(), n()], "radius": 7.25,
                  "start_angle": rnd.uniform(0, 360), "end_angle": rnd.uniform(0, 360)}
                 for _ in range(9000)],
    }
    tek = len(json.dumps(parti, ensure_ascii=False).encode("utf-8"))
    kat = max(1, round(hedef_mb * 1e6 / tek))
    nesne = {k: v * kat for k, v in parti.items()}
    nesne["bounds"] = [-5e4, -5e4, 5e4, 5e4]
    nesne["layer_colors"] = {"YNG SPRİNK": 3, "YAZI": 7}
    return json.dumps(nesne, allow_nan=False, ensure_ascii=False).encode("utf-8")


def _hazir_kayit(file_id: str, durum: str = "ready", geometri: bytes | None = None,
                 dxf_kaynagi: str | None = None, hash_: str = "0" * 16,
                 kapsam: str | None = None) -> None:
    """Onbellekte bir yukleme kaydi: DXF (+ istenirse geometri) + durum dosyasi.
    Yollar YALNIZ main yardimcilarindan (bicim/konum kurali orada)."""
    if dxf_kaynagi:
        shutil.copyfile(dxf_kaynagi, main._cache_path(file_id))
    else:
        with open(main._cache_path(file_id), "w", encoding="utf-8") as f:
            f.write("0\nEOF\n")  # yer tutucu: /geometry DXF'i okumaz
    if geometri is not None:
        with open(main._geometry_cache_path(file_id), "wb") as f:
            f.write(geometri)
    main._write_state(file_id, {"status": durum, "hash": hash_, "started_at": time.time(),
                                "detector_version": main.DETECTOR_VERSION, "kapsam": kapsam})


def _geometri_cek(port: int, yol: str, kutu: dict, i: int) -> None:
    """Nest gibi gzip isteyerek /geometry'yi okur; govdeyi tutmaz (ozet + boy)."""
    t0 = time.monotonic()
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=120)
    try:
        conn.request("GET", yol, headers={"Accept-Encoding": "gzip, deflate"})
        yanit = conn.getresponse()
        ozet, boy = hashlib.sha256(), 0
        while parca := yanit.read(65536):
            ozet.update(parca)
            boy += len(parca)
        kutu[i] = (yanit.status, yanit.getheader("Content-Encoding"), boy, ozet.hexdigest(),
                   t0, time.monotonic())
    finally:
        conn.close()


def test_D5_paralel_geometri_surerken_dongu_serbest(sunucu, ortam):
    port = sunucu
    govde = _geometri_govdesi(GEOMETRI_MB)
    assert len(govde) >= GEOMETRI_MB * 0.9e6, f"OLCUT: yanit {len(govde) / 1e6:.1f} MB"
    file_id = _yeni_kimlik()
    _hazir_kayit(file_id, geometri=govde)

    kutu: dict = {}
    yoklamalar: list[tuple[int, float, float, float]] = []
    dur = threading.Event()

    def yokla():
        while not dur.is_set():
            t0 = time.monotonic()
            d, _v, sure, _b = _istek(port, "GET", "/health", zaman_asimi=120)
            yoklamalar.append((d, sure, t0, time.monotonic()))
            time.sleep(0.02)

    # Yarisi eski saldiri bicimi: `?layers=` eskiden her istekte DXF'i surec icinde okuturdu.
    cekiciler = [threading.Thread(target=_geometri_cek, daemon=True, args=(
        port, f"/geometry/{file_id}" + ("?layers=BORU-1" if i % 2 else ""), kutu, i))
        for i in range(PARALEL)]
    yoklayici = threading.Thread(target=yokla, daemon=True)
    yoklayici.start()
    for t in cekiciler:
        t.start()
    for t in cekiciler:
        t.join(300)
    dur.set()
    yoklayici.join(150)

    assert len(kutu) == PARALEL, f"{PARALEL - len(kutu)} /geometry istegi donmedi"
    # 1) Asil sozlesme: dongu serbest.
    assert yoklamalar, "OLCUT: /health hic yoklanmadi"
    en_uzun = max(sure for _d, sure, _t0, _t1 in yoklamalar)
    assert all(d == 200 for d, *_ in yoklamalar), yoklamalar
    assert en_uzun < ESIK_SN, (f"{PARALEL} paralel /geometry surerken /health {en_uzun:.2f} sn "
                               f"(esik {ESIK_SN} sn) — geometri OLAY DONGUSUNU BLOKLUYOR")
    # OLCUT: yoklamalar istekler AKARKEN yapildi (yoksa esik bos kumeyi olcer).
    akarken = [y for y in yoklamalar
               if sum(1 for *_, a0, a1 in kutu.values() if a0 <= y[2] and y[3] <= a1) >= PARALEL // 2]
    assert len(akarken) >= 3, (f"OLCUT: isteklerin yarisi akarken yalniz {len(akarken)} yoklama "
                               f"(toplam {len(yoklamalar)})")
    # 2) Yanit: dosyanin baytlari, sikistirmasiz (`?layers=` yok sayilir).
    beklenen = (len(govde), hashlib.sha256(govde).hexdigest())
    for i, (durum, kodlama, boy, ozet, _t0, _t1) in sorted(kutu.items()):
        assert durum == 200, f"istek {i}: HTTP {durum}"
        assert kodlama is None, f"istek {i}: yanit sikistirilmis ({kodlama}) — sikistirma dongude kosar"
        assert (boy, ozet) == beklenen, f"istek {i}: yanit dosyanin baytlari degil ({boy} bayt)"


def _tuzak_kur(monkeypatch) -> list[str]:
    """Surec ici DXF okuma yollarina tuzak: cagri kaydedilir ve hata firlatir."""
    import converter
    import ezdxf
    cagrilar: list[str] = []

    def tuzak(ad):
        def f(*_a, **_k):
            cagrilar.append(ad)
            raise RuntimeError(f"TUZAK: {ad} surec icinde cagrildi")
        return f

    monkeypatch.setattr(converter, "read_dxf", tuzak("converter.read_dxf"))
    monkeypatch.setattr(main, "read_dxf", tuzak("main.read_dxf"))
    monkeypatch.setattr(ezdxf, "readfile", tuzak("ezdxf.readfile"))
    return cagrilar


def test_D6_onbellek_yoksa_409_dxf_okunmaz(sunucu, ortam, monkeypatch):
    port = sunucu
    cagrilar = _tuzak_kur(monkeypatch)
    gercek_dxf = os.environ["DONGU_TEST_DXF"]  # okunsaydi okunabilirdi (tuzak olmasa)
    kimlik = {d: _yeni_kimlik() for d in ("ready", "error", "processing")}
    for durum, fid in kimlik.items():
        _hazir_kayit(fid, durum=durum, dxf_kaynagi=gercek_dxf)

    kutu: dict = {}

    def iste(i):
        fid = kimlik["ready" if i % 3 == 0 else "error"]
        kutu[i] = _istek(port, "GET", f"/geometry/{fid}" + ("?layers=BORU" if i % 2 else ""))

    isteyiciler = [threading.Thread(target=iste, args=(i,), daemon=True) for i in range(PARALEL)]
    for t in isteyiciler:
        t.start()
    for t in isteyiciler:
        t.join(60)
    assert len(kutu) == PARALEL, "geometri istekleri donmedi"
    for i, (durum, veri, sure, _b) in sorted(kutu.items()):
        assert durum == 409, f"istek {i}: HTTP {durum} {veri[:200]!r} (beklenen 409)"
        assert sure < ESIK_SN, f"istek {i}: 409 {sure:.2f} sn surdu"
        assert "yeniden yukleyin" in json.loads(veri)["detail"], veri[:200]

    durum, veri, _s, _b = _istek(port, "GET", f"/geometry/{kimlik['processing']}")
    assert durum == 409 and "isleniyor" in json.loads(veri)["detail"], (durum, veri[:200])
    durum, _v, _s, _b = _istek(port, "GET", f"/geometry/{_yeni_kimlik()}")  # bicimli, yuklenmemis
    assert durum == 404, f"bilinmeyen file_id: HTTP {durum}"
    assert cagrilar == [], f"/geometry DXF'i SUREC ICINDE okudu: {cagrilar}"

    # OLCUT: tuzak gercek okuma yolunu (eski ucun kullandigi) yakaliyor.
    import geometry
    with pytest.raises(RuntimeError, match="TUZAK"):
        geometry.extract_geometry(main._cache_path(kimlik["ready"]))
    assert cagrilar == ["converter.read_dxf"], cagrilar


def test_D6b_dedup_geometrisiz_hazir_kaydi_dondurmez(sunucu, ortam, monkeypatch):
    port = sunucu
    monkeypatch.setenv("DONGU_TEST_SURE", "0")
    icerik = b"AC1018" + os.urandom(4096)
    h = hashlib.sha256(icerik).hexdigest()[:16]
    # Firma kapsami (Nest'in opak anahtari, 64 hex) hem gonderilir hem kayda yazilir: kapsami
    # tanimayan motor alani yok sayar (dedup genel), taniyan yalniz ayni kapsamda tekillestirir.
    kapsam = hashlib.sha256(b"D6b-firma").hexdigest()
    eski = _yeni_kimlik()
    _hazir_kayit(eski, hash_=h, kapsam=kapsam)  # "ready" + DXF, geometri YOK (deploy oncesi bicim)
    dosya, basliklar = _multipart("proje.dwg", icerik)
    sinir = basliklar["Content-Type"].split("boundary=", 1)[1]
    govde = (f"--{sinir}\r\nContent-Disposition: form-data; name=\"kapsam\"\r\n\r\n{kapsam}\r\n"
             ).encode() + dosya

    d, v, _s, _b = _istek(port, "POST", "/upload", govde, basliklar)
    yeni = json.loads(v)
    assert d == 200 and yeni["file_id"] != eski and not yeni.get("dedup"), (
        f"geometrisi olmayan kayda dedup yapildi: {yeni}")
    assert _bekle(lambda: (main._read_state(yeni["file_id"]) or {}).get("status") == "ready", 60), (
        main._read_state(yeni["file_id"]))
    assert os.path.isfile(main._geometry_cache_path(yeni["file_id"])), "yeni isleme geometri uretmedi"

    # OLCUT: geometrisi olan hazir kayda ayni icerik (ayni kapsamda) DEDUP edilir.
    d, v, _s, _b = _istek(port, "POST", "/upload", govde, basliklar)
    ikinci = json.loads(v)
    assert (ikinci["file_id"], ikinci["status"], ikinci.get("dedup")) == (yeni["file_id"], "ready", True), v[:200]


TAKLIT_UPLOAD_ISCISI = r'''
import json, os, sys
p = json.loads(sys.stdin.read())
with open(p["dxf_out"], "w") as f:
    f.write("0\nEOF\n")
with open(p["geom_out"] + ".tmp", "w") as f:
    f.write('{"lines": [')  # yazim yarida
with open(os.environ["DONGU_TEST_IZ"], "a", encoding="utf-8") as f:
    f.write("yazdi 0\n")
if os.environ["DONGU_TEST_ISCI_KIP"] == "geometrisiz":  # basari der ama geometri yok
    print(json.dumps({"layers": [], "total_layers": 0}))
    sys.exit(0)
sys.stdout.flush()
os._exit(137)  # OOM oldurmesinin cikis kodu (SIGKILL'de -9; ikisi de OOM sayilir)
'''


@pytest.mark.parametrize("kip, hata", [("oom", "OOM"), ("geometrisiz", "geometri dosyasi yok")])
def test_D7a_isci_olurse_ana_surec_yarim_ciktiyi_siler(ortam, tmp_path, monkeypatch, kip, hata):
    iz = ortam
    isci = tmp_path / "taklit_upload_iscisi.py"
    isci.write_text(TAKLIT_UPLOAD_ISCISI, encoding="utf-8")
    monkeypatch.setattr(main, "_UPLOAD_WORKER_YOLU", str(isci))
    monkeypatch.setenv("DONGU_TEST_ISCI_KIP", kip)
    fid = _yeni_kimlik()
    kaynak = main._src_path(fid, "dwg")
    with open(kaynak, "wb") as f:
        f.write(b"AC1018")
    main._write_state(fid, {"status": "processing", "hash": "h", "started_at": time.time()})

    main._background_pipeline(fid, kaynak)

    assert _damgalar(iz, "yazdi"), "OLCUT: taklit isci ciktilari yazmadan oldu"
    durum = main._read_state(fid)
    # "ready" geometrinin VARLIGINI garanti eder; yoksa kullanici 409'da kalirdi.
    assert durum["status"] == "error" and hata in durum["error"], durum
    geometri = main._geometry_cache_path(fid)
    for yol in (main._cache_path(fid), geometri, geometri + ".tmp", kaynak):
        assert not os.path.exists(yol), f"basarisiz yuklemenin ciktisi kaldi: {os.path.basename(yol)}"


def test_D7b_gercek_isci_hatada_dxf_i_siler(ortam, tmp_path):
    isci = os.path.join(os.path.dirname(os.path.abspath(main.__file__)), "upload_worker.py")

    def kos(geom_out) -> subprocess.CompletedProcess:
        kaynak = tmp_path / "girdi.dxf"
        shutil.copyfile(os.environ["DONGU_TEST_DXF"], kaynak)  # DXF girdisi tasinir, her kosuda yeni
        yuk = {"src_path": str(kaynak), "dxf_out": str(tmp_path / "onbellek.dxf"), "geom_out": str(geom_out)}
        return subprocess.run([sys.executable, isci], input=json.dumps(yuk),
                              capture_output=True, text=True, timeout=180)

    # DXF onbellege TASINDIKTAN SONRA hata: geometri hedef dizini yok.
    sonuc = kos(tmp_path / "olmayan_dizin" / "g.json")
    assert sonuc.returncode == 1 and "upload_worker FAIL" in sonuc.stderr, sonuc.stderr[-800:]
    assert not (tmp_path / "onbellek.dxf").exists(), "isci hatada onbellek DXF'ini BIRAKTI"

    # OLCUT: ayni girdi yazilabilir hedefle basarir ve iki ciktiyi da uretir.
    sonuc = kos(tmp_path / "g.json")
    assert sonuc.returncode == 0, sonuc.stderr[-800:]
    assert (tmp_path / "onbellek.dxf").exists() and (tmp_path / "g.json").exists()
    assert not (tmp_path / "g.json.tmp").exists(), "atomik yazimin gecici dosyasi kaldi"


def test_D8_parse_yaniti_isci_baytlarinin_aynisi(sunucu, ortam, taklit_parse, tmp_path, monkeypatch):
    port, file_id = sunucu, taklit_parse
    # Kanonik OLMAYAN bicim (bosluk, 2e3) + UTF-8 + >1 KB (sikistirma esiginin ustu):
    # ana surec cozup yeniden yazsaydi baytlar degisirdi.
    cikti = ('{"b":1,  "a":[1.0,2e3],"t":"İŞĞ Ø","dolgu":"' + "x" * 4000 + '"}').encode("utf-8")
    assert json.dumps(json.loads(cikti), ensure_ascii=False).encode("utf-8") != cikti, "OLCUT"
    (tmp_path / "cikti.bin").write_bytes(cikti)
    monkeypatch.setenv("DONGU_TEST_CIKTI", str(tmp_path / "cikti.bin"))
    monkeypatch.setenv("DONGU_TEST_SURE", "0")
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=60)
    try:
        conn.request("POST", f"/parse?file_id={file_id}", body=b"--x--\r\n", headers={
            "Content-Type": "multipart/form-data; boundary=x", "Accept-Encoding": "gzip, deflate"})
        yanit = conn.getresponse()
        veri = yanit.read()
    finally:
        conn.close()
    assert yanit.status == 200, veri[:300]
    assert yanit.getheader("Content-Encoding") is None, "yanit sikistirildi — sikistirma dongude kosar"
    assert veri == cikti, "ana surec isci ciktisini COZUP YENIDEN YAZDI (C json GIL'i birakmaz)"


def test_D8b_gercek_parse_iscisi_utf8_bayt_yazar(tmp_path):
    """Aktarilan baytlar UTF-8 olmali: metin akisi yerel kodlamayi (Windows cp1254) kullanirdi.
    Yerel kodlama `PYTHONIOENCODING` ile cp1254'e zorlanir — ayrim Linux'ta da olculur
    (canli imajin yereli UTF-8; zorlamasiz metin kipi orada ayirt edilemiyordu)."""
    import ezdxf
    katman = "YANGIN-İŞĞ"
    doc = ezdxf.new()
    doc.modelspace().add_line((0, 0), (5000, 0), dxfattribs={"layer": katman})
    doc.saveas(tmp_path / "tr.dxf")
    isci = os.path.join(os.path.dirname(os.path.abspath(main.__file__)), "parse_worker.py")
    yuk = json.dumps({"dxf_path": str(tmp_path / "tr.dxf"), "scale": 0.001, "selected_layers": [katman]})
    sonuc = subprocess.run([sys.executable, isci], input=yuk.encode("ascii"), capture_output=True,
                           timeout=180, env={**os.environ, "PYTHONIOENCODING": "cp1254"})
    assert sonuc.returncode == 0, sonuc.stderr[-800:]
    assert [k["layer"] for k in json.loads(sonuc.stdout.decode("utf-8"))["layers"]] == [katman]


# ── D4: YAPI — `async def` govdesinde agir cagri yok ─────────────────────────

AGIR_TEMEL = {
    "convert_dwg_to_dxf", "read_dxf", "readfile", "validate_dxf_integrity",
    "extract_layer_info_from_doc", "extract_geometry", "extract_geometry_from_doc",
    "analyze_dxf_metraj", "analyze_topology", "detect_unit",
}
ALT_SUREC_FONK = {"run", "Popen", "call", "check_call", "check_output", "getoutput", "getstatusoutput"}
MODUL_ENGELLEYEN = {"subprocess": ALT_SUREC_FONK, "time": {"sleep"}, "os": {"system", "popen"}}


def _dogrudan_cagrilar(govde: list[ast.stmt]):
    """Govde CALISINCA yapilan cagrilar. Ic ice def/lambda GOVDESINE girilmez
    (`to_thread`e verilen fonksiyon ya da lambda dongude kosmaz); ama tanim aninda
    calisan dekorator, varsayilan arguman ve sinif govdesi taranir."""
    yigin: list[ast.AST] = list(govde)
    while yigin:
        dugum = yigin.pop()
        if isinstance(dugum, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
            if not isinstance(dugum, ast.Lambda):
                yigin.extend(dugum.decorator_list)
            yigin.extend(dugum.args.defaults)
            yigin.extend(d for d in dugum.args.kw_defaults if d is not None)
            continue
        if isinstance(dugum, ast.Call):
            yield dugum
        yigin.extend(ast.iter_child_nodes(dugum))


def _yerel_tanimlar(govde: list[ast.stmt]) -> dict[str, list[ast.stmt]]:
    """Govdenin KENDI kapsamindaki def'ler ve ada baglanan lambda'lar (ad → govde)."""
    tanimlar: dict[str, list[ast.stmt]] = {}
    yigin: list[ast.AST] = list(govde)
    while yigin:
        dugum = yigin.pop()
        if isinstance(dugum, (ast.FunctionDef, ast.AsyncFunctionDef)):
            tanimlar[dugum.name] = dugum.body
            continue
        if isinstance(dugum, (ast.Lambda, ast.ClassDef)):
            continue
        if isinstance(dugum, ast.Assign) and isinstance(dugum.value, ast.Lambda):
            for hedef in dugum.targets:
                if isinstance(hedef, ast.Name):
                    tanimlar[hedef.id] = [ast.Expr(dugum.value.body)]
        yigin.extend(ast.iter_child_nodes(dugum))
    return tanimlar


def _dongu_ihlalleri(kaynak: str) -> tuple[list[str], list[str]]:
    """→ (denetlenen async adlari, ihlaller)."""
    agac = ast.parse(kaynak)

    # Takma adlar: `import subprocess as _sp`, `from time import sleep`, `from converter
    # import convert_dwg_to_dxf as cevir` — fonksiyon icindekiler dahil.
    modul_adlari: dict[str, str] = {m: m for m in MODUL_ENGELLEYEN}
    ciplak: dict[str, str] = {}
    agir: dict[str, str] = {ad: ad for ad in AGIR_TEMEL}
    for d in ast.walk(agac):
        if isinstance(d, ast.Import):
            for a in d.names:
                if a.name in MODUL_ENGELLEYEN:
                    modul_adlari[a.asname or a.name] = a.name
        elif isinstance(d, ast.ImportFrom):
            for a in d.names:
                ad = a.asname or a.name
                if d.module in MODUL_ENGELLEYEN and a.name in MODUL_ENGELLEYEN[d.module]:
                    ciplak[ad] = f"{d.module}.{a.name}"
                elif a.name in AGIR_TEMEL:
                    agir[ad] = a.name

    def neden(c: ast.Call, bilinen: dict[str, str]) -> str | None:
        f = c.func
        if isinstance(f, ast.Name):
            if f.id in bilinen:
                return f"{f.id} → {bilinen[f.id]}"
            if f.id in ciplak:
                return ciplak[f.id]
        elif isinstance(f, ast.Attribute):
            if f.attr in AGIR_TEMEL or f.attr == "communicate":
                return f"*.{f.attr}"
            if isinstance(f.value, ast.Name) and f.value.id in modul_adlari:
                modul = modul_adlari[f.value.id]
                if f.attr in MODUL_ENGELLEYEN[modul]:
                    return f"{modul}.{f.attr}"
        return None

    def ihlaller(govde: list[ast.stmt], bilinen: dict[str, str]) -> list[tuple[int, str]]:
        yerel = _yerel_tanimlar(govde)
        # Yerel tanim disaridaki ayni adli fonksiyonu GOLGELER: agirligi kendi govdesinden.
        kapsam = {ad: r for ad, r in bilinen.items() if ad not in yerel}
        degisti = True
        while degisti:
            degisti = False
            for ad, ic_govde in yerel.items():
                if ad not in kapsam:
                    bulunan = ihlaller(ic_govde, kapsam)
                    if bulunan:
                        kapsam[ad] = f"{ad}() → {bulunan[0][1]}"
                        degisti = True
        return [(c.lineno, r) for c in _dogrudan_cagrilar(govde) if (r := neden(c, kapsam))]

    senkron = {d.name: d for d in agac.body if isinstance(d, ast.FunctionDef)}
    degisti = True
    while degisti:
        degisti = False
        for ad, fonk in senkron.items():
            if ad not in agir:
                bulunan = ihlaller(fonk.body, agir)
                if bulunan:
                    agir[ad] = bulunan[0][1]
                    degisti = True

    asenkron: list[tuple[str, ast.AsyncFunctionDef]] = []
    for d in agac.body:
        if isinstance(d, ast.AsyncFunctionDef):
            asenkron.append((d.name, d))
        elif isinstance(d, ast.ClassDef):
            asenkron += [(f"{d.name}.{y.name}", y) for y in d.body if isinstance(y, ast.AsyncFunctionDef)]

    denetlenen, bulunanlar = [], []
    for ad, fonk in asenkron:
        denetlenen.append(ad)
        bulunanlar += [f"{ad}:{satir} {r}" for satir, r in ihlaller(fonk.body, agir)]
    return denetlenen, bulunanlar


KOTU_ORNEK = '''
import subprocess as sp
import time as t
import ezdxf
from subprocess import run as calistir
from time import sleep
from converter import convert_dwg_to_dxf as cevir

def _yardimci(p):
    return convert_dwg_to_dxf(p)

def _dolayli(p):
    return _yardimci(p)

def _surec(p):
    sp.run(["dwg2dxf", p])

@app.post("/a")
async def dogrudan(p):
    return read_dxf(p)

@app.post("/b")
async def dolayli(p):
    return _dolayli(p)

@app.post("/c")
async def surecli(p):
    _surec(p)
    time.sleep(1)

@app.post("/d")
async def oznitelik(p):
    return ezdxf.readfile(p)

@app.post("/e")
async def ic_def(p):
    def _oku():
        return converter.convert_dwg_to_dxf(p)
    return _oku()

@app.post("/f")
async def takma_adlar(p, proc):
    calistir(["a"])
    sleep(1)
    t.sleep(1)
    cevir(p)
    proc.communicate()

@app.post("/g")
async def ic_async(p):
    async def _gorev():
        return read_dxf(p)
    return await _gorev()

@app.post("/h")
async def lambda_cagrisi(p):
    oku = lambda: read_dxf(p)
    return oku()

@app.post("/i")
async def varsayilan(p, x=read_dxf("sabit.dxf")):
    def ic(q=extract_geometry("s.dxf")):
        return q
    return ic

class Uclar:
    async def yontem(self, p):
        return read_dxf(p)

@app.post("/iyi")
async def iyi(p, olay):
    def _oku():
        return read_dxf(p)
    x = await asyncio.to_thread(_dolayli, p)
    y = await asyncio.to_thread(lambda: read_dxf(p))
    z = await asyncio.to_thread(_oku)
    await asyncio.sleep(0.1)
    await olay.wait()
    return x, y, z
'''


def test_D4_olcut_kotu_ornekleri_yakalar():
    denetlenen, ihlaller = _dongu_ihlalleri(KOTU_ORNEK)
    assert denetlenen == ["dogrudan", "dolayli", "surecli", "oznitelik", "ic_def", "takma_adlar",
                          "ic_async", "lambda_cagrisi", "varsayilan", "Uclar.yontem", "iyi"], denetlenen
    yakalanan = {i.split(":")[0] for i in ihlaller}
    assert yakalanan == set(denetlenen) - {"iyi"}, ihlaller

    def sayi(ad: str) -> int:
        return len([i for i in ihlaller if i.split(":")[0] == ad])

    # surecli: yardimci + time.sleep · takma_adlar: 5 bicim · varsayilan: yalniz ic def'in
    # varsayilani (ucun KENDI varsayilani modul yuklenirken bir kez hesaplanir, dongude degil)
    assert (sayi("surecli"), sayi("takma_adlar"), sayi("varsayilan")) == (2, 5, 1), ihlaller


def test_D4_golgeleyen_yerel_tanim_agirligi_kendinden_alir():
    kaynak = (
        "def _oku(p):\n    return read_dxf(p)\n"
        "async def golge(p):\n    def _oku(q):\n        return q\n    return _oku(p)\n"
    )
    assert _dongu_ihlalleri(kaynak) == (["golge"], [])


def test_D4_async_govdelerde_agir_cagri_yok():
    with open(main.__file__, encoding="utf-8") as f:
        denetlenen, ihlaller = _dongu_ihlalleri(f.read())
    # OLCUT: denetci bos kumeye bakmiyor — bugun bilinen async govdeler bunlar.
    for ad in ("verify_internal_token", "upload_async", "get_upload_status", "parse_dwg",
               "_istemci_kopunca_iptal", "get_geometry"):
        assert ad in denetlenen, f"OLCUT: {ad} denetlenmedi ({denetlenen})"
    assert ihlaller == [], "olay dongusunde agir is:\n  " + "\n  ".join(ihlaller)


# ── D4 (def): `def` uc govdesinde SUREC ICI DXF isi yok ──────────────────────
# Is parcacigi dongu DEGILDIR ama ayni surectir: ezdxf GIL'i dongu ile paylasir, zaman
# asimi yoktur, OOM tum kiracilari dusurur (eski /geometry'nin onbelleksiz yolu).

UC_YONTEMLERI = {"get", "post", "put", "delete", "patch", "api_route"}


def _def_uc_ihlalleri(kaynak: str) -> tuple[list[str], list[str]]:
    """→ (denetlenen `def` uc adlari, ihlaller). Agirlik yalniz DXF isidir (AGIR_TEMEL),
    dogrudan, takma adla ya da main.py yardimcisi uzerinden; alt surec/uyku serbest."""
    agac = ast.parse(kaynak)
    agir: dict[str, str] = {ad: ad for ad in AGIR_TEMEL}
    for d in ast.walk(agac):
        if isinstance(d, ast.ImportFrom):
            for a in d.names:
                if a.name in AGIR_TEMEL:
                    agir[a.asname or a.name] = a.name

    def ihlaller(fonk: ast.FunctionDef) -> list[tuple[int, str]]:
        bulunan = []
        for c in ast.walk(fonk):  # ic def/lambda dahil: is parcacigi onlari da kosar
            if not isinstance(c, ast.Call):
                continue
            if isinstance(c.func, ast.Name) and c.func.id in agir:
                bulunan.append((c.lineno, f"{c.func.id} → {agir[c.func.id]}"))
            elif isinstance(c.func, ast.Attribute) and c.func.attr in AGIR_TEMEL:
                bulunan.append((c.lineno, f"*.{c.func.attr}"))
        return bulunan

    senkron = {d.name: d for d in agac.body if isinstance(d, ast.FunctionDef)}
    degisti = True
    while degisti:
        degisti = False
        for ad, fonk in senkron.items():
            if ad not in agir and (bulunan := ihlaller(fonk)):
                agir[ad] = f"{ad}() → {bulunan[0][1]}"
                degisti = True

    def uc_mu(fonk: ast.FunctionDef) -> bool:
        return any(isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute)
                   and d.func.attr in UC_YONTEMLERI for d in fonk.decorator_list)

    uclar = [f for f in agac.body if isinstance(f, ast.FunctionDef) and uc_mu(f)]
    return ([f.name for f in uclar],
            [f"{f.name}:{satir} {r}" for f in uclar for satir, r in ihlaller(f)])


KOTU_DEF_ORNEK = '''
import subprocess
from geometry import extract_geometry as cikar

def _yardimci(p):
    return read_dxf(p)

def _surec(p):
    return subprocess.run(["python", "isci.py", p])

@app.get("/a")
def dogrudan(p):
    return extract_geometry(p, None)

@app.get("/b")
def dolayli(p):
    return _yardimci(p)

@app.get("/c")
def takma_ad(p):
    return cikar(p)

@app.post("/d")
def oznitelik(p):
    def _ic():
        return ezdxf.readfile(p)
    return _ic()

@app.get("/iyi")
def iyi(p):
    time.sleep(1)
    return _surec(p), json.loads(p)

def uc_degil(p):
    return read_dxf(p)
'''


def test_D4_def_olcut_kotu_ornekleri_yakalar():
    denetlenen, ihlaller = _def_uc_ihlalleri(KOTU_DEF_ORNEK)
    assert denetlenen == ["dogrudan", "dolayli", "takma_ad", "oznitelik", "iyi"], denetlenen
    assert {i.split(":")[0] for i in ihlaller} == {"dogrudan", "dolayli", "takma_ad", "oznitelik"}, ihlaller


def test_D4_def_uclarda_surec_ici_dxf_isi_yok():
    with open(main.__file__, encoding="utf-8") as f:
        denetlenen, ihlaller = _def_uc_ihlalleri(f.read())
    for ad in ("health", "debug_raw_state", "debug_status_deep", "debug_info"):
        assert ad in denetlenen, f"OLCUT: {ad} denetlenmedi ({denetlenen})"
    assert ihlaller == [], "def ucta surec ici DXF isi:\n  " + "\n  ".join(ihlaller)
