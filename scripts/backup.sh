#!/bin/sh
# MetaPrice gunluk DB yedegi — docker-compose "backup" servisi calistirir.
# Dongu: dump al -> 14 gunden eskiyi sil -> 24 saat uyu.
# PGPASSWORD/POSTGRES_USER/POSTGRES_DB compose environment'tan gelir.
while true; do
  echo "[backup] $(date) dump basliyor"
  if pg_dump -h db -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "/backups/metaprice-$(date +%Y%m%d-%H%M%S).sql.gz"; then
    echo "[backup] tamam"
  else
    echo "[backup] HATA"
  fi
  find /backups -name 'metaprice-*.sql.gz' -mtime +14 -delete
  sleep 86400
done
