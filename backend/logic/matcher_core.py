"""
matcher_core v4.0 — Nihai Cap Eslestirme Motoru

PRD v2 kurallari:
  1. Aktif Katman Izolasyonu — selected_layer vs noise
  2. Metin Vizesi (Sanitization) — Atiksu: Ø zorunlu, Basincli: "/DN/sayi
  3. Geometrik Dogrulama — Aci bariyeri (30°<θ<150°) + Sanal segmentasyon
  4. Zincirleme Eslestirme — ArrowGroup + indeks esleme
  5. Cross-System Check — Baska layer'a yakin metin iptal/uyari

Cikti formati: MatchResult (pipe_id, diameter, method, confidence_score, segment)
"""

from __future__ import annotations

import math
import re
from typing import Any
from pydantic import BaseModel


# ═══════════════════════════════════════════════════════════════════
#  VERİ YAPILARI
# ═══════════════════════════════════════════════════════════════════


class Pipe(BaseModel):
    """Boru segmenti."""

    model_config = {"frozen": True}

    id: str
    layer: str
    start: tuple[float, float]
    end: tuple[float, float]


class Arrow(BaseModel):
    """Ok isareti — cap metnini boruya baglar."""

    model_config = {"frozen": True}

    id: str
    start: tuple[float, float]  # text tarafi
    end: tuple[float, float]  # pipe tarafi
    length: float
    diameter: str = ""


class Text(BaseModel):
    """Cap metni."""

    model_config = {"frozen": True}

    id: str
    value: str
    position: tuple[float, float]


class MatchResult(BaseModel):
    """Eslestirme sonucu — PRD v2 formati."""

    model_config = {"frozen": True}

    pipe_id: str
    layer: str = ""
    diameter: str
    method: str  # "arrow_chain", "text_fallback", "unmatched"
    confidence_score: float  # 0.0 - 1.0
    segment: str = ""  # "0-150cm" veya "" (tum boru)
    distance: float = -1.0
    text_id: str | None = None
    # Eski uyumluluk
    source: str = ""  # "arrow" | "text" | "unmatched"


# ═══════════════════════════════════════════════════════════════════
#  SABİTLER
# ═══════════════════════════════════════════════════════════════════

ARROW_TEXT_GROUP_DIST: float = 100.0  # ok-text gruplama maksimum mesafe
MAX_FALLBACK_DIST: float = 150.0     # fallback text-to-edge perp mesafe esigi
MAX_ARROW_PIPE_DIST: float = 100.0   # ok ucu-boru mesafe baraji

# Aci bariyeri: 30° < θ < 150° (PRD v2)
ANGLE_MIN: float = 30.0
ANGLE_MAX: float = 150.0


# ═══════════════════════════════════════════════════════════════════
#  GEOMETRİ
# ═══════════════════════════════════════════════════════════════════


def _pt_dist(x1: float, y1: float, x2: float, y2: float) -> float:
    return math.hypot(x2 - x1, y2 - y1)


def _perp_dist(
    px: float, py: float, x1: float, y1: float, x2: float, y2: float,
) -> float:
    """Nokta → segment dik mesafesi (clamped)."""
    dx, dy = x2 - x1, y2 - y1
    len_sq = dx * dx + dy * dy
    if len_sq < 1.0:
        return _pt_dist(px, py, x1, y1)
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / len_sq))
    return _pt_dist(px, py, x1 + t * dx, y1 + t * dy)


def _project_t(
    px: float, py: float, x1: float, y1: float, x2: float, y2: float,
) -> float:
    """Noktanin segment uzerindeki projeksiyon parametresi t (0..1)."""
    dx, dy = x2 - x1, y2 - y1
    len_sq = dx * dx + dy * dy
    if len_sq < 1.0:
        return 0.0
    return max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / len_sq))


def _midpoint(x1: float, y1: float, x2: float, y2: float) -> tuple[float, float]:
    return ((x1 + x2) / 2.0, (y1 + y2) / 2.0)


def _pipe_length(pipe: Pipe) -> float:
    return _pt_dist(pipe.start[0], pipe.start[1], pipe.end[0], pipe.end[1])


