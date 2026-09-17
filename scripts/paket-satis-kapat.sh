#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  ELEKTRIK PAKETLERINI SATISTAN CEK  (FAZ 6.4 / 6.12b — Emre karari 15.09)
#
#  ⛔ 17.09 — BU BETIK KOSULMAZ. Emre karari TERSINE dondu: uc elektrik
#  paketi SATISTA KALIYOR, kapsama elektrik sonra eklenecek. Fiyat sayfasi
#  ve hukuki metinler 17.09'da eski (disiplinli) hallerine donduruldu.
#  Betik ve PGlite gecerlilik testi (backend/test/abonelik-olcum-sorgu-test.ts
#  S7) ileride gerekebilir diye SILINMEDI — ama calistirilmasi, bugun
#  satilan bir urunu sessizce satistan cekmek olur.
#
#  KULLANIM (Hetzner web konsolunda):
#      cd /opt/metaprice
#      bash scripts/paket-satis-kapat.sh             (PROVA — hicbir sey yazmaz)
#      bash scripts/paket-satis-kapat.sh --uygula    (YAZAR, tek islemde)
#
#  ⚠ VARSAYILAN PROVA. Once prova ciktisi Emre'ye gosterilir, sonra --uygula.
#  ⚠ Dosya adinda ve konsola yazilan satirlarda  _ $ > | :  karakterlerinin
#  hicbiri yok — Hetzner web konsolu TR klavyede bunlari yazamiyor.
#
#  ── NE YAPAR ───────────────────────────────────────────────────────────────
#  basic-elk, pro-elk ve pro-mep paketlerinin SATISTAKI tum surumlerinde
#  PaketSurumu.satistaMi degerini false yapar. Sonuc:
#      · /api/fiyatlar ve /abonelik listesinde bu paketler GORUNMEZ
#        (satinalma.servisi.ts satistakiPaketler -> where satistaMi true)
#      · bu surumle satin alma denemesi 400 ile durur
#        (satinalma.servisi.ts baslat -> "Bu paket surumu satista degil")
#
#  ── NEYE DOKUNMAZ ──────────────────────────────────────────────────────────
#  · Paket.aktif — DEGISMEZ. Satin alma yolu onu OKUMUYOR; kapatmak mevcut
#    abonelerin yetenek cozumunu bosuna riske atardi.
#  · Mevcut abonelikler — DEGISMEZ. Elektrik kapsamli aboneligi olan firma
#    donemi bitene kadar aynen kullanmaya devam eder.
#  · Ceviri kota tablosunun electrical/mep satirlari — KALIR (mevcut
#    aboneler + miras mep paketleri).
#  · iyzico planlari — silinmez, kullanilmadan kalir (masraf uretmez).
#
#  ── BILINEN ACIK (bilincli) ───────────────────────────────────────────────
#  Yonetici havale yolu (havale.controller / havale.servisi) satistaMi
#  OKUMUYOR: yonetici isterse elektrik paketiyle abonelik acabilir. Musteri
#  tarafina kapali oldugu icin kod DEGISTIRILMEDI; bu bir YONETICI ISTISNASI.
#
#  ── SONRA ─────────────────────────────────────────────────────────────────
#  Uygulandiktan en az 60 saniye sonra (fiyat ucu 60 sn onbellekli):
#      curl -s https://metapricex.com/api/fiyatlar
#  ciktisinda basic-elk, pro-elk, pro-mep KODLARI BULUNMAMALI.
#  Defter: scripts/deploy-olcum/faz6-4-satici-sozlesme.json
#
#  ── GERI ALMA ─────────────────────────────────────────────────────────────
#  Yol acilirsa ayni tablo satirlarinda satistaMi tekrar true yapilir; yeni
#  surum ya da yeni kurulum GEREKMEZ.
#
#  ── SORGULARIN GECERLILIGI ────────────────────────────────────────────────
#  Bu dosyadaki HER sorgu (okuma ve yazma) `npm run test:olcum-sorgu`
#  kapisinda PGlite uzerinde gercek migration zinciriyle KOSTURULUYOR.
#  Tirnak dengesini saymak yetmez: dengeli ama sutun adi yanlis bir sorgu da
#  dengeli gorunur.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "ON KOSUL YOK — docker bulunamadi. Bu betik sunucuda (/opt/metaprice) kosulur."
  exit 2
fi

UYGULA="hayir"
if [ "${1:-}" = "--uygula" ]; then UYGULA="evet"; fi

# SALT-OKUMA sarmali — abonelik-olcum.sh ile BIREBIR ayni desen.
sorgu() {
  docker compose exec -T backup sh -c 'psql -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "BEGIN READ ONLY; '"$1"'; ROLLBACK"'
}

# YAZAN sarmal — TEK islem, ON ERROR STOP acik. Kontrol sorgusu patlarsa
# COMMIT satirina hic gelinmez ve islem geri alinir.
yaz() {
  docker compose exec -T backup sh -c 'psql -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "'"$1"'"'
}

echo "=============================================================="
echo " ELEKTRIK PAKETLERINI SATISTAN CEKME"
if [ "$UYGULA" = "evet" ]; then
  echo " KIP: UYGULA  (veritabanina YAZILACAK)"
else
  echo " KIP: PROVA   (hicbir sey yazilmaz)"
fi
echo "=============================================================="
echo ""

