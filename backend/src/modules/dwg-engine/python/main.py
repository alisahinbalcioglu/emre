"""
DWG Engine v2.2 — Layer secim + file cache + topoloji analizi.

Akis:
  1. POST /layers   → DWG yukle, layer listesi don (hizli, uzunluk yok), file_id dondur
  2. POST /parse    → file_id ile secilen layer'larin metrajini hesapla + cap dagilimi
  3. POST /convert  → DWG→DXF base64 (viewer icin)
"""

import os
import sys
import json
import math
import time
import uuid
import base64
import logging
import tempfile
from collections import defaultdict
import ezdxf
from fastapi import FastAPI, UploadFile, File, Query, HTTPException, Request, Response
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
_PUBLIC_PATHS = {"/health", "/docs", "/openapi.json", "/redoc", "/debug/info"}
# Path prefix-bazli public paths (debug endpoint'leri)
_PUBLIC_PATH_PREFIXES = ("/debug/",)


@app.middleware("http")
async def verify_internal_token(request: Request, call_next):
    path = request.url.path
    is_public = (
        path in _PUBLIC_PATHS
        or any(path.startswith(prefix) for prefix in _PUBLIC_PATH_PREFIXES)
    )
    if _INTERNAL_API_TOKEN and not is_public:
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
import hashlib

_CACHE_TTL = 900  # 15 dakika
_CACHE_DIR = tempfile.gettempdir()
_CACHE_PREFIX = "dwg_cache_"
_CACHE_SUFFIX = ".dxf"
# Geometry JSON cache — parse sonucunu serialize edip /geometry tekrar
# cagrildiginda ezdxf parse maliyetinden kac. OCERP pattern: entities.json
# disk'e yazilir, GET sadece json.load(f). ~50ms cache hit vs ~2-5sn parse.
_GEOMETRY_CACHE_SUFFIX = ".geom.json"
# Upload state dosyasi — eski in-memory _UPLOAD_STATES dict'in yerini aldi.
# Diskte olmasi: (1) worker restart'inda state kaybolmaz, (2) WORKERS>1
# oldugunda tum worker'lar ayni state'i gorur, (3) RAM'de sinirsiz buyume
# olmaz (TTL cleanup ayni anda state'i de siler).
_STATE_SUFFIX = ".state.json"
# Ham yuklenen dosya (dwg/dxf) — donusum background'da yapilir, kaynak burada.
_SRC_INFIX = ".src."


def _cache_path(file_id: str) -> str:
    """file_id → deterministic disk path. In-memory map'e gerek yok."""
    return os.path.join(_CACHE_DIR, f"{_CACHE_PREFIX}{file_id}{_CACHE_SUFFIX}")


def _geometry_cache_path(file_id: str) -> str:
    """file_id → geometry JSON cache path."""
    return os.path.join(_CACHE_DIR, f"{_CACHE_PREFIX}{file_id}{_GEOMETRY_CACHE_SUFFIX}")


def _state_path(file_id: str) -> str:
    """file_id → upload state JSON path."""
    return os.path.join(_CACHE_DIR, f"{_CACHE_PREFIX}{file_id}{_STATE_SUFFIX}")


def _src_path(file_id: str, ext: str) -> str:
    """file_id → ham yuklenen dosyanin (henuz donusmemis) path'i."""
    return os.path.join(_CACHE_DIR, f"{_CACHE_PREFIX}{file_id}{_SRC_INFIX}{ext}")


