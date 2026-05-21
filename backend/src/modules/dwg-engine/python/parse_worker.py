"""Subprocess worker — /parse endpoint'inin core logic'i izole process'te.

Cagriliyor: `python parse_worker.py` — stdin'den JSON params okur, stdout'a JSON sonuc yazar.
Exit code:
  0  → BASARILI, stdout = JSON result
  1  → HATA, stderr = error message
  -9 → SIGKILL (genelde OOM)

Bu izolasyon sayesinde:
  - Her /parse request ayri Python process'te calisir
  - Subprocess OOM kill olursa parent worker SAGLAM kalir
  - Memory leak'ler birikmez (her parse temiz process)
  - Render free tier 512MB'de bile multi-layer parse calisir
"""
import sys
import json
import os
import traceback


def main():
    try:
        # stdin'den JSON params oku
        payload = sys.stdin.read()
        params = json.loads(payload)

        dxf_path = params.pop("dxf_path")
        if not os.path.isfile(dxf_path):
            print(f"DXF dosyasi bulunamadi: {dxf_path}", file=sys.stderr)
            sys.exit(1)

        # Engine modullerini import et (subprocess basina bir kez)
        from main import analyze_dxf_metraj, _json_safe

        # Parse calistir
        result = analyze_dxf_metraj(
            dxf_path,
            scale=params.get("scale", 0.001),
            selected_layers=params.get("selected_layers"),
            hat_tipi_map=params.get("hat_tipi_map"),
            material_type_map=params.get("material_type_map"),
            sprinkler_layers_manual=params.get("sprinkler_layers_manual"),
            layer_default_diameter_map=params.get("layer_default_diameter_map"),
        )

        # Pydantic model'i dict'e cevir, surrogate/NaN sanitize
        if hasattr(result, 'model_dump'):
            result_dict = result.model_dump()
        elif hasattr(result, 'dict'):
            result_dict = result.dict()
        else:
            result_dict = dict(result)

        safe = _json_safe(result_dict)
        # stdout'a JSON yaz — parent okur
        json.dump(safe, sys.stdout, allow_nan=False, ensure_ascii=False)
        sys.stdout.flush()
        sys.exit(0)

    except BaseException as e:
        tb = traceback.format_exc()
        sys.stderr.write(f"parse_worker FAIL ({type(e).__name__}): {str(e)[:500]}\n{tb[:2000]}\n")
        sys.stderr.flush()
        sys.exit(1)


if __name__ == "__main__":
    main()
