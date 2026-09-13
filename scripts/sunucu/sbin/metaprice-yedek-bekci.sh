#!/bin/bash
# MetaPriceX Faz 0.7 — yedek tazelik bekcisi.
# Yedekleme yalnizca metaprice-backup-1 konteynerindeki 'sleep 86400' dongusunde
# yasiyordu; konteyner durur/silinirse yedekleme SESSIZCE dururdu. Bu bekci
# tazeligi olcer, bayatsa yedegi KENDI alir ve journal'a yuksek sesle yazar.
set -u
DIZIN=/opt/metaprice/backups
ESIK=$((26*3600))
SON=$(ls -t "$DIZIN"/metaprice-*.sql.gz "$DIZIN"/bekci-*.sql.gz 2>/dev/null | head -1)
SIMDI=$(date +%s)
if [ -n "$SON" ]; then YAS=$(( SIMDI - $(stat -c %Y "$SON") )); else YAS=999999; fi

if [ "$YAS" -lt "$ESIK" ]; then
  logger -t metaprice-yedek -p user.info "TAMAM: son yedek $((YAS/3600)) saat once ($(basename "${SON:-yok}"))"
  exit 0
fi

logger -t metaprice-yedek -p user.err "UYARI: son yedek $((YAS/3600)) saat once — BAYAT. Bekci kendi yedegini aliyor."
D=$(date +%Y%m%d-%H%M%S); G="$DIZIN/.bekci-$D.yaziliyor"; H="$DIZIN/bekci-$D.sql.gz"; I="/tmp/bekci-kod-$D"
docker exec metaprice-backup-1 sh -c "( set +e; pg_dump -h db -U \"\$POSTGRES_USER\" \"\$POSTGRES_DB\"; echo \$? > $I ) | gzip > /backups/$(basename "$G")" 2>/dev/null
KOD=$(docker exec metaprice-backup-1 cat "$I" 2>/dev/null || echo 99)
if [ "$KOD" = "0" ] && gzip -t "$G" 2>/dev/null && gzip -dc "$G" | tail -20 | grep -q 'PostgreSQL database dump complete'; then
  mv "$G" "$H"; logger -t metaprice-yedek -p user.warning "KURTARMA: bekci yedegi alindi -> $(basename "$H")"
else
  rm -f "$G"; logger -t metaprice-yedek -p user.crit "BASARISIZ: bekci yedegi de alinamadi (pg_dump kodu=$KOD) — ELLE MUDAHALE GEREKIR"
fi
docker exec metaprice-backup-1 rm -f "$I" 2>/dev/null