def _read_state(file_id: str) -> dict | None:
    """Upload state'ini diskten oku. Yoksa/bozuksa None."""
    try:
        with open(_state_path(file_id), "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError, ValueError):
        return None


def _write_state(file_id: str, state: dict) -> None:
    """Upload state'ini ATOMIK yaz (tmp + os.replace) — yarim okuma olmasin."""
    path = _state_path(file_id)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(_json_safe(state), f, ensure_ascii=False)
    os.replace(tmp, path)


def _iter_states() -> list[tuple[str, dict]]:
    """Diskteki tum upload state'lerini (file_id, state) olarak don.

    Cache dizini TTL cleanup sayesinde kucuk kalir (tipik <20 kayit),
    linear tarama dedup + debug icin yeterince ucuz.
    """
    out: list[tuple[str, dict]] = []
    try:
        for fname in os.listdir(_CACHE_DIR):
            if not (fname.startswith(_CACHE_PREFIX) and fname.endswith(_STATE_SUFFIX)):
                continue
            file_id = fname[len(_CACHE_PREFIX):-len(_STATE_SUFFIX)]
            st = _read_state(file_id)
            if st is not None:
                out.append((file_id, st))
    except OSError:
        pass
    return out


def _cleanup_cache() -> None:
    """TTL'i gecmis cache dosyalarini sil (DXF + geometry JSON + state + src).

    Prefix bazli: dwg_cache_* ile baslayan HER dosya TTL'e tabi — boylece
    state.json ve .src.* artiklari da temizlenir (RAM/disk sismesi onlenir).
    """
    now = time.time()
    try:
        for fname in os.listdir(_CACHE_DIR):
            if not fname.startswith(_CACHE_PREFIX):
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

    `upload_worker.py` (izole subprocess) bu fonksiyonu cagirir; ezdxf.readfile
    sadece bir kez yapilir (extract_geometry_from_doc ile ayni doc paylasilir).
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
    scale: float | None = None,
    selected_layers: list[str] | None = None,
    hat_tipi_map: dict[str, str] | None = None,
    material_type_map: dict[str, str] | None = None,
    sprinkler_layers_manual: list[str] | None = None,
) -> MetrajResult:
    """
    DXF dosyasini parse edip layer bazinda boru uzunlugu hesaplar.

    scale: birim carpani (mm=0.001, cm=0.01, m=1.0). None ise OTOMATIK tespit
           ($INSUNITS + bound geometrisi). Kullanici manuel override etmek
           istiyorsa explicit deger gecsin.
    selected_layers: None ise tum layer'lar, liste ise sadece belirtilenler
    hat_tipi_map: {layer_adi: hat_tipi} eslestirmesi
    """
    doc = read_dxf(dxf_path)
    msp = doc.modelspace()

    # BIRIM = KULLANICI SORUMLULUGU (TAHMIN YOK).
    # Sistem cizim birimini ASLA tahmin etmez. scale frontend'den gelir
    # (kullanici dropdown secimi). scale=None ise mm varsayilan (kullanici
    # secmedi) — auto-detect/bound/medyan mantiklari KALDIRILDI.
    if scale is None:
        scale = 0.001  # mm varsayilan
    _scale_label = (
        "mm" if abs(scale - 0.001) < 1e-6
        else "cm" if abs(scale - 0.01) < 1e-6
        else "m" if abs(scale - 1.0) < 1e-6
        else f"{scale}"
    )
    _scale_auto_reason = f"Kullanici secimi: {_scale_label} (scale={scale})"

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

    # ── BIRIM AUTO-DETECT raporu (kullanici hangi birim kullanildigini gorsun) ─
    if _scale_auto_reason:
        warnings.append(f"BIRIM TESPITI: {_scale_label} | {_scale_auto_reason}")

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
            # ── VIEW TRANSFORM UYUMU (kritik) ──────────────────────────
            # /geometry endpoint'i (Canvas2D viewer icin) LINE coords'larini
            # _compute_view_transform ile rotated dondurur (UCS/skewed view
            # ortogonal'e hizalanir). pipe_segments ham DWG coords kullanir.
            # Frontend ikisini ayni viewer'da cizdigi icin transform UYUMSUZLUGU
            # → edge_segments orijinal LINE'lardan KAYIK gorunur ("hat yapisi
            # bozuluyor" bug'i). Cozum: edge_segments coords'larina /geometry
            # ile AYNI view_transform'u uygula.
            from geometry import _compute_view_transform, _transform_point
            view_t = _compute_view_transform(doc)
            _has_view_rot = abs(view_t[1]) > 1e-6  # sin_t > 0 → rotation var

            def _vt(x: float, y: float) -> tuple[float, float]:
                if _has_view_rot:
                    return _transform_point(x, y, view_t)
                return x, y

            _edges, _ = _edge_extract(
                dxf_path, selected_layers,
                sprinkler_layers=sprinkler_layers_manual,
                unit_scale=scale,
                doc=doc,
            )
            edge_segments = []
            for s in _edges:
                sx1, sy1 = _vt(s["x1"], s["y1"])
                sx2, sy2 = _vt(s["x2"], s["y2"])
                # polyline points (opsiyonel multi-vertex) da transform
                raw_pl = s.get("polyline") or []
                pl_transformed: list = []
                for p in raw_pl:
                    if isinstance(p, (list, tuple)) and len(p) >= 2:
                        tx, ty = _vt(float(p[0]), float(p[1]))
                        pl_transformed.append([tx, ty])
                edge_segments.append(EdgeSegment(
                    segment_id=s["id"],
                    layer=s["layer"],
                    diameter="",
                    length=round(s["length"] * scale, 3),
                    coords=[sx1, sy1, sx2, sy2],
                    polyline=pl_transformed,
                ))
            # T-junction marker'lari (frontend Canvas2D'de gosterilir) — bunlar
            # da view transform'a tabi tutulmalı, edge_segments ile uyumlu olsun
            _all_edges = _collect_raw_edges_all_layers(doc.modelspace())
            _node_tol, _ = _compute_tolerances(_all_edges, unit_scale=scale)
            _raw_junctions = _extract_junction_points(_edges, _node_tol)
            junction_points = [list(_vt(p[0], p[1])) for p in _raw_junctions]
        except Exception as _e:
            warnings.append(f"Edge segment cikarma: {str(_e)[:100]}")

    # ── OTOMATIK CAP ATAMA KALDIRILDI (operasyon Faz 1-2) ─────────────
    # Eski proximity motoru (en yakin text -> cap) + layer-default fallback
    # burada calisiyordu — proximity_diameter.py ile birlikte SILINDI.
    # Sistem artik yalniz geometri + uzunluk doner; TUM segmentler capsiz
    # (diameter="") gelir. Cap atamasi %100 kullanici isidir: frontend
    # dwg-tagging modulu (Cap Kalemleri + tikla-etiketle).

    return MetrajResult(
        layers=layers,
        total_length=round(total, 2),
        total_layers=len(layers),
        warnings=warnings,
        branch_points=branch_points,
        edge_segments=edge_segments,
        junction_points=junction_points,
        detected_unit=_scale_label,
        detected_scale=scale,
        detection_reason=_scale_auto_reason,
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
    # Build/deploy version — platform-agnostic fallback chain:
    # Render: RENDER_GIT_COMMIT, Cloud Run: K_REVISION (servis-revision adi),
    # Custom: BUILD_SHA env. Hicbiri yoksa "local".
    build_sha = (
        os.environ.get("RENDER_GIT_COMMIT")
        or os.environ.get("K_REVISION")
        or os.environ.get("BUILD_SHA")
        or "local"
    )[:16]
    return {
        "status": "ok",
        "service": "dwg-engine",
        "version": "2.3",
        "cached_files": cached,
        "build_sha": build_sha,
    }


@app.get("/debug/raw-state/{file_id}")
def debug_raw_state(file_id: str):
    """File_id'nin FULL state'ini sanitize ederek dondur — auth-free debug.

    /status endpoint'i 500 atiyor bizim teshis edemiyoruz. Bu endpoint
    /status ILE AYNI YAKLASIMI uygula: Response(json.dumps(...)) ile
    FastAPI encoder pipeline'i bypass.
    """
    state = _read_state(file_id)
    if state is None:
        all_ids = [fid for fid, _ in _iter_states()][:10]
        body = json.dumps({"error": "file_id bilinmiyor", "all_keys": all_ids})
        return Response(content=body, media_type="application/json")
    safe = _json_safe(state)
    body = json.dumps(safe, allow_nan=False, ensure_ascii=False).encode('utf-8')
    return Response(content=body, media_type="application/json")


@app.get("/debug/status-deep/{file_id}")
def debug_status_deep(file_id: str):
    """/status'tan farkli olarak field-by-field JSON test yapar + detayli rapor."""
    import traceback
    state = _read_state(file_id)
    if state is None:
        return {"error": "file_id bilinmiyor"}

    debug_info_out = {"file_id": file_id}
    try:
        safe = _json_safe(state)
        debug_info_out["sanitized_ok"] = True
        debug_info_out["sanitized_keys"] = list(safe.keys()) if isinstance(safe, dict) else "<not_dict>"
        try:
            j = json.dumps(safe, allow_nan=False)
            debug_info_out["json_size_bytes"] = len(j)
            debug_info_out["sample_first_500"] = j[:500]
        except BaseException as je:
            debug_info_out["json_test_fail"] = f"{type(je).__name__}: {str(je)[:200]}"
            field_results = {}
            if isinstance(safe, dict):
                for k, v in safe.items():
                    try:
                        json.dumps(v, allow_nan=False)
                        field_results[k] = "OK"
                    except BaseException as fe:
                        field_results[k] = f"FAIL: {type(fe).__name__}: {str(fe)[:150]}"
            debug_info_out["per_field_test"] = field_results
        return debug_info_out
    except BaseException as e:
        debug_info_out["sanitize_fail"] = f"{type(e).__name__}: {str(e)[:300]}"
        debug_info_out["traceback"] = traceback.format_exc()[:2000]
        return debug_info_out


@app.get("/debug/info")
def debug_info():
    """Diagnostic endpoint: disk state dosyalari + memory usage + cache.

    Production debugging icin — Render Logs erisilmediginde state'i
    inceleyebilmek icin. Authentication YOK (engine internal token zaten var).
    """
    states_list: list = []
    try:
        states_list = _iter_states()
        state_summary = []
        for fid, st in states_list[:20]:  # max 20
            try:
                state_summary.append({
                    "file_id": fid,
                    "status": st.get("status") if isinstance(st, dict) else "<invalid>",
                    "error_type": st.get("error_type") if isinstance(st, dict) else None,
                    "started_at": st.get("started_at") if isinstance(st, dict) else None,
                    "completed_at": st.get("completed_at") if isinstance(st, dict) else None,
                })
            except BaseException:
                state_summary.append({"file_id": fid, "status": "<unreadable>"})
    except BaseException:
        state_summary = ["<states dict unreadable>"]

    # Memory usage (psutil yoksa atla)
    mem_info = "psutil not available"
    try:
        import psutil
        proc = psutil.Process()
        mi = proc.memory_info()
        mem_info = {
            "rss_mb": round(mi.rss / 1024 / 1024, 1),
            "vms_mb": round(mi.vms / 1024 / 1024, 1),
        }
    except BaseException:
        try:
            import resource
            usage = resource.getrusage(resource.RUSAGE_SELF)
            mem_info = {"max_rss_kb": usage.ru_maxrss}
        except BaseException:
            pass

    # Cached DXF files on disk
    cached_files = []
    try:
        for f in os.listdir(_CACHE_DIR):
            if f.startswith(_CACHE_PREFIX) and f.endswith(_CACHE_SUFFIX):
                try:
                    full = os.path.join(_CACHE_DIR, f)
                    cached_files.append({
                        "name": f,
                        "size_kb": round(os.path.getsize(full) / 1024, 1),
                    })
                except BaseException:
                    cached_files.append({"name": f, "size_kb": "?"})
    except BaseException:
        cached_files = ["<dir unreadable>"]

    return {
        "build_sha": (
            os.environ.get("RENDER_GIT_COMMIT")
            or os.environ.get("K_REVISION")
            or os.environ.get("BUILD_SHA")
            or "local"
        )[:16],
        "states_count": len(states_list),
        "states": state_summary,
        "memory": mem_info,
        "cached_dxf_files": cached_files,
        "python_version": sys.version.split()[0],
    }


@app.get("/geometry/{file_id}")
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

    BYPASS PIPELINE: response_model kaldirildi, Response(json bytes) ile
    direkt dondurulur. FastAPI'nin jsonable_encoder'i Pydantic model'i
    encode ederken DXF'ten gelen lone surrogate karakterlerine (\\udcXX)
    takilip 500 atiyordu. Bu yaklasimda _json_safe ile sanitize +
    json.dumps ile pre-encode → garanti calisir.
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
            safe = _json_safe(cached)
            body = json.dumps(safe, allow_nan=False, ensure_ascii=False).encode('utf-8')
            return Response(content=body, media_type="application/json")
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

    # Pydantic model'i dict'e cevir, sanitize et
    try:
        result_dict = result.model_dump() if hasattr(result, "model_dump") else result.dict()
    except BaseException:
        result_dict = {}

    # Layer filtresi YOKSA disk'e yaz — sonraki cagrilara hizli donus
    if layer_set is None:
        try:
            with open(geom_cache, "w", encoding="utf-8") as f:
                json.dump(result_dict, f)
        except Exception:
            # Cache yazimi basarisiz — sorun degil, ana akis devam
            pass

    # PIPELINE BYPASS: _json_safe + json.dumps + Response
    safe = _json_safe(result_dict)
    body = json.dumps(safe, allow_nan=False, ensure_ascii=False).encode('utf-8')
    return Response(content=body, media_type="application/json")


# ═══════════════════════════════════════════════════════
#  ASYNC UPLOAD PATTERN (OCERP-style) — v2.3
# ═══════════════════════════════════════════════════════
# POST /upload → dosyayi diske yazar, 1-2sn'de file_id doner. DWG→DXF
# donusumu + ezdxf parse TAMAMEN izole subprocess'te (upload_worker.py)
# arka planda kosar. GET /status/{file_id} ile durum sorulur. Hazir olunca
# /geometry/{file_id} cache hit ile ~50ms doner.
#
# State artik DISKTE (_state_path) — eski in-memory _UPLOAD_STATES dict
# kaldirildi: restart'ta kaybolmuyor, WORKERS>1'e hazir, RAM'de buyumuyor.

import asyncio

# /upload dedup kritik bolgesi icin lock: ayni hash'li es zamanli iki istekten
# yalniz biri yeni pipeline baslatir. (Process-ici lock; WORKERS=1'de tam
# guvence, WORKERS>1'de pencere cok kucuk — state dosyasi yine tekilligi saglar.)
_UPLOAD_LOCK = asyncio.Lock()


def _clean_surrogates(s: str) -> str:
    """Bir Python string'inden lone surrogate (U+D800-U+DFFF) karakterleri temizle.

    ezdxf DXF parse ederken bazi byte'lari decode edemiyorsa (mojibake, bozuk
    cp1254/utf-8 mix), Python'un 'surrogateescape' error handler'i ile lone
    surrogate uretiyor (U+DCxx). Bu karakterler JSON encode edilemez:
      UnicodeEncodeError: 'utf-8' codec can't encode character '\\udcc4'
      (surrogates not allowed)

    Cozum: utf-8 encode/decode cycle ile surrogate'leri U+FFFD'ye degistir.
    """
    if not isinstance(s, str):
        return s
    try:
        # Hizli kontrol: surrogate yoksa olduğu gibi don
        s.encode('utf-8')
        return s
    except UnicodeEncodeError:
        # Surrogate var — replace ile temizle
        try:
            return s.encode('utf-8', errors='replace').decode('utf-8')
        except BaseException:
            # Son care: karakter karakter, surrogate'leri '?' yap
            return ''.join('?' if (0xd800 <= ord(c) <= 0xdfff) else c for c in s)


def _json_safe(obj):
    """Recursive olarak obj'i JSON-safe hale getir.

    Sorunlar:
      1. ezdxf parse sirasinda NaN/Inf float'lar uretiliyor (geometry
         hesaplamalarinda bbox infinite, division-by-zero vb.)
      2. ezdxf string'lerinde lone surrogate (\\udcXX) olabiliyor —
         DXF'in cp1254/utf-8 mojibake'inden surrogateescape ile decode
         edildiginde. Bunlar json.dumps utf-8 encode'unu patlatir.

    Bu fonksiyon:
      - NaN/Inf float → None
      - str → surrogate temizleme (U+DCxx → U+FFFD)
      - dict → her key+value sanitize
      - list/tuple → her item sanitize
      - int/bool/None → degisiklik yok
      - Pydantic model → model_dump (varsa) sonra recurse
      - Diger → str() fallback (yine surrogate temizle)
    """
    if obj is None or isinstance(obj, (int, bool)):
        return obj
    if isinstance(obj, str):
        return _clean_surrogates(obj)
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        # Key'ler de string olabilir surrogate ile — onlari da temizle
        return {_clean_surrogates(k) if isinstance(k, str) else k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(x) for x in obj]
    # Pydantic model
    if hasattr(obj, 'model_dump'):
        try:
            return _json_safe(obj.model_dump())
        except BaseException:
            pass
    if hasattr(obj, 'dict'):
        try:
            return _json_safe(obj.dict())
        except BaseException:
            pass
    # Bilinmeyen tip — str fallback (surrogate temizleme dahil)
    try:
        return _clean_surrogates(str(obj))
    except BaseException:
        return "<unrepr>"


def _run_parse_subprocess(dxf_path: str, params: dict, timeout: int = 180) -> dict:
    """analyze_dxf_metraj'i IZOLE subprocess'te calistir — OOM-safe.

    Render free tier 512MB single-worker'da bulk-parse OOM kill yapiyor
    (engine restart + state kaybi + sonsuz polling). Bu helper her parse
    request'ini ayri Python subprocess'te calistir — OOM olursa sadece
    subprocess kill, parent worker SAGLAM kalir.

    Iletisim:
      stdin  → JSON params (dxf_path + scale + selected_layers + ...)
      stdout → JSON result (analyze_dxf_metraj ciktisi, _json_safe ile sanitize)
      stderr → error mesajlari
      exit 0 → BASARILI
      exit 1 → HATA (stderr'de detay)
      exit -9 → SIGKILL (OOM)
      timeout → process.kill, TimeoutError

    Donus: result dict (model_dump cikti). Hata durumunda RuntimeError firlatir.
    """
    import subprocess as _sp

    # parse_worker.py engine dizininde, main.py ile ayni yerde
    worker_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "parse_worker.py")
    if not os.path.isfile(worker_path):
        raise RuntimeError(f"parse_worker.py bulunamadi: {worker_path}")

    payload = json.dumps({"dxf_path": dxf_path, **params})

    try:
        proc = _sp.run(
            [sys.executable, worker_path],
            input=payload,
            text=True,
            capture_output=True,
            timeout=timeout,
        )
    except _sp.TimeoutExpired:
        logging.error("parse_worker timeout (%ds) for %s", timeout, dxf_path)
        raise RuntimeError(f"Parse subprocess timeout ({timeout}s) — dosya cok kompleks olabilir")

    if proc.returncode == 0:
        try:
            return json.loads(proc.stdout)
        except json.JSONDecodeError as je:
            logging.error("parse_worker stdout JSON parse fail: %s\nstdout[:500]: %s", je, proc.stdout[:500])
            raise RuntimeError(f"Subprocess sonuc JSON degil: {str(je)[:200]}")

    # Non-zero exit code — error
    err_short = (proc.stderr or "")[:500]
    if proc.returncode == -9 or proc.returncode == 137:
        # SIGKILL — OOM kill
        logging.error("parse_worker OOM-killed (exit %d) for %s", proc.returncode, dxf_path)
        raise RuntimeError(
            "Parse subprocess bellek yetersiz (OOM kill). "
            "Dosya cok buyuk veya cok kompleks — daha az layer ile deneyin."
        )
    logging.error("parse_worker fail (exit %d): %s", proc.returncode, err_short)
    raise RuntimeError(f"Subprocess hata (exit {proc.returncode}): {err_short or 'no stderr'}")


