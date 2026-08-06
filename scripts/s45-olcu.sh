#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  S4 + S5 — MALZEME KATMANI ve AILE ZAYIFLIGI OLCUSU (SALT-OKUMA)
#
#  KULLANIM (Hetzner web konsolunda, sirayla):
#      cd /opt/metaprice
#      git pull origin master
#      bash scripts/s45-olcu.sh
#
#  NEDEN SCRIPT (deploy.sh / kb5-olcu.sh deseni): Hetzner web konsolu TR
#  klavyede bazi ozel karakterleri yazamiyor/bozuyor. Ozel karakterlerin
#  TAMAMI bu dosyanin icinde durur; konsola yazilan uc satirin hicbirinde
#  ozel karakter yok.
#
#  NEDEN GEREKLI — DURUSTLUK NOTU: S4/S5'in gercek kazanci YEREL VERIDE
#  OLCULEMEZ. Yerelde kategori-kaynakli aile yalniz 25/2010 satirda (%1,2)
#  ve HICBIRI 'boru' degil; PVC/PP urun de yok. Yani fixture'lar davranisi
#  kanitlar, BUYUKLUGU kanitlamaz. Buyukluk yalniz canlida olculur — bu
#  betik onun icin var. Betik hicbir sey duzeltmez, yalniz SAYAR.
#
#  NE OLCER — ON KIRILIM:
#    A) aileZayif urun sayisi ve PAYDA (toplam urun) — oran yorumlanabilsin
#    B) aileZayif urunlerin AILE kirilimi (en kalabalik 10 aile)
#    C) FRENIN GERCEKTEN KESTIGI KUME: aileZayif VE capsiz urunler
#       (capsiz-istisnasi + zayif aile = "Yiv acma makinesi 373.825 TL" deseni)
#    D) malzeme etiketi TASIYAN urun sayisi ve etiket kirilimi
#    E) sozlukte malzeme bilgisi tasiyan alias sayisi (S5'in girdi tarafi)
#
#  YALNIZ OKUR: sorgular BEGIN READ ONLY icinde, sonda ROLLBACK.
#
#  ON KOSUL: `prisma db push` (iki yeni kolon) + `POST /admin/reindex-products`
#  KOSULMUS olmali. Kolonlar yoksa betik bunu ACIKCA soyler ve durur —
#  "0 cikti" ile "olculemedi" KARISMAZ (bos kume yalanci yesil dersi).
#
#  IKINCI MOD — YEREL DOKUM (gelistirici makinesi, docker YOK):
#      bash scripts/s45-olcu.sh dokum
#  Yerel PostgreSQL'den ProductIndex satirlarini JSON'a doker; bu dokumu
#  `backend/test/s45-olcum.ts` (single/multi/none dagilim olcusu) okur.
#
#  CIKIS KODU: 0 = olcum geldi · 2 = ON KOSUL YOK · diger = beklenmedik hata.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

MOD="${1:-canli}"

if [ "$MOD" = "dokum" ]; then
  PSQL_BIN="${PSQL_BIN:-/c/Program Files/PostgreSQL/17/bin/psql.exe}"
  if [ ! -x "$PSQL_BIN" ]; then PSQL_BIN="$(command -v psql || true)"; fi
  if [ -z "$PSQL_BIN" ]; then
    echo "ON KOSUL YOK — psql bulunamadi. PSQL_BIN ile yolunu verin."
    exit 2
  fi
  export PGPASSWORD="${PGPASSWORD:-password}"
  HEDEF="backend/.olcum-urun-dokumu.json"
  "$PSQL_BIN" -U "${PGUSER:-postgres}" -h "${PGHOST:-localhost}" -d "${PGDATABASE:-metaprice}" -t -A -c \
    "SELECT coalesce(json_agg(x)::text, '[]') FROM (SELECT p.*, b.name AS \"brandName\" FROM \"ProductIndex\" p JOIN \"Brand\" b ON b.id = p.\"brandId\") x" \
    > "$HEDEF"
  echo "YEREL DOKUM yazildi: $HEDEF"
  echo "Simdi: cd backend && npx ts-node test/s45-olcum.ts"
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "ON KOSUL YOK — docker bulunamadi. Bu betik sunucuda (/opt/metaprice) kosulur."
  echo "Yerel dokum icin: bash scripts/s45-olcu.sh dokum"
  exit 2
