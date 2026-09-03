#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  ABONELIK GECISI — CANLI ETKI SAYIMI (SALT-OKUMA)
#
#  KULLANIM (Hetzner web konsolunda):
#      cd /opt/metaprice
#      bash scripts/abonelik-olcum.sh          (OZET — tek ekrana sigar)
#      bash scripts/abonelik-olcum.sh kimler   (etkilenen firmalarin dokumu)
#      bash scripts/abonelik-olcum.sh dagilim  (hangi firma HANGI pakette)
#      bash scripts/abonelik-olcum.sh paket    (seed dogrulamasi, tam detay)
#
#  ⚠ VARSAYILAN KIP OZET. Hetzner web konsolunda GERI KAYDIRMA YOK; uzun
#  dokum ekrandan tasinca ustteki sayimlar KAYBOLUR (28.08'de yasandi).
#  Dosya adinda alt cizgi YOK ve konsola yazilan satirlarda  _ $ > | :
#  karakterlerinin hicbiri yok — konsol TR klavyede bunlari yazamiyor.
#
#  ── NE ICIN VAR ────────────────────────────────────────────────────────────
#  02.09'da ADIM 2 (odeme/abonelik) canliya cikti. O deploy'la YETENEK
#  KAYNAGI degisti — backend/src/altyapi/auth/capabilities.helper.ts:
#      const ab = await prisma.abonelik.findUnique({ where: { firmaId } })
#      if (!ab) return emptyCapabilities();
#  Yani "Abonelik satiri olmayan firma = SIFIR yetenek".
#
#  ⚠ BU BETIK YAZILIRKENKI VARSAYIM YANLISTI ve 02.09'da bu betigin KENDISI
#  onu curuttu. "Kimse satin almadi, oyleyse kimsenin Abonelik satiri yok"
#  saniliyordu. Gercek: migration 20260828100000 (satir 361-383) HER mevcut
#  firmaya `miras-core`/`miras-pro` paketiyle AKTIF + 365 gunluk bir satir
#  YAZIYOR. Ilk canli kosumda 3 firmanin 3'unde de satir cikti, etkilenen
#  kullanici 0. Yani kimse kilitlenmedi.
#
#  Betik yine de degerlidir: yeni acilan firmalar bu satiri ALMAZ (migration
#  bir kez kosar), yani ayni risk ILERIDE geri gelebilir. Ayrica `dagilim`
#  kipi "kim miras-core'da" sorusunu cevaplar — o firmalarda DWG SONUKTUR.
#
#  Kod okuyarak sunu OGRENEMEYIZ: bu durum KAC GERCEK MUSTERIYI etkiliyor?
#  Bos/terk edilmis hesap ile aktif musteri arasindaki fark yalniz VERIDE
#  gorunur. Bu betik o farki olcer. Kod kanit degildir.
#
#  Betik hicbir sey DEGISTIRMEZ: sorgular BEGIN READ ONLY icinde, sonda ROLLBACK.
#
#  ── KARAR KURALI — cikti okunurken ─────────────────────────────────────────
#    A1 aboneliksiz_firma = 0 ise        -> kimse etkilenmiyor, is yok.
#    A1 aboneliksiz_firma > 0 VE
#       A2 teklifi_olan = 0 VE
#       A2 kutuphanesi_olan = 0 ise      -> yalniz BOS hesaplar etkileniyor.
#                                           Aciliyet DUSUK; ileri duzeltme yeter.
#    A2 teklifi_olan > 0 ise             -> GERCEK MUSTERI kilitlendi. ACIL.
#                                           `kimler` kipini kos, kim oldugunu
#                                           gor, once onun erisimini ac.
#    A3 UserSubscription satiri > 0 ise  -> bu kisiler ESKI sistemde yetki
#                                           verilmis/parasini odemis kisilerdir.
#                                           Yeni sistemde karsiligi YOK demektir.
#    A4 son UC sutun 5/5/5 degilse       -> seed eksik kosmus; satin alma
#                                           sayfasi eksik paket gosterir.
#                                           ⚠ paket/surum 7 cikar ve DOGRUDUR:
#                                           5 gercek + 2 goc paketi (miras-*).
#
#  ⚠ PAYDA ZORUNLU: "0 cikti" tek basina kanit degildir — bos kume de 0 verir.
#  Her sayim toplamiyla birlikte doner. Toplam da 0 ise olcum YAPILMIS SAYILMAZ.
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