def _run_upload_subprocess(file_id: str, src_path: str, timeout: int = 600) -> dict:
    """Upload pipeline'ini (DWG→DXF + tek ezdxf parse + geometry cache) IZOLE
    subprocess'te calistir — OOM-safe.

    Eskiden _background_parse ana worker icinde to_thread ile kosuyordu:
    devasa dosyada OOM olursa MOTORUN TAMAMI oluyordu (tum kullanicilarin
    state'i gidiyordu). Simdi /parse'taki desenin aynisi: cocuk process olur,
    parent saglam kalir, state'e net hata yazilir.

    Iletisim: stdin JSON {src_path, dxf_out, geom_out} → stdout JSON sonuc.
    Exit: 0 basarili | 1 hata (stderr) | -9/137 OOM kill.
    """
    import subprocess as _sp

    worker_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "upload_worker.py")
    if not os.path.isfile(worker_path):
        raise RuntimeError(f"upload_worker.py bulunamadi: {worker_path}")

    payload = json.dumps({
        "src_path": src_path,
        "dxf_out": _cache_path(file_id),
        "geom_out": _geometry_cache_path(file_id),
    })

    try:
        proc = _sp.run(
            [sys.executable, worker_path],
            input=payload,
            text=True,
            capture_output=True,
            timeout=timeout,
        )
    except _sp.TimeoutExpired:
        logging.error("upload_worker timeout (%ds) for %s", timeout, src_path)
        raise RuntimeError(f"Islem zaman asimi ({timeout}s) — dosya cok buyuk/kompleks olabilir")

    if proc.returncode == 0:
        try:
            return json.loads(proc.stdout)
        except json.JSONDecodeError as je:
            logging.error("upload_worker stdout JSON degil: %s\nstdout[:500]: %s", je, proc.stdout[:500])
            raise RuntimeError(f"Subprocess sonuc JSON degil: {str(je)[:200]}")

    err_short = (proc.stderr or "")[:500]
    if proc.returncode in (-9, 137):
        logging.error("upload_worker OOM-killed (exit %d) for %s", proc.returncode, src_path)
        raise RuntimeError(
            "Dosya islenirken bellek yetersiz kaldi (OOM). "
            "Dosya cok buyuk — mumkunse gereksiz layer'lari temizleyip yeniden deneyin."
        )
    logging.error("upload_worker fail (exit %d): %s", proc.returncode, err_short)
    raise RuntimeError(f"Islem hatasi (exit {proc.returncode}): {err_short or 'no stderr'}")


