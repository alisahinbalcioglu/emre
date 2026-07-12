// ────────────────────────────────────────────
// Terminoloji Sozlugu + Marka→Tip Servisi (PRD v1.1 §5, §10.4)
//
// - Seed kayitlar onModuleInit'te idempotent yazilir (tablo henuz yoksa —
//   prisma db push oncesi — akis BOZULMAZ, sadece uyari loglanir).
// - Alias eslesmesi normalize metin uzerinde CONTAINS ile yapilir (S2),
//   en uzun eslesen alias kazanir. Kullanici alias'i seed'den onceliklidir.
// - Marka deseni marka adinda contains aranir ("CAYIROVA VEYA MUADILI" → celik).
// ────────────────────────────────────────────

import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeText } from './normalizer';
import type { SizeClass } from './conversion';

export interface AliasHint {
  alias: string;
  canonical: string;
  kinds: string[];
  impliedType: string | null;
  sizeClass: SizeClass | null;
  stripTags: string[];
}

export interface BrandClassHint {
  pattern: string;
  kinds: string[];
  sizeClass: SizeClass;
}

// ── SEED: Terminoloji (PRD §5.2 + mevcut HEADER_HINTS gocu + EN v1) ──
const CELIK = {
  canonical: 'siyah_celik_boru',
  // 'siyah' yuzey tercihi: sprink/yangin hatti SIYAH celik borudur — esit
  // skorlu siyah/galvaniz adaylarinda siyah one gecer (sert filtre degil)
  kinds: ['celik', 'siyah'],
  impliedType: 'boru',
  sizeClass: 'steel',
  stripTags: ['sprink'],
};
const HDPE = {
  canonical: 'hdpe_pe100_boru',
  kinds: ['hdpe', 'pe'],
  impliedType: 'boru',
  sizeClass: 'plastic',
  stripTags: [],
};
const PIS_SU = {
  canonical: 'pis_su_borusu',
  kinds: ['pvc', 'hdpe'],
  impliedType: 'boru',
  sizeClass: 'plastic',
  stripTags: [],
};
// T1 (Duzeltme Talebi — temiz su): detay belirtilmemis satirlarda varsayilan
// PPR-C; DN = dis cap mm (DN50 = 50 mm). Satir detayi basligi EZER (T3/T5):
// "DN50 GALVANIZ CELIK BORU" satiri celik cevrimiyle cozulur.
const TEMIZ_SU = {
  canonical: 'ppr_c_boru',
  kinds: ['ppr'],
  impliedType: 'boru',
  sizeClass: 'plastic',
  stripTags: [],
};

export const ALIAS_SEEDS: Array<{ alias: string } & typeof CELIK> = [
  // Sprinkler / yangin → siyah celik boru (TR)
  { alias: 'sprink hatti', ...CELIK },
  { alias: 'sprinkler hatti', ...CELIK },
  { alias: 'yangin hatti', ...CELIK },
  { alias: 'yangin borusu', ...CELIK },
  { alias: 'yangin tesisat', ...CELIK }, // "yangin tesisati borusu/borulari" contains ile
  { alias: 'kolon hatti', ...CELIK },
  // EN (v1'e dahil — kullanici onayi)
  { alias: 'sprinkler pipe', ...CELIK },
  { alias: 'sprinkler line', ...CELIK },
  { alias: 'fire pipe', ...CELIK },
  { alias: 'fire line', ...CELIK },
  { alias: 'fire fighting pipe', ...CELIK },
  // Kalorifer / isitma → celik (HEADER_HINTS gocu)
  { alias: 'kalorifer', ...CELIK, stripTags: [] },
  { alias: 'isitma hat', ...CELIK, stripTags: [] },
  { alias: 'radyator hat', ...CELIK, stripTags: [] },
  { alias: 'petek hat', ...CELIK, stripTags: [] },
  // Dogalgaz → celik (HEADER_HINTS gocu)
  { alias: 'dogalgaz', ...CELIK, stripTags: [] },
  { alias: 'gaz hatti', ...CELIK, stripTags: [] },
  // Hidrant → HDPE PE100 (PRD v1.1 duzeltmesi — celik DEGIL)
  { alias: 'hidrant hatti', ...HDPE },
  { alias: 'hidrant borusu', ...HDPE },
  { alias: 'hydrant line', ...HDPE },
  { alias: 'hydrant pipe', ...HDPE },
  // Pis su / atik su → PVC|HDPE (HEADER_HINTS gocu; cift cins → popup'a gider)
  { alias: 'pis su', ...PIS_SU },
  { alias: 'pissu', ...PIS_SU },
  { alias: 'atik su', ...PIS_SU },
  { alias: 'atiksu', ...PIS_SU },
  { alias: 'kanalizasyon', ...PIS_SU },
  { alias: 'drenaj', ...PIS_SU },
  // Temiz su → PPR-C varsayilani (Duzeltme Talebi T1 — onceki "bilerek yok"
  // karari kullanici talebiyle degisti; satir detayi varsayilani ezer T3)
  { alias: 'temiz su', ...TEMIZ_SU },
  { alias: 'kullanma suyu', ...TEMIZ_SU },
  { alias: 'icme suyu', ...TEMIZ_SU },
];

