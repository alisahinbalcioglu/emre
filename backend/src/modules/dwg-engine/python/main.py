"""
DWG Engine v2.2 — Layer secim + file cache + topoloji analizi.

Akis:
  1. POST /layers   → DWG yukle, layer listesi don (hizli, uzunluk yok), file_id dondur
  2. POST /parse    → file_id ile secilen layer'larin metrajini hesapla + cap dagilimi
  3. POST /convert  → DWG→DXF base64 (viewer icin)
"""

import os
import json
import math
import time
import uuid
import base64
import logging
import tempfile
from collections import defaultdict
import ezdxf
from fastapi import FastAPI, UploadFile, File, Query, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from converter import convert_dwg_to_dxf, read_dxf
from topology import analyze_topology
from geometry import extract_geometry, extract_geometry_from_doc, GeometryResult
from models import (
    LayerInfo, LayerListResult,
    LayerMetraj, MetrajResult, PipeSegment, EdgeSegment,
)

# backend/.env dosyasini yukle (env override icin — AI cap atama kaldirildi)
_ENV_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", ".env")
if os.path.isfile(_ENV_PATH):
    with open(_ENV_PATH, encoding="utf-8") as _f:
        for _line in _f:
            _line = _line.strip()
            if not _line or _line.startswith("#") or "=" not in _line:
                continue
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))