def _angle_between_deg(
    v1x: float, v1y: float, v2x: float, v2y: float,
) -> float:
    """Iki vektor arasi aci (derece, 0-180)."""
    len1 = math.hypot(v1x, v1y)
    len2 = math.hypot(v2x, v2y)
    if len1 < 0.01 or len2 < 0.01:
        return 90.0
    dot = v1x * v2x + v1y * v2y
    cos_val = max(-1.0, min(1.0, dot / (len1 * len2)))
    return math.degrees(math.acos(cos_val))


def _passes_angle_barrier(
    arrow: Arrow, pipe: Pipe,
) -> bool:
    """Ok-boru arasi aci 30°<θ<150° mi? (PRD v2 Madde 3A)"""
    v1x = arrow.end[0] - arrow.start[0]
    v1y = arrow.end[1] - arrow.start[1]
    v2x = pipe.end[0] - pipe.start[0]
    v2y = pipe.end[1] - pipe.start[1]
    angle = _angle_between_deg(v1x, v1y, v2x, v2y)
    return ANGLE_MIN < angle < ANGLE_MAX


# ═══════════════════════════════════════════════════════════════════
#  METİN VİZESİ (PRD v2 Madde 2)
# ═══════════════════════════════════════════════════════════════════

_INCH_RE = re.compile(
    r'(?:'
    r'\d+\s*"'
    r'|\d+\s+\d+/\d+\s*"'
    r'|\d+/\d+\s*"'
    r'|[\u00bc\u00bd\u00be]"?'
    r'|\d+[\u00bc\u00bd\u00be]"?'
    r')',
    re.IGNORECASE,
)
_DN_RE = re.compile(r'DN\s*\d+', re.IGNORECASE)
_PHI_RE = re.compile(r'[Øø]\s*\d+')
_PURE_NUM_RE = re.compile(r'^\d+(\.\d+)?$')


def validate_text_for_layer(value: str, layer: str) -> bool:
    """Metin vizesi.

    Atiksu grubu (PISSU, YAGMUR, GRISU): SADECE Ø.
    Basincli hatlar (TEMIZSU, YANGIN, GAZ, diger): ", DN, saf sayi.
    """
    lu = layer.upper()
    is_waste = any(kw in lu for kw in ("PISSU", "YAGMUR", "GRISU"))
    if is_waste:
        return bool(_PHI_RE.search(value))
    return (
        bool(_INCH_RE.search(value))
        or bool(_DN_RE.search(value))
        or bool(_PURE_NUM_RE.match(value.strip()))
    )


# ═══════════════════════════════════════════════════════════════════
#  CONFIDENCE SCORE
# ═══════════════════════════════════════════════════════════════════


def _calc_confidence(method: str, dist: float) -> float:
    """Eslestirme guvenilirlik skoru (0-1)."""
    if method == "arrow_chain":
        return 0.95 if dist < 5.0 else 0.85
    # arrow_direct kaldirildi — tum eslesmeler arrow_chain uzerinden
    if method == "text_fallback":
        if dist < 10.0:
            return 0.70
        if dist < 30.0:
            return 0.55
        return 0.40
    return 0.0  # unmatched


# ═══════════════════════════════════════════════════════════════════
#  SANAL SEGMENTASYON (PRD v2 Madde 3B)
# ═══════════════════════════════════════════════════════════════════