// ── SEED: Marka → sinif (PRD D2 celik + P1 PPR + HDPE) ──
export const BRAND_SEEDS: Array<{ pattern: string; kinds: string[]; sizeClass: string }> = [
  // Celik boru ureticileri (D2)
  { pattern: 'cayirova', kinds: ['celik'], sizeClass: 'steel' },
  { pattern: 'erbosan', kinds: ['celik'], sizeClass: 'steel' },
  { pattern: 'borusan', kinds: ['celik'], sizeClass: 'steel' },
  { pattern: 'toscelik', kinds: ['celik'], sizeClass: 'steel' },
  { pattern: 'yucel', kinds: ['celik'], sizeClass: 'steel' },
  { pattern: 'noksel', kinds: ['celik'], sizeClass: 'steel' },
  { pattern: 'emek boru', kinds: ['celik'], sizeClass: 'steel' },
  { pattern: 'ozborsan', kinds: ['celik'], sizeClass: 'steel' },
  { pattern: 'sardogan', kinds: ['celik'], sizeClass: 'steel' },
  // PPR-C ureticileri (P1) — Wespo/Vesbo yazim varyantlari ayri desen
  { pattern: 'hakan plastik', kinds: ['ppr'], sizeClass: 'plastic' },
  { pattern: 'hakan', kinds: ['ppr'], sizeClass: 'plastic' },
  { pattern: 'vesbo', kinds: ['ppr'], sizeClass: 'plastic' },
  { pattern: 'wespo', kinds: ['ppr'], sizeClass: 'plastic' },
  { pattern: 'kalde', kinds: ['ppr'], sizeClass: 'plastic' },
  { pattern: 'pilsa', kinds: ['ppr'], sizeClass: 'plastic' },
  { pattern: 'wavin', kinds: ['ppr'], sizeClass: 'plastic' },
  { pattern: 'teba', kinds: ['ppr'], sizeClass: 'plastic' },
  { pattern: 'nova plastik', kinds: ['ppr'], sizeClass: 'plastic' },
  // Dizayn ve Firat hem PPR hem HDPE uretir — sinif plastic, cins cift
  { pattern: 'dizayn', kinds: ['ppr', 'pe', 'hdpe'], sizeClass: 'plastic' },
  { pattern: 'firat', kinds: ['ppr', 'pe', 'hdpe'], sizeClass: 'plastic' },
  // HDPE PE100 ureticileri (hidrant hatti — PRD v1.1 notu)
  { pattern: 'kuzeyboru', kinds: ['hdpe', 'pe'], sizeClass: 'plastic' },
  { pattern: 'superlit', kinds: ['hdpe', 'pe'], sizeClass: 'plastic' },
];

