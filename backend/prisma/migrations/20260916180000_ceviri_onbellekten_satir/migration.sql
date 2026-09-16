-- Ceviri kotasi artik YALNIZ API'ye giden satirlari duser (Emre 16.09.2026).
-- Denetim icin onbellek/sozlukten karsilanan satir AYRI tutulur; eski
-- kayitlarda bu bilgi yok, 0 kalir (o gun kural "hepsi duser" idi).
ALTER TABLE "CeviriTuketimi" ADD COLUMN "onbellektenSatir" INTEGER NOT NULL DEFAULT 0;
