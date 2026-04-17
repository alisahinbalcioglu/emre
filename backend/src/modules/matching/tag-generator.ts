// ────────────────────────────────────────────
// Deterministik Tag Atama
// AI gerektirmez — regex + lookup tablolari
// ────────────────────────────────────────────

import {
  normalizeText,
  extractDiameter,
  extractODiameter,
  extractSurface,
  extractConnection,
  extractMaterialType,
  extractMaterialKind,
  extractWallThickness,
  extractOuterDiameter,
  extractStandard,
  extractSubtype,
} from './normalizer';
import type { TaggedMaterial } from './types';

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

  // 3. Yuzey islemi tagi
  const surface = extractSurface(materialName);
  if (surface) tags.add(surface);

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

  // 10. Alt tip (sessiz, basincli, pe kapli, folyo vs.)
  const subtypes = extractSubtype(materialName);
  for (const sub of subtypes) tags.add(sub);

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
    materialType,
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
