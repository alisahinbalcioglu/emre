#!/usr/bin/env python3
"""AI Equipment Classification Demo

DWG/DXF icindeki unique block'lari Claude Sonnet 4.5 ile tek sorguda
siniflandirir. Amac: regex tabanli sprinkler tespitini (proje-bagimli)
semantic AI tespiti (proje-bagimsiz) ile karsilastirmak.

Usage:
    python test_equipment_ai.py [dxf_path]
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

import ezdxf
from anthropic import Anthropic


MODEL = "claude-sonnet-4-5-20250929"
DEFAULT_DXF = r"C:/Users/basar/AppData/Local/Temp/dwg2dxf_0ezh1pz_/depo alanları.dxf"
CONTEXT_TEXTS_PER_BLOCK = 3
MAX_CONTEXT_DISTANCE = 500.0  # world units
MAX_SAMPLE_INSERTS = 5        # check nearby texts for first N insertions
USD_TO_TRY = 40.0
# Sonnet 4.5 pricing: $3 / $15 per 1M tokens (input / output)
PRICE_IN = 3.0
PRICE_OUT = 15.0


def load_env_from_backend() -> None:
    """Ana backend/.env dosyasini (varsa) environment'a yukle."""
    here = Path(__file__).resolve()
    # .../backend/src/modules/dwg-engine/python/test_equipment_ai.py -> parents[4] = backend
    candidates = [
        here.parents[4] / ".env",
        here.parents[5] / "backend" / ".env",
    ]
    for env_path in candidates:
        if not env_path.is_file():
            continue
        for line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            k = key.strip()
            v = val.strip().strip('"').strip("'")
            # setdefault bos string'i override etmez — bos degerleri de ezelim
            if not os.environ.get(k):
                os.environ[k] = v
        break


def collect_blocks(msp) -> dict[str, dict[str, Any]]:
    blocks: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"count": 0, "layers": set(), "positions": []}
    )
    for ins in msp.query("INSERT"):
        try:
            name = str(ins.dxf.name or "").strip()
            if not name:
                continue
            layer = str(ins.dxf.layer or "")
            x = float(ins.dxf.insert.x)
            y = float(ins.dxf.insert.y)
        except Exception:
            continue
        b = blocks[name]
        b["count"] += 1
        b["layers"].add(layer)
        if len(b["positions"]) < MAX_SAMPLE_INSERTS:
            b["positions"].append((x, y))
    return blocks


def collect_texts(msp) -> list[dict[str, Any]]:
    texts: list[dict[str, Any]] = []
    for ent in msp.query("TEXT"):
        try:
            t = (ent.dxf.text or "").strip()
            x = float(ent.dxf.insert.x)
            y = float(ent.dxf.insert.y)
        except Exception:
            continue
        if t:
            texts.append({"text": t, "x": x, "y": y, "layer": str(ent.dxf.layer or "")})
    for ent in msp.query("MTEXT"):
        try:
            t = (ent.text or "").strip()
            x = float(ent.dxf.insert.x)
            y = float(ent.dxf.insert.y)
        except Exception:
            continue
        if t:
            # MTEXT icindeki format code'lari temizle (\\P, \\f..., {...})
            clean = re.sub(r'\\[A-Za-z][^;]*;', '', t)
            clean = re.sub(r'[{}]', '', clean).strip()
            if clean:
                texts.append({"text": clean[:120], "x": x, "y": y, "layer": str(ent.dxf.layer or "")})
    return texts


def nearest_texts(positions: list[tuple[float, float]], texts: list[dict], k: int) -> list[str]:
    samples: list[str] = []
    seen: set[str] = set()
    for bx, by in positions:
        candidates: list[tuple[float, str]] = []
        for t in texts:
            d = math.hypot(t["x"] - bx, t["y"] - by)
            if d <= MAX_CONTEXT_DISTANCE:
                candidates.append((d, t["text"]))
        candidates.sort()
        for _, txt in candidates:
            if txt in seen:
                continue
            seen.add(txt)
            samples.append(txt)
            if len(samples) >= k:
                return samples
    return samples


