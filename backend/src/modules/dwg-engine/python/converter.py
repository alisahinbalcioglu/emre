"""DWG → DXF cevirici + DXF butunluk dogrulamasi.

Akis:
  1. ODA FileConverter (target=ACAD2004 → AC1018) veya LibreDWG ile ham DXF al
  2. Text-level header normalize (her zaman, ms olcusunde):
       $ACADVER → AC1018, $DWGCODEPAGE → ANSI_1254, $INSUNITS → 4
  3. Opt-in ezdxf butunluk dogrulamasi (DWG_CONVERTER_VALIDATE=1):
       LTYPE pattern_tags, Turkce karakterler, entity override (6/48/62/370)

Performans notu: ezdxf validate default OFF — background parse zaten readfile
yapiyor (main.py _background_parse). Cift parse istemiyoruz. Test/dev'de env
ile aciliyor.
"""

import logging
import os
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

import ezdxf

logger = logging.getLogger(__name__)

# MetaPrice DXF profili - reference.dxf ile birebir esit olmali
_TARGET_ACADVER = "AC1018"        # AutoCAD 2004
_TARGET_CODEPAGE = "ANSI_1254"    # cp1254 - Turkce karakterler icin sart
_TARGET_INSUNITS = 4              # millimeter
_ODA_VERSION_TARGET = "ACAD2004"  # AC1018'e cevirir (ACAD2018 = AC1032, lossy downgrade)

# Standart linetype'lar - validasyonda gozardi edilir
_STANDARD_LTYPES = {"ByBlock", "BYBLOCK", "ByLayer", "BYLAYER", "Continuous", "CONTINUOUS"}


@dataclass
class IntegrityReport:
    """DXF yapisal butunluk raporu.

    fixed_headers: text-normalize sirasinda duzeltilen header degerleri
    issues:        veri kaybi riski olan ciddi sorunlar (encoding, missing header)
    linetype_warnings: ozel LTYPE'larda pattern kaybi suphesi
    entity_override_warnings: override (group code 6/48/62/370) silinmis olabilir
    """
    fixed_headers: list[str] = field(default_factory=list)
    issues: list[str] = field(default_factory=list)
    linetype_warnings: list[str] = field(default_factory=list)
    entity_override_warnings: list[str] = field(default_factory=list)

    def is_clean(self) -> bool:
        return not (self.issues or self.linetype_warnings or self.entity_override_warnings)

    def summary(self) -> str:
        parts: list[str] = []
        if self.fixed_headers:
            parts.append(f"Duzeltildi: {', '.join(self.fixed_headers)}")
        if self.issues:
            parts.append(f"Sorun: {'; '.join(self.issues)}")
        if self.linetype_warnings:
            parts.append(f"LTYPE: {'; '.join(self.linetype_warnings)}")
        if self.entity_override_warnings:
            parts.append(f"Override: {'; '.join(self.entity_override_warnings)}")
        return " | ".join(parts) if parts else "Temiz"


# ─────────────────────────────────────────────────────────
#  Converter binary discovery
# ─────────────────────────────────────────────────────────

def find_oda_converter() -> str | None:
    """ODA FileConverter binary'sini bul."""
    candidates = [
        r"C:\Program Files\ODA\ODAFileConverter 27.1.0\ODAFileConverter.exe",
        r"C:\Program Files\ODA\ODAFileConverter\ODAFileConverter.exe",
        r"C:\Program Files (x86)\ODA\ODAFileConverter\ODAFileConverter.exe",
        shutil.which("ODAFileConverter"),
    ]
    for path in candidates:
        if path and os.path.isfile(path):
            return path
    return None


def find_libredwg() -> str | None:
    """LibreDWG dwg2dxf binary'sini bul."""
    candidates = [
        shutil.which("dwg2dxf"),
        r"C:\Program Files\LibreDWG\dwg2dxf.exe",
    ]
    for path in candidates:
        if path and os.path.isfile(path):
            return path
    return None


# ─────────────────────────────────────────────────────────
#  Text-level header normalize (cheap, no ezdxf parse)
# ─────────────────────────────────────────────────────────

def _read_dxf_text(path: str) -> str | None:
    """DXF'i cp1254 ile oku - ANSI_1254 encoding'i koruyacak sekilde."""
    try:
        with open(path, "r", encoding="cp1254", errors="replace") as f:
            return f.read()
    except OSError:
        return None


def _write_dxf_text(path: str, text: str) -> None:
    """DXF'i cp1254 ile yaz, newline=\"\" ile satir sonu donusumlerini engelle."""
    with open(path, "w", encoding="cp1254", errors="replace", newline="") as f:
        f.write(text)


