"""Firmalar arasi dedup (26.09.2026) — ayni icerik, farkli firma, ayri dosya.

SORUN (guvenlik incelemesi 26.09; bu dosya yeniden uretir): /upload ayni
icerigi (sha256) TUM kiracilar arasinda tekillestiriyordu. Motor kiraciyi
bilmez; ikinci firmanin yuklemesi birinci firmanin file_id'sini `dedup: true`
ile geri aliyordu. NestJS sahipligi ilk firmada tuttugu icin ikinci firma kendi
yuklemesinin /status, /geometry ve /parse cagrilarinda 403 aliyor, ayni dosyayi
baska bir firmanin yukledigini ogreniyordu (on yuz "Bu dosya daha once
yuklenmisti" bile diyordu). Gercekci senaryo: ayni ihale cizimi birden cok
yukleniciye gider.

COZUM: NestJS her yuklemeye firmaya ozgu OPAK `kapsam` (64 hex) ekler; motor
yalniz AYNI kapsamda tekillestirir. Kapsamsiz yukleme HIC tekillestirilmez
(eski/yanlis cagiran geneldeki bir kayda baglanamaz).

SOZLESME:
  K1 ⭐ farkli kapsam + ayni icerik → YENI file_id, dedup YOK (islem suruyorken)
  K2 ayni kapsam + ayni icerik → ayni file_id, dedup (firma ici tasarruf korunur)
     — K1'in fikstur kaniti: ayni ortamda tekillestirme GERCEKTEN calisiyor
  K3 hazir (ready) kayitta da K1 + K2
  K4 kapsamsiz yukleme tekillestirilmez: ne kapsamsiz ne kapsamli kayda baglanir;
     BOS kapsam da kapsamsizdir (fastapi 0.115 "" verir, yenileri None — ayni yol)
  K5 gecersiz kapsam 400 (yeni kayit acilmaz)
  K6 kapsam state'e yazilir
  K7 ⭐ GERCEK arka plan isi (`_background_pipeline`, alt surec taklit) "ready" ve
     "error" kaydinda kapsami KORUR; ayni firma ready kayda baglanir. (K3 kaydi
     elle hazirlar; bu yol state'i bastan yazdigi icin ayri olculur.)
  K8 ⭐ `kapsamli: true` YALNIZ kapsam uygulandiginda: Nest isareti gormezse (eski
     motor) her yuklemeyi ayni hatayla reddeder — dosyaya ozgu sinyal olmasin
  J1 /debug/* JETON ister (bilinmeyen kimlikte baska firmalarin kimliklerini
     listeliyordu); /health jetonsuz kalir
  V1 ⭐ bicimsiz file_id 400: /status, /geometry, /parse, /debug/raw-state
  V2 bicimli ama bilinmeyen file_id 404 (eski davranis)
  V3 onbellekte bicimsiz adli state dosyasi taramada ATLANIR (fikstur kaniti:
     ayni icerik bicimli adla tekillestirilir)
  V4 yol yardimcilari bicimsiz kimlikle yol KURMAZ (dizin disina cikis yok)

Agir is (upload_worker alt sureci) calistirilmaz: `_background_pipeline` bos
taklittir. Onbellek dizini `tmp_path`e yonlendirilir.
"""
import hashlib
import json
import os
import sys

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main  # noqa: E402

GERCEK_ARKA_PLAN = main._background_pipeline  # fikstur taklitten ONCE yakalanir (K7)
FIRMA_A = hashlib.sha256(b"firma-a").hexdigest()
FIRMA_B = hashlib.sha256(b"firma-b").hexdigest()
ICERIK = b"0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n"


@pytest.fixture
def istemci(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "_CACHE_DIR", str(tmp_path))
    monkeypatch.setattr(main, "_INTERNAL_API_TOKEN", "")
    monkeypatch.setattr(main, "_background_pipeline", lambda file_id, src_path: None)
    with TestClient(main.app) as c:
        yield c


def _yukle(c: TestClient, kapsam: str | None, icerik: bytes = ICERIK, ad: str = "ihale.dxf"):
    veri = {} if kapsam is None else {"kapsam": kapsam}
    return c.post("/upload", files={"file": (ad, icerik, "application/octet-stream")}, data=veri)


def _hazir_isaretle(file_id: str) -> None:
    """Arka plan isini tamamlanmis gibi isaretle: state ready + DXF onbellekte."""
    st = main._read_state(file_id)
    with open(main._cache_path(file_id), "w", encoding="utf-8") as f:
        f.write("0\nEOF\n")
    main._write_state(file_id, {**st, "status": "ready"})


