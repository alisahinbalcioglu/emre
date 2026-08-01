#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  MetaPrice — VPS DEPLOY  (PK2, 31.07.2026)
#
#  KULLANIM (Hetzner web konsolunda):
#      cd /opt/metaprice
#      bash scripts/deploy.sh
#
#  NEDEN SCRIPT: Hetzner web konsolu TR klavyede  $  >  |  _  karakterlerini
#  YAZAMIYOR (27.07 ve 31.07'de iki kez yasandi: pg_dump→pg-dump, $VAR→4VAR).
#  Yani kullanici konsola `BUILD_SHA=$(git rev-parse HEAD)` YAZAMAZ. Butun ozel
#  karakterler bu dosyanin icinde durur; konsolda yazilan satirda hicbiri yok.
#
#  NE YAPAR: pull → hash'i olc → build → up → CANLI DOGRULAMA (health + hash
#  karsilastirmasi). Dogrulama basarisizsa cikis kodu 1 — "deploy oldu sandim"
#  hatasi bir daha yasanmaz.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/.."

echo "── 1/5 git pull ──"
git pull origin master

# PK2: imaja gomulen surum damgasi. `export` SART — `docker compose build`
# degiskeni yalnizca ortamdan okur (compose: BUILD_SHA: ${BUILD_SHA:-local}).
export BUILD_SHA="$(git rev-parse --short=12 HEAD)"
BEKLENEN="$BUILD_SHA"
echo "── 2/5 bu deploy'un surumu: $BEKLENEN ──"

echo "── 3/5 docker compose build backend frontend ──"
# DIKKAT: build log'unda `COPY . .` satiri CACHED cikiyorsa kod DEGISMEMISTIR
# (30.07 dersi — iki kez eski kod deploy edildi). BUILD_SHA her deploy'da
# degistigi icin ARG'i kullanan katman zaten yeniden kurulur.
docker compose build backend frontend

echo "── 4/5 docker compose up -d backend frontend ──"
docker compose up -d backend frontend

echo "── 5/5 canli dogrulama ──"
# ⚠ ADRES TUZAGI: `http://localhost/api/health` CALISMAZ. Caddyfile yalniz
# `{$DOMAIN}` ve `www.{$DOMAIN}` site bloklarini tanimliyor; Host basligi
# "localhost" olan istek hicbirine uymaz ve Caddy 404 doner. Backend'in
# 3001 portu ise `expose` (publish DEGIL), yani host'tan erisilemez.
# Sonuc: deploy BASARILI olsa bile dogrulama bos doner ve script yanlislikla
# "DOGRULANAMADI" der. Bu yuzden gercek domain uzerinden sorulur.
DOMAIN_ADI="$(grep -E '^DOMAIN=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r"'"'"' ')"
if [ -z "$DOMAIN_ADI" ]; then
  echo "   ⚠ .env icinde DOMAIN bulunamadi — metapricex.com varsayiliyor"
  DOMAIN_ADI="metapricex.com"
fi
echo "   adres: https://$DOMAIN_ADI/api/health"

# Container'in ayaga kalkmasini bekle (migrate deploy + nest boot).
YANIT=""
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 3
  YANIT="$(curl -fsSL --max-time 20 "https://$DOMAIN_ADI/api/health" || true)"
  if [ -n "$YANIT" ]; then break; fi
  echo "   ... health henuz cevap vermiyor (deneme $i/10)"
done

echo "   /api/health → $YANIT"
CANLI="$(printf '%s' "$YANIT" | sed -n 's/.*"build_sha":"\([^"]*\)".*/\1/p')"

if [ "$CANLI" = "$BEKLENEN" ]; then
  echo ""
  echo "✅ DEPLOY DOGRULANDI — canli surum: $CANLI"
  echo "   (Bu satir 'sozlu teyit' degil, sunucunun kendi cevabidir.)"
else
  echo ""
  echo "❌ DEPLOY DOGRULANAMADI"
  echo "   beklenen: $BEKLENEN"
  echo "   canli   : ${CANLI:-<okunamadi>}"
  echo "   Olasi sebep: build cache'ten geldi, ya da container yeniden baslamadi."
  exit 1
fi