def _replace_header_value(
    text: str,
    var_name: str,
    group_code: str,
    target: str,
    is_int: bool,
    report: IntegrityReport,
) -> str:
    """DXF header degiskeninin degerini regex ile duzelt.

    DXF format:
        '  9\\n$ACADVER\\n  1\\nAC1018\\n'

    Pattern esnek olarak grup kodu etrafindaki bosluklara izin verir; integer
    degerler 6-karakter sag-pad'lidir (`     4`), string degerler ham yazilir.
    """
    pattern = re.compile(
        rf"(^[ \t]*9[ \t]*\r?\n{re.escape(var_name)}[ \t]*\r?\n[ \t]*{group_code}[ \t]*\r?\n)([^\r\n]*)",
        re.MULTILINE,
    )
    m = pattern.search(text)
    if not m:
        # Header eksik - ezdxf round-trip riskli, ekleme yapma; raporla
        report.issues.append(f"{var_name} header bulunamadi")
        return text

    current = m.group(2).strip()
    target_str = str(target).strip()
    if current == target_str:
        return text

    formatted = target_str.rjust(6) if is_int else target_str
    new_text = text[: m.start(2)] + formatted + text[m.end(2):]
    report.fixed_headers.append(f"{var_name}: '{current}'->'{target_str}'")
    return new_text


def _normalize_header(dxf_path: str, report: IntegrityReport) -> None:
    """Header degerlerini text-level duzelt. Hata olursa sessiz gec (rapor edilir)."""
    text = _read_dxf_text(dxf_path)
    if text is None:
        report.issues.append("DXF okunamadi (cp1254)")
        return

    for var_name, group_code, target, is_int in (
        ("$ACADVER", "1", _TARGET_ACADVER, False),
        ("$DWGCODEPAGE", "3", _TARGET_CODEPAGE, False),
        ("$INSUNITS", "70", str(_TARGET_INSUNITS), True),
    ):
        text = _replace_header_value(text, var_name, group_code, target, is_int, report)

    if report.fixed_headers:
        try:
            _write_dxf_text(dxf_path, text)
        except OSError as e:
            report.issues.append(f"Normalize sonrasi yazim hatasi: {e}")


# ─────────────────────────────────────────────────────────
#  ezdxf-level integrity validation (opt-in, expensive)
# ─────────────────────────────────────────────────────────

def _validate_with_ezdxf(dxf_path: str, report: IntegrityReport) -> None:
    """ezdxf ile ac, header/LTYPE/layer/entity butunlugunu dogrula. Yazmaz."""
    try:
        doc = ezdxf.readfile(dxf_path)
    except Exception as e:
        report.issues.append(f"ezdxf parse hatasi: {str(e)[:200]}")
        return

    # 1. Header dogrulama (text normalize'tan sonra kalan sorunlar)
    for var, expected in (
        ("$ACADVER", _TARGET_ACADVER),
        ("$DWGCODEPAGE", _TARGET_CODEPAGE),
        ("$INSUNITS", _TARGET_INSUNITS),
    ):
        try:
            actual = doc.header.get(var)
        except Exception:
            actual = None
        if actual is None:
            report.issues.append(f"{var} ezdxf doc'ta yok")
        elif str(actual).strip() != str(expected).strip():
            report.issues.append(f"{var}={actual!r} (beklenen {expected!r})")

    # 2. Custom LTYPE'lar pattern korunmus mu?
    # Reference: 'SO UKSU' icin 4 pattern item + embedded text 'S KSU' var.
    # Eger pattern_tags bos ise converter Continuous'a dusurmus demektir.
    for ltype in doc.linetypes:
        name = ltype.dxf.name
        if name in _STANDARD_LTYPES:
            continue
        try:
            pat = ltype.pattern_tags
            # ezdxf LinetypePattern.tags -> list of DXFTag
            tag_count = len(pat.tags) if pat is not None and hasattr(pat, "tags") else 0
        except Exception:
            tag_count = 0
        # Sade dashed pattern bile en az 2 tag (49 + 74) tasir; embedded
        # text/shape iceren kompleks pattern 6+ tag olur.
        if tag_count == 0:
            report.linetype_warnings.append(
                f"'{name}' pattern bos - Continuous'a dusurulmus olabilir"
            )

    # 3. Layer adlarinda encoding kaybi (Turkce → '?')
    for layer in doc.layers:
        name = layer.dxf.name
        if "?" in name:
            report.issues.append(
                f"Layer '{name}': Turkce karakter '?' ile bozulmus (ANSI_1254 kaybi)"
            )

    # 4. Entity override sampling - boru layer'larda linetype override var mi?
    # Tum modelspace'i taramak pahali; ilk 500 entity yeterli sinyal.
    msp = doc.modelspace()
    has_pipe_layer = any(
        ("su" in l.dxf.name.lower() or "boru" in l.dxf.name.lower())
        and l.dxf.name not in ("0",)
        for l in doc.layers
    )
    if has_pipe_layer:
        override_found = False
        sample_limit = 500
        for i, entity in enumerate(msp):
            if i >= sample_limit:
                break
            if entity.dxftype() not in ("LWPOLYLINE", "LINE", "POLYLINE"):
                continue
            try:
                ltype = entity.dxf.linetype
            except AttributeError:
                ltype = "BYLAYER"
            if ltype and ltype.upper() != "BYLAYER":
                override_found = True
                break
        if not override_found:
            report.entity_override_warnings.append(
                f"Boru/su layer'i mevcut ama ilk {sample_limit} entity'de hicbir linetype "
                "override yok - converter group code 6'yi silmis olabilir"
            )