def build_prompt(block_list: list[dict]) -> str:
    return f"""Sen bir mekanik/yangin tesisat uzmanisin ve AutoCAD DWG dosyalarindaki
block referanslarini semantik olarak siniflandiriyorsun.

Asagida bir Turk mekanik/yangin projesinden cikarilmis unique block'lar var.
Her block icin:
- block_name: AutoCAD block tanim adi (genellikle kisaltma/kod)
- count: Modelspace'teki INSERT sayisi
- layers: Hangi layer(lar)da kullanilmis
- nearby_texts: INSERT pozisyonuna yakin TEXT ornekleri (context ipucu)

Gorevin: Her block'u asagidaki TEK bir ekipman tipine ata.

GECERLI TIPLER:
- sprinkler       Yangin sprinkler kafasi (upright/pendant/sidewall/konvansiyonel)
- valve           Vana (kelebek, kuresel, glob, cekvalf, test valfi, drenaj)
- pump            Pompa (yangin, sirkulasyon, basinc)
- fire_cabinet    Yangin dolabi, hortum makarasi, yangin hidranti
- sprinkler_head_alt Sprinkler harici yangin nozzle (deluge, water mist)
- meter           Sayac, debimetre, manometre, akis anahtari
- fitting         Dirsek, T, reduksiyon, flans (sadece semadaki semboller)
- fixture         Saniter: lavabo, klozet, pisuvar, dus, susluk, eviye
- equipment       Genel mekanik ekipman (sogutma, kazan, esanjor, tank)
- symbol_only     Cizim sembolu / lejant / aciklama (fiziksel ekipman degil)
- other           Yukaridakilerden hicbiri

ONEMLI:
- Block adi bilmediğin bir kod/kisaltma ise nearby_texts'e VE layer adina bak
- Turk tesisat projesinde yaygin kisaltmalar: UH (upright head), VN (vana),
  YD (yangin dolabi), YH (yangin hidranti), SP (sprinkler), PMP (pompa)
- Block adi 1-2 karakter ise ve context yoksa confidence=low ver
- "dynablock", "title", "frame" gibi isimler genellikle symbol_only

Sadece VALID JSON array dondur, ek metin/markdown ekleme:
[
  {{"block_name":"...","equipment_type":"...","confidence":"high|medium|low","reason":"kisa gerekce (<80 char)"}},
  ...
]

Block'lar ({len(block_list)} tane):
{json.dumps(block_list, ensure_ascii=False, indent=2)}
"""


