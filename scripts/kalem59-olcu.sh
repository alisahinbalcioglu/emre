#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  KALEM 59 — OKSUZ KUTUPHANE SATIRI CANLI OLCUSU   (SALT-OKUMA, 04.08.2026)
#
#  KULLANIM (Hetzner web konsolunda, sirayla — hicbirinde ozel karakter yok):
#      cd /opt/metaprice
#      git pull origin master
#      bash scripts/kalem59-olcu.sh
#
#  NEDEN BETIK: Hetzner web konsolu TR klavyede su karakterleri YAZAMIYOR:
#      "   (   )   ?   _   $   |   >   %   ~   `
#  Bu olcumun sorgusu bunlarin ALTISINI birden tasiyor (tirnakli tablo adlari,
#  parantezli alt-sorgular, alt-cizgili kolon adlari). Konsola yazmak IMKANSIZ.
#  Ayni tuzak 04.08'de UC KEZ olcumu bozdu (fk-dogrula.sh:9-16'da kayitli).
#  Ozel karakterlerin TAMAMI bu dosyanin icinde durur.
#
#  ── OLCUTUN KAYNAGI (uydurma DEGIL, koddan cikarildi) ───────────────────────
#  backend/src/ozellik/kutuphane/admin/admin.service.ts:1023-1030
#      oksuzKalacak = userLibrary.count({ sourcePriceListId: priceList.id,
#                                         productIndexId: null })
#      iskontolu    = ayni kosul + discountRate: { gt: 0 }
#  Orada olcut TEK BIR listeye baglidir (yeniden yuklenmek uzere olan liste).
#  Buradaki olcum ayni olcutun BUTUN listeler uzerindeki birlesimidir:
#      sourcePriceListId IS NOT NULL AND productIndexId IS NULL
#  Yani "bugun herhangi bir fiyat listesi yeniden yuklenirse oksuz kalacak
#  satirlarin tamami". Prisma'nin `gt: 0` kosulu NULL'u dislar; SQL karsiligi
#  COALESCE(x,0) > 0 — birebir ayni kume.
#
#  ── OLCUTE TEK EKLEME (bilincli, isaretli) ──────────────────────────────────
#  Kod yalniz `discountRate` sayiyor. Bu betik AYRICA `customPrice` (ozel fiyat)
#  sutununu da sayar. Gerekce: ikisi de kullanicinin KENDI ticari verisidir ve
#  ikisi de geri uretilemez (schema.prisma UserLibrary yorumu: "kullanicinin
#  iskontosu GERI URETILEMEZ"). Iskontosuz ama ozel fiyatli bir satir kod
#  tarafindan gorunmez — bu betik onu ayri sutunda gosterir.
#
#  ── PAYDA VE KIRILIM ZORUNLU ────────────────────────────────────────────────
#  "Oksuz 0" TEK BASINA KANIT DEGILDIR: bos bir tablo da 0 verir. Bu yuzden
#  her sayi bir PAYDA ile birlikte basilir (toplam satir, listeye bagli satir,
#  toplam kullanici) ve girdinin DOLU oldugu AYRI kontrol edilir — bos ise
#  betik yesil demez, ON KOSUL YOK (2) doner.
#
#  ── YALNIZ OKUR ─────────────────────────────────────────────────────────────
#  Her sorgu BEGIN READ ONLY ile acilir, ROLLBACK ile kapanir. INSERT/UPDATE/
#  DELETE/CREATE/ALTER/DROP iceren tek bir ifade yoktur.
#
#  ── CIKIS KODU SOZLESMESI (KD8) ─────────────────────────────────────────────
#      0 = OLCUM YAPILDI (risk var ya da yok — ikisi de olcumdur)
#      2 = ON KOSUL YOK  (baglanti kurulamadi ya da olcut bosa dustu)
#      diger = beklenmedik hata
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

