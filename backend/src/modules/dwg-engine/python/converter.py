"""DWG → DXF cevirici. ODA FileConverter veya LibreDWG kullanir."""

import os
import subprocess
import tempfile
import shutil
from pathlib import Path


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


def convert_dwg_to_dxf(dwg_path: str) -> str:
    """
    DWG dosyasini DXF'e cevirir.
    Donus: DXF dosya yolu.
    Hata: RuntimeError.
    """
    dwg_path = os.path.abspath(dwg_path)
    if not os.path.isfile(dwg_path):
        raise FileNotFoundError(f"DWG dosyasi bulunamadi: {dwg_path}")

    # Eger zaten DXF ise dogrudan don
    if dwg_path.lower().endswith(".dxf"):
        return dwg_path

    output_dir = tempfile.mkdtemp(prefix="dwg2dxf_")
    base_name = Path(dwg_path).stem
    output_dxf = os.path.join(output_dir, f"{base_name}.dxf")

    # Yontem 1: ODA FileConverter
    oda = find_oda_converter()
    if oda:
        input_dir = os.path.dirname(dwg_path)
        try:
            # ODA FileConverter: input_dir output_dir version type recursive audit
            subprocess.run(
                [oda, input_dir, output_dir, "ACAD2018", "DXF", "0", "1"],
                timeout=120,
                check=True,
                capture_output=True,
            )
            if os.path.isfile(output_dxf):
                return output_dxf
        except subprocess.TimeoutExpired:
            raise RuntimeError("ODA FileConverter zaman asimi (120s)")
        except subprocess.CalledProcessError as e:
            # errors='replace' — stderr UTF-8 olmayan karakter iceriyorsa decode patlamasin
            stderr = (e.stderr or b"").decode(errors="replace").strip() or "(stderr bos)"
            raise RuntimeError(f"ODA FileConverter hatasi: {stderr}")

    # Yontem 2: LibreDWG dwg2dxf
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
                return output_dxf
        except subprocess.TimeoutExpired:
            raise RuntimeError("LibreDWG zaman asimi (120s)")
        except subprocess.CalledProcessError as e:
            stderr = (e.stderr or b"").decode(errors="replace").strip() or "(stderr bos)"
            raise RuntimeError(f"LibreDWG hatasi: {stderr}")

    # Yontem 3: ezdxf dogrudan DXF okuyabilir ama DWG okuyamaz
    raise RuntimeError(
        "Bu sunucuda DWG→DXF donusumu kapali (ODA FileConverter / LibreDWG kurulu degil). "
        "Lutfen dosyayi DXF formatinda yukleyin. "
        "Yerel kurulumda ODAFileConverter veya 'dwg2dxf' (libredwg-tools) PATH'e eklenince otomatik etkinlesir."
    )
