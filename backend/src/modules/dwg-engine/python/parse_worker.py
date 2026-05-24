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

# STDOUT IZOLASYON: parse_worker'in stdout'u SADECE JSON output icin kullanilir.
# Import edilen modullerin print() veya logging stdout'lari karismasin diye
# stdout'u devnull'a yonlendir, JSON yazimi icin orijinal stdout'u sakla.
# Bu sayede pipe_segments.py veya 3rd party kutuphane stdout'a print etse
# bile parent'in JSON parse'i bozulmaz.
_original_stdout = sys.stdout
sys.stdout = open(os.devnull, "w")


def main():
    # SystemExit & KeyboardInterrupt'i except Exception YAKALAMAZ — istedigimiz
    # davranis (sys.exit(0) normal cikis olarak gelir, error sayilmaz).
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
            use_proximity_diameter=params.get("use_proximity_diameter", False),
            proximity_max_distance=params.get("proximity_max_distance"),
            include_debug=params.get("include_debug", False),
        )

        # Pydantic model'i dict'e cevir, surrogate/NaN sanitize
        if hasattr(result, 'model_dump'):
            result_dict = result.model_dump()
        elif hasattr(result, 'dict'):
            result_dict = result.dict()
        else:
            result_dict = dict(result)

        safe = _json_safe(result_dict)
        # JSON'u ORIGINAL stdout'a yaz — devnull'a redirect edilmis sys.stdout DEGIL
        json.dump(safe, _original_stdout, allow_nan=False, ensure_ascii=False)
        _original_stdout.flush()
        # NOT: sys.exit(0) yerine return — SystemExit except Exception'a takilmaz
        # ama yine de cleaner.
        return

    except Exception as e:
        # SADECE gercek hatalari yakala (Exception, BaseException degil)
        # SystemExit, KeyboardInterrupt buraya gelmez (BaseException'dan turer)
        tb = traceback.format_exc()
        sys.stderr.write(f"parse_worker FAIL ({type(e).__name__}): {str(e)[:500]}\n{tb[:2000]}\n")
        sys.stderr.flush()
        sys.exit(1)


if __name__ == "__main__":
    main()
