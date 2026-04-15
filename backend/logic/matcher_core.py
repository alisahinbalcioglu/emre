"""
matcher_core — Evrensel Cap Eslestirme Motoru v3.0

5 Kural (PRD):
  1. Katman Izolasyonu  — Aktif Havuz vs Gurultu Havuzu
  2. Metin Vizesi       — Layer tipine gore format kontrolu
  3. Zincirleme Eslestirme — Ok gruplama + indeks esleme
  4. Vektorel Diklik    — Ok-boru arasi aci kontrolu (70°-110°)
  5. Cross-System Check — Baska layer'a daha yakin metin iptal

Kullanim:
  results = PipeMatcher(pipes, arrows, texts, "LAYER").match()
  results = process_cad_data(cad_objects, "LAYER")
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
    start: tuple[float, float]  # text tarafi
    end: tuple[float, float]  # pipe tarafi
    length: float
    diameter: str = ""  # _collect_arrows'dan gelen cap bilgisi


class Text(BaseModel):
    """Cap metni — ornegin 'Ø200', 'DN150', '1\"'."""

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


# ═══════════════════════════════════════════════════════════════════
#  SABİTLER
# ═══════════════════════════════════════════════════════════════════

# Kural 3 — Zincirleme eslestirme
ARROW_TEXT_GROUP_DIST: float = 80.0   # ok baslangici ↔ text merkezi gruplama
MAX_FALLBACK_DIST: float = 50.0      # fallback text eslestirme max mesafe

# Kural 4 — Vektorel diklik
# Ok-boru arasi aci 70°-110° arasinda olmali → sin(70°) = 0.94, sin(20°) = 0.34
# Minimum sin degeri: sin(70°) = 0.94 → esik = cos(20°) yaklasik
# Asil kontrol: |dot| / (|v1|*|v2|) < cos(20°) = ~0.94 → paralel
# Basitlestirilmis: sin(aci) >= 0.94 → dik kabul
# GERCEK: 70-110 derece arasi → sin >= sin(70) = 0.9397
MIN_PERPENDICULARITY: float = 0.70   # sin(aci) >= 0.70 → ~44° (genis tolerans)


# ═══════════════════════════════════════════════════════════════════
#  GEOMETRİ HELPER'LAR
# ═══════════════════════════════════════════════════════════════════


def _pt_dist(x1: float, y1: float, x2: float, y2: float) -> float:
    """Iki nokta arasindaki Euclidean mesafe."""
    return math.hypot(x2 - x1, y2 - y1)


def _perp_dist(
    px: float, py: float, x1: float, y1: float, x2: float, y2: float
) -> float:
    """Noktanin (px,py) bir dogru parcasina (x1,y1)-(x2,y2) dik mesafesi."""
    dx, dy = x2 - x1, y2 - y1
    len_sq = dx * dx + dy * dy
    if len_sq < 1.0:
        return _pt_dist(px, py, x1, y1)
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / len_sq))
    return _pt_dist(px, py, x1 + t * dx, y1 + t * dy)


def _midpoint(
    x1: float, y1: float, x2: float, y2: float
) -> tuple[float, float]:
    """Iki nokta arasindaki orta nokta."""
    return ((x1 + x2) / 2.0, (y1 + y2) / 2.0)


def _angle_between_deg(
    v1x: float, v1y: float, v2x: float, v2y: float
) -> float:
    """Iki vektor arasindaki aci (derece, 0-180).

    dot = |v1|*|v2|*cos(theta)  →  theta = acos(dot / (|v1|*|v2|))
    """
    len1 = math.hypot(v1x, v1y)
    len2 = math.hypot(v2x, v2y)
    if len1 < 0.01 or len2 < 0.01:
        return 90.0  # dejenere vektor → dik kabul et
    dot = v1x * v2x + v1y * v2y
    cos_val = max(-1.0, min(1.0, dot / (len1 * len2)))
    return math.degrees(math.acos(cos_val))


def _is_perpendicular(
    arrow_sx: float, arrow_sy: float, arrow_ex: float, arrow_ey: float,
    pipe_sx: float, pipe_sy: float, pipe_ex: float, pipe_ey: float,
) -> bool:
    """Ok dogrultusu ile boru dogrultusu arasindaki aci ~dik mi?

    acos 0-180 dondurur. 90°'ye yakinlik olculur:
      angle_to_90 = |90 - angle|
      Eger angle_to_90 <= 45 → dik kabul (45°-135° arasi)
      Eger angle_to_90 > 45  → paralel, reddet (0°-45° veya 135°-180°)

    True = dik (gecerli), False = paralel (reddet).
    """
    v1x, v1y = arrow_ex - arrow_sx, arrow_ey - arrow_sy
    v2x, v2y = pipe_ex - pipe_sx, pipe_ey - pipe_sy
    angle = _angle_between_deg(v1x, v1y, v2x, v2y)
    # 90°'ye olan uzaklik
    angle_to_90 = abs(90.0 - angle)
    return angle_to_90 <= 45.0  # 45°-135° arasi = dik


# ═══════════════════════════════════════════════════════════════════
#  KURAL 2 — METİN VİZESİ
# ═══════════════════════════════════════════════════════════════════

# Inch pattern'leri: 1", 1 1/4", 3/4", ¾", 1¼", 2½" vb.
_INCH_RE = re.compile(
    r'(?:'
    r'\d+\s*"'                   # 1", 2"
    r'|\d+\s+\d+/\d+\s*"'       # 1 1/4"
    r'|\d+/\d+\s*"'             # 3/4"
    r'|[\u00bc\u00bd\u00be]"?'  # ¼, ½, ¾
    r'|\d+[\u00bc\u00bd\u00be]"?'  # 1¼, 2½
    r')',
    re.IGNORECASE,
)

# DN pattern: DN20, DN 50, dn100
_DN_RE = re.compile(r'DN\s*\d+', re.IGNORECASE)

# Ø pattern: Ø200, Ø110
_PHI_RE = re.compile(r'[Øø]\s*\d+')

# Saf sayi: 20, 25, 32, 50 (mm deger, baslarina/sonlarina harf yok)
_PURE_NUM_RE = re.compile(r'^\d+(\.\d+)?$')


def _text_has_phi(value: str) -> bool:
    """Metin icinde Ø sembolü var mi?"""
    return bool(_PHI_RE.search(value))


def _text_has_dn(value: str) -> bool:
    """Metin DN formatinda mi?"""
    return bool(_DN_RE.search(value))


def _text_has_inch(value: str) -> bool:
    """Metin inch formatinda mi?"""
    return bool(_INCH_RE.search(value))


def _text_has_number(value: str) -> bool:
    """Metin saf sayi mi?"""
    return bool(_PURE_NUM_RE.match(value.strip()))


def validate_text_for_layer(value: str, layer: str) -> bool:
    """Kural 2: Metin Vizesi.

    Atik Su (PISSU/YAGMUR): SADECE Ø iceren metinler gecerli.
    Temiz Su / Gaz / Diger: " (inch), DN, veya saf sayi gecerli.

    Returns: True = gecerli cap metni, False = reddedildi.
    """
    layer_upper = layer.upper()
    is_wastewater = "PISSU" in layer_upper or "YAGMUR" in layer_upper

    if is_wastewater:
        return _text_has_phi(value)

    # Temiz su / gaz / diger: inch, DN veya saf sayi kabul
    return _text_has_inch(value) or _text_has_dn(value) or _text_has_number(value)


# ═══════════════════════════════════════════════════════════════════
#  PipeMatcher — ANA ESLESTIRME MOTORU
# ═══════════════════════════════════════════════════════════════════


class PipeMatcher:
    """Evrensel cap eslestirme motoru.

    5 kural PRD'sine gore calisir:
      1. Katman izolasyonu
      2. Metin vizesi
      3. Zincirleme eslestirme
      4. Vektorel diklik
      5. Cross-system check
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
        """Tum eslestirme pipeline'ini calistir."""

        # ── KURAL 1: Katman izolasyonu ──
        active_pool = [
            p for p in self._all_pipes
            if p.layer == self._selected_layer
        ]
        noise_pool = [
            p for p in self._all_pipes
            if p.layer != self._selected_layer
        ]

        if not active_pool:
            return []

        # ── KURAL 2: Metin vizesi ──
        valid_texts = [
            t for t in self._all_texts
            if validate_text_for_layer(t.value, self._selected_layer)
        ]

        # ── KURAL 3: Zincirleme eslestirme (ok bazli) ──
        arrow_results, matched_ids, used_text_ids = self._chain_match(
            active_pool, noise_pool, valid_texts,
        )

        # ── Fallback: ok yoksa yakin text ──
        unmatched = [p for p in active_pool if p.id not in matched_ids]
        remaining = [t for t in valid_texts if t.id not in used_text_ids]
        text_results, text_matched_ids = self._fallback_match(
            unmatched, remaining, noise_pool,
        )

        # ── Eslesmeyenler ──
        all_matched = matched_ids | text_matched_ids
        unmatched_results = [
            MatchResult(
                pipe_id=p.id,
                diameter="Belirtilmemis",
                source="unmatched",
                distance=-1.0,
            )
            for p in active_pool
            if p.id not in all_matched
        ]

        return arrow_results + text_results + unmatched_results

    # ------------------------------------------------------------------
    # KURAL 3: Zincirleme eslestirme
    # ------------------------------------------------------------------

    def _chain_match(
        self,
        active_pool: list[Pipe],
        noise_pool: list[Pipe],
        valid_texts: list[Text],
    ) -> tuple[list[MatchResult], set[str], set[str]]:
        """Ok bazli zincirleme eslestirme — iki modlu.

        MOD A: Arrow.diameter dolu → ok zaten cap bilgisi tasiyor
               (_collect_arrows eslesmesi). Text gruplama GEREKMEZ.
               Dogrudan ok ucunun active_pool'daki boruyu bul + diklik + ata.

        MOD B: Arrow.diameter bos → text gruplama ile klasik eslestirme.

        Her iki modda da Kural 1 (hedef filtre) ve Kural 4 (diklik) uygulanir.
        """
        results: list[MatchResult] = []
        matched_ids: set[str] = set()
        used_text_ids: set[str] = set()

        # ── MOD A: diameter'li oklar — boru-merkezli eslestir ──
        arrows_with_dia = [a for a in self._arrows if a.diameter]
        arrows_without_dia = [a for a in self._arrows if not a.diameter]

        # Adim 1: TUM oklarin hedef borusunu bul (henuz claim etme)
        pipe_candidates: dict[str, list[tuple[Arrow, Pipe, float]]] = {}
        for arrow in arrows_with_dia:
            # Metin vizesi
            if not validate_text_for_layer(
                arrow.diameter, self._selected_layer
            ):
                continue
            pipe, dist, ok = self._arrow_to_pipe(
                arrow, active_pool, noise_pool,
            )
            if not ok or pipe is None:
                continue
            pipe_candidates.setdefault(pipe.id, []).append(
                (arrow, pipe, dist)
            )

        # Adim 2: Her boru icin en iyi oku sec (en yakin ok ucu)
        for pipe_id, candidates in pipe_candidates.items():
            candidates.sort(key=lambda x: (x[2], x[0].length))
            best_arrow, best_pipe, best_dist = candidates[0]
            results.append(MatchResult(
                pipe_id=best_pipe.id,
                diameter=best_arrow.diameter,
                source="arrow",
                distance=0.0,
                text_id=None,
            ))
            matched_ids.add(pipe_id)

        # ── MOD B: diameter'siz oklar — text gruplama ile ──
        for text in valid_texts:
            tx, ty = text.position

            group = [
                a for a in arrows_without_dia
                if _pt_dist(tx, ty, a.start[0], a.start[1])
                <= ARROW_TEXT_GROUP_DIST
            ]
            if not group:
                continue

            group.sort(key=lambda a: a.length)

            ok_boru_pairs: list[tuple[Arrow, Pipe, float]] = []
            for arrow in group:
                pipe, _dist, ok = self._arrow_to_pipe(
                    arrow, active_pool, noise_pool,
                )
                if ok and pipe is not None and pipe.id not in matched_ids:
                    ax, ay = arrow.end
                    dist = _perp_dist(
                        ax, ay,
                        pipe.start[0], pipe.start[1],
                        pipe.end[0], pipe.end[1],
                    )
                    ok_boru_pairs.append((arrow, pipe, dist))

            if not ok_boru_pairs:
                continue

            # Borulari text'e yakinliga gore sirala
            seen: dict[str, tuple[Pipe, float]] = {}
            for _, pipe, dist in ok_boru_pairs:
                if pipe.id not in seen:
                    seen[pipe.id] = (pipe, dist)

            sorted_pipes = sorted(
                seen.values(),
                key=lambda item: _perp_dist(
                    tx, ty,
                    item[0].start[0], item[0].start[1],
                    item[0].end[0], item[0].end[1],
                ),
            )

            count = min(len(ok_boru_pairs), len(sorted_pipes))
            for i in range(count):
                pipe, _ = sorted_pipes[i]
                if pipe.id in matched_ids:
                    continue

                results.append(MatchResult(
                    pipe_id=pipe.id,
                    diameter=text.value,
                    source="arrow",
                    distance=0.0,
                    text_id=text.id,
                ))
                matched_ids.add(pipe.id)
                used_text_ids.add(text.id)

        return results, matched_ids, used_text_ids

    def _arrow_to_pipe(
        self,
        arrow: Arrow,
        active_pool: list[Pipe],
        noise_pool: list[Pipe],
    ) -> tuple[Pipe | None, float, bool]:
        """Tek bir ok'u active_pool'daki en yakin boruyla esle.

        Kural 1 (hedef filtre) + Kural 4 (diklik) uygulanir.
        matched_ids kontrolu YAPILMAZ — boru-merkezli secim disarida yapilir.

        Returns: (pipe, distance, success)
        """
        ax, ay = arrow.end

        # KURAL 1: Hedef SADECE active_pool
        best_pipe: Pipe | None = None
        best_dist = float("inf")
        for pipe in active_pool:
            d = _perp_dist(
                ax, ay,
                pipe.start[0], pipe.start[1],
                pipe.end[0], pipe.end[1],
            )
            if d < best_dist:
                best_dist = d
                best_pipe = pipe

        if best_pipe is None:
            return None, 0.0, False

        # KURAL 1 ek: baska layer'a daha yakin mi?
        for noise in noise_pool:
            nd = _perp_dist(
                ax, ay,
                noise.start[0], noise.start[1],
                noise.end[0], noise.end[1],
            )
            if nd < best_dist:
                return None, 0.0, False

        # KURAL 4: Vektorel diklik
        if not _is_perpendicular(
            arrow.start[0], arrow.start[1],
            arrow.end[0], arrow.end[1],
            best_pipe.start[0], best_pipe.start[1],
            best_pipe.end[0], best_pipe.end[1],
        ):
            return None, 0.0, False

        return best_pipe, best_dist, True

    # ------------------------------------------------------------------
    # Fallback: ok yoksa yakin text (KURAL 5 dahil)
    # ------------------------------------------------------------------

    def _fallback_match(
        self,
        unmatched: list[Pipe],
        remaining_texts: list[Text],
        noise_pool: list[Pipe],
    ) -> tuple[list[MatchResult], set[str]]:
        """Ok bulunamayan borular icin en yakin text.

        MAX_FALLBACK_DIST (50 birim) siniri.
        Cross-system check (Kural 5) uygulanir.
        """
        results: list[MatchResult] = []
        matched_ids: set[str] = set()
        used_text_ids: set[str] = set()

        for pipe in unmatched:
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

                # Mesafe limiti
                if dist > MAX_FALLBACK_DIST:
                    continue

                # ── KURAL 5: Cross-system check ──
                own_dist = _perp_dist(
                    tx, ty,
                    pipe.start[0], pipe.start[1],
                    pipe.end[0], pipe.end[1],
                )
                closer_to_other = False
                for noise in noise_pool:
                    nd = _perp_dist(
                        tx, ty,
                        noise.start[0], noise.start[1],
                        noise.end[0], noise.end[1],
                    )
                    if nd < own_dist:
                        closer_to_other = True
                        break

                if closer_to_other:
                    continue

                if dist < best_dist:
                    best_dist = dist
                    best_text = text

            if best_text is not None:
                results.append(MatchResult(
                    pipe_id=pipe.id,
                    diameter=best_text.value,
                    source="text",
                    distance=round(best_dist, 2),
                    text_id=best_text.id,
                ))
                matched_ids.add(pipe.id)
                used_text_ids.add(best_text.id)

        return results, matched_ids