def _safe_response(obj):
    """Endpoint return helper: FastAPI encoder pipeline'ini BYPASS et.

    DXF'ten gelen Pydantic model'ler/dict'ler icinde lone surrogate (\\udcXX),
    NaN/Inf float, mojibake byte vb. olabiliyor. FastAPI'nin default
    jsonable_encoder → JSONResponse pipeline'i bunlari serialize ederken
    UnicodeEncodeError/ValueError atip 500 donduruyor.

    Bu helper:
      1. Pydantic model varsa model_dump ile dict'e çevir
      2. _json_safe ile derin temizle (NaN→None, surrogate→U+FFFD)
      3. json.dumps ile bytes'a encode (allow_nan=False, ensure_ascii=False)
      4. Response(pre-encoded bytes) ile dondur — pipeline atlanir

    Her zaman 200 doner (extreme fail durumunda hata mesaji icerikli body).
    """
    try:
        if hasattr(obj, 'model_dump'):
            data = obj.model_dump()
        elif hasattr(obj, 'dict'):
            data = obj.dict()
        else:
            data = obj
        safe = _json_safe(data)
        body = json.dumps(safe, allow_nan=False, ensure_ascii=False).encode('utf-8')
        return Response(content=body, media_type="application/json")
    except BaseException as e:
        try:
            logging.exception("_safe_response fail")
        except BaseException:
            pass
        fallback = {
            "error": f"Response encode fail: {type(e).__name__}: {str(e)[:200]}",
        }
        try:
            return Response(
                content=json.dumps(fallback, ensure_ascii=False).encode('utf-8'),
                media_type="application/json",
            )
        except BaseException:
            return Response(content=b'{"error":"encode_failure"}', media_type="application/json")


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




