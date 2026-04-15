"""
matcher_core — Mekanik tesisat cizimindeki boru, ok ve cap metni veri yapilari,
PipeMatcher eslestirme motoru ve ODA SDK kopru fonksiyonu.

Akis:
  1. On filtreleme  — layer + format kisiti
  2. Ok bazli       — ArrowGroup → zincirleme eslestirme
  3. Yakinlik bazli  — fallback, cross-system check ile

Kullanim:
  results = process_cad_data(cad_objects, "PISSU_LAYER")
"""

from __future__ import annotations

import math
from typing import Any
from pydantic import BaseModel


class Pipe(BaseModel):
    """Boru segmenti — iki nokta arasindaki cizgi."""

    model_config = {"frozen": True}

    id: str
    layer: str
    start: tuple[float, float]
    end: tuple[float, float]


class Arrow(BaseModel):
    """Ok isareti — cap metnini boruya baglar."""

    model_config = {"frozen": True}

    id: str
    start: tuple[float, float]
    end: tuple[float, float]
    length: float
    diameter: str = ""  # _collect_arrows'dan gelen cap bilgisi


class Text(BaseModel):
    """Cap metni — ornegin 'O200', 'DN150', '2\"'."""

    model_config = {"frozen": True}

    id: str
    value: str
    position: tuple[float, float]


class MatchResult(BaseModel):
    """Tek bir borunun eslestirme sonucu."""

    model_config = {"frozen": True}

    pipe_id: str
    diameter: str
    source: str  # "arrow" | "text" | "unmatched"
    distance: float
    text_id: str | None = None


# ---------------------------------------------------------------------------
# Sabitler
# ---------------------------------------------------------------------------

ARROW_TEXT_GROUP_DIST: float = 80.0  # ok'u text'e baglama esigi (diameter_assigner ile uyumlu)
MAX_FALLBACK_DIST: float = 50.0  # fallback text eslestirme max mesafe
ARROW_TOUCH_DIST: float = 1.0  # ok ucu boruya "deger" sayilma esigi
MIN_PERPENDICULARITY: float = 0.15  # ok-boru arasi min sin(aci) (~8.5°, diagonal ok'lar icin)


# ---------------------------------------------------------------------------
# Geometri helper'lar (sadece math, dis bagimllik yok)
# ---------------------------------------------------------------------------


def _pt_dist(x1: float, y1: float, x2: float, y2: float) -> float:
    """Iki nokta arasindaki Euclidean mesafe."""
    return math.hypot(x2 - x1, y2 - y1)


def _perp_dist(
    px: float, py: float, x1: float, y1: float, x2: float, y2: float
) -> float:
    """Noktanin (px,py) bir dogru parcasina (x1,y1)-(x2,y2) dik mesafesi.

    Clamped projection: nokta segmentin disina duserse en yakin uca olan
    mesafe dondurulur.
    """
    dx, dy = x2 - x1, y2 - y1
    len_sq = dx * dx + dy * dy

    if len_sq < 1.0:
        return _pt_dist(px, py, x1, y1)

    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / len_sq))
    proj_x = x1 + t * dx
    proj_y = y1 + t * dy
    return _pt_dist(px, py, proj_x, proj_y)


def _midpoint(
    x1: float, y1: float, x2: float, y2: float
) -> tuple[float, float]:
    """Iki nokta arasindaki orta nokta."""
    return ((x1 + x2) / 2.0, (y1 + y2) / 2.0)


def _sin_angle_between(
    ax: float, ay: float, bx: float, by: float,
    px: float, py: float, qx: float, qy: float,
) -> float:
    """Iki vektorun arasindaki acinin sin degeri (0..1).

    Vektor 1: (ax,ay)→(bx,by)  (ok dogrultusu)
    Vektor 2: (px,py)→(qx,qy)  (boru dogrultusu)

    sin(aci) = |cross| / (|v1| * |v2|)
    0 = paralel, 1 = dik.
    """
    v1x, v1y = bx - ax, by - ay
    v2x, v2y = qx - px, qy - py
    len1 = math.hypot(v1x, v1y)
    len2 = math.hypot(v2x, v2y)
    if len1 < 0.01 or len2 < 0.01:
        return 1.0  # dejenere vektor → engelleme
    cross = abs(v1x * v2y - v1y * v2x)
    return cross / (len1 * len2)


# ---------------------------------------------------------------------------
# PipeMatcher — ana eslestirme motoru
# ---------------------------------------------------------------------------


