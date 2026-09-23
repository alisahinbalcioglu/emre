#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  MetaPrice — VPS DEPLOY  (PK2, 31.07.2026)
#
#  KULLANIM (Hetzner web konsolunda):
#      cd /opt/metaprice
#      bash scripts/deploy.sh
#
#  NEDEN SCRIPT: Hetzner web konsolu TR klavyede  $  >  |  _  :  karakterlerini
#  YAZAMIYOR (27.07 ve 31.07'de iki kez yasandi: pg_dump→pg-dump, $VAR→4VAR;
#  01.09'da ucuncusu: `npm run seed:paketler` → `npm run seed;paketler`).
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

# ── KENDINI DEGISTIRME KORUMASI ─────────────────────────────────────────────
# bash bir betigi TEMBEL okur ve acik dosya tanitiyicisini surdurur. Asagidaki
# `git pull` bu dosyayi YENI BIR INODE ile degistirdiginde, calismaya devam
# eden kopya ESKI surumdur — yani deploy.sh'a yapilan her degisiklik BIR DEPLOY
# GEC devreye girer, uyari da vermez.
#
# OLCULDU (07.09.2026): caddy reload adimi eklendi, commit'lendi, deploy kostu,
# betik "✅ DEPLOY DOGRULANDI" dedi — ama caddy adimi HIC CALISMADI, cunku o
# adim yalniz diskteki YENI kopyada vardi. Basliklarin canliya cikmadigi ancak
# disaridan curl ile olculunce anlasildi.
IMZA_ONCE="${DEPLOY_IMZA:-$(md5sum "$0" | cut -d" " -f1)}"

echo "── 1/6 git pull ──"
git pull origin master

IMZA_SONRA="$(md5sum "$0" | cut -d" " -f1)"
if [ "$IMZA_SONRA" != "$IMZA_ONCE" ]; then
  echo "   deploy.sh bu pull ile DEGISTI — yeni surumle bastan baslatiliyor"
  echo "   (eski: ${IMZA_ONCE:0:8}  yeni: ${IMZA_SONRA:0:8})"
  DEPLOY_IMZA="$IMZA_SONRA" exec bash "$0" "$@"