app = FastAPI(title="MetaPrice DWG Engine", version="2.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# GZip compression — buyuk JSON response'lar (28K entity geometry ~5-10MB JSON
# → ~1-2MB gzipped). Network transfer suresi 3-5x kisalir.
# minimum_size=1024 — kucuk response'lar (health, layers metadata) compress edilmez.
app.add_middleware(GZipMiddleware, minimum_size=1024)


# ═══════════════════════════════════════════════════════
#  INTERNAL AUTH — yalnizca NestJS'ten gelen istekleri kabul et
# ═══════════════════════════════════════════════════════
# Production'da public URL'i olsa da, INTERNAL_API_TOKEN set edilirse
# her istek 'X-Internal-Token' header'inda bu token'i tasimak zorunda.
# Locale (env yoksa) auth kontrol atlanir — geliştirme engel olmasin.

_INTERNAL_API_TOKEN = os.environ.get("INTERNAL_API_TOKEN", "").strip()
_PUBLIC_PATHS = {"/health", "/docs", "/openapi.json", "/redoc"}


@app.middleware("http")
async def verify_internal_token(request: Request, call_next):
    if _INTERNAL_API_TOKEN and request.url.path not in _PUBLIC_PATHS:
        provided = request.headers.get("x-internal-token", "")
        if provided != _INTERNAL_API_TOKEN:
            return JSONResponse(
                status_code=401,
                content={"detail": "Unauthorized — internal token missing or invalid"},
            )
    return await call_next(request)


# ═══════════════════════════════════════════════════════
#  FILE CACHE — Filesystem-based DXF cache (15dk TTL)
# ═══════════════════════════════════════════════════════
# Disk-uzerinde deterministic path: /tmp/dwg_cache_<file_id>.dxf
# Bu sayede multi-worker uvicorn'da TUM worker'lar ayni file_id'yi gorebilir
# (in-memory dict per-worker olurdu, /layers worker A'da, /geometry worker B'de
# olunca cache miss yasanirdi). Filesystem dogal sekilde paylasimli.
# TTL kontrolu dosya mtime'i ile yapilir.

import shutil

_CACHE_TTL = 900  # 15 dakika
_CACHE_DIR = tempfile.gettempdir()
_CACHE_PREFIX = "dwg_cache_"
_CACHE_SUFFIX = ".dxf"
# Geometry JSON cache — parse sonucunu serialize edip /geometry tekrar
# cagrildiginda ezdxf parse maliyetinden kac. OCERP pattern: entities.json
# disk'e yazilir, GET sadece json.load(f). ~50ms cache hit vs ~2-5sn parse.
_GEOMETRY_CACHE_SUFFIX = ".geom.json"


def _cache_path(file_id: str) -> str:
    """file_id → deterministic disk path. In-memory map'e gerek yok."""
    return os.path.join(_CACHE_DIR, f"{_CACHE_PREFIX}{file_id}{_CACHE_SUFFIX}")


def _geometry_cache_path(file_id: str) -> str:
    """file_id → geometry JSON cache path."""
    return os.path.join(_CACHE_DIR, f"{_CACHE_PREFIX}{file_id}{_GEOMETRY_CACHE_SUFFIX}")


def _cleanup_cache() -> None:
    """TTL'i gecmis cache dosyalarini disk'ten sil (hem DXF hem geometry JSON)."""
    now = time.time()
    try:
        for fname in os.listdir(_CACHE_DIR):
            if not fname.startswith(_CACHE_PREFIX):
                continue
            if not (fname.endswith(_CACHE_SUFFIX) or fname.endswith(_GEOMETRY_CACHE_SUFFIX)):
                continue
            fpath = os.path.join(_CACHE_DIR, fname)
            try:
                if now - os.path.getmtime(fpath) > _CACHE_TTL:
                    os.unlink(fpath)
            except OSError:
                pass
    except OSError:
        pass


def _cache_dxf(dxf_path: str) -> str:
    """DXF temp dosyasini deterministic cache path'ine tasi, file_id dondur."""
    _cleanup_cache()
    file_id = uuid.uuid4().hex[:12]
    cache_path = _cache_path(file_id)
    # Once rename dene (ayni filesystem'de atomic), cross-fs ise shutil.move
    try:
        os.rename(dxf_path, cache_path)
    except OSError:
        shutil.move(dxf_path, cache_path)
    return file_id


def _get_cached_dxf(file_id: str) -> str:
    """Cache'ten DXF path al. Yoksa 404, expired ise 410."""
    cache_path = _cache_path(file_id)
    if not os.path.isfile(cache_path):
        raise HTTPException(404, "Dosya bulunamadi. Lutfen tekrar yukleyin.")
    try:
        if time.time() - os.path.getmtime(cache_path) > _CACHE_TTL:
            try:
                os.unlink(cache_path)
            except OSError:
                pass
            raise HTTPException(410, "Dosya suresi doldu (15dk). Lutfen tekrar yukleyin.")
    except HTTPException:
        raise
    except OSError:
        # mtime alinamadi — dosya yine de var, kullan
        pass
    return cache_path


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
    doc = read_dxf(dxf_path)
    return extract_layer_info_from_doc(doc)


def extract_layer_info_from_doc(doc) -> LayerListResult:
    """ezdxf doc'undan layer cikart — TEK PARSE icin paylasilmis doc kullanir.

    `_background_parse` bu fonksiyonu cagirir; ezdxf.readfile sadece bir kez
    yapilir (extract_geometry_from_doc ile ayni doc paylasilir).
    """
    msp = doc.modelspace()

    # layer → {'entity': boru, 'insert': block, 'total': tum entity sayisi}
    layer_data: dict[str, dict[str, int]] = {}
    pipe_types = ('LINE', 'LWPOLYLINE', 'POLYLINE')

    # PER-ENTITY TOLERANCE: ezdxf bazi bozuk entity'lerde attribute access'te
    # DXFValueError atiyor (ornek: SEQEND'in layer adi yasak karakter iceriyorsa
    # ezdxf setter validation rejects). Tek bozuk entity tum dosya parse'ini
    # cokertmesin diye her entity ayri try/except'te islenir, hata olursa
    # atlanir, kalan dosya normal islenir.
    skipped_count = 0
    skip_examples: list[str] = []
    for entity in msp:
        try:
            et = entity.dxftype()
            layer = entity.dxf.layer
        except Exception as e:
            skipped_count += 1
            if len(skip_examples) < 3:
                skip_examples.append(f"{type(e).__name__}: {str(e)[:80]}")
            continue
        if layer not in layer_data:
            layer_data[layer] = {'entity': 0, 'insert': 0, 'total': 0}
        layer_data[layer]['total'] += 1
        if et in pipe_types:
            layer_data[layer]['entity'] += 1
        elif et == 'INSERT':
            layer_data[layer]['insert'] += 1

    if skipped_count > 0:
        logging.warning(
            "extract_layer_info: %d entity skip edildi (bozuk attribute). Ornekler: %s",
            skipped_count, skip_examples,
        )

    # Herhangi bir entity iceren tum layer'lari goster
    # (boru, INSERT, TEXT, MTEXT, CIRCLE, ARC, LEADER, vb.)
    layers = [
        LayerInfo(layer=name, entity_count=d['entity'], insert_count=d['insert'])
        for name, d in sorted(layer_data.items())
        if d['total'] > 0
    ]

    warnings: list[str] = []
    if not layers:
        warnings.append("Hicbir entity tespit edilemedi")

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
    material_type_map: dict[str, str] | None = None,
    sprinkler_layers_manual: list[str] | None = None,
    layer_default_diameter_map: dict[str, str] | None = None,
) -> MetrajResult:
    """
    DXF dosyasini parse edip layer bazinda boru uzunlugu hesaplar.

    scale: birim carpani (mm=0.001, cm=0.01, m=1.0)
    selected_layers: None ise tum layer'lar, liste ise sadece belirtilenler
    hat_tipi_map: {layer_adi: hat_tipi} eslestirmesi
    """
    doc = read_dxf(dxf_path)
    msp = doc.modelspace()

    layer_data: dict[str, dict] = {}  # layer → {length, count}

    def _should_include(layer: str) -> bool:
        """Layer'in secili olup olmadigini kontrol et."""
        if selected_layers is None:
            return True
        return layer in selected_layers

    # PER-ENTITY TOLERANCE: bozuk entity'ler tum metraj hesabini cokertmesin.
    # Sayilari sayariz, log'a yaziriz; partial sonuc kullanilabilir.
    skipped = {'LINE': 0, 'LWPOLYLINE': 0, 'POLYLINE': 0}
    skip_examples: list[str] = []

    def _record_skip(et: str, exc: Exception) -> None:
        skipped[et] += 1
        if len(skip_examples) < 5:
            skip_examples.append(f"{et}: {type(exc).__name__}: {str(exc)[:80]}")

    # LINE entity'leri
    for line in msp.query('LINE'):
        try:
            layer = line.dxf.layer
            if not _should_include(layer):
                continue
            start = line.dxf.start
            end = line.dxf.end
            length = math.sqrt(
                (end.x - start.x) ** 2 + (end.y - start.y) ** 2
            ) * scale
        except Exception as e:
            _record_skip('LINE', e)
            continue

        if length < 0.01:  # 1cm'den kisa cizgileri atla
            continue

        if layer not in layer_data:
            layer_data[layer] = {"length": 0.0, "count": 0}
        layer_data[layer]["length"] += length
        layer_data[layer]["count"] += 1

    # LWPOLYLINE entity'leri
    for pline in msp.query('LWPOLYLINE'):
        try:
            layer = pline.dxf.layer
            if not _should_include(layer):
                continue
            points = list(pline.get_points(format="xy"))
        except Exception as e:
            _record_skip('LWPOLYLINE', e)
            continue

        for i in range(len(points) - 1):
            try:
                sx, sy = points[i]
                ex, ey = points[i + 1]
                seg_len = math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2) * scale
            except Exception:
                # Tek segment bozuksa atla, polyline'in geri kalanini hesaplamaya devam
                continue
            if seg_len < 0.01:
                continue
            if layer not in layer_data:
                layer_data[layer] = {"length": 0.0, "count": 0}
            layer_data[layer]["length"] += seg_len
            layer_data[layer]["count"] += 1

    # POLYLINE entity'leri (eski-style, VERTEX + SEQEND ile)
    for pline in msp.query('POLYLINE'):
        try:
            layer = pline.dxf.layer
            if not _should_include(layer):
                continue
            vertices = list(pline.vertices)
        except Exception as e:
            _record_skip('POLYLINE', e)
            continue

        total_len = 0.0
        seg_count = 0
        for i in range(len(vertices) - 1):
            try:
                sx = vertices[i].dxf.location.x
                sy = vertices[i].dxf.location.y
                ex = vertices[i + 1].dxf.location.x
                ey = vertices[i + 1].dxf.location.y
                seg_len = math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2) * scale
            except Exception:
                continue
            if seg_len >= 0.01:
                total_len += seg_len
                seg_count += 1

        if total_len > 0:
            if layer not in layer_data:
                layer_data[layer] = {"length": 0.0, "count": 0}
            layer_data[layer]["length"] += total_len
            layer_data[layer]["count"] += seg_count

    total_skipped = sum(skipped.values())
    if total_skipped > 0:
        logging.warning(
            "analyze_dxf_metraj: %d entity skip edildi %s. Ornekler: %s",
            total_skipped, skipped, skip_examples,
        )

    # ── Topoloji analizi: sprinkler/tee/end branch_points ──
    # Paylasilan doc — ezdxf.readfile tekrari engelle (perf: 100sn -> 30sn)
    topo_segments, branch_points, topo_warnings = analyze_topology(
        dxf_path, selected_layers, scale,
        material_type_map=material_type_map,
        hat_tipi_map=hat_tipi_map,
        sprinkler_layers_manual=sprinkler_layers_manual,
        doc=doc,
    )

    # Segmentleri layer bazinda grupla
    layer_segments: dict[str, list] = {}
    for seg in topo_segments:
        if seg.layer not in layer_segments:
            layer_segments[seg.layer] = []
        layer_segments[seg.layer].append(seg)

    # Sonuc olustur
    _hat_tipi_map = hat_tipi_map or {}
    layers = [
        LayerMetraj(
            layer=layer,
            length=round(data["length"], 2),
            line_count=data["count"],
            hat_tipi=_hat_tipi_map.get(layer, ""),
            segments=layer_segments.get(layer, []),
        )
        for layer, data in sorted(layer_data.items())
        if data["length"] > 0.01  # 1cm'den kisa layer'lari atla
    ]

    total = sum(l.length for l in layers)

    warnings: list[str] = topo_warnings
    if not layers:
        warnings.append("Secilen layer'larda hicbir cizgi tespit edilemedi")

    # ── $INSUNITS otomatik tespit + scale uyumsuzluk uyarisi ─────────
    # DXF header $INSUNITS: 0=unitless, 1=inch, 2=feet, 4=mm, 5=cm, 6=m
    # Kullanici scale UI'da seciyor; eger DXF header'i farkli birimi belirtiyorsa
    # uyari ver — algoritma scale parametresine bagli, yanlis secim sonucu kaydirir.
    try:
        _insunits = int(doc.header.get("$INSUNITS", 0))
        _insunit_scale_map = {4: 0.001, 5: 0.01, 6: 1.0}  # mm, cm, m
        _expected_scale = _insunit_scale_map.get(_insunits)
        if _expected_scale and abs(_expected_scale - scale) / max(_expected_scale, 1e-9) > 0.1:
            _names = {4: "mm", 5: "cm", 6: "m"}
            _expected_name = _names.get(_insunits, "?")
            _selected_name = "mm" if abs(scale - 0.001) < 1e-6 else ("cm" if abs(scale - 0.01) < 1e-6 else ("m" if abs(scale - 1.0) < 1e-6 else f"{scale}"))
            warnings.append(
                f"BIRIM UYUMSUZ: DXF $INSUNITS={_expected_name} diyor, secilen birim {_selected_name}. "
                "Yanlissa metraj 10/100x kayar."
            )
    except Exception:
        pass

    # ── Edge segment'leri olustur (AI kullanilsa da kullanilmasa da) ──
    # Frontend Canvas2D viewer her edge'i cap bazli renklendirip tiklanabilir yapar.
    edge_segments: list[EdgeSegment] = []
    junction_points: list[list[float]] = []
    if selected_layers:
        try:
            from pipe_segments import (
                _extract_segments as _edge_extract,
                _extract_junction_points,
                _compute_tolerances,
                _collect_raw_edges_all_layers,
            )
            _edges, _ = _edge_extract(
                dxf_path, selected_layers,
                sprinkler_layers=sprinkler_layers_manual,
                unit_scale=scale,
                doc=doc,
            )
            edge_segments = [
                EdgeSegment(
                    segment_id=s["id"],
                    layer=s["layer"],
                    diameter="",
                    length=round(s["length"] * scale, 3),
                    coords=[s["x1"], s["y1"], s["x2"], s["y2"]],
                    polyline=s.get("polyline", []) or [],
                )
                for s in _edges
            ]
            # T-junction marker'lari (frontend Canvas2D'de gosterilir)
            _all_edges = _collect_raw_edges_all_layers(doc.modelspace())
            _node_tol, _ = _compute_tolerances(_all_edges, unit_scale=scale)
            junction_points = [list(p) for p in _extract_junction_points(_edges, _node_tol)]
        except Exception as _e:
            warnings.append(f"Edge segment cikarma: {str(_e)[:100]}")

    # ── Layer-level default cap uygulamasi ──
    # edge_segments'deki bos/Belirtilmemis olan segment'leri layer default'u ile doldur.
    if layer_default_diameter_map:
        for es in edge_segments:
            if (not es.diameter or es.diameter == "Belirtilmemis") and layer_default_diameter_map.get(es.layer):
                es.diameter = layer_default_diameter_map[es.layer]

    return MetrajResult(
        layers=layers,
        total_length=round(total, 2),
        total_layers=len(layers),
        warnings=warnings,
        branch_points=branch_points,
        edge_segments=edge_segments,
        junction_points=junction_points,
        sprinkler_detection=None,
    )


