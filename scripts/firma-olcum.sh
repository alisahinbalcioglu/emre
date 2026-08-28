#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  FIRMA GECISI — ADIM 0 SAYIMLARI (SALT-OKUMA)
#
#  KULLANIM (Hetzner web konsolunda):
#      cd /opt/metaprice
#      bash scripts/firma-olcum.sh
#
#  NEDEN SCRIPT (deploy.sh / kv-kaucuk-olcu.sh deseni): Hetzner web konsolu TR
#  klavyede  $  >  |  _  karakterlerini YAZAMIYOR. Ozel karakterlerin TAMAMI bu
#  dosyanin icinde durur; konsola yazilan satirda hicbiri yok. Dosya adinda da
#  alt cizgi YOKTUR (bilerek "firma-olcum", "firma_olcum" degil).
#
#  NE ICIN: 28.08'de teklif/format/kutuphane suzgecleri KISI'den FIRMA'ya gecti.
#  Sirada ESLESTIRME MOTORU var (docs/PLAN_Eslestirme_Firma_Dilimi.md) ve o plan
#  UC VARSAYIMA dayaniyor. Varsayimlar KOD okunarak dogrulandi ama VERI ile
#  DOGRULANMADI. Bu betik onlari olcer. Kod kanit degildir.
#
#  Betik hicbir sey DEGISTIRMEZ: sorgular BEGIN READ ONLY icinde, sonda ROLLBACK.
#
#  KARAR KURALI — cikti okunurken:
#    K0.1 (User) bos sayisi SIFIR DEGILSE  -> backfill migration'i canlida
#         kosmamis demektir. PLAN ORADA DURUR; once migration durumu incelenir.
#    K0.2 (UserLibrary) bos sayisi SIFIR DEGILSE -> aday havuzu suzgeci
#         firmaya cevrilirse o satirlar KAYBOLUR (motor "kutuphane bos" der).
#         Once ikinci backfill kosar, SONRA suzgec cevrilir. Ters sira urunu durdurur.
#    K0.3 (hafiza/sozluk) bos sayisi > 0 ise -> 28.08 backfill'i ile yazma
#         koprusu commit'i (6a5ad03) ARASINDAKI pencerede ogrenilen satirlar.
#         Sessiz kayip: okuma firmaya donunce o satirlar gorunmez olur.
#         Cozum ucuz — ikinci backfill; ama SAYIYI BILMEDEN "guvenli" denemez.
#    K0.4 (cakisma) bir tek satir bile DONERSE -> ilgili tekillik kisiti
#         (firmaId+imza / firmaId+alias / firmaId+ad) o firmada IKI kayit
#         bulmus demektir. Migration CREATE UNIQUE'te patlar; o adim bloklanir.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "ON KOSUL YOK — docker bulunamadi. Bu betik sunucuda (/opt/metaprice) kosulur."
  exit 2
fi

sorgu() {
  docker compose exec -T backup sh -c 'psql -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "BEGIN READ ONLY; '"$1"'; ROLLBACK"'
}

echo "=============================================================="
echo " FIRMA GECISI — ADIM 0 SAYIMLARI (salt-okuma, degistirmez)"
echo "=============================================================="
echo ""

echo "── 0/5 migration durumu (bu deploy'da neler uygulanmis) ──"
echo "   Beklenen: 20260827000000, 20260828000000, 20260828010000, 20260828020000"
sorgu 'SELECT migration_name AS migration, finished_at AS bitis FROM _prisma_migrations ORDER BY finished_at DESC NULLS FIRST LIMIT 8'
echo ""

echo "── 1/5 K0.1 — KOK KAPI: firmasiz kullanici var mi ──"
echo "   SIFIR DEGILSE plan burada DURUR (backfill kosmamis demektir)."
sorgu 'SELECT count(*) FILTER (WHERE \"firmaId\" IS NULL) AS firmasiz, count(*) AS toplam_kullanici, count(DISTINCT \"firmaId\") AS firma_sayisi FROM \"User\"'
echo ""

echo "── 2/5 K0.2 — TOPTAN RISK: kutuphane satirlarinda bos firmaId ──"
echo "   SIFIR DEGILSE aday havuzu suzgeci cevrildiginde o satirlar KAYBOLUR."
sorgu 'SELECT count(*) FILTER (WHERE \"firmaId\" IS NULL) AS bos_firma, count(*) AS toplam_satir FROM \"UserLibrary\"'
echo ""

echo "── 3/5 K0.3 — SESSIZ RISK: hafiza ve sozlukte bos firmaId ──"
echo "   (yalniz KISIYE ait satirlar sayilir; userId NULL olanlar sistem seed'idir)"
echo "   > 0 ise: 28.08 backfill'i ile yazma koprusu arasindaki pencere. Ikinci backfill gerekir."
echo "   EslesmeHafizasi:"
sorgu 'SELECT count(*) FILTER (WHERE \"firmaId\" IS NULL AND \"userId\" IS NOT NULL) AS bos_firma, count(*) AS toplam FROM \"EslesmeHafizasi\"'
echo "   TerminologyAlias (kisiye ait olanlar):"
sorgu 'SELECT count(*) FILTER (WHERE \"firmaId\" IS NULL AND \"userId\" IS NOT NULL) AS bos_firma, count(*) FILTER (WHERE \"userId\" IS NOT NULL) AS kisiye_ait, count(*) FILTER (WHERE \"userId\" IS NULL) AS sistem_seed, count(*) AS toplam FROM \"TerminologyAlias\"'
echo ""

echo "── 4/5 K0.4 — KISIT CAKISMASI: yeni tekillikler tutar mi ──"
echo "   HERHANGI BIR SATIR DONERSE ilgili migration CREATE UNIQUE'te PATLAR."
echo "   Beklenen: uc sorgu da BOS (0 rows)."
echo "   (a) EslesmeHafizasi (firmaId, imza):"
sorgu 'SELECT \"firmaId\", imza, count(*) AS adet FROM \"EslesmeHafizasi\" WHERE \"firmaId\" IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1 LIMIT 20'
echo "   (b) TerminologyAlias (firmaId, alias):"
sorgu 'SELECT \"firmaId\", alias, count(*) AS adet FROM \"TerminologyAlias\" WHERE \"firmaId\" IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1 LIMIT 20'
echo "   (c) LaborFirm (firmaId, ad):"
sorgu 'SELECT \"firmaId\", name, count(*) AS adet FROM \"LaborFirm\" WHERE \"firmaId\" IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1 LIMIT 20'
echo ""

echo "── 5/5 EK: firma dagilimi (bugun her firmada TEK uye olmali) ──"
echo "   Iki uyeli firma cikarsa, davet akisi olmadan uye eklenmis demektir —"
echo "   plandaki 'bugun davranis degismez' iddiasi O FIRMA icin GECERSIZDIR."
sorgu 'SELECT uye_sayisi AS firmadaki_uye, count(*) AS firma_adedi FROM (SELECT \"firmaId\", count(*) AS uye_sayisi FROM \"User\" WHERE \"firmaId\" IS NOT NULL GROUP BY 1) x GROUP BY 1 ORDER BY 1'
echo ""

echo "=============================================================="
echo " BITTI. Ciktinin ekran goruntusunu paylasin."
echo " Ozet okuma: K0.1 firmasiz=0 · K0.2 bos=0 · K0.3 bos=0 ise plan"
echo " oldugu gibi kosar. K0.4'ten satir donerse ilgili adim bloklanir."
echo "=============================================================="