fi

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
# gunluk temizlik deseni (backup.sh) `metaprice-*.sql.gz` arar; bu dosyalar o
# desene GIRMEZ, yani backup.sh'in 14 gun kurali bunlara UYGULANMAZ. Bu kisim
# hala BILEREK boyle: 14 gun once yapilan bir deploy'u geri almak icin o
# deploy'un KENDI yedegi gerekir, gunluk dokum yetmez.
#
# ── 21.09.2026: 30 GUN SAKLAMA EKLENDI (K5) ────────────────────────────────
# Oncesinde bu dosyalar HIC silinmiyordu. OLCULDU (21.09, canli sunucuda):
# 104 dosya, en eskisi 4 Agustos, 47'si 30 gunden eski, toplam 1,1 GB.
# Iki ayri sorun, ikincisi agir:
#   (a) DISK — deploy basina bir dosya, ustu acik birikim.
#   (b) TAAHHUT — gizlilik metni "silinen veriler yedeklerden en gec 30 gun
#       icinde cikar" diyor. SURESIZ saklanan bir yedek bu cumleyi YALAN
#       yapar: hesabini kapatmis bir musterinin verisi 4 Agustos dokumunde
#       oldugu gibi duruyor ve hicbir imha isi oraya ulasamaz.
# Artik asagidaki temizlik her DOGRULANMIS deploy yedeginden sonra kosar.
#
# ⚠ TEMIZLIK backup.sh'in SOZLESMESINI birebir tasir: silme YALNIZ yeni yedek
# DOGRULANDIKTAN ve adi kesinlestikten SONRA kosar. Bu burada bir gelenek
# degil, YAPISAL bir garanti: temizlik satirlari asagidaki uc `exit 1`
# dalinin ALTINDA, `mv` ile adin kesinlesmesinden SONRA duruyor. Dump
# basarisizsa o dallardan donulur ve hicbir sey silinmez.
# Gerekcesi backup.sh:6-15'te yazili — orada tam tersi olculdu: silme `if`
# blogunun disindaydi, basarisiz gunlerde de kosuyordu, yani "ust uste 14 gun
# basarisiz dump = elde HIC yedek yok, hem de kimse fark etmeden".
#
# ⚠ YEDEK BASARISIZSA DEPLOY DURUR. `|| true` ile ciktiyi yakalayip MARKER
# ariyoruz; boylece hem hata metni gorunur hem de ERR trap'e dusup "beklenmedik
# hata (kod 3)" gibi yaniltici bir mesaj cikmaz — bu BILINEN ve KASITLI bir ret.
echo "── 3/6 deploy oncesi DB yedegi ──"
# UMASK (10.09.2026): `docker compose exec` ile acilan kabuk backup.sh icindeki
# `umask 077`yi MIRAS ALMAZ. Olculdu 09.09: exec kabugunda umask 0022, ve
# 07.09 sertlestirmesinden sonraki UC deploy dump dosyasinin UCU de 0644 dogdu
# (0600 olanlar o gun elle chmod edilmisti — kalici degildi). umask yukun ILK
# ifadesi: gzip yonlendirmesi ayni kabukta, mv modu korur. chmod yerine umask,
# cunku chmod dosyanin 0644 dogup sonra duzeltildigi bir pencere birakir.
# SAKLAMA (21.09.2026, K5): deploy yedekleri 30 gun. backup.sh'in 14 gunu
# DEGISMEZ — o gunluk dokumler icin ayri bir karar.
# `-mtime +30` = yasi 30 TAM GUNDEN buyuk olan, yani pratikte 31. gunde
# silinir (find gun sayisini asagi yuvarlar). Sinirin bu yonde olmasi bilerek:
# erken silmektense bir gun fazla saklamak.
# GERI_YUKLEME.md'deki elle budama komutu da ayni `-mtime +30` esigini
# kullaniyor — otomatik ve elle yol AYNI dosyalari secer.
YEDEK_SAKLAMA_GUN=30
YEDEK_ADI="deploy-oncesi-$BEKLENEN-$(date +%Y%m%d-%H%M%S).sql.gz"
YEDEK_CIKTI="$(docker compose exec -T -e ADI="$YEDEK_ADI" -e SAKLAMA="$YEDEK_SAKLAMA_GUN" backup sh -c '
  umask 077
  GECICI="/backups/$ADI.yaziliyor"
  rm -f /tmp/deploy-dump-kodu
  ( set +e; pg_dump -h db -U "$POSTGRES_USER" "$POSTGRES_DB"; echo $? > /tmp/deploy-dump-kodu ) | gzip > "$GECICI"
  KOD="$(cat /tmp/deploy-dump-kodu 2>/dev/null || echo 99)"
  rm -f /tmp/deploy-dump-kodu
  if [ "$KOD" -ne 0 ]; then echo "YEDEK HATASI — pg_dump cikis kodu $KOD"; rm -f "$GECICI"; exit 1; fi
  if ! gzip -t "$GECICI" 2>/dev/null; then echo "YEDEK HATASI — gzip butunluk kontrolu kaldi"; rm -f "$GECICI"; exit 1; fi
  # UYARI (23.09.2026): buradaki boruyu "ciktiyi once degiskene al" deyimine
  #   cevirmek DENENDI ve YEDEK DOGRULAMASINI BOZDU. O deyim printf ile tek
  #   tirnak kullanir; bu blok TEK TIRNAKLI bir dizginin icinde oldugu icin
  #   dizgi ERKEN KAPANDI ve bu satirdan sonrasi (mv + YEDEK DOGRULANDI +
  #   budama) dizginin DISINDA kaldi. Olculdu: blok 1.5 kB yerine 672 bayta
  #   dustu. UYARI: bash -n bunu YAKALAMAZ — sonuc hala gecerli sozdizimidir,
  #   yalnizca BASKA bir programdir. Kanit yontemi: sh -c blogunu ayikla ve
  #   icinde YEDEK DOGRULANDI ibaresini ARA.
  #   Zaten gereksizdi: pipefail tuzagi DIS betige ozgudur (satir 26); bu blok
  #   sh -c ile kosuyor ve set -euo pipefail TASIMIYOR.
  if ! gzip -dc "$GECICI" 2>/dev/null | tail -20 | grep -q "PostgreSQL database dump complete"; then
    echo "YEDEK HATASI — dump SONU isareti yok (yarim dump)"; rm -f "$GECICI"; exit 1; fi
  mv "$GECICI" "/backups/$ADI"
  echo "YEDEK DOGRULANDI /backups/$ADI $(wc -c < "/backups/$ADI") bayt"
  # ── ESKI DEPLOY YEDEKLERINI BUDA (backup.sh:74-76 deseni) ───────────────
  # ⚠ BU BLOK TEK TIRNAKLI BIR DIZGININ ICINDE. Buraya kesme isareti (tek
  # tirnak) YAZMA: dizgiyi kapatir ve butun betik SOZDIZIMI HATASI verir.
  # OLCULDU 21.09.2026 — iki Turkce ek (kesmeli yazim) betigi kirdi, `bash -n`
  # yakaladi. Blokta bugune kadar hic yorum olmamasinin sebebi de budur.
  #
  # Buraya YALNIZ dogrulanmis ve adi kesinlesmis YENI bir yedek varken gelinir.
  # `! -name "$ADI"` az once yazilan yedegi her kosulda disarida birakir:
  # sunucu saati ileri kayarsa bile bu kosumun can simidi silinemez.
  # `deploy-oncesi-*.sql.gz` deseni `.yaziliyor` ile BITEN yarim dosyalari
  # KAPSAMAZ (find -name adin TAMAMINI esler) — onlar ikinci satirda, +1 gun.
  # stderr BILEREK yutulmuyor: disaridaki `2>&1` yakalar ve ciktiya basar.
  # Budama basarisizligi deploy adimini DUSURMEZ — disk temizligi teslimatin
  # onkosulu degildir (ayni gerekce 6/6 adimindaki cache budamasinda da var).
  SILINEN="$(find /backups -name "deploy-oncesi-*.sql.gz" ! -name "$ADI" -mtime "+$SAKLAMA" -print -delete | wc -l | tr -d " ")"
  find /backups -name "deploy-oncesi-*.sql.gz.yaziliyor" -mtime +1 -delete
  echo "BUDAMA tamam — $SAKLAMA gunden eski deploy yedegi silindi: $SILINEN dosya"
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