class PipeMatcher:
    """Boru-cap eslestirme motoru.

    Kullanim:
        matcher = PipeMatcher(pipes, arrows, texts, "PISSU_LAYER")
        results = matcher.match()
    """

    def __init__(
        self,
        pipes: list[Pipe],
        arrows: list[Arrow],
        texts: list[Text],
        selected_layer: str,
    ) -> None:
        self._all_pipes = pipes
        self._arrows = arrows
        self._all_texts = texts
        self._selected_layer = selected_layer

    # ------------------------------------------------------------------
    # public
    # ------------------------------------------------------------------

    def match(self) -> list[MatchResult]:
        """Tum eslestirme pipeline'ini calistir, sonuclari dondur."""

        # Adim 0 — on filtreleme
        own_pipes = self._filter_pipes()
        valid_texts = self._filter_texts()
        other_pipes = [
            p for p in self._all_pipes if p.layer != self._selected_layer
        ]

        if not own_pipes:
            return []

        # Adim 1 — ok bazli eslestirme
        arrow_results, matched_pipe_ids, used_text_ids = self._arrow_match(
            own_pipes, valid_texts, other_pipes
        )

        # Adim 2 — yakinlik bazli fallback
        unmatched_pipes = [
            p for p in own_pipes if p.id not in matched_pipe_ids
        ]
        remaining_texts = [
            t for t in valid_texts if t.id not in used_text_ids
        ]
        text_results, fallback_matched_ids = self._text_match(
            unmatched_pipes, remaining_texts, other_pipes
        )

        # Adim 3 — eslesmeyen borular
        all_matched = matched_pipe_ids | fallback_matched_ids
        unmatched_results = [
            MatchResult(
                pipe_id=p.id,
                diameter="Belirtilmemis",
                source="unmatched",
                distance=-1.0,
            )
            for p in own_pipes
            if p.id not in all_matched
        ]

        return arrow_results + text_results + unmatched_results

    # ------------------------------------------------------------------
    # Adim 0 — on filtreleme
    # ------------------------------------------------------------------

    def _filter_pipes(self) -> list[Pipe]:
        """Sadece selected_layer'daki borulari dondur."""
        return [
            p
            for p in self._all_pipes
            if p.layer == self._selected_layer
        ]

    def _filter_texts(self) -> list[Text]:
        """Format kisitini uygula.

        PISSU / YAGMUR layer'lari icin sadece Ø iceren text'ler gecerli.
        """
        layer_upper = self._selected_layer.upper()
        needs_phi = "PISSU" in layer_upper or "YAGMUR" in layer_upper

        if not needs_phi:
            return list(self._all_texts)

        return [t for t in self._all_texts if "Ø" in t.value]

    # ------------------------------------------------------------------
    # Adim 1 — ok bazli eslestirme
    # ------------------------------------------------------------------

    def _arrow_match(
        self,
        own_pipes: list[Pipe],
        valid_texts: list[Text],
        other_pipes: list[Pipe],
    ) -> tuple[list[MatchResult], set[str], set[str]]:
        """Her text etrafindaki ok grubunu borularla zincirle.

        3 kati kural:
          1. Zorunlu hedef filtresi — ok ucu selected_layer disindaysa iptal
          2. Vektorel yon kontrolu — ok boruya dik gelmiyorsa reddet
          3. Mesafe agirlikli siralama — temas (< 1 birim) uzunluktan once

        Returns:
            (results, matched_pipe_ids, used_text_ids)
        """
        results: list[MatchResult] = []
        matched_pipe_ids: set[str] = set()
        used_text_ids: set[str] = set()

        all_pipes = list(own_pipes) + list(other_pipes)
        own_ids = {p.id for p in own_pipes}

        for text in valid_texts:
            tx, ty = text.position

            # text'e yakin oklari bul
            group = [
                a
                for a in self._arrows
                if _pt_dist(tx, ty, a.start[0], a.start[1])
                <= ARROW_TEXT_GROUP_DIST
            ]

            if not group:
                continue

            # --- Her ok icin: hedef boru bul + 3 kural uygula ---
            valid_pairs: list[tuple[Arrow, Pipe, float]] = []
            #                       ok,    boru, ok_ucu_boru_mesafesi

            for arrow in group:
                ax, ay = arrow.end

                # KURAL 1 — Zorunlu hedef filtresi
                # Ok ucunun TUM borulara (own + other) en yakin olani bul
                abs_best_pipe: Pipe | None = None
                abs_best_dist = float("inf")
                for pipe in all_pipes:
                    d = _perp_dist(
                        ax, ay,
                        pipe.start[0], pipe.start[1],
                        pipe.end[0], pipe.end[1],
                    )
                    if d < abs_best_dist:
                        abs_best_dist = d
                        abs_best_pipe = pipe

                # Ok ucu selected_layer disina carptiysa → TUM OKU IPTAL
                if abs_best_pipe is None or abs_best_pipe.id not in own_ids:
                    continue

                # Zaten eslesmis boruyu atla
                if abs_best_pipe.id in matched_pipe_ids:
                    continue

                # KURAL 2 — Vektorel yon kontrolu
                # Ok dogrultusu ile boru dogrultusu arasindaki sin(aci)
                sin_a = _sin_angle_between(
                    arrow.start[0], arrow.start[1],
                    arrow.end[0], arrow.end[1],
                    abs_best_pipe.start[0], abs_best_pipe.start[1],
                    abs_best_pipe.end[0], abs_best_pipe.end[1],
                )
                if sin_a < MIN_PERPENDICULARITY:
                    continue  # paralel → yatay boru dikey oku kapamaz

                valid_pairs.append((arrow, abs_best_pipe, abs_best_dist))

            if not valid_pairs:
                continue

            # KURAL 3 — Mesafe agirlikli siralama
            # Oncelik: temas (dist < 1) → uzunluk (kisa → uzun)
            # Temas eden oklar her zaman uzunluk sirasinin ONUNDE
            valid_pairs.sort(
                key=lambda item: (
                    0 if item[2] < ARROW_TOUCH_DIST else 1,  # temas → 0
                    item[2],                                   # mesafe
                    item[0].length,                            # uzunluk
                )
            )

            # Hedef borulari text'e olan mesafeye gore sirala (yakin → uzak)
            seen_pipes: dict[str, tuple[Pipe, float]] = {}
            for _, pipe, dist in valid_pairs:
                if pipe.id not in seen_pipes:
                    seen_pipes[pipe.id] = (pipe, dist)

            sorted_pipes = sorted(
                seen_pipes.values(),
                key=lambda item: _perp_dist(
                    tx, ty,
                    item[0].start[0], item[0].start[1],
                    item[0].end[0], item[0].end[1],
                ),
            )

            # Zincirleme eslestirme: ok[i] → boru[i]
            pair_count = min(len(valid_pairs), len(sorted_pipes))
            for i in range(pair_count):
                arrow_i = valid_pairs[i][0]
                pipe, _ = sorted_pipes[i]
                if pipe.id in matched_pipe_ids:
                    continue

                # Arrow.diameter varsa kullan (_collect_arrows eslesmesi)
                # yoksa text.value'ya dusus yap
                diameter = arrow_i.diameter if arrow_i.diameter else text.value

                results.append(
                    MatchResult(
                        pipe_id=pipe.id,
                        diameter=diameter,
                        source="arrow",
                        distance=0.0,
                        text_id=text.id,
                    )
                )
                matched_pipe_ids.add(pipe.id)
                used_text_ids.add(text.id)

        return results, matched_pipe_ids, used_text_ids

    # ------------------------------------------------------------------
    # Adim 2 — yakinlik bazli fallback
    # ------------------------------------------------------------------

    def _text_match(
        self,
        unmatched_pipes: list[Pipe],
        remaining_texts: list[Text],
        other_pipes: list[Pipe],
    ) -> tuple[list[MatchResult], set[str]]:
        """Ok bulunamayan borular icin en yakin text'i ata.

        Cross-system check: text baska layer'a daha yakinsa kullanilmaz.

        Returns:
            (results, matched_pipe_ids)
        """
        results: list[MatchResult] = []
        matched_pipe_ids: set[str] = set()
        used_text_ids: set[str] = set()

        for pipe in unmatched_pipes:
            mx, my = _midpoint(
                pipe.start[0], pipe.start[1],
                pipe.end[0], pipe.end[1],
            )

            best_text: Text | None = None
            best_dist = float("inf")

            for text in remaining_texts:
                if text.id in used_text_ids:
                    continue

                tx, ty = text.position
                dist = _pt_dist(mx, my, tx, ty)

                if dist > MAX_FALLBACK_DIST:
                    continue

                # cross-system check
                if self._text_closer_to_other(text, pipe, other_pipes):
                    continue

                if dist < best_dist:
                    best_dist = dist
                    best_text = text

            if best_text is not None:
                results.append(
                    MatchResult(
                        pipe_id=pipe.id,
                        diameter=best_text.value,
                        source="text",
                        distance=round(best_dist, 2),
                        text_id=best_text.id,
                    )
                )
                matched_pipe_ids.add(pipe.id)
                used_text_ids.add(best_text.id)

        return results, matched_pipe_ids

    # ------------------------------------------------------------------
    # Cross-system check
    # ------------------------------------------------------------------

    @staticmethod
    def _text_closer_to_other(
        text: Text,
        own_pipe: Pipe,
        other_pipes: list[Pipe],
    ) -> bool:
        """Text baska bir layer'daki boruya daha yakin mi?

        True donerse bu text kullanilmamali (hatali eslestirme riski).
        """
        tx, ty = text.position
        own_dist = _perp_dist(
            tx, ty,
            own_pipe.start[0], own_pipe.start[1],
            own_pipe.end[0], own_pipe.end[1],
        )

        for other in other_pipes:
            other_dist = _perp_dist(
                tx, ty,
                other.start[0], other.start[1],
                other.end[0], other.end[1],
            )
            if other_dist < own_dist:
                return True

        return False


