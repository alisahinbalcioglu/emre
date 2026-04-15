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

ARROW_TEXT_GROUP_DIST: float = 15.0  # ok'u text'e baglama esigi
MAX_FALLBACK_DIST: float = 50.0  # fallback text eslestirme max mesafe


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

        Cross-system check: ok ucu baska layer borusuna daha yakinsa
        o ok atlanir — sadece selected_layer borularina isaret eden
        oklar eslestirme havuzuna girer.

        Returns:
            (results, matched_pipe_ids, used_text_ids)
        """
        results: list[MatchResult] = []
        matched_pipe_ids: set[str] = set()
        used_text_ids: set[str] = set()

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

            # oklari uzunluga gore sirala (kisa → uzun)
            group.sort(key=lambda a: a.length)

            # her ok'un pipe-end'inin degdigi borulari bul
            # SADECE own_pipes (selected_layer) hedef havuzunda
            target_pipes: list[tuple[Pipe, float]] = []
            for arrow in group:
                ax, ay = arrow.end

                # --- own_pipes icinde en yakin boruyu bul ---
                best_own_pipe: Pipe | None = None
                best_own_dist = float("inf")

                for pipe in own_pipes:
                    if pipe.id in matched_pipe_ids:
                        continue
                    d = _perp_dist(
                        ax, ay,
                        pipe.start[0], pipe.start[1],
                        pipe.end[0], pipe.end[1],
                    )
                    if d < best_own_dist:
                        best_own_dist = d
                        best_own_pipe = pipe

                if best_own_pipe is None:
                    continue

                # --- cross-system check: baska layer daha yakin mi? ---
                arrow_hits_other = False
                for other in other_pipes:
                    other_dist = _perp_dist(
                        ax, ay,
                        other.start[0], other.start[1],
                        other.end[0], other.end[1],
                    )
                    if other_dist < best_own_dist:
                        arrow_hits_other = True
                        break

                if not arrow_hits_other:
                    target_pipes.append((best_own_pipe, best_own_dist))

            if not target_pipes:
                continue

            # hedef borulari text'e olan mesafeye gore sirala (yakin → uzak)
            target_pipes.sort(
                key=lambda item: _perp_dist(
                    tx, ty,
                    item[0].start[0], item[0].start[1],
                    item[0].end[0], item[0].end[1],
                )
            )

            # zincirleme eslestirme: arrow[i] → pipe[i]
            pair_count = min(len(group), len(target_pipes))
            for i in range(pair_count):
                pipe, _ = target_pipes[i]
                if pipe.id in matched_pipe_ids:
                    continue

                results.append(
                    MatchResult(
                        pipe_id=pipe.id,
                        diameter=text.value,
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
