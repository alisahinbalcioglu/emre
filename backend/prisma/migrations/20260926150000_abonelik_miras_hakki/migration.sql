-- MIRAS HAKKI AYRI TASINIR (26.09.2026 — Emre karari 24.09: "miras hakki AYRI
-- tasinsin, kart erisimi bitince miras paketine dussun")
--
-- 01.09 gocu her mevcut firmaya `miras-core`/`miras-pro` satiri yazdi (HAVALE,
-- AKTIF, erisim goc + 365 gun). Miras tarihi `erisimSonu` icinde "odenmis
-- erisim" gibi tasiniyordu ve iki yone kiriliyordu:
--   · gelir: kart satin almasi `max(mevcut, kopru)` ile, havale onayi
--     `max(erisimSonu, simdi) + ay` ile miras tarihini KORUDU — 1 aylik Pro
--     odemesi Pro'yu miras bitisine kadar verdi (havalede 340 + 30 gun);
--   · musteri: mutabakat IPTAL dali ve dunning miras hakkini silebiliyordu.
-- Hak artik iki ayri alanda: `mirasPaketSurumuId` + `mirasErisimSonu`. Kural
-- TEK yerde: `backend/src/ozellik/odeme/abonelik/miras-hakki.ts`.
--
-- DOLDURMA: paketi `miras-%` olan (henuz doldurulmamis) satir kendi paketini ve
-- erisimini kopyalar. Idempotent: dolu alan EZILMEZ. Etkin paket ve
-- `erisimSonu` DEGISMEZ. Canli olcum (26.09, salt okuma): 3 miras satiri
-- (HAVALE AKTIF, erisim 2027-09-01) → 3 satir dolar.
--
-- KARTA GECMIS MIRAS SATIRI (02.09'dan beri mumkun) OTOMATIK DUZELTILMEZ:
-- hangi miras paketinin verildigi ve gercek kart donem sonu SQL'de bilinemez.
-- Parmak izi: goc `olusturuldu` ile `erisimSonu`yu AYNI `now()`dan yazdi ve
-- satin alma ikisini de korudu → `erisimSonu = olusturuldu + 365 gun` ve paket
-- miras DEGIL. Bu satirlar yalniz deploy gunlugune NOTICE olarak yazilir;
-- canlida 0 bekleniyor (26.09: tek kart satiri gocten SONRA acildi).
-- Ilk bolum `prisma migrate diff` (eski sema → yeni sema) ciktisiyla AYNI.

-- AlterTable
ALTER TABLE "Abonelik" ADD COLUMN     "mirasErisimSonu" TIMESTAMP(3),
ADD COLUMN     "mirasPaketSurumuId" TEXT;

-- AddForeignKey
ALTER TABLE "Abonelik" ADD CONSTRAINT "Abonelik_mirasPaketSurumuId_fkey" FOREIGN KEY ("mirasPaketSurumuId") REFERENCES "PaketSurumu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══ GERIYE DONUK DOLDURMA (miras hakki)
UPDATE "Abonelik" a
SET "mirasPaketSurumuId" = a."paketSurumuId",
    "mirasErisimSonu" = a."erisimSonu"
FROM "PaketSurumu" s
JOIN "Paket" p ON p."id" = s."paketId"
WHERE s."id" = a."paketSurumuId"
  AND p."kod" LIKE 'miras-%'
  AND a."mirasPaketSurumuId" IS NULL;

-- Karta gecmis olabilecek goc satiri: yalniz LISTELENIR (bkz. ust not).
DO $$
DECLARE
  r RECORD;
  n INT := 0;
BEGIN
  FOR r IN
    SELECT a."id", a."firmaId", p."kod" AS paket, a."erisimSonu"
    FROM "Abonelik" a
    JOIN "PaketSurumu" s ON s."id" = a."paketSurumuId"
    JOIN "Paket" p ON p."id" = s."paketId"
    WHERE p."kod" NOT LIKE 'miras-%'
      AND a."mirasPaketSurumuId" IS NULL
      AND a."erisimSonu" = a."olusturuldu" + interval '365 days'
  LOOP
    n := n + 1;
    RAISE NOTICE 'MIRAS-HAKKI karta gecmis olabilecek goc satiri: abonelik % firma % paket % erisim % — elle incelenmeli',
      r."id", r."firmaId", r."paket", r."erisimSonu";
  END LOOP;
  RAISE NOTICE 'MIRAS-HAKKI parmak izi satir sayisi: %', n;
END $$;
