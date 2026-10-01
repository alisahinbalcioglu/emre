/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BELLEK PRISMA — sema-farkinda sahte Prisma istemcisi (30.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  NEDEN: el yazimi sahte Prisma'lar `where`'i SEKLINE gore okur
 *  (`if (args.where.firmaId) return anaSatirlar`). Sorguya yeni bir kosul
 *  eklemek testi yanlis dala dusurur ya da kosulu HIC degerlendirmez —
 *  kiraci sinirini olcen bir testte bu, olcutun kendisinin sahte olmasi
 *  demektir (dairesel olcut). Kiraci B'nin sorgusu A'nin satirini
 *  DONDURMEMELI; bunu ancak kosulu Prisma anlamiyla isleyen bir motor olcer.
 *
 *  SEMA ELLE YAZILMAZ: modeller, iliskiler, varsayilanlar, benzersiz
 *  anahtarlar ve silme kurallari URETILMIS istemcinin DMMF'sinden okunur
 *  (`Prisma.dmmf`). Sema degisince sahte istemci de degisir; semada OLMAYAN
 *  alana yazma ya da sorgu FIRLATIR (gercek Prisma gibi), sessizce gecmez.
 *
 *  ANLAM (PostgreSQL + Prisma 5):
 *   · `undefined` kosul/deger YOK SAYILIR; `OR: []` hicbir satir dondurmez.
 *   · NULL alan `not`/`notIn`/`lt`... kosulunu SAGLAMAZ (SQL uc-degerli mantik).
 *   · `equals` + `mode: 'insensitive'` = PG ILIKE (Prisma 5.22 boyle uretir,
 *     01.10 gercek PG'de olculdu): `%` `_` JOKER, `\` kacis, sonda `\` HATA.
 *     Harf katlamasi kod noktasi basina (`PG_KATLAMA`; JS'in 'İ' acilimi yok).
 *     Diger islecler (`contains` vb.) duz kucultmeyle — olculmedi.
 *   · Benzersizlik: anahtarin bir parcasi NULL ise cakisma YOK (PG'de NULL'lar
 *     birbirinden ayridir) — cakismada P2002 firlatilir.
 *   · Siralama: ASC'de NULL sonda, DESC'te basta (PG varsayilani).
 *   · Silme: DMMF `relationOnDelete` (Cascade / SetNull; Restrict → P2003).
 *   · Fonksiyonlu `$transaction` hata firlatirsa tablolar ESKI haline doner.
 *  DESTEKLENMEYEN islec ya da ic ice yazma sessizce gecmez: FIRLATIR.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { Prisma } from '@prisma/client';

type Satir = Record<string, any>;
type DmmfModel = (typeof Prisma.dmmf.datamodel.models)[number];
type DmmfAlan = DmmfModel['fields'][number];

/** Iliski: bu satirin `yerel[i]` alani hedef satirin `uzak[i]` alanina esit. */
interface Iliski {
  hedef: string;
  tekil: boolean;
  yerel: readonly string[];
  uzak: readonly string[];
}

export interface BellekIz {
  model: string;
  islem: string;
  args: any;
}

export interface BellekPrisma {
  /** PrismaService yerine verilir. */
  istemci: any;
  /** Modelin CANLI satir dizisi ('LaborItem' ya da 'laborItem') — dogrudan okuma/fikstur icin. */
  tablo(model: string): Satir[];
  /** Her cagri (model, islem, args kopyasi) — yazma yollarini saymak icin. */
  izler: BellekIz[];
}

function kopya<T>(x: T): T {
  return x === undefined ? x : structuredClone(x);
}

function tarihMi(x: unknown): x is Date {
  return x instanceof Date;
}

function esit(a: unknown, b: unknown): boolean {
  if (tarihMi(a) || tarihMi(b)) {
    if (a == null || b == null) return false;
    return new Date(a as any).getTime() === new Date(b as any).getTime();
  }
  return a === b;
}

function karsilastir(x: unknown, y: unknown): number {
  if (tarihMi(x) || tarihMi(y)) return new Date(x as any).getTime() - new Date(y as any).getTime();
  if (typeof x === 'number' && typeof y === 'number') return x - y;
  if (typeof x === 'boolean' && typeof y === 'boolean') return Number(x) - Number(y);
  const sx = String(x);
  const sy = String(y);
  return sx < sy ? -1 : sx > sy ? 1 : 0;
}

function bilinenHata(kod: string, mesaj: string, meta?: Record<string, unknown>): Error {
  return new Prisma.PrismaClientKnownRequestError(mesaj, { code: kod, clientVersion: 'bellek', meta });
}

/**
 * PostgreSQL harf katlamasi — KOD NOKTASI basina (PG `lower()` hicbir harfi
 * iki karaktere acmaz; JS `'İ'.toLowerCase()` ise 'i̇' (2 kod noktasi) uretir).
 * Acan harfler icin PG'nin olculmus sonucu tabloda; yoksa harf aynen kalir.
 * CANLI olcum (01.10.2026, PG 16.14 Debian glibc, en_US.utf8): `lower('İ')`
 * = 'i' · `'İSTANBUL' ILIKE 'istanbul'` = true · `'ISTANBUL' ILIKE 'ıstanbul'`
 * = false (noktasiz ı katlanmaz). Yerel Windows PG 17 (en-US) 'İ'yi
 * KATLAMIYORDU — yerel ayara bagli; model CANLIYI izler.
 */
export const PG_KATLAMA: ReadonlyMap<string, string> = new Map([['İ', 'i']]);
function pgKatla(s: string): string {
  let out = '';
  for (const ch of s) {
    const tablo = PG_KATLAMA.get(ch);
    if (tablo !== undefined) {
      out += tablo;
      continue;
    }
    const l = ch.toLowerCase();
    out += [...l].length === 1 ? l : ch;
  }
  return out;
}

/**
 * PostgreSQL ILIKE — Prisma 5.22 `equals` + `mode: 'insensitive'`i BUNA
 * cevirir ve `%`/`_`/`\` KACISLAMAZ (01.10.2026, gercek PG 17'de olculdu:
 * `"a%"` uc kaleme eslesti; sonda `\` PG 22025 hatasi). `%` herhangi dizi,
 * `_` tek karakter, `\` sonraki karakteri duz yapar.
 */
function ilikeEslesir(deger: string, desen: string): boolean {
  const kar = [...pgKatla(desen)];
  let re = '';
  for (let i = 0; i < kar.length; i++) {
    const c = kar[i];
    if (c === '\\') {
      if (i === kar.length - 1) {
        throw new Prisma.PrismaClientUnknownRequestError(
          'PostgresError { code: "22025", message: "LIKE pattern must not end with escape character" }',
          { clientVersion: 'bellek' },
        );
      }
      re += kar[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else if (c === '%') re += '[\\s\\S]*';
    else if (c === '_') re += '[\\s\\S]';
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'u').test(pgKatla(deger));
}

export function bellekPrisma(secenek: { saat?: () => number } = {}): BellekPrisma {
  const saat = secenek.saat ?? (() => Date.now());
  const modeller = new Map<string, DmmfModel>(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));
  const erisimciden = new Map<string, string>(
    [...modeller.keys()].map((ad) => [ad[0].toLowerCase() + ad.slice(1), ad]),
  );
  const veriler = new Map<string, Satir[]>([...modeller.keys()].map((ad) => [ad, []]));
  const izler: BellekIz[] = [];
  let sayac = 0;

  const modelAdi = (ad: string): string => {
    const tam = modeller.has(ad) ? ad : erisimciden.get(ad);
    if (!tam) throw new Error(`bellek-prisma: bilinmeyen model '${ad}'`);
    return tam;
  };
  const model = (ad: string): DmmfModel => modeller.get(modelAdi(ad))!;
  const alan = (ad: string, alanAdi: string): DmmfAlan | undefined =>
    model(ad).fields.find((f) => f.name === alanAdi);
  const satirlar = (ad: string): Satir[] => veriler.get(modelAdi(ad))!;

  function iliski(ad: string, alanAdi: string): Iliski {
    const f = alan(ad, alanAdi);
    if (!f || f.kind !== 'object') throw new Error(`bellek-prisma: ${ad}.${alanAdi} iliski degil`);
    if (f.relationFromFields && f.relationFromFields.length > 0) {
      return { hedef: f.type, tekil: true, yerel: f.relationFromFields, uzak: f.relationToFields ?? [] };
    }
    const karsi = model(f.type).fields.find(
      (g) => g.kind === 'object' && g.relationName === f.relationName && (g.relationFromFields?.length ?? 0) > 0,
    );
    if (!karsi) throw new Error(`bellek-prisma: ${ad}.${alanAdi} karsi iliski bulunamadi`);
    return { hedef: f.type, tekil: !f.isList, yerel: karsi.relationToFields ?? [], uzak: karsi.relationFromFields ?? [] };
  }

  function hedefSatirlari(satir: Satir, il: Iliski): Satir[] {
    return satirlar(il.hedef).filter((h) =>
      il.yerel.every((y, i) => satir[y] != null && esit(h[il.uzak[i]], satir[y])),
    );
  }

  function bilesikAnahtar(ad: string, anahtar: string): readonly string[] | null {
    const m = model(ad);
    for (const u of m.uniqueFields) if (u.join('_') === anahtar) return u;
    for (const ui of m.uniqueIndexes) if ((ui.name ?? ui.fields.join('_')) === anahtar) return ui.fields;
    if (m.primaryKey && (m.primaryKey.name ?? m.primaryKey.fields.join('_')) === anahtar) return m.primaryKey.fields;
    return null;
  }

  // ── Kosul degerlendirme ────────────────────────────────────────────────
  function skalerEslesir(deger: unknown, filtre: any): boolean {
    if (filtre === null) return deger === null || deger === undefined;
    if (tarihMi(filtre) || typeof filtre !== 'object') return esit(deger, filtre);
    if (Array.isArray(filtre)) throw new Error('bellek-prisma: dizi esitligi desteklenmiyor');
    const duyarsiz = filtre.mode === 'insensitive';
    const k = (x: unknown) => (duyarsiz && typeof x === 'string' ? x.toLowerCase() : x);
    const d = k(deger);
    for (const [op, v] of Object.entries(filtre)) {
      if (v === undefined || op === 'mode') continue;
      switch (op) {
        case 'equals':
          if (duyarsiz && typeof v === 'string') {
            if (typeof deger !== 'string' || !ilikeEslesir(deger, v)) return false;
          } else if (v === null ? deger != null : !esit(d, k(v))) return false;
          break;
        case 'not':
          if (v === null) {
            if (deger == null) return false;
          } else if (typeof v === 'object' && !tarihMi(v)) {
            if (deger == null || skalerEslesir(deger, { ...(v as object), mode: filtre.mode })) return false;
          } else if (deger == null || esit(d, k(v))) {
            return false;
          }
          break;
        case 'in':
          if (deger == null || !(v as unknown[]).some((x) => esit(d, k(x)))) return false;
          break;
        case 'notIn':
          if (deger == null || (v as unknown[]).some((x) => esit(d, k(x)))) return false;
          break;
        case 'lt':
          if (deger == null || karsilastir(deger, v) >= 0) return false;
          break;
        case 'lte':
          if (deger == null || karsilastir(deger, v) > 0) return false;
          break;
        case 'gt':
          if (deger == null || karsilastir(deger, v) <= 0) return false;
          break;
        case 'gte':
          if (deger == null || karsilastir(deger, v) < 0) return false;
          break;
        case 'contains':
          if (typeof d !== 'string' || !d.includes(k(v) as string)) return false;
          break;
        case 'startsWith':
          if (typeof d !== 'string' || !d.startsWith(k(v) as string)) return false;
          break;
        case 'endsWith':
          if (typeof d !== 'string' || !d.endsWith(k(v) as string)) return false;
          break;
        case 'has':
          if (!Array.isArray(deger) || !deger.some((x) => esit(x, v))) return false;
          break;
        case 'hasSome':
          if (!Array.isArray(deger) || !(v as unknown[]).some((x) => deger.some((y) => esit(y, x)))) return false;
          break;
        case 'hasEvery':
          if (!Array.isArray(deger) || !(v as unknown[]).every((x) => deger.some((y) => esit(y, x)))) return false;
          break;
        case 'isEmpty':
          if (!Array.isArray(deger) || (deger.length === 0) !== v) return false;
          break;
        default:
          throw new Error(`bellek-prisma: desteklenmeyen islec '${op}'`);
      }
    }
    return true;
  }

  function iliskiEslesir(ad: string, satir: Satir, alanAdi: string, v: any): boolean {
    const il = iliski(ad, alanAdi);
    const hedefler = hedefSatirlari(satir, il);
    if (!il.tekil) {
      for (const op of Object.keys(v)) {
        if (v[op] !== undefined && !['some', 'every', 'none'].includes(op)) {
          throw new Error(`bellek-prisma: ${ad}.${alanAdi} coklu iliskide desteklenmeyen islec '${op}'`);
        }
      }
      if (v.some !== undefined && !hedefler.some((h) => eslesir(il.hedef, h, v.some))) return false;
      if (v.every !== undefined && !hedefler.every((h) => eslesir(il.hedef, h, v.every))) return false;
      if (v.none !== undefined && hedefler.some((h) => eslesir(il.hedef, h, v.none))) return false;
      return true;
    }
    const h = hedefler[0] ?? null;
    if (v === null) return h === null;
    if ('is' in v || 'isNot' in v) {
      if (v.is !== undefined && (v.is === null ? h !== null : !(h && eslesir(il.hedef, h, v.is)))) return false;
      if (v.isNot !== undefined && (v.isNot === null ? h === null : !!(h && eslesir(il.hedef, h, v.isNot)))) return false;
      return true;
    }
    return h !== null && eslesir(il.hedef, h, v);
  }

  function eslesir(ad: string, satir: Satir, where: any): boolean {
    if (!where) return true;
    for (const [anahtar, v] of Object.entries(where)) {
      if (v === undefined) continue;
      if (anahtar === 'AND') {
        for (const w of ([] as any[]).concat(v)) if (!eslesir(ad, satir, w)) return false;
        continue;
      }
      if (anahtar === 'OR') {
        if (!(v as any[]).some((w) => eslesir(ad, satir, w))) return false;
        continue;
      }
      if (anahtar === 'NOT') {
        for (const w of ([] as any[]).concat(v)) if (eslesir(ad, satir, w)) return false;
        continue;
      }
      const f = alan(ad, anahtar);
      if (!f) {
        const parcalar = bilesikAnahtar(ad, anahtar);
        if (!parcalar || typeof v !== 'object' || v === null) {
          throw new Error(`bellek-prisma: ${model(ad).name}.${anahtar} semada yok (sorgu)`);
        }
        if (!parcalar.every((p) => esit(satir[p], (v as Satir)[p]))) return false;
        continue;
      }
      if (f.kind === 'object') {
        if (!iliskiEslesir(ad, satir, anahtar, v)) return false;
        continue;
      }
      if (!skalerEslesir(satir[anahtar], v)) return false;
    }
    return true;
  }

  // ── Siralama ────────────────────────────────────────────────────────────
  function sirKarsilastir(ad: string, a: Satir, b: Satir, o: any): number {
    const giris = Object.entries(o).find(([, x]) => x !== undefined);
    if (!giris) return 0;
    const [anahtar, v] = giris as [string, any];
    const f = alan(ad, anahtar);
    if (!f) throw new Error(`bellek-prisma: ${model(ad).name}.${anahtar} semada yok (siralama)`);
    if (f.kind === 'object') {
      const il = iliski(ad, anahtar);
      if (!il.tekil) throw new Error('bellek-prisma: coklu iliskiye gore siralama desteklenmiyor');
      const ha = hedefSatirlari(a, il)[0];
      const hb = hedefSatirlari(b, il)[0];
      if (!ha || !hb) return ha ? -1 : hb ? 1 : 0;
      return sirKarsilastir(il.hedef, ha, hb, v);
    }
    const yon: string = typeof v === 'string' ? v : v.sort;
    const nulls: string = (typeof v === 'object' && v.nulls) || (yon === 'asc' ? 'last' : 'first');
    const x = a[anahtar];
    const y = b[anahtar];
    if (x == null || y == null) {
      if (x == null && y == null) return 0;
      const xOnce = x == null ? -1 : 1;
      return nulls === 'first' ? xOnce : -xOnce;
    }
    const c = karsilastir(x, y);
    return yon === 'desc' ? -c : c;
  }

  function sirala(ad: string, liste: Satir[], orderBy: any): Satir[] {
    if (!orderBy) return liste;
    const sira = ([] as any[]).concat(orderBy);
    return [...liste].sort((a, b) => {
      for (const o of sira) {
        const c = sirKarsilastir(ad, a, b, o);
        if (c) return c;
      }
      return 0;
    });
  }

  // ── Yansitma (select / include) ─────────────────────────────────────────
  function sayimYansit(ad: string, satir: Satir, v: any): Satir {
    const sonuc: Satir = {};
    const secim = v === true ? null : v?.select;
    for (const f of model(ad).fields) {
      if (f.kind !== 'object' || !f.isList) continue;
      if (secim && !secim[f.name]) continue;
      const alt = secim?.[f.name];
      const hedefler = hedefSatirlari(satir, iliski(ad, f.name));
      sonuc[f.name] = hedefler.filter((h) => eslesir(f.type, h, typeof alt === 'object' ? alt.where : undefined)).length;
    }
    return sonuc;
  }

  function iliskiYansit(ad: string, satir: Satir, alanAdi: string, args: any): unknown {
    const il = iliski(ad, alanAdi);
    let hedefler = hedefSatirlari(satir, il);
    if (il.tekil) return hedefler[0] ? yansit(il.hedef, hedefler[0], args) : null;
    hedefler = sirala(il.hedef, hedefler.filter((h) => eslesir(il.hedef, h, args?.where)), args?.orderBy);
    if (args?.skip) hedefler = hedefler.slice(args.skip);
    if (args?.take != null) hedefler = hedefler.slice(0, args.take);
    return hedefler.map((h) => yansit(il.hedef, h, args));
  }

  function yansit(ad: string, satir: Satir, args?: any): Satir {
    const m = model(ad);
    const sonuc: Satir = {};
    if (args?.select) {
      for (const [k, v] of Object.entries(args.select)) {
        if (!v) continue;
        if (k === '_count') {
          sonuc._count = sayimYansit(ad, satir, v);
          continue;
        }
        const f = alan(ad, k);
        if (!f) throw new Error(`bellek-prisma: ${m.name}.${k} semada yok (select)`);
        sonuc[k] = f.kind === 'object' ? iliskiYansit(ad, satir, k, v === true ? undefined : v) : kopya(satir[k]);
      }
      return sonuc;
    }
    for (const f of m.fields) if (f.kind !== 'object') sonuc[f.name] = kopya(satir[f.name]);
    for (const [k, v] of Object.entries(args?.include ?? {})) {
      if (!v) continue;
      if (k === '_count') {
        sonuc._count = sayimYansit(ad, satir, v);
        continue;
      }
      if (alan(ad, k)?.kind !== 'object') throw new Error(`bellek-prisma: ${m.name}.${k} iliski degil (include)`);
      sonuc[k] = iliskiYansit(ad, satir, k, v === true ? undefined : v);
    }
    return sonuc;
  }

  // ── Yazma ───────────────────────────────────────────────────────────────
  function benzersizDenetle(ad: string, aday: Satir, haric: Satir | null): void {
    const m = model(ad);
    const kumeler: (readonly string[])[] = [
      ...(m.primaryKey ? [m.primaryKey.fields] : []),
      ...m.fields.filter((f) => f.isId || f.isUnique).map((f) => [f.name]),
      ...m.uniqueFields,
    ];
    for (const kume of kumeler) {
      if (kume.some((p) => aday[p] == null)) continue;
      const cakisan = satirlar(ad).some((d) => d !== haric && kume.every((p) => esit(d[p], aday[p])));
      if (cakisan) {
        throw bilinenHata('P2002', `Unique constraint failed on the fields: (${kume.join(', ')})`, { target: kume });
      }
    }
  }

  function varsayilan(ad: string, f: DmmfAlan): unknown {
    const d: any = f.default;
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      if (/^(uuid|cuid|ulid|nanoid)/.test(d.name)) return `${model(ad).name.toLowerCase()}-${++sayac}`;
      if (d.name === 'now') return new Date(saat());
      if (d.name === 'autoincrement') return ++sayac;
      if (d.name === 'dbgenerated') return null;
      throw new Error(`bellek-prisma: bilinmeyen varsayilan '${d.name}' (${model(ad).name}.${f.name})`);
    }
    return kopya(d);
  }

  function olustur(ad: string, data: Satir): Satir {
    const m = model(ad);
    const satir: Satir = {};
    for (const [k, v] of Object.entries(data ?? {})) {
      if (v === undefined) continue;
      const f = alan(ad, k);
      if (!f) throw new Error(`bellek-prisma: ${m.name}.${k} semada yok (create)`);
      if (f.kind === 'object') throw new Error(`bellek-prisma: ic ice yazma desteklenmiyor (${m.name}.${k})`);
      satir[k] = kopya(v);
    }
    for (const f of m.fields) {
      if (f.kind === 'object' || f.name in satir) continue;
      if (f.isUpdatedAt) satir[f.name] = new Date(saat());
      else if (f.hasDefaultValue) satir[f.name] = varsayilan(ad, f);
      else if (f.isList) satir[f.name] = [];
      else if (!f.isRequired) satir[f.name] = null;
      else throw new Error(`bellek-prisma: ${m.name}.${f.name} zorunlu, verilmedi (create)`);
    }
    yabanciAnahtarDenetle(ad, satir);
    benzersizDenetle(ad, satir, null);
    satirlar(ad).push(satir);
    return satir;
  }

  /** Dolu yabanci anahtar var olan bir satira isaret etmeli (PG FK kisiti). */
  function yabanciAnahtarDenetle(ad: string, satir: Satir): void {
    const m = model(ad);
    for (const f of m.fields) {
      if (f.kind !== 'object' || !(f.relationFromFields?.length)) continue;
      const il = iliski(ad, f.name);
      if (il.yerel.some((y) => satir[y] == null)) continue;
      if (hedefSatirlari(satir, il).length === 0) {
        throw bilinenHata('P2003', `Foreign key constraint failed on the field: ${m.name}.${f.name}`);
      }
    }
  }

  function guncelle(ad: string, satir: Satir, data: Satir): Satir {
    const m = model(ad);
    const yeni: Satir = { ...satir };
    for (const [k, v] of Object.entries(data ?? {})) {
      if (v === undefined) continue;
      const f = alan(ad, k);
      if (!f) throw new Error(`bellek-prisma: ${m.name}.${k} semada yok (update)`);
      if (f.kind === 'object') throw new Error(`bellek-prisma: ic ice yazma desteklenmiyor (${m.name}.${k})`);
      const islecli = v !== null && typeof v === 'object' && !tarihMi(v) && !Array.isArray(v) && f.type !== 'Json';
      if (!islecli) {
        yeni[k] = kopya(v);
        continue;
      }
      const [op, x] = Object.entries(v as Satir)[0] as [string, any];
      if (op === 'set') yeni[k] = kopya(x);
      else if (op === 'increment') yeni[k] = (yeni[k] ?? 0) + x;
      else if (op === 'decrement') yeni[k] = (yeni[k] ?? 0) - x;
      else if (op === 'multiply') yeni[k] = (yeni[k] ?? 0) * x;
      else if (op === 'divide') yeni[k] = (yeni[k] ?? 0) / x;
      else if (op === 'push') yeni[k] = [...(yeni[k] ?? []), ...([] as unknown[]).concat(x)];
      else throw new Error(`bellek-prisma: desteklenmeyen guncelleme islec '${op}' (${m.name}.${k})`);
    }
    for (const f of m.fields) if (f.isUpdatedAt && !(f.name in (data ?? {}))) yeni[f.name] = new Date(saat());
    yabanciAnahtarDenetle(ad, yeni);
    benzersizDenetle(ad, yeni, satir);
    Object.assign(satir, yeni);
    return satir;
  }

  function sil(ad: string, satir: Satir): void {
    const hedefAd = model(ad).name;
    for (const m of modeller.values()) {
      for (const f of m.fields) {
        if (f.kind !== 'object' || f.type !== hedefAd || !(f.relationFromFields?.length)) continue;
        const from = f.relationFromFields;
        const to = f.relationToFields ?? [];
        const cocuklar = satirlar(m.name).filter((c) => from.every((p, i) => c[p] != null && esit(c[p], satir[to[i]])));
        if (cocuklar.length === 0) continue;
        const kural = f.relationOnDelete ?? (f.isRequired ? 'Restrict' : 'SetNull');
        if (kural === 'Cascade') for (const c of cocuklar) sil(m.name, c);
        else if (kural === 'SetNull') for (const c of cocuklar) for (const p of from) c[p] = null;
        else throw bilinenHata('P2003', `Foreign key constraint failed: ${m.name}.${f.name} (${kural})`);
      }
    }
    const t = satirlar(ad);
    const i = t.indexOf(satir);
    if (i >= 0) t.splice(i, 1);
  }

  // ── Model API ───────────────────────────────────────────────────────────
  function api(ad: string) {
    const iz = (islem: string, args: unknown) => izler.push({ model: ad, islem, args: kopya(args) });
    const bul = (args: any) => sirala(ad, satirlar(ad).filter((s) => eslesir(ad, s, args?.where)), args?.orderBy);
    const tekBul = (where: any): Satir | null => {
      const s = satirlar(ad).filter((r) => eslesir(ad, r, where));
      if (s.length > 1) throw new Error(`bellek-prisma: ${ad} benzersiz sorgu ${s.length} satir buldu`);
      return s[0] ?? null;
    };
    const bulunamadi = () => bilinenHata('P2025', `${ad}: kayit bulunamadi`);
    return {
      findMany: async (args?: any) => {
        iz('findMany', args);
        let s = bul(args);
        if (args?.skip) s = s.slice(args.skip);
        if (args?.take != null) s = s.slice(0, args.take);
        return s.map((r) => yansit(ad, r, args));
      },
      findFirst: async (args?: any) => {
        iz('findFirst', args);
        const s = bul(args)[args?.skip ?? 0];
        return s ? yansit(ad, s, args) : null;
      },
      findFirstOrThrow: async (args?: any) => {
        iz('findFirstOrThrow', args);
        const s = bul(args)[args?.skip ?? 0];
        if (!s) throw bulunamadi();
        return yansit(ad, s, args);
      },
      findUnique: async (args: any) => {
        iz('findUnique', args);
        const s = tekBul(args.where);
        return s ? yansit(ad, s, args) : null;
      },
      findUniqueOrThrow: async (args: any) => {
        iz('findUniqueOrThrow', args);
        const s = tekBul(args.where);
        if (!s) throw bulunamadi();
        return yansit(ad, s, args);
      },
      count: async (args?: any) => {
        iz('count', args);
        return satirlar(ad).filter((s) => eslesir(ad, s, args?.where)).length;
      },
      create: async (args: any) => {
        iz('create', args);
        return yansit(ad, olustur(ad, args.data), args);
      },
      createMany: async (args: any) => {
        iz('createMany', args);
        let adet = 0;
        for (const d of ([] as Satir[]).concat(args.data)) {
          try {
            olustur(ad, d);
            adet++;
          } catch (e: any) {
            if (args.skipDuplicates && e?.code === 'P2002') continue;
            throw e;
          }
        }
        return { count: adet };
      },
      update: async (args: any) => {
        iz('update', args);
        const s = tekBul(args.where);
        if (!s) throw bulunamadi();
        return yansit(ad, guncelle(ad, s, args.data), args);
      },
      updateMany: async (args: any) => {
        iz('updateMany', args);
        const s = satirlar(ad).filter((r) => eslesir(ad, r, args?.where));
        for (const r of s) guncelle(ad, r, args.data);
        return { count: s.length };
      },
      upsert: async (args: any) => {
        iz('upsert', args);
        const s = tekBul(args.where);
        return yansit(ad, s ? guncelle(ad, s, args.update) : olustur(ad, args.create), args);
      },
      delete: async (args: any) => {
        iz('delete', args);
        const s = tekBul(args.where);
        if (!s) throw bulunamadi();
        const once = yansit(ad, s, args);
        sil(ad, s);
        return once;
      },
      deleteMany: async (args?: any) => {
        iz('deleteMany', args);
        const s = satirlar(ad).filter((r) => eslesir(ad, r, args?.where));
        for (const r of s) sil(ad, r);
        return { count: s.length };
      },
    };
  }

  const apiler = new Map<string, ReturnType<typeof api>>();
  const hedef: Record<string, unknown> = {};
  const istemci: any = new Proxy(hedef, {
    get(t, ad) {
      if (ad === '$transaction') {
        return async (x: any) => {
          if (typeof x !== 'function') return Promise.all(x);
          const yedek = new Map([...veriler].map(([m, s]) => [m, s.map((r) => ({ ...r }))]));
          try {
            return await x(istemci);
          } catch (e) {
            for (const [m, s] of yedek) {
              const canli = veriler.get(m)!;
              canli.length = 0;
              canli.push(...s);
            }
            throw e;
          }
        };
      }
      if (ad === '$connect' || ad === '$disconnect') return async () => undefined;
      if (typeof ad !== 'string' || !erisimciden.has(ad)) return Reflect.get(t, ad);
      const tam = erisimciden.get(ad)!;
      if (!apiler.has(tam)) apiler.set(tam, api(tam));
      return apiler.get(tam);
    },
  });

  return { istemci, tablo: satirlar, izler };
}
