#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  MetaPrice — VERITABANI GERI YUKLEME   (04.08.2026)
#
#  KULLANIM (Hetzner web konsolunda — hicbir satirda yasak karakter yok):
#      cd /opt/metaprice
#      bash scripts/geri-yukle.sh liste
#      bash scripts/geri-yukle.sh metaprice-20260804-030000.sql.gz
#
#  NEDEN BETIK — bu sefer kolaylik degil, ZORUNLULUK:
#  Geri yukleme komutunun kalbi `gzip -dc dosya | psql ...` borusudur ve
#  Hetzner web konsolu TR klavyede `|` KARAKTERINI YAZAMIYOR. Yani prosedurun
#  en kritik komutu konsola ELLE YAZILAMAZ. Ayni sey `"` `(` `)` `$` `>` icin
#  de gecerli. Prosedur betikte durmazsa, felaket aninda uygulanamaz.
#  (Anlatim ve karar adimlari: docs/GERI_YUKLEME.md)
#
#  NE YAPAR — sirasiyla:
#    1) Yedegin BUTUNLUGUNU dogrular (bozuk yedekle geri yukleme baslamaz)
#    2) Su anki durumu gosterir ve ELLE ONAY ister
#    3) GERI YUKLEMEDEN ONCE mevcut veritabaninin yedegini alir ve DOGRULAR
#       (yanlis yedegi secmis olma ihtimaline karsi tek can simidi budur)
#    4) backend/frontend'i durdurur (yukleme sirasinda yazma olmasin)
#    5) Veritabanini bosaltip yedegi yukler
#    6) Satir sayilariyla DOGRULAR
#    7) Servisleri tekrar baslatir
#
#  ⚠ VERI KAYBI: 5. adim mevcut veritabanini SILER. Yedek anindan bu yana
#  girilen her sey kaybolur. Betik bunu adim 2'de yuzunuze soyler ve ONAY ister.
#
#  CIKIS KODU SOZLESMESI (KD8, deploy.sh ile ayni):
#    0 = geri yukleme TAMAM ve dogrulandi  ·  2 = ON KOSUL YOK (dosya yok,
#    bozuk yedek, docker yok, onay verilmedi)  ·  1 = geri yukleme BASARISIZ
#    ·  3 = beklenmedik hata (trap)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
trap 'kod=$?; if [ "$kod" -ne 0 ]; then echo ""; echo "❌ GERI YUKLEME YARIDA KESILDI (beklenmedik hata, ham kod=$kod)"; echo "   Veritabaninin durumunu MUTLAKA kontrol edin — bkz. docs/GERI_YUKLEME.md son bolum."; exit 3; fi' ERR

cd "$(dirname "$0")/.."

PG_KULLANICI="$(grep -E '^POSTGRES_USER=' .env 2>/dev/null | cut -d= -f2- | tr -d '\r"' || true)"
PG_VERITABANI="$(grep -E '^POSTGRES_DB=' .env 2>/dev/null | cut -d= -f2- | tr -d '\r"' || true)"
PG_KULLANICI="${PG_KULLANICI:-metaprice}"
PG_VERITABANI="${PG_VERITABANI:-metaprice}"

if ! command -v docker >/dev/null 2>&1; then
  echo "ON KOSUL YOK — docker bulunamadi. Bu betik sunucuda (/opt/metaprice) kosulur."
  exit 2
fi

# ── LISTE KIPI ──────────────────────────────────────────────────────────────
if [ "${1:-}" = "liste" ] || [ -z "${1:-}" ]; then
  echo "── ELDEKI YEDEKLER (en yenisi ustte) ──"
  ls -lht backups/ 2>/dev/null | grep -E '\.sql\.gz$' || echo "   (backups/ klasorunde yedek YOK — bu basli basina bir sorundur)"
  echo ""
  echo "   metaprice-*      : gunluk otomatik yedek (scripts/backup.sh, 14 gun saklanir)"
  echo "   deploy-oncesi-*  : her deploy'un basinda alinan yedek (kendiliginden silinmez)"
  echo "   geri-yukleme-oncesi-* : bir onceki geri yuklemenin can simidi"
  echo ""
  echo "   Geri yuklemek icin: bash scripts/geri-yukle.sh DOSYA-ADI"
  exit 2
