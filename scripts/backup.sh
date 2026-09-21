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

# 0.9b (07.09.2026): dump dosyalari yalniz root okusun. Konteyner root olarak
# yazar, host tarafinda da root-disi kullanici yok; yine de 0644 ile dogan bir
# yedek, ileride eklenecek her hesabin okuyabilecegi bir sir kutusudur.
umask 077

BEKLETME=86400          # iki dump arasi (saniye)
SAKLAMA_GUN=14          # metaprice-* : gunluk dokum. DEGISMEZ (K5 ayri karar).
# ── 21.09.2026 (K5) — DIGER UC AILE 30 GUN ──────────────────────────────────
# Emre karari: "Butun yedekler en fazla 30 gun." Gizlilik metnine de su cumle
# giriyor: "silinen veriler yedeklerden en gec 30 gun icinde cikar."
# OLCULDU 21.09: /backups altinda DORT aile var, yalniz biri suruluyordu.
#   metaprice-*             gunluk dongu (bu betik)        14 gun ✓
#   deploy-oncesi-*         deploy.sh                      SURESIZDI
#   geri-yukleme-oncesi-*   geri-yukle.sh can simidi       SURESIZDI
#   bekci-*                 metaprice-yedek-bekci.sh       SURESIZDI
# Suresiz saklanan bir dokum o gizlilik cumlesini YANLIS BEYAN yapar: hesabini
# kapatmis bir musterinin verisi 4 Agustos dokumunde oldugu gibi durur.
# deploy.sh kendi ailesini kendi buduyor, AMA yalniz deploy aninda: 40 gun
# deploy yapilmazsa o dosyalar 40 gun yasar. Bu yuzden ucu de GUNLUK donguye
# baglandi; deploy.sh'taki kural ikinci bir emniyet olarak yerinde kaliyor
# (ayni esik, ayni aile — hangisi once kosarsa isi o yapar).
DIGER_SAKLAMA_GUN=30
ISARET=/tmp/pgdump-kodu
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

  # ── DIGER UC AILE — 30 GUN (K5, 21.09.2026) ──────────────────────────────
  # ⚠ CAN SIMIDI KAPISI. Bu blok `geri-yukleme-oncesi-*` de siliyor; o dosya
  # bir geri yuklemenin TEK donusudur. Bu yuzden silmeden once elde GERCEKTEN
  # guncel bir dogrulanmis yedek oldugu ARANIR. Yukaridaki `mv` sayesinde
  # normalde vardir (az once yazildi) — ama bu blok ileride baska bir yere
  # tasinirsa ya da `mv` sessizce duserse bu kapi tek koruma olur.
  # Sayim BILEREK `metaprice-*` uzerinden: adi ancak uc butunluk kontrolunden
  # sonra kesinlesen TEK aile o. Silinecek ailelerden saymak dairesel olurdu.
  TAZE_YEDEK="$(find /backups -name 'metaprice-*.sql.gz' -mtime -2 | wc -l | tr -d ' ')"
  if [ "$TAZE_YEDEK" -lt 1 ]; then
    echo "[backup] 30 GUN KURALI ATLANDI — son 2 gunde dogrulanmis metaprice-* yedek YOK."
    echo "[backup] Can simidi ve diger yedekler KORUNUYOR. Once gunluk yedegi duzeltin."
  else
    # `-name ... -o -name ...` ayni geciste: tek tarama, tek sayim.
    # Desenler `.sql.gz` ile BITER, yani `.yaziliyor` yarim dosyalari KAPSAMAZ.
    SILINEN_DIGER="$(find /backups \( \
      -name 'geri-yukleme-oncesi-*.sql.gz' -o \
      -name 'bekci-*.sql.gz' -o \
      -name 'deploy-oncesi-*.sql.gz' \) \
      -mtime "+$DIGER_SAKLAMA_GUN" -print -delete | wc -l | tr -d ' ')"
    # Yarim dosyalar: bekci gecici adi NOKTAYLA baslar (.bekci-<damga>.yaziliyor).
    find /backups \( \
      -name 'geri-yukleme-oncesi-*.sql.gz.yaziliyor' -o \
      -name 'deploy-oncesi-*.sql.gz.yaziliyor' -o \
      -name '.bekci-*.yaziliyor' \) \
      -mtime +1 -delete
    echo "[backup] 30 gun kurali: $SILINEN_DIGER dosya silindi (taze yedek: $TAZE_YEDEK)"
  fi

  sleep "$BEKLETME"
done
