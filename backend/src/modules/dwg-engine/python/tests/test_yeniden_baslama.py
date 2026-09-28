"""Motor yeniden baslarken yarim kalan yukleme "processing"de TAKILMAZ (26.09.2026).

SORUN (kod okunarak bulundu, R1 ile GERCEK yeniden baslamada uretildi): /upload durumu
"processing" yazar ve arka plan isini (`_background_pipeline` → upload_worker alt sureci)
baslatir; sonucu ("ready"/"error") o is yazar. Motor sureci is surerken olurse — her deploy
konteyneri yeniden olusturur — sonucu yazacak kimse kalmaz: durum SONSUZA dek "processing",
ham kaynak (`.src.*`) ve yarim DXF diskte. Dedup ayni icerigi (ayni kapsamda) o olu kimlige
baglar ("processing" + kaynak var → `dedup: true`): kullanici yeniden yukledikce ayni olu
kayda doner, on yuz 10 dk yoklayip zaman asimina duser — TTL temizligine (24 sa) kadar.
/geometry "isleniyor" der. Canli birimde 27.09'da takili kayit YOKTU (salt okuma olculdu);
risk her deploy'da dogar.

KARAR: bu surecin isleri `_ETKIN_YUKLEMELER` kumesinde (/upload "processing" yazmadan ONCE
ekler, is son durumu yazdiktan SONRA cikarir). Tek iscide (WORKERS=1, canli) kumede olmayan
"processing" kaydinin sahibi olmus bir surectir: /status, dedup ve /geometry onu "error"a
cevirir, yarim ciktilari (`_yarim_ciktilari_sil`) ve ham kaynagi siler, dedup ona BAGLANMAZ.
YAS SINIRI YOK: yukleme hatti doluyken is hat semaforunda SIRADA bekler (kosan + sirada);
`started_at`'ten olculen sinir siradaki canli isi oldururdu (R3). Cok iscide kapatma yok (R2).

SOZLESME:
  R1 ⭐ GERCEK yeniden baslama: motor 1 AYRI SURECTE (gercek main.app + uvicorn, yarim cikti
     yazip uyuyan taklit isci); dort yukleme "processing"deyken — ucunun iscisi calisirken,
     dorduncusu hat semaforunda SIRADA (iscisi hic baslamadi) — motor 1 ve isciler OLDURULUR.
     Ayni onbellekte motor 2 (motor 1'den farkli surec: bu pytest sureci, bos is kumesi, bayrak
     `_TEK_ISCI` ZORLANMAZ — ortamdan turetilen gercek deger): (a) /status "error" + "yeniden yukleyin", kaynak ve
     yarim ciktilar silinir; (b) ayni icerik + kapsam yeniden yuklenince olu kimlige dedup
     YAPILMAZ, yeni kimlik "ready" olur, olu kayit "error"; (c) /geometry "isleniyor" DEMEZ;
     (d) sirada olen is de /status'ta "error", ham kaynagi silinir.
  R2 cok iscide (WORKERS>1) kume baska iscinin isini gormez → sahipsiz kayit KAPATILMAZ.
  R3 bu surecin SIRADA bekleyen eski (15 dk) isi canli kalir: /status "processing", dedup surer.
  R4 is son durumu kumeden CIKMADAN once yazar (aksi: denetim "processing" + kumede yok gorur,
     canli isi kapatir ve ciktilarini siler).
  R5 cagiranin elindeki bayat "processing" okumasi diskteki son durumu EZMEZ (once kume, sonra disk).
  R6 `_TEK_ISCI` WORKERS'tan uvicorn'un KENDI kararıyla ayni turetilir (bos/1/2/0 → acik/acik/
     kapali/acik; ayri surecte, beklenen uvicorn.Config'ten) ve uvicorn.run ayni sabiti alir (AST):
     yanlis varsayilan kapatmayi canlida susturur, ters karsilastirma cok iscide canli isi siler.
"""
import ast
import hashlib
import http.client
import json
import os
import signal
import socket
import subprocess
import sys
import threading
import time
import uuid