def extract_json_array(text: str) -> list[dict] | None:
    """Modelin metninden ilk JSON array'i cikar."""
    # Kod blogu icindeyse soy
    fenced = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", text, re.DOTALL)
    if fenced:
        try:
            return json.loads(fenced.group(1))
        except json.JSONDecodeError:
            pass
    m = re.search(r"\[\s*\{.*\}\s*\]", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    return None


def main(dxf_path: str) -> int:
    load_env_from_backend()
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("[HATA] ANTHROPIC_API_KEY yok (.env veya ortam degiskeni)", file=sys.stderr)
        return 2

    p = Path(dxf_path)
    if not p.is_file():
        print(f"[HATA] DXF bulunamadi: {p}", file=sys.stderr)
        return 2

    size_mb = p.stat().st_size / (1024 * 1024)
    print(f"[1/4] DXF okunuyor: {p.name} ({size_mb:.1f} MB)")
    t0 = time.time()
    doc = ezdxf.readfile(str(p))
    msp = doc.modelspace()
    print(f"       {time.time()-t0:.1f}s")

    print("[2/4] Block + TEXT toplamaya basladi...")
    t0 = time.time()
    blocks = collect_blocks(msp)
    texts = collect_texts(msp)
    print(f"       {len(blocks)} unique block, {len(texts)} text entity ({time.time()-t0:.1f}s)")

    print("[3/4] Her block icin yakin text context cikariliyor...")
    t0 = time.time()
    block_list: list[dict] = []
    for name, data in blocks.items():
        ctx = nearest_texts(data["positions"], texts, CONTEXT_TEXTS_PER_BLOCK)
        block_list.append({
            "block_name": name,
            "count": data["count"],
            "layers": sorted(data["layers"])[:5],
            "nearby_texts": ctx,
        })
    block_list.sort(key=lambda x: -x["count"])
    print(f"       {time.time()-t0:.1f}s")

    # Cok fazla block varsa context tasmasini engelle (ilk 300)
    if len(block_list) > 300:
        print(f"       ! {len(block_list)} block cok fazla, ilk 300'u gonderiyorum")
        block_list = block_list[:300]

    print(f"[4/4] Claude {MODEL} cagriliyor ({len(block_list)} block)...")
    t0 = time.time()
    prompt = build_prompt(block_list)
    client = Anthropic(api_key=api_key)
    resp = client.messages.create(
        model=MODEL,
        max_tokens=8000,
        messages=[{"role": "user", "content": prompt}],
    )
    dt = time.time() - t0

    in_tok = resp.usage.input_tokens
    out_tok = resp.usage.output_tokens
    cost_usd = (in_tok * PRICE_IN + out_tok * PRICE_OUT) / 1_000_000
    cost_try = cost_usd * USD_TO_TRY
    print(f"       {dt:.1f}s | {in_tok} in + {out_tok} out tok | ~${cost_usd:.4f} (~{cost_try:.2f} TL)")

    raw = resp.content[0].text if resp.content else ""
    result = extract_json_array(raw)
    if result is None:
        print("\n[HATA] Yanittan JSON cikarilamadi, ham cikti:\n")
        print(raw[:2000])
        return 3

    # Rapor
    print("\n" + "=" * 110)
    print(f"{'block_name':<40} {'type':<18} {'conf':<8} {'count':>6}  sample_text")
    print("-" * 110)
    type_inserts: dict[str, int] = defaultdict(int)
    type_blocks: dict[str, int] = defaultdict(int)
    for item in result:
        name = str(item.get("block_name", "?"))
        btype = str(item.get("equipment_type", "?"))
        conf = str(item.get("confidence", "?"))
        orig = blocks.get(name, {"count": 0, "layers": set(), "positions": []})
        cnt = orig["count"]
        ctx0 = ""
        # En siki match icin hizli: o bloga ait nearby_texts'i tekrar hesaplamaya gerek yok
        for bl in block_list:
            if bl["block_name"] == name and bl["nearby_texts"]:
                ctx0 = bl["nearby_texts"][0][:28]
                break
        disp = name if len(name) <= 39 else name[:36] + "..."
        print(f"{disp:<40} {btype:<18} {conf:<8} {cnt:>6}  {ctx0}")
        type_inserts[btype] += cnt
        type_blocks[btype] += 1

    total_inserts = sum(type_inserts.values())
    print("\n" + "=" * 110)
    print(f"{'tip':<20} {'block_sayisi':>14} {'insert_sayisi':>15}  oran")
    print("-" * 60)
    for t, c in sorted(type_inserts.items(), key=lambda kv: -kv[1]):
        bc = type_blocks[t]
        pct = 100.0 * c / total_inserts if total_inserts else 0
        print(f"{t:<20} {bc:>14} {c:>15}  {pct:5.1f}%")
    print(f"{'TOPLAM':<20} {sum(type_blocks.values()):>14} {total_inserts:>15}")

    # Sprinkler karsilastirmasi: regex vs AI
    from ai_diameter import _SPRINKLER_RE
    regex_hits = sum(
        data["count"]
        for name, data in blocks.items()
        if _SPRINKLER_RE.search(name)
    )
    ai_hits = type_inserts.get("sprinkler", 0)
    print("\n" + "=" * 110)
    print("REGEX vs AI sprinkler tespit karsilastirma:")
    print(f"  regex (_SPRINKLER_RE) : {regex_hits} INSERT")
    print(f"  AI                    : {ai_hits} INSERT")
    delta = ai_hits - regex_hits
    sign = "+" if delta >= 0 else ""
    print(f"  fark                  : {sign}{delta}")

    # JSON dump
    out_path = Path(__file__).parent / "equipment_ai_result.json"
    out_path.write_text(json.dumps({
        "dxf": str(p),
        "dxf_size_mb": round(size_mb, 2),
        "model": MODEL,
        "duration_sec": round(dt, 1),
        "input_tokens": in_tok,
        "output_tokens": out_tok,
        "cost_usd": round(cost_usd, 4),
        "cost_try": round(cost_try, 2),
        "total_unique_blocks": len(blocks),
        "total_inserts": total_inserts,
        "type_inserts": dict(type_inserts),
        "type_blocks": dict(type_blocks),
        "regex_sprinkler_hits": regex_hits,
        "ai_sprinkler_hits": ai_hits,
        "blocks": result,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n[OK] Sonuc kaydedildi: {out_path}")
    return 0


if __name__ == "__main__":
    dxf = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DXF
    sys.exit(main(dxf))