KIP="${1:-ozet}"

# ── ON KOSUL: ADIM 2 tablolari gercekten var mi? ────────────────────────────
# Yoksa asagidaki her sorgu "relation does not exist" ile patlar ve bu,
# "olcum yapildi, sonuc 0" ile KARISTIRILABILIR. Once acikca ayirt ediliyor.
echo "── on kosul: ADIM 2 tablolari ──"
sorgu 'SELECT to_regclass('"'"'public.\"Abonelik\"'"'"') AS abonelik_tablosu, to_regclass('"'"'public.\"Paket\"'"'"') AS paket_tablosu, to_regclass('"'"'public.\"PaketSurumu\"'"'"') AS surum_tablosu'
echo "   (uc sutunda da bir ad gorunmeli. bos/NULL ise migration kosmamis"
echo "    demektir — ASAGIDAKI SAYIMLARI OKUMAYIN, once migration'a bakin.)"
echo ""

if [ "$KIP" = "paket" ]; then
  echo "=============================================================="
  echo " A4 — SEED DOGRULAMASI (7 satir: 5 gercek + 2 goc paketi)"
  echo "=============================================================="
  echo ""
  echo "── paket + surum + fiyat capasi ──"
  sorgu 'SELECT p.kod, p.kapsam, p.seviye, p.\"kullaniciHakki\" AS kul, p.\"dwgAktif\" AS dwg, s.\"surumNo\" AS surum, s.tutar AS tl_tutar, s.\"referansTutar\" AS vitrin, s.\"referansParaBirimi\" AS birim, s.\"kurDegeri\" AS kur, s.\"denemeGunu\" AS deneme, s.\"satistaMi\" AS satista FROM \"Paket\" p LEFT JOIN \"PaketSurumu\" s ON s.\"paketId\" = p.id ORDER BY p.sira, s.\"surumNo\"'
  echo ""
  echo "── iyzico kodlari yazilmis mi (bos olan varsa o paket SATIN ALINAMAZ) ──"
  sorgu 'SELECT p.kod, (s.\"iyzicoPlanKodu\" IS NOT NULL) AS plan_kodu_var, (s.\"iyzicoUrunKodu\" IS NOT NULL) AS urun_kodu_var FROM \"Paket\" p LEFT JOIN \"PaketSurumu\" s ON s.\"paketId\" = p.id ORDER BY p.sira'
  echo ""
  echo "=============================================================="
  echo " OKUMA: SATISTAKI 5 satirda tl_tutar/vitrin/kur dolu + deneme=30"
  echo " + satista=t + iki kod sutunu da t ise seed TAM."
  echo " ⚠ miras-core/miras-pro satirlari FARKLI olmali: tutar 0, vitrin bos,"
  echo " deneme 0, satista=f. Onlar tahsilat degil GOC EMNIYETIDIR."
  echo "=============================================================="
  exit 0
fi

if [ "$KIP" = "kimler" ]; then
  echo "=============================================================="
  echo " ETKILENEN FIRMALAR — aboneligi olmayan, ISI OLAN hesaplar"
  echo "=============================================================="
  echo ""
  echo "── en cok isi olan 25 firma (teklif sayisina gore) ──"
  sorgu 'SELECT left(f.id, 8) AS firma, left(coalesce(f.unvan, f.ad), 24) AS ad, (SELECT count(*) FROM \"User\" u WHERE u.\"firmaId\" = f.id) AS uye, (SELECT count(*) FROM \"Quote\" q WHERE q.\"firmaId\" = f.id) AS teklif, (SELECT count(*) FROM \"UserLibrary\" l WHERE l.\"firmaId\" = f.id) AS kutuphane, (SELECT max(q.\"createdAt\") FROM \"Quote\" q WHERE q.\"firmaId\" = f.id) AS son_teklif FROM \"Firma\" f WHERE NOT EXISTS (SELECT 1 FROM \"Abonelik\" a WHERE a.\"firmaId\" = f.id) ORDER BY teklif DESC, kutuphane DESC LIMIT 25'
  echo ""
  echo "── bu firmalarin uyelerinin ESKI yetkileri ──"
  sorgu 'SELECT left(u.\"firmaId\", 8) AS firma, left(u.email, 28) AS eposta, u.tier, u.status, u.\"firmaRol\" AS rol, (SELECT count(*) FROM \"UserSubscription\" s WHERE s.\"userId\" = u.id AND s.active) AS eski_abonelik FROM \"User\" u WHERE u.\"firmaId\" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM \"Abonelik\" a WHERE a.\"firmaId\" = u.\"firmaId\") ORDER BY eski_abonelik DESC, u.tier DESC LIMIT 25'
  echo ""
  echo "=============================================================="
  echo " OKUMA: son_teklif tarihi YAKIN olan firmalar aktif musteridir."
  echo " tier=pro ya da eski_abonelik>0 olanlar yetki verilmis kisilerdir."
  echo ""
  echo " ⚠ Bu kip yalniz ABONELIGI OLMAYAN firmalari listeler. Goc"
  echo " yedeklemesi kostuysa o kume BOS olur ve ekran bos gorunur — bu"
  echo " bir hata degildir. Kimin hangi pakette oldugunu gormek icin:"
  echo "     bash scripts/abonelik-olcum.sh dagilim"
  echo "=============================================================="
  exit 0