import pytest
import uvicorn

MOTOR_DIZINI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, MOTOR_DIZINI)

import main  # noqa: E402

KAPSAM = hashlib.sha256(b"yeniden-baslama-firma").hexdigest()

# Motor 1'in taklit iscisi: gercek isci gibi once DXF'i onbellege tasir (burada yarim) ve
# geometriyi .tmp'ye yazmaya baslar, kimligini (PID) bildirir ve uyur — motor olurken is suruyor.
YAVAS_ISCI = r'''
import json, os, sys, time
p = json.loads(sys.stdin.read())
open(p["dxf_out"], "w").write("0\nSECTION\n")
open(p["geom_out"] + ".tmp", "w").write('{"lines": [')
with open(os.environ["YB_ISCI_PID"], "a", encoding="utf-8") as f:
    f.write(f"{os.getpid()}\n")
time.sleep(120)
'''

# Motor 2'nin hizli taklit iscisi: gercek isci gibi DXF + geometri yazar.
HIZLI_ISCI = r'''
import json, sys
p = json.loads(sys.stdin.read())
open(p["dxf_out"], "w").write("0\nEOF\n")
open(p["geom_out"], "w").write('{"lines": []}')
print(json.dumps({"layers": [], "total_layers": 0}))
'''

BOZUK_ISCI = r'''
import sys
sys.stdin.read()
sys.stderr.write("taklit isci hatasi")
sys.exit(1)
'''

# Motor 1: AYRI surec — olunce icindeki hicbir kod calismaz (deploy'daki konteyner gibi).
MOTOR1 = r'''
import os, sys
sys.path.insert(0, os.environ["YB_MOTOR"])
import main, uvicorn
main._CACHE_DIR = os.environ["YB_ONBELLEK"]
main._INTERNAL_API_TOKEN = ""
main._UPLOAD_WORKER_YOLU = os.environ["YB_ISCI"]
uvicorn.run(main.app, host="127.0.0.1", port=int(os.environ["YB_PORT"]), log_level="warning", http="h11")
'''


def _bos_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def _istek(port: int, yontem: str, yol: str, govde: bytes | None = None, basliklar: dict | None = None):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=30)
    try:
        conn.request(yontem, yol, body=govde, headers=basliklar or {})
        r = conn.getresponse()
        return r.status, json.loads(r.read() or b"null")
    finally:
        conn.close()


def _yukle(port: int, icerik: bytes):
    sinir = "----yb" + uuid.uuid4().hex[:8]
    govde = (f"--{sinir}\r\nContent-Disposition: form-data; name=\"kapsam\"\r\n\r\n{KAPSAM}\r\n"
             f"--{sinir}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"proje.dxf\"\r\n"
             "Content-Type: application/octet-stream\r\n\r\n").encode() + icerik + f"\r\n--{sinir}--\r\n".encode()
    return _istek(port, "POST", "/upload", govde, {"Content-Type": f"multipart/form-data; boundary={sinir}"})


def _bekle(kosul, sure: float) -> bool:
    son = time.monotonic() + sure
    while time.monotonic() < son:
        if kosul():
            return True
        time.sleep(0.05)
    return bool(kosul())


def _icerik(etiket: str) -> bytes:
    return b"0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n% " + etiket.encode() + os.urandom(8).hex().encode()


def _kalanlar(file_id: str) -> list[str]:
    """Kaydin durum disindaki dosyalari: ham kaynak, DXF, geometri (+ .tmp)."""
    onek = f"{main._CACHE_PREFIX}{file_id}"
    return sorted(a for a in os.listdir(main._CACHE_DIR)
                  if a.startswith(onek) and not a.endswith(main._STATE_SUFFIX))