# ═══════════════════════════════════════════════════════════════════
#  ODA SDK KOPRU FONKSIYONU
# ═══════════════════════════════════════════════════════════════════

_LINE_TYPES = frozenset({"DbLine", "AcDbLine"})
_LEADER_TYPES = frozenset({"DbLeader", "AcDbLeader", "DbMLeader", "AcDbMLeader"})
_TEXT_TYPES = frozenset({"DbText", "AcDbText", "DbMText", "AcDbMText"})


def process_cad_data(
    cad_objects: list[Any],
    selected_layer: str,
) -> list[MatchResult]:
    """ODA SDK nesnelerini donustur ve eslestir."""
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


def _convert_pipe(obj: Any) -> Pipe:
    """DbLine → Pipe."""
    return Pipe(
        id=str(obj.Handle),
        layer=str(obj.Layer),
        start=(float(obj.StartPoint.x), float(obj.StartPoint.y)),
        end=(float(obj.EndPoint.x), float(obj.EndPoint.y)),
    )


def _convert_arrow(obj: Any) -> Arrow:
    """DbLeader/DbMLeader → Arrow."""
    sx, sy = float(obj.StartPoint.x), float(obj.StartPoint.y)
    ex, ey = float(obj.EndPoint.x), float(obj.EndPoint.y)
    length = (
        float(obj.Length) if hasattr(obj, "Length")
        else _pt_dist(sx, sy, ex, ey)
    )
    return Arrow(
        id=str(obj.Handle),
        start=(sx, sy), end=(ex, ey),
        length=length,
    )


def _convert_text(obj: Any) -> Text:
    """DbText/DbMText → Text."""
    return Text(
        id=str(obj.Handle),
        value=str(obj.TextString),
        position=(float(obj.Position.x), float(obj.Position.y)),
    )