fi

# ── DAGILIM: hangi firma HANGI pakette? ────────────────────────────────────
# 02.09'da ihtiyac oldu: goc yedeklemesi kostuktan sonra `kimler` kipi BOS
# donuyor (aboneliksiz firma kalmadi) ve asil soru cevapsiz kaliyor —
# "kim `miras-core`'da?" Cunku `miras-core` paketinde `dwgAktif=false`;
# o firmalarda DWG kutusu SONUK gorunur (kullanici karari 02.09).
if [ "$KIP" = "dagilim" ]; then
  echo "=============================================================="
  echo " FIRMA -> PAKET DAGILIMI"
  echo "=============================================================="
  echo ""
  echo "── paket basina firma sayisi (PAYDA ile) ──"
  sorgu 'SELECT coalesce(p.kod, '"'"'(abonelik YOK)'"'"') AS paket, p.\"dwgAktif\" AS dwg, count(*) AS firma FROM \"Firma\" f LEFT JOIN \"Abonelik\" a ON a.\"firmaId\" = f.id LEFT JOIN \"PaketSurumu\" s ON s.id = a.\"paketSurumuId\" LEFT JOIN \"Paket\" p ON p.id = s.\"paketId\" GROUP BY 1, 2 ORDER BY 3 DESC'
  echo ""
  echo "── firma firma (DWG sutunu f ise o firmada kutu SONUK) ──"
  sorgu 'SELECT left(f.id, 8) AS firma, left(coalesce(f.unvan, f.ad), 20) AS ad, coalesce(p.kod, '"'"'YOK'"'"') AS paket, p.\"dwgAktif\" AS dwg, a.durum, a.\"erisimSonu\"::date AS erisim_sonu, (SELECT count(*) FROM \"User\" u WHERE u.\"firmaId\" = f.id) AS uye, (SELECT count(*) FROM \"Quote\" q WHERE q.\"firmaId\" = f.id) AS teklif FROM \"Firma\" f LEFT JOIN \"Abonelik\" a ON a.\"firmaId\" = f.id LEFT JOIN \"PaketSurumu\" s ON s.id = a.\"paketSurumuId\" LEFT JOIN \"Paket\" p ON p.id = s.\"paketId\" ORDER BY p.\"dwgAktif\" NULLS FIRST, teklif DESC LIMIT 40'
  echo ""
  echo "── miras pakettekilerin uyeleri (kime haber verilecek) ──"
  sorgu 'SELECT left(u.\"firmaId\", 8) AS firma, left(u.email, 30) AS eposta, u.tier, p.kod AS paket, p.\"dwgAktif\" AS dwg FROM \"User\" u JOIN \"Abonelik\" a ON a.\"firmaId\" = u.\"firmaId\" JOIN \"PaketSurumu\" s ON s.id = a.\"paketSurumuId\" JOIN \"Paket\" p ON p.id = s.\"paketId\" WHERE p.kod LIKE '"'"'miras-%'"'"' ORDER BY p.\"dwgAktif\", u.email LIMIT 40'
  echo ""
  echo "=============================================================="
  echo " OKUMA:"
  echo "   dwg=f olan firmalarda DWG kutusu SONUK gorunur (Pro ozelligi)."
  echo "   miras-* satirlari bir TAHSILATI temsil ETMEZ — goc emniyetidir,"
  echo "   tutar 0 ve satisa kapali. O firmalar odeme yapmadan 365 gun"
  echo "   erisir; gercek pakete gecince satir uzerine yazilir."
  echo "=============================================================="
  exit 0
