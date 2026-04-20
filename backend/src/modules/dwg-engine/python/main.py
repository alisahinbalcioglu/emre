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
import tempfile
from collections import defaultdict
import ezdxf
from fastapi import FastAPI, UploadFile, File, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from converter import convert_dwg_to_dxf
from topology import analyze_topology
from geometry import extract_geometry, GeometryResult
from models import (
    LayerInfo, LayerListResult,
    LayerMetraj, MetrajResult, PipeSegment, EdgeSegment,
)

# backend/.env dosyasini yukle (ANTHROPIC_API_KEY icin)
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

    TUM entity tipli layer'lari doner (TEXT/MTEXT icin cap layer'lari,
    CIRCLE/ARC icin sembol layer'lari dahil). Kullanicinin manuel
    sprinkler/cap etiketi atayabilmesi icin tum layer'lar gorunmeli.
    """
    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()

    # layer → {'entity': boru, 'insert': block, 'total': tum entity sayisi}
    layer_data: dict[str, dict[str, int]] = {}
    pipe_types = ('LINE', 'LWPOLYLINE', 'POLYLINE')

    for entity in msp:
        et = entity.dxftype()
        layer = entity.dxf.layer
        if layer not in layer_data:
            layer_data[layer] = {'entity': 0, 'insert': 0, 'total': 0}
        layer_data[layer]['total'] += 1
        if et in pipe_types:
            layer_data[layer]['entity'] += 1
        elif et == 'INSERT':
            layer_data[layer]['insert'] += 1

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
    use_ai_diameter: bool = False,
    layer_default_diameter_map: dict[str, str] | None = None,
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

    # ── Topoloji analizi: sprinkler/tee/end branch_points ──
    topo_segments, branch_points, topo_warnings = analyze_topology(
        dxf_path, selected_layers, scale,
        material_type_map=material_type_map,
        hat_tipi_map=hat_tipi_map,
        sprinkler_layers_manual=sprinkler_layers_manual,
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

    # ── Edge segment'leri olustur (AI kullanilsa da kullanilmasa da) ──
    # Frontend SVG viewer her edge'i cap bazli renklendirip tiklanabilir yapar.
    edge_segments: list[EdgeSegment] = []
    if selected_layers:
        try:
            from ai_diameter import _extract_segments as _edge_extract
            _edges = _edge_extract(dxf_path, selected_layers, sprinkler_layers=sprinkler_layers_manual)
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
        except Exception as _e:
            warnings.append(f"Edge segment cikarma: {str(_e)[:100]}")

    # ── AI Cap Atama (opsiyonel) ──
    if use_ai_diameter and selected_layers:
        try:
            from ai_diameter import assign_diameters_with_ai

            # Kullanicinin hat_tipi_map'te verdigi ipucunu AI'a aktar
            # (ornek: "Sprinkler Hatti" → AI inch format sec)
            _hat_hint = ""
            if hat_tipi_map:
                # Secili layer'larin hat ismini birlestir (cogu durumda tek layer)
                hints = [hat_tipi_map.get(l, "") for l in selected_layers if hat_tipi_map.get(l)]
                _hat_hint = " / ".join(filter(None, hints))

            seg_diameters, ai_info = assign_diameters_with_ai(
                dxf_path, selected_layers, hat_tipi_hint=_hat_hint,
                sprinkler_layers=sprinkler_layers_manual,
            )

            # Her segment'i kendi cap'iyla birlikte, layer bazinda grupla
            # Sonuc: her layer icin (diameter -> toplam_uzunluk)
            # Segment uzunluklarini AI modulu zaten dxf birim olarak ureitir —
            # bu fonksiyonda scale uygulayacagiz.
            import ezdxf as _ezdxf
            _doc = _ezdxf.readfile(dxf_path)
            _msp = _doc.modelspace()

            # Segment id -> (layer, length) haritasi (ai_diameter ile ayni sira)
            from ai_diameter import _extract_segments
            _segs = _extract_segments(dxf_path, selected_layers, sprinkler_layers=sprinkler_layers_manual)
            seg_map = {s["id"]: s for s in _segs}

            # AI'nin atayamadigi segment'leri layer-level default ile doldur
            # (metraj tablosunda da dogru gorulsun diye aggregation'dan ONCE uygulanir)
            if layer_default_diameter_map:
                for _sid, _seg in seg_map.items():
                    if not seg_diameters.get(_sid):
                        _def = layer_default_diameter_map.get(_seg["layer"], "").strip()
                        if _def:
                            seg_diameters[_sid] = _def

            # Layer -> {diameter -> total_length} (m cinsinden)
            cap_totals: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
            cap_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
            for sid, dia in seg_diameters.items():
                seg = seg_map.get(sid)
                if not seg:
                    continue
                key_dia = dia if dia else "Belirtilmemis"
                cap_totals[seg["layer"]][key_dia] += seg["length"] * scale
                cap_counts[seg["layer"]][key_dia] += 1

            # layers listesini AI capinin detayiyla guncelle
            for l in layers:
                ai_breakdown = cap_totals.get(l.layer, {})
                if not ai_breakdown:
                    continue
                # Her cap icin ayri PipeSegment
                ai_segs: list[PipeSegment] = []
                next_id = 1
                for dia, length in sorted(ai_breakdown.items()):
                    ai_segs.append(PipeSegment(
                        segment_id=next_id,
                        layer=l.layer,
                        length=round(length, 2),
                        line_count=cap_counts[l.layer].get(dia, 0),
                        material_type=(material_type_map or {}).get(l.layer, ""),
                        diameter=dia,
                    ))
                    next_id += 1
                l.segments = ai_segs

            # Warning'e AI bilgisi ekle
            if "error" in ai_info:
                warnings.append(f"AI Cap atama hatasi: {ai_info['error']}")
            else:
                warnings.append(
                    f"AI Cap: {ai_info['segment_count']} segment, "
                    f"{ai_info['text_count']} cap text, "
                    f"~{ai_info['cost_tl']} TL"
                )

            # edge_segments'deki diameter'lari AI sonucuyla doldur
            for es in edge_segments:
                if es.segment_id in seg_diameters:
                    es.diameter = seg_diameters[es.segment_id] or ""
        except Exception as e:
            warnings.append(f"AI cap atama calistirilamadi: {str(e)[:150]}")

    # ── Layer-level default cap uygulamasi (AI kullanilmasa da calissin) ──
    # edge_segments'deki bos/Belirtilmemis olan segment'leri layer default'u ile doldur.
    # Onceki AI bloğu zaten seg_diameters'i enrich ettiyse bu adim ekstra etkilemez.
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
    )


# ═══════════════════════════════════════════════════════
#  API ENDPOINT'LER
# ═══════════════════════════════════════════════════════

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "dwg-engine",
        "version": "2.2",
        "cached_files": len(_file_cache),
    }


@app.get("/geometry/{file_id}", response_model=GeometryResult)
def get_geometry(
    file_id: str,
    layers: str = Query("", description="Virgulle ayrilmis layer listesi; bos ise tum layerlar"),
):
    """
    Cache'teki DXF'ten LINE/POLYLINE koordinatlarini dondur.
    Frontend SVG viewer (dwg-viewer klasoru) icin kullanilir.
    """
    dxf_path = _get_cached_dxf(file_id)
    layer_set: set[str] | None = None
    if layers.strip():
        layer_set = {ln.strip() for ln in layers.split(",") if ln.strip()}
    try:
        return extract_geometry(dxf_path, layer_set)
    except Exception as e:
        raise HTTPException(500, f"Geometri cikarilamadi: {str(e)}")


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

        # DWG birimini otomatik tespit et ($INSUNITS header'indan)
        try:
            doc = ezdxf.readfile(dxf_path)
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

        # DXF dosyasini base64 olarak da don — frontend DxfViewer icin
        try:
            with open(dxf_path, "rb") as f:
                result.dxf_base64 = base64.b64encode(f.read()).decode("ascii")
        except OSError:
            result.dxf_base64 = ""

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
    use_ai_diameter: bool = Query(False, description="True ise boru cap atama Claude AI ile yapilir"),
    layer_default_diameter: str = Query("{}", description="JSON object: {layer: default_diameter} — AI atayamadigi segment'ler icin fallback"),
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
            use_ai_diameter=use_ai_diameter,
            layer_default_diameter_map=default_dia_map,
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
