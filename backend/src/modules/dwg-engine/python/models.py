"""Veri modelleri — DWG metraj sonuclari."""

from pydantic import BaseModel


# ── Layer Kesfetme (hizli, uzunluk hesaplamadan) ──

class LayerInfo(BaseModel):
    layer: str          # AutoCAD layer adi
    entity_count: int   # LINE + LWPOLYLINE + POLYLINE entity sayisi (boru cizgileri)
    insert_count: int = 0  # INSERT entity sayisi (sprinkler/sembol block'lari)
    # Geometri-bazli sprinkler aday skoru (0.0-1.0) — V2 icin, su an unused
    sprinkler_candidate_score: float = 0.0
    # Backend'in onerdigi rol — frontend UI pre-selection icin.
    # 'pipe' | 'sprinkler' | 'ignore'. Kullanici UI'da degistirebilir.
    suggested_role: str = 'ignore'


class LayerListResult(BaseModel):
    layers: list[LayerInfo] = []
    total_layers: int = 0
    file_id: str = ""       # cache'teki DXF dosyasinin ID'si (tekrar yukleme gerek yok)
    warnings: list[str] = []


# ── Topoloji Analizi (Faz 2) ──

class PipeSegment(BaseModel):
    segment_id: int
    layer: str
    diameter: str = ""      # "Ø200", "DN50", "2\"", "Belirtilmemis"
    length: float = 0.0     # metre cinsinden
    line_count: int = 0
    material_type: str = "" # "Siyah Boru", "HDPE", "PPR-C", "Galvaniz Boru", vb.
    coords: list[list[float]] = []  # [[x1,y1,x2,y2], ...] her edge'in koordinatlari
    branch_id: str = ""     # Dal (branch) grup kimligi — ayni dalin tum edge'leri ayni branch_id tasir


class BranchPoint(BaseModel):
    x: float
    y: float
    connections: int         # kac cizgi bulusuyor
    point_type: str = ""     # "tee", "elbow", "end"


# ── Metraj Hesaplama ──

class LayerMetraj(BaseModel):
    layer: str          # "YANGIN TESİSATI HİDRANT HATTI"
    length: float       # metre cinsinden toplam uzunluk
    line_count: int     # kac cizgi parcasi
    hat_tipi: str = ""  # kullanicinin verdigi hat ismi
    segments: list[PipeSegment] = []  # Faz 2: cap bazli alt dagılım


class MetrajResult(BaseModel):
    layers: list[LayerMetraj] = []
    total_length: float = 0.0
    total_layers: int = 0
    warnings: list[str] = []
    branch_points: list[BranchPoint] = []  # Faz 2: dallanma noktalari
    edge_segments: list[PipeSegment] = []  # Her edge ayri tiklanabilir segment
    background_lines: list[list[float]] = []  # Arka plan cizgileri [[x1,y1,x2,y2], ...]
