#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  SIR DONDURME — JWT_SECRET · POSTGRES_PASSWORD · INTERNAL_API_TOKEN   (Faz 0.14)
#
#  KULLANIM (sunucuda):   cd /opt/metaprice && bash scripts/sir-dondur.sh
#     (deploydan once kopyadan: METAPRICE_DIR=/opt/metaprice bash /root/sir-dondur.sh)
#
#  NEDEN: Sunucu 02.07–06.09 arasi parola ile root girisine acikti ve .env'in
#  duz metin kopyalari sunucu disina cikti (0.9b ile kapatildi). ICERIDE uretilen
#  uc sir burada dondurulur. DISARIDA uretilenler bu betigin ISI DEGILDIR:
#    CLAUDE_API_KEY  → DB SystemSettings; Anthropic Console'dan dondurulur,
#                      admin panelinden yeni deger girilir.
#    IYZICO_*        → .env; iyzico panelinden dondurulur (bugun sandbox).
#
#  NE YAPAR — sirasiyla:
#    1) On kosullar (.env, docker, db calisiyor, her sir tam bir satirda)
#    2) Dogrulanmis yedek (backup servisinde pg_dump) — geri donus yolu
#    3) Yeni degerler (openssl rand -hex). HICBIR SIR EKRANA YAZILMAZ; yalniz
#       sha256'nin ilk 12 karakteri — degistigini ve tasindigini kanitlamak icin.
#    4) .env zaman damgali yedeklenir (0600), degerler yerine yazilir, dogrulanir
#    5) DB parolasi ALTER USER ile degisir — SQL stdin'den gider, komut
#       satirinda ve surec listesinde gorunmez
#    6) docker compose up -d → env'i degisen konteynerler yeniden yaratilir
#       (db, backend, backup, dwg-engine). ~10-20 sn kesinti.
#       ⚠ TUM OTURUMLAR DUSER (JWT): herkes bir kez daha giris yapar.
#    7) KANIT: yeni parola ag uzerinden calisiyor VE eski parola REDDEDILIYOR;
#       backend'in JWT'si ve backend+motorun ic token'i .env ile ayni (sha256);
#       /api/health 200.
#
#  ADIM 5 ILE 6 ARASI: backend'in mevcut baglantilari yasar, YENI baglanti
#  eski parolayla reddedilir. Bu pencere birkac saniyedir; bu yuzden iki adim
#  arasinda hicbir ek is yoktur.
#
#  GERI DONUS: cp .env.yedek-sir-<damga> .env  →  ALTER USER ... eski parola
#  (yedek dosyada) → docker compose up -d. Eski .env yedegi ESKI PAROLAYI
#  ICERIR; dogrulama bitince silin.
#
#  CIKIS KODU (KD8): 0 = tamam ve kanitlandi · 2 = on kosul yok
#  · 1 = basarisiz (mesaj + geri donus yolu) · 3 = beklenmedik hata (trap)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
ENV_YEDEK=""
trap 'kod=$?; if [ "$kod" -ne 0 ]; then echo ""; echo "❌ SIR DONDURME YARIDA KESILDI (ham kod=$kod). .env yedegi: ${ENV_YEDEK:-henuz alinmadi}"; exit 3; fi' ERR
# METAPRICE_DIR verilirse oraya gider (betik deploydan ONCE /root kopyasindan kosturulabilsin diye)
cd "${METAPRICE_DIR:-$(dirname "$0")/..}"

[ -f .env ] || { echo "ON KOSUL YOK — .env bulunamadi (cd /opt/metaprice)."; exit 2; }
command -v docker  >/dev/null || { echo "ON KOSUL YOK — docker yok.";  exit 2; }
command -v openssl >/dev/null || { echo "ON KOSUL YOK — openssl yok."; exit 2; }
docker compose ps --status running --format '{{.Service}}' 2>/dev/null | grep -qx db \
  || { echo "ON KOSUL YOK — db servisi calismiyor."; exit 2; }

oku() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | tr -d '"\r'; }
sha() { printf '%s' "$1" | sha256sum | cut -c1-12; }

for k in POSTGRES_USER POSTGRES_DB POSTGRES_PASSWORD JWT_SECRET INTERNAL_API_TOKEN DOMAIN; do
  [ -n "$(oku "$k")" ] || { echo "ON KOSUL YOK — .env icinde $k bos ya da yok."; exit 2; }
  [ "$(grep -cE "^$k=" .env)" = 1 ] || { echo "ON KOSUL YOK — .env icinde $k birden fazla satirda."; exit 2; }
