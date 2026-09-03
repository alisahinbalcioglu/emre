"""Cizim birimi OTOMATIK tespiti — bagimsiz beyanlarin KESISIMI.

NEDEN TEKRAR YAZILDI (tarihce):
  fe60357 (29 Mayis) otomatik tespiti SILDI. Gerekce hakliydi: eski kural
  "boru fizigi medyani" gibi SUREKLI bir sinyalden birim tahmin ediyordu ve
  ornekleme degisince 292x sapiyordu. Son cares $INSUNITS'ti.

TEMEL FIKIR — cizimin kendi YAZILI BEYANINI oku, tahmin etme:
  Turk/Avrupa CAD pratiginde antet ve anotasyon yazilari KAGIT milimetresine
  gore boyutlandirilir. Baginti kapali formdur:

      kagit_mm = model_birimi * u_mm / S          (S = plot olcegi paydasi)
  =>  u_mm     = kagit_mm * S / model_birimi

MIMARI KARAR — KESISIM, SHORT-CIRCUIT DEGIL:
  Hicbir tek beyan tekil sonuc vermez. OLCULDU: gercek dosyada (antet kisa
  kenari 841, "1/100") kapali form IKI aday uretir:
      P=841 -> 100.0 mm -> dm   (sapma %0.00)
      P=210 ->  24.97 mm -> inch (sapma %1.69 — 25.4'e yakin)
  Cakisma TESADUF DEGIL, YAPISAL: A-serisi paftalar sqrt(2) katlariyla dizili
  ve 100/25.4 = 3.937 ~ 841/210 = 4.005. Yani dm cizimlerde bu ikilik SISTEMATIK.

  Bu yuzden her kanit katmani bir ADAY KUMESI uretir ve kumeler KESISTIRILIR:
      antet {dm, inch} ∩ yazi {dm, ft} = {dm}      <- sprinklere HIC gerek yok
  Ilk tek-aday veren katmanda durmak (short-circuit) yanlisti: o tasarimda
  karar tek bir sprinkler regex'ine biniyordu ve sprinklersiz disiplinlerde
  (isitma, sihhi tesisat, dogalgaz) zincir $INSUNITS'e dusup 100x hata veriyordu.

FIZIK ELER, SECMEZ — VE ASLA HEPSINI ELEMEZ:
  Fizik vetosu (sprinkler araligi, cizim buyuklugu) yalnizca beyan kumesini
  DARALTIR. Vetodan sonra kume BOSALIRSA veri guvenilmez demektir: veto
  YOK SAYILIR ve guven dusurulur. Aksi halde veto "secici" hale gelir —
  silinen kuralin tam olarak dustugu tuzak.

GUVEN, KANITIN GUCUNE DEGIL CELISKININ YOKLUGUNA BAGLIDIR:
  Nihai cevap daha once bir ust katmanca ELENMIS bir birimse guven ZORUNLU
  "dusuk" olur ve kanit metni celiskiyi yazar.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

# metre / cizim birimi
STANDARD_UNITS: dict[str, float] = {
    "mm": 0.001,
    "cm": 0.01,
    "dm": 0.1,
    "m": 1.0,
    "inch": 0.0254,
    "ft": 0.3048,
}

# DXF $INSUNITS tam tablosu (eski kodda yalniz 1,2,4,5,6 vardi; 14=desimetre YOKTU)
INSUNITS_MAP: dict[int, tuple[float, str]] = {
    1: (0.0254, "inch"), 2: (0.3048, "ft"),
    4: (0.001, "mm"), 5: (0.01, "cm"), 6: (1.0, "m"),
    14: (0.1, "dm"),
}

# ISO 5457 pafta KISA kenarlari (mm). Uzatilmis paftalarda kisa kenar korunur.
# A4 (210) ve A5 (148) BILEREK YOK: tesisat paftasi bu boyutta cizilmez ve
# OLCULDU — 210, dm cizimlerde inch'e %1.69 sapmayla sahte aday uretiyordu
# (841*100/841=100 -> dm ile ayni anda 210*100/841=24.97 -> inch).
SHEET_SHORT_SIDES = (1189.0, 841.0, 594.0, 420.0, 297.0)

# Gecerli plot olcegi paydalari ("1/2\"" gibi boru olculeri disarida kalsin diye >=5)
PLOT_DENOMINATORS = (5, 10, 20, 25, 50, 100, 200, 250, 500, 1000)

# Kelime sinirli — "KASETLI" KASE'ye, "PENCERE-CERCEVE" CERCEVE'ye eslesmesin diye.
ANTET_PATTERN = re.compile(
    r"(?:^|[^A-Z0-9ÇĞİÖŞÜ])(?:ANTET|TITLE|TITLEBLOCK|TTLB|PAFTA|KASE|KAŞE|BORDER)"
    r"(?:$|[^A-Z0-9ÇĞİÖŞÜ])"
    r"|(?:^|[-_ ])(?:CERCEVE|ÇERÇEVE|FRAME)(?:$|[-_ ])",
    re.IGNORECASE,
)
SPRINKLER_PATTERN = re.compile(r"SPRINK|SPRA|YAGMURLAMA|YAĞMURLAMA", re.IGNORECASE)
SCALE_TEXT_PATTERN = re.compile(r"(?<![\d/.,])1\s*[/:]\s*(\d{1,4})(?![\d/])")
SCALE_WORD_PATTERN = re.compile(r"OLCEK|ÖLÇEK|OLÇEK|ÖLCEK|SCALE|MIKYAS|MİKYAS", re.IGNORECASE)
# "MIN. 1/100 EGIMLI", "TARIH: 1/10/2025", "PAFTA NO 1/200" olcek DEGILDIR.
SCALE_EXCLUDE_PATTERN = re.compile(
    r"EGIM|EĞIM|EGİM|EĞİM|MEYIL|MEYİL|SLOPE|TARIH|TARİH|DATE|"
    r"PAFTA\s*NO|SAYFA|SHEET\s*NO|REV|REVIZYON|REVİZYON|PROJE\s*NO",
    re.IGNORECASE,
)

# ── Fizik bantlari (VETO — secmez, eler) ─────────────────────────
SPRINKLER_SPACING_VETO_M = (1.2, 6.0)
SPRINKLER_SPACING_IDEAL_M = (2.0, 4.6)
BBOX_VETO_M = (3.0, 5000.0)
TEXT_PAPER_IDEAL_MM = (1.2, 6.0)

MIN_EDGES_FOR_BBOX_VETO = 20
MIN_SPRINKLERS_FOR_VETO = 8

SNAP_TOLERANCE = 0.02  # %2

# ISO 5457 uzatilmis paftalarda en fazla ~4x uzama olur (A0.4 = 841 x 3364).
MAX_SHEET_ASPECT = 4.5


@dataclass
class UnitDetection:
    scale: float                       # metre / cizim birimi
    unit_label: str
    confidence: str                    # kesin | yuksek | orta | dusuk
    method: str
    evidence: list[str] = field(default_factory=list)
    rejected: list[str] = field(default_factory=list)

    def reason(self) -> str:
        return " · ".join(self.evidence) if self.evidence else "kanit yok"


# ── Metin toplama (modelspace + BLOK ATTRIB'leri + paper space) ──

def _entity_text(e) -> str:
    """TEXT/MTEXT/ATTRIB icerigini guvenle oku.

    DIKKAT: ezdxf'te TEXT icin `.text` OZELLIGI YOKTUR (dogru yol `.dxf.text`).
    Bu AttributeError bir kez genis bir `except`e dusup olcek metnini SESSIZCE
    yok etmisti; erisim sirasi bilerek acik yazildi.
    """
    for getter in (lambda: e.dxf.text, lambda: e.plain_text(), lambda: e.text):
        try:
            v = getter()
        except Exception:
            continue
        if v is None:
            continue
        s = str(v).strip()
        if s:
            return s
    return ""


def _iter_texts(doc) -> list[tuple[str, str]]:
    """(layer, metin) listesi — modelspace, INSERT ATTRIB'leri ve paper space.

    ANTET GENELDE BLOKTUR: "ÖLÇEK", "PAFTA NO", "TARİH" birer ATTRIB'dir ve
    ATTRIB entity space'te DEGIL, INSERT'in alt-entity'sidir — msp.query("ATTRIB")
    HIC sonuc dondurmez. Bu yuzden INSERT'lerin .attribs koleksiyonu ayrica taranir.
    """
    out: list[tuple[str, str]] = []
    spaces = []
    try:
        spaces.append(doc.modelspace())
    except Exception:
        pass
    try:
        for lay in doc.layouts:
            if lay.name.lower() != "model":
                spaces.append(lay)
    except Exception:
        pass

    for sp in spaces:
        for et in ("TEXT", "MTEXT"):
            try:
                for e in sp.query(et):
                    s = _entity_text(e)
                    if s:
                        out.append((str(getattr(e.dxf, "layer", "") or ""), s))
            except Exception:
                continue
        try:
            for ins in sp.query("INSERT"):
                try:
                    lay = str(getattr(ins.dxf, "layer", "") or "")
                    for att in (ins.attribs or []):
                        s = _entity_text(att)
                        if s:
                            out.append((lay, s))
                except Exception:
                    continue
        except Exception:
            continue
    return out


def _collect_plot_scales(doc) -> list[tuple[int, str]]:
    """Cizimdeki "1/N" olcek beyanlarini topla.

    Elenenler: boru olculeri ("1/2\"" -> payda listesi disi), egim notlari
    ("MIN. 1/100 EGIMLI"), tarih ("1/10/2025"), pafta/proje numaralari.
    Sira: antet layer'indakiler ve ÖLÇEK kelimesiyle ayni metinde olanlar ONCE;
    esitlikte BUYUK payda once (ana plan olcegi, detay olcegi degil).
    """
    entries = _iter_texts(doc)
    scale_word_layers = {lay for lay, t in entries if SCALE_WORD_PATTERN.search(t)}

    strong: list[tuple[int, str]] = []
    weak: list[tuple[int, str]] = []
    for lay, t in entries:
        clean = t.replace("\\P", " ")
        if SCALE_EXCLUDE_PATTERN.search(clean):
            continue
        m = SCALE_TEXT_PATTERN.search(clean)
        if not m:
            continue
        try:
            den = int(m.group(1))
        except ValueError:
            continue
        if den not in PLOT_DENOMINATORS:
            continue
        near_word = bool(SCALE_WORD_PATTERN.search(clean)) or lay in scale_word_layers
        src = f"'1/{den}' metni (layer={lay or '?'}{', ÖLÇEK yazısıyla' if near_word else ''})"
        (strong if (ANTET_PATTERN.search(lay) or near_word) else weak).append((den, src))

    strong.sort(key=lambda kv: -kv[0])
    weak.sort(key=lambda kv: -kv[0])
    seen: set[int] = set()
    out: list[tuple[int, str]] = []
    for den, src in strong + weak:
        if den not in seen:
            seen.add(den)
            out.append((den, src))
    return out


# ── Antet adaylari ───────────────────────────────────────────────

def _bbox_of(points) -> list[float] | None:
    b = [math.inf, math.inf, -math.inf, -math.inf]
    n = 0
    for x, y in points:
        n += 1
        if x < b[0]: b[0] = x
        if x > b[2]: b[2] = x
        if y < b[1]: b[1] = y
        if y > b[3]: b[3] = y
    return b if n and math.isfinite(b[0]) else None


def _entity_points(e):
    try:
        t = e.dxftype()
        if t == "LINE":
            yield float(e.dxf.start.x), float(e.dxf.start.y)
            yield float(e.dxf.end.x), float(e.dxf.end.y)
        elif t == "LWPOLYLINE":
            for p in e.get_points(format="xy"):
                yield float(p[0]), float(p[1])
        elif t == "POLYLINE":
            for v in e.vertices:
                yield float(v.dxf.location.x), float(v.dxf.location.y)
    except Exception:
        return


def _antet_candidates(doc) -> list[tuple[float, float, str]]:
    """Antet olabilecek TUM dikdortgen adaylari: [(kisa, uzun, kaynak)].

    TEK kazanan secilmez: mimari altlikta "A-PENCERE-CERCEVE" gibi layer'lar
    da desene takilabilir ve en buyuk alanli kutu GERCEK anteti ezebilir.
    Her aday kapali forma sokulur, elenmesini kanit belirler.
    Antet blok icindeyse INSERT donusumu uygulanarak acilir.
    """
    out: list[tuple[float, float, str]] = []
    try:
        msp = doc.modelspace()
    except Exception:
        return out

    # 1) Dogrudan modelspace'te antet layer'lari
    boxes: dict[str, list[float]] = {}
    try:
        for e in msp.query("LINE LWPOLYLINE POLYLINE"):
            lay = str(getattr(e.dxf, "layer", "") or "")
            if not ANTET_PATTERN.search(lay):
                continue
            bb = _bbox_of(_entity_points(e))
            if not bb:
                continue
            b = boxes.setdefault(lay, [math.inf, math.inf, -math.inf, -math.inf])
            b[0] = min(b[0], bb[0]); b[1] = min(b[1], bb[1])
            b[2] = max(b[2], bb[2]); b[3] = max(b[3], bb[3])
    except Exception:
        pass
    for lay, b in boxes.items():
        w, h = b[2] - b[0], b[3] - b[1]
        if w > 0 and h > 0:
            out.append((min(w, h), max(w, h), f"layer '{lay}'"))

    # 2) Antet BLOK olarak yerlestirilmisse — INSERT donusumuyle ac
    try:
        for ins in msp.query("INSERT"):
            name = str(getattr(ins.dxf, "name", "") or "")
            lay = str(getattr(ins.dxf, "layer", "") or "")
            if not (ANTET_PATTERN.search(name) or ANTET_PATTERN.search(lay)):
                continue
            pts: list[tuple[float, float]] = []
            try:
                for ve in ins.virtual_entities():
                    pts.extend(_entity_points(ve))
            except Exception:
                continue
            bb = _bbox_of(pts)
            if not bb:
                continue
            w, h = bb[2] - bb[0], bb[3] - bb[1]
            if w > 0 and h > 0:
                out.append((min(w, h), max(w, h), f"blok '{name}'"))
    except Exception:
        pass

    # Buyukten kucuge — ayni olcudeki tekrarlari at
    out.sort(key=lambda t: -(t[0] * t[1]))
    uniq: list[tuple[float, float, str]] = []
    for short, long_, src in out:
        if any(abs(short - s) / max(s, 1e-9) < 0.01 for s, _, _ in uniq):
            continue
        uniq.append((short, long_, src))
    return uniq[:6]


def _viewport_anchors(doc) -> list[tuple[float, str]]:
    """Pafta viewport'undan model/kagit orani K. u_mm = S / K.

    Antet paper space'te ise (Turk pratiginde yaygin) Katman 1 hic calismaz;
    viewport orani o bosluktaki tek kapali form kaynagidir.
    """
    out: list[tuple[float, str]] = []
    try:
        for lay in doc.layouts:
            if lay.name.lower() == "model":
                continue
            for vp in lay.query("VIEWPORT"):
                try:
                    vh = float(getattr(vp.dxf, "view_height", 0) or 0)
                    h = float(getattr(vp.dxf, "height", 0) or 0)
                    if vh > 0 and h > 0:
                        out.append((vh / h, f"pafta '{lay.name}' viewport oranı {vh / h:.4g}"))
                except Exception:
                    continue
    except Exception:
        pass
    return out[:6]


def _modal_text_height(doc) -> tuple[float, int] | None:
    counts: dict[float, int] = {}
    try:
        msp = doc.modelspace()
    except Exception:
        return None
    for et in ("TEXT", "MTEXT"):
        try:
            for e in msp.query(et):
                try:
                    h = float(getattr(e.dxf, "height", 0)
                              or getattr(e.dxf, "char_height", 0) or 0)
                except Exception:
                    continue
                if h > 0:
                    k = round(h, 4)
                    counts[k] = counts.get(k, 0) + 1
        except Exception:
            continue
    if not counts:
        return None
    h, n = max(counts.items(), key=lambda kv: kv[1])
    return h, n


def _sprinkler_spacing(doc) -> tuple[float, int] | None:
    """Sprinkler sembollerinin en yakin komsu mesafesi medyani (cizim birimi).

    IKI SEMBOL BICIMI taninir — ikisi de GERCEK dosyada olculdu:
      - INSERT blok (M30: 338 x SPRA002)
      - CIRCLE, sprinkler-adli layer'da (PANOVA: 980 daire 'SPRİNK' layer'inda,
        blok YOK). Onceki surum yalniz INSERT'e bakiyordu; bu dosyada fizik
        vetosu HIC kosamadi ve zincir $INSUNITS yalanina ("mm") dustu — gercek
        birim cm'di, aralik 300 birim = 3.0 m yalniz cm ile mumkundu.
    Yaricap esigi BILEREK YOK: birim henuz bilinmedigi icin ham yaricap esigi
    anlamsizdir. Az sayida buyuk daire (tank/vana) medyani zaten kaydiramaz.

    UCUNCU BICIM (02.09, gercek proje, 743 sprinkler): sembol PATLATILMIS
    geometri — 'YNG SPRİNK PENDENT' katmaninda 2 LINE + 2 ELLIPSE + 1 HATCH;
    blok da daire de YOK, fizik vetosu yine HIC kosamiyordu. Sprinkler-adli
    katmanlarin tum cizim varliklari kumelenir (pipe_segments ile ayni
    kumeleme), kume = 1 sprinkler. Kumeleme SART: ayni yerdeki 5 parca ayri
    sayilirsa komsu mesafesi 0 cikar ve veto HER birimi eler. Kumelenen
    katmanin INSERT/CIRCLE'lari tekrar sayilmaz (cift sayim = mesafe 0).
    """
    pts: list[tuple[float, float]] = []
    try:
        msp = doc.modelspace()
        kumelenen: set[str] = set()
        for lay_obj in doc.layers:
            lay_name = str(getattr(lay_obj.dxf, "name", "") or "")
            if not SPRINKLER_PATTERN.search(lay_name):
                continue
            centers = _exploded_symbol_centers(doc, lay_name)
            if centers:
                pts.extend(centers)
                kumelenen.add(lay_name)
        for e in msp.query("INSERT"):
            try:
                lay = str(getattr(e.dxf, "layer", "") or "")
                nm = str(getattr(e.dxf, "name", "") or "")
                if lay in kumelenen:
                    continue
                if not (SPRINKLER_PATTERN.search(lay) or SPRINKLER_PATTERN.search(nm)):
                    continue
                pts.append((float(e.dxf.insert.x), float(e.dxf.insert.y)))
            except Exception:
                continue
        for e in msp.query("CIRCLE"):
            try:
                lay = str(getattr(e.dxf, "layer", "") or "")
                if lay in kumelenen:
                    continue
                if not SPRINKLER_PATTERN.search(lay):
                    continue
                pts.append((float(e.dxf.center.x), float(e.dxf.center.y)))
            except Exception:
                continue
    except Exception:
        return None
    if len(pts) < MIN_SPRINKLERS_FOR_VETO:
        return None
    nn_med = _nn_median(pts)
    if nn_med is None:
        return None
    return nn_med, len(pts)


def _nn_median(pts: list[tuple[float, float]]) -> float | None:
    """En yakin komsu mesafesi medyani (ilk 300 nokta ornegi, O(n^2))."""
    sample = pts[:300]
    nn: list[float] = []
    for i, (x1, y1) in enumerate(sample):
        best = math.inf
        for j, (x2, y2) in enumerate(sample):
            if i == j:
                continue
            d = math.hypot(x2 - x1, y2 - y1)
            if 1e-9 < d < best:
                best = d
        if math.isfinite(best):
            nn.append(best)
    if not nn:
        return None
    nn.sort()
    return nn[len(nn) // 2]


def _exploded_symbol_centers(doc, layer: str) -> list[tuple[float, float]]:
    """Sprinkler-adli bir katmandaki sembol KUME merkezleri; katman sembol
    katmani gibi davranmiyorsa BOS.

    Boru katmani da 'SPRINK' adini tasiyabilir ('3-SPRINK', 141 uzun LINE).
    Fizik filtresi: sembol, komsu araliginin ucte birinden buyuk olamaz
    (2r_medyan <= komsu_medyan/3); boru kumeleri bunu ihlal eder ve katman
    atlanir. Kume sayisi MIN_SPRINKLERS_FOR_VETO altindaysa da atlanir.
    """
    try:
        from pipe_segments import _sprinkler_symbols_from_layers
        syms = _sprinkler_symbols_from_layers(doc, sprinkler_layers=[layer], node_tol=1e-6)
    except Exception:
        return []
    if len(syms) < MIN_SPRINKLERS_FOR_VETO:
        return []
    pts = [(x, y) for x, y, _ in syms]
    nn_med = _nn_median(pts)
    if nn_med is None or nn_med <= 0:
        return []
    r_med = sorted(r for _, _, r in syms)[len(syms) // 2]
    if 2.0 * r_med > nn_med / 3.0:
        return []
    return pts


def _content_bbox(doc) -> tuple[float, int] | None:
    """Cizim ICERIGI kosegeni — ANTET layer'lari DISLANIR.

    Antet zaten Katman 1'de olculuyor; bbox'a dahil edilirse "binayi olctugumu
    saniyorum ama kagidi olcuyorum" hatasi olusur (silinen kuralin hatasi).
    """
    b = [math.inf, math.inf, -math.inf, -math.inf]
    n = 0
    try:
        msp = doc.modelspace()
    except Exception:
        return None
    for e in msp.query("LINE LWPOLYLINE"):
        try:
            if ANTET_PATTERN.search(str(getattr(e.dxf, "layer", "") or "")):
                continue
            cnt = 0
            for x, y in _entity_points(e):
                cnt += 1
                if x < b[0]: b[0] = x
                if x > b[2]: b[2] = x
                if y < b[1]: b[1] = y
                if y > b[3]: b[3] = y
            n += max(0, cnt - 1)
        except Exception:
            continue
    if not math.isfinite(b[0]):
        return None
    return math.hypot(b[2] - b[0], b[3] - b[1]), n


def _snap(u_mm: float) -> tuple[str, float] | None:
    if not math.isfinite(u_mm) or u_mm <= 0:
        return None
    best: tuple[str, float] | None = None
    best_err = SNAP_TOLERANCE
    for label, meters in STANDARD_UNITS.items():
        target = meters * 1000.0
        err = abs(u_mm - target) / target
        if err < best_err:
            best_err = err
            best = (label, meters)
    return best


# ── Aday ureticileri (hicbiri KARAR VERMEZ) ──────────────────────

def _by_primary_scale(scales, uret):
    """ANA PLAN olcegini once dene; sonuc verirse DETAY olcekleri karistirma.

    OLCULDU: bir paftada hem '1/100' plan hem '1/20' detay olcegi bulunmasi
    Turk projelerinde standarttir. Ikisini de esit aday saymak kombinatoryal
    belirsizlik uretiyordu (antet {dm} yerine {dm, cm} donuyordu). Antetteki
    ÖLÇEK alani paftanin ANA olcegini beyan eder; detay olcekleri kendi
    detaylarinin yanina yazilir. Bu yuzden once birincil payda kullanilir.
    `scales` zaten guclu->zayif, buyuk payda->kucuk payda sirali gelir.
    """
    for den, ssrc in scales:
        c, ev = uret(den, ssrc)
        if c:
            return c, ev
    return {}, []


def _antet_layer_candidates(doc, scales) -> tuple[dict[str, float], list[str], list[str]]:
    ev_rej: list[str] = []
    antets = _antet_candidates(doc)
    if not antets or not scales:
        return {}, [], ev_rej

    kutular: list[tuple[float, float, str]] = []
    for short, long_, src in antets:
        aspect = long_ / short if short > 0 else math.inf
        if aspect > MAX_SHEET_ASPECT:
            ev_rej.append(f"{src}: en-boy {aspect:.1f} — pafta değil (en fazla {MAX_SHEET_ASPECT})")
            continue
        kutular.append((short, long_, src))

    def uret(den, ssrc):
        c: dict[str, float] = {}
        e: list[str] = []
        for short, _long, src in kutular:
            for P in SHEET_SHORT_SIDES:
                snapped = _snap(P * den / short)
                if snapped is None:
                    continue
                lbl, meters = snapped
                c[lbl] = meters
                e.append(f"{src} kısa kenarı {short:.6g} birim = {P:.0f} mm pafta "
                         f"@ 1/{den} → {lbl} ({ssrc})")
        return c, e

    c, ev = _by_primary_scale(scales, uret)
    return c, ev, ev_rej


def _text_height_candidates(doc, scales) -> tuple[dict[str, float], list[str]]:
    th = _modal_text_height(doc)
    if not th or not scales:
        return {}, []
    h, n = th
    lo, hi = TEXT_PAPER_IDEAL_MM

    def uret(den, ssrc):
        c: dict[str, float] = {}
        e: list[str] = []
        for lbl, meters in STANDARD_UNITS.items():
            paper_mm = h * meters * 1000.0 / den
            if lo <= paper_mm <= hi:
                c[lbl] = meters
                e.append(f"en sık yazı yüksekliği {h:.6g} birim → kağıtta "
                         f"{paper_mm:.2f} mm @ 1/{den} ({n} yazı)")
        return c, e

    c, ev = _by_primary_scale(scales, uret)
    return c, ev


def _viewport_candidates(doc, scales) -> tuple[dict[str, float], list[str]]:
    cands: dict[str, float] = {}
    ev: list[str] = []
    vps = _viewport_anchors(doc)
    if not vps or not scales:
        return cands, ev
    for K, vsrc in vps:
        for den, ssrc in scales:
            snapped = _snap(den / K)
            if snapped is None:
                continue
            lbl, meters = snapped
            cands[lbl] = meters
            ev.append(f"{vsrc} @ 1/{den} → {lbl}")
    return cands, ev


def _physics_survivors(doc) -> tuple[dict[str, float], list[str], bool]:
    """Fiziksel olarak MUMKUN birimler. 3. donus: veto gercekten calisti mi."""
    sprk = _sprinkler_spacing(doc)
    bbox = _content_bbox(doc)
    if sprk is None and (bbox is None or bbox[1] < MIN_EDGES_FOR_BBOX_VETO):
        return dict(STANDARD_UNITS), [], False

    alive: dict[str, float] = {}
    rej: list[str] = []
    for lbl, meters in STANDARD_UNITS.items():
        if sprk is not None:
            spacing = sprk[0] * meters
            lo, hi = SPRINKLER_SPACING_VETO_M
            if not (lo <= spacing <= hi):
                rej.append(f"{lbl}: sprinkler aralığı {spacing:.2f} m olurdu "
                           f"({lo}-{hi} m dışı, {sprk[1]} sprinkler)")
                continue
        if bbox is not None and bbox[1] >= MIN_EDGES_FOR_BBOX_VETO:
            diag = bbox[0] * meters
            lo, hi = BBOX_VETO_M
            if not (lo <= diag <= hi):
                rej.append(f"{lbl}: çizim köşegeni {diag:.1f} m olurdu ({lo}-{hi} m dışı)")
                continue
        alive[lbl] = meters
    return alive, rej, True


# ── Ana giris ────────────────────────────────────────────────────

def detect_unit(doc) -> UnitDetection:
    """Cizim birimini tespit et. Cikti daima METRE carpani.

    Akis: bagimsiz BEYAN kumeleri kesistirilir -> fizik DARALTIR (asla
    bosaltmaz) -> hala coklu ise $INSUNITS yalniz kume ICINDEYSE daraltir.
    """
    evidence: list[str] = []
    rejected: list[str] = []

    scales = _collect_plot_scales(doc)
    antet_c, antet_ev, antet_rej = _antet_layer_candidates(doc, scales)
    text_c, text_ev = _text_height_candidates(doc, scales)
    vp_c, vp_ev = _viewport_candidates(doc, scales)
    phys, phys_rej, phys_active = _physics_survivors(doc)
    rejected.extend(antet_rej)

    # ── 1) BAGIMSIZ BEYANLARI KESISTIR ───────────────────────────
    # Ad'lar ASCII slug: `method` alani makine tarafindan okunur ve testlerde
    # muhurlenir; insan-okunur aciklama `evidence` icinde durur.
    beyanlar = [
        ("antet", antet_c, antet_ev),
        ("yazi", text_c, text_ev),
        ("viewport", vp_c, vp_ev),
    ]
    dolu = [(ad, c, ev) for ad, c, ev in beyanlar if c]

    kesisim: dict[str, float] = {}
    kullanilan: list[str] = []
    for ad, c, ev in dolu:
        if not kesisim:
            kesisim = dict(c)
            kullanilan = [ad]
            evidence.extend(ev[:2])
            continue
        ortak = {k: v for k, v in kesisim.items() if k in c}
        if ortak:
            kesisim = ortak
            kullanilan.append(ad)
            evidence.extend(ev[:1])
        else:
            rejected.append(f"{ad} beyanı diğerleriyle kesişmedi ({sorted(c)} vs {sorted(kesisim)})")

    for ad, c, _ in dolu:
        if len(c) > 1:
            rejected.append(f"{ad} tek başına {len(c)} aday bıraktı: {sorted(c)}")

    # ── 2) FIZIK DARALTIR — ama ASLA BOSALTMAZ ───────────────────
    elenenler: set[str] = set()
    if kesisim:
        if phys_active:
            daraltilmis = {k: v for k, v in kesisim.items() if k in phys}
            if daraltilmis:
                if len(daraltilmis) < len(kesisim):
                    elenenler |= set(kesisim) - set(daraltilmis)
                    rejected.extend(r for r in phys_rej
                                    if any(r.startswith(f"{k}:") for k in elenenler))
                kesisim = daraltilmis
            else:
                # Veto TUM beyan adaylarini sildi -> veri guvenilmez, veto yok say
                rejected.append(
                    "fizik vetosu beyan adaylarının HEPSİNİ eledi — veto yok sayıldı "
                    f"(beyan: {sorted(kesisim)}); sprinkler/geometri verisi güvenilmez")
                evidence.append("UYARI: fizik kontrolü çizimin beyanıyla çelişiyor")

        if len(kesisim) == 1:
            lbl, meters = next(iter(kesisim.items()))
            # "kesin" YALNIZ birbirinden BAGIMSIZ iki beyan ayni cevapta bulusursa.
            # Tek beyan + fizik "kesin" DEGILDIR: fizik alan varsayimi tasir.
            kesin = len(kullanilan) >= 2
            evidence.insert(0, f"1 birim = {meters * 1000:g} mm — "
                               + " ∩ ".join(kullanilan)
                               + (" ∩ fizik" if phys_active else ""))
            return UnitDetection(meters, lbl, "kesin" if kesin else "yuksek",
                                 "+".join(kullanilan), evidence, rejected)

    # ── 3) FIZIK TEK ADAY BIRAKTIYSA o kazanir ───────────────────
    # SIRALAMA KRITIK: bu kontrol $INSUNITS'ten ONCE gelir. Fizik tekillestirdiyse
    # onunla CELISEN bir header'a donmek, olculmus gercegi beyana feda etmektir.
    iu = _insunits(doc)
    havuz = kesisim if kesisim else (phys if phys_active else dict(STANDARD_UNITS))

    if len(havuz) == 1:
        lbl, meters = next(iter(havuz.items()))
        kaynak = "+".join(kullanilan) if kullanilan else "fizik"
        if kullanilan:
            evidence.insert(0, f"1 birim = {meters * 1000:g} mm — {kaynak}")
        else:
            evidence.insert(0, f"Fizik kontrolü tek olanaklı birim bıraktı: {lbl}")
        rejected.extend(phys_rej[:6])
        if iu and iu[1] != lbl:
            evidence.append(f"NOT: $INSUNITS={iu[1]} diyordu ancak çizimin ölçülen "
                            f"gerçekliğiyle çelişiyor — beyan/fizik tercih edildi")
        return UnitDetection(meters, lbl, "yuksek", kaynak, evidence, rejected)

    # ── 4) $INSUNITS — YALNIZ hayatta kalan kume ICINDE daraltir ──
    if iu and iu[1] in havuz:
        meters, lbl = iu
        celiski = lbl in elenenler
        aciklama = ("ÇELİŞKİLİ: üst katman bu adayı elemişti" if celiski
                    else f"kalan {len(havuz)} aday arasından seçildi")
        evidence.insert(0, f"$INSUNITS={lbl} — {aciklama}")
        return UnitDetection(meters, lbl, "dusuk" if celiski else "orta",
                             "insunits+kesisim", evidence, rejected)

    if iu and iu[1] in STANDARD_UNITS:
        meters, lbl = iu
        # Header, hayatta kalan hicbir adayla uyusmuyor -> guvenilmez
        evidence.insert(0, f"$INSUNITS={lbl} ancak çizimin kendi beyanıyla ÇELİŞİYOR "
                           f"(beyan/fizik: {sorted(havuz)}) — birim doğrulanamadı")
        return UnitDetection(meters, lbl, "dusuk", "insunits-celiskili", evidence, rejected)

    # ── 5) Kanit yok — UYDURMA ───────────────────────────────────
    evidence.insert(0, "Çizimde birim kanıtı bulunamadı (antet/ölçek/yazı/$INSUNITS) — mm varsayıldı")
    return UnitDetection(0.001, "mm", "dusuk", "varsayilan", evidence, rejected)


def _insunits(doc) -> tuple[float, str] | None:
    try:
        code = int(doc.header.get("$INSUNITS", 0) or 0)
    except Exception:
        return None
    if code in INSUNITS_MAP:
        meters, label = INSUNITS_MAP[code]
        return meters, label
    return None
