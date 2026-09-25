import { IsOptional, IsUUID } from 'class-validator';

/**
 * POST /abonelik/kart-guncelle govdesi (25.09.2026).
 *
 * `abonelikId` dunning e-postasindaki `/abonelik/kart?a=<abonelik id>`
 * baglantisindan gelir: e-posta HANGI aboneligin karti icin gonderildiyse
 * form yalniz onun icin acilir. Sunucu oturumdaki firmanin aboneligiyle
 * karsilastirir; baska firmanin hesabiyla acilan baglanti YANLIS firmanin
 * kartini degistiremez (`ABONELIK_ESLESMIYOR`). Verilmezse (uygulama ici
 * serit) oturumdaki firmanin aboneligi esastir.
 *
 * ⚠ SINIF, SATIR-ICI TIP DEGIL — satir-ici tip literalinde global
 * `ValidationPipe` devreye GIRMEZ (bkz. `AbonelikDegistirDto`).
 */
export class KartGuncelleDto {
  @IsOptional()
  @IsUUID()
  abonelikId?: string;
}
