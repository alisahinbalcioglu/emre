"""
DWG Engine v2.1 — Layer secim + file cache destegi.

Akis:
  1. POST /layers   → DWG yukle, layer listesi don (hizli, uzunluk yok), file_id dondur
  2. POST /parse    → file_id ile sadece secilen layer'larin uzunlugunu hesapla
  3. POST /convert  → DWG→DXF base64 (viewer icin)
"""

import os
import json
import math
import time
import uuid
import tempfile
import ezdxf
from fastapi import FastAPI, UploadFile, File, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from converter import convert_dwg_to_dxf
from models import (
    LayerInfo, LayerListResult,
    LayerMetraj, MetrajResult,
)

app = FastAPI(title="MetaPrice DWG Engine", version="2.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ═══════════════════════════════════════════════════════
#  FILE CACHE — DXF dosyalarini bellekte tutma (15dk TTL)
# ═══════════════════════════════════════════════════════

_file_cache: dict[str, dict] = {}  # {file_id: {"path": str, "created": float}}
_CACHE_TTL = 900  # 15 dakika


def _cleanup_cache() -> None:
    """Suresi dolmus dosyalari temizle."""
    now = time.time()
    expired = [
        fid for fid, info in _file_cache.items()
        if now - info["created"] > _CACHE_TTL
    ]
    for fid in expired:
        try:
            os.unlink(_file_cache[fid]["path"])
        except OSError:
            pass
        del _file_cache[fid]


def _cache_dxf(dxf_path: str) -> str:
    """DXF dosyasini cache'e ekle, file_id dondur."""
    _cleanup_cache()
    file_id = uuid.uuid4().hex[:12]
    _file_cache[file_id] = {"path": dxf_path, "created": time.time()}
    return file_id


def _get_cached_dxf(file_id: str) -> str:
    """Cache'ten DXF path al. Yoksa veya suresi dolduysa hata."""
    if file_id not in _file_cache:
        raise HTTPException(404, "Dosya bulunamadi. Lutfen tekrar yukleyin.")
    info = _file_cache[file_id]
    if time.time() - info["created"] > _CACHE_TTL:
        # Suresi dolmus, temizle
        try:
            os.unlink(info["path"])
        except OSError:
            pass
        del _file_cache[file_id]
        raise HTTPException(410, "Dosya suresi doldu (15dk). Lutfen tekrar yukleyin.")
    return info["path"]


# ═══════════════════════════════════════════════════════
#  YARDIMCI FONKSIYONLAR
# ═══════════════════════════════════════════════════════

def _prepare_dxf(content: bytes, filename: str) -> str:
    """
    Dosya icerigini temp'e yaz, DWG ise DXF'e cevir.
    Donus: DXF dosya yolu (temp dizininde).
    Not: Donen dosya SILINMEMELI — cache sistemi yonetir.
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ("dwg", "dxf"):
        raise HTTPException(400, f"Desteklenmeyen format: .{ext}. Sadece .dwg ve .dxf kabul edilir.")

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}")
    tmp.write(content)
    tmp.close()

    try:
        if ext == "dwg":
            dxf_path = convert_dwg_to_dxf(tmp.name)
            # Orijinal DWG temp dosyasini sil, DXF kalacak
            try:
                os.unlink(tmp.name)
            except OSError:
                pass
            return dxf_path
        else:
            # Zaten DXF, temp dosyanin kendisi
            return tmp.name
    except Exception:
        # Hata durumunda temp dosyayi temizle
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
        raise


def extract_layer_info(dxf_path: str) -> LayerListResult:
    """
    DXF dosyasindan layer bilgilerini cikar.
    SADECE layer adi ve entity sayisi — uzunluk hesaplamaz (hizli).
    """
    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()

    layer_data: dict[str, int] = {}  # layer → entity_count

    target_types = ('LINE', 'LWPOLYLINE', 'POLYLINE')
    for entity in msp:
        if entity.dxftype() not in target_types:
            continue
        layer = entity.dxf.layer
        layer_data[layer] = layer_data.get(layer, 0) + 1

    layers = [
        LayerInfo(layer=name, entity_count=count)
        for name, count in sorted(layer_data.items())
        if count > 0
    ]

    warnings: list[str] = []
    if not layers:
        warnings.append("Hicbir cizgi entity'si (LINE/POLYLINE) tespit edilemedi")

    return LayerListResult(
        layers=layers,
        total_layers=len(layers),
        warnings=warnings,
    )


def analyze_dxf_metraj(
    dxf_path: str,
    scale: float = 0.001,
    selected_layers: list[str] | None = None,
    hat_tipi_map: dict[str, str] | None = None,
) -> MetrajResult:
    """
    DXF dosyasini parse edip layer bazinda boru uzunlugu hesaplar.

    scale: birim carpani (mm=0.001, cm=0.01, m=1.0)
    selected_layers: None ise tum layer'lar, liste ise sadece belirtilenler
    hat_tipi_map: {layer_adi: hat_tipi} eslestirmesi
    """
    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()

    layer_data: dict[str, dict] = {}  # layer → {length, count}

    def _should_include(layer: str) -> bool:
        """Layer'in secili olup olmadigini kontrol et."""
        if selected_layers is None:
            return True
        return layer in selected_layers

    # LINE entity'leri
    for line in msp.query('LINE'):
        layer = line.dxf.layer
        if not _should_include(layer):
            continue

        start = line.dxf.start
        end = line.dxf.end
        length = math.sqrt(
            (end.x - start.x) ** 2 + (end.y - start.y) ** 2
        ) * scale

        if length < 0.01:  # 1cm'den kisa cizgileri atla
            continue

        if layer not in layer_data:
            layer_data[layer] = {"length": 0.0, "count": 0}
        layer_data[layer]["length"] += length
        layer_data[layer]["count"] += 1

    # LWPOLYLINE entity'leri
    for pline in msp.query('LWPOLYLINE'):
        layer = pline.dxf.layer
        if not _should_include(layer):
            continue

        points = list(pline.get_points(format="xy"))
        for i in range(len(points) - 1):
            sx, sy = points[i]
            ex, ey = points[i + 1]
            seg_len = math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2) * scale
            if seg_len < 0.01:
                continue
            if layer not in layer_data:
                layer_data[layer] = {"length": 0.0, "count": 0}
            layer_data[layer]["length"] += seg_len
            layer_data[layer]["count"] += 1

    # POLYLINE entity'leri
    for pline in msp.query('POLYLINE'):
        layer = pline.dxf.layer
        if not _should_include(layer):
            continue

        vertices = list(pline.vertices)
        total_len = 0.0
        seg_count = 0
        for i in range(len(vertices) - 1):
            sx = vertices[i].dxf.location.x
            sy = vertices[i].dxf.location.y
            ex = vertices[i + 1].dxf.location.x
            ey = vertices[i + 1].dxf.location.y
            seg_len = math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2) * scale
            if seg_len >= 0.01:
                total_len += seg_len
                seg_count += 1

        if total_len > 0:
            if layer not in layer_data:
                layer_data[layer] = {"length": 0.0, "count": 0}
            layer_data[layer]["length"] += total_len
            layer_data[layer]["count"] += seg_count

    # Sonuc olustur
    _hat_tipi_map = hat_tipi_map or {}
    layers = [
        LayerMetraj(
            layer=layer,
            length=round(data["length"], 2),
            line_count=data["count"],
            hat_tipi=_hat_tipi_map.get(layer, ""),
        )
        for layer, data in sorted(layer_data.items())
        if data["length"] > 0.01  # 1cm'den kisa layer'lari atla
    ]

    total = sum(l.length for l in layers)

    warnings: list[str] = []
    if not layers:
        warnings.append("Secilen layer'larda hicbir cizgi tespit edilemedi")

    return MetrajResult(
        layers=layers,
        total_length=round(total, 2),
        total_layers=len(layers),
        warnings=warnings,
    )