def validate_dxf_integrity(dxf_path: str) -> IntegrityReport:
    """DXF butunlugunu rapor et. Dosyayi DEGISTIRMEZ.

    Maliyet: ezdxf.readfile (~10-30sn buyuk DXF'lerde). Production'da opt-in
    cagrilmali; main.py background parse zaten readfile yapiyor.
    """
    report = IntegrityReport()
    _validate_with_ezdxf(dxf_path, report)
    return report


# ─────────────────────────────────────────────────────────
#  Public entry point
# ─────────────────────────────────────────────────────────

def _post_process(dxf_path: str) -> IntegrityReport:
    """Ham DXF uzerinde normalize (her zaman) + opsiyonel ezdxf validate."""
    report = IntegrityReport()
    _normalize_header(dxf_path, report)
    if report.fixed_headers:
        logger.info("DXF header normalize: %s", ", ".join(report.fixed_headers))

    if os.environ.get("DWG_CONVERTER_VALIDATE", "").strip().lower() in ("1", "true", "yes"):
        try:
            v_report = validate_dxf_integrity(dxf_path)
            report.issues.extend(v_report.issues)
            report.linetype_warnings.extend(v_report.linetype_warnings)
            report.entity_override_warnings.extend(v_report.entity_override_warnings)
            if not v_report.is_clean():
                logger.warning("DXF integrity: %s", v_report.summary())
        except Exception as e:
            logger.warning("Validate hatasi (sessiz gecildi): %s", str(e)[:200])

    return report


def convert_dwg_to_dxf(dwg_path: str) -> str:
    """DWG dosyasini DXF'e cevirir. Cikti: AC1018, ANSI_1254, mm.

    Akis:
      1. ODA FileConverter (target=ACAD2004) ya da LibreDWG ile ham DXF al
      2. Text-level header normalize ($ACADVER/$DWGCODEPAGE/$INSUNITS)
      3. Opt-in ezdxf butunluk dogrulamasi (env: DWG_CONVERTER_VALIDATE=1)

    Donus: DXF dosya yolu.
    Hata: RuntimeError - converter binary'si yok ya da cevirim basarisiz.
    """
    dwg_path = os.path.abspath(dwg_path)
    if not os.path.isfile(dwg_path):
        raise FileNotFoundError(f"DWG dosyasi bulunamadi: {dwg_path}")

    # Zaten DXF ise: yine normalize uygulayalim - sisteme giren her DXF temiz olsun
    if dwg_path.lower().endswith(".dxf"):
        _post_process(dwg_path)
        return dwg_path

    output_dir = tempfile.mkdtemp(prefix="dwg2dxf_")
    base_name = Path(dwg_path).stem
    output_dxf = os.path.join(output_dir, f"{base_name}.dxf")

    # Yontem 1: ODA FileConverter - ACAD2004 target = AC1018 (reference ile esit)
    oda = find_oda_converter()
    if oda:
        input_dir = os.path.dirname(dwg_path)
        try:
            subprocess.run(
                [oda, input_dir, output_dir, _ODA_VERSION_TARGET, "DXF", "0", "1"],
                timeout=120,
                check=True,
                capture_output=True,
            )
            if os.path.isfile(output_dxf):
                _post_process(output_dxf)
                return output_dxf
        except subprocess.TimeoutExpired:
            raise RuntimeError("ODA FileConverter zaman asimi (120s)")
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"ODA FileConverter hatasi: {e.stderr.decode(errors='replace')}")

    # Yontem 2: LibreDWG dwg2dxf - version target verilemiyor, post-process daha kritik
    libredwg = find_libredwg()
    if libredwg:
        try:
            subprocess.run(
                [libredwg, "-o", output_dxf, dwg_path],
                timeout=120,
                check=True,
                capture_output=True,
            )
            if os.path.isfile(output_dxf):
                _post_process(output_dxf)
                return output_dxf
        except subprocess.TimeoutExpired:
            raise RuntimeError("LibreDWG zaman asimi (120s)")
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"LibreDWG hatasi: {e.stderr.decode(errors='replace')}")

    raise RuntimeError(
        "Bu sunucuda DWG→DXF donusumu kapali (ODA FileConverter / LibreDWG kurulu degil). "
        "Lutfen dosyayi DXF formatinda yukleyin. "
        "Yerel kurulumda ODAFileConverter veya 'dwg2dxf' (libredwg-tools) PATH'e eklenince otomatik etkinlesir."
    )