echo "── 4/6 docker compose build backend frontend dwg-engine ──"
# DIKKAT: build log'unda `COPY . .` satiri CACHED cikiyorsa kod DEGISMEMISTIR
# (30.07 dersi — iki kez eski kod deploy edildi). BUILD_SHA her deploy'da
# degistigi icin ARG'i kullanan katman zaten yeniden kurulur.
#
# ── 11.08.2026: dwg-engine EKLENDI ──────────────────────────────────────────
# Bu betik acildigi gunden beri YALNIZ backend ve frontend'i kuruyordu. Oysa
# Python motoru (`dwg-engine`) AYRI bir imaj ve AYRI bir servis. Sonuc: DWG
# motorunda yapilan hicbir degisiklik canliya CIKMIYORDU ve /api/health'in
# hash'i yesil goründügü icin "deploy oldu" saniliyordu.
# OLCULDU (11.08): birim otomatik tespiti (unit_detect.py) deploy edildi
# sanildi; backend+frontend c991b4d idi ama motor eski imajdaydi, metraj
# 100x yanlis kalmaya devam etti. Asagidaki 6/6 adimi artik bunu YAKALAR.
docker compose build backend frontend dwg-engine

echo "── 5/6 docker compose up -d backend frontend dwg-engine ──"
docker compose up -d backend frontend dwg-engine

