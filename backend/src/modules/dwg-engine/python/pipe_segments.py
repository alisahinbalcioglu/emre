"""
pipe_segments.py — DXF boru topology'sinden pipe-run segment'leri uretir.

Her segment = bir pipe-run (iki junction/terminal/sprinkler arasi). Bu sayede
ana hat ve her dal ayri segment olur, frontend'de tek tek isaretlenebilir ve
metraj tablosuna girer.

AI yok — saf geometri + graph topology. (Daha onceki AI cap atama 3-pass
algoritmasi devre disi birakildi — Render free tier gateway timeout sebebiyle).
"""

import math
import re
import weakref
from typing import TypedDict


# ── Tolerance ve sabitler ─────────────────────────────────────────

# Endpoint eslestirme tolerans DEFAULT'lari — `_compute_tolerances` runtime'da
# edge length median'ina gore dinamik hesaplar, proje-bagimsiz calisir.
_NODE_TOL = 1.0
_SPRINKLER_TOL = 10.0

# Sembol parcasi OLMAYAN varlik tipleri: konum tasimazlar ya da yazi/olcu olarak
# sembolun merkezini kaydirirlar. Geri kalan HER SEY (LINE, ARC, ELLIPSE, HATCH,
# SPLINE, LWPOLYLINE, INSERT, CIRCLE, POINT, SOLID...) isaretli sprinkler
# katmaninda sembol parcasidir — bkz. _sprinkler_symbols_from_layers.
_SYMBOL_SKIP_TYPES = frozenset({
    "TEXT", "MTEXT", "DIMENSION", "LEADER", "MLEADER", "MULTILEADER",
    "ATTDEF", "ATTRIB", "VIEWPORT", "IMAGE", "WIPEOUT", "XLINE", "RAY",
    "TOLERANCE", "ACAD_TABLE", "TABLE",
})
# Secili boru katmaninda bu tipler BORUDUR, asla sembol degil (ayni-katman kurali).
_PIPE_TYPES = frozenset({"LINE", "LWPOLYLINE", "POLYLINE"})
# Boyut kapilari BIRIMDEN BAGIMSIZDIR (kullanici birimi yanlis secmis olabilir):
#  - varlik/kume kosegeni, kendi katmanindaki MEDYANIN bu katini asarsa sembol
#    degildir (sembol katmanina yanlislikla cizilmis boru, buyuk tarama vb.)
_SYMBOL_MAX_MEDIAN_FACTOR = 3.0
#  - ve boru aginin p5-p95 kosegeninin bu oranini asamaz (ikinci emniyet)
_SYMBOL_MAX_NETWORK_FRACTION = 0.10
#  - blok ornegi (INSERT) icin ag orani daha genis: kapsama dairesi iceren
#    sprinkler blogu kucuk bir agda %10'u asar; kat/plan buyuklugunde blok ise
#    yine elenir
_INSERT_MAX_NETWORK_FRACTION = 0.5
# Ic ice blok acma: sprinkler'lar bir ust blogun ICINDE olabilir (grup blogu,
# kat blogu, bilesik sembol). Goruntuleyici bloklari acip gosterir; motor da
# acar — aksi halde kullanici sembolu gorur, motor gormez (sessiz sifir).
_INSERT_MAX_DEPTH = 8            # ic ice derinlik siniri (dongu/asiri yuva korumasi)
_INSERT_EXPAND_BUDGET = 300_000  # acilan toplam varlik siniri (patolojik dosya korumasi)
_GROUP_MIN_NESTED = 3            # bu kadar nested INSERT iceren blok GRUPTUR (Block-to-Line)

# Sprinkler tespit regex — block name bu pattern'i iceren INSERT'ler sprinkler sayilir
_SPRINKLER_RE = re.compile(
    r'spr(?:ink)?|upright|pendant|sidewall|fire.?head|yağmur',
    re.IGNORECASE,
)


class Segment(TypedDict, total=False):
    id: int
    layer: str
    x1: float
    y1: float
    x2: float
    y2: float
    length: float
    polyline: list[list[float]]  # opsiyonel — chain'in sirali vertex'leri


# ── Tolerance hesaplama ──────────────────────────────────────────

def _node_key(x: float, y: float, tol: float = _NODE_TOL) -> tuple[float, float]:
    """Koordinatlari toleransa gore quantize et (endpoint matching icin)."""
    return (round(x / tol) * tol, round(y / tol) * tol)


def _compute_tolerances(
    edges: list[dict],
    unit_scale: float = 0.001,
) -> tuple[float, float]:
    """Tolerance hesabi — PRD epsilon=5cm hedefli, scale + bbox cift-koruma.

    Iki kaynaktan tolerance hesaplanir, daha kucugu (daha sert) kullanilir:

    1. SCALE-BASED: PRD 5cm world-unit cinsinden (unit_scale carpani ile).
       - mm proje (scale=0.001) -> 50 world units
       - cm proje (scale=0.01)  -> 5 world units
       - m proje  (scale=1.0)   -> 0.05 world units

    2. BBOX-BASED: Cizimin bounding box'inin %0.05 (yarim binde). 50m projede ~2.5cm.
       Kullanici unit'i yanlis sectiyse scale-based tolerance 10x kayar; bbox-based
       koruma yanlis pozitif veya negatif tespiti engeller.

    Sprinkler: 5x daha gevsek (sprinkler block typical 5-25cm uzaklikta).

    Genel kullanim: scale parametresi dogruysa scale-based win; yanlissa bbox-based.
    """
    epsilon_scale = 0.05 / max(unit_scale, 1e-9)
    sprinkler_scale = 0.25 / max(unit_scale, 1e-9)

    if not edges:
        return max(_NODE_TOL, epsilon_scale), max(_SPRINKLER_TOL, sprinkler_scale)

    # Bbox-based fallback (scale-independent)
    xs: list[float] = []
    ys: list[float] = []
    for e in edges:
        xs.append(e["x1"]); xs.append(e["x2"])
        ys.append(e["y1"]); ys.append(e["y2"])
    bbox_diag = math.hypot(max(xs) - min(xs), max(ys) - min(ys)) if xs else 0.0
    # %0.05 of diagonal — 50m cizimde ~2.5cm; 10m'de 0.5cm; 100m'de 5cm
    bbox_node_tol = bbox_diag * 0.0005
    bbox_sprinkler_tol = bbox_diag * 0.0025  # 5x daha gevsek

    # Final: scale-based ile bbox-based'in MIN'i (daha sert olan).
    # Eger scale yanlissa scale-based aci derece buyur; bbox-based onu sinirlar.
    # Eger scale dogru ise zaten ikisi yakin olur, fark etmez.
    # Alt sinir 1.0 (yuvarlama hatasi koruma) + maksimum 2x bbox (sertlik).
    node_tol = max(1.0, min(epsilon_scale, bbox_node_tol * 2.0))
    sprinkler_tol = max(5.0, min(sprinkler_scale, bbox_sprinkler_tol * 2.0))

    # ── KENAR-UZUNLUGU KELEPCESI (birimden BAGIMSIZ) ─────────────
    # OLCULEN SORUN: birim yanlis secilirse node_tol siser ve kisa kenarlari
    # yutar. Gercek bir yangin projesinde (M30, 458 boru kenari) olculdu:
    #   cm varsayimi -> node_tol 5.0 birim -> 629 dugumun 96'si (%15.3) SAHTE
    #   KAYNAK (gercekte 0.48 m'ye kadar ayri noktalar tek dugume kaynakliyor)
    #   -> chain'ler capraz atliyor -> kullanicinin gordugu "cizgilerde yamulma".
    #   dogru birim (dm) -> node_tol 1.0 -> %0.27.
    # Kelepce: node_tol, kenarlarin 10. yuzdeliginin %40'ini GECEMEZ. Boylece
    # birim yanlis olsa bile snap toleransi gercek kenarlardan kucuk kalir.
    # Gercekten degen borularin uclari zaten CAKISIKTIR; tolerans yalnizca
    # mikro-bosluklar icindir, bu yuzden kucultmek baglantiyi koparmaz.
    lengths = sorted(
        math.hypot(e["x2"] - e["x1"], e["y2"] - e["y1"]) for e in edges
    )
    lengths = [L for L in lengths if L > 0]
    if len(lengths) >= 20:
        p10 = lengths[int(len(lengths) * 0.10)]
        cap = p10 * 0.4
        if cap > 0:
            node_tol = min(node_tol, cap)
            sprinkler_tol = min(sprinkler_tol, cap * 5.0)

    return node_tol, sprinkler_tol


# ── Sprinkler sembol tespiti (isaretli katman: HERHANGI geometri) ──
#
# OLCULDU (02.09, gercek proje, `3-SPRINK` boru katmani, 743 sprinkler):
# sembol blok DEGIL — `YNG SPRİNK PENDENT` katmaninda 2 LINE (capraz) +
# 2 ELLIPSE + 1 HATCH olarak cizilmis. Eski tanima yalniz INSERT / kucuk
# CIRCLE / POINT'e bakiyordu ("LINE asla sprinkler degil"); katman isaretlense
# bile SIFIR merkez -> "T noktalarinda bol" sprinkler'da hic bolmuyordu.
#
# Kural: isaretli katmandaki her cizim varligi sembol PARCASIDIR. Parcalar
# bbox kesisimiyle kumelenir (capraz + elips + tarama = 1 kume), kumenin
# merkezi sprinkler konumu, yari-kosegeni sembolun yaricapidir. Boru kumenin
# icinden geciyorsa (merkez -> boru dik mesafesi <= yaricap + node_tol) boru
# o noktadan bolunur. Hicbir esik birim varsayimi tasimaz.


def _entity_bbox(ent) -> tuple[float, float, float, float] | None:
    """Varligin 2B bbox'u (minx, miny, maxx, maxy). Sik tiplerde hizli yol;
    ARC/ELLIPSE/HATCH/SPLINE/INSERT/SOLID vb. icin ezdxf.bbox."""
    try:
        etype = ent.dxftype()
        if etype == "LINE":
            s, e = ent.dxf.start, ent.dxf.end
            return (min(s.x, e.x), min(s.y, e.y), max(s.x, e.x), max(s.y, e.y))
        if etype == "CIRCLE":
            c, r = ent.dxf.center, abs(float(ent.dxf.radius))
            return (c.x - r, c.y - r, c.x + r, c.y + r)
        if etype == "POINT":
            p = ent.dxf.location
            return (float(p.x), float(p.y), float(p.x), float(p.y))
        if etype == "LWPOLYLINE":
            pts = [(float(p[0]), float(p[1])) for p in ent.get_points(format="xy")]
            if not pts:
                return None
            return (min(p[0] for p in pts), min(p[1] for p in pts),
                    max(p[0] for p in pts), max(p[1] for p in pts))
        from ezdxf import bbox as _ezbbox
        ext = _ezbbox.extents([ent], fast=True)
        if not ext.has_data:
            return None
        return (float(ext.extmin.x), float(ext.extmin.y),
                float(ext.extmax.x), float(ext.extmax.y))
    except Exception:
        return None


