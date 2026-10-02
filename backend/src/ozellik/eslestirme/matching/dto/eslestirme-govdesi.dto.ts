import { Transform } from 'class-transformer';
import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateBy, buildMessage, type ValidationOptions } from 'class-validator';

/**
 * ESLESTIRME UCLARININ GOVDESI (C11, Paket 4a, 01.10.2026).
 *
 * Eskiden satir ici tip: genel ValidationPipe (main.ts) sinif olmayan tipi
 * DOGRULAMAZ — `materialNames: ["Vana DN25", 5]` motorda TypeError → 500 (tum
 * liste duser), `"abc"` harf harf eslestirilir, `units: { ad: 5 }`
 * normalizeText'i patlatir. Iscilik ikizi:
 * `../../labor-matching/dto/iscilik-eslestirme-govdesi.dto.ts`.
 *
 * ⚠ `whitelist: true` DEKORATORSUZ alani SESSIZCE siler: her alan dekoratorlu.
 * Boyut tavani YOK: on yuz bir markanin TUM benzersiz adlarini tek istekte
 * gonderir (quotes/new) — olculmeden konan tavan buyuk teklifi kirardi.
 */

const duzNesneMi = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Duz nesne, her deger metin (satir adi → birim). Sozluk PROTOTIPSIZ kopyaya
 * cevrilir (guvenlik incelemesi P4a): motor birimi `units?.[ad]` ile okur —
 * duz nesnede "toString"/"constructor" adli satir Object.prototype'tan
 * FONKSIYON alip normalizeText'i patlatiyordu (tum istek 500). Donusum
 * dogrulamadan ONCE kosar (class-transformer); dizi/metin gibi bicimsiz deger
 * DOKUNULMADAN dogrulayiciya duser ve 400 alir.
 */
export function MetinSozlugu(secenek?: ValidationOptions): PropertyDecorator {
  const prototipsiz = Transform(({ value }) => (duzNesneMi(value) ? Object.assign(Object.create(null), value) : value));
  const dogrula = ValidateBy(
    {
      name: 'metinSozlugu',
      validator: {
        validate: (v: unknown) => duzNesneMi(v) && Object.values(v).every((x) => typeof x === 'string'),
        defaultMessage: buildMessage((onEk) => `${onEk}$property ad → birim metin sözlüğü olmalı`, secenek),
      },
    },
    secenek,
  );
  return (hedef: object, ozellik: string | symbol) => {
    prototipsiz(hedef, ozellik as string);
    dogrula(hedef, ozellik);
  };
}

/** POST /matching/bulk-match */
export class TopluEslestirmeDto {
  @IsString()
  @IsNotEmpty()
  brandId!: string;

  @IsArray()
  @IsString({ each: true })
  materialNames!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variantTags?: string[];

  @IsOptional()
  @MetinSozlugu()
  units?: Record<string, string>;
}

/** POST /matching/remember */
export class EslestirmeHafizasiDto {
  @IsString()
  @IsNotEmpty()
  brandId!: string;

  @IsString()
  materialName!: string;

  @IsString()
  secilenAd!: string;
}