# ── CADDY YAPILANDIRMASI ────────────────────────────────────────────────────
# ⚠ Caddyfile bind mount: `git pull` dosyayi degistirir ama Caddy surecinin
# BELLEGINDEKI yapilandirma degismez. Bu adim olmadan Caddyfile'a yapilan her
# degisiklik (guvenlik basliklari dahil) SESSIZCE olu kalir — ustelik asagidaki
# 6/6 dogrulamasi yalniz backend ve motor sha'sina baktigi icin deploy yine
# "DOGRULANDI" der. Bu, "deploy.sh frontend'i dogrulamaz" tuzaginin ayni ailesi.
#
# Once VALIDATE, sonra RELOAD: bozuk bir Caddyfile ile reload denemek siteyi
# indirebilir. validate basarisizsa deploy DURUR ve eski yapilandirma yasar.
# ⚠ BIND MOUNT BAYATLIGI: Caddyfile TEK DOSYA olarak baglaniyor
# (docker-compose.yml: ./Caddyfile:/etc/caddy/Caddyfile:ro) ve Docker tek-dosya
# mount'unu INODE'a baglar. `git pull` dosyayi yeni bir inode ile yazdiginda
# konteyner ESKI inode'u gormeye devam eder. Sonuc: `caddy reload` cikis kodu 0
# doner, "yeniden yuklendi" der ve ESKI yapilandirmayi yukler.
#
# OLCULDU (07.09.2026): host md5 c374edde (4793 bayt, snippet VAR) iken
# konteyner ebfaeefc (1664 bayt, snippet YOK) goruyordu. Basliklar canliya
# cikmadi; reload basarili gorunuyordu.
#
# Bu yuzden once md5 KARSILASTIRILIR: ayrisma varsa reload YETMEZ, konteyner
# yeniden olusturulmalidir (mount o zaman guncel inode'a baglanir).
# ⚠ Cikti ONCE degiskene alinir: `set -euo pipefail` + `grep -q`nun erken
#   cikisi, besleyen komuta SIGPIPE attirip boru hattini HATALI gosterir
#   (23.09'da Caddyfile dogrulamasinda yasandi, deploy 5/6'da durdu).
CALISAN_SERVISLER="$(docker compose ps --status running --services 2>/dev/null || true)"
if ! printf '%s' "$CALISAN_SERVISLER" | grep -qx caddy; then
  echo "   caddy servisi calismiyor — yapilandirma yenilemesi atlandi"
