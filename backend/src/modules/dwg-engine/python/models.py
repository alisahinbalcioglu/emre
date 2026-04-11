"""Veri modelleri — DWG metraj sonuclari."""

from pydantic import BaseModel


# ── Layer Kesfetme (hizli, uzunluk hesaplamadan) ──

class LayerInfo(BaseModel):
    layer: str          # AutoCAD layer adi
    entity_count: int   # LINE + LWPOLYLINE + POLYLINE entity sayisi


class LayerListResult(BaseModel):
    layers: list[LayerInfo] = []
    total_layers: int = 0
    file_id: str = ""       # cache'teki DXF dosyasinin ID'si (tekrar yukleme gerek yok)
    warnings: list[str] = []


# ── Metraj Hesaplama ──

class LayerMetraj(BaseModel):
    layer: str          # "YANGIN TESİSATI HİDRANT HATTI"
    length: float       # metre cinsinden toplam uzunluk
    line_count: int     # kac cizgi parcasi
    hat_tipi: str = ""  # yangin, sihhi, isitma, sogutma, dogalgaz, elektrik, sprinkler, diger


class MetrajResult(BaseModel):
    layers: list[LayerMetraj] = []
    total_length: float = 0.0
    total_layers: int = 0
    warnings: list[str] = []