def _virtual_segment(
    pipe: Pipe,
    arrows_on_pipe: list[tuple[Arrow, float]],  # (arrow, t_param)
    scale: float = 0.001,
) -> list[tuple[str, str, float]]:
    """Uzun boru uzerine birden fazla ok varsa sanal parcalara bol.

    Her ok'un temas noktasi (t parametresi) uzerinden boru parcalanir.
    Returns: [(diameter, segment_str, segment_length), ...]
    """
    if len(arrows_on_pipe) <= 1:
        dia = arrows_on_pipe[0][0].diameter if arrows_on_pipe else "Belirtilmemis"
        total = _pipe_length(pipe) * scale
        return [(dia, f"0-{total:.0f}cm", total)]

    # t parametresine gore sirala
    sorted_arrows = sorted(arrows_on_pipe, key=lambda x: x[1])

    total_len = _pipe_length(pipe)
    segments: list[tuple[str, str, float]] = []

    # Baslangic → ilk ok arasi
    # Her ok arasi → ok'un cap degeri
    # Son ok → boru sonu
    boundaries = [0.0]
    for _, t in sorted_arrows:
        boundaries.append(t)
    boundaries.append(1.0)

    for i in range(len(sorted_arrows)):
        t_start = boundaries[i]
        t_end = boundaries[i + 1]
        mid_t = (t_start + t_end) / 2.0

        # Bu araligin ortasina en yakin ok'un capi
        best_arrow = sorted_arrows[i][0]
        seg_len = abs(t_end - t_start) * total_len * scale
        start_cm = t_start * total_len * scale * 100
        end_cm = t_end * total_len * scale * 100
        seg_str = f"{start_cm:.0f}-{end_cm:.0f}cm"
        segments.append((best_arrow.diameter, seg_str, seg_len))

    # Son segment (son ok → boru sonu)
    if len(sorted_arrows) > 0:
        t_start = boundaries[-2]
        t_end = 1.0
        seg_len = abs(t_end - t_start) * total_len * scale
        if seg_len > 0.001:
            start_cm = t_start * total_len * scale * 100
            end_cm = t_end * total_len * scale * 100
            seg_str = f"{start_cm:.0f}-{end_cm:.0f}cm"
            segments.append((sorted_arrows[-1][0].diameter, seg_str, seg_len))

    return segments


# ═══════════════════════════════════════════════════════════════════
#  PipeMatcher v4 — ANA MOTOR
# ═══════════════════════════════════════════════════════════════════


