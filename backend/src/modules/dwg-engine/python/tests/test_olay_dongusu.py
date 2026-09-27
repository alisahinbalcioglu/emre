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
     "ready" ve layer listesi dolu (yol uctan uca kostu, yalanci yesil yok).
  D2 ⭐ gercek /parse → taklit parse iscisi. Parse SURERKEN /health esigin altinda.
  D3 ⭐ ESKI YOLLAR KAPALI: POST /layers, POST /convert → 404; dosya govdeli,
     file_id'siz /parse → 400. Uc istek de hizli doner ve donusturucu HIC cagrilmaz
     (olcut: ayni taklit dogrudan cagrilinca iz birakiyor).
  D4 YAPI: modul duzeyindeki her `async def` (uclar, ara katman, bekci, sinif
     yontemleri) govdesinde agir cagri YOK — donusum, ezdxf okumasi, alt surec,
     uyku; ad ya da oznitelik olarak (`ezdxf.readfile`), takma adla, main.py
     yardimcilari ya da DOGRUDAN cagrilan ic def/lambda uzerinden DOLAYLI olan da.
     Olcut kendi sinanir: uydurma kotu uclari yakalar, `to_thread`e verileni yakalamaz.

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
  - /parse sonucunun `json.dumps`'i ve GZip ara katmaninin sikistirmasi (seviye 9;
    /parse ve /geometry yanitlari) dongude kosar: 14 MB JSON ~1 sn dumps + ~0,8 sn
    gzip (canlidaki geometri JSON'u 11 MB — her proje acilisinda gzip dongude).
  - /geometry `def` ucudur (is parcacigi havuzu, dongude DEGIL) ama onbellek
    yoksa ya da `layers` suzgeci verilirse DXF'i SUREC ICINDE ezdxf ile okur: GIL
    dongu ile paylasilir, paralel istek motoru yavaslatir/OOM riski. D4 `def`
    govdelerine bakmaz. Ayri is.
"""
import ast
import http.client
import json
import os
import shlex
import shutil
import socket
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


@pytest.fixture
def taklit_parse(ortam, tmp_path, monkeypatch):
    isci = tmp_path / "taklit_parse_iscisi.py"
    isci.write_text(TAKLIT_PARSE_ISCISI, encoding="utf-8")
    monkeypatch.setattr(main, "_PARSE_WORKER_YOLU", str(isci))
    # Motor bicimi (`uuid4().hex[:12]`): bicimsiz kimlige yol kurulmaz (26.09, test_dedup_kapsam V4).
    file_id = uuid.uuid4().hex[:12]
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
               "_istemci_kopunca_iptal"):
        assert ad in denetlenen, f"OLCUT: {ad} denetlenmedi ({denetlenen})"
    assert ihlaller == [], "olay dongusunde agir is:\n  " + "\n  ".join(ihlaller)