else
  # Dogrulama HOST dosyasi uzerinden, TAZE bir mount ile yapilir. Konteynerin
  # icinden dogrulamak bayat kopyayi dogrular ve hicbir sey kanitlamaz.
  #
  # ⚠ --env-file ZORUNLU: Caddyfile {$DOMAIN} ve {$ACME_EMAIL} kullaniyor.
  # Env'siz bir konteynerde bunlar BOSA genisler ve `email` argumansiz kalir;
  # dogrulama GECERLI bir dosyayi GECERSIZ ilan eder. 07.09.2026'da tam olarak
  # bu yasandi: deploy kod=3 ile durdu, oysa Caddyfile dogruydu. Dogrulama
  # ortami gercek calisma ortamiyla AYNI degilse dogrulama degil, gurultudur.
  # ⚠⚠ CIKTI ONCE DEGISKENE ALINIR, `grep -q`ya BORULANMAZ (23.09.2026).
  #
  # OLCULDU — 23.09 deploy'u 5/6'da "Caddyfile GECERSIZ" diyerek durdu, oysa
  # Caddy'nin KENDI ciktisi "Valid configuration" yaziyordu. Sebep:
  #   · betik `set -euo pipefail` ile kosuyor (satir 26);
  #   · `grep -q` eslesmeyi bulunca HEMEN cikar ve boruyu kapatir;
  #   · `docker run` SIGPIPE alip 141 ile oler;
  #   · `pipefail` o kodu BORU HATTININ kodu yapar → `!` kosulu DOGRU olur.
  # Yani GECERLI bir dosya GECERSIZ ilan edilir. Kanit (bash):
  #   set -euo pipefail; (uzun_cikti; echo M) | grep -q ilk_satir  → 141
  # Ayni desen `pipefail` olmadan 0 doner — kusur deseni, Caddyfile DEGIL.
  #
  # ⚠ BU SESSIZ BIR KUSURDU: betik 5/6'da durdugu icin 6/6 CANLI DOGRULAMA
  #   hic kosmuyor, yani "deploy dogrulandi" satiri basilmiyor ve kimse
  #   surumun gercekten yayina girdigini OLCMUYOR. Konteynerler zaten
  #   yenilenmis oluyor; kaybolan sey KANIT.
  #
  # ⚠ Ayni deyim `YEDEK_CIKTI`da (satir ~147) ZATEN kullaniliyordu; burada
  #   kullanilmamasi bir tutarsizlikti. Yan fayda: docker IKI KEZ degil BIR
  #   KEZ kosuyor (eski hal teshis icin ayni dogrulamayi tekrar yapiyordu).
  CADDY_CIKTI="$(docker run --rm --env-file .env -v "$PWD/Caddyfile:/tmp/C:ro" caddy:2 \
    caddy validate --config /tmp/C --adapter caddyfile </dev/null 2>&1 || true)"
  if ! printf '%s' "$CADDY_CIKTI" | grep -q "Valid configuration"; then
    echo "❌ Caddyfile GECERSIZ — hicbir sey yapilmadi, eski yapilandirma korundu."
    printf '%s\n' "$CADDY_CIKTI" | tail -5
    exit 1
  fi

  HOST_MD5="$(md5sum Caddyfile | cut -d" " -f1)"
  KAP_MD5="$(docker compose exec -T caddy md5sum /etc/caddy/Caddyfile </dev/null 2>/dev/null | cut -d" " -f1)"
  if [ "$HOST_MD5" != "$KAP_MD5" ]; then
    echo "   Caddyfile degisti ve mount BAYAT (host ${HOST_MD5:0:8} != kap ${KAP_MD5:0:8})"
    echo "   caddy konteyneri yeniden olusturuluyor (reload YETMEZ)"
    docker compose up -d --force-recreate caddy </dev/null >/dev/null 2>&1       || { echo "❌ caddy yeniden olusturulamadi"; exit 1; }
    sleep 3
    YENI_MD5="$(docker compose exec -T caddy md5sum /etc/caddy/Caddyfile </dev/null 2>/dev/null | cut -d" " -f1)"
    if [ "$YENI_MD5" != "$HOST_MD5" ]; then
      echo "❌ mount HALA bayat (kap ${YENI_MD5:0:8}) — elle mudahale gerekir"; exit 1
    fi
    echo "   caddy tazelendi ve dogrulandi (${YENI_MD5:0:8})"
  else
    docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile </dev/null >/dev/null 2>&1       && echo "   caddy yapilandirmasi yeniden yuklendi (mount zaten taze)"       || { echo "❌ caddy reload BASARISIZ — eski yapilandirma calismaya devam ediyor"; exit 1; }
  fi
fi

# ── YEDEK SERVISI TAZELIGI (21.09.2026, K5) ─────────────────────────────────
# `backup.sh` konteynere TEK DOSYA olarak bagli:
#   docker-compose.yml:216  ./scripts/backup.sh:/backup.sh:ro
# Caddyfile ile AYNI tuzak, ustelik IKI KAT:
#   (1) Docker tek-dosya mount'unu INODE'a baglar. `git pull` dosyayi yeni bir
#       inode ile yazinca konteyner ESKI dosyayi gormeye devam eder.
#   (2) Entrypoint `sh /backup.sh` ve betik sonsuz `while` dongusunde. Kabuk
#       bilesik komutu bir kez ayristirir, dosyayi YENIDEN OKUMAZ.
# Yani konteyner yeniden olusturulmadan `backup.sh` degisikligi ASLA yururluge
# girmez — ve deploy yine "DOGRULANDI" der. SESSIZ basarisizlik.
#
# NEDEN ONEMLI: K5 kurali (butun yedekler en fazla 30 gun) artik `backup.sh`in
# gunluk dongusunde. Gizlilik metni "silinen veriler yedeklerden en gec 30 gun
# icinde cikar" diyecek. Kural konteynerde kosmazsa o cumle YANLIS BEYAN olur
# ve kimse fark etmez. Yasal bir sozu insanin hatirlamasina birakmiyoruz.
#
# ⚠ HER DEPLOY'DA yeniden olusturmak YANLIS: kap yeniden dogunca 24 saatlik
# dump dongusu BASTAN baslar, yani art arda deploy'lar gunluk yedegi surekli
# erteler. Bu yuzden YALNIZ dosya degistiginde.
#
# ⚠ SAKLANAN HASH YOK — bilerek. Bir yere hash yazsaydik "nerede duracak"
# sorusu cikardi ve yanlis yerde (kabin icinde) dururken her yeniden
# olusturmada "degisti" sanip donguyu tekrar sifirlardik. Bunun yerine
# KONTEYNERIN GERCEKTEN GORDUGU dosya olculuyor: durum nerede saklanacak
# sorusu ortadan kalkiyor, olcum kendi kendini duzeltiyor (kap elle
# yenilenmisse de dogru cevap verir). Ayni desen Caddyfile icin yukarida var.
# (Ayni gerekce: cikti once degiskene alinir — pipefail + `grep -q` tuzagi.)
CALISAN_SERVISLER2="$(docker compose ps --status running --services 2>/dev/null || true)"
if ! printf '%s' "$CALISAN_SERVISLER2" | grep -qx backup; then
  echo "   backup servisi calismiyor — yedek betigi tazeligi OLCULEMEDI"
  echo "   (3/6 yedegi bu servisten alindi; buraya gelindiyse servis vardi)"