def _background_pipeline(file_id: str, src_path: str) -> None:
    """Background pipeline orkestratoru — sync function, asyncio.to_thread ile cagrilir.

    AGIR ISIN TAMAMI (DWG→DXF donusumu + ezdxf parse + geometry cache)
    upload_worker.py SUBPROCESS'inde kosar; bu fonksiyon sadece subprocess'i
    bekler ve sonucu state dosyasina yazar. OOM/timeout olursa yalniz cocuk
    olur — motor ve diger kullanicilarin state'leri SAGLAM kalir.
    """
    prev = _read_state(file_id) or {}
    started_at = prev.get("started_at", time.time())
    file_hash = prev.get("hash")
    try:
        result = _run_upload_subprocess(file_id, src_path, timeout=600)
        _write_state(file_id, {
            "status": "ready",
            "hash": file_hash,
            "started_at": started_at,
            "completed_at": time.time(),
            "layers": result.get("layers") or [],
            "total_layers": result.get("total_layers", 0),
            "suggested_scale": result.get("suggested_scale", 0.001),
            "suggested_unit_label": result.get("suggested_unit_label", "mm"),
            "entity_count": result.get("entity_count"),
        })
    except BaseException as e:
        # BULLETPROOF error handler — hicbir kosulda exception firlatma,
        # state mutlaka "error" olarak yazilsin ki frontend net mesaj gorsun.
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
            logging.exception("Background pipeline failed for file_id=%s", file_id)
        except BaseException:
            pass
        try:
            _write_state(file_id, {
                "status": "error",
                "hash": file_hash,
                "started_at": started_at,
                "completed_at": time.time(),
                "error_type": err_type,
                "error": safe_msg,
            })
        except BaseException:
            pass
    finally:
        # Ham kaynak dosya artik gereksiz (basarida worker DXF'i cache'e yazdi,
        # hatada kullanici yeniden yukleyecek). Diski sisirme.
        try:
            if os.path.isfile(src_path):
                os.unlink(src_path)
        except OSError:
            pass


