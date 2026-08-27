#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  KV + KAUCUK — CANLI VERI DOKUMU (SALT-OKUMA)
#
#  KULLANIM (Hetzner web konsolunda, sirayla):
#      cd /opt/metaprice
#      git pull origin master
#      bash scripts/kv-kaucuk-olcu.sh 3      (YALNIZ bolum 3, SAYFALI — onerilen)
#      bash scripts/kv-kaucuk-olcu.sh        (hepsi pes pese, sayfasiz)
#
#  SAYFALI MOD: Hetzner konsolunda GERI KAYDIRMA YOK (yeni cekirdeklerde
#  vt scrollback kaldirildi; Shift+PageUp da calismaz). Bolum numarasi
#  verilirse cikti less ile sayfalanir:
#      SPACE = sonraki sayfa · b = onceki sayfa · q = cikis
#  Her sayfanin ekran goruntusunu alip SPACE ile ilerleyin.
#
#  NEDEN SCRIPT (deploy.sh / s45-olcu.sh deseni): Hetzner web konsolu TR
#  klavyede bazi ozel karakterleri yazamiyor/bozuyor. Ozel karakterlerin
#  TAMAMI bu dosyanin icinde durur; konsola yazilan satirlarda ozel
#  karakter yok.
#
#  NEDEN GEREKLI — DURUSTLUK NOTU (27.08): iki canli sikayet var ve ikisi de
#  YEREL VERIYLE COZULEMEZ:
#   1. KAUCUK: "fiyat listeleri kaucuk baslikli, malzeme adlari kaucuk diye
#      basliyor ama secim yapamiyor". 24.08 duzeltmesi O GUNKU ekran
#      goruntusundeki ODE satirlarina gore olculmustu; simdiki liste FARKLI
#      olabilir (yeni liste, farkli ad bicimi, kisisel liste izolasyonu...).
#      Ad bicimini TAHMIN ederek yamamak "testler yesil, gercek kirik"
#      dersinin tekraridir — once gercek satirlar okunur.
#      ILK KOSUM BULGUSU (bolum 7): 197 kaucuk satiri 'boru' ailesine ve
#      STEEL sinifina dusmus — izolasyon satiri aile kilidi yuzunden onlara
#      ulasamiyor. Ad bicimleri bolum 3'te.
#   2. DUYAR KURESEL VANA: 1/2" secilip asagi suruklendi; 3/4" / 1" / 1 1/4"
#      PEMBE kaldi. Pembe iki farkli sey olabilir (coklu aday = dogru davranis,
#      ya da kusur). Ayirt etmek icin DUYAR'in o urunlerdeki GERCEK ad/cins/
#      cap yazimlari lazim — motor yerelde ayni satirlarla yeniden kosulacak.
#
#  Betik hicbir sey degistirmez, yalniz DOKER. Sorgular BEGIN READ ONLY
#  icinde, sonda ROLLBACK. Cikti bu konsola basilir; ekran goruntusu yeterli.
#
#  ARAMA DESENLERI BILEREK ASCII: '%kau%' (Kauçuk/kaucuk ikisini de yakalar),
#  '%resel%' (Küresel/kuresel ikisini de yakalar) — konsol/locale suprizi olmasin.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

SECIM="${1:-}"

if ! command -v docker >/dev/null 2>&1; then
  echo "ON KOSUL YOK — docker bulunamadi. Bu betik sunucuda (/opt/metaprice) kosulur."
  exit 2
fi

sorgu() {
  docker compose exec -T backup sh -c 'psql -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "BEGIN READ ONLY; '"$1"'; ROLLBACK"'
}

bolum1() {
  echo "── 1/7 indeks surumu kirilimi (bayat satir var mi) ──"
  sorgu 'SELECT \"indexVersion\" AS surum, count(*) AS satir FROM \"ProductIndex\" GROUP BY 1 ORDER BY 1'
}

bolum2() {
  echo "── 2/7 KAUCUK fiyat listeleri (ad + marka + kisisel mi + satir sayisi) ──"
  sorgu 'SELECT b.name AS marka, pl.name AS liste, (pl.\"ownerUserId\" IS NOT NULL) AS kisisel, count(pi.id) AS satir FROM \"PriceList\" pl JOIN \"Brand\" b ON b.id = pl.\"brandId\" LEFT JOIN \"ProductIndex\" pi ON pi.\"priceListId\" = pl.id WHERE pl.name ILIKE '"'"'%kau%'"'"' GROUP BY 1,2,3 ORDER BY 1,2'
}

bolum3() {
  echo "── 3/7 KAUCUK urun satirlari — HAVUZ yapisi + motor on-hesabi (ilk 80) ──"
  echo "   (adSlug/sizeClass/capTags/cinsTokens: motorun bu satiri NASIL gordugu)"
  sorgu 'SELECT b.name AS marka, pi.kategori, pi.ad, pi.cins, pi.\"capRaw\", pi.birim, pi.\"adSlug\", pi.\"sizeClass\", pi.\"capTags\", pi.\"cinsTokens\", pi.\"aileZayif\" AS zayif, pi.belirsiz, pi.\"indexVersion\" AS sv FROM \"ProductIndex\" pi JOIN \"Brand\" b ON b.id = pi.\"brandId\" WHERE pi.ad ILIKE '"'"'%kau%'"'"' OR pi.kategori ILIKE '"'"'%kau%'"'"' OR pi.\"sheetName\" ILIKE '"'"'%kau%'"'"' ORDER BY b.name, pi.\"sortOrder\" LIMIT 80'
}

