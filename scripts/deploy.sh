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
#  NE YAPAR: pull → hash'i olc → DEPLOY ONCESI YEDEK → build → up → CANLI
#  DOGRULAMA (health + hash karsilastirmasi). Dogrulama basarisizsa cikis
#  kodu 1 — "deploy oldu sandim" hatasi bir daha yasanmaz.
#
#  ── 04.08.2026: YEDEK ADIMI EKLENDI (3/6) ──────────────────────────────────
#  Oncesinde yedek YALNIZ gunluk dongudeydi (scripts/backup.sh): en kotu
#  ihtimalle 24 saatlik veri, deploy'un kendisi bozarsa geri alinamazdi.
#  Artik her deploy KENDI yedegini alir ve YEDEK BASARISIZSA DEPLOY DURUR —
#  yedeksiz deploy, geri donusu olmayan deploy demektir.
#  Geri yukleme adimlari: docs/GERI_YUKLEME.md
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── CIKIS KODU DISIPLINI (KD8) ──────────────────────────────────────────
# Sozlesme: 0 = TAMAM · 2 = ON SART YOK (SKIP) · diger = HATA.
# `set -e` ile olen bir komut KENDI kodunu birakir (grep 2, curl 22...).
# Bu yuzden 2 KAZARA donebilir ve "atlandi" gibi okunur — tuzak gercekten
# yasandi. Trap beklenmedik her olumu 3'e cevirir; 2 yalniz BILEREK verilir.
trap 'kod=$?; if [ "$kod" -ne 0 ]; then echo ""; echo "❌ DEPLOY YARIDA KESILDI (beklenmedik hata, ham kod=$kod)"; exit 3; fi' ERR

cd "$(dirname "$0")/.."

echo "── 1/6 git pull ──"
git pull origin master

# PK2: imaja gomulen surum damgasi. `export` SART — `docker compose build`
# degiskeni yalnizca ortamdan okur (compose: BUILD_SHA: ${BUILD_SHA:-local}).
export BUILD_SHA="$(git rev-parse --short=12 HEAD)"
BEKLENEN="$BUILD_SHA"
echo "── 2/6 bu deploy'un surumu: $BEKLENEN ──"

# ── 3/6 DEPLOY ONCESI DB YEDEGI ─────────────────────────────────────────────
# NEREDE: `backup` servisinin icinde. Gerekce — pg_dump, PGPASSWORD ve
# /backups baglantisi ZATEN orada (docker-compose.yml:113-126); host'a psql
# kurmak ya da parolayi konsola yazmak GEREKMEZ.
#
# AD: `deploy-oncesi-<sha>-<damga>.sql.gz`. BILEREK `metaprice-*` DEGIL —
# gunluk temizlik deseni (backup.sh) `metaprice-*.sql.gz` arar; deploy
# yedekleri o desene girmedigi icin 14 gun kuralina TAKILMAZ, kendiliginden
# silinmez. Bunun bedeli: birikirler. Elle budama komutu GERI_YUKLEME.md'de.
#
# ⚠ YEDEK BASARISIZSA DEPLOY DURUR. `|| true` ile ciktiyi yakalayip MARKER
# ariyoruz; boylece hem hata metni gorunur hem de ERR trap'e dusup "beklenmedik
# hata (kod 3)" gibi yaniltici bir mesaj cikmaz — bu BILINEN ve KASITLI bir ret.
echo "── 3/6 deploy oncesi DB yedegi ──"
YEDEK_ADI="deploy-oncesi-$BEKLENEN-$(date +%Y%m%d-%H%M%S).sql.gz"
YEDEK_CIKTI="$(docker compose exec -T -e ADI="$YEDEK_ADI" backup sh -c '
  GECICI="/backups/$ADI.yaziliyor"
  rm -f /tmp/deploy-dump-kodu
  ( set +e; pg_dump -h db -U "$POSTGRES_USER" "$POSTGRES_DB"; echo $? > /tmp/deploy-dump-kodu ) | gzip > "$GECICI"
  KOD="$(cat /tmp/deploy-dump-kodu 2>/dev/null || echo 99)"
  rm -f /tmp/deploy-dump-kodu
  if [ "$KOD" -ne 0 ]; then echo "YEDEK HATASI — pg_dump cikis kodu $KOD"; rm -f "$GECICI"; exit 1; fi
  if ! gzip -t "$GECICI" 2>/dev/null; then echo "YEDEK HATASI — gzip butunluk kontrolu kaldi"; rm -f "$GECICI"; exit 1; fi
  if ! gzip -dc "$GECICI" 2>/dev/null | tail -20 | grep -q "PostgreSQL database dump complete"; then
    echo "YEDEK HATASI — dump SONU isareti yok (yarim dump)"; rm -f "$GECICI"; exit 1; fi
  mv "$GECICI" "/backups/$ADI"
  echo "YEDEK DOGRULANDI /backups/$ADI $(wc -c < "/backups/$ADI") bayt"
' 2>&1 || true)"
printf '%s\n' "$YEDEK_CIKTI" | sed 's/^/   /'
if ! printf '%s' "$YEDEK_CIKTI" | grep -q 'YEDEK DOGRULANDI'; then
  echo ""
  echo "❌ DEPLOY DURDURULDU — deploy oncesi yedek ALINAMADI."
  echo "   Yedeksiz deploy, geri donusu olmayan deploy demektir; build'e GECILMEDI."
  echo "   Kod DEGISMEDI, servisler DOKUNULMADI — git pull disinda hicbir sey olmadi."
  echo "   Once yedegi duzeltin (docker compose ps ile db ve backup servisini kontrol edin),"
  echo "   sonra bu betigi tekrar kosun."
  exit 1
fi

echo "── 4/6 docker compose build backend frontend ──"
# DIKKAT: build log'unda `COPY . .` satiri CACHED cikiyorsa kod DEGISMEMISTIR
# (30.07 dersi — iki kez eski kod deploy edildi). BUILD_SHA her deploy'da
# degistigi icin ARG'i kullanan katman zaten yeniden kurulur.
docker compose build backend frontend

echo "── 5/6 docker compose up -d backend frontend ──"
docker compose up -d backend frontend

echo "── 6/6 canli dogrulama ──"
# ⚠ ADRES TUZAGI: `http://localhost/api/health` CALISMAZ. Caddyfile yalniz
# `{$DOMAIN}` ve `www.{$DOMAIN}` site bloklarini tanimliyor; Host basligi
# "localhost" olan istek hicbirine uymaz ve Caddy 404 doner. Backend'in
# 3001 portu ise `expose` (publish DEGIL), yani host'tan erisilemez.
# Sonuc: deploy BASARILI olsa bile dogrulama bos doner ve script yanlislikla
# "DOGRULANAMADI" der. Bu yuzden gercek domain uzerinden sorulur.
# ⚠ `|| true` ZORUNLU: `.env` yoksa `grep` cikis kodu 2 doner, `pipefail` onu
# tasir ve `set -e` scripti OLDURUR — hem de KOD 2 ile. Bu projede 2 =
# "ON SART YOK (SKIP)" demek; yani basarisiz bir deploy "atlandi" anlamina
# gelen bir kod dondururdu. OLCULDU: .env yokken script 6/6 blogundan
# ONCE, sessizce, kod 2 ile oluyordu.
DOMAIN_ADI="$(grep -E '^DOMAIN=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r"'"'"' ' || true)"
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