def _block_index(doc) -> dict[str, tuple[frozenset[str], int]]:
    """Blok adi -> (icinde IC ICE kullanilan katmanlar, dogrudan nested INSERT
    sayisi). Katman '0' oldugu gibi tutulur: AutoCAD kuraliyla ust INSERT'in
    katmanini alir, karar kullanim yerinde verilir. Dongu korumali."""
    direct: dict[str, tuple[set[str], set[str], int]] = {}
    for blk in doc.blocks:
        name = str(blk.name)
        if name.startswith("*Model_Space") or name.startswith("*Paper_Space"):
            continue
        layers: set[str] = set()
        children: set[str] = set()
        n_ins = 0
        for e in blk:
            try:
                layers.add(str(e.dxf.layer))
                if e.dxftype() == "INSERT":
                    n_ins += 1
                    children.add(str(e.dxf.name or ""))
            except Exception:
                continue
        direct[name] = (layers, children, n_ins)

    memo: dict[str, frozenset[str]] = {}

    def deep(name: str, stack: frozenset[str]) -> frozenset[str]:
        if name in memo:
            return memo[name]
        if name not in direct or name in stack:
            return frozenset()
        layers, children, _ = direct[name]
        acc = set(layers)
        for ch in children:
            acc |= deep(ch, stack | {name})
        memo[name] = frozenset(acc)
        return memo[name]

    return {name: (deep(name, frozenset()), direct[name][2]) for name in direct}


# Dokuman basina onbellek: blok yerel bbox'lari. Ayni DXF icin ard arda gelen
# cagrilar (isaretli/isaretsiz cikarim, aday tarama, birim tespiti) yeniden
# hesaplamaz. WeakKey: dokuman serbest kalinca kayit da gider.
_DOC_CACHE: "weakref.WeakKeyDictionary" = weakref.WeakKeyDictionary()


def _doc_cache(doc) -> dict:
    try:
        c = _DOC_CACHE.get(doc)
        if c is None:
            c = {}
            _DOC_CACHE[doc] = c
        return c
    except TypeError:
        return {}


_BBOX_SKIP_TYPES = frozenset({"TEXT", "MTEXT", "ATTDEF", "ATTRIB"})


def _transform_bbox(bb: tuple[float, float, float, float], M) -> tuple[float, float, float, float]:
    """Yerel bbox'un 4 kosesini M (ezdxf Matrix44) ile dunyaya tasi, kutusunu
    al. Dondurulmus blokta biraz genis kalir — guvenli taraf."""
    xs: list[float] = []
    ys: list[float] = []
    for lx, ly in ((bb[0], bb[1]), (bb[2], bb[1]), (bb[2], bb[3]), (bb[0], bb[3])):
        w = M.transform((lx, ly, 0.0))
        xs.append(float(w.x))
        ys.append(float(w.y))
    return (min(xs), min(ys), max(xs), max(ys))


def _block_locals(doc, name: str, memo: dict) -> tuple[tuple, tuple]:
    """Blok taniminin YEREL icerigi — blok adi basina BIR kez (memo):
      prims:   ((etype, layer, yerel_bbox), ...)  yazi tipleri ve bbox'suzlar yok
      inserts: ((ad, layer, M_yerel), ...)        nested blok referanslari

    Sanal varlik (virtual_entities) KOPYASI YOK. OLCULDU (3. gercek aile):
    lejant bloklarinin 83'er nested INSERT'i her acilista kopyalaniyordu,
    toplama 12 sn, aday tarama 9 sn. Icerik bir kez okunur, her referansta
    yalniz matris bilesimi yapilir. Nested'in dunya matrisi: M_yerel @ M_ust.
    """
    key = ("locals", name)
    if key in memo:
        return memo[key]
    prims: list[tuple] = []
    inserts: list[tuple] = []
    try:
        blk = doc.blocks.get(name)
    except Exception:
        blk = None
    if blk is not None:
        for e in blk:
            try:
                etype = e.dxftype()
                layer = str(e.dxf.layer)
                if etype == "INSERT":
                    inserts.append((str(e.dxf.name or ""), layer, e.matrix44()))
                    continue
                if etype in _BBOX_SKIP_TYPES:
                    continue
                bb = _entity_bbox(e)
                if bb is not None:
                    prims.append((etype, layer, bb))
            except Exception:
                continue
    memo[key] = (tuple(prims), tuple(inserts))
    return memo[key]


def _block_local_bbox(doc, name: str, memo: dict, stack: frozenset = frozenset()):
    """Blok taniminin YEREL bbox'u — blok adi basina BIR kez (memo). Nested
    INSERT icin nested blogun memo'lu bbox'unun kose donusumu alinir.

    NEDEN: ezdxf.bbox.extents her referansta icerigi yeniden acar. OLCULDU
    (3. gercek aile): 8 lejant blogu x 83 nested INSERT = 24.6 sn/dosya, ve bu
    her cagrida tekrarlaniyordu. Bu yol toplam varlik sayisiyla orantilidir.
    Yazi tipleri disarida: sembol boyutunu sisirir, geometri degildir."""
    key = ("bbox", name)
    if key in memo:
        return memo[key]
    if name in stack:
        return None  # dongusel referans
    prims, inserts = _block_locals(doc, name, memo)
    xs: list[float] = []
    ys: list[float] = []
    for _, _, bb in prims:
        xs.extend((bb[0], bb[2]))
        ys.extend((bb[1], bb[3]))
    for sname, _, M_local in inserts:
        sub = _block_local_bbox(doc, sname, memo, stack | {name})
        if sub is None:
            continue
        tb = _transform_bbox(sub, M_local)
        xs.extend((tb[0], tb[2]))
        ys.extend((tb[1], tb[3]))
    res = (min(xs), min(ys), max(xs), max(ys)) if xs else None
    memo[key] = res
    return res


def _insert_world_bbox(doc, name: str, M, memo: dict) -> tuple[float, float, float, float] | None:
    """INSERT'in dunya bbox'u: blok yerel bbox'u (ad basina BIR kez) + ekleme
    matrisi M ile kose donusumu."""
    lb = _block_local_bbox(doc, name, memo)
    return _transform_bbox(lb, M) if lb is not None else None