fi

AD="$(basename "$1")"
YOL="backups/$AD"

if [ ! -f "$YOL" ]; then
  echo "ON KOSUL YOK — yedek bulunamadi: $YOL"
  echo "   Eldekileri gormek icin: bash scripts/geri-yukle.sh liste"
  exit 2
fi

# ── 1) YEDEGIN BUTUNLUGU — bozuk yedekle ISE BASLANMAZ ──────────────────────
echo "── 1/7 yedek butunlugu: $AD ──"
if ! gzip -t "$YOL" 2>/dev/null; then
  echo "ON KOSUL YOK — gzip butunluk kontrolu KALDI. Bu dosya BOZUK, geri yuklenemez."
  echo "   Baska bir yedek secin: bash scripts/geri-yukle.sh liste"
  exit 2
fi
if ! gzip -dc "$YOL" 2>/dev/null | tail -20 | grep -q 'PostgreSQL database dump complete'; then
  echo "ON KOSUL YOK — dump SONU isareti yok. Bu dosya YARIM bir dump."
  echo "   (04.08 oncesi alinan yedeklerde bu mumkun: o tarihe kadar backup.sh"
  echo "    basarisiz dump'i da 'tamam' diye damgaliyordu.) Baska yedek secin."
  exit 2
fi
echo "   ✔ gzip butunlugu ve dump SONU isareti dogrulandi ($(wc -c < "$YOL") bayt)"

# ── 2) SU ANKI DURUM + ONAY ─────────────────────────────────────────────────
echo ""
echo "── 2/7 SU ANKI veritabani (geri yuklerseniz BUNLAR GIDECEK) ──"
docker compose exec -T db psql -U "$PG_KULLANICI" -d "$PG_VERITABANI" -c \
  'SELECT (SELECT count(*) FROM "User") AS kullanici, (SELECT count(*) FROM "UserLibrary") AS kutuphane_satiri, (SELECT count(*) FROM "Quote") AS teklif, (SELECT count(*) FROM "Brand") AS marka;'
echo ""
echo "   ⚠ Yedegin alindigi andan BUGUNE kadar girilen HER SEY kaybolacak."
echo "   Devam etmek icin buyuk harfle EVET yazip enter'a basin (baska her sey iptal eder):"
read -r ONAY
if [ "$ONAY" != "EVET" ]; then
  echo "IPTAL EDILDI — hicbir sey degismedi."
  exit 2
fi

# ── 3) CAN SIMIDI — mevcut durumun yedegi ───────────────────────────────────
echo ""
echo "── 3/7 mevcut durumun yedegi aliniyor (yanlis dosyayi sectiyseniz tek donusunuz) ──"
CAN_ADI="geri-yukleme-oncesi-$(date +%Y%m%d-%H%M%S).sql.gz"
CAN_CIKTI="$(docker compose exec -T -e ADI="$CAN_ADI" backup sh -c '
  GECICI="/backups/$ADI.yaziliyor"
  rm -f /tmp/geri-dump-kodu
  ( set +e; pg_dump -h db -U "$POSTGRES_USER" "$POSTGRES_DB"; echo $? > /tmp/geri-dump-kodu ) | gzip > "$GECICI"
  KOD="$(cat /tmp/geri-dump-kodu 2>/dev/null || echo 99)"
  rm -f /tmp/geri-dump-kodu
  if [ "$KOD" -ne 0 ]; then echo "CAN SIMIDI HATASI — pg_dump cikis kodu $KOD"; rm -f "$GECICI"; exit 1; fi
  if ! gzip -t "$GECICI" 2>/dev/null; then echo "CAN SIMIDI HATASI — gzip butunlugu"; rm -f "$GECICI"; exit 1; fi
  if ! gzip -dc "$GECICI" 2>/dev/null | tail -20 | grep -q "PostgreSQL database dump complete"; then
    echo "CAN SIMIDI HATASI — dump SONU isareti yok"; rm -f "$GECICI"; exit 1; fi
  mv "$GECICI" "/backups/$ADI"
  echo "CAN SIMIDI HAZIR /backups/$ADI $(wc -c < "/backups/$ADI") bayt"