bolum4() {
  echo "── 4/7 KAUCUK kutuphane satirlari — MOTORUN GERCEK HAVUZU (ilk 60) ──"
  echo "   (bagsiz=t ise satir indekssiz: fallback AD-kilidi yolundan gecer)"
  sorgu 'SELECT u.email, b.name AS marka, ul.\"materialName\", ul.cins, ul.cap, ul.unit, (ul.\"productIndexId\" IS NULL) AS bagsiz, ul.\"listPrice\", ul.\"discountRate\" FROM \"UserLibrary\" ul JOIN \"Brand\" b ON b.id = ul.\"brandId\" JOIN \"User\" u ON u.id = ul.\"userId\" WHERE ul.\"materialName\" ILIKE '"'"'%kau%'"'"' OR ul.\"adRaw\" ILIKE '"'"'%kau%'"'"' ORDER BY u.email, b.name, ul.\"sortOrder\" LIMIT 60'
}

bolum5() {
  echo "── 5/7 DUYAR kuresel vana — KUTUPHANE (motorun havuzu, ilk 60) ──"
  sorgu 'SELECT u.email, ul.\"materialName\", ul.cins AS kutuphane_cins, ul.cap AS kutuphane_cap, pi.ad, pi.cins, pi.\"capRaw\", pi.\"adSlug\", pi.\"sizeClass\", pi.\"capTags\", pi.\"cinsTokens\", pi.\"baglantiTokens\", ul.\"listPrice\", ul.\"customPrice\", ul.\"discountRate\", (ul.\"productIndexId\" IS NULL) AS bagsiz FROM \"UserLibrary\" ul JOIN \"Brand\" b ON b.id = ul.\"brandId\" JOIN \"User\" u ON u.id = ul.\"userId\" LEFT JOIN \"ProductIndex\" pi ON pi.id = ul.\"productIndexId\" WHERE b.name ILIKE '"'"'%duyar%'"'"' AND (ul.\"materialName\" ILIKE '"'"'%resel%'"'"' OR pi.ad ILIKE '"'"'%resel%'"'"') ORDER BY u.email, ul.\"sortOrder\" LIMIT 60'
}

bolum6() {
  echo "── 6/7 DUYAR kuresel vana — HAVUZ tarafi (kutuphaneye aktarilmamislar dahil, ilk 60) ──"
  echo "   (kutuphanede OLMAYAN cap burada varsa aciklama 'aktarilmamis'tir, motor degil)"
  sorgu 'SELECT pi.kategori, pi.ad, pi.cins, pi.\"capRaw\", pi.birim, pi.\"adSlug\", pi.\"capTags\", pi.\"cinsTokens\", pi.\"baglantiTokens\", pi.price FROM \"ProductIndex\" pi JOIN \"Brand\" b ON b.id = pi.\"brandId\" WHERE b.name ILIKE '"'"'%duyar%'"'"' AND pi.ad ILIKE '"'"'%resel%'"'"' ORDER BY pi.\"sortOrder\" LIMIT 60'
}

bolum7() {
  echo "── 7/7 KAUCUK satirlarinin AILE kirilimi (motor hangi aileye dusurmus) ──"
  sorgu 'SELECT pi.\"adSlug\" AS aile, pi.\"sizeClass\", count(*) AS satir FROM \"ProductIndex\" pi WHERE pi.ad ILIKE '"'"'%kau%'"'"' OR pi.kategori ILIKE '"'"'%kau%'"'"' OR pi.\"sheetName\" ILIKE '"'"'%kau%'"'"' GROUP BY 1,2 ORDER BY 3 DESC'
}

bolum8() {
  echo "── 8 OZET: KAUCUK ad bicimleri — marka + BENZERSIZ ad + satir sayisi ──"
  echo "   (463 satiri tekil adlara sikistirir — tek sayfada biter. eski_aile"
  echo "    kolonu BAYAT depolanmis deger olabilir; guncel kod canli turetir)"
  sorgu 'SELECT b.name AS marka, pi.\"adSlug\" AS eski_aile, pi.ad, count(*) AS satir, min(pi.\"indexVersion\") AS sv FROM \"ProductIndex\" pi JOIN \"Brand\" b ON b.id = pi.\"brandId\" WHERE pi.ad ILIKE '"'"'%kau%'"'"' OR pi.kategori ILIKE '"'"'%kau%'"'"' OR pi.\"sheetName\" ILIKE '"'"'%kau%'"'"' GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 40'
}

case "$SECIM" in
  1|2|3|4|5|6|7|8)
    echo "(SAYFALI MOD — SPACE: sonraki sayfa · b: onceki sayfa · q: cikis)"
    "bolum$SECIM" 2>&1 | less
    ;;
  '')
    bolum1; bolum2; bolum3; bolum4; bolum5; bolum6; bolum7; bolum8
    echo ""
    echo "BITTI — bolumlerin ciktisini (ekran goruntusu yeterli) geri gonderin."
    echo "Uzun bolumler icin sayfali mod: bash scripts/kv-kaucuk-olcu.sh 3"
    ;;
  *)
    echo "Gecersiz secim: $SECIM (1-8 arasi bir bolum numarasi ya da bos)"
    exit 2
    ;;
esac