@pytest.fixture
def onbellek(tmp_path, monkeypatch):
    dizin = tmp_path / "onbellek"
    dizin.mkdir()
    monkeypatch.setattr(main, "_CACHE_DIR", str(dizin))
    monkeypatch.setattr(main, "_INTERNAL_API_TOKEN", "")
    # Duzeltme oncesi kodda bu ad yok: kapi orada da DOGRU sebeple (davranis) dussun.
    # `_TEK_ISCI` bilerek ZORLANMAZ: ortamdan turetilen gercek deger surulur (R6).
    monkeypatch.setattr(main, "_ETKIN_YUKLEMELER", set(), raising=False)
    hizli = tmp_path / "hizli_isci.py"
    hizli.write_text(HIZLI_ISCI, encoding="utf-8")
    monkeypatch.setattr(main, "_UPLOAD_WORKER_YOLU", str(hizli))
    return dizin


def _motor2_baslat():
    """Bu surecte gercek main.app + uvicorn (motor 1'den FARKLI surec, bos is kumesi)."""
    port = _bos_port()
    srv = uvicorn.Server(uvicorn.Config(main.app, host="127.0.0.1", port=port, log_level="warning", http="h11"))
    th = threading.Thread(target=srv.run, daemon=True)
    th.start()
    assert _bekle(lambda: srv.started, 15), "OLCUT: motor 2 ayaga kalkmadi"
    return port, srv, th


@pytest.fixture
def motor2(onbellek):
    port, srv, th = _motor2_baslat()
    yield port
    srv.should_exit = True
    th.join(30)


def _motor1_ile_takili_kayitlar(onbellek, tmp_path, icerikler: list[bytes], calisan: int) -> list[str]:
    """Motor 1 (ayri surec) yuklemeleri baslatir, isciler calisirken motor 1 ve isciler OLDURULUR.

    Yukleme hatti `calisan` isi AYNI ANDA kosturur (`DWG_YUKLEME_ES_ZAMANLI`); fazlasi hat
    semaforunda SIRADA bekler — iscisi hic baslamadan olen is de "processing" kalir."""
    yavas = tmp_path / "yavas_isci.py"
    yavas.write_text(YAVAS_ISCI, encoding="utf-8")
    pid_dosyasi = tmp_path / "isci_pid.txt"
    port = _bos_port()
    ortam = {**os.environ, "YB_MOTOR": MOTOR_DIZINI, "YB_ONBELLEK": str(onbellek), "YB_ISCI": str(yavas),
             "YB_PORT": str(port), "YB_ISCI_PID": str(pid_dosyasi), "DWG_YUKLEME_ES_ZAMANLI": str(calisan)}
    hata_gunlugu = tmp_path / "motor1.stderr"
    with open(hata_gunlugu, "wb") as hata:
        motor1 = subprocess.Popen([sys.executable, "-c", MOTOR1], env=ortam,
                                  stdout=subprocess.DEVNULL, stderr=hata)
    kimlikler = []

    def iscilerin_pidleri() -> list[int]:
        return [int(x) for x in pid_dosyasi.read_text().split()] if pid_dosyasi.exists() else []

    try:
        def ayakta():
            try:
                return _istek(port, "GET", "/health")[0] == 200
            except OSError:
                return False
        assert _bekle(ayakta, 30), (
            f"OLCUT: motor 1 ayaga kalkmadi (cikis {motor1.poll()}):\n"
            f"{hata_gunlugu.read_text(encoding='utf-8', errors='replace')[-3000:]}")
        for icerik in icerikler:
            d, y = _yukle(port, icerik)
            assert d == 200 and y["status"] == "processing" and not y.get("dedup"), y
            kimlikler.append(y["file_id"])
        assert _bekle(lambda: len(iscilerin_pidleri()) == calisan, 30), "OLCUT: isciler baslamadi"
    finally:
        motor1.kill()  # deploy: konteyner durur — arka plan isi durum YAZAMAZ
        motor1.wait(30)
        for pid in iscilerin_pidleri():
            try:
                os.kill(pid, getattr(signal, "SIGKILL", signal.SIGTERM))  # Windows: TerminateProcess
            except OSError:
                pass
    return kimlikler