class PipeMatcher:
    """Nihai cap eslestirme motoru (PRD v2).

    Kullanim:
        results = PipeMatcher(pipes, arrows, texts, "LAYER").match()
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

    def match(self) -> list[MatchResult]:
        """Tum pipeline'i calistir."""

        # KURAL 1: Katman izolasyonu
        active = [p for p in self._all_pipes if p.layer == self._selected_layer]
        noise = [p for p in self._all_pipes if p.layer != self._selected_layer]
        if not active:
            return []

        # KURAL 2: Metin vizesi
        valid_texts = [
            t for t in self._all_texts
            if validate_text_for_layer(t.value, self._selected_layer)
        ]

        # KURAL 3+4: Ok eslestirme (text gruplama + zincirleme)
        arrow_results, matched_ids, used_text_ids = self._arrow_match(
            active, noise, valid_texts,
        )

        # Fallback: text eslestirme
        unmatched = [p for p in active if p.id not in matched_ids]
        remaining = [t for t in valid_texts if t.id not in used_text_ids]
        text_results, text_ids = self._fallback_match(unmatched, remaining, noise)

        # Eslesmeyenler
        all_matched = matched_ids | text_ids
        unmatched_results = [
            MatchResult(
                pipe_id=p.id,
                layer=self._selected_layer,
                diameter="Belirtilmemis",
                method="unmatched",
                confidence_score=0.0,
                source="unmatched",
                distance=-1.0,
            )
            for p in active if p.id not in all_matched
        ]

        return arrow_results + text_results + unmatched_results

    # ------------------------------------------------------------------
    # Ok eslestirme — SADECE text gruplama + zincirleme indeks esleme
    # ------------------------------------------------------------------

    def _arrow_match(
        self,
        active: list[Pipe],
        noise: list[Pipe],
        valid_texts: list[Text],
    ) -> tuple[list[MatchResult], set[str], set[str]]:
        """Zincirleme eslestirme — 1 ok → 1 text + text.value kullan.

        Kritik: arrow.diameter YOKSAYILIR (yanlis olabilir).
        Cap bilgisi SADECE text.value'dan alinir.

        Akis:
          0. Her ok icin EN YAKIN gecerli text'i bul (1 ok → 1 text)
          1. Her text icin kendisine bagli oklari topla
          2. Oklari boya gore sirala (kisa → uzun)
          3a. Aday havuzu: grup oklarinin uclarinin degdigi active borular
          3b. Adaylari text mesafesine gore sirala
          4. ok[i] → aday[i]  (indeks esleme)
          5. Aci bariyeri: paralel reddet
          6. Cap = text.value
        """
        results: list[MatchResult] = []
        matched_ids: set[str] = set()
        used_text_ids: set[str] = set()

        # ADIM 0: Her ok → en yakin gecerli text (ARROW_TEXT_GROUP_DIST icinde)
        arrow_to_text: dict[str, Text] = {}
        for arrow in self._arrows:
            best_text: Text | None = None
            best_d = ARROW_TEXT_GROUP_DIST
            for text in valid_texts:
                d = _pt_dist(
                    text.position[0], text.position[1],
                    arrow.start[0], arrow.start[1],
                )
                if d < best_d:
                    best_d = d
                    best_text = text
            if best_text is not None:
                arrow_to_text[arrow.id] = best_text

        # Text bazinda oklari grupla
        text_arrows: dict[str, list[Arrow]] = {}
        for arrow in self._arrows:
            text = arrow_to_text.get(arrow.id)
            if text is None:
                continue
            text_arrows.setdefault(text.id, []).append(arrow)

        for text in valid_texts:
            tx, ty = text.position
            group = text_arrows.get(text.id, [])
            if not group:
                continue

            # ADIM 2: Oklari boya gore sirala (kisa → uzun)
            group.sort(key=lambda a: a.length)

            # ADIM 3a: Aday havuzu — ok uclarinin dokundugu/yakin oldugu borular
            candidate_ids: set[str] = set()
            for arrow in group:
                ax, ay = arrow.end
                # Her active boruya ok ucunun mesafesi
                best_pipe: Pipe | None = None
                best_d = float("inf")
                for pipe in active:
                    if pipe.id in matched_ids:
                        continue
                    d = _perp_dist(
                        ax, ay,
                        pipe.start[0], pipe.start[1],
                        pipe.end[0], pipe.end[1],
                    )
                    if d < best_d:
                        best_d = d
                        best_pipe = pipe

                if best_pipe is None or best_d > MAX_ARROW_PIPE_DIST:
                    continue

                # Cross-system: ok ucu noise'a daha yakinsa → ok dışarıda
                hits_noise = False
                for n in noise:
                    nd = _perp_dist(
                        ax, ay,
                        n.start[0], n.start[1],
                        n.end[0], n.end[1],
                    )
                    if nd < best_d:
                        hits_noise = True
                        break
                if hits_noise:
                    continue

                candidate_ids.add(best_pipe.id)

            if not candidate_ids:
                continue

            # ADIM 3b: Adaylari text mesafesine gore sirala (yakin → uzak)
            candidates: list[tuple[Pipe, float]] = []
            for pipe in active:
                if pipe.id not in candidate_ids:
                    continue
                d = _perp_dist(
                    tx, ty,
                    pipe.start[0], pipe.start[1],
                    pipe.end[0], pipe.end[1],
                )
                candidates.append((pipe, d))

            candidates.sort(key=lambda x: x[1])

            # ADIM 4: INDEKS ESLEME — ok[i] → aday[i]
            count = min(len(group), len(candidates))
            for i in range(count):
                arrow_i = group[i]
                pipe_i, dist_i = candidates[i]

                if pipe_i.id in matched_ids:
                    continue

                # ADIM 5: Aci bariyeri — paralel okleri eleme
                if not _passes_angle_barrier(arrow_i, pipe_i):
                    continue

                # ADIM 6: Cap = text.value (arrow.diameter YOKSAYILIR)
                diameter = text.value
                if not validate_text_for_layer(diameter, self._selected_layer):
                    continue

                conf = _calc_confidence("arrow_chain", dist_i)
                results.append(MatchResult(
                    pipe_id=pipe_i.id,
                    layer=self._selected_layer,
                    diameter=diameter,
                    method="arrow_chain",
                    confidence_score=round(conf, 2),
                    source="arrow",
                    distance=round(dist_i, 2),
                    text_id=text.id,
                ))
                matched_ids.add(pipe_i.id)
                used_text_ids.add(text.id)

        return results, matched_ids, used_text_ids

    # ------------------------------------------------------------------
    # Fallback text eslestirme
    # ------------------------------------------------------------------

    def _fallback_match(
        self,
        unmatched: list[Pipe],
        remaining: list[Text],
        noise: list[Pipe],
    ) -> tuple[list[MatchResult], set[str]]:
        results: list[MatchResult] = []
        matched_ids: set[str] = set()
        used: set[str] = set()

        for pipe in unmatched:
            best_text: Text | None = None
            best_dist = float("inf")

            for text in remaining:
                if text.id in used:
                    continue
                tx, ty = text.position

                # Text → pipe SEGMENT'E dik mesafe (orta nokta degil!)
                # Uzun borularda orta noktaya mesafe yaniltici
                own_d = _perp_dist(
                    tx, ty,
                    pipe.start[0], pipe.start[1],
                    pipe.end[0], pipe.end[1],
                )
                if own_d > MAX_FALLBACK_DIST:
                    continue

                # Cross-system check
                skip = False
                for n in noise:
                    nd = _perp_dist(
                        tx, ty,
                        n.start[0], n.start[1],
                        n.end[0], n.end[1],
                    )
                    if nd < own_d:
                        skip = True
                        break
                if skip:
                    continue

                if own_d < best_dist:
                    best_dist = own_d
                    best_text = text

            if best_text is not None:
                conf = _calc_confidence("text_fallback", best_dist)
                results.append(MatchResult(
                    pipe_id=pipe.id,
                    layer=self._selected_layer,
                    diameter=best_text.value,
                    method="text_fallback",
                    confidence_score=round(conf, 2),
                    source="text",
                    distance=round(best_dist, 2),
                    text_id=best_text.id,
                ))
                matched_ids.add(pipe.id)
                used.add(best_text.id)

        return results, matched_ids