def test_k1_farkli_kapsam_yeni_file_id(istemci):
    a = _yukle(istemci, FIRMA_A)
    b = _yukle(istemci, FIRMA_B)
    assert a.status_code == 200 and b.status_code == 200, (a.text, b.text)
    assert b.json()["file_id"] != a.json()["file_id"], "ikinci firma ilk firmanin file_id'sini aldi"
    assert "dedup" not in b.json(), f"ikinci firmaya dedup bayragi sizdi: {b.json()}"
    assert b.json()["status"] == "processing"


def test_k2_ayni_kapsam_tekillestirilir(istemci):
    a = _yukle(istemci, FIRMA_A)
    a2 = _yukle(istemci, FIRMA_A)
    assert a2.json() == {"file_id": a.json()["file_id"], "status": "processing", "dedup": True, "kapsamli": True}


def test_k3_hazir_kayitta_da_kapsam(istemci):
    a = _yukle(istemci, FIRMA_A).json()["file_id"]
    _hazir_isaretle(a)
    b = _yukle(istemci, FIRMA_B).json()
    a2 = _yukle(istemci, FIRMA_A).json()
    assert b["file_id"] != a and "dedup" not in b, b
    assert a2 == {"file_id": a, "status": "ready", "dedup": True, "kapsamli": True}, a2


def test_k4_kapsamsiz_yukleme_tekillestirilmez(istemci):
    k1 = _yukle(istemci, None).json()["file_id"]
    k2 = _yukle(istemci, None).json()
    assert k2["file_id"] != k1 and "dedup" not in k2, k2
    a = _yukle(istemci, FIRMA_A).json()
    assert a["file_id"] not in (k1, k2["file_id"]) and "dedup" not in a, a
    k3 = _yukle(istemci, None).json()
    assert k3["file_id"] != a["file_id"] and "dedup" not in k3, k3
    bos1 = _yukle(istemci, "")
    bos2 = _yukle(istemci, "").json()
    assert bos1.status_code == 200 and bos2["file_id"] != bos1.json()["file_id"] and "dedup" not in bos2, bos2


def test_k8_kapsamli_isareti_yalniz_kapsamla(istemci):
    a = _yukle(istemci, FIRMA_A).json()
    a2 = _yukle(istemci, FIRMA_A).json()
    assert a["kapsamli"] is True and a2["kapsamli"] is True and a2.get("dedup") is True, (a, a2)
    for kapsamsiz in (None, ""):
        k = _yukle(istemci, kapsamsiz).json()
        assert "kapsamli" not in k, (kapsamsiz, k)


def test_j1_debug_jeton_ister(istemci, monkeypatch):
    monkeypatch.setattr(main, "_INTERNAL_API_TOKEN", "gizli-jeton")
    for yol in ("/debug/info", "/debug/raw-state/0123456789ab", "/debug/status-deep/0123456789ab"):
        assert istemci.get(yol).status_code == 401, yol
    assert istemci.get("/debug/info", headers={"x-internal-token": "gizli-jeton"}).status_code == 200
    assert istemci.get("/health").status_code == 200


@pytest.mark.parametrize("kotu", ["abc", FIRMA_A.upper(), FIRMA_A[:-1], FIRMA_A + "0", "../" + FIRMA_A[3:]])
def test_k5_gecersiz_kapsam_400(istemci, kotu, tmp_path):
    once = sorted(os.listdir(tmp_path))
    r = _yukle(istemci, kotu)
    assert r.status_code == 400, (r.status_code, r.text)
    assert sorted(os.listdir(tmp_path)) == once, "gecersiz kapsamla yeni kayit acildi"


def test_k6_kapsam_statee_yazilir(istemci):
    fid = _yukle(istemci, FIRMA_B).json()["file_id"]
    assert main._read_state(fid)["kapsam"] == FIRMA_B


def test_k7_arka_plan_isi_kapsami_korur(istemci, monkeypatch):
    def taklit_alt_surec(file_id, src_path, timeout=600):
        with open(main._cache_path(file_id), "w", encoding="utf-8") as f:
            f.write("0\nEOF\n")
        return {"layers": [{"name": "BORU"}], "total_layers": 1, "entity_count": 5}

    monkeypatch.setattr(main, "_run_upload_subprocess", taklit_alt_surec)
    a = _yukle(istemci, FIRMA_A).json()["file_id"]
    GERCEK_ARKA_PLAN(a, main._src_path(a, "dxf"))
    st = main._read_state(a)
    assert st["status"] == "ready" and st["kapsam"] == FIRMA_A, st
    assert _yukle(istemci, FIRMA_A).json() == {"file_id": a, "status": "ready", "dedup": True, "kapsamli": True}
    b = _yukle(istemci, FIRMA_B).json()
    assert b["file_id"] != a and "dedup" not in b, b

    def dusen_alt_surec(file_id, src_path, timeout=600):
        raise RuntimeError("taklit donusum hatasi")

    monkeypatch.setattr(main, "_run_upload_subprocess", dusen_alt_surec)
    GERCEK_ARKA_PLAN(b["file_id"], main._src_path(b["file_id"], "dxf"))
    st_b = main._read_state(b["file_id"])
    assert st_b["status"] == "error" and st_b["kapsam"] == FIRMA_B, st_b


