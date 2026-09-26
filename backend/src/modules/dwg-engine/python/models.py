"""Veri modelleri — DWG metraj sonuclari."""

from pydantic import BaseModel


# ── Layer Kesfetme (hizli, uzunluk hesaplamadan) ──

class LayerInfo(BaseModel):
    layer: str          # AutoCAD layer adi
    entity_count: int   # LINE + LWPOLYLINE + POLYLINE entity sayisi (boru cizgileri)
    insert_count: int = 0  # INSERT entity sayisi (block reference — sprinkler/sembol)


class LayerListResult(BaseModel):
    # file_id / suggested_* / dxf_base64 alanlari 26.09'da kaldirildi: yalniz
    # eski POST /layers yaziyordu. Birim onerisi upload_worker → state'te tasinir.
    layers: list[LayerInfo] = []
    total_layers: int = 0
    warnings: list[str] = []


# ── Topoloji Analizi ──

class PipeSegment(BaseModel):
    segment_id: int
    layer: str
    length: float = 0.0     # metre cinsinden
    line_count: int = 0
    material_type: str = "" # "Siyah Boru", "HDPE", "PPR-C", "Galvaniz Boru", vb.
    diameter: str = ""      # "Ø50", "DN100", "2\"", "" — layer-level kullanici girisi, bos = belirtilmemis


class BranchPoint(BaseModel):
    x: float
    y: float
    connections: int         # kac cizgi bulusuyor
    point_type: str = ""     # "tee", "sprinkler", "end"
    layer: str = ""          # Noktanin baglandigi edge'lerden en baskininin layer'i


# ── Metraj Hesaplama ──

class LayerMetraj(BaseModel):
    layer: str          # "YANGIN TESISATI HIDRANT HATTI"
    length: float       # METRE toplam uzunluk (DXF world unit x scale)
    line_count: int     # kac cizgi parcasi
    hat_tipi: str = ""  # kullanicinin verdigi hat ismi
    segments: list[PipeSegment] = []


class EdgeSegment(BaseModel):
    """Her bir pipe-run (chain) + cap + koordinatlar.
    Frontend Canvas2D viewer'da cizim + tik-duzenleme icin kullanilir.

    coords / polyline: DXF world coords (HAM unit — mm/cm/m). Sadece UI cizim
    ve hit-test icin. Metraj her zaman `length` alanindan (metre) okunur."""
    segment_id: int
    layer: str
    diameter: str = ""           # bos = atanmadi ('Capi Belirlenemeyenler' grubuna duser)
    length: float = 0.0          # METRE (DXF world unit x scale)
    coords: list[float] = []     # [x1, y1, x2, y2] — run endpoint'leri (ham DXF unit)
    polyline: list[list[float]] = []  # [[x,y], ...] — chain'in gercek sekli (ham DXF unit)
    is_inherited: bool = False   # True = inheritance pass'inden geldi (canvas'ta isaret icin)


class SprinklerCandidate(BaseModel):
    """Isaretlenmemis ama secili borularin USTUNDE sembol tasiyan katman.
    Karar degil, OLCULMUS ipucu: kullanici katmani 💧 ile isaretlemeyi unutmus
    olabilir (02.09: 'YNG SPRİNK PENDENT' isaretsizdi, 704 sembol boru ustunde)."""
    layer: str
    on_pipe: int   # boru cizgisinin icinden gecen sembol kumesi sayisi


class MetrajResult(BaseModel):
    layers: list[LayerMetraj] = []
    total_length: float = 0.0
    total_layers: int = 0
    warnings: list[str] = []
    branch_points: list[BranchPoint] = []
    edge_segments: list[EdgeSegment] = []  # her edge ayri — Canvas2D viewer icin
    junction_points: list[list[float]] = []  # T-junction [x, y] noktalari (degree>=3, marker icin)
    # Yalniz split_mode=t ve sprinkler katmani isaretlenmemisken dolar
    sprinkler_candidates: list[SprinklerCandidate] = []
    # Birim auto-detect bilgisi (frontend "Algılanan: X" rozetinde gösterir)
    detected_unit: str = "mm"               # mm | cm | dm | m | inch | ft
    detected_scale: float = 0.001           # metre / cizim birimi
    detection_reason: str = ""              # kanit metni — kullaniciya gosterilir
    detection_confidence: str = "dusuk"     # kesin | yuksek | orta | dusuk | kullanici
    detection_method: str = ""              # antet+olcek | yazi+olcek | fizik | insunits | ...
    detection_rejected: list[str] = []      # elenen adaylar + eleme gerekcesi
