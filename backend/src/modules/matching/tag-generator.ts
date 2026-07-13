// ────────────────────────────────────────────
// Deterministik Tag Atama
// AI gerektirmez — regex + lookup tablolari
// ────────────────────────────────────────────

import {
  normalizeText,
  extractDiameter,
  extractODiameter,
  extractSurfaces,
  extractConnection,
  extractMaterialType,
  extractMaterialKind,
  extractWallThickness,
  extractOuterDiameter,
  extractStandard,
  extractSubtype,
  extractPn,
  extractTemperature,
  extractKFactor,
  extractMountType,
  extractLengthMm,
  extractAccessory,
  extractValveTypes,
  extractFluid,
} from './normalizer';
import type { TaggedMaterial } from './types';
import { resolveAd } from './ad-resolver';

/**
 * Malzeme adından deterministik taglar cikarir.
 * AI cagrisi YOK — tamamen regex ve lookup tablolari.
 *
 * Ornek:
 * "Su ve Yangın Tesisat Borusu 1/2" DN15 Dış Cap 21.3mm Et 2.6mm - Galvanizli Dişli Manşonlu"
 * → tags: ["dn15", "galvaniz", "disli", "boru", "celik", "su", "yangin", "et-2.6", "dc-21.3", "en10217"]
 */
export function generateTags(materialName: string): TaggedMaterial {
  const tags: Set<string> = new Set();

  // 1. Cap/DN tagi (inc veya DN kodundan)
  const diameter = extractDiameter(materialName);
  if (diameter) tags.add(diameter);

  // 2. Ø cap isareti (Ø50 mm, Ø70 mm)
  if (!diameter) {
    const oDiameter = extractODiameter(materialName);
    if (oDiameter) tags.add(oDiameter);
  }

  // 3. Yuzey islemi tag'leri — TUMU (V4 varyant kimligi: "Siyah ... Kirmizi
  // Boyali" uc yuzey tasir; tek-yuzey 'siyah'ta durup kirmizi'yi yutuyordu)
  for (const surface of extractSurfaces(materialName)) tags.add(surface);

  // 4. Baglanti tipi tagi
  const connection = extractConnection(materialName);
  if (connection) tags.add(connection);

  // 5. Malzeme tipi
  const materialType = extractMaterialType(materialName);
  tags.add(materialType);

  // 6. Malzeme cinsi
  const kinds = extractMaterialKind(materialName);
  for (const kind of kinds) tags.add(kind);

  // 7. Et kalinligi
  const wallThickness = extractWallThickness(materialName);
  if (wallThickness) tags.add(wallThickness);

  // 8. Dis cap
  const outerDiameter = extractOuterDiameter(materialName);
  if (outerDiameter) tags.add(outerDiameter);

  // 9. Boru standardi
  const standard = extractStandard(materialName);
  if (standard) tags.add(standard);

  // 9b. PN basinc sinifi (PRD: fazla kriter = bonus, elemez)
  const pn = extractPn(materialName);
  if (pn) tags.add(pn);

  // 10. Alt tip (sessiz, basincli, pe kapli, folyo vs.)
  const subtypes = extractSubtype(materialName);
  for (const sub of subtypes) tags.add(sub);

  // 10b. EKIPMAN NITELIKLERI (E3 — Boru Disi Kalemler PRD): sicaklik sinifi,
  // K-faktoru, montaj tipi, uzunluk, aksesuar. Refine bonus'tur (sert filtre
  // degil) — nitelikleri birebir tutan adaylar aile ici siralamada one gecer.
  const temp = extractTemperature(materialName);
  if (temp) tags.add(temp);
  const kFactor = extractKFactor(materialName);
  if (kFactor) tags.add(kFactor);
  const mount = extractMountType(materialName);
  if (mount) tags.add(mount);
  const lengthMm = extractLengthMm(materialName);
  if (lengthMm) tags.add(lengthMm);
  const accessory = extractAccessory(materialName);
  if (accessory) tags.add(accessory);

  // 10c. VANA YUVALARI (E8/E9 + 3-Etiket): tip(ler) + akiskan. Coklu tip
  // desteklenir ("KURESEL VE KELEBEK VANALAR" → iki aday ad; "Bicakli
  // Surgulu" → iki tag). Yuva disi deger tasiyan aday SERT elenir.
  const valveTypes = extractValveTypes(materialName);
  for (const vt of valveTypes) tags.add(vt);
  const fluid = extractFluid(materialName);
  if (fluid) tags.add(fluid);

  // 10d. VT → VANA TERFISI (canli vaka 13.07): "Izleme Anahtarli Kelebek"
  // gibi urun adlarinda 'vana' KELIMESI gecmiyor → tip 'diger' kaliyor ve
  // AD kilidi (vana=must) urunu aile DISINA atiyordu — satir "Kelebek Vana"
  // derken kutuphanedeki gercek izleme-anahtarli kelebekler elenip yalniz
  // adinda 'vana' gecenler oneriliyordu. vt-* etiketi urunu vana yapar.
  // KORUMA: kelebek somun / vida / civata / rakor vana DEGILDIR.
  let effectiveType = materialType;

  // 10e. AD SOZLUGU (Excel seed — 3 Etiket Modeli): regex tip cozemediyse
  // sozluk cozer (yangin dolabi, chiller, fan, damper, kompansator...).
  // Es anlamlilar dahil ("su sogutma grubu"→chiller); en uzun desen kazanir.
  // Sozluk slug'lari MATERIAL_TYPE_TAGS'e katildigi icin AD kilidi (must)
  // bu aileler icin de calisir. SIRA: sozluk vt-terfisinden ONCE —
  // "Termostatik KONDENSTOP" kondenstop'tur, vt-radyator tag'i onu vana yapamaz.
  if (effectiveType === 'diger') {
    const adSlug = resolveAd(materialName);
    if (adSlug) {
      effectiveType = adSlug;
      tags.add(adSlug);
      tags.delete('diger');
    }
  }

  // 10f. VT → VANA TERFISI (sozluk de cozemediyse): "Izleme Anahtarli
  // Kelebek" gibi adinda 'vana' gecmeyen urunler vt etiketiyle vana olur.
  if (effectiveType === 'diger' && valveTypes.length > 0
      && !/somun|civata|vida\b|rakor|\bpul\b/.test(normalizeText(materialName))) {
    effectiveType = 'vana';
    tags.add('vana');
    tags.delete('diger');
  }

  // 11. DEFAULT BORU = CELIK
  // Eger malzeme tipi 'boru' ise ve alternatif bir malzeme cinsi yoksa, celik etiketi ekle
  // Alternatif cinsler: pvc, ppr, pe, hdpe, bakir, aluminyum, pirinc, dokum, paslanmaz, bronz
  if (materialType === 'boru') {
    const alternativeKinds = ['pvc', 'ppr', 'pe', 'hdpe', 'bakir', 'aluminyum', 'pirinc', 'dokum', 'paslanmaz', 'bronz'];
    const hasAlternative = alternativeKinds.some((k) => tags.has(k));
    if (!hasAlternative) {
      tags.add('celik');
    }
  }

  // Normalized name
  const normalizedName = normalizeText(materialName);

  return {
    tags: Array.from(tags),
    normalizedName,
    materialType: effectiveType,
  };
}

/**
 * Toplu tag atama — birden fazla malzeme icin.
 */
export function generateTagsBulk(materialNames: string[]): Record<string, TaggedMaterial> {
  const results: Record<string, TaggedMaterial> = {};
  for (const name of materialNames) {
    results[name] = generateTags(name);
  }
  return results;
}