else
  YEDEK_HOST_MD5="$(md5sum scripts/backup.sh | cut -d" " -f1)"
  # `|| true` SART: betik `set -euo pipefail` ile kosuyor. `exec` duserse
  # pipefail bos ciktiyi HATA'ya cevirir ve deploy ERR trap'ine dusup
  # "beklenmedik hata (kod 3)" der — oysa bu olculebilir bir durumdur.
  YEDEK_KAP_MD5="$(docker compose exec -T backup md5sum /backup.sh </dev/null 2>/dev/null | cut -d" " -f1 || true)"
  if [ "$YEDEK_HOST_MD5" = "$YEDEK_KAP_MD5" ]; then
    echo "   yedek betigi DEGISMEDI (${YEDEK_HOST_MD5:0:8}) — konteyner dokunulmadi, dump dongusu sifirlanmadi"
  else
    echo "   backup.sh DEGISTI (host ${YEDEK_HOST_MD5:0:8} != kap ${YEDEK_KAP_MD5:0:8})"
    echo "   yedek konteyneri yeniden olusturuluyor — mount inode'a bagli, reload diye bir sey YOK"
    docker compose up -d --force-recreate backup </dev/null >/dev/null 2>&1 \
      || { echo "❌ backup konteyneri yeniden olusturulamadi"; exit 1; }
    sleep 3
    # Tazelik SONRADAN tekrar OLCULUR — "yeniden olusturdum" bir iddiadir,
    # kanit degil. md5sum kalici olarak calismiyorsa burada GORUNUR sekilde
    # durur; sessizce her deploy'da yeniden olusturmaya DONMEZ.
    YENI_YEDEK_MD5="$(docker compose exec -T backup md5sum /backup.sh </dev/null 2>/dev/null | cut -d" " -f1 || true)"
    if [ "$YENI_YEDEK_MD5" != "$YEDEK_HOST_MD5" ]; then
      echo "❌ backup mount HALA bayat (kap ${YENI_YEDEK_MD5:0:8}) — elle mudahale gerekir"
      exit 1
    fi
    echo "   yedek betigi tazelendi ve DOGRULANDI (${YENI_YEDEK_MD5:0:8}) — saklama kurali artik yururlukte"
  fi
fi

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

if [ "$CANLI" != "$BEKLENEN" ]; then
  echo ""
  echo "❌ DEPLOY DOGRULANAMADI (backend)"
  echo "   beklenen: $BEKLENEN"
  echo "   canli   : ${CANLI:-<okunamadi>}"
  echo "   Olasi sebep: build cache'ten geldi, ya da container yeniden baslamadi."
  exit 1
fi
echo "   backend surumu DOGRULANDI: $CANLI"