def test_R1_gercek_yeniden_baslamada_takili_kayit_kapanir(onbellek, tmp_path):
    icerikler = [_icerik("A"), _icerik("B"), _icerik("C"), _icerik("D")]
    # A, B, C'nin iscisi calisirken; D hat semaforunda SIRADA (iscisi hic baslamadi).
    a, b, c, sirada = _motor1_ile_takili_kayitlar(onbellek, tmp_path, icerikler, calisan=3)
    # OLCUT: olum gercekten "takili" kayit birakti — durum "processing", ham kaynak, yarim DXF ve
    # yarim geometri diskte (yoksa asagidaki yesil bos kumeye bakar).
    for fid in (a, b, c):
        assert main._read_state(fid)["status"] == "processing", main._read_state(fid)
        kalan = _kalanlar(fid)
        assert (any(main._SRC_INFIX in k for k in kalan) and main._CACHE_PREFIX + fid + main._CACHE_SUFFIX in kalan
                and any(k.endswith(".tmp") for k in kalan)), kalan
    # OLCUT: D gercekten sirada oldu — "processing", yalniz ham kaynak (isci hic yazmadi).
    assert main._read_state(sirada)["status"] == "processing", main._read_state(sirada)
    assert len(_kalanlar(sirada)) == 1 and main._SRC_INFIX in _kalanlar(sirada)[0], _kalanlar(sirada)

    port, srv, th = _motor2_baslat()
    sorunlar = []
    try:
        # (a) /status: olu kayit "error" + yeniden yukle; kaynak ve yarim ciktilar silinir.
        d, st = _istek(port, "GET", f"/status/{a}")
        if not (d == 200 and st.get("status") == "error" and "yeniden yukleyin" in st.get("error", "")):
            sorunlar.append(f"(a) /status olu kayitta: HTTP {d} {st}")
        if _kalanlar(a):
            sorunlar.append(f"(a) olu kaydin dosyalari kaldi: {_kalanlar(a)}")
        # (b) ayni icerik + kapsam yeniden: olu kimlige BAGLANMAZ (B'nin /status'u hic sorulmadan).
        d, y = _yukle(port, icerikler[1])
        if y.get("file_id") == b or y.get("dedup"):
            sorunlar.append(f"(b) yeniden yukleme olu kimlige baglandi: {y}")
        elif not _bekle(lambda: (main._read_state(y["file_id"]) or {}).get("status") == "ready", 30):
            sorunlar.append(f"(b) yeni yukleme hazir olmadi: {main._read_state(y['file_id'])}")
        if main._read_state(b)["status"] != "error" or _kalanlar(b):
            sorunlar.append(f"(b) olu kayit kapanmadi: {main._read_state(b)['status']} {_kalanlar(b)}")
        # (c) /geometry "isleniyor" DEMEZ: kayit kapanir, yanit "yukleyin" der.
        d, g = _istek(port, "GET", f"/geometry/{c}")
        if "isleniyor" in str(g) or main._read_state(c)["status"] != "error":
            sorunlar.append(f"(c) /geometry olu kayitta: HTTP {d} {g} durum={main._read_state(c)['status']}")
        elif not (d == 404 and "yukleyin" in g.get("detail", "")):
            sorunlar.append(f"(c) /geometry yaniti: HTTP {d} {g}")
        # (d) SIRADA olen is de kapanir: /status "error", ham kaynagi silinir.
        d, st = _istek(port, "GET", f"/status/{sirada}")
        if not (d == 200 and st.get("status") == "error" and "yeniden yukleyin" in st.get("error", "")):
            sorunlar.append(f"(d) /status sirada olen kayitta: HTTP {d} {st}")
        if _kalanlar(sirada):
            sorunlar.append(f"(d) sirada olen kaydin dosyalari kaldi: {_kalanlar(sirada)}")
    finally:
        srv.should_exit = True
        th.join(30)
    assert not sorunlar, "\n".join(sorunlar)