done
PG_USER="$(oku POSTGRES_USER)"; PG_DB="$(oku POSTGRES_DB)"; DOMAIN="$(oku DOMAIN)"
ESKI_PG="$(oku POSTGRES_PASSWORD)"; ESKI_JWT="$(oku JWT_SECRET)"; ESKI_IC="$(oku INTERNAL_API_TOKEN)"
echo "── 1/7 on kosullar tamam — db $PG_USER@$PG_DB · eski sirlar (sha256/12): pg=$(sha "$ESKI_PG") jwt=$(sha "$ESKI_JWT") ic=$(sha "$ESKI_IC")"

# ── 2) YEDEK — deploy.sh ile ayni yol: backup servisinde pg_dump, ad ancak dogrulaninca kesinlesir
DAMGA="$(date +%Y%m%d-%H%M%S)"
YEDEK_ADI="sir-dondurme-oncesi-$DAMGA.sql.gz"
echo "── 2/7 yedek aliniyor: backups/$YEDEK_ADI"
YEDEK_CIKTI="$(docker compose exec -T -e ADI="$YEDEK_ADI" backup sh -c '
  GECICI="/backups/$ADI.yaziliyor"
  if pg_dump -h db -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$GECICI" \
     && gzip -t "$GECICI" && gzip -dc "$GECICI" | tail -20 | grep -q "PostgreSQL database dump complete"; then
    mv "$GECICI" "/backups/$ADI"; echo "YEDEK DOGRULANDI $(wc -c < "/backups/$ADI") bayt"
  else rm -f "$GECICI"; echo "YEDEK BASARISIZ"; fi' </dev/null 2>&1 || true)"
echo "   $YEDEK_CIKTI"
echo "$YEDEK_CIKTI" | grep -q '^YEDEK DOGRULANDI' || { echo "❌ yedek alinamadi — HICBIR SEY DEGISTIRILMEDI."; exit 1; }

# ── 3) YENI DEGERLER — uzunluklar mevcutla ayni: pg 32 · jwt 64 · ic 48 (hex)
YENI_PG="$(openssl rand -hex 16)"; YENI_JWT="$(openssl rand -hex 32)"; YENI_IC="$(openssl rand -hex 24)"
[ "${#YENI_PG}" = 32 ] && [ "${#YENI_JWT}" = 64 ] && [ "${#YENI_IC}" = 48 ] \
  || { echo "❌ uretilen deger uzunlugu beklenmedik — HICBIR SEY DEGISTIRILMEDI."; exit 1; }
[ "$YENI_PG" != "$ESKI_PG" ] && [ "$YENI_JWT" != "$ESKI_JWT" ] && [ "$YENI_IC" != "$ESKI_IC" ] \
  || { echo "❌ yeni deger eskiyle ayni cikti — HICBIR SEY DEGISTIRILMEDI."; exit 1; }
echo "── 3/7 yeni degerler uretildi (ekrana YAZILMAZ) — sha256/12: pg=$(sha "$YENI_PG") jwt=$(sha "$YENI_JWT") ic=$(sha "$YENI_IC")"

# ── 4) .env — yedekle, yerine yaz, DOGRULA (dogrulanamazsa geri al, DB'ye dokunma)
ENV_YEDEK=".env.yedek-sir-$DAMGA"
cp -p .env "$ENV_YEDEK"; chmod 600 "$ENV_YEDEK"
sed -i -E "s|^POSTGRES_PASSWORD=.*$|POSTGRES_PASSWORD=$YENI_PG|; s|^JWT_SECRET=.*$|JWT_SECRET=$YENI_JWT|; s|^INTERNAL_API_TOKEN=.*$|INTERNAL_API_TOKEN=$YENI_IC|" .env
chmod 600 .env
if [ "$(oku POSTGRES_PASSWORD)" != "$YENI_PG" ] || [ "$(oku JWT_SECRET)" != "$YENI_JWT" ] || [ "$(oku INTERNAL_API_TOKEN)" != "$YENI_IC" ]; then
  cp -p "$ENV_YEDEK" .env
  echo "❌ .env yazimi dogrulanamadi — .env GERI ALINDI, DB'ye DOKUNULMADI."; exit 1
fi
echo "── 4/7 .env guncellendi (yedek: $ENV_YEDEK, 0600)"