# ═══════════════════════════════════════════════════════
#  API ENDPOINT'LER
# ═══════════════════════════════════════════════════════

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "dwg-engine",
        "version": "2.1",
        "cached_files": len(_file_cache),
    }


@app.post("/layers", response_model=LayerListResult)
async def list_layers(file: UploadFile = File(...)):
    """
    DWG/DXF dosyasindaki layer listesini cikar.
    Uzunluk hesaplamaz — sadece layer adi ve entity sayisi doner.
    Dosya cache'e kaydedilir, file_id ile /parse'a gonderilebilir.
    """
    if not file.filename:
        raise HTTPException(400, "Dosya adi eksik")

    content = await file.read()

    try:
        dxf_path = _prepare_dxf(content, file.filename)
        result = extract_layer_info(dxf_path)

        # DXF dosyasini cache'e kaydet (15dk)
        file_id = _cache_dxf(dxf_path)
        result.file_id = file_id

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Layer listesi cikarilirken hata: {str(e)}")


@app.post("/parse", response_model=MetrajResult)
async def parse_dwg(
    file: UploadFile | None = File(None),
    file_id: str = Query("", description="Cache'teki dosyanin ID'si (/layers'tan donen)"),
    discipline: str = Query("mechanical"),
    scale: float = Query(0.001),
    selected_layers: str = Query("", description="JSON array: secilen layer isimleri"),
    layer_hat_tipi: str = Query("{}", description="JSON object: {layer: hat_tipi} eslestirmesi"),
):
    """
    DWG/DXF dosyasini parse edip layer bazinda metraj cikarir.

    Kullanim:
      - file_id varsa: cache'teki dosyayi kullanir (dosya yuklemeye gerek yok)
      - file_id yoksa: dosya yuklemesi gerekir (eski davranis, geriye uyumlu)
    """
    # ── DXF dosyasini bul ──
    dxf_path: str | None = None
    tmp_to_cleanup: str | None = None

    if file_id:
        # Cache'ten al
        dxf_path = _get_cached_dxf(file_id)
    elif file and file.filename:
        # Dosya yuklendi (geriye uyumlu mod)
        content = await file.read()
        dxf_path = _prepare_dxf(content, file.filename)
        tmp_to_cleanup = dxf_path  # Bu durumda biz yonetiriz, cache'e girmez
    else:
        raise HTTPException(400, "file_id veya file parametrelerinden biri gerekli")

    # ── Parametreleri parse et ──
    sel_layers: list[str] | None = None
    if selected_layers:
        try:
            parsed = json.loads(selected_layers)
            if isinstance(parsed, list) and len(parsed) > 0:
                sel_layers = [str(s) for s in parsed]
        except json.JSONDecodeError:
            raise HTTPException(400, "selected_layers gecersiz JSON formati. Ornek: [\"LAYER1\", \"LAYER2\"]")

    hat_tipi_map: dict[str, str] | None = None
    if layer_hat_tipi and layer_hat_tipi != "{}":
        try:
            parsed_map = json.loads(layer_hat_tipi)
            if isinstance(parsed_map, dict) and len(parsed_map) > 0:
                hat_tipi_map = {str(k): str(v) for k, v in parsed_map.items()}
        except json.JSONDecodeError:
            raise HTTPException(400, "layer_hat_tipi gecersiz JSON formati. Ornek: {\"LAYER1\": \"yangin\"}")

    # ── Analiz et ──
    try:
        result = analyze_dxf_metraj(
            dxf_path,
            scale=scale,
            selected_layers=sel_layers,
            hat_tipi_map=hat_tipi_map,
        )
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"DWG analiz hatasi: {str(e)}")
    finally:
        # Sadece cache'e girmeyen dosyalari temizle
        if tmp_to_cleanup:
            try:
                os.unlink(tmp_to_cleanup)
            except OSError:
                pass


@app.post("/convert")
async def convert_to_dxf(file: UploadFile = File(...)):
    """DWG dosyasini DXF'e cevirir (viewer icin)."""
    if not file.filename:
        raise HTTPException(400, "Dosya adi eksik")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ("dwg", "dxf"):
        raise HTTPException(400, f"Desteklenmeyen format: .{ext}")

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}")
    try:
        content = await file.read()
        tmp.write(content)
        tmp.close()

        if ext == "dxf":
            with open(tmp.name, "rb") as f:
                dxf_bytes = f.read()
        else:
            dxf_path = convert_dwg_to_dxf(tmp.name)
            with open(dxf_path, "rb") as f:
                dxf_bytes = f.read()

        import base64
        return {
            "dxf_base64": base64.b64encode(dxf_bytes).decode("ascii"),
            "size": len(dxf_bytes),
        }
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("DWG_ENGINE_PORT", 8011))
    uvicorn.run(app, host="0.0.0.0", port=port)