fi

echo "── 0/5 ON KOSUL: yeni kolonlar veritabaninda var mi (db push kosuldu mu) ──"
docker compose exec -T backup sh -c 'psql -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "BEGIN READ ONLY; SELECT count(*) AS yeni_kolon_sayisi_beklenen_2 FROM information_schema.columns WHERE table_name = '"'"'ProductIndex'"'"' AND column_name IN ('"'"'aileZayif'"'"', '"'"'malzemeler'"'"'); ROLLBACK"'
echo "   ⚠ Yukarida 2 GORUNMUYORSA: once prisma db push, sonra reindex. Asagisi anlamsizdir."

echo "── 1/5 (A) aileZayif sayisi + PAYDA + indeks surumu kirilimi ──"
docker compose exec -T backup sh -c 'psql -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "BEGIN READ ONLY; SELECT count(*) AS toplam_urun, count(*) FILTER (WHERE \"aileZayif\") AS aile_zayif, count(*) FILTER (WHERE NOT \"belirsiz\") AS eslesebilir, count(DISTINCT \"indexVersion\") AS farkli_indeks_surumu, min(\"indexVersion\") AS en_eski_surum, max(\"indexVersion\") AS en_yeni_surum FROM \"ProductIndex\"; ROLLBACK"'

echo "── 2/5 (B) aileZayif urunlerin AILE kirilimi (en kalabalik 10) ──"
docker compose exec -T backup sh -c 'psql -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "BEGIN READ ONLY; SELECT \"adSlug\" AS aile, count(*) AS zayif_urun FROM \"ProductIndex\" WHERE \"aileZayif\" GROUP BY 1 ORDER BY 2 DESC LIMIT 10; ROLLBACK"'

echo "── 3/5 (C) FRENIN KESTIGI KUME: aileZayif VE capsiz ──"
docker compose exec -T backup sh -c 'psql -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "BEGIN READ ONLY; SELECT count(*) FILTER (WHERE cardinality(\"capTags\") = 0) AS capsiz_toplam, count(*) FILTER (WHERE cardinality(\"capTags\") = 0 AND \"aileZayif\") AS capsiz_ve_zayif, count(*) FILTER (WHERE cardinality(\"capTags\") = 0 AND \"aileZayif\" AND \"adSlug\" IN ('"'"'boru'"'"', '"'"'vana'"'"', '"'"'fitting'"'"')) AS capsiz_zayif_buyuk_aile FROM \"ProductIndex\"; ROLLBACK"'

echo "── 4/5 (D) malzeme etiketi kirilimi ──"
docker compose exec -T backup sh -c 'psql -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "BEGIN READ ONLY; SELECT count(*) AS toplam_urun, count(*) FILTER (WHERE cardinality(\"malzemeler\") > 0) AS malzemesi_cozulen FROM \"ProductIndex\"; SELECT m AS malzeme, count(*) AS urun FROM \"ProductIndex\", unnest(\"malzemeler\") AS m GROUP BY 1 ORDER BY 2 DESC LIMIT 15; ROLLBACK"'

echo "── 5/5 (E) sozluk tarafi: malzeme bilgisi tasiyan alias sayisi ──"
docker compose exec -T backup sh -c 'psql -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "BEGIN READ ONLY; SELECT count(*) AS toplam_alias, count(*) FILTER (WHERE cardinality(kinds) > 0) AS kinds_dolu, count(*) FILTER (WHERE \"impliedType\" IS NOT NULL) AS aile_ceviren FROM \"TerminologyAlias\"; ROLLBACK"'

echo "── olcum bitti (her adimda BEGIN / tablo / ROLLBACK gorunmeli) ──"