# ═══════════════════════════════════════════════════════════════════
#  ODA SDK KOPRU
# ═══════════════════════════════════════════════════════════════════

_LINE_TYPES = frozenset({"DbLine", "AcDbLine"})
_LEADER_TYPES = frozenset({"DbLeader", "AcDbLeader", "DbMLeader", "AcDbMLeader"})
_TEXT_TYPES = frozenset({"DbText", "AcDbText", "DbMText", "AcDbMText"})


def process_cad_data(
    cad_objects: list[Any], selected_layer: str,
) -> list[MatchResult]:
    pipes: list[Pipe] = []
    arrows: list[Arrow] = []
    texts: list[Text] = []
    for obj in cad_objects:
        tn = type(obj).__name__
        if tn in _LINE_TYPES:
            pipes.append(_convert_pipe(obj))
        elif tn in _LEADER_TYPES:
            arrows.append(_convert_arrow(obj))
        elif tn in _TEXT_TYPES:
            texts.append(_convert_text(obj))
    return PipeMatcher(pipes, arrows, texts, selected_layer).match()


def _convert_pipe(obj: Any) -> Pipe:
    return Pipe(
        id=str(obj.Handle), layer=str(obj.Layer),
        start=(float(obj.StartPoint.x), float(obj.StartPoint.y)),
        end=(float(obj.EndPoint.x), float(obj.EndPoint.y)),
    )


def _convert_arrow(obj: Any) -> Arrow:
    sx, sy = float(obj.StartPoint.x), float(obj.StartPoint.y)
    ex, ey = float(obj.EndPoint.x), float(obj.EndPoint.y)
    length = float(obj.Length) if hasattr(obj, "Length") else _pt_dist(sx, sy, ex, ey)
    return Arrow(id=str(obj.Handle), start=(sx, sy), end=(ex, ey), length=length)


def _convert_text(obj: Any) -> Text:
    return Text(
        id=str(obj.Handle), value=str(obj.TextString),
        position=(float(obj.Position.x), float(obj.Position.y)),
    )