# ═══════════════════════════════════════════════════════
#  API ENDPOINT'LER
# ═══════════════════════════════════════════════════════

@app.get("/health")
def health():
    # Filesystem cache: disk'teki dwg_cache_*.dxf dosyalarini say.
    try:
        cached = sum(
            1 for f in os.listdir(_CACHE_DIR)
            if f.startswith(_CACHE_PREFIX) and f.endswith(_CACHE_SUFFIX)
        )
    except OSError:
        cached = 0
    # Render kendi RENDER_GIT_COMMIT env'i veriyor — deploy versiyonu dogrulamak icin
    build_sha = os.environ.get("RENDER_GIT_COMMIT", "local")[:8]
    return {
        "status": "ok",
        "service": "dwg-engine",
        "version": "2.2",
        "cached_files": cached,
        "build_sha": build_sha,
    }


@app.get("/geometry/{file_id}", response_model=GeometryResult)
def get_geometry(
    file_id: str,
    layers: str = Query("", description="Virgulle ayrilmis layer listesi; bos ise tum layerlar"),
):
    """
    Cache'teki DXF'ten LINE/POLYLINE koordinatlarini dondur.
    Frontend Canvas2D viewer (dwg-viewer klasoru) icin kullanilir.

    A6 — Disk JSON cache:
      Cache hit  (geom.json varsa, layers filtresi yoksa) → ~50ms json.load
      Cache miss (yok veya layers filtresi var) → ezdxf parse + JSON yaz
    OCERP pattern (service.py:553-567).
    """
    dxf_path = _get_cached_dxf(file_id)
    layer_set: set[str] | None = None
    if layers.strip():
        layer_set = {ln.strip() for ln in layers.split(",") if ln.strip()}

    # Cache hit fast-path: SADECE layer filtresi yokken kullan (cache full geometry tutar)
    geom_cache = _geometry_cache_path(file_id)
    if layer_set is None and os.path.isfile(geom_cache):
        try:
            with open(geom_cache, "r", encoding="utf-8") as f:
                cached = json.load(f)
            return GeometryResult(**cached)
        except Exception:
            # Bozuk cache — sessizce parse'a dus, sonra yeniden yaz
            try:
                os.unlink(geom_cache)
            except OSError:
                pass

    try:
        result = extract_geometry(dxf_path, layer_set)
    except Exception as e:
        raise HTTPException(500, f"Geometri cikarilamadi: {str(e)}")

    # Layer filtresi YOKSA disk'e yaz — sonraki cagrilara hizli donus
    if layer_set is None:
        try:
            with open(geom_cache, "w", encoding="utf-8") as f:
                json.dump(result.model_dump() if hasattr(result, "model_dump") else result.dict(), f)
        except Exception:
            # Cache yazimi basarisiz — sorun degil, ana akis devam
            pass

    return result