# ── 5) DB PAROLASI — SQL stdin'den; konteyner icinde yerel soket 'trust' oldugundan eski parola gerekmez
echo "── 5/7 DB parolasi degistiriliyor (ALTER USER)"
if ! printf "ALTER USER \"%s\" WITH PASSWORD '%s';\n" "$PG_USER" "$YENI_PG" \
     | docker compose exec -T db psql -U "$PG_USER" -d "$PG_DB" -q -v ON_ERROR_STOP=1 >/dev/null 2>&1; then
  cp -p "$ENV_YEDEK" .env
  echo "❌ ALTER USER basarisiz — .env GERI ALINDI (DB parolasi DEGISMEDI)."; exit 1
fi

# ── 6) KONTEYNERLER — env'i degisenler yeniden yaratilir; frontend/caddy'ye dokunulmaz
echo "── 6/7 docker compose up -d (db, backend, backup, dwg-engine yeniden yaratilir; ~10-20 sn)"
docker compose up -d </dev/null 2>&1 | grep -iE 'recreat|creat|start|error' | sed 's/^/   /' || true
KOD=000
for i in $(seq 1 30); do
  KOD="$(curl -s -m 8 -o /dev/null -w '%{http_code}' "https://$DOMAIN/api/health" 2>/dev/null || echo 000)"
  [ "$KOD" = "200" ] && break
  sleep 3
done

# ── 7) KANIT — her iddia olculur, deger yazilmadan
echo "── 7/7 kanitlar"
HATA=0
if docker compose exec -T backup psql -h db -U "$PG_USER" -d "$PG_DB" -Atc 'select 1' </dev/null >/dev/null 2>&1; then
  echo "   ✓ YENI DB parolasi ag uzerinden kabul edildi (backup konteyneri → db)"
else
  echo "   ❌ YENI DB parolasiyla baglanti KURULAMADI"; HATA=1
fi
if docker compose exec -T -e PGPASSWORD="$ESKI_PG" backup psql -h db -U "$PG_USER" -d "$PG_DB" -Atc 'select 1' </dev/null >/dev/null 2>&1; then
  echo "   ❌ ESKI DB parolasi HALA kabul ediliyor — dondurme gercek degil"; HATA=1
else
  echo "   ✓ ESKI DB parolasi reddedildi"
fi
BE_JWT="$(docker compose exec -T backend sh -c 'printf %s "$JWT_SECRET" | sha256sum | cut -c1-12' </dev/null 2>/dev/null | tr -d '\r' || true)"
if [ "$BE_JWT" = "$(sha "$YENI_JWT")" ]; then echo "   ✓ backend YENI JWT_SECRET'i tasiyor ($BE_JWT)"
else echo "   ❌ backend JWT_SECRET yeni degil (konteyner=$BE_JWT beklenen=$(sha "$YENI_JWT"))"; HATA=1; fi
BE_IC="$(docker compose exec -T backend sh -c 'printf %s "$DWG_ENGINE_TOKEN" | sha256sum | cut -c1-12' </dev/null 2>/dev/null | tr -d '\r' || true)"
MO_IC="$(docker compose exec -T dwg-engine sh -c 'printf %s "$INTERNAL_API_TOKEN" | sha256sum | cut -c1-12' </dev/null 2>/dev/null | tr -d '\r' || true)"
if [ "$BE_IC" = "$(sha "$YENI_IC")" ] && [ "$MO_IC" = "$(sha "$YENI_IC")" ]; then echo "   ✓ backend ve motor ayni YENI ic token'i tasiyor ($BE_IC)"
else echo "   ❌ ic token uyusmazligi (backend=$BE_IC motor=$MO_IC beklenen=$(sha "$YENI_IC"))"; HATA=1; fi
if [ "$KOD" = "200" ]; then echo "   ✓ https://$DOMAIN/api/health → 200"
else echo "   ❌ /api/health → $KOD (backend ayaga kalkmadi?)"; HATA=1; fi

echo ""
if [ "$HATA" = 0 ]; then
  echo "SIR DONDURME TAMAM VE KANITLANDI."
  echo "  · Tum oturumlar dustu — herkes bir kez yeniden giris yapar."
  echo "  · Eski .env yedegi ESKI PAROLAYI ICERIR: $ENV_YEDEK — dogrulama bitince silin."
  echo "  · Bu betigin DOKUNMADIGI sirlar: CLAUDE_API_KEY (DB) · IYZICO_* (.env) — saglayici panelinden."
  exit 0
else
  echo "❌ EN AZ BIR KANIT BASARISIZ. Geri donus: cp $ENV_YEDEK .env → ALTER USER (eski parola yedekte) → docker compose up -d"
  exit 1
fi
