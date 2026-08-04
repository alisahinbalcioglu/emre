#!/bin/sh
# MetaPrice gunluk DB yedegi — docker-compose "backup" servisi calistirir.
# Dongu: dump al -> DOGRULA -> adini kesinlestir -> ancak o zaman eskiyi sil -> 24 saat uyu.
# PGPASSWORD/POSTGRES_USER/POSTGRES_DB compose environment'tan gelir.
#
# ── 04.08.2026 — IKI SESSIZ KUSUR DUZELTILDI ────────────────────────────────
# (1) `find ... -delete` `if` blogunun DISINDAYDI: dump BASARISIZ olsa bile
#     her gun kosuyordu. Ust uste 14 gun basarisiz dump = 14 gun sonra ELDE
#     HIC YEDEK YOK, hem de kimse fark etmeden. Artik silme YALNIZ dogrulanmis
#     yeni bir yedek olustuktan sonra kosar.
# (2) `pg_dump | gzip > dosya` boru hattinin cikis kodu GZIP'in kodudur.
#     pg_dump yarida olse bile gzip kirik ciktiyi basariyla sikistirir ve `if`
#     "tamam" der. Yani BOZUK bir yedek "basarili" damgasi aliyordu. Artik
#     pg_dump'in KENDI kodu yakalaniyor (asagidaki isaret dosyasi) ve ustune
#     iki bagimsiz butunluk kontrolu yapiliyor.
#
# NOT — `set -e` ve alt kabuk: `( pg_dump; echo $? > isaret )` yapisi `set -e`
# altinda ISE YARAMAZ; pg_dump olunce alt kabuk hemen kapanir ve `echo`
# calismaz (olculdu, isaret dosyasi hic yazilmadi). Bu yuzden alt kabugun
# basinda `set +e` var. Yapi POSIX sh (dash) altinda da dogrulandi.

BEKLETME=86400          # iki dump arasi (saniye)
SAKLAMA_GUN=14          # bundan eski dogrulanmis yedekler silinir
ISARET=/tmp/pgdump-kodu

while true; do
  echo "[backup] $(date) dump basliyor"

  DAMGA="$(date +%Y%m%d-%H%M%S)"
  HEDEF="/backups/metaprice-$DAMGA.sql.gz"
  # Gecici ad BILEREK `.sql.gz` ile BITMEZ: yarim kalmis bir dosya ne geri
  # yukleme listesinde gorunur ne de temizlik desenine takilir.
  GECICI="$HEDEF.yaziliyor"

  rm -f "$ISARET"
  ( set +e; pg_dump -h db -U "$POSTGRES_USER" "$POSTGRES_DB"; echo $? > "$ISARET" ) | gzip > "$GECICI"
  KOD="$(cat "$ISARET" 2>/dev/null || echo 99)"
  rm -f "$ISARET"

  if [ "$KOD" -ne 0 ]; then
    echo "[backup] HATA — pg_dump cikis kodu $KOD. Yarim dosya siliniyor: $GECICI"
    echo "[backup] ESKI YEDEKLER KORUNUYOR (basarisiz turda temizlik YAPILMAZ)."
    rm -f "$GECICI"
    sleep "$BEKLETME"
    continue
  fi

  # ── BUTUNLUK — iki bagimsiz kanit, ikisi de ayri bir seyi olcer ───────────
  # (a) gzip akisi eksiksiz mi   (b) pg_dump SONUNA kadar yazdi mi
  # (b) sarttir: pg_dump 0 donse bile disk dolarsa gzip yarim kalabilir.
  if ! gzip -t "$GECICI" 2>/dev/null; then
    echo "[backup] HATA — gzip butunluk kontrolu KALDI. Dosya siliniyor, eski yedekler korunuyor."
    rm -f "$GECICI"
    sleep "$BEKLETME"
    continue
  fi
  if ! gzip -dc "$GECICI" 2>/dev/null | tail -20 | grep -q 'PostgreSQL database dump complete'; then
    echo "[backup] HATA — dump SONU isareti yok (yarim dump). Dosya siliniyor, eski yedekler korunuyor."
    rm -f "$GECICI"
    sleep "$BEKLETME"
    continue
  fi

  # Adi ancak burada kesinlesir: `metaprice-*.sql.gz` adini tasiyan HER dosya
  # bu uc kontrolden gecmistir. Geri yukleme prosedURU bu garantiye dayanir.
  mv "$GECICI" "$HEDEF"
  echo "[backup] tamam — $HEDEF ($(wc -c < "$HEDEF") bayt, dogrulandi)"

  # Temizlik YALNIZ buraya kadar gelinirse kosar.
  find /backups -name 'metaprice-*.sql.gz' -mtime "+$SAKLAMA_GUN" -delete
  find /backups -name 'metaprice-*.sql.gz.yaziliyor' -mtime +1 -delete

  sleep "$BEKLETME"
done