# ═══════════════════════════════════════════════════════
#  F5C — ASYNC UPLOAD PATTERN (OCERP-style)
# ═══════════════════════════════════════════════════════
# POST /upload → 2sn'de file_id doner, parse arka planda asyncio.to_thread
# ile calisir. GET /status/{file_id} ile durumu sorulur. Hazir olunca
# /geometry/{file_id} cache hit ile 50ms doner.

import asyncio

# Memory-resident state: file_id → {"status", "started_at", "layers"?, "extents"?, "error"?}
# WORKERS=1 oldugu icin per-worker dict yeterli. Restart durumunda kaybolur
# (kullanici dosyayi yeniden yukler — kabul edilebilir trade-off).
_UPLOAD_STATES: dict[str, dict] = {}


def _detect_unit_from_dxf(doc) -> tuple[float, str]:
    """ezdxf doc'tan birim cikart. $INSUNITS header'i (1=inch, 4=mm, 6=m, ...)."""
    try:
        insunits = int(doc.header.get("$INSUNITS", 0) or 0)
        _unit_map: dict[int, tuple[float, str]] = {
            1: (0.0254, "inch"), 2: (0.3048, "feet"),
            4: (0.001, "mm"), 5: (0.01, "cm"), 6: (1.0, "m"),
        }
        return _unit_map.get(insunits, (0.001, "mm"))
    except Exception:
        return 0.001, "mm"


