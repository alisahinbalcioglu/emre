#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  JWT_SECRET KURULUMU — sunucu .env'ine rastgele imza anahtari ekler
#  (KL P1-a / kalem 63'un canli on kosulu)
#
#  KULLANIM (Hetzner web konsolunda):
#      cd /opt/metaprice
#      git pull origin master
#      bash scripts/jwt-secret-kur.sh
#
#  NEDEN BETIK: Hetzner web konsolu TR klavyede  $  >  |  _  karakterlerini
#  YAZAMIYOR (deploy.sh:9-12'de iki kez kayitli vaka). Anahtar uretip dosyaya
#  eklemek bu karakterlerin hepsini gerektirir; hepsi bu dosyanin ICINDE durur,
#  konsola yazilan satirda hicbiri yok.
#
#  NE YAPAR:
#    1. .env'de JWT_SECRET ZATEN VARSA hicbir sey yapmaz (cikis 0) — mevcut
#       anahtari ASLA degistirmez; degistirseydi tum oturumlar bosuna kapanirdi.
#    2. Yoksa: .env'i zaman damgali yedekler, 48 karakterlik rastgele anahtar
#       uretir, dosyaya ekler ve DOGRULAR.
#    3. Anahtari EKRANA YAZMAZ (sirdir; konsol gecmisi ve ekran goruntusu sizar).
#
#  ⚠ DEPLOY UYARISI: bu betik .env'i degistirir ama CALISAN konteynere
#  dokunmaz. Anahtar ancak `bash scripts/deploy.sh` ile (yeniden baslatma)
#  devreye girer — O AN mevcut tum token'lar gecersiz olur, kullanicilar bir
#  kez cikis yapmis olur. Bu kacinilmaz: bugunku anahtar kaynak kodda yaziyor,
#  yani zaten gizli degil.
#
#  CIKIS KODU (KD8): 0 = tamam/zaten var · 2 = on kosul yok · diger = hata
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

ENVDOSYA=".env"

if [ ! -f "$ENVDOSYA" ]; then
  echo "ON KOSUL YOK — $PWD/.env bulunamadi. Yanlis dizinde olabilirsiniz (cd /opt/metaprice)."
  exit 2
fi

if grep -q '^[[:space:]]*JWT_SECRET=' "$ENVDOSYA"; then
  echo "ZATEN TANIMLI — .env icinde JWT_SECRET var, DOKUNULMADI."
  echo "  (Mevcut anahtar korunur; degistirilseydi tum oturumlar bosuna kapanirdi.)"
  exit 0
fi

YEDEK=".env.yedek-$(date +%Y%m%d-%H%M%S)"
cp "$ENVDOSYA" "$YEDEK"
echo "── .env yedeklendi: $YEDEK"

# Rastgele anahtar: once openssl, yoksa /dev/urandom. Ozel karakterler
# ayiklanir (env dosyasinda tirnak/kacis sorunu cikarmasin diye).
if command -v openssl >/dev/null 2>&1; then
  ANAHTAR="$(openssl rand -base64 64 | tr -d '\n=+/' | cut -c1-48)"
  KAYNAK="openssl"
else
  ANAHTAR="$(head -c 96 /dev/urandom | base64 | tr -d '\n=+/' | cut -c1-48)"
  KAYNAK="/dev/urandom"
fi

if [ "${#ANAHTAR}" -lt 32 ]; then
  echo "HATA — uretilen anahtar 32 karakterden kisa (${#ANAHTAR}); .env DEGISTIRILMEDI."
  rm -f "$YEDEK"
  exit 3
fi

printf 'JWT_SECRET="%s"\n' "$ANAHTAR" >> "$ENVDOSYA"

SAYI="$(grep -c '^[[:space:]]*JWT_SECRET=' "$ENVDOSYA")"
UZUNLUK="${#ANAHTAR}"
echo "── EKLENDI"
echo "   kaynak            : $KAYNAK"
echo "   anahtar uzunlugu  : $UZUNLUK karakter"
echo "   .env'deki JWT_SECRET satiri: $SAYI  (1 olmali)"
echo "   anahtarin KENDISI ekrana YAZILMADI — sirdir."
echo ""
echo "SONRAKI ADIM: bash scripts/deploy.sh"
echo "  (o an yeni anahtar devreye girer; mevcut oturumlar kapanir, herkes bir kez tekrar giris yapar)"

if [ "$SAYI" != "1" ]; then
  echo "UYARI — beklenen 1 satir, gorulen $SAYI. Yedek: $YEDEK"
  exit 4
fi
exit 0
