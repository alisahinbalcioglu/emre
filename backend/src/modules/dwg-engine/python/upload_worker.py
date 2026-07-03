"""Upload pipeline worker — DWG→DXF donusumu + TEK ezdxf parse izole process'te.

Cagriliyor: `python upload_worker.py` — stdin'den JSON params okur,
stdout'a JSON sonuc yazar (parse_worker.py ile ayni desen).

stdin : {"src_path": ham dwg/dxf, "dxf_out": cache DXF hedefi, "geom_out": geometry JSON hedefi}
stdout: {"layers": [...], "total_layers": N, "suggested_scale": f,
         "suggested_unit_label": s, "entity_count": N}
Exit code:
  0  → BASARILI
  1  → HATA (stderr'de mesaj)
  -9 → SIGKILL (genelde OOM)

Bu izolasyon sayesinde (PRD 2.3):
  - LibreDWG donusumu + ezdxf parse ana motoru ASLA bloklamaz/oldurmez
  - Devasa dosyada OOM olursa yalniz bu process olur, state'e net hata yazilir
  - Her upload temiz process'te kosar, bellek birikimi olmaz
"""
import sys
import json
import os
import shutil
import traceback

# STDOUT IZOLASYON: bu process'in stdout'u SADECE JSON output icindir.
# Import edilen modullerin print/logging'i JSON'u bozmasin.
_original_stdout = sys.stdout
sys.stdout = open(os.devnull, "w")


def main():
    try:
        params = json.loads(sys.stdin.read())
        src_path = params["src_path"]
        dxf_out = params["dxf_out"]
        geom_out = params["geom_out"]

        if not os.path.isfile(src_path):
            print(f"Kaynak dosya bulunamadi: {src_path}", file=sys.stderr)
            sys.exit(1)

        # Engine modulleri (subprocess basina bir kez import edilir).
        # main import'u FastAPI app'ini tanimlar ama sunucu BASLATMAZ
        # (uvicorn.run yalnizca __main__ altinda) — parse_worker ile ayni desen.
        from converter import convert_dwg_to_dxf, read_dxf
        from geometry import extract_geometry_from_doc
        from main import extract_layer_info_from_doc, _detect_unit_from_dxf, _json_safe

        # ── 1) DWG→DXF donusum (dxf ise yerinde normalize) ──
        produced = convert_dwg_to_dxf(src_path)

        # Sonucu deterministic cache path'ine tasi (ayni /tmp fs → atomic replace)
        if os.path.abspath(produced) != os.path.abspath(dxf_out):
            try:
                os.replace(produced, dxf_out)
            except OSError:
                shutil.move(produced, dxf_out)
            # DWG modunda converter kendi temp dizinini acar — bos dizini temizle
            prod_dir = os.path.dirname(produced)
            if os.path.basename(prod_dir).startswith("dwg2dxf_"):
                try:
                    os.rmdir(prod_dir)
                except OSError:
                    pass

        # ── 2) TEK ezdxf parse — birim + layers + geometry paylasimli doc'tan ──
        doc = read_dxf(dxf_out)
        scale, label = _detect_unit_from_dxf(doc)
        layer_result = extract_layer_info_from_doc(doc)
        geom_result = extract_geometry_from_doc(doc, None)

        # ── 3) Geometry JSON cache'i diske yaz ──
        try:
            geom_data = geom_result.model_dump(mode="json")
        except (AttributeError, TypeError):
            geom_data = geom_result.dict()  # Pydantic v1 fallback
        with open(geom_out, "w", encoding="utf-8") as gf:
            json.dump(geom_data, gf)

        # ── 4) Sonuc JSON'u ORIGINAL stdout'a ──
        out = {
            "layers": [
                l.model_dump() if hasattr(l, "model_dump") else l.dict()
                for l in (layer_result.layers or [])
            ],
            "total_layers": layer_result.total_layers,
            "suggested_scale": scale,
            "suggested_unit_label": label,
            "entity_count": getattr(geom_result, "entity_count", None),
        }
        json.dump(_json_safe(out), _original_stdout, allow_nan=False, ensure_ascii=False)
        _original_stdout.flush()
        return

    except Exception as e:
        tb = traceback.format_exc()
        sys.stderr.write(f"upload_worker FAIL ({type(e).__name__}): {str(e)[:500]}\n{tb[:2000]}\n")
        sys.stderr.flush()
        sys.exit(1)


if __name__ == "__main__":
    main()