def _merge_colocated_symbols(
    syms: list[tuple],
) -> list[tuple[float, float, float]]:
    """Daireleri kesisen (mesafe <= r1 + r2) semboller AYNI sprinkler'dir.

    Bilesik blok (govde + nested ok) acildiginda govde serbest kume, ok
    yaprak blok olur: ayni yerde iki sembol = iki bolme = sprinkler basina
    sahte mikro parca. Komsu sprinkler'lar birlesmez: blok yaricapi komsu
    araliginin ceyregiyle kelepceli, serbest kume yari-kosegeni de
    araliktan kucuk — toplamlari araliga ulasmaz.

    Girdi (x, y, r) ya da (x, y, r, tur); tur 'kume' (serbest parca kumesi)
    ya da 'blok'. IKI 'kume' BIRLESMEZ: serbest parcalar zaten bbox
    kesisimiyle gruplandi; daire kesisimi daha gevsek oldugu icin komsu
    semboller zincirlenebilirdi. Birlestirme kume<->blok (bilesik/ikiz) ve
    blok<->blok (ust uste kopya) icindir. Birlesik merkez: grupta 'kume'
    varsa yalniz onlarin ortalamasi (govde = kafa; ok/etiket bloklari
    merkezi kaydirmasin), yoksa hepsinin ortalamasi. Donus daima (x, y, r)."""
    n = len(syms)
    if n < 2:
        return [(float(p[0]), float(p[1]), float(p[2])) for p in syms]
    rmax = max(p[2] for p in syms)
    cs = max(rmax * 2.0, 1.0)
    grid: dict[tuple[int, int], list[int]] = {}
    for i, p in enumerate(syms):
        grid.setdefault((int(p[0] // cs), int(p[1] // cs)), []).append(i)
    parent = list(range(n))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i, p in enumerate(syms):
        x, y, r = p[0], p[1], p[2]
        kx, ky = int(x // cs), int(y // cs)
        for cx in (kx - 1, kx, kx + 1):
            for cy in (ky - 1, ky, ky + 1):
                for j in grid.get((cx, cy), ()):
                    if j <= i:
                        continue
                    if (len(p) > 3 and p[3] == "kume"
                            and len(syms[j]) > 3 and syms[j][3] == "kume"):
                        continue  # kume-kume: bbox kumelemesi karar verdi
                    x2, y2, r2 = syms[j][0], syms[j][1], syms[j][2]
                    if math.hypot(x2 - x, y2 - y) <= r + r2:
                        ra, rb = find(i), find(j)
                        if ra != rb:
                            parent[rb] = ra
    groups: dict[int, list[int]] = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)
    out: list[tuple[float, float, float]] = []
    for members in groups.values():
        if len(members) == 1:
            p = syms[members[0]]
            out.append((float(p[0]), float(p[1]), float(p[2])))
            continue
        merkez = [i for i in members if len(syms[i]) > 3 and syms[i][3] == "kume"] or members
        cx = sum(syms[i][0] for i in merkez) / len(merkez)
        cy = sum(syms[i][1] for i in merkez) / len(merkez)
        r = max(syms[i][2] + math.hypot(syms[i][0] - cx, syms[i][1] - cy) for i in members)
        out.append((cx, cy, r))
    return out


def _network_bbox(edges: list[dict]) -> tuple[float, float, float, float] | None:
    """Boru aginin (tum uclar) kutusu, kosegenin %5'i kadar genis. Agdan
    uzak bloklar (lejant, antet, detay) sembol OLAMAZ: bbox'u bu kutuyla
    kesismeyen INSERT'ler acilmaz — ic ice yuruyus maliyeti sinirlanir."""
    if not edges:
        return None
    xs = [v for e in edges for v in (e["x1"], e["x2"])]
    ys = [v for e in edges for v in (e["y1"], e["y2"])]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    m = math.hypot(x1 - x0, y1 - y0) * 0.05
    return (x0 - m, y0 - m, x1 + m, y1 + m)


def _bbox_disjoint(a: tuple[float, float, float, float],
                   b: tuple[float, float, float, float]) -> bool:
    return a[2] < b[0] or b[2] < a[0] or a[3] < b[1] or b[3] < a[1]


def _network_diag(edges: list[dict]) -> float:
    """Boru aginin p5-p95 koordinat kosegeni — antet/detay gibi uc degerlere
    dayanikli olcek gostergesi. Birim varsayimi ICERMEZ."""
    xs = sorted(v for e in edges for v in (e["x1"], e["x2"]))
    ys = sorted(v for e in edges for v in (e["y1"], e["y2"]))
    if not xs:
        return 0.0
    n = len(xs)
    lo = int(n * 0.05)
    hi = min(n - 1, max(lo + 1, int(n * 0.95)))  # tek kenarda bile 0 donmez
    return math.hypot(xs[hi] - xs[lo], ys[hi] - ys[lo])


def _cluster_bboxes(
    items: list[tuple[float, float, float, float]],
    eps: float,
) -> list[list[int]]:
    """bbox'lari eps kadar genisletip kesisenleri birlestir (grid + union-find).
    Donus: kume listesi; her kume item indeksleri."""
    n = len(items)
    parent = list(range(n))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    diags = sorted(math.hypot(b[2] - b[0], b[3] - b[1]) for b in items)
    typical = diags[len(diags) // 2] if diags else 1.0
    cs = max(typical * 2.0, eps * 4.0, 1.0)
    grid: dict[tuple[int, int], list[int]] = {}
    for i, (x0, y0, x1, y1) in enumerate(items):
        for cx in range(int((x0 - eps) // cs), int((x1 + eps) // cs) + 1):
            for cy in range(int((y0 - eps) // cs), int((y1 + eps) // cs) + 1):
                grid.setdefault((cx, cy), []).append(i)
    for cell in grid.values():
        for a in range(len(cell)):
            i = cell[a]
            ax0, ay0, ax1, ay1 = items[i]
            for b in range(a + 1, len(cell)):
                j = cell[b]
                bx0, by0, bx1, by1 = items[j]
                if (ax0 - eps <= bx1 and bx0 - eps <= ax1
                        and ay0 - eps <= by1 and by0 - eps <= ay1):
                    ra, rb = find(i), find(j)
                    if ra != rb:
                        parent[rb] = ra
    groups: dict[int, list[int]] = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)
    return list(groups.values())


def _sprinkler_symbols_from_layers(
    doc,
    sprinkler_layers: list[str] | None = None,
    pipe_layers: set[str] | None = None,
    node_tol: float = _NODE_TOL,
    sprinkler_block_names: set[str] | None = None,
    network_diag: float | None = None,
    network_bbox: tuple[float, float, float, float] | None = None,
) -> list[tuple[float, float, float]]:
    """Isaretli katmanlardaki sprinkler sembollerini (cx, cy, r) olarak dondur.

    Kaynaklar:
      1) sprinkler_layers: o katmanlardaki HER cizim varligi sembol parcasi
         (yazi/olcu tipleri haric: _SYMBOL_SKIP_TYPES). Secili boru
         katmaninin LINE/POLYLINE'lari borudur, sembol DEGIL (pipe_layers).
      2) sprinkler_block_names: katman farketmeksizin, adi bu kumede olan
         INSERT'ler (geriye uyumluluk).

    Kumeleme (serbest parcalar): bbox'lar node_tol kadar genisletilip
    kesisenler birlestirilir; kume merkezi = bbox merkezi, r = yari-kosegen.

    INSERT (blok ornegi) TEK BASINA semboldur, komsularla ASLA birlesmez:
    OLCULDU (3. gercek aile, 906 blok) — blok icinde kapsama dairesi vardi,
    bbox'lar komsuya biniyordu, kesisim kumelemesi 906'sini tek dev kumeye
    zincirleyip boyut kapisinda kaybediyordu (0 sembol). Merkez = ekleme
    noktasi (cizerin capasi); yaricap = blok yari-kosegeni, ama ust duzey
    bloklar arasi komsu araliginin CEYREGINI asamaz (kapsama dairesi 2 m
    otedeki baska hatti "iceriden geciyor" saydirmasin).

    IC ICE BLOK: kendisi YA DA icerigi isaretli katmanda olan INSERT ele
    alinir (kapsayici blok isaretsiz bir katmanda olabilir). Kucuk ve YAPRAK
    (nested INSERT yok) blok atomik semboldur — icerigi patlatilmaz. Nested
    INSERT iceren blok: kosegeni bilesik esiginin (ust duzey komsu araliginin
    yarisi; yoksa ag kosegeninin %10'u) altindaysa BILESIK semboldur (govde +
    ok + etiket) ve atomiktir; ustundeyse GRUPTUR, ici acilir. Agdan buyuk
    blok KAT'tir, ici acilir. Acilan icerik matris bilesimiyle dunyaya
    tasinir (sanal kopya yok). Katman-'0' icerik ust INSERT'in katmanini alir.
    network_bbox verilirse agla kesismeyen bloklar hic ele alinmaz.
    Acilan bilesik parcalar _merge_colocated_symbols ile tek sprinkler olur.

    Boyut kapilari (birimsiz): varlik kosegeni katman medyaninin 3 katini,
    kume kosegeni kume medyaninin 3 katini asarsa sembol sayilmaz; network_diag
    verilmisse (boru aginin p5-p95 kosegeni) ikisi de onun %10'unu, blok
    ornegi ise %50'sini asamaz. Boylece sembol katmanina yanlislikla cizilmis
    boru ne sembol olur ne de ustunden gectigi sembolleri kumeye yutar.
    """
    layer_set: set[str] = set(sprinkler_layers or ())
    block_set: set[str] = set(sprinkler_block_names or ())
    pipe_set: set[str] = set(pipe_layers or ())
    if not layer_set and not block_set:
        return []
    size_cap = (network_diag * _SYMBOL_MAX_NETWORK_FRACTION
                if network_diag is not None and network_diag > 0 else None)
    insert_cap = (network_diag * _INSERT_MAX_NETWORK_FRACTION
                  if network_diag is not None and network_diag > 0 else None)

    items: list[tuple[float, float, float, float]] = []
    inserts: list[tuple[float, float, float]] = []  # (x, y, r_bbox)
    bidx = _block_index(doc)
    memo = _doc_cache(doc)
    budget = [_INSERT_EXPAND_BUDGET]
    msp = doc.modelspace()

    def ilgili(name: str, eff: str) -> tuple[bool, bool, frozenset[str], int]:
        """(kendisi isaretli, icerigi isaretli, ic katmanlar, nested INSERT sayisi)."""
        marked = eff in layer_set or (bool(block_set) and name in block_set)
        inner_layers, n_nested = bidx.get(name, (frozenset(), 0))
        content = bool(inner_layers & layer_set) or ("0" in inner_layers and marked)
        return marked, content, inner_layers, n_nested

    def anchor(M) -> tuple[float, float]:
        w = M.transform((0.0, 0.0, 0.0))  # blok orijini = ekleme noktasi
        return float(w.x), float(w.y)

    def diag(bb: tuple[float, float, float, float]) -> float:
        return math.hypot(bb[2] - bb[0], bb[3] - bb[1])

    # 1. GECIS — ust duzey ilgili kucuk bloklarin anchor'lari: komsu araligi
    # bilesik/grup esigini (nn/2) ve blok yaricap kelepcesini (nn/4) verir.
    top_anchors: list[tuple[float, float]] = []
    for ent in msp.query("INSERT"):
        try:
            name0, own0, M0 = str(ent.dxf.name or ""), str(ent.dxf.layer), ent.matrix44()
        except Exception:
            continue
        marked0, content0, _, _ = ilgili(name0, own0)
        if not (marked0 or content0):
            continue
        bb0 = _insert_world_bbox(doc, name0, M0, memo)
        if bb0 is None or (network_bbox is not None and _bbox_disjoint(bb0, network_bbox)):
            continue
        if insert_cap is not None and diag(bb0) > insert_cap:
            continue
        top_anchors.append(anchor(M0))
    nn_top = _nn_median_xy(top_anchors) if len(top_anchors) >= 3 else None
    composite_cap: float | None = (
        nn_top / 2.0 if nn_top
        else (network_diag * _SYMBOL_MAX_NETWORK_FRACTION
              if network_diag is not None and network_diag > 0 else None)
    )

    def part(etype: str, eff_layer: str, bb_fn) -> None:
        """Serbest sembol parcasi — ust duzey ya da acilmis blok icinden."""
        if eff_layer not in layer_set or etype in _SYMBOL_SKIP_TYPES:
            return
        if eff_layer in pipe_set and etype in _PIPE_TYPES:
            return  # ayni-katman kurali: boru cizgisi sembol degil
        bb = bb_fn()
        if bb is not None:
            items.append(bb)

    def insert(name: str, own: str, M, parent_layer: str | None, depth: int) -> None:
        # AutoCAD kurali: blok icindeki katman-'0' varlik ust INSERT'in katmanini alir
        eff = parent_layer if (own == "0" and parent_layer is not None) else own
        marked, content_marked, _inner, n_nested = ilgili(name, eff)
        if not marked and not content_marked:
            return  # ne kendisi ne icerigi isaretli — dokunma
        bb = _insert_world_bbox(doc, name, M, memo)
        if bb is not None and network_bbox is not None and _bbox_disjoint(bb, network_bbox):
            return  # agdan uzak (lejant/antet/detay) — sembol olamaz, acmaya deger degil
        d = diag(bb) if bb is not None else 0.0
        too_big = insert_cap is not None and d > insert_cap
        if bb is not None and not too_big:
            # Kucuk blok: YAPRAK ise atomik (icerigi patlatilmaz). Nested INSERT
            # iceriyorsa boyut karar verir: bilesik esiginin altinda BILESIK
            # sembol (atomik), ustunde GRUP (acilir). Esik bilinmiyorsa sayi.
            if n_nested == 0:
                atomic = True
            elif composite_cap is not None:
                atomic = d <= composite_cap
            else:
                atomic = n_nested < _GROUP_MIN_NESTED
            if atomic:
                ax, ay = anchor(M)
                inserts.append((ax, ay, d / 2.0))
                return
        if depth >= _INSERT_MAX_DEPTH or budget[0] <= 0:
            return
        prims, subs = _block_locals(doc, name, memo)
        budget[0] -= len(prims) + len(subs)
        for etype, layer, lbb in prims:
            part(etype, eff if layer == "0" else layer, lambda lbb=lbb: _transform_bbox(lbb, M))
        for sname, slayer, M_local in subs:
            insert(sname, slayer, M_local @ M, eff, depth + 1)

    for ent in msp:
        try:
            etype = ent.dxftype()
            layer = str(ent.dxf.layer)
        except Exception:
            continue
        if etype == "INSERT":
            try:
                M = ent.matrix44()
                name = str(ent.dxf.name or "")
            except Exception:
                continue
            insert(name, layer, M, None, 0)
        else:
            part(etype, layer, lambda ent=ent: _entity_bbox(ent))

    def _kapi(kosegenler: list[float]) -> float:
        med = sorted(kosegenler)[len(kosegenler) // 2]
        cap = max(med * _SYMBOL_MAX_MEDIAN_FACTOR, node_tol)
        if size_cap is not None and size_cap > 0:
            cap = min(cap, size_cap)
        return cap

    out: list[tuple] = []  # (x, y, r, tur) — tur: 'blok' | 'kume'
    if inserts:
        # Yaricap kelepcesi komsu araligindan: once UST DUZEY atomik bloklar
        # (grup icindeki yapraklar birbirine yakin olabilir), yoksa hepsi.
        r_cap: float | None = None
        base = top_anchors if len(top_anchors) >= 3 else [(x, y) for x, y, _ in inserts]
        if len(base) >= 3:
            nn = _nn_median_xy(base)
            if nn is not None and nn > 0:
                r_cap = nn / 4.0
        out.extend((x, y, min(r, r_cap) if r_cap is not None else r, "blok")
                   for x, y, r in inserts)
    if not items:
        return _merge_colocated_symbols(out)

    ent_diag = [math.hypot(b[2] - b[0], b[3] - b[1]) for b in items]
    ent_cap = _kapi(ent_diag)
    items = [b for b, d in zip(items, ent_diag) if d <= ent_cap]
    if not items:
        return _merge_colocated_symbols(out)

    boxes: list[tuple[float, float, float, float, float]] = []
    for members in _cluster_bboxes(items, eps=max(node_tol, 1e-9)):
        x0 = min(items[i][0] for i in members)
        y0 = min(items[i][1] for i in members)
        x1 = max(items[i][2] for i in members)
        y1 = max(items[i][3] for i in members)
        boxes.append((x0, y0, x1, y1, math.hypot(x1 - x0, y1 - y0)))
    cl_cap = _kapi([b[4] for b in boxes])
    out.extend(((x0 + x1) / 2.0, (y0 + y1) / 2.0, d / 2.0, "kume")
               for x0, y0, x1, y1, d in boxes if d <= cl_cap)
    return _merge_colocated_symbols(out)


def _nn_median_xy(pts: list[tuple[float, float]]) -> float | None:
    """Noktalarin en yakin komsu mesafesi medyani (ilk 400 nokta ornegi).
    Blok sembollerinin yaricapini ve bilesik/grup esigini komsu araligina
    gore kelepcelemek icin."""
    sample = pts[:400]
    if len(sample) < 2:
        return None
    nn: list[float] = []
    for i, (x1, y1) in enumerate(sample):
        best = math.inf
        for j, (x2, y2) in enumerate(sample):
            if i != j:
                d = math.hypot(x2 - x1, y2 - y1)
                if 1e-9 < d < best:
                    best = d
        if math.isfinite(best):
            nn.append(best)
    if not nn:
        return None
    nn.sort()
    return nn[len(nn) // 2]


def _sprinkler_centers_from_layers(
    doc,
    sprinkler_layers: list[str] | None = None,
    sprinkler_block_names: set[str] | None = None,
    pipe_layers: set[str] | None = None,
    node_tol: float = _NODE_TOL,
    network_diag: float | None = None,
) -> list[tuple[float, float]]:
    """Sembol kume merkezleri (cx, cy) — _sprinkler_symbols_from_layers'in
    yaricapsiz gorunumu (geriye uyumlu)."""
    return [(x, y) for x, y, _ in _sprinkler_symbols_from_layers(
        doc, sprinkler_layers=sprinkler_layers, pipe_layers=pipe_layers,
        node_tol=node_tol, sprinkler_block_names=sprinkler_block_names,
        network_diag=network_diag,
    )]


def _regex_sprinkler_centers(doc) -> list[tuple[float, float]]:
    """Hic katman/blok isaretlenmediyse: blok adi _SPRINKLER_RE ile eslesen
    INSERT'lerin ekleme noktalari (eski fallback, aynen korunur)."""
    centers: list[tuple[float, float]] = []
    for ins in doc.modelspace().query('INSERT'):
        try:
            if not _SPRINKLER_RE.search(str(ins.dxf.name or '')):
                continue
            centers.append((float(ins.dxf.insert.x), float(ins.dxf.insert.y)))
        except Exception:
            continue
    return centers


def _node_keys_near_points(
    graph: dict[tuple[float, float], list[int]],
    pts: list[tuple[float, float, float]],
    node_tol: float,
    sprinkler_tol: float,
) -> set[tuple[float, float]]:
    """Sembol merkezine R = max(sprinkler_tol, r + node_tol) icindeki graf
    dugumleri. Bu dugumler run AYIRICI olur: sprinkler tam bir vertex
    ustundeyse (iki LINE uc uca) bolme gerekmez ama run orada KIRILMALI.
    Grid-bucketed; eski "aura doldurma" gibi tolerans oranina gore sismez."""
    if not graph or not pts:
        return set()
    rmax = max(max(sprinkler_tol, r + node_tol) for _, _, r in pts)
    cs = max(rmax, node_tol, 1.0)
    grid: dict[tuple[int, int], list[tuple[float, float]]] = {}
    for key in graph:
        grid.setdefault((int(key[0] // cs), int(key[1] // cs)), []).append(key)
    out: set[tuple[float, float]] = set()
    for x, y, r in pts:
        R = max(sprinkler_tol, r + node_tol)
        R2 = R * R
        kx, ky = int(x // cs), int(y // cs)
        span = int(R // cs) + 1
        for cx in range(kx - span, kx + span + 1):
            for cy in range(ky - span, ky + span + 1):
                for key in grid.get((cx, cy), ()):
                    if (key[0] - x) ** 2 + (key[1] - y) ** 2 <= R2:
                        out.add(key)
    return out


# ── Edge toplama ve splitting ────────────────────────────────────

def _collect_raw_edges(msp, layer_set: set[str]) -> list[dict]:
    """Tum LINE + LWPOLYLINE + POLYLINE edge'lerini toplar (vertex-level).

    PER-ENTITY TOLERANCE: ezdxf bazi bozuk entity'lerde attribute access'te
    DXFValueError atiyor. Tum try'ler kapsayici — layer access dahil her sey
    icinde, bozuk entity atlanip kalan dosya parse edilebilsin diye.
    """
    edges: list[dict] = []
    for ent in msp.query('LINE'):
        try:
            layer = ent.dxf.layer
            if layer not in layer_set:
                continue
            x1, y1 = float(ent.dxf.start.x), float(ent.dxf.start.y)
            x2, y2 = float(ent.dxf.end.x), float(ent.dxf.end.y)
        except Exception:
            continue
        length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
        if length < 1.0:
            continue
        edges.append({"layer": layer, "x1": x1, "y1": y1, "x2": x2, "y2": y2, "length": length})

    for ent in msp.query('LWPOLYLINE'):
        try:
            layer = ent.dxf.layer
            if layer not in layer_set:
                continue
            pts = [(float(p[0]), float(p[1])) for p in ent.get_points(format='xy')]
            closed = bool(getattr(ent, "closed", False))
        except Exception:
            continue
        if len(pts) < 2:
            continue
        for i in range(len(pts) - 1):
            x1, y1 = pts[i]
            x2, y2 = pts[i + 1]
            length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            if length < 1.0:
                continue
            edges.append({"layer": layer, "x1": x1, "y1": y1, "x2": x2, "y2": y2, "length": length})
        if closed and len(pts) > 2:
            x1, y1 = pts[-1]
            x2, y2 = pts[0]
            length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            if length >= 1.0:
                edges.append({"layer": layer, "x1": x1, "y1": y1, "x2": x2, "y2": y2, "length": length})

    for ent in msp.query('POLYLINE'):
        try:
            layer = ent.dxf.layer
            if layer not in layer_set:
                continue
            pts = [(float(v.dxf.location.x), float(v.dxf.location.y)) for v in ent.vertices]
        except Exception:
            continue
        for i in range(len(pts) - 1):
            x1, y1 = pts[i]
            x2, y2 = pts[i + 1]
            length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            if length < 1.0:
                continue
            edges.append({"layer": layer, "x1": x1, "y1": y1, "x2": x2, "y2": y2, "length": length})

    return edges


def _build_node_graph(
    edges: list[dict],
    node_tol: float = _NODE_TOL,
) -> dict[tuple[float, float], list[int]]:
    """Endpoint koordinatlarini node olarak quantize et, her node'da hangi edge'ler var."""
    graph: dict[tuple[float, float], list[int]] = {}
    for i, e in enumerate(edges):
        k1 = _node_key(e["x1"], e["y1"], node_tol)
        k2 = _node_key(e["x2"], e["y2"], node_tol)
        graph.setdefault(k1, []).append(i)
        graph.setdefault(k2, []).append(i)
    return graph


def _split_edges_on_intersections(
    edges: list[dict],
    node_tol: float,
) -> list[dict]:
    """LINE ortasina baska LINE'in endpoint'i degiyorsa (virtual tee), LINE'i
    o noktadan bolmek icin yeni edge listesi dondur.

    Amac: `_group_into_runs` sadece endpoint-koincident tee'leri ayirt eder;
    ancak tesisatta cogu T-baglanti ana hatta LINE ortasinda olur (endpoint
    ortaya degdiriyor). Bu routine o durumlari `node_tol` esiginde yakalar.
    """
    if not edges:
        return edges

    nodes: dict[tuple[float, float], tuple[float, float]] = {}
    for e in edges:
        for x, y in ((e["x1"], e["y1"]), (e["x2"], e["y2"])):
            nk = _node_key(x, y, node_tol)
            nodes.setdefault(nk, (x, y))

    cs = max(node_tol * 20.0, 1.0)
    cell: dict[tuple[int, int], list[tuple[float, float]]] = {}
    for nk, (nx, ny) in nodes.items():
        ck = (int(nx // cs), int(ny // cs))
        cell.setdefault(ck, []).append(nk)

    splits: dict[int, list[tuple[float, float, float]]] = {}
    for i, e in enumerate(edges):
        x1, y1, x2, y2 = e["x1"], e["y1"], e["x2"], e["y2"]
        dx, dy = x2 - x1, y2 - y1
        L = e["length"]
        if L < max(3.0 * node_tol, 3.0):
            continue
        k_start = _node_key(x1, y1, node_tol)
        k_end = _node_key(x2, y2, node_tol)
        # BBOX'a node_tol kadar genislet — yakin (mikro bosluk) node'lar
        # ayri cell'e dustugu icin kacirilmasin. Onceki bug: tolerance
        # eklenmemis, 3mm yakin node yatay LINE'in cell range'i disinda kaliyor.
        min_cx = int((min(x1, x2) - node_tol) // cs)
        max_cx = int((max(x1, x2) + node_tol) // cs)
        min_cy = int((min(y1, y2) - node_tol) // cs)
        max_cy = int((max(y1, y2) + node_tol) // cs)
        L2 = L * L
        for cx in range(min_cx, max_cx + 1):
            for cy in range(min_cy, max_cy + 1):
                for nk in cell.get((cx, cy), ()):
                    if nk == k_start or nk == k_end:
                        continue
                    nx, ny = nodes[nk]
                    t = ((nx - x1) * dx + (ny - y1) * dy) / L2
                    if t <= 0.001 or t >= 0.999:
                        continue
                    px = x1 + t * dx
                    py = y1 + t * dy
                    if math.hypot(nx - px, ny - py) > node_tol:
                        continue
                    splits.setdefault(i, []).append((nx, ny, t))

    if not splits:
        return edges

    new_edges: list[dict] = []
    for i, e in enumerate(edges):
        if i not in splits:
            new_edges.append(e)
            continue
        sp = sorted(splits[i], key=lambda v: v[2])
        prev_x, prev_y = e["x1"], e["y1"]
        layer = e["layer"]
        for nx, ny, _ in sp:
            seg_len = math.hypot(nx - prev_x, ny - prev_y)
            if seg_len >= 1.0:
                new_edges.append({"layer": layer, "x1": prev_x, "y1": prev_y,
                                  "x2": nx, "y2": ny, "length": seg_len})
            prev_x, prev_y = nx, ny
        seg_len = math.hypot(e["x2"] - prev_x, e["y2"] - prev_y)
        if seg_len >= 1.0:
            new_edges.append({"layer": layer, "x1": prev_x, "y1": prev_y,
                              "x2": e["x2"], "y2": e["y2"], "length": seg_len})

    return new_edges


def _split_edges_on_crossings(
    edges: list[dict],
    node_tol: float,
) -> list[dict]:
    """Iki LINE'in birbirini ortasindan kesistiği (proper crossing) durumlar
    icin gercek geometric intersection bul ve her iki LINE'i kesisim
    noktasinda bol.

    Mevcut `_split_edges_on_intersections` SADECE endpoint-on-line durumunu
    yakalar (bir LINE'in endpoint'i digerinin ortasina degiyor). Ama:
      - Iki LINE klasik '+' seklinde kesisiyorsa (hicbiri endpoint degil)
      - Bir LINE digerini gecip overshoot yapiyorsa
      - LINE'lar arasi mikro bosluk varsa (gap < tolerance)
    bunlar yakalanmaz. Bu fonksiyon yakalar.

    Algoritma: O(N) grid spatial + O(K) pair check (K = ortalama komsu).
    Her LINE icin bbox cell'lerini tara, ayni cell'deki diger LINE'larla
    pair-wise crossing kontrolu yap.

    Crossing kosulu:
      - Iki LINE paralel degil (det != 0)
      - Intersection parametreleri t, u her ikisi de [tol_param, 1-tol_param]
        araliginda (yani her iki LINE'in da IC bolgesinde kesisiyor)
      - tol_param = node_tol / line_length (relative tolerance)

    PRD section 2.1 'Snap & Split': mikro bosluk + overshoot durumlarini bu
    fonksiyon halleder. Endpoint-on-line ise zaten oncesinde calistirilmis.
    """
    if not edges or len(edges) < 2:
        return edges

    # Grid spatial index — her edge'in bbox'unu cell'lere yerlestir
    cs = max(node_tol * 50.0, 10.0)
    cell_to_edges: dict[tuple[int, int], list[int]] = {}
    edge_bbox: list[tuple[float, float, float, float]] = []
    for i, e in enumerate(edges):
        x1, y1, x2, y2 = e["x1"], e["y1"], e["x2"], e["y2"]
        mnx, mxx = min(x1, x2), max(x1, x2)
        mny, mxy = min(y1, y2), max(y1, y2)
        edge_bbox.append((mnx, mny, mxx, mxy))
        c_min_x = int(mnx // cs)
        c_max_x = int(mxx // cs)
        c_min_y = int(mny // cs)
        c_max_y = int(mxy // cs)
        for cx in range(c_min_x, c_max_x + 1):
            for cy in range(c_min_y, c_max_y + 1):
                cell_to_edges.setdefault((cx, cy), []).append(i)

    # Her edge'in komsularini bul, pair-wise crossing kontrol
    checked: set[tuple[int, int]] = set()
    splits: dict[int, list[tuple[float, float, float]]] = {}

    for i, e in enumerate(edges):
        x1, y1, x2, y2 = e["x1"], e["y1"], e["x2"], e["y2"]
        mnx_i, mny_i, mxx_i, mxy_i = edge_bbox[i]
        c_min_x = int(mnx_i // cs)
        c_max_x = int(mxx_i // cs)
        c_min_y = int(mny_i // cs)
        c_max_y = int(mxy_i // cs)

        neighbors: set[int] = set()
        for cx in range(c_min_x, c_max_x + 1):
            for cy in range(c_min_y, c_max_y + 1):
                for j in cell_to_edges.get((cx, cy), ()):
                    if j != i:
                        neighbors.add(j)

        for j in neighbors:
            pair = (i, j) if i < j else (j, i)
            if pair in checked:
                continue
            checked.add(pair)

            # bbox overlap kontrolu (hizli filtre)
            mnx_j, mny_j, mxx_j, mxy_j = edge_bbox[j]
            if mxx_i < mnx_j - node_tol or mxx_j < mnx_i - node_tol:
                continue
            if mxy_i < mny_j - node_tol or mxy_j < mny_i - node_tol:
                continue

            ej = edges[j]
            x3, y3, x4, y4 = ej["x1"], ej["y1"], ej["x2"], ej["y2"]

            # Iki LINE parametrik kesisim
            # P_i(t) = (x1,y1) + t * ((x2,y2) - (x1,y1)), t in [0,1]
            # P_j(u) = (x3,y3) + u * ((x4,y4) - (x3,y3)), u in [0,1]
            dx_i, dy_i = x2 - x1, y2 - y1
            dx_j, dy_j = x4 - x3, y4 - y3
            denom = dx_i * dy_j - dy_i * dx_j
            if abs(denom) < 1e-9:
                continue  # paralel veya kesiniti hata payinda

            # Cramer
            t = ((x3 - x1) * dy_j - (y3 - y1) * dx_j) / denom
            u = ((x3 - x1) * dy_i - (y3 - y1) * dx_i) / denom

            # Her iki LINE da IC bolgesinde kesisiyor mu?
            # Relative tolerance: node_tol / line_length
            L_i = e["length"]
            L_j = ej["length"]
            tol_t = max(0.001, node_tol / L_i if L_i > 0 else 0.001)
            tol_u = max(0.001, node_tol / L_j if L_j > 0 else 0.001)

            # IC bolge: endpoint'lere cok yakin degil (zaten endpoint-on-line ile yakalanmis)
            if t <= tol_t or t >= 1 - tol_t:
                continue
            if u <= tol_u or u >= 1 - tol_u:
                continue

            # Intersection point
            ix = x1 + t * dx_i
            iy = y1 + t * dy_i

            # Her iki edge icin split point ekle
            splits.setdefault(i, []).append((ix, iy, t))
            splits.setdefault(j, []).append((ix, iy, u))

    if not splits:
        return edges

    # Yeniden bol — _split_edges_on_intersections ile ayni pattern
    new_edges: list[dict] = []
    for i, e in enumerate(edges):
        if i not in splits:
            new_edges.append(e)
            continue
        sp = sorted(splits[i], key=lambda v: v[2])
        prev_x, prev_y = e["x1"], e["y1"]
        layer = e["layer"]
        for nx, ny, _ in sp:
            seg_len = math.hypot(nx - prev_x, ny - prev_y)
            if seg_len >= 1.0:
                new_edges.append({"layer": layer, "x1": prev_x, "y1": prev_y,
                                  "x2": nx, "y2": ny, "length": seg_len})
            prev_x, prev_y = nx, ny
        seg_len = math.hypot(e["x2"] - prev_x, e["y2"] - prev_y)
        if seg_len >= 1.0:
            new_edges.append({"layer": layer, "x1": prev_x, "y1": prev_y,
                              "x2": e["x2"], "y2": e["y2"], "length": seg_len})

    return new_edges


def _split_edges_on_points(
    edges: list[dict],
    points: list[tuple],
    radius: float,
) -> tuple[list[dict], list[tuple[float, float]]]:
    """Her noktayi en yakin kenara dik izdusur; mesafe etkin yaricap icinde ve
    izdusum kenarin IC bolgesindeyse kenar o noktadan bolunur.

    points: (cx, cy) ya da (cx, cy, r). Etkin yaricap = max(radius, r) —
    r sembolun yari-kosegeni (+ node_tol) oldugunda kural "boru sembolun
    icinden geciyor" olur ve birim/olcek varsayimindan bagimsiz calisir.
    Grid-bucketed: binlerce sembol x on binlerce kenar O(P*E) patlamaz.

    Donus: (yeni edge listesi, fiilen bolunen izdusum noktalari).
    """
    if not edges or not points:
        return edges, []

    pts = [(float(p[0]), float(p[1]), max(radius, float(p[2])) if len(p) > 2 else radius)
           for p in points]
    rmax = max(p[2] for p in pts)
    cs = max(rmax * 2.0, 10.0)
    cell_to_edges: dict[tuple[int, int], list[int]] = {}
    for i, e in enumerate(edges):
        mnx, mxx = min(e["x1"], e["x2"]), max(e["x1"], e["x2"])
        mny, mxy = min(e["y1"], e["y2"]), max(e["y1"], e["y2"])
        for cx in range(int((mnx - rmax) // cs), int((mxx + rmax) // cs) + 1):
            for cy in range(int((mny - rmax) // cs), int((mxy + rmax) // cs) + 1):
                cell_to_edges.setdefault((cx, cy), []).append(i)

    splits: dict[int, list[tuple[float, float, float]]] = {}
    split_positions: list[tuple[float, float]] = []
    for cx, cy, R in pts:
        best: tuple[int, float, float, float, float] | None = None
        for i in cell_to_edges.get((int(cx // cs), int(cy // cs)), ()):
            e = edges[i]
            x1, y1, x2, y2 = e["x1"], e["y1"], e["x2"], e["y2"]
            dx, dy = x2 - x1, y2 - y1
            L2 = dx * dx + dy * dy
            if L2 < 1.0:
                continue
            t = ((cx - x1) * dx + (cy - y1) * dy) / L2
            if t <= 0.001 or t >= 0.999:
                continue
            px = x1 + t * dx
            py = y1 + t * dy
            d = math.hypot(cx - px, cy - py)
            if d > R:
                continue
            if best is None or d < best[4]:
                best = (i, px, py, t, d)
        if best is not None:
            splits.setdefault(best[0], []).append((best[1], best[2], best[3]))
            split_positions.append((best[1], best[2]))

    if not splits:
        return edges, split_positions

    new_edges: list[dict] = []
    for i, e in enumerate(edges):
        if i not in splits:
            new_edges.append(e)
            continue
        sp = sorted(splits[i], key=lambda v: v[2])
        prev_x, prev_y = e["x1"], e["y1"]
        layer = e["layer"]
        for nx, ny, _ in sp:
            sl = math.hypot(nx - prev_x, ny - prev_y)
            if sl >= 1.0:
                new_edges.append({"layer": layer, "x1": prev_x, "y1": prev_y,
                                  "x2": nx, "y2": ny, "length": sl})
            prev_x, prev_y = nx, ny
        sl = math.hypot(e["x2"] - prev_x, e["y2"] - prev_y)
        if sl >= 1.0:
            new_edges.append({"layer": layer, "x1": prev_x, "y1": prev_y,
                              "x2": e["x2"], "y2": e["y2"], "length": sl})
    return new_edges, split_positions


# ── Block-to-Line parcalama (insertion point split) ─────────────

def _median_edge_length(edges: list[dict]) -> float:
    lens = sorted(e["length"] for e in edges if e.get("length", 0) > 0)
    return lens[len(lens) // 2] if lens else 0.0


def _collect_all_insert_points(
    doc,
    network_bbox: tuple[float, float, float, float] | None = None,
    group_min_diag: float | None = None,
) -> list[tuple[float, float]]:
    """TUM INSERT'lerin insertion point'lerini topla — blok ADI, SEKLI ve
    LAYER'i ONEMSIZ. Blogun icindeki geometri tamamen yoksayilir.

    Degismez kural (PRD): sprinkler/ekipman blogu cizimde her zaman borunun
    TAM USTUNE eklenir. Cizer blogu istedigi isimle/sekille cizebilir; tek
    guvenilir sinyal insertion point'in cizgi guzergahinda olmasidir.

    IC ICE: GRUP bloklari acilir, icindeki kafa bloklarinin dunya-koordinat
    ekleme noktalari da boruyu boler (matris bilesimi, sanal kopya yok).
    Grup = nested INSERT var VE (group_min_diag verilmisse) blok kosegeni bu
    esikten buyuk; esik yoksa >= _GROUP_MIN_NESTED. Bilesik sembol blogu
    (govde + ok + etiket, kosegen ~50) grup DEGILDIR ve acilmaz: okun ekleme
    noktasi boru ustune duserse sprinkler basina ikinci bolme (sahte parca)
    cikardi. Esik: boru kenar medyaninin ceyregi (birimsiz).
    """
    pts: list[tuple[float, float]] = []
    bidx = _block_index(doc)
    budget = [_INSERT_EXPAND_BUDGET]
    memo = _doc_cache(doc)

    def walk(name: str, M, depth: int) -> None:
        try:
            w = M.transform((0.0, 0.0, 0.0))
            pts.append((float(w.x), float(w.y)))
        except Exception:
            return
        _, n_nested = bidx.get(name, (frozenset(), 0))
        if n_nested == 0 or depth >= _INSERT_MAX_DEPTH or budget[0] <= 0:
            return
        if group_min_diag is None and n_nested < _GROUP_MIN_NESTED:
            return  # boyut esigi yok: sayi kurali (1-2 parcali blok = bilesik sembol)
        if network_bbox is not None or group_min_diag is not None:
            bb = _insert_world_bbox(doc, name, M, memo)
            if bb is not None and network_bbox is not None and _bbox_disjoint(bb, network_bbox):
                return  # agdan uzak grup (lejant) — icini gezmeye deger degil
            if (bb is not None and group_min_diag is not None
                    and math.hypot(bb[2] - bb[0], bb[3] - bb[1]) <= group_min_diag):
                return  # kucuk blok = bilesik sembol, grup degil
        _, subs = _block_locals(doc, name, memo)
        budget[0] -= len(subs)
        for sname, _, M_local in subs:
            walk(sname, M_local @ M, depth + 1)

    for ent in doc.modelspace().query('INSERT'):
        try:
            walk(str(ent.dxf.name or ""), ent.matrix44(), 0)
        except Exception:
            continue
    return pts


def _drop_points_near_symbols(
    points: list[tuple[float, float]],
    symbols: list[tuple[float, float, float]],
    node_tol: float,
) -> list[tuple[float, float]]:
    """Isaretli bir sembolun yaricapi icindeki INSERT ekleme noktalari AYNI
    sprinkler'dir — Block-to-Line onlari ikinci kez bolmesin. Bilesik blok
    (govde + ok) acildiginda sembol merkezi ekleme noktasindan birkac birim
    kayabilir; iki mekanizma iki ayri noktada bolerse sprinkler basina sahte
    mikro parca cikar. Bir sprinkler = bir bolme."""
    if not points or not symbols:
        return points
    rmax = max(r for _, _, r in symbols) + node_tol
    cs = max(rmax, 1.0)
    grid: dict[tuple[int, int], list[tuple[float, float, float]]] = {}
    for x, y, r in symbols:
        grid.setdefault((int(x // cs), int(y // cs)), []).append((x, y, r + node_tol))
    kept: list[tuple[float, float]] = []
    for px, py in points:
        kx, ky = int(px // cs), int(py // cs)
        near = False
        for cx in (kx - 1, kx, kx + 1):
            if near:
                break
            for cy in (ky - 1, ky, ky + 1):
                for x, y, R in grid.get((cx, cy), ()):
                    if (px - x) ** 2 + (py - y) ** 2 <= R * R:
                        near = True
                        break
                if near:
                    break
        if not near:
            kept.append((px, py))
    return kept


def _split_edges_on_insert_points(
    edges: list[dict],
    points: list[tuple[float, float]],
    node_tol: float,
) -> tuple[list[dict], set[tuple[float, float]]]:
    """Point-on-Line kesisimi + dugumden parcalama (Block-to-Line).

    Her insertion point icin:
      1. Nokta herhangi bir boru cizgisinin guzergahi uzerinde mi?
         (dik mesafe <= node_tol — "cok kucuk epsilon", sekil analizi YOK)
      2. Uzerindeyse: o node run-AYIRICI olarak isaretlenir (separator key)
         — kullanici arayuzde sprinkler'lar arasi ayri ayri parcalara tiklar.
      3. Projeksiyon cizginin IC bolgesindeyse (uclara yakin degilse) cizgi
         o noktadan IKI yeni segmente bolunur.

    Grid-bucketed: nokta yalniz kendi hucre komsulugundaki edge'lerle test
    edilir — binlerce INSERT × on binlerce edge'de O(P×E) patlamasi olmaz.

    Donus: (yeni edge listesi, separator node key seti).
    """
    if not edges or not points:
        return edges, set()

    cs = max(node_tol * 50.0, 10.0)
    cell_to_edges: dict[tuple[int, int], list[int]] = {}
    for i, e in enumerate(edges):
        mnx, mxx = min(e["x1"], e["x2"]), max(e["x1"], e["x2"])
        mny, mxy = min(e["y1"], e["y2"]), max(e["y1"], e["y2"])
        for cx in range(int((mnx - node_tol) // cs), int((mxx + node_tol) // cs) + 1):
            for cy in range(int((mny - node_tol) // cs), int((mxy + node_tol) // cs) + 1):
                cell_to_edges.setdefault((cx, cy), []).append(i)

    splits: dict[int, list[tuple[float, float, float]]] = {}
    separator_keys: set[tuple[float, float]] = set()

    for px, py in points:
        ck_x, ck_y = int(px // cs), int(py // cs)
        best: tuple[int, float, float, float, float] | None = None  # (i, t, projx, projy, d)
        for ncx in (ck_x - 1, ck_x, ck_x + 1):
            for ncy in (ck_y - 1, ck_y, ck_y + 1):
                for i in cell_to_edges.get((ncx, ncy), ()):
                    e = edges[i]
                    x1, y1, x2, y2 = e["x1"], e["y1"], e["x2"], e["y2"]
                    dx, dy = x2 - x1, y2 - y1
                    L2 = dx * dx + dy * dy
                    if L2 < 1.0:
                        continue
                    t = ((px - x1) * dx + (py - y1) * dy) / L2
                    t_cl = min(1.0, max(0.0, t))
                    qx = x1 + t_cl * dx
                    qy = y1 + t_cl * dy
                    d = math.hypot(px - qx, py - qy)
                    if d > node_tol:
                        continue
                    if best is None or d < best[4]:
                        best = (i, t, qx, qy, d)
        if best is None:
            continue  # nokta hicbir borunun uzerinde degil — blok alakasiz, dokunma
        i, t, qx, qy, _d = best
        # Run ayirici: nokta cizgi UZERINDE (uc noktada bile olsa) — her
        # sprinkler yeni parca baslatir
        separator_keys.add(_node_key(qx, qy, node_tol))
        # IC bolgede ise gercek bolme (uclara cok yakinsa mevcut node yeterli)
        if 0.001 < t < 0.999:
            splits.setdefault(i, []).append((qx, qy, t))

    if not splits:
        return edges, separator_keys

    new_edges: list[dict] = []
    for i, e in enumerate(edges):
        if i not in splits:
            new_edges.append(e)
            continue
        sp = sorted(splits[i], key=lambda v: v[2])
        prev_x, prev_y = e["x1"], e["y1"]
        layer = e["layer"]
        for nx, ny, _ in sp:
            sl = math.hypot(nx - prev_x, ny - prev_y)
            if sl >= 1.0:
                new_edges.append({"layer": layer, "x1": prev_x, "y1": prev_y,
                                  "x2": nx, "y2": ny, "length": sl})
            prev_x, prev_y = nx, ny
        sl = math.hypot(e["x2"] - prev_x, e["y2"] - prev_y)
        if sl >= 1.0:
            new_edges.append({"layer": layer, "x1": prev_x, "y1": prev_y,
                              "x2": e["x2"], "y2": e["y2"], "length": sl})
    return new_edges, separator_keys


# ── Run gruplama ─────────────────────────────────────────────────

def _chain_to_polyline(
    chain_indices: set[int],
    edges: list[dict],
    node_tol: float = _NODE_TOL,
) -> list[list[float]]:
    """Chain edge'lerini sirali vertex listesine cevir — L/Z/U seklindeki borunun
    gercek kosesi bilgisini korur. Sirasi: bir terminal node'dan diger terminal
    node'a (veya ring ise tur tamamlanana kadar).
    """
    if not chain_indices:
        return []
    if len(chain_indices) == 1:
        e = edges[next(iter(chain_indices))]
        return [[e["x1"], e["y1"]], [e["x2"], e["y2"]]]

    node_edges: dict[tuple[float, float], list[int]] = {}
    node_real_coords: dict[tuple[float, float], tuple[float, float]] = {}
    for ei in chain_indices:
        e = edges[ei]
        k1 = _node_key(e["x1"], e["y1"], node_tol)
        k2 = _node_key(e["x2"], e["y2"], node_tol)
        node_edges.setdefault(k1, []).append(ei)
        node_edges.setdefault(k2, []).append(ei)
        node_real_coords.setdefault(k1, (e["x1"], e["y1"]))
        node_real_coords.setdefault(k2, (e["x2"], e["y2"]))

    terminal = None
    for node, elist in node_edges.items():
        if len(elist) == 1:
            terminal = node
            break
    if terminal is None:
        terminal = next(iter(node_edges))

    vertices: list[list[float]] = []
    visited_edges: set[int] = set()
    current = terminal
    rx, ry = node_real_coords[current]
    vertices.append([rx, ry])

    while True:
        unvisited = [ei for ei in node_edges.get(current, []) if ei not in visited_edges]
        if not unvisited:
            break
        next_edge = unvisited[0]
        visited_edges.add(next_edge)
        e = edges[next_edge]
        k1 = _node_key(e["x1"], e["y1"], node_tol)
        k2 = _node_key(e["x2"], e["y2"], node_tol)
        if k1 == current:
            next_node = k2
            vertices.append([e["x2"], e["y2"]])
        else:
            next_node = k1
            vertices.append([e["x1"], e["y1"]])
        current = next_node

    return vertices


def _group_into_runs(
    edges: list[dict],
    graph: dict[tuple[float, float], list[int]],
    sprinkler_keys: set[tuple[float, float]],
    node_tol: float = _NODE_TOL,
) -> list[dict]:
    """Edge'leri pipe-run'lara grupla.

    Kural: Bir run boyunca her ara node degree=2, sprinkler degil ve ayni layer.
    Kirilma: junction (degree≥3), terminal (degree=1), sprinkler, layer degisimi.

    Her run icin hem iki uc (coords) hem sirali vertex listesi (polyline) doner.
    """
    visited: set[int] = set()
    runs: list[dict] = []

    def other_end(edge_idx: int, node_key: tuple[float, float]) -> tuple[float, float]:
        e = edges[edge_idx]
        k1 = _node_key(e["x1"], e["y1"], node_tol)
        k2 = _node_key(e["x2"], e["y2"], node_tol)
        return k2 if k1 == node_key else k1

    def extend(chain: set[int], from_edge: int, from_node: tuple[float, float], layer: str) -> None:
        """Bir yonde chain'i uzat."""
        current = from_node
        while True:
            if current in sprinkler_keys:
                break
            neighbors = graph.get(current, [])
            if len(neighbors) != 2:
                break  # terminal (1) veya junction (>=3)
            cand = [e for e in neighbors if e != from_edge and e not in chain and e not in visited]
            if len(cand) != 1:
                break
            next_e = cand[0]
            if edges[next_e]["layer"] != layer:
                break
            chain.add(next_e)
            from_edge = next_e
            current = other_end(next_e, current)

    for i, edge in enumerate(edges):
        if i in visited:
            continue
        chain: set[int] = {i}
        layer = edge["layer"]
        extend(chain, i, _node_key(edge["x2"], edge["y2"], node_tol), layer)
        extend(chain, i, _node_key(edge["x1"], edge["y1"], node_tol), layer)
        visited.update(chain)

        node_deg_in_chain: dict[tuple[float, float], int] = {}
        for ei in chain:
            e = edges[ei]
            k1 = _node_key(e["x1"], e["y1"], node_tol)
            k2 = _node_key(e["x2"], e["y2"], node_tol)
            node_deg_in_chain[k1] = node_deg_in_chain.get(k1, 0) + 1
            node_deg_in_chain[k2] = node_deg_in_chain.get(k2, 0) + 1
        endpoints = [n for n, d in node_deg_in_chain.items() if d == 1]
        total_length = sum(edges[ei]["length"] for ei in chain)

        polyline_vertices = _chain_to_polyline(chain, edges, node_tol)

        if len(endpoints) >= 2:
            x1, y1 = endpoints[0]
            x2, y2 = endpoints[1]
        else:
            first = edges[next(iter(chain))]
            x1, y1 = first["x1"], first["y1"]
            x2, y2 = first["x2"], first["y2"]

        runs.append({
            "layer": layer,
            "x1": x1, "y1": y1, "x2": x2, "y2": y2,
            "length": total_length,
            "polyline": polyline_vertices,
        })

    return runs


# ── Ana API ──────────────────────────────────────────────────────

def _segments_per_entity(msp, selected: set[str]) -> list[Segment]:
    """split_mode="none": her cizim entity'si BASTAN SONA tek segment.

    KULLANICI ISTEGI (11.08, PANOVA): bolme olmadan cap atayabilmek —
    granularite cizerin cizdigi cizgidir. T/kesisme/sprinkler bolmesi YOK;
    LWPOLYLINE/POLYLINE vertex yolu `polyline` alaninda tasinir (viewer
    gercek L/Z seklini cizer), uzunluk yol toplamidir.
    <1.0 birim filtresi _collect_raw_edges ile ayni (cizim artefakti).
    """
    segments: list[Segment] = []
    sid = 0

    def ekle(layer: str, pts: list[tuple[float, float]]) -> None:
        nonlocal sid
        if len(pts) < 2:
            return
        length = sum(
            math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
            for i in range(len(pts) - 1)
        )
        if length < 1.0:
            return
        sid += 1
        segments.append({
            "id": sid,
            "layer": layer,
            "x1": pts[0][0], "y1": pts[0][1],
            "x2": pts[-1][0], "y2": pts[-1][1],
            "length": length,
            "polyline": [[x, y] for x, y in pts] if len(pts) > 2 else [],
        })

    for ent in msp.query('LINE'):
        try:
            layer = str(ent.dxf.layer)
            if layer not in selected:
                continue
            ekle(layer, [(float(ent.dxf.start.x), float(ent.dxf.start.y)),
                         (float(ent.dxf.end.x), float(ent.dxf.end.y))])
        except Exception:
            continue

    for ent in msp.query('LWPOLYLINE'):
        try:
            layer = str(ent.dxf.layer)
            if layer not in selected:
                continue
            pts = [(float(p[0]), float(p[1])) for p in ent.get_points(format='xy')]
            if bool(getattr(ent, "closed", False)) and len(pts) > 2:
                pts.append(pts[0])
            ekle(layer, pts)
        except Exception:
            continue

    for ent in msp.query('POLYLINE'):
        try:
            layer = str(ent.dxf.layer)
            if layer not in selected:
                continue
            pts = [(float(v.dxf.location.x), float(v.dxf.location.y)) for v in ent.vertices]
            ekle(layer, pts)
        except Exception:
            continue

    return segments


def _collect_raw_edges_all_layers(msp) -> list[dict]:
    """Tum LINE+LWPOLYLINE+POLYLINE edge'lerini topla (layer filtresi YOK).

    `_collect_raw_edges`'in layer-bagimsiz versiyonu — cross-layer T-junction
    tespiti icin tek bir scan'de tum boru layer'larinin edge'lerini toplar
    (cift tarama yerine). Per-entity tolerance (bozuk entity atlanir).
    """
    edges: list[dict] = []
    for ent in msp.query('LINE'):
        try:
            layer = ent.dxf.layer
            x1, y1 = float(ent.dxf.start.x), float(ent.dxf.start.y)
            x2, y2 = float(ent.dxf.end.x), float(ent.dxf.end.y)
        except Exception:
            continue
        length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
        if length < 1.0:
            continue
        edges.append({"layer": layer, "x1": x1, "y1": y1, "x2": x2, "y2": y2, "length": length})

    for ent in msp.query('LWPOLYLINE'):
        try:
            layer = ent.dxf.layer
            pts = [(float(p[0]), float(p[1])) for p in ent.get_points(format='xy')]
            closed = bool(getattr(ent, "closed", False))
        except Exception:
            continue
        if len(pts) < 2:
            continue
        for i in range(len(pts) - 1):
            x1, y1 = pts[i]
            x2, y2 = pts[i + 1]
            length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            if length < 1.0:
                continue
            edges.append({"layer": layer, "x1": x1, "y1": y1, "x2": x2, "y2": y2, "length": length})
        if closed and len(pts) > 2:
            x1, y1 = pts[-1]
            x2, y2 = pts[0]
            length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            if length >= 1.0:
                edges.append({"layer": layer, "x1": x1, "y1": y1, "x2": x2, "y2": y2, "length": length})

    for ent in msp.query('POLYLINE'):
        try:
            layer = ent.dxf.layer
            pts = [(float(v.dxf.location.x), float(v.dxf.location.y)) for v in ent.vertices]
        except Exception:
            continue
        for i in range(len(pts) - 1):
            x1, y1 = pts[i]
            x2, y2 = pts[i + 1]
            length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            if length < 1.0:
                continue
            edges.append({"layer": layer, "x1": x1, "y1": y1, "x2": x2, "y2": y2, "length": length})

    return edges


def _extract_segments(
    dxf_path: str,
    pipe_layers: list[str],
    sprinkler_layers: list[str] | None = None,
    sprinkler_block_names: set[str] | None = None,
    all_pipe_layers: list[str] | None = None,
    unit_scale: float = 0.001,
    doc=None,
    split_mode: str = "t",
) -> tuple[list[Segment], list[tuple[float, float]]]:
    """Secilen boru layer'larindan topology-aware pipe-run segment'leri uret.

    PRD v2.0 destegi:
    - Snap & Split: dikey bransh endpoint'i yatay ana hatta tam degmiyorsa
      (mikro bosluk veya overshoot), node_tol icinde otomatik yakalanir.
    - Sprinkler izdusum: isaretli katmandaki sembol KUMELERI (blok, daire,
      capraz cizgi, elips, tarama — tip farketmez) boruya izdusurulur; boru
      sembolun icinden geciyorsa o noktadan bolunur (birimsiz boyut kapilari).

    Parametreler:
      pipe_layers: SEGMENT ciktisi bu layer'lardan uretilir (secilen layer'lar)
      sprinkler_layers: kullanici manuel sprinkler isaretledigi layer'lar
      sprinkler_block_names: layer-agnostik sprinkler block adlari (kullanim
        alani kalmadi ama backward-compat icin signature'da tutuldu)
      all_pipe_layers: TOPOLOGY hesabi icin kullanilacak tum boru layer'lari.
        None ise: DXF'teki LINE/POLYLINE iceren tum layer'lar otomatik tespit
        edilir → cross-layer T-junction yakalanir.
      unit_scale: DWG birim -> metre carpani (mm=0.001 default, cm=0.01, m=1.0).
        Tolerance hesabinda PRD epsilon=5cm world-unit'e cevrilir.

    Returns:
      (segments, sprinkler_centers) — sprinkler_centers ham (cx, cy) listesi.

      split_mode: "t" (varsayilan) = T/kesisme/sprinkler bolmeleri (mevcut
        davranis). "none" = HIC bolme — her cizim entity'si bastan sona tek
        segment (kullanici istegi: hatta tek tikla cap atama). Gecersiz deger
        SESSIZCE 't' sayilmaz, ValueError firlatir.

    PERF: doc opsiyonel — caller'dan paylasilirsa tekrar ezdxf.readfile YOK.
    """
    if split_mode not in ("t", "none"):
        raise ValueError(f"split_mode 't' veya 'none' olmali, gelen: {split_mode!r}")
    if doc is None:
        from converter import read_dxf
        doc = read_dxf(dxf_path)
    msp = doc.modelspace()

    # ── BOLMESIZ MOD: entity = segment, graf makinesi HIC calismaz ──
    if split_mode == "none":
        return _segments_per_entity(msp, set(pipe_layers)), []

    # Topology icin edge'leri topla — SADECE secili layer (pipe_layers) icinden.
    #
    # ESKI DAVRANIS: cross-layer (tum boru layer'lari) T tespiti yapiyordu.
    # Bu yanlisti cunku:
    #   - SICAK SU borusu ile SOGUK SU borusu gorsel olarak ayni noktadan
    #     gecse bile FIZIKSEL OLARAK farkli sistemlerdir, baglanti yok
    #   - Cross-layer kesisim T-noktasi sanilip segment'ler gereksiz boluniyordu
    #   - Sonuc: sismis segment sayisi + hatali T markerlari + gorsel kaos
    #
    # YENI DAVRANIS: T-noktasi = AYNI LAYER icindeki 3+ boru birlesimi.
    # Farkli layer'larin kesisimi (just visual overlap) GORMEZDEN GELINIR.
    # all_pipe_layers parametresi backward-compat icin tutuluyor ama kullanilmiyor.
    edges = _collect_raw_edges(msp, set(pipe_layers))
    if not edges:
        return [], []

    # PRD v2.0 — scale-aware adaptif tolerance (min 5cm node_tol, min 20cm sprinkler_tol)
    node_tol, sprinkler_tol = _compute_tolerances(edges, unit_scale=unit_scale)
    # STEP 1: Virtual tee — LINE ortasindaki endpoint degmeleri yakalar
    # (endpoint-on-line, ana hat yatay + dikey branshin endpoint'i ortada)
    edges_before_1 = len(edges)
    edges = _split_edges_on_intersections(edges, node_tol)
    edges_after_1 = len(edges)
    # STEP 2: Proper LINE-LINE crossing — iki LINE birbirini ortadan kesiyor
    # (klasik + kesisim, overshoot, mikro bosluk — PRD section 2.1 Snap & Split)
    edges = _split_edges_on_crossings(edges, node_tol)
    edges_after_2 = len(edges)
    # NOT: file=sys.stderr — parse_worker.py subprocess stdout'unu JSON output
    # icin kullaniyor, stdout'a print yazarsak JSON parse fail eder.
    import sys as _sys
    print(f"[pipe_segments] split: {edges_before_1} -> {edges_after_1} (endpoint-on-line) "
          f"-> {edges_after_2} (crossings) | node_tol={node_tol:.2f}",
          file=_sys.stderr)

    # ── Sprinkler sembolleri (isaretli katmanlar): HERHANGI geometri kumesi ──
    # OLCULDU (02.09, gercek dosya): 743 sembol = 2 LINE + 2 ELLIPSE + 1 HATCH,
    # blok/daire YOK; eski INSERT/CIRCLE/POINT filtresi SIFIR merkez buluyordu.
    # Boru sembolun icinden geciyorsa (merkez->boru <= yaricap + node_tol, ya da
    # eski sprinkler_tol) o noktadan bolunur. Boyut kapilari birimsizdir.
    split_sprinkler_keys: set[tuple[float, float]] = set()
    symbols: list[tuple[float, float, float]] = []
    if sprinkler_layers or sprinkler_block_names:
        symbols = _sprinkler_symbols_from_layers(
            doc,
            sprinkler_layers=sprinkler_layers,
            pipe_layers=set(pipe_layers),
            node_tol=node_tol,
            sprinkler_block_names=sprinkler_block_names,
            network_diag=_network_diag(edges),
            network_bbox=_network_bbox(edges),
        )
        if symbols:
            edges, split_positions = _split_edges_on_points(
                edges, [(x, y, r + node_tol) for x, y, r in symbols], radius=sprinkler_tol,
            )
            split_sprinkler_keys = {_node_key(x, y, node_tol) for x, y in split_positions}
        print(f"[pipe_segments] sprinkler sembol: {len(symbols)} kume, "
              f"{len(split_sprinkler_keys)} boru-ustu bolme",
              file=_sys.stderr)
    sp_centers: list[tuple[float, float]] = [(x, y) for x, y, _ in symbols]

    # STEP 3 — Block-to-Line parcalama (PRD): TUM INSERT insertion point'leri,
    # blok adi/sekli/layer'i ONEMSIZ. Nokta boru cizgisinin TAM USTUNDEYSE
    # (dik mesafe <= node_tol) cizgi o dugumden bolunur + run ayirici olur.
    # Boylece sprinkler layer'i hic isaretlenmese bile boru uzerine dizilmis
    # sprinkler bloklarinin arasindaki her parca ayri tiklanabilir segment olur.
    insert_points = _collect_all_insert_points(
        doc, network_bbox=_network_bbox(edges),
        group_min_diag=_median_edge_length(edges) * 0.25,
    )
    if symbols:
        # Isaretli sembolun temsil ettigi INSERT'i ikinci kez bolme (bir
        # sprinkler = bir bolme; bilesik blokta merkez anchor'dan kayabilir)
        insert_points = _drop_points_near_symbols(insert_points, symbols, node_tol)
    insert_separator_keys: set[tuple[float, float]] = set()
    if insert_points:
        edges, insert_separator_keys = _split_edges_on_insert_points(
            edges, insert_points, node_tol,
        )
        print(f"[pipe_segments] block-to-line: {len(insert_points)} INSERT point, "
              f"{len(insert_separator_keys)} boru-ustu dugum",
              file=_sys.stderr)

    graph = _build_node_graph(edges, node_tol)
    # Run ayiricilar: sembol merkezine yakin dugumler (vertex ustundeki sprinkler
    # dahil). Hic isaret yoksa eski fallback: blok adi regex'i.
    if sprinkler_layers or sprinkler_block_names:
        near_pts = symbols
    else:
        near_pts = [(x, y, 0.0) for x, y in _regex_sprinkler_centers(doc)]
    sprinkler_keys = _node_keys_near_points(graph, near_pts, node_tol, sprinkler_tol)
    sprinkler_keys |= split_sprinkler_keys
    sprinkler_keys |= insert_separator_keys
    runs = _group_into_runs(edges, graph, sprinkler_keys, node_tol)

    # SEGMENT ciktisi sadece secilen layer'lardan
    # (diger layer'lar topology icin gerekli ama metraj'a girmesin)
    selected_set = set(pipe_layers)
    segments: list[Segment] = []
    sid = 0
    for run in runs:
        if run["layer"] not in selected_set:
            continue
        sid += 1
        segments.append({
            "id": sid,
            "layer": run["layer"],
            "x1": run["x1"], "y1": run["y1"],
            "x2": run["x2"], "y2": run["y2"],
            "length": run["length"],
            "polyline": run.get("polyline", []),
        })
    return segments, sp_centers


def _extract_junction_points(
    segments: list[Segment],
    node_tol: float,
) -> list[tuple[float, float]]:
    """Cikan segment'lerin endpoint'lerinden T-junction (degree>=3) noktalarini bul.

    Frontend Canvas2D viewer'da kucuk marker olarak gosterilir → kullanici
    her T noktasinda gercekten 3 ayri segment buluştugunu gorur.
    """
    from collections import defaultdict
    endpoint_count: dict[tuple[float, float], list[tuple[float, float]]] = defaultdict(list)
    for s in segments:
        k1 = _node_key(s["x1"], s["y1"], node_tol)
        k2 = _node_key(s["x2"], s["y2"], node_tol)
        endpoint_count[k1].append((s["x1"], s["y1"]))
        endpoint_count[k2].append((s["x2"], s["y2"]))
    junctions: list[tuple[float, float]] = []
    for k, coords_list in endpoint_count.items():
        if len(coords_list) >= 3:
            # Gercek koordinat (ilk gorulen) — node_key zaten quantize
            junctions.append(coords_list[0])
    return junctions


# ── Sprinkler katman ADAYLARI (kullaniciya OLCULMUS ipucu) ─────────

# Adinda sprinkler gecen katmanlar (tr-normalize). Bu bir KARAR degil, yalniz
# hangi katmanlarin OLCULECEGINI secer; sonuc "boru ustundeki sembol sayisi"
# olarak gercek sinyaldir. Kullanici katmani isaretlemeden bolme YAPILMAZ.
_SPRINKLER_LAYER_HINT_RE = re.compile(
    r"sprink|sprk|spra|(?<![a-z])spr(?![a-z])|upright|pendent|pendant|sidewall|yagmur|yağmur",
    re.IGNORECASE,
)


def _norm_layer_name(name: str) -> str:
    return (name.replace("İ", "I").replace("ı", "i").replace("Ğ", "G").replace("ğ", "g")
            .replace("Ş", "S").replace("ş", "s").replace("Ö", "O").replace("ö", "o")
            .replace("Ü", "U").replace("ü", "u").replace("Ç", "C").replace("ç", "c"))


def sprinkler_layer_candidates(
    doc,
    pipe_layers: list[str],
    unit_scale: float = 0.001,
    max_layers: int = 12,
) -> list[dict]:
    """Isaretlenmemis ama secili borularin USTUNDE sembol tasiyan katmanlar.

    NEDEN: kullanici "T noktalarinda bol" der, sprinkler'da bolunmez ve nedenini
    goremez (02.09: `YNG SPRİNK PENDENT` isaretsizdi). Bu fonksiyon adinda
    sprinkler gecen her katman icin sembol kumelerini boruya izdusurur ve
    borunun icinden gecen sembol sayisini doner. Yalniz sayisi > 0 olanlar,
    cok -> az sirali. Boru katmanlarinin kendisi aday DEGILDIR.

    Donus: [{"layer": ad, "on_pipe": n}, ...]
    """
    pipe_set = set(pipe_layers)
    msp = doc.modelspace()
    edges = _collect_raw_edges(msp, pipe_set)
    if not edges:
        return []
    node_tol, sprinkler_tol = _compute_tolerances(edges, unit_scale=unit_scale)
    net = _network_diag(edges)

    adaylar: list[str] = []
    try:
        for lay in doc.layers:
            name = str(lay.dxf.name)
            if name in pipe_set:
                continue
            if _SPRINKLER_LAYER_HINT_RE.search(_norm_layer_name(name)):
                adaylar.append(name)
    except Exception:
        return []
    if len(adaylar) > max_layers:
        adaylar = adaylar[:max_layers]

    out: list[dict] = []
    for name in adaylar:
        try:
            symbols = _sprinkler_symbols_from_layers(
                doc, sprinkler_layers=[name], pipe_layers=pipe_set,
                node_tol=node_tol, network_diag=net, network_bbox=_network_bbox(edges),
            )
            if not symbols:
                continue
            _, positions = _split_edges_on_points(
                edges, [(x, y, r + node_tol) for x, y, r in symbols], radius=sprinkler_tol,
            )
            if positions:
                out.append({"layer": name, "on_pipe": len(positions)})
        except Exception:
            continue
    out.sort(key=lambda d: -d["on_pipe"])
    return out