@app.post("/upload")
async def upload_async(file: UploadFile = File(...)):
    """Async upload — dosyayi DISKE yazar, file_id ile HEMEN doner (~1-2sn).

    v2.3 (PRD): DWG→DXF donusumu ARTIK bu istegin icinde DEGIL — eskiden
    LibreDWG donusumu burada senkron kosuyordu (buyuk DWG'de 30-120sn),
    NestJS 30/60sn'de bagantiyi koparip 503 uretiyordu. Simdi donusum de
    parse da upload_worker.py subprocess'inde arka planda.

    DEDUP (PRD 3.1): Ayni icerik (sha256) zaten processing/ready ise YENI
    pipeline baslatilmaz, mevcut file_id doner. Boylece frontend retry'lari
    sunucuda LibreDWG surecini katlamaz ("kendi kendine DDoS" biter).

    Response: {file_id, status: "processing"|"ready", dedup?: true}
    """
    if not file.filename:
        raise HTTPException(400, "Dosya adi eksik")

    ext = file.filename.lower().rsplit('.', 1)[-1] if '.' in file.filename else ''
    if ext not in ("dwg", "dxf"):
        raise HTTPException(400, f"Desteklenmeyen format: .{ext}. Sadece .dwg ve .dxf kabul edilir.")

    content = await file.read()

    # ── DWG VERSION LOG (sadece teshis amacli, reddetmiyoruz) ───────
    # LibreDWG R2013'e (AC1027) kadar tam, R2018+ (AC1032) icin kismi destek.
    if ext == 'dwg' and len(content) >= 6:
        try:
            ver = content[:6].decode('ascii', errors='replace')
            logging.info("DWG version: %s (file=%s, size=%d)", ver, file.filename, len(content))
        except Exception:
            pass

    file_hash = hashlib.sha256(content).hexdigest()[:16]

    try:
        # Kritik bolge: dedup taramasi + state yazimi atomik olsun ki ayni
        # dosyanin es zamanli iki upload'i cift pipeline baslatmasin.
        async with _UPLOAD_LOCK:
            _cleanup_cache()

            # ── DEDUP: ayni hash zaten islemde/hazir mi? ──
            for fid, st in _iter_states():
                if st.get("hash") != file_hash:
                    continue
                status = st.get("status")
                if status == "ready" and os.path.isfile(_cache_path(fid)):
                    logging.info("Upload dedup (ready): %s → %s", file.filename, fid)
                    return {"file_id": fid, "status": "ready", "dedup": True}
                if status == "processing" and (
                    os.path.isfile(_src_path(fid, ext)) or os.path.isfile(_cache_path(fid))
                ):
                    logging.info("Upload dedup (processing): %s → %s", file.filename, fid)
                    return {"file_id": fid, "status": "processing", "dedup": True}
                # status=error veya dosyalar kaybolmus → dedup etme, yeniden isle

            # ── Yeni pipeline: ham dosyayi diske yaz + state + spawn ──
            file_id = uuid.uuid4().hex[:12]
            src_path = _src_path(file_id, ext)
            with open(src_path, "wb") as sf:
                sf.write(content)

            _write_state(file_id, {
                "status": "processing",
                "hash": file_hash,
                "started_at": time.time(),
                # Frontend "ready" gelene kadar bunlari kullanir; worker gercek
                # $INSUNITS degerini okuyup state'e yazar (artik ezilmiyor).
                "suggested_scale": 0.001,
                "suggested_unit_label": "mm",
            })

        # Agir is: izole subprocess (upload_worker.py) — event loop bloklanmaz,
        # OOM olsa bile yalniz cocuk process olur.
        asyncio.create_task(asyncio.to_thread(_background_pipeline, file_id, src_path))

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
        state = _read_state(file_id)
        if state is None:
            raise HTTPException(404, "file_id bilinmiyor (cache TTL gecmis olabilir)")

        # DEEP SANITIZE + DIRECT RESPONSE: FastAPI'nin jsonable_encoder
        # pipeline'i bazi durumlarda 500 atip patliyor (kanitlandi:
        # /debug/status-deep'te json.dumps BASARILI ama /status hala 500).
        # Cozum: pipeline'i tamamen bypass et — Response(json.dumps(...))
        # ile pre-encoded JSON bytes don. jsonable_encoder ASLA calismaz.
        try:
            safe = _json_safe(state)
            body = json.dumps(safe, allow_nan=False, ensure_ascii=False).encode('utf-8')
            return Response(content=body, media_type="application/json")
        except BaseException as enc_err:
            try:
                logging.exception("State sanitize fail for file_id=%s", file_id)
            except BaseException:
                pass
            fallback = {
                "status": "error",
                "error_type": "StateSanitizeError",
                "error": f"State okunamadi: {type(enc_err).__name__}: {str(enc_err)[:200]}",
            }
            return Response(
                content=json.dumps(fallback, ensure_ascii=False).encode('utf-8'),
                media_type="application/json",
            )
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


