#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  MetaPrice — YABANCI ANAHTAR (FK) SILME DAVRANISI DOGRULAMA   (04.08.2026)
#
#  KULLANIM (Hetzner web konsolunda):
#      cd /opt/metaprice
#      bash scripts/fk-dogrula.sh
#
#  NEDEN BETIK: Hetzner web konsolu TR klavyede su karakterleri YAZAMIYOR:
#      "   (   )   ?   _   $   |   >   %   ~
#  04.08'de bu uc kez vurdu:
#    1) grep -c BOOTSTRAP_SECRET  → konsola BOOTSTRAP-SECRET dustu, 0 dondu
#    2) \d "UserLibrary"          → konsola \d 'UserLibrary' dustu, tablo bulunamadi
#    3) \d (?i)userlibrary        → konsola \d 9/i0userlibrary dustu
#  Ayni sorguyu konsola yazmak IMKANSIZ. Dosyanin icindeki karakterleri konsol
#  bozamaz — olcumu betige tasimak kolaylik degil, DOGRULUK meselesidir.
#
#  NE OLCER: UserLibrary tablosundaki her FK'nin ON DELETE kuralini, DB'nin
#  kendi katalogundan (pg_constraint). Sema dosyasinda ne yazdigi DEGIL,
#  veritabaninda fiilen ne oldugu. Bu projede prisma/migrations DRIFT ETMISTIR
#  (sema `npx prisma db push` ile yonetiliyor), bu yuzden migration dosyasi
#  kanit sayilmaz — tek gecerli kaynak canli katalogdur.
#
#  BEKLENEN (04.08 B-1 duzeltmesinden sonra):
#      UserLibrary_productIndexId_fkey     → SET NULL   ← kritik olan bu
#      UserLibrary_sourcePriceListId_fkey  → SET NULL
#      UserLibrary_brandId_fkey            → RESTRICT
#      UserLibrary_materialId_fkey         → SET NULL
#      UserLibrary_userId_fkey             → CASCADE    (dogru: kullanici silinince satiri gitmeli)
#  productIndexId CASCADE gorunuyorsa `npx prisma db push` TUTMAMISTIR.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/.."

# .env'den kullanici/veritabani adi (yoksa gozlemlenen varsayilan).
PG_KULLANICI="$(grep -E '^POSTGRES_USER=' .env 2>/dev/null | cut -d= -f2- || true)"
PG_VERITABANI="$(grep -E '^POSTGRES_DB=' .env 2>/dev/null | cut -d= -f2- || true)"
PG_KULLANICI="${PG_KULLANICI:-metaprice}"
PG_VERITABANI="${PG_VERITABANI:-metaprice}"

echo "── FK SILME DAVRANISI — UserLibrary ──"
echo "   veritabani: $PG_VERITABANI   kullanici: $PG_KULLANICI"
echo ""

docker compose exec -T db psql -U "$PG_KULLANICI" -d "$PG_VERITABANI" <<'SQL'
SELECT
  conname AS kisit,
  CASE confdeltype
    WHEN 'c' THEN 'CASCADE  >> satir SILINIR'
    WHEN 'n' THEN 'SET NULL >> satir YASAR'
    WHEN 'r' THEN 'RESTRICT >> silme engellenir'
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'd' THEN 'SET DEFAULT'
    ELSE confdeltype::text
  END AS silmede_ne_olur
FROM pg_constraint
WHERE contype = 'f'
  AND conrelid = '"UserLibrary"'::regclass
ORDER BY conname;
SQL

echo ""
echo "── KARAR ──"

SONUC="$(docker compose exec -T db psql -U "$PG_KULLANICI" -d "$PG_VERITABANI" -t -A <<'SQL'
SELECT confdeltype
FROM pg_constraint
WHERE contype = 'f'
  AND conrelid = '"UserLibrary"'::regclass
  AND conname = 'UserLibrary_productIndexId_fkey';
SQL
)"
SONUC="$(printf '%s' "$SONUC" | tr -d '[:space:]')"

if [ "$SONUC" = "n" ]; then
  echo "  ✔ productIndexId = SET NULL — KORUMA YERINDE."
  echo "    Fiyat listesi/urun indeksi silinince kutuphane satiri YASAR;"
  echo "    kullanicinin iskontosu ve ozel fiyati korunur."
  exit 0
elif [ "$SONUC" = "c" ]; then
  echo "  ✘ productIndexId = CASCADE — KORUMA YOK, db push TUTMAMIS."
  echo "    Ekran metni 'satirlar korunur' diyor ama DB satirlari SILER."
  echo "    Yapilacak: cd /opt/metaprice && docker compose exec backend npx prisma db push"
  exit 1
elif [ -z "$SONUC" ]; then
  echo "  ? Kisit BULUNAMADI — olcut supheli."
  echo "    Ya tablo/kisit adi degisti ya sorgu yanlis kosuldu. Karar VERILMEDI."
  exit 2
else
  echo "  ? Beklenmedik deger: '$SONUC' (bekleniyordu: n ya da c). Karar VERILMEDI."
  exit 2
fi