@Injectable()
export class TerminologyService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seed();
  }

  /** Idempotent seed — tablo yoksa (db push oncesi) akisi bozmaz. */
  async seed() {
    try {
      const p = this.prisma as any;
      for (const s of ALIAS_SEEDS) {
        const exists = await p.terminologyAlias.findFirst({
          where: { userId: null, alias: s.alias },
          select: { id: true },
        });
        if (!exists) {
          await p.terminologyAlias.create({
            data: {
              userId: null, alias: s.alias, canonical: s.canonical,
              kinds: s.kinds, impliedType: s.impliedType,
              sizeClass: s.sizeClass, stripTags: s.stripTags, createdBy: 'seed',
            },
          });
        }
      }
      for (const s of BRAND_SEEDS) {
        const exists = await p.brandMaterialType.findFirst({
          where: { userId: null, pattern: s.pattern },
          select: { id: true },
        });
        if (!exists) {
          await p.brandMaterialType.create({
            data: { userId: null, pattern: s.pattern, kinds: s.kinds, sizeClass: s.sizeClass, createdBy: 'seed' },
          });
        }
      }
      console.log(`[Terminology] Seed hazir: ${ALIAS_SEEDS.length} alias, ${BRAND_SEEDS.length} marka deseni`);
    } catch (e) {
      console.warn('[Terminology] Seed atlandi (tablo henuz yok olabilir — prisma db push gerekir):', (e as Error).message);
    }
  }

  /** Global + kullanici alias'lari (aktif). Uzunluk sirali (en uzun once). */
  async loadAliases(userId: string): Promise<AliasHint[]> {
    try {
      const rows = await (this.prisma as any).terminologyAlias.findMany({
        where: { active: true, OR: [{ userId: null }, { userId }] },
      });
      return rows
        .map((r: any): AliasHint => ({
          alias: r.alias,
          canonical: r.canonical,
          kinds: r.kinds ?? [],
          impliedType: r.impliedType ?? null,
          sizeClass: (r.sizeClass as SizeClass) ?? null,
          stripTags: r.stripTags ?? [],
        }))
        .sort((a: AliasHint, b: AliasHint) => b.alias.length - a.alias.length);
    } catch {
      return []; // tablo yoksa: cagiran taraf koddaki fallback'i kullanir
    }
  }

  /** Metinde geçen EN UZUN alias'i bul (S2 contains + longest-wins). */
  resolveAlias(text: string, aliases: AliasHint[]): AliasHint | null {
    if (aliases.length === 0) return null;
    const norm = normalizeText(text);
    for (const a of aliases) {
      if (norm.includes(a.alias)) return a; // liste uzunluk sirali — ilk bulunan en uzun
    }
    return null;
  }

  /** Marka adindan malzeme sinifi cikar (D2/P1). En uzun desen kazanir. */
  async resolveBrandClass(brandName: string | null | undefined, userId: string): Promise<BrandClassHint | null> {
    if (!brandName) return null;
    try {
      const rows = await (this.prisma as any).brandMaterialType.findMany({
        where: { active: true, OR: [{ userId: null }, { userId }] },
      });
      const norm = normalizeText(brandName);
      let best: BrandClassHint | null = null;
      for (const r of rows) {
        if (norm.includes(r.pattern)) {
          if (!best || r.pattern.length > best.pattern.length) {
            best = { pattern: r.pattern, kinds: r.kinds ?? [], sizeClass: r.sizeClass as SizeClass };
          }
        }
      }
      return best;
    } catch {
      return null;
    }
  }

  /** S4: kullanici alias'i kaydet (secim sonrasi ogrenme). Var olani gunceller. */
  async saveUserAlias(userId: string, input: {
    alias: string; canonical?: string; kinds?: string[];
    impliedType?: string | null; sizeClass?: string | null;
  }) {
    const alias = normalizeText(input.alias);
    if (!alias || alias.length < 3) return { ok: false, reason: 'alias cok kisa' };
    const p = this.prisma as any;
    // S5: ayni alias farkli malzemeye isaret edemez — var olan kullanici kaydi guncellenir
    const existing = await p.terminologyAlias.findFirst({ where: { userId, alias } });
    if (existing) {
      await p.terminologyAlias.update({
        where: { id: existing.id },
        data: {
          canonical: input.canonical ?? existing.canonical,
          kinds: input.kinds ?? existing.kinds,
          impliedType: input.impliedType !== undefined ? input.impliedType : existing.impliedType,
          sizeClass: input.sizeClass !== undefined ? input.sizeClass : existing.sizeClass,
          active: true,
        },
      });
      return { ok: true, updated: true };
    }
    await p.terminologyAlias.create({
      data: {
        userId, alias,
        canonical: input.canonical ?? 'kullanici_tanimli',
        kinds: input.kinds ?? [],
        impliedType: input.impliedType ?? null,
        sizeClass: input.sizeClass ?? null,
        createdBy: 'user',
      },
    });
    return { ok: true, created: true };
  }

  /** Yonetim: alias listesi (seed + kullanici). */
  async listAliases(userId: string) {
    const p = this.prisma as any;
    return p.terminologyAlias.findMany({
      where: { OR: [{ userId: null }, { userId }] },
      orderBy: [{ createdBy: 'asc' }, { alias: 'asc' }],
    });
  }

  /** Yonetim: alias sil/pasife al. Seed SILINMEZ, pasife alinir (S3). */
  async deactivateAlias(userId: string, id: string) {
    const p = this.prisma as any;
    const row = await p.terminologyAlias.findUnique({ where: { id } });
    if (!row) return { ok: false, reason: 'bulunamadi' };
    if (row.userId === null) {
      // seed: sadece pasife alinabilir (kullanici bazli degil, global pasif —
      // v1 sadeligi: global seed'i kapatmak admin isi; normal kullanici icin
      // ayni alias'i bos kinds ile override etmesi yeterli)
      await p.terminologyAlias.update({ where: { id }, data: { active: false } });
      return { ok: true, deactivated: true };
    }
    if (row.userId !== userId) return { ok: false, reason: 'yetki yok' };
    await p.terminologyAlias.delete({ where: { id } });
    return { ok: true, deleted: true };
  }
}
