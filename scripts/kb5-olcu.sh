#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  KALEM 58 / KB5 — kutuphane baglanti OLCUSU (SALT-OKUMA)
#
#  KULLANIM (Hetzner web konsolunda, sirayla):
#      cd /opt/metaprice
#      git pull origin master
#      bash scripts/kb5-olcu.sh
#
#  NEDEN SCRIPT (deploy.sh deseni): Hetzner web konsolu TR klavyede bazi
#  ozel karakterleri yazamiyor/bozuyor (deploy.sh:9-12'de iki kez yasanmis
#  vaka kayitli). Ozel karakterlerin TAMAMI bu dosyanin icinde durur;
#  konsola yazilan uc satirin hicbirinde ozel karakter yok.
#
#  NE OLCER — dort sayi, tek sorguda (KALEM 58 / KB5):
#    bagsizsatir     = productIndexId bos (NULL) olan UserLibrary satiri
#    bagsizkullanici = bu satirlarin ait oldugu AYRI kullanici sayisi
#    kismikullanici  = hem bos hem dolu satiri olan kullanici (en sinsi vaka)
#    toplamkullanici = "User" tablosundaki toplam kullanici (PAYDA)
#
#  YALNIZ OKUR: sorgu BEGIN READ ONLY icinde, sonda ROLLBACK. Yazan hicbir
#  ifade yok (bunu goz karari degil, tarama kanitlar — rapora bak).
#
#  BAGLANTI YOLU tahmin degil: backup servisinin HER GUN calisan yolu.
#  backup.sh:7 ayni kimlikle ayni "db" hedefine baglanip dump aliyor;
#  kimlik bilgileri compose environment'tan gelir (docker-compose.yml:119-122).
#
#  CIKIS KODU (KD8): 0 = olcum geldi · 2 = ON KOSUL YOK (docker yok) ·
#                    diger = beklenmedik hata.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "ON KOSUL YOK — docker bulunamadi. Bu betik sunucuda (/opt/metaprice) kosulur."
  exit 2
fi

echo "── KB5 olcum sorgusu (salt-okuma, dort sayi) ──"
docker compose exec -T backup sh -c 'psql -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "BEGIN READ ONLY; SELECT (SELECT count(*) FROM \"UserLibrary\" WHERE \"productIndexId\" IS NULL) AS bagsizsatir, (SELECT count(DISTINCT \"userId\") FROM \"UserLibrary\" WHERE \"productIndexId\" IS NULL) AS bagsizkullanici, (SELECT count(*) FROM (SELECT \"userId\" FROM \"UserLibrary\" GROUP BY \"userId\" HAVING bool_or(\"productIndexId\" IS NULL) AND bool_or(\"productIndexId\" IS NOT NULL)) kismi) AS kismikullanici, (SELECT count(*) FROM \"User\") AS toplamkullanici; ROLLBACK"'
echo "── olcum bitti (yukarida BEGIN / tablo / ROLLBACK gorunmeli) ──"
