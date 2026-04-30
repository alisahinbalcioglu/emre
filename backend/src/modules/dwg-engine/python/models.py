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
    diameter: str = ""      # "Ø50", "DN100", "2\"", "" (AI atadigi cap — bos = belirtilmemis)


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
    Frontend SVG viewer'da cizim + tik-duzenleme icin kullanilir.

    coords: run'in iki ucu [x1,y1,x2,y2] — AI mesafe hesabi + tiklama icin.
    polyline: chain'in gercek sirali vertex'leri [[x,y], [x,y], ...] — SVG'de
              gorsel olarak dogru L/Z/U sekilli boru hatti cizimi icin."""
    segment_id: int
    layer: str
    diameter: str = ""           # AI atadigi cap; bos = belirtilmemis
    length: float = 0.0          # m (scale uygulanmis)
    coords: list[float] = []     # [x1, y1, x2, y2] — DXF world coords (run endpoint'leri)
    polyline: list[list[float]] = []  # [[x,y], ...] — chain'in gercek sekli


class SprinklerDetectionInfo(BaseModel):
    """Backend auto_detect_sprinklers ozeti — frontend bilgi satirinda gosterir."""
    source: str = ""           # "ai" | "regex" | "cache" | ""
    block_count: int = 0       # kac unique block sprinkler olarak isaretlendi
    center_count: int = 0      # toplam sprinkler INSERT pozisyonu
    excluded_text_count: int = 0  # cap havuzundan dusen sprinkler ID etiketleri


class MetrajResult(BaseModel):
    layers: list[LayerMetraj] = []
    total_length: float = 0.0
    total_layers: int = 0
    warnings: list[str] = []
    branch_points: list[BranchPoint] = []
    edge_segments: list[EdgeSegment] = []  # her edge ayri — SVG viewer icin
    sprinkler_detection: SprinklerDetectionInfo | None = None