echo "── on kosul: paket tablolari var mi ──"
sorgu 'SELECT to_regclass('"'"'public.\"Paket\"'"'"') AS paket_tablosu, to_regclass('"'"'public.\"PaketSurumu\"'"'"') AS surum_tablosu, to_regclass('"'"'public.\"Abonelik\"'"'"') AS abonelik_tablosu'
echo "   (uc sutunda da bir ad gorunmeli. bos ise migration kosmamis demektir;"
echo "    asagidaki sayimlari OKUMAYIN.)"
echo ""

echo "── O1 bugunku satis durumu (payda ile) ──"
sorgu 'SELECT p.kod, p.aktif, s.\"surumNo\" AS surum, s.\"satistaMi\" AS satista, (SELECT count(*) FROM \"PaketSurumu\") AS surum_toplam, (SELECT count(*) FROM \"PaketSurumu\" WHERE \"satistaMi\") AS satista_toplam FROM \"Paket\" p LEFT JOIN \"PaketSurumu\" s ON s.\"paketId\" = p.id ORDER BY p.sira, s.\"surumNo\"'
echo "   (satista toplam su an 5 olmali; islemden sonra 2 olacak.)"
echo ""

echo "── O2 elektrik kapsamli MEVCUT aboneler (dokunulmayacak) ──"
sorgu 'SELECT p.kod, p.kapsam, a.durum, count(*) AS firma, min(a.\"erisimSonu\") AS en_erken_bitis FROM \"Abonelik\" a JOIN \"PaketSurumu\" s ON s.id = a.\"paketSurumuId\" JOIN \"Paket\" p ON p.id = s.\"paketId\" WHERE p.kapsam IN ('"'"'electrical'"'"', '"'"'mep'"'"') GROUP BY 1, 2, 3 ORDER BY 1, 3'
echo "   (satir varsa o firmalara ELLE haber verilir; abonelikleri bozulmaz.)"
echo ""

echo "── O3 yarim kalan satin alma niyetleri ──"
sorgu 'SELECT p.kod, b.durum, count(*) AS niyet FROM \"AbonelikBaslatma\" b JOIN \"PaketSurumu\" s ON s.id = b.\"paketSurumuId\" JOIN \"Paket\" p ON p.id = s.\"paketId\" WHERE p.kod IN ('"'"'basic-elk'"'"', '"'"'pro-elk'"'"', '"'"'pro-mep'"'"') GROUP BY 1, 2 ORDER BY 1, 2'
echo "   (BEKLIYOR satiri varsa o musteri formu acmis ama bitirmemis demektir;"
echo "    satis kapaninca donusu 400 alir — once onunla konusun.)"
echo ""

echo "── O4 elektrik verisi var mi (yol acma karari icin) ──"
sorgu 'SELECT b.discipline, b.\"isGlobal\" AS havuz, count(*) AS marka FROM \"Brand\" b GROUP BY 1, 2 ORDER BY 1, 2'
sorgu 'SELECT discipline, count(*) AS iscilik_kalemi FROM \"LaborItem\" GROUP BY 1 ORDER BY 1'
sorgu 'SELECT discipline, count(*) AS iscilik_firmasi FROM \"LaborFirm\" GROUP BY 1 ORDER BY 1'
echo ""

echo "── O5 kutuphanede GIZLI kalan elektrik satirlari ──"
sorgu 'SELECT b.discipline, count(DISTINCT l.\"firmaId\") AS firma, count(*) AS satir FROM \"UserLibrary\" l JOIN \"Brand\" b ON b.id = l.\"brandId\" GROUP BY 1 ORDER BY 1'
echo "   (electrical satirlari bugun Kutuphanem ekraninda gorunmuyor — 22.07 suzgeci.)"
echo ""

if [ "$UYGULA" != "evet" ]; then
  echo "=============================================================="
  echo " BU BIR PROVAYDI — hicbir sey degismedi."
  echo " Ciktiyi Emre'ye gosterin. Onaydan sonra:"
  echo "     bash scripts/paket-satis-kapat.sh --uygula"
  echo "=============================================================="
  exit 0
fi

echo "=============================================================="
echo " UYGULANIYOR — tek islem; satista kalan sayisi 2 degilse ROLLBACK"
echo "=============================================================="
# ⚠ KONTROL SORGUSU BILEREK BOLME: satista kalan sayisi 2 degilse bolme
# sifira duser, psql ON ERROR STOP ile durur ve COMMIT satirina HIC gelinmez.
# Toplam fonksiyonu kullanildigi icin plan asamasinda sabit katlanamaz.
yaz 'BEGIN; UPDATE \"PaketSurumu\" SET \"satistaMi\" = false WHERE \"satistaMi\" AND \"paketId\" IN (SELECT id FROM \"Paket\" WHERE kod IN ('"'"'basic-elk'"'"', '"'"'pro-elk'"'"', '"'"'pro-mep'"'"')); SELECT count(*) / (CASE WHEN count(*) = 2 THEN 1 ELSE 0 END) AS satista_kalan_kontrol FROM \"PaketSurumu\" WHERE \"satistaMi\"; COMMIT'

echo ""
echo "── islem sonrasi satis durumu ──"
sorgu 'SELECT p.kod, s.\"surumNo\" AS surum, s.\"satistaMi\" AS satista FROM \"Paket\" p LEFT JOIN \"PaketSurumu\" s ON s.\"paketId\" = p.id ORDER BY p.sira, s.\"surumNo\"'
echo ""
echo "=============================================================="
echo " BITTI. En az 60 saniye sonra (fiyat ucu onbellekli) dogrulayin:"
echo "     curl -s https://metapricex.com/api/fiyatlar"
echo " Ciktida basic-elk, pro-elk, pro-mep BULUNMAMALI."
echo "=============================================================="