# ---------------------------------------------------------------------------
# ODA SDK kopru fonksiyonu
# ---------------------------------------------------------------------------

# ODA SDK entity tip isimleri
_LINE_TYPES = frozenset({"DbLine", "AcDbLine"})
_LEADER_TYPES = frozenset({"DbLeader", "AcDbLeader", "DbMLeader", "AcDbMLeader"})
_TEXT_TYPES = frozenset({"DbText", "AcDbText", "DbMText", "AcDbMText"})


def process_cad_data(
    cad_objects: list[Any],
    selected_layer: str,
) -> list[MatchResult]:
    """ODA SDK nesnelerini Pipe/Arrow/Text'e donustur, eslestir, sonuc don.

    Tum katmanlardaki nesneler donusturulur (cross-system check icin).
    Eslestirme sadece selected_layer uzerinde yapilir.

    Args:
        cad_objects: ODA SDK'dan gelen ham nesne listesi.
                     Her nesne .Handle, .Layer ve tipe ozel attribute'lara sahip.
        selected_layer: Eslestirme yapilacak hedef katman adi.

    Returns:
        PipeMatcher.match() sonucu — list[MatchResult]

    Ornek:
        >>> results = process_cad_data(drawing.entities, "PISSU_KATI_1")
        >>> for r in results:
        ...     print(r.pipe_id, r.diameter, r.source)
    """
    pipes: list[Pipe] = []
    arrows: list[Arrow] = []
    texts: list[Text] = []

    for obj in cad_objects:
        type_name = type(obj).__name__

        if type_name in _LINE_TYPES:
            pipes.append(_convert_pipe(obj))

        elif type_name in _LEADER_TYPES:
            arrows.append(_convert_arrow(obj))

        elif type_name in _TEXT_TYPES:
            texts.append(_convert_text(obj))

    return PipeMatcher(pipes, arrows, texts, selected_layer).match()


