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

// NOT (Faz 2b sokum): BrandClassHint + resolveBrandClass + BRAND_SEEDS
// SILINDI — marka→sinif cikarimi I4'un ihlaliydi ("marka etiketleri
// degistiremez"); v2 sinifi urunun KENDI kolonlarindan cozer.

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
      console.log(`[Terminology] Seed hazir: ${ALIAS_SEEDS.length} alias`);
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


  /**
   * KÜTÜPHANE = HAFIZA (18.07 — Option 2): import aninda, yerlesik sozluk
   * TANIMADIGI ama urunun kendi adi AILE olan girisleri ogren. Ogrenilmis
   * alias `impliedType = adBucket` (kendi adi aile kimligi) — satir tarafi
   * (matchV2 resolveAlias → hintFamily) bu aileye kilitlenir; urun tarafi
   * buildProductIndex zaten adSlug=adBucket verir. Ikisi ayni ailede bulusur.
   *
   * Idempotent: var olan (userId, alias) atlanir. admin import → userId=null
   * (GLOBAL, tum kullanicilar yararlanir); kullanici-ozel yukleme → userId.
   */
  async learnFamilyAliases(
    items: { adBucket: string; canonical: string }[],
    userId: string | null,
  ): Promise<{ ogrenilen: number }> {
    if (items.length === 0) return { ogrenilen: 0 };
    const p = this.prisma as any;
    // Dedup + gecerli (anlamli, >=3 karakter) alias
    const map = new Map<string, string>();
    for (const it of items) {
      const alias = normalizeText(it.adBucket);
      if (alias.length >= 3 && !map.has(alias)) map.set(alias, it.canonical);
    }
    if (map.size === 0) return { ogrenilen: 0 };
    let ogrenilen = 0;
    try {
      // Mevcut olanlari tek sorguda cek (idempotens)
      const mevcut = await p.terminologyAlias.findMany({
        where: { userId, alias: { in: Array.from(map.keys()) } },
        select: { alias: true },
      });
      const varOlan = new Set<string>((mevcut as { alias: string }[]).map((m) => m.alias));
      const yeni = Array.from(map.entries())
        .filter(([alias]) => !varOlan.has(alias))
        .map(([alias, canonical]) => ({
          userId, alias, canonical, impliedType: alias,
          kinds: [], sizeClass: null, stripTags: [], createdBy: 'learned',
        }));
      if (yeni.length > 0) {
        await p.terminologyAlias.createMany({ data: yeni, skipDuplicates: true });
        ogrenilen = yeni.length;
      }
      if (ogrenilen > 0) console.log(`[Terminology] KÜTÜPHANE=HAFIZA: ${ogrenilen} yeni aile ogrenildi (userId=${userId ?? 'GLOBAL'})`);
    } catch (e) {
      console.warn('[Terminology] learnFamilyAliases atlandi:', (e as Error).message);
    }
    return { ogrenilen };
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