def _background_parse(file_id: str, dxf_path: str) -> None:
    """Background parse — layers + entities + geometry cache'i TEK ezdxf parse ile.
    Sync function; caller asyncio.to_thread ile cagiriyor.

    KRITIK FIX (14.05.2026): Daha onceden bu fonksiyonda 3 KEZ ezdxf.readfile
    cagriliyordu (birim icin + extract_layer_info icin + extract_geometry icin)
    — toplam 90sn+ aliyordu! Simdi TEK readfile, sonuc 3 fonksiyona
    paylasilmis doc olarak gecirilir (3x hizlanma).
    """
    try:
        # TEK ezdxf parse — 30sn yerine 90sn'lik 3x parse'tan kurtulduk
        doc = read_dxf(dxf_path)
        scale, label = _detect_unit_from_dxf(doc)

        # 1. Layers (paylasilan doc'tan)
        layer_result = extract_layer_info_from_doc(doc)
        # 2. Geometry (paylasilan doc'tan) → entities.json'a yaz
        geom_result = extract_geometry_from_doc(doc, None)
        geom_cache = _geometry_cache_path(file_id)
        # Pydantic v2 safe: model_dump mode='json' nested model'leri serialize eder
        try:
            data = geom_result.model_dump(mode='json')
        except (AttributeError, TypeError):
            # Pydantic v1 fallback
            data = geom_result.dict()
        with open(geom_cache, "w", encoding="utf-8") as gf:
            json.dump(data, gf)
        # 3. State: ready
        _UPLOAD_STATES[file_id] = {
            "status": "ready",
            "started_at": _UPLOAD_STATES.get(file_id, {}).get("started_at", time.time()),
            "completed_at": time.time(),
            "layers": [l.model_dump() if hasattr(l, "model_dump") else l.dict() for l in (layer_result.layers or [])],
            "total_layers": layer_result.total_layers,
            "suggested_scale": scale,
            "suggested_unit_label": label,
            "entity_count": getattr(geom_result, "entity_count", None),
        }
    except BaseException as e:
        # BULLETPROOF error handler — hicbir koshulda exception fırlatma,
        # state mutlaka "error" olarak yazilsin. BaseException yakalanir
        # (Exception + KeyboardInterrupt + SystemExit hepsi) cunku thread
        # icinde unhandled exception olusursa frontend hicbir zaman
        # net hata mesaji goremiyor.
        err_type = "UnknownError"
        safe_msg = "Bilinmeyen hata"
        try:
            err_type = type(e).__name__
        except BaseException:
            pass
        try:
            raw_msg = str(e)[:500]
            safe_msg = raw_msg.encode('utf-8', errors='replace').decode('utf-8', errors='replace')
        except BaseException:
            try:
                safe_msg = repr(e)[:500]
            except BaseException:
                safe_msg = f"<exception while stringifying {err_type}>"
        try:
            logging.exception("Background parse failed for file_id=%s", file_id)
        except BaseException:
            pass
        try:
            existing_start = _UPLOAD_STATES.get(file_id, {}).get("started_at", time.time())
        except BaseException:
            existing_start = time.time()
        try:
            _UPLOAD_STATES[file_id] = {
                "status": "error",
                "started_at": existing_start,
                "completed_at": time.time(),
                "error_type": err_type,
                "error": safe_msg,
            }
        except BaseException:
            # En son care: en azindan flag ata
            try:
                _UPLOAD_STATES[file_id] = {
                    "status": "error",
                    "error_type": "CriticalStateWriteFail",
                    "error": "State guncellenemedi",
                }
            except BaseException:
                pass


