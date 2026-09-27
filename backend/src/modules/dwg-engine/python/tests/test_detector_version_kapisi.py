"""KAPI: unit_detect karar mantigi degisince main.DETECTOR_VERSION artmali.

NEDEN VAR (02.09.2026 — gercek kusur, denetimde yakalandi):
`main.py` yaninda su yorum duruyordu: "unit_detect.py'de karar mantigi
degistiginde BU DEGERI ARTIR." Sprinkler fizik capasi (`_sprinkler_spacing`)
patlatilmis sembol kumelemesiyle DEGISTI ve deger artirilmadan commit edildi.
Sonuc: `dwg_cache` KALICI volume + 24 saat TTL + hash-tabanli dedup (`main.py`
upload_async; 26.09'dan beri firma kapsaminda) yuzunden deploy'dan sonra 24 saat boyunca daha once
yuklenmis HER dosya, dedup'a takilip ESKI birim onerisiyle donecekti. Yorum
kanit degildir; kapi olmayan sozlesme sessizce ihlal edilir.

BU KAPI NE OLCER: `unit_detect.py`'nin KARAR MANTIGINI (AST parmak izi).
Yorum, bosluk ve docstring degisiklikleri parmak izini DEGISTIRMEZ — yalnizca
calisan kod. Parmak izi degisip DETECTOR_VERSION sabit kalirsa test kirmizi
yanar ve gelistiriciyi iki seyi birlikte yapmaya zorlar.

KIRMIZI YANDIYSA NE YAPMALI:
  1. `main.py` icindeki DETECTOR_VERSION'i artir (or. "2026-09-15-yeni-capa").
     -> Bu, onbellekteki eski state'lerin dedup'ini ATLATIR, dosya yeniden
        parse edilir ve kullanici GUNCEL birim onerisini alir.
  2. Asagidaki BEKLENEN_PARMAK_IZI'ni testin yazdirdigi yeni degerle guncelle.
  3. Ikisini AYNI commit'te yap.

Karar mantigini DEGISTIRMEDIYSEN (yalniz yorum/docstring eklediysen) parmak izi
zaten degismez; test yesil kalir.

SURUMDEN BAGIMSIZ (26.09.2026): parmak izi eskiden `ast.dump`tan hesaplaniyordu,
onun bicimi Python surumune gore degisir (asagida `_kanonik`). Olculdu: ayni
unit_detect.py canli motor imajinda (Python 3.11.16) 024ee56fe3503d3f, yerelde
(3.14.3) 730d708755e33d18 veriyordu — kapi canlida kod degismeden KIRMIZIYDI,
saklanan deger yalniz yerel surumde gecerliydi. Once `test_kanonik_bicim_surumden_bagimsiz`
kirmiziysa sorun Python surumudur: DETECTOR_VERSION ARTIRMA, `_kanonik`i duzelt.
"""
from __future__ import annotations

import ast
import hashlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main as motor  # noqa: E402

_PY_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_UNIT_DETECT = os.path.join(_PY_DIR, "unit_detect.py")

# (DETECTOR_VERSION, unit_detect karar mantigi parmak izi) CIFTI.
# Ikisi BIRLIKTE guncellenir — biri degisip digeri kalirsa kapi kirmizi yanar.
BEKLENEN_SURUM = "2026-09-02-patlatilmis-sembol"
# 26.09: `_kanonik` ile yeniden hesaplandi (unit_detect.py DEGISMEDI); 3.11.16 ve 3.14.3'te ayni.
BEKLENEN_PARMAK_IZI = "3101f18fba3ddf3f"