fi

echo "=============================================================="
echo " ABONELIK GECISI — CANLI ETKI OZETI (salt-okuma, degistirmez)"
echo " dokum: ... kimler (aboneliksizler) · ... dagilim (kim hangi pakette)"
echo "=============================================================="
echo ""

echo "── A1 KARAR TABLOSU: kac firma/kullanici yetenegini kaybetti ──"
echo "   (PAYDA ile. toplam 0 ise olcum YAPILMAMIS sayilir.)"
sorgu 'SELECT (SELECT count(*) FROM \"Firma\") AS firma_toplam, (SELECT count(*) FROM \"Abonelik\") AS abonelik_satiri, (SELECT count(*) FROM \"Firma\" f WHERE NOT EXISTS (SELECT 1 FROM \"Abonelik\" a WHERE a.\"firmaId\" = f.id)) AS aboneliksiz_firma, (SELECT count(*) FROM \"User\") AS kullanici_toplam, (SELECT count(*) FROM \"User\" u WHERE u.\"firmaId\" IS NULL) AS firmasiz_kullanici, (SELECT count(*) FROM \"User\" u WHERE u.\"firmaId\" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM \"Abonelik\" a WHERE a.\"firmaId\" = u.\"firmaId\")) AS etkilenen_kullanici'
echo ""

echo "── A2 ETKI AGIRLIGI: bos hesap mi, gercek musteri mi ──"
sorgu 'SELECT count(*) AS aboneliksiz_firma, count(*) FILTER (WHERE teklif > 0) AS teklifi_olan, count(*) FILTER (WHERE kutuphane > 0) AS kutuphanesi_olan, count(*) FILTER (WHERE teklif = 0 AND kutuphane = 0) AS bos_hesap, count(*) FILTER (WHERE son_teklif > now() - interval '"'"'30 days'"'"') AS son_30_gun_aktif FROM (SELECT f.id, (SELECT count(*) FROM \"Quote\" q WHERE q.\"firmaId\" = f.id) AS teklif, (SELECT count(*) FROM \"UserLibrary\" l WHERE l.\"firmaId\" = f.id) AS kutuphane, (SELECT max(q.\"createdAt\") FROM \"Quote\" q WHERE q.\"firmaId\" = f.id) AS son_teklif FROM \"Firma\" f WHERE NOT EXISTS (SELECT 1 FROM \"Abonelik\" a WHERE a.\"firmaId\" = f.id)) t'
echo ""

echo "── A3 ESKI YETKI KAYNAKLARI: kim neyi kaybetti ──"
sorgu 'SELECT '"'"'User.tier'"'"' AS kaynak, u.tier::text AS deger, count(*) AS adet FROM \"User\" u GROUP BY 2 UNION ALL SELECT '"'"'UserSubscription'"'"', s.level::text, count(*) FROM \"UserSubscription\" s WHERE s.active GROUP BY 2 ORDER BY 1, 3 DESC'
echo ""

echo "── A4 SEED: paket/surum sayilari (SATISTA olan 5 olmali) ──"
echo "   ⚠ paket ve surum 7 cikar: 5 gercek + 2 goc (miras-core/miras-pro)."
echo "   Goc paketleri satisa KAPALI; bakilacak sutunlar son UCU."
sorgu 'SELECT (SELECT count(*) FROM \"Paket\") AS paket, (SELECT count(*) FROM \"PaketSurumu\") AS surum, (SELECT count(*) FROM \"PaketSurumu\" WHERE \"satistaMi\") AS satista, (SELECT count(*) FROM \"PaketSurumu\" WHERE \"referansTutar\" IS NOT NULL) AS vitrin_capasi, (SELECT count(*) FROM \"PaketSurumu\" WHERE \"denemeGunu\" = 30) AS deneme_30'
echo ""

echo "=============================================================="
echo " OKUMA (bastaki KARAR KURALI ile birlikte):"
echo "   aboneliksiz_firma 0 ise   -> is yok."
echo "   teklifi_olan 0 ise        -> yalniz bos hesaplar, aciliyet dusuk."
echo "   teklifi_olan 0 DEGILSE    -> GERCEK MUSTERI kilitli. ACIL."
echo "                                bash scripts/abonelik-olcum.sh kimler"
echo "   A4 son uc sutun 5/5/5 degilse -> seed eksik kosmus."
echo "                                (paket/surum 7 ise DOGRU: 5 + 2 goc)"
echo "=============================================================="