def _kayit(file_id: str, yas_sn: float, icerik: bytes) -> None:
    """Onbellekte "processing" kaydi + ham kaynak (arka plan isi hic calismaz)."""
    with open(main._src_path(file_id, "dxf"), "wb") as f:
        f.write(icerik)
    main._write_state(file_id, {
        "status": "processing", "hash": hashlib.sha256(icerik).hexdigest()[:16],
        "started_at": time.time() - yas_sn, "detector_version": main.DETECTOR_VERSION, "kapsam": KAPSAM,
    })


def test_R2_cok_iscide_sahipsiz_kayit_kapatilmaz(motor2, monkeypatch):
    port, icerik = motor2, _icerik("R2")
    monkeypatch.setattr(main, "_TEK_ISCI", False)
    sahipsiz = uuid.uuid4().hex[:12]
    _kayit(sahipsiz, yas_sn=5, icerik=icerik)  # kumede YOK: baska iscinin isi olabilir
    d, st = _istek(port, "GET", f"/status/{sahipsiz}")
    assert d == 200 and st["status"] == "processing", st
    d, y = _yukle(port, icerik)
    assert (y["file_id"], y.get("dedup")) == (sahipsiz, True), y
    # FIXTURE KANITI: ayni kayit tek iscide sahipsizdir (dal gercekten surulmus).
    monkeypatch.setattr(main, "_TEK_ISCI", True)
    d, st = _istek(port, "GET", f"/status/{sahipsiz}")
    assert st["status"] == "error", st


def test_R3_sirada_bekleyen_eski_is_canli_kalir(motor2):
    port, icerik = motor2, _icerik("R3")
    canli = uuid.uuid4().hex[:12]
    _kayit(canli, yas_sn=900, icerik=icerik)  # 15 dk once yuklendi, is parcacigi sirasinda
    main._ETKIN_YUKLEMELER.add(canli)
    d, st = _istek(port, "GET", f"/status/{canli}")
    assert d == 200 and st["status"] == "processing", st
    d, y = _yukle(port, icerik)
    assert (y["file_id"], y["status"], y.get("dedup")) == (canli, "processing", True), y
    d, g = _istek(port, "GET", f"/geometry/{canli}")
    assert d == 409 and "isleniyor" in g["detail"], (d, g)
    assert _kalanlar(canli), "canli isin kaynagi silindi"
    # FIXTURE KANITI: is kumeden cikinca ayni kayit kapanir (yas degil sahiplik belirler).
    main._ETKIN_YUKLEMELER.discard(canli)
    d, st = _istek(port, "GET", f"/status/{canli}")
    assert st["status"] == "error" and not _kalanlar(canli), (st, _kalanlar(canli))


@pytest.mark.parametrize("isci, son", [(HIZLI_ISCI, "ready"), (BOZUK_ISCI, "error")], ids=["basari", "hata"])
def test_R4_is_son_durumu_kumeden_cikmadan_once_yazar(onbellek, tmp_path, monkeypatch, isci, son):
    anlik: list = []

    class Gozcu(set):
        def discard(self, fid):
            anlik.append((main._read_state(fid) or {}).get("status"))
            super().discard(fid)

    kume = Gozcu()
    monkeypatch.setattr(main, "_ETKIN_YUKLEMELER", kume)
    yol = tmp_path / "isci.py"
    yol.write_text(isci, encoding="utf-8")
    monkeypatch.setattr(main, "_UPLOAD_WORKER_YOLU", str(yol))
    fid = uuid.uuid4().hex[:12]
    _kayit(fid, yas_sn=1, icerik=_icerik("R4"))
    kume.add(fid)  # /upload'in yaptigi gibi

    main._background_pipeline(fid, main._src_path(fid, "dxf"))

    assert anlik == [son], f"is kumeden cikarken diskteki durum: {anlik} (beklenen [{son!r}])"
    assert fid not in kume