# ── ORTAK SQL PARCASI ───────────────────────────────────────────────────────
# Tek yerde dursun ki ozet sorgusu ile kirilim sorgulari AYRISMASIN.
KOSUL='l."sourcePriceListId" IS NOT NULL AND l."productIndexId" IS NULL'

OZET_SQL="
BEGIN READ ONLY;
SELECT
  (SELECT count(*) FROM \"UserLibrary\" l) AS a_toplam_satir,
  (SELECT count(*) FROM \"UserLibrary\" l WHERE l.\"sourcePriceListId\" IS NOT NULL) AS b_listeye_bagli,
  (SELECT count(*) FROM \"UserLibrary\" l WHERE $KOSUL) AS c_oksuz,
  (SELECT count(*) FROM \"UserLibrary\" l WHERE $KOSUL AND COALESCE(l.\"discountRate\",0) > 0) AS d_oksuz_iskontolu,
  (SELECT count(*) FROM \"UserLibrary\" l WHERE $KOSUL AND COALESCE(l.\"customPrice\",0) > 0) AS e_oksuz_ozelfiyatli,
  (SELECT count(*) FROM \"UserLibrary\" l WHERE $KOSUL AND (COALESCE(l.\"discountRate\",0) > 0 OR COALESCE(l.\"customPrice\",0) > 0)) AS f_oksuz_ticari_verili,
  (SELECT count(DISTINCT l.\"userId\") FROM \"UserLibrary\" l WHERE $KOSUL) AS g_etkilenen_kullanici,
  (SELECT count(*) FROM \"User\") AS h_toplam_kullanici;
ROLLBACK;
"

RAPOR_SQL="
BEGIN READ ONLY;
\\echo '── 1. PAYDA (kirilimlar bunun icinden cikar) ──'
SELECT
  (SELECT count(*) FROM \"UserLibrary\" l) AS toplam_satir,
  (SELECT count(*) FROM \"UserLibrary\" l WHERE l.\"sourcePriceListId\" IS NOT NULL) AS listeye_bagli,
  (SELECT count(*) FROM \"UserLibrary\" l WHERE $KOSUL) AS oksuz_satir,
  (SELECT count(*) FROM \"UserLibrary\" l WHERE $KOSUL AND COALESCE(l.\"discountRate\",0) > 0) AS oksuz_iskontolu,
  (SELECT count(*) FROM \"UserLibrary\" l WHERE $KOSUL AND COALESCE(l.\"customPrice\",0) > 0) AS oksuz_ozel_fiyatli,
  (SELECT count(*) FROM \"User\") AS toplam_kullanici;

\\echo ''
\\echo '── 2. KULLANICI KIRILIMI (oksuz satiri olanlar) ──'
SELECT u.email AS kullanici,
       count(*) AS oksuz_satir,
       count(*) FILTER (WHERE COALESCE(l.\"discountRate\",0) > 0) AS iskontolu,
       count(*) FILTER (WHERE COALESCE(l.\"customPrice\",0) > 0) AS ozel_fiyatli
FROM \"UserLibrary\" l
JOIN \"User\" u ON u.id = l.\"userId\"
WHERE $KOSUL
GROUP BY u.email
ORDER BY 2 DESC;

\\echo ''
\\echo '── 3. MARKA KIRILIMI (oksuz satiri olanlar) ──'
SELECT b.name AS marka,
       count(*) AS oksuz_satir,
       count(*) FILTER (WHERE COALESCE(l.\"discountRate\",0) > 0) AS iskontolu,
       count(*) FILTER (WHERE COALESCE(l.\"customPrice\",0) > 0) AS ozel_fiyatli,
       count(DISTINCT l.\"userId\") AS kullanici
FROM \"UserLibrary\" l
JOIN \"Brand\" b ON b.id = l.\"brandId\"
WHERE $KOSUL
GROUP BY b.name
ORDER BY 2 DESC;
ROLLBACK;
"

# ── BAGLANTI YOLU ───────────────────────────────────────────────────────────
# SUNUCU (asil yol): kb5-olcu.sh:40 ikizi — backup servisinin HER GUN calisan
#   yolu. Kimlik bilgileri compose environment'tan gelir, .env'den okunan
#   kullanici/veritabani adi ile birlikte (fk-dogrula.sh:37-40 deseni).
# YEREL PROVA: sunucuda olmayan bir makinede betigin CALISTIGINI kanitlamak
#   icin. `PSQL` degiskeni verilirse dogrudan psql kullanilir; boylece "betigi
#   yazdim ama hic kosturmadim" durumu olusamaz.
PG_KULLANICI="$(grep -E '^POSTGRES_USER=' .env 2>/dev/null | cut -d= -f2- | tr -d '\r"' || true)"
PG_VERITABANI="$(grep -E '^POSTGRES_DB=' .env 2>/dev/null | cut -d= -f2- | tr -d '\r"' || true)"
PG_KULLANICI="${PG_KULLANICI:-metaprice}"
PG_VERITABANI="${PG_VERITABANI:-metaprice}"

sorgu_kos() {   # $1 = SQL metni, $2 = ek psql bayraklari (bos olabilir)
  if [ -n "${PSQL:-}" ]; then
    # shellcheck disable=SC2086
    printf '%s\n' "$1" | "$PSQL" "$YEREL_URL" -v ON_ERROR_STOP=1 $2 -f -
  else
    printf '%s\n' "$1" | docker compose exec -T backup \
      sh -c "psql -h db -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -v ON_ERROR_STOP=1 $2 -f -"
  fi
}

if [ -n "${PSQL:-}" ]; then
  YEREL_URL="${DATABASE_URL:-$(grep -E '^DATABASE_URL=' backend/.env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r"' || true)}"
  if [ -z "$YEREL_URL" ]; then
    echo "ON KOSUL YOK — YEREL kip istendi (PSQL verildi) ama DATABASE_URL bulunamadi."
    exit 2
  fi
  echo "── KALEM 59 OLCUMU — YEREL KIP (prova) ──"
  echo "   ⚠ YEREL veri CANLIYI TEMSIL ETMEZ. Karar cumlesi yalniz canlida gecerlidir."
else
  if ! command -v docker >/dev/null 2>&1; then
    echo "ON KOSUL YOK — docker bulunamadi. Bu betik sunucuda (/opt/metaprice) kosulur."
    exit 2
  fi
  echo "── KALEM 59 OLCUMU — SUNUCU KIPI ──"
  echo "   veritabani: $PG_VERITABANI   kullanici: $PG_KULLANICI"
fi
echo ""

# ── 1) OZET (makine okunur) ─────────────────────────────────────────────────
# NOT: `-A` kipinde psql'in VARSAYILAN alan ayraci zaten `|`. Ayraci `-F` ile
# ayrica vermiyoruz — cunku bu bayrak sunucu yolunda `sh -c "..."` icine
# gomuluyor ve oradaki `|` KABUK BORUSU olarak yorumlanirdi (sessiz bozulma).
SATIR="$(sorgu_kos "$OZET_SQL" "-t -A" | grep -E '^[0-9]+\|' | head -1 || true)"
if [ -z "$SATIR" ]; then
  echo "ON KOSUL YOK — ozet sorgusu sayi dondurmedi. Baglanti kurulamadi ya da tablo adi degisti."
  echo "   Karar VERILMEDI (olcut supheli — bkz. 'Olcutu Once Dogrula')."
  exit 2
fi

TOPLAM="$(printf '%s' "$SATIR"       | cut -d'|' -f1)"
LISTELI="$(printf '%s' "$SATIR"      | cut -d'|' -f2)"
OKSUZ="$(printf '%s' "$SATIR"        | cut -d'|' -f3)"
ISKONTOLU="$(printf '%s' "$SATIR"    | cut -d'|' -f4)"
OZELFIYATLI="$(printf '%s' "$SATIR"  | cut -d'|' -f5)"
TICARIVERILI="$(printf '%s' "$SATIR" | cut -d'|' -f6)"
ETKILENEN="$(printf '%s' "$SATIR"    | cut -d'|' -f7)"
KULLANICI="$(printf '%s' "$SATIR"    | cut -d'|' -f8)"

# ── 2) OLCUTU ONCE DOGRULA — girdinin DOLU oldugunu AYRI assertler kanitlar ──
# Iki ayri sart, iki ayri mesaj (BIR ASSERT TEK KRITERE). Ikisi de "hicbir sey
# bulamadim" ile "hicbir seye bakmadim" ayrimini korur.
if [ "$TOPLAM" -eq 0 ]; then
  echo "ON KOSUL YOK — UserLibrary tablosu BOS (0 satir)."
  echo "   Bu bir 'sorun yok' cevabi DEGILDIR: olcumun girdisi bos, sonuc ANLAMSIZ."
  exit 2
fi
if [ "$LISTELI" -eq 0 ]; then
  echo "ON KOSUL YOK — $TOPLAM kutuphane satirinin HICBIRI bir fiyat listesine bagli degil"
  echo "   (sourcePriceListId hepsinde NULL). KALEM 59 olcutunun kapsami bos."
  echo "   Bu 'risk yok' demek DEGILDIR — aktarim akisi sourcePriceListId yaziyorsa"
  echo "   bu sonuc olcutun bozuldugunu gosterir. Karar VERILMEDI."
  exit 2
fi

# ── 3) INSAN OKUNUR RAPOR + KIRILIMLAR ──────────────────────────────────────
sorgu_kos "$RAPOR_SQL" ""

# ── 4) KARAR — duz Turkce ───────────────────────────────────────────────────
echo ""
echo "── KARAR ──"
echo "   Olculen payda: $TOPLAM kutuphane satiri, bunlarin $LISTELI tanesi bir fiyat"
echo "   listesine bagli. Sistemde toplam $KULLANICI kullanici var."
echo ""
if [ "$OKSUZ" -eq 0 ]; then
  echo "  ✔ OKSUZ SATIR YOK (0 / $LISTELI listeye bagli satir)."
  echo "    Bu sayi BOS KUMEDEN gelmiyor: payda dolu ($LISTELI satir olculdu),"
  echo "    yani olcum gercekten yapildi ve sonuc sifir cikti."
  echo "    ONERI: KALEM 59 icin bugun HICBIR SEY YAPILMAZ. Onarim turu ACILMAZ."
  echo "    (Kalem 58'in muhurlu kurali: canli veri 0 ise yerel veri gerekce olamaz.)"
  exit 0
fi

echo "  ⚠ $OKSUZ kutuphane satiri OKSUZ ( $LISTELI listeye bagli satirin icinden )."
echo "    Bunlarin $ISKONTOLU tanesinde kullanicinin girdigi ISKONTO,"
echo "    $OZELFIYATLI tanesinde OZEL FIYAT var. Etkilenen kullanici: $ETKILENEN / $KULLANICI."
echo ""
if [ "$TICARIVERILI" -eq 0 ]; then
  echo "    ONERI: satirlar oksuz ama HICBIRINDE kullanicinin girdigi ticari veri yok."
  echo "    Kaybedilecek geri-uretilemez veri YOK; yapi zaten yeniden uretilebilir."
  echo "    Onarim turu ACILMAZ; yalniz izlemeye alinir."
else
  echo "    ONERI: onarim turu ACILABILIR. Risk altindaki geri-uretilemez veri: $TICARIVERILI satir"
  echo "    (iskonto YA DA ozel fiyat tasiyan oksuz satirlarin BIRLESIMI — cift saymaz)."
  echo "    Yukaridaki KULLANICI ve MARKA kirilimi hangi musteriyi/markayi vurdugunu gosterir."
  echo "    ⚠ Otomatik yeniden baglama YAPILMAMALIDIR (admin.service.ts:1018-1022):"
  echo "    yanlis eslesme kullanicinin iskontosunu YANLIS urune yazar."
fi
exit 0
