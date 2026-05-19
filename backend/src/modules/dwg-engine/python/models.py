"""Veri modelleri — DWG metraj sonuclari."""

from pydantic import BaseModel


# ── Layer Kesfetme (hizli, uzunluk hesaplamadan) ──

class LayerInfo(BaseModel):
    layer: str          # AutoCAD layer adi
    entity_count: int   # LINE + LWPOLYLINE + POLYLINE entity sayisi (boru cizgileri)
    insert_count: int = 0  # INSERT entity sayisi (block reference — sprinkler/sembol)


class LayerListResult(BaseModel):
    layers: list[LayerInfo] = []
    total_layers: int = 0
    file_id: str = ""       # cache'teki DXF dosyasinin ID'si (tekrar yukleme gerek yok)
    dxf_base64: str = ""    # DXF dosyasi base64 (frontend DxfViewer icin)
    suggested_scale: float = 0.001  # DWG $INSUNITS header'indan onerilen birim carpani
    suggested_unit_label: str = "mm"  # Frontend dialog'unda gosterilecek isim
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
    layer: str          # "YANGIN TESİSATI HİDRANT HATTI"
    length: float       # metre cinsinden toplam uzunluk
    line_count: int     # kac cizgi parcasi
    hat_tipi: str = ""  # kullanicinin verdigi hat ismi
    segments: list[PipeSegment] = []


class EdgeSegment(BaseModel):
    """Her bir pipe-run (chain) + cap + koordinatlar.
    Frontend Canvas2D viewer'da cizim + tik-duzenleme icin kullanilir.

    coords: run'in iki ucu [x1,y1,x2,y2] — tiklama icin.
    polyline: chain'in gercek sirali vertex'leri [[x,y], [x,y], ...] — canvas'ta
              gorsel olarak dogru L/Z/U sekilli boru hatti cizimi icin."""
    segment_id: int
    layer: str
    diameter: str = ""           # Layer-level kullanici girisi; bos = belirtilmemis
    length: float = 0.0          # m (scale uygulanmis)
    coords: list[float] = []     # [x1, y1, x2, y2] — DXF world coords (run endpoint'leri)
    polyline: list[list[float]] = []  # [[x,y], ...] — chain'in gercek sekli
    is_inherited: bool = False   # Legacy field — AI BFS miras esnekligi (her zaman False artik)


class MetrajResult(BaseModel):
    layers: list[LayerMetraj] = []
    total_length: float = 0.0
    total_layers: int = 0
    warnings: list[str] = []
    branch_points: list[BranchPoint] = []
    edge_segments: list[EdgeSegment] = []  # her edge ayri — Canvas2D viewer icin
    junction_points: list[list[float]] = []  # T-junction [x, y] noktalari (degree>=3, marker icin)
    sprinkler_detection: None = None  # Legacy field — AI sprinkler tespit kaldirildigi icin her zaman None