# ".." yol parametresinde denenmez: HTTP istemcisi nokta kesimlerini gondermeden
# once siler (istek motorun kokune gider). Sorgu (V1b) ve yardimci (V4) duzeyinde olculur.
BICIMSIZ = ["ABCDEF012345", "0123456789a", "0123456789abc", "0123456789a_", "0123456789ab.x"]


@pytest.mark.parametrize("kotu", BICIMSIZ)
def test_v1_bicimsiz_file_id_400(istemci, kotu):
    for yol in (f"/status/{kotu}", f"/geometry/{kotu}", f"/debug/raw-state/{kotu}"):
        r = istemci.get(yol)
        assert r.status_code == 400, (yol, r.status_code, r.text)
    r = istemci.post("/parse", params={"file_id": kotu})
    assert r.status_code == 400, ("/parse", r.status_code, r.text)


def test_v1b_parse_sorgusunda_dizin_gecisi_400(istemci):
    r = istemci.post("/parse", params={"file_id": "../../etc/passwd"})
    assert r.status_code == 400, (r.status_code, r.text)


def test_v2_bicimli_bilinmeyen_404(istemci):
    bilinmeyen = "0123456789ab"
    for yol in (f"/status/{bilinmeyen}", f"/geometry/{bilinmeyen}"):
        assert istemci.get(yol).status_code == 404, yol
    assert istemci.post("/parse", params={"file_id": bilinmeyen}).status_code == 404


def _sahte_kayit(dizin, kimlik: str, kapsam: str) -> None:
    """Islemi suren, ICERIK'le ayni hash'li kayit (dedup adayi)."""
    st = {
        "status": "processing",
        "hash": hashlib.sha256(ICERIK).hexdigest()[:16],
        "kapsam": kapsam,
        "detector_version": main.DETECTOR_VERSION,
    }
    with open(os.path.join(dizin, f"dwg_cache_{kimlik}.state.json"), "w", encoding="utf-8") as f:
        json.dump(st, f)
    with open(os.path.join(dizin, f"dwg_cache_{kimlik}.src.dxf"), "wb") as f:
        f.write(ICERIK)


def test_v3_bicimsiz_adli_state_atlanir(istemci, tmp_path):
    _sahte_kayit(tmp_path, "KOTU..x", FIRMA_A)
    r = _yukle(istemci, FIRMA_A)
    assert r.status_code == 200, r.text
    assert r.json()["file_id"] != "KOTU..x" and "dedup" not in r.json(), r.json()


def test_v3_fikstur_kaniti_bicimli_adla_eslesir(istemci, tmp_path):
    _sahte_kayit(tmp_path, "aaaaaaaaaaaa", FIRMA_A)
    r = _yukle(istemci, FIRMA_A)
    assert r.json() == {"file_id": "aaaaaaaaaaaa", "status": "processing", "dedup": True, "kapsamli": True}, r.json()


@pytest.mark.parametrize("yardimci", ["_cache_path", "_geometry_cache_path", "_state_path"])
def test_v4_yol_yardimcilari_bicimsizi_reddeder(tmp_path, monkeypatch, yardimci):
    monkeypatch.setattr(main, "_CACHE_DIR", str(tmp_path))
    fn = getattr(main, yardimci)
    for kotu in ["../../etc/passwd", "..", "", "ABCDEF012345", "0123456789ab/x"]:
        with pytest.raises(HTTPException) as e:
            fn(kotu)
        assert e.value.status_code == 400, (yardimci, kotu)
    yol = fn("0123456789ab")
    assert os.path.dirname(yol) == str(tmp_path) and "0123456789ab" in os.path.basename(yol)


def test_v4_kaynak_yolu_da_reddeder(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "_CACHE_DIR", str(tmp_path))
    with pytest.raises(HTTPException) as e:
        main._src_path("../x", "dxf")
    assert e.value.status_code == 400
    assert os.path.dirname(main._src_path("0123456789ab", "dxf")) == str(tmp_path)