# ---------------------------------------------------------------------------
# ODA SDK → Pydantic donusturuculer (private)
# ---------------------------------------------------------------------------


def _convert_pipe(obj: Any) -> Pipe:
    """DbLine → Pipe."""
    return Pipe(
        id=str(obj.Handle),
        layer=str(obj.Layer),
        start=(float(obj.StartPoint.x), float(obj.StartPoint.y)),
        end=(float(obj.EndPoint.x), float(obj.EndPoint.y)),
    )


def _convert_arrow(obj: Any) -> Arrow:
    """DbLeader/DbMLeader → Arrow.

    arrow.start = text tarafi (StartPoint)
    arrow.end   = pipe tarafi (EndPoint)
    Uzunluk: .Length varsa kullan, yoksa koordinat farkindan hesapla.
    """
    sx, sy = float(obj.StartPoint.x), float(obj.StartPoint.y)
    ex, ey = float(obj.EndPoint.x), float(obj.EndPoint.y)

    length = (
        float(obj.Length)
        if hasattr(obj, "Length")
        else _pt_dist(sx, sy, ex, ey)
    )

    return Arrow(
        id=str(obj.Handle),
        start=(sx, sy),
        end=(ex, ey),
        length=length,
    )


def _convert_text(obj: Any) -> Text:
    """DbText/DbMText → Text."""
    return Text(
        id=str(obj.Handle),
        value=str(obj.TextString),
        position=(float(obj.Position.x), float(obj.Position.y)),
    )