@app.post("/upload")
async def upload_async(file: UploadFile = File(...)):
    """Async upload — file save + cache + background parse task. **2sn'de doner.**

    OCERP pattern: kullanici parse'i beklemez, file_id alir, /status ile takip eder.

    F5C-bugfix (14.05.2026): Daha onceden ezdxf.readfile burada cagriliyordu
    sadece INSUNITS header'i icin — ama ezdxf TUM dosyayi parse ediyor, 30-60sn
    suruyordu. ARTIK: endpoint anlik doner, INSUNITS detection background
    task'a tasindi (/status'tan gelir).

    Response (2sn): {file_id, status: "processing"}
    """
    if not file.filename:
        raise HTTPException(400, "Dosya adi eksik")

    content = await file.read()

    # ── DWG VERSION LOG (sadece teshis amacli, reddetmiyoruz) ───────
    # LibreDWG R2013'e (AC1027) kadar tam, R2018+ (AC1032) icin kismi destek.
    # Onceden AC1032+ erken reddediyordu (b2df5f8) — kullanici "her version
    # acilmasi gerek" dedi, hakli. Reddetme kaldirildi.
    # Version log'lanir; LibreDWG dener; basarisiz olursa kullanici net hata
    # mesaji aliyor (bulletproof handler sayesinde, d6c1465).
    ext = file.filename.lower().rsplit('.', 1)[-1] if '.' in file.filename else ''
    if ext == 'dwg' and len(content) >= 6:
        try:
            ver = content[:6].decode('ascii', errors='replace')
            logging.info("DWG version: %s (file=%s, size=%d)", ver, file.filename, len(content))
        except Exception:
            pass

    try:
        dxf_path = _prepare_dxf(content, file.filename)
        file_id = _cache_dxf(dxf_path)
        cache_path = _cache_path(file_id)

        # State: processing (suggested_scale/label background task'tan gelecek)
        _UPLOAD_STATES[file_id] = {
            "status": "processing",
            "started_at": time.time(),
            # Default mm — frontend "ready" gelene kadar bu kullanilir; sonra
            # background task gercek INSUNITS degerini state'e yazar.
            "suggested_scale": 0.001,
            "suggested_unit_label": "mm",
        }

        # Background task — main loop bloklanmaz, ezdxf parse arka planda
        asyncio.create_task(asyncio.to_thread(_background_parse, file_id, cache_path))

        return {
            "file_id": file_id,
            "status": "processing",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Upload hatasi: {str(e)}")


@app.get("/status/{file_id}")
async def get_upload_status(file_id: str):
    """Background parse durumunu doner.

    Response:
      - status="processing": henuz devam ediyor
      - status="ready":      layers + entity_count + suggested_scale doluler
      - status="error":      error string'i doludur
      - 404:                 file_id bilinmiyor (cache TTL gecmis veya hic upload edilmemis)

    BULLETPROOF: Bu endpoint hicbir kosulda 500 dondurmemeli — kullanici
    surekli "Internal Server Error" goruyor cunku ic hata mesaji yutulmuyor.
    En son care olarak DAMA bir status response donulur, gercek hata
    "error" field'inda.
    """
    try:
        state = _UPLOAD_STATES.get(file_id)
        if state is None:
            raise HTTPException(404, "file_id bilinmiyor (cache TTL gecmis olabilir)")

        # DEFANSIF: state icinde JSON-encode edilemez bir field varsa, sanitize et
        try:
            json.dumps(state, ensure_ascii=False, allow_nan=False)
            return state
        except BaseException as enc_err:
            try:
                logging.exception("State JSON encode fail for file_id=%s", file_id)
            except BaseException:
                pass
            # State'i field-field temizle, hangi field problemli onu da rapor et
            problematic_fields: list[str] = []
            clean_state: dict = {}
            for k in ("status", "started_at", "completed_at", "error_type", "total_layers",
                      "suggested_scale", "suggested_unit_label", "entity_count"):
                v = state.get(k) if isinstance(state, dict) else None
                try:
                    json.dumps(v)
                    clean_state[k] = v
                except BaseException:
                    problematic_fields.append(k)
            # Error field sanitize ile
            try:
                err_raw = str(state.get("error", "")) if isinstance(state, dict) else ""
                clean_state["error"] = err_raw.encode('utf-8', errors='replace').decode('utf-8', errors='replace')[:500]
            except BaseException:
                clean_state["error"] = "<error field unreadable>"
            if not clean_state.get("status"):
                clean_state["status"] = "error"
            if problematic_fields:
                clean_state["error_type"] = clean_state.get("error_type") or "StateSerializationError"
                clean_state["serialize_fail_fields"] = problematic_fields
                if not clean_state.get("error"):
                    clean_state["error"] = f"State JSON encode fail: {type(enc_err).__name__}"
            return clean_state
    except HTTPException:
        raise
    except BaseException as outer_err:
        # SON CARE — endpoint handler'da beklenmedik hata
        try:
            logging.exception("get_upload_status critical fail for %s", file_id)
        except BaseException:
            pass
        return {
            "status": "error",
            "error_type": "EndpointHandlerError",
            "error": f"{type(outer_err).__name__}: {str(outer_err)[:200] if outer_err else 'unknown'}",
        }


@app.post("/layers", response_model=LayerListResult)
async def list_layers(file: UploadFile = File(...)):
    """
    DWG/DXF dosyasindaki layer listesini cikar.
    Uzunluk hesaplamaz — sadece layer adi ve entity sayisi doner.
    Dosya cache'e kaydedilir, file_id ile /parse'a gonderilebilir.

    F5A safe (14.05.2026): Bu endpoint TEK ezdxf parse ile hem layers cikartir
    hem de entities.json pre-cache yazar. /geometry GET sonraki cagrida cache
    hit yapar (100ms). Boylece kullanici sadece /layers'i beklemis olur.
    """
    if not file.filename:
        raise HTTPException(400, "Dosya adi eksik")

    content = await file.read()

    try:
        dxf_path = _prepare_dxf(content, file.filename)

        # TEK ezdxf parse — hem layers hem geometry icin paylasilmis doc
        doc = read_dxf(dxf_path)
        result = extract_layer_info_from_doc(doc)

        # DXF dosyasini cache'e kaydet (15dk)
        file_id = _cache_dxf(dxf_path)
        result.file_id = file_id

        # F5A safe pre-cache: geometry'yi simdi disk'e yaz, /geometry GET cache hit yapsin.
        # Pydantic v2 mode='json' nested model'leri JSON-safe primitives'e cevirir.
        # Pre-cache fail olursa try/except yutar — /geometry GET fallback parse yapar.
        try:
            geom_result = extract_geometry_from_doc(doc, None)
            geom_cache = _geometry_cache_path(file_id)
            try:
                data = geom_result.model_dump(mode='json')
            except (AttributeError, TypeError):
                data = geom_result.dict()
            with open(geom_cache, "w", encoding="utf-8") as gf:
                json.dump(data, gf)
        except Exception:
            # Log et — silent fail degil, gozlem icin
            logging.exception("Pre-cache geometry failed for file_id=%s", file_id)

        # DWG birimini otomatik tespit et ($INSUNITS header'indan)
        try:
            doc = read_dxf(dxf_path)
            insunits = int(doc.header.get("$INSUNITS", 0) or 0)
            # DXF standardi: 1=inch, 2=feet, 4=mm, 5=cm, 6=m (digerleri nadir)
            _unit_map: dict[int, tuple[float, str]] = {
                1: (0.0254, "inch"),
                2: (0.3048, "feet"),
                4: (0.001, "mm"),
                5: (0.01, "cm"),
                6: (1.0, "m"),
            }
            scale, label = _unit_map.get(insunits, (0.001, "mm"))
            result.suggested_scale = scale
            result.suggested_unit_label = label
        except Exception:
            # Header yoksa veya okunamiyorsa default mm
            result.suggested_scale = 0.001
            result.suggested_unit_label = "mm"

        # Not: dxf_base64 alani kaldirildi — frontend kullanmiyordu, sadece I/O +
        # network overhead'i (5MB DXF → 6.7MB base64 string) yaratıyordu.

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
    layer_material_type: str = Query("{}", description="JSON object: {layer: material_type} eslestirmesi"),
    sprinkler_layers: str = Query("", description="JSON array: kullanici tarafindan sprinkler olarak isaretlenen layer'lar"),
    layer_default_diameter: str = Query("{}", description="JSON object: {layer: default_diameter} — layer-level cap fallback"),
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

    # layer_material_type JSON object parse
    mat_type_map: dict[str, str] | None = None
    if layer_material_type and layer_material_type != "{}":
        try:
            parsed_mat = json.loads(layer_material_type)
            if isinstance(parsed_mat, dict) and len(parsed_mat) > 0:
                mat_type_map = {str(k): str(v) for k, v in parsed_mat.items()}
        except json.JSONDecodeError:
            raise HTTPException(400, "layer_material_type gecersiz JSON formati")

    # sprinkler_layers: kullanicinin manuel isaretledigi sprinkler layer'lar
    sprinkler_layers_manual: list[str] | None = None
    if sprinkler_layers:
        try:
            parsed_sp = json.loads(sprinkler_layers)
            if isinstance(parsed_sp, list) and len(parsed_sp) > 0:
                sprinkler_layers_manual = [str(s) for s in parsed_sp]
        except json.JSONDecodeError:
            raise HTTPException(400, "sprinkler_layers gecersiz JSON formati")

    # layer_default_diameter: AI atayamadigi segment'ler icin layer-level fallback
    default_dia_map: dict[str, str] | None = None
    if layer_default_diameter and layer_default_diameter != "{}":
        try:
            parsed_dia = json.loads(layer_default_diameter)
            if isinstance(parsed_dia, dict) and len(parsed_dia) > 0:
                default_dia_map = {str(k): str(v) for k, v in parsed_dia.items() if str(v).strip()}
        except json.JSONDecodeError:
            raise HTTPException(400, "layer_default_diameter gecersiz JSON formati")

    # ── Analiz et ──
    try:
        result = analyze_dxf_metraj(
            dxf_path,
            scale=scale,
            selected_layers=sel_layers,
            hat_tipi_map=hat_tipi_map,
            material_type_map=mat_type_map,
            sprinkler_layers_manual=sprinkler_layers_manual,
            layer_default_diameter_map=default_dia_map,
        )
        return result

    except HTTPException:
        raise
    except Exception as e:
        import traceback as _tb
        _trace = _tb.format_exc()
        # Render logs'a TAM traceback yaz — debug icin kritik
        logging.error("DWG analiz hatasi: %s\n%s", repr(e), _trace)
        # Response'a repr(e) ver (str(e) bazi exception'larda bos olabiliyor)
        # + class adi (debugging icin frontend'e bilgi)
        raise HTTPException(500, f"DWG analiz hatasi: {type(e).__name__}: {str(e) or repr(e)}")
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
    # Render 'PORT' kullanir, locale DWG_ENGINE_PORT fallback; default 8011
    port = int(os.environ.get("PORT") or os.environ.get("DWG_ENGINE_PORT") or 8011)
    # Default WORKERS=1 — Render free tier 512MB RAM'de 2 worker × (ezdxf doc
    # + libredwg + Python runtime) OOM yiyiyor (worker spawn sirasinda kernel
    # SIGKILL → "Child process died" loop → port scan timeout → deploy fail).
    # Filesystem-based cache (yukaridaki _cache_path) sayesinde tek worker bile
    # restart sonrasi cache'i koruyor — multi-worker artik strictly gerekli degil.
    # Daha fazla CPU/RAM (Starter plan) ile WORKERS=2 ayarlanabilir.
    workers = int(os.environ.get("WORKERS") or 1)
    uvicorn.run("main:app", host="0.0.0.0", port=port, workers=workers)