# ── MOTOR (dwg-engine) TAZELIGI ────────────────────────────────────────────
# ⚠ BACKEND'IN HASH'I MOTORUN TAZELIGINI KANITLAMAZ. Ayri imaj, ayri servis.
# 11.08'de tam olarak bu yasandi: /api/health c991b4d dedi, herkes deploy
# oldu sandi, ama motor eski imajda kaldi ve DWG metraji 100x yanlis kaldi.
# Motor ic agda (expose, publish DEGIL) — bu yuzden KENDI icinden sorulur.
echo "   motor (dwg-engine) surumu sorulunuyor..."
MOTOR_SHA="$(docker compose exec -T dwg-engine python -c \
  "import urllib.request,json;print(json.load(urllib.request.urlopen('http://localhost:10000/health'))['build_sha'])" \
  2>/dev/null | tr -d '\r' | tail -1 || true)"

if [ "$MOTOR_SHA" = "$BEKLENEN" ]; then
  echo ""
  echo "✅ DEPLOY DOGRULANDI — backend: $CANLI · motor: $MOTOR_SHA"
  echo "   (Bu satir 'sozlu teyit' degil, iki servisin de kendi cevabidir.)"

  # ── BUILD CACHE BUDAMA (SINIRLI) ──────────────────────────────────────────
  # OLCULDU (07.09.2026): iki deploy 5,94 GB build cache uretti (~3 GB/deploy)
  # ve disk %15'ten %20'ye cikti. Budama HIC yoktu; disk 06.09'da bu yuzden
  # %84'e ulasmisti (55,33 GB cache, ACTIVE=0).
  #
  # `until=72h`: son uc gunun cache'i KORUNUR (art arda deploy'lar hizli kalsin),
  # daha eskisi silinir. Kosulsuz `prune -af` her deploy'u yavaslatirdi.
  #
  # DOGRULAMA SONRASI calisir: deploy basarisiz olursa cache durur, yeniden
  # deneme hizli olur. Budama basarisizligi deploy'u DUSURMEZ (|| true) —
  # disk temizligi, teslimatin onkosulu degildir.
  #
  # TAVAN (10.09.2026): yas suzgeci TEK BASINA yetmiyor. Olculdu 09.09: uc
  # gunde uc deploy -> build cache 88 kayit / 12.76 GB ve kayitlarin HEPSI 72
  # saatten gencti, yani `until=72h` SIFIR bayt siliyordu; disk %15 -> %30.
  # Ikinci satir cache'e mutlak bir tavan koyar (~2 build'lik iz).
  # `image prune` BILEREK YOK: ayni gun olculdu, 6 imajin 5'i calisan
  # konteynerde, dangling 0 — kurtaracagi alan ~26 kB idi.
  ONCE_BOS="$(df --output=avail -BG / | tail -1 | tr -dc '0-9')"
  docker builder prune -af --filter until=72h >/dev/null 2>&1 || true
  docker builder prune -af --keep-storage 10GB >/dev/null 2>&1 || true
  SONRA_BOS="$(df --output=avail -BG / | tail -1 | tr -dc '0-9')"
  # `|| true` SART: betik `set -euo pipefail` + ERR trap ile kosuyor; bu satir
  # bir bilgi satiri icin basarili deploy'u "YARIDA KESILDI" diye dusurmemeli.
  CACHE_SONRA="$(docker system df --format '{{if eq .Type "Build Cache"}}{{.Size}}{{end}}' 2>/dev/null | tr -d '\n' || true)"
  echo "   build cache budandi: bos alan ${ONCE_BOS}G → ${SONRA_BOS}G · cache=${CACHE_SONRA:-?} (disk %$(df --output=pcent / | tail -1 | tr -dc '0-9'))"
else
  echo ""
  echo "❌ DEPLOY DOGRULANAMADI (dwg-engine MOTORU ESKI KALDI)"
  echo "   beklenen: $BEKLENEN"
  echo "   motor    : ${MOTOR_SHA:-<okunamadi>}"
  echo "   Backend guncel ama DWG motoru degil — metraj/birim sonuclari ESKI koddan gelir."
  echo "   Once sunu deneyin:  docker compose build --no-cache dwg-engine"
  echo "   sonra:              docker compose up -d dwg-engine"
  exit 1
fi