def _docstringsiz(agac: ast.AST) -> ast.AST:
    """Modul/sinif/fonksiyon docstring'lerini AGACTAN SIL.

    Boylece aciklama yazmak parmak izini degistirmez; yalniz CALISAN kod olculur.
    """
    for dugum in ast.walk(agac):
        if not isinstance(dugum, (ast.Module, ast.ClassDef,
                                  ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        govde = getattr(dugum, "body", None)
        if not govde:
            continue
        ilk = govde[0]
        if (isinstance(ilk, ast.Expr) and isinstance(ilk.value, ast.Constant)
                and isinstance(ilk.value.value, str)):
            dugum.body = govde[1:] or [ast.Pass()]
    return agac


def _kanonik(dugum) -> str:
    """Python SURUMUNDEN BAGIMSIZ AST metni (`ast.dump` yerine).

    `ast.dump` bicimi surume gore degisir: 3.11 bos listeleri yazar
    (`decorator_list=[]`, `type_ignores=[]`), 3.13+ atar. Her alani (None/[]
    dahil) yazmak da YETMEZ: 3.12 FunctionDef/ClassDef'e `type_params` ekledi,
    3.11'de o alan hic yok (olculdu 26.09: 055c8d50... ile d4a8a84b...). Burada
    None ve [] alanlar HER surumde atlanir — yoklukla bosluk ayni sayilir; alan
    adlari yazildigi icin iki farkli agac ayni metni vermez. Konum ozellikleri
    (lineno, col_offset...) alan degildir, `iter_fields`te zaten yoktur.
    """
    if isinstance(dugum, ast.AST):
        alanlar = ",".join(
            f"{ad}={_kanonik(deger)}"
            for ad, deger in ast.iter_fields(dugum)
            if deger is not None and deger != []
        )
        return f"{type(dugum).__name__}({alanlar})"
    if isinstance(dugum, list):
        return "[" + ",".join(_kanonik(x) for x in dugum) + "]"
    return repr(dugum)


def karar_mantigi_parmak_izi(kaynak: str) -> str:
    """Kaynagin AST ozeti (docstring'siz) -> 16 haneli sha256 on eki.

    AST kullanilir cunku yorum, bosluk, satir sonu (CRLF/LF) ve satir kaydirma
    parmak izini ETKILEMEMELI — bunlar karar mantigi degildir.
    """
    agac = _docstringsiz(ast.parse(kaynak))
    return hashlib.sha256(_kanonik(agac).encode("utf-8")).hexdigest()[:16]


def test_karar_mantigi_degistiyse_surum_de_degismeli():
    """ASIL KAPI. Kirmizi yanarsa yukaridaki 3 adimi uygula."""
    with open(_UNIT_DETECT, encoding="utf-8") as f:
        simdiki = karar_mantigi_parmak_izi(f.read())
    assert simdiki == BEKLENEN_PARMAK_IZI, (
        "unit_detect.py'nin KARAR MANTIGI degisti "
        f"({BEKLENEN_PARMAK_IZI} -> {simdiki}) ama bu kapi guncellenmedi.\n"
        "  1) main.py icindeki DETECTOR_VERSION'i ARTIR (yoksa onbellekteki\n"
        "     dosyalar 24 saat boyunca ESKI birim onerisiyle doner),\n"
        f"  2) BEKLENEN_PARMAK_IZI = \"{simdiki}\" yap,\n"
        "  3) ikisini ayni commit'te gonder.\n"
        "  (Once test_kanonik_bicim_surumden_bagimsiz'a bak: o da kirmiziysa\n"
        "   sebep Python surumudur, mantik degil — surumu ARTIRMA.)"
    )


# Kucuk kaynagin kanonik metni. Surume duyarli yapilari icerir: bos listeler
# (decorator_list, defaults, type_ignores), 3.12+ `type_params`, istege bagli
# None alanlar, f-string. Olculdu 26.09: 3.11.16 (canli imaj) ve 3.14.3'te ayni.
_KANONIK_ORNEK_KAYNAK = 'class K:\n    def f(self, x, *, y=None):\n        return g(f"{x}!", k=1)\n'
_KANONIK_ORNEK = (
    "Module(body=[ClassDef(name='K',body=[FunctionDef(name='f',args=arguments("
    "args=[arg(arg='self'),arg(arg='x')],kwonlyargs=[arg(arg='y')],kw_defaults=[Constant()]),"
    "body=[Return(value=Call(func=Name(id='g',ctx=Load()),args=[JoinedStr(values=["
    "FormattedValue(value=Name(id='x',ctx=Load()),conversion=-1),Constant(value='!')])],"
    "keywords=[keyword(arg='k',value=Constant(value=1))]))])])])"
)


def test_kanonik_bicim_surumden_bagimsiz():
    """Parmak izi olcutunun KENDISI surume bagli olmamali (26.09: `ast.dump`
    canlidaki 3.11'de baska, yereldeki 3.14'te baska metin veriyordu). Bu
    kirmiziysa DETECTOR_VERSION'a dokunma — `_kanonik` bu Python'da farkli yaziyor."""
    simdiki = _kanonik(ast.parse(_KANONIK_ORNEK_KAYNAK))
    assert simdiki == _KANONIK_ORNEK, (
        f"Python {sys.version.split()[0]} kanonik metni farkli yaziyor:\n{simdiki}"
    )


def test_surum_bu_kapiyla_ayni_ciftte():
    """main.DETECTOR_VERSION ile kapinin bekledigi surum ayrismamali."""
    assert motor.DETECTOR_VERSION == BEKLENEN_SURUM, (
        f"main.DETECTOR_VERSION={motor.DETECTOR_VERSION!r} ama kapi "
        f"{BEKLENEN_SURUM!r} bekliyor — parmak izini de guncelledin mi?"
    )


# ── KAPININ KENDISINI OLC (dairesel olmasin) ─────────────────────


def test_kapi_gercek_mantik_degisikligini_YAKALAR():
    """OLCUTU DOGRULA: kaynaga bir karar esigi eklenirse parmak izi DEGISMELI.
    Bu assert olmadan kapi 'her zaman yesil' bir suslemeye donusebilir."""
    with open(_UNIT_DETECT, encoding="utf-8") as f:
        kaynak = f.read()
    temiz = karar_mantigi_parmak_izi(kaynak)
    # Gercek bir mantik mudahalesi: veto bandini degistir (dosyaya YAZILMAZ)
    bozuk_kaynak = kaynak.replace(
        "SPRINKLER_SPACING_VETO_M = (1.2, 6.0)",
        "SPRINKLER_SPACING_VETO_M = (0.5, 9.0)",
    )
    assert bozuk_kaynak != kaynak, "FIXTURE KANITI: mutasyon deseni kaynakta yok"
    assert karar_mantigi_parmak_izi(bozuk_kaynak) != temiz, (
        "Kapi mantik degisikligini GORMUYOR — parmak izi olcumu bozuk"
    )


def test_kapi_yalniz_yorum_eklemesinde_SESSIZ_kalir():
    """Ters yon: aciklama yazmak kimseyi surum artirmaya zorlamamali."""
    with open(_UNIT_DETECT, encoding="utf-8") as f:
        kaynak = f.read()
    temiz = karar_mantigi_parmak_izi(kaynak)
    yorumlu = "# yeni bir aciklama satiri\n" + kaynak.replace(
        "SPRINKLER_SPACING_VETO_M = (1.2, 6.0)",
        "SPRINKLER_SPACING_VETO_M = (1.2, 6.0)  # kenar aciklamasi",
    )
    assert yorumlu != kaynak, "FIXTURE KANITI: yorum eklenmedi"
    assert karar_mantigi_parmak_izi(yorumlu) == temiz, (
        "Kapi yorum degisikliginde yaniyor — gurultulu kapi devre disi birakilir"
    )


def test_onbellek_state_yazan_yollar_surumu_tasir():
    """Kapinin degeri tasidigi yollar duruyor mu (olu kapi olmasin).
    `detector_version` hem state yazan hem OKUYAN tarafta gecmeli."""
    with open(os.path.join(_PY_DIR, "main.py"), encoding="utf-8") as f:
        ana = f.read()
    assert ana.count('"detector_version": DETECTOR_VERSION') >= 2, (
        "state'e surum yazan yol kayboldu — dedup atlamasi calismaz"
    )
    assert 'st.get("detector_version") != DETECTOR_VERSION' in ana, (
        "dedup atlama kosulu kayboldu — eski birim onerisi geri doner"
    )