def test_R5_bayat_okuma_son_durumu_ezmez(onbellek):
    fid = uuid.uuid4().hex[:12]
    for yol, metin in ((main._cache_path(fid), "0\nEOF\n"), (main._geometry_cache_path(fid), '{"lines": []}')):
        with open(yol, "w", encoding="utf-8") as f:
            f.write(metin)
    main._write_state(fid, {"status": "ready", "hash": "h", "kapsam": KAPSAM})  # is bitti, kumeden cikti
    sonuc = main._sahipsiz_islemeyi_kapat(fid, {"status": "processing"})  # cagiranin eski okumasi
    assert (sonuc or {}).get("status") == "ready", sonuc
    assert main._read_state(fid)["status"] == "ready" and len(_kalanlar(fid)) == 2, _kalanlar(fid)


# R6: main.py her deger icin AYRI modul adiyla YENI bir surecte yuklenir — sabitler ice aktarimda
# okunur; bu surecin `main`'i ve ortami etkilenmez.
BAYRAK_BETIGI = r'''
import importlib.util, json, os, sys
sys.path.insert(0, sys.argv[2])
sonuc = {}
for i, deger in enumerate(json.loads(sys.argv[1])):
    if deger is None:
        os.environ.pop("WORKERS", None)
    else:
        os.environ["WORKERS"] = deger
    spec = importlib.util.spec_from_file_location(f"motor_r6_{i}", os.path.join(sys.argv[2], "main.py"))
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    sonuc[str(deger)] = [modul._ISCI_SAYISI, modul._TEK_ISCI]
print(json.dumps(sonuc))
'''


def test_R6_tek_isci_bayragi_uvicorn_karariyla_ayni(tmp_path):
    degerler = [None, "1", "2", "0"]
    ortam = {k: v for k, v in os.environ.items() if k != "WORKERS"}
    kosu = subprocess.run([sys.executable, "-B", "-c", BAYRAK_BETIGI, json.dumps(degerler), MOTOR_DIZINI],
                          capture_output=True, text=True, timeout=120, env=ortam, cwd=str(tmp_path))
    assert kosu.returncode == 0, kosu.stderr[-3000:]
    sonuc = json.loads(kosu.stdout.strip().splitlines()[-1])
    for deger in degerler:
        sayi, tek = sonuc[str(deger)]
        cok_surec = uvicorn.Config("main:app", workers=sayi).workers > 1  # uvicorn.run'in dali
        assert tek is (not cok_surec), f"WORKERS={deger!r}: _TEK_ISCI={tek}, uvicorn cok surec={cok_surec}"
    assert [sonuc[str(d)][1] for d in degerler] == [True, True, False, True], sonuc
    # BAGLANTI: uvicorn.run ayni sabiti alir, WORKERS baska yerde okunmaz.
    with open(os.path.join(MOTOR_DIZINI, "main.py"), encoding="utf-8") as f:
        agac = ast.parse(f.read())
    run = [n for n in ast.walk(agac) if isinstance(n, ast.Call) and ast.unparse(n.func) == "uvicorn.run"]
    assert len(run) == 1 and [ast.unparse(k.value) for k in run[0].keywords if k.arg == "workers"] == [
        "_ISCI_SAYISI"], [ast.unparse(n) for n in run]
    okumalar = [n.lineno for n in ast.walk(agac) if isinstance(n, ast.Constant) and n.value == "WORKERS"]
    assert len(okumalar) == 1, f"WORKERS birden cok yerde okunuyor (satir {okumalar})"