@app.post("/layers")
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

        # PIPELINE BYPASS: jsonable_encoder atla, surrogate'siz JSON donder
        return _safe_response(result)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Layer listesi cikarilirken hata: {str(e)}")


@app.post("/parse")
async def parse_dwg(
    file: UploadFile | None = File(None),
    file_id: str = Query("", description="Cache'teki dosyanin ID'si (/layers'tan donen)"),
    discipline: str = Query("mechanical"),
    scale: float | None = Query(None, description="Birim carpani (mm=0.001, cm=0.01, m=1.0). None ise OTOMATIK tespit ($INSUNITS + bound geometrisi)."),
    selected_layers: str = Query("", description="JSON array: secilen layer isimleri"),
    layer_hat_tipi: str = Query("{}", description="JSON object: {layer: hat_tipi} eslestirmesi"),
    layer_material_type: str = Query("{}", description="JSON object: {layer: material_type} eslestirmesi"),
    sprinkler_layers: str = Query("", description="JSON array: kullanici tarafindan sprinkler olarak isaretlenen layer'lar"),
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

    # ── Analiz et (SUBPROCESS IZOLASYON) ──
    # Render free tier 512MB'da bulk parse OOM kill yapiyor. Her parse'i
    # ayri Python subprocess'te calistir — OOM olursa parent worker SAGLAM.
    # asyncio.to_thread sayesinde main event loop bloke olmaz.
    try:
        params = {
            "scale": scale,
            "selected_layers": sel_layers,
            "hat_tipi_map": hat_tipi_map,
            "material_type_map": mat_type_map,
            "sprinkler_layers_manual": sprinkler_layers_manual,
        }
        # Subprocess'i async thread'de calistir, FastAPI event loop bloke olmasin
        result_dict = await asyncio.to_thread(
            _run_parse_subprocess, dxf_path, params, 180
        )
        # Subprocess zaten _json_safe ile sanitize ettiği için direkt response
        body = json.dumps(result_dict, allow_nan=False, ensure_ascii=False).encode('utf-8')
        return Response(content=body, media_type="application/json")

    except HTTPException:
        raise
    except RuntimeError as e:
        # Subprocess OOM, timeout, veya parse hatasi — net mesaj
        err_msg = str(e)
        logging.error("Parse subprocess hatasi: %s", err_msg)
        # OOM ise 507 (Insufficient Storage), timeout 504, diger 500
        if "OOM" in err_msg or "bellek" in err_msg:
            raise HTTPException(507, err_msg)
        if "timeout" in err_msg.lower():
            raise HTTPException(504, err_msg)
        raise HTTPException(500, err_msg)
    except Exception as e:
        import traceback as _tb
        _trace = _tb.format_exc()
        logging.error("DWG analiz hatasi: %s\n%s", repr(e), _trace)
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