' 2>&1 || true)"
printf '%s\n' "$CAN_CIKTI" | sed 's/^/   /'
if ! printf '%s' "$CAN_CIKTI" | grep -q 'CAN SIMIDI HAZIR'; then
  echo ""
  echo "❌ DURDURULDU — mevcut durumun yedegi ALINAMADI."
  echo "   Geri yuklemeye BASLANMADI; veritabaniniz OLDUGU GIBI duruyor."
  echo "   Can simidi olmadan geri yukleme yapmak, yanlis dosya secildiginde"
  echo "   geri donusu olmayan bir kayip demektir."
  exit 2
fi

# ── 4) SERVISLERI DURDUR ────────────────────────────────────────────────────
echo ""
echo "── 4/7 backend ve frontend durduruluyor (yukleme sirasinda yazma olmasin) ──"
docker compose stop backend frontend

# ── 5) VERITABANINI BOSALT VE YUKLE ─────────────────────────────────────────
echo ""
echo "── 5/7 veritabani yeniden olusturuluyor ──"
# `postgres` bakim veritabanina baglaniriz: kendi baglandigin veritabanini
# DROP edemezsin. Kalan baglantilar once koparilir, yoksa DROP "database is
# being accessed by other users" hatasi verir.
docker compose exec -T db psql -U "$PG_KULLANICI" -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$PG_VERITABANI' AND pid <> pg_backend_pid();" \
  -c "DROP DATABASE IF EXISTS \"$PG_VERITABANI\";" \
  -c "CREATE DATABASE \"$PG_VERITABANI\" OWNER \"$PG_KULLANICI\";"

echo "── 6/7 yedek yukleniyor (buyuk yedeklerde birkac dakika surebilir) ──"
YUKLEME_KODU=0
gzip -dc "$YOL" | docker compose exec -T db \
  psql -U "$PG_KULLANICI" -d "$PG_VERITABANI" -v ON_ERROR_STOP=1 -q > /tmp/geri-yukleme.log 2>&1 || YUKLEME_KODU=$?

if [ "$YUKLEME_KODU" -ne 0 ]; then
  echo ""
  echo "❌ GERI YUKLEME BASARISIZ (psql cikis kodu $YUKLEME_KODU)"
  echo "   Son hata satirlari:"
  tail -20 /tmp/geri-yukleme.log | sed 's/^/     /'
  echo ""
  echo "   ⚠ VERITABANI SU AN YARIM DURUMDA. Yapilacak:"
  echo "   Can simidiyle geri donun: bash scripts/geri-yukle.sh $CAN_ADI"
  exit 1
fi
echo "   ✔ psql tek hata vermeden bitti (ON_ERROR_STOP etkindi)"

# ── 7) DOGRULA VE SERVISLERI BASLAT ─────────────────────────────────────────
echo ""
echo "── 7/7 geri yuklenen veritabani ──"
docker compose exec -T db psql -U "$PG_KULLANICI" -d "$PG_VERITABANI" -c \
  'SELECT (SELECT count(*) FROM "User") AS kullanici, (SELECT count(*) FROM "UserLibrary") AS kutuphane_satiri, (SELECT count(*) FROM "Quote") AS teklif, (SELECT count(*) FROM "Brand") AS marka;'

echo ""
echo "   servisler baslatiliyor"
docker compose start backend frontend

echo ""
echo "✅ GERI YUKLEME TAMAM — kaynak: $AD"
echo "   Can simidi (bu islemden ONCEKI durum): backups/$CAN_ADI"
echo "   SIMDI ELLE DOGRULAYIN: siteye girin, bir teklif ve kutuphane sayfasi acin."
echo "   Yukaridaki sayilar makinenin cevabidir; ekranin dogru calistigini KANITLAMAZ."
exit 0
