import { Injectable, BadRequestException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { AiService } from './ai.service';

/**
 * TEKNIK METIN CEVIRISI — ONBELLEK ONCE, API SONRA (13.08).
 *
 * ── AKIS ────────────────────────────────────────────────────────────────────
 *   benzersiz metinler → onbellek sorgusu → EKSIK OLANLAR icin tek/birkac
 *   API cagrisi → onbellege yaz → birlesik harita don
 *
 * Frontend zaten benzersizlestirip DOKUNULMAZLARI (cap/olcu/kod) elemis olarak
 * gonderir (ozellik/teklif/ceviri.ts, testle muhurlu). Burada ikinci bir
 * savunma yok — tek karar yeri orasi; iki yerde ayri kural iki ayri gercek
 * uretirdi.
 *
 * ── NEDEN ONBELLEK ONCE ─────────────────────────────────────────────────────
 * Canli teklif 15.137 satir. Benzersizlestirme birkac yuze indiriyor; kalici
 * onbellek ikinci teklifte onu da SIFIRA indiriyor. Ceviri ozelliginin
 * ekonomisi tamamen buna bagli — bu yuzden onbellek isabeti loglanir ve
 * admin panelinde gorunur.
 *
 * ── SOZLUK NEDEN SISTEM PROMPT'UNDA ─────────────────────────────────────────
 * Mekanik tesisat terimleri genel cevirmende bozulur ("Rekor" → "record").
 * Sozluk sabit oldugu icin sistem prompt'unda durur ve PROMPT ONBELLEGINE
 * girer (ikinci cagridan itibaren o kisim ~%10 fiyata okunur).
 */

/** Yapilandirilmis cikti semasi — ayristirma hatasi YAPISAL OLARAK imkansiz. */
const CEVIRI_SEMASI = {
  type: 'object',
  properties: {
    ceviriler: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kaynak: { type: 'string' },
          ceviri: { type: 'string' },
        },
        required: ['kaynak', 'ceviri'],
        additionalProperties: false,
      },
    },
  },
  required: ['ceviriler'],
  additionalProperties: false,
} as const;

/**
 * MEKANIK/TESISAT TERIM SOZLUGU.
 * Genel cevirinin en sik bozdugu terimler. Liste buyudukce prompt onbellegi
 * daha da degerli olur (sabit prefix).
 */
const SOZLUK: Array<[string, string]> = [
  ['küresel vana', 'ball valve'],
  ['kelebek vana', 'butterfly valve'],
  ['çek vana', 'check valve'],
  ['pislik tutucu', 'strainer'],
  ['rekor', 'union'],
  ['flanş', 'flange'],
  ['dirsek', 'elbow'],
  ['te', 'tee'],
  ['redüksiyon', 'reducer'],
  ['kelepçe', 'clamp'],
  ['manşon', 'coupling'],
  ['körtapa', 'end cap'],
  ['hidrofor', 'booster pump set'],
  ['sıhhi tesisat', 'plumbing'],
  ['temiz su', 'domestic cold water'],
  ['pis su', 'waste water'],
  ['yangın', 'fire fighting'],
  ['sprinkler', 'sprinkler'],
  ['izolasyon', 'insulation'],
  ['montaj bedeli', 'installation cost'],
  ['işçilik', 'labour'],
  ['fittings oranı', 'fittings allowance'],
];

/**
 * CEVIRI MODELI — saglik kontrolu de AYNI sabiti kullanir (admin.service).
 *
 * ⚠ 13.08'de bu iki yer AYRI modeller kullaniyordu: panel `claude-sonnet-4-6`
 * ile "Baglanti basarili" diyordu, ceviri ise `claude-opus-5` cagiriyordu.
 * Yesil rozet, ceviri yolunun calistigini KANITLAMIYORDU — hesabin o modele
 * erisimi yoksa ya da fiyati bakiyeyi asiyorsa panel yesil kalirken ceviri
 * patlardi. Olcut, olcmesi gereken seyin KENDISI olmali.
 *
 * Neden Sonnet: bu is ceviri degil ESLEME — sozluk sistem prompt'unda sabit,
 * cikti json_schema ile YAPISAL olarak zorlanmis. Opus'un ek muhakemesi
 * burada karsiligi olmayan bir maliyet; ayni bakiye Sonnet'le kat kat daha
 * uzaga gider.
 */
export const CEVIRI_MODEL = 'claude-sonnet-5';
const MODEL = CEVIRI_MODEL;
/** Tek istekte gonderilecek metin sayisi — cikti tokenini sinirli tutar. */
const PARCA = 150;

export interface CeviriSonucu {
  harita: Record<string, string>;
  onbellekten: number;
  cevrilen: number;
  /** API'ye gidip BASARISIZ olan parca sayisi. 0'dan buyukse ceviri EKSIKTIR. */
  basarisiz: number;
}

/**
 * API hatasini kullanicinin YAPABILECEGI bir eyleme cevirir.
 *
 * ⚠ Ham SDK mesaji ("invalid x-api-key") kullaniciya tek basina hicbir sey
 * soylemiyor. 13.08'de tam olarak bu yasandi: anahtar gecersizdi, her parca
 * 401 aldi, ama uc 200 + BOS HARITA dondu ve ekran "Ceviri tamamlandi" dedi.
 * Ozellik calismiyordu ve bunu kimse goremiyordu.
 */
export function ceviriHataMesaji(durum: number | undefined, mesaj: string): string {
  if (durum === 401 || durum === 403) {
    return 'Claude API anahtari GECERSIZ (401). Admin → Istatistikler → AI Kullanimi bolumunden guncel anahtari girin.';
  }
  if (durum === 429) {
    return 'Claude API istek siniri asildi (429). Kisa bir sure sonra tekrar deneyin.';
  }
  if (durum === 400) {
    return `Ceviri istegi reddedildi (400): ${mesaj}`;
  }
  return `Ceviri servisi yanit vermedi: ${mesaj}`;
}

/**
 * "Bu sonuc bir BASARISIZLIK mi?" — cevirinin tek kritik karari, saf halde.
 *
 * ⚠ Bu karar ayri bir fonksiyon cunku 13.08'e kadar HIC VERILMIYORDU: her
 * parca hatasi yutuluyor, uc her kosulda 200 donuyordu. Canli olcumde dort
 * parcanin dordu de 401 aldi, ekran "Ceviri tamamlandi" dedi ve tek bir hucre
 * bile degismedi. Karari koda gomulu birakmak onu tekrar olcusuz birakirdi;
 * burada durur ve testle muhurlenir (`test/ceviri-karar-test.ts`).
 *
 * KURAL: yalnizca HIC parca gecmemis VE onbellekten de hicbir sey gelmemisse
 * basarisizliktir. Onbellekten sonuc geldiyse elde gercek bir ceviri var
 * demektir — eksiklik hata degil, `basarisiz` sayisiyla BILDIRILIR.
 */
export function ceviriBasarisizMi(p: {
  toplamParca: number;
  basarisizParca: number;
  onbellekten: number;
}): boolean {
  return p.toplamParca > 0 && p.basarisizParca === p.toplamParca && p.onbellekten === 0;
}

@Injectable()
export class CeviriService {
  constructor(
    private prisma: PrismaService,
    private ai: AiService,
  ) {}

  private sistemPrompt(): string {
    const sozluk = SOZLUK.map(([tr, en]) => `${tr} = ${en}`).join('\n');
    return [
      'You translate Turkish mechanical/plumbing (HVAC & sanitary) bill-of-quantity item names into English.',
      'These strings appear in a commercial quotation sent to a client, so use standard industry terminology, not literal translation.',
      '',
      'RULES:',
      '- Keep every size, diameter, code and number EXACTLY as written: DN 20, Ø110, 6", 1 1/4", PN 20, 9MM.',
      '- Never add explanations, units, or parenthetical notes that were not in the source.',
      '- Keep the original capitalisation style (ALL CAPS source stays ALL CAPS).',
      '- Brand names and proper nouns stay unchanged.',
      '- If a string is already English, return it unchanged.',
      '',
      'GLOSSARY (authoritative — use these exact terms):',
      sozluk,
    ].join('\n');
  }

  /** Metin listesini cevirir. Onbellekte olanlar icin API'ye HIC gidilmez. */
  async cevir(metinler: string[], hedefDil = 'en'): Promise<CeviriSonucu> {
    const benzersiz = Array.from(
      new Set(metinler.map((m) => String(m ?? '').trim().replace(/\s+/g, ' ')).filter(Boolean)),
    );
    if (benzersiz.length === 0) return { harita: {}, onbellekten: 0, cevrilen: 0, basarisiz: 0 };

    // ── 1) ONBELLEK ────────────────────────────────────────────────────────
    const kayitlar = await this.prisma.translation.findMany({
      where: { targetLang: hedefDil, sourceText: { in: benzersiz } },
    });
    const harita: Record<string, string> = {};
    for (const k of kayitlar) harita[k.sourceText] = k.translatedText;
    const onbellekten = kayitlar.length;

    const eksik = benzersiz.filter((m) => harita[m] === undefined);
    if (eksik.length === 0) return { harita, onbellekten, cevrilen: 0, basarisiz: 0 };

    // ── 2) API ─────────────────────────────────────────────────────────────
    const ayarlar = await this.prisma.systemSettings.findMany({ where: { key: 'CLAUDE_API_KEY' } });
    const apiKey = ayarlar[0]?.value || process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey) {
      throw new BadRequestException(
        'Ceviri icin Claude API anahtari tanimli degil (Admin → Ayarlar → CLAUDE_API_KEY).',
      );
    }

    const client = new Anthropic({ apiKey });
    let cevrilen = 0;
    // Parca sonuclari SAYILIR: "kac denendi / kaci patladi" bilinmeden
    // basarisizligi basaridan ayirmak imkansizdir.
    let toplamParca = 0;
    let basarisizParca = 0;
    let ilkHata: { durum?: number; mesaj: string } | null = null;

    for (let i = 0; i < eksik.length; i += PARCA) {
      const parca = eksik.slice(i, i + PARCA);
      toplamParca++;
      try {
        const yanit = await client.messages.create({
          model: MODEL,
          max_tokens: 16000,
          // Sozluk sabit prefix → prompt onbellegi (ikinci cagridan ucuz).
          system: [{ type: 'text', text: this.sistemPrompt(), cache_control: { type: 'ephemeral' } }],
          output_config: { format: { type: 'json_schema', schema: CEVIRI_SEMASI } },
          messages: [
            {
              role: 'user',
              content:
                'Translate each item. Return one entry per input, with `kaynak` copied verbatim.\n\n' +
                parca.map((m) => `- ${m}`).join('\n'),
            },
          ],
        } as any);

        await this.ai.logUsage({
          feature: 'translate',
          provider: 'claude',
          model: MODEL,
          usage: (yanit as any).usage,
          success: true,
        });

        const metin = (yanit.content.find((b: any) => b.type === 'text') as any)?.text ?? '';
        const cozulen = JSON.parse(metin) as { ceviriler: Array<{ kaynak: string; ceviri: string }> };

        for (const c of cozulen.ceviriler ?? []) {
          const kaynak = String(c.kaynak ?? '').trim().replace(/\s+/g, ' ');
          const ceviri = String(c.ceviri ?? '').trim();
          // ⚠ Uydurulmus anahtar YAZILMAZ: model istemedigimiz bir metni geri
          // dondurdurse onbellege girmemeli — onbellek kalicidir, kirlenirse
          // hatayi her teklife tasir.
          if (!kaynak || !ceviri || !parca.includes(kaynak)) continue;
          harita[kaynak] = ceviri;
          cevrilen++;
          await this.prisma.translation.upsert({
            where: { sourceText_targetLang: { sourceText: kaynak, targetLang: hedefDil } },
            create: { sourceText: kaynak, targetLang: hedefDil, translatedText: ceviri, kaynak: 'ai' },
            // Kullanici duzeltmesi (kaynak='manual') AI tarafindan EZILMEZ.
            update: {},
          });
        }
      } catch (e) {
        basarisizParca++;
        const durum = (e as any)?.status as number | undefined;
        if (!ilkHata) ilkHata = { durum, mesaj: (e as Error).message };
        await this.ai.logUsage({
          feature: 'translate',
          provider: 'claude',
          model: MODEL,
          success: false,
          errorMessage: (e as Error).message,
        });
        // Parca hatasi digerlerini durdurmaz; cevrilemeyenler Turkce kalir.
        console.error('[Ceviri] parca hatasi:', durum ?? '-', (e as Error).message);
      }
    }

    /**
     * ⚠ HICBIR PARCA GECMEDIYSE BU BIR BASARI DEGILDIR.
     *
     * Eski hali her hatayi yutup `{harita:{}, cevrilen:0}` ile 200 donuyordu;
     * frontend bunu "ceviri tamamlandi" olarak gosteriyor, dil dugmesi
     * "Turkceye Don"e geciyor ve kullanici ozelligin CALISTIGINI saniyordu.
     * 13.08 canli olcumu: anahtar gecersizdi, dort parca da 401 aldi, ekranda
     * tek bir hucre bile degismedi ve hicbir uyari cikmadi.
     *
     * Onbellekten gelen ceviriler VARSA hata ATILMAZ: elde gercek bir sonuc
     * var demektir; eksiklik `basarisiz` alaniyla bildirilir.
     */
    if (ceviriBasarisizMi({ toplamParca, basarisizParca, onbellekten })) {
      throw new BadRequestException(
        ceviriHataMesaji(ilkHata?.durum, ilkHata?.mesaj ?? 'bilinmeyen hata'),
      );
    }

    return { harita, onbellekten, cevrilen, basarisiz: basarisizParca };
  }

  /**
   * YALNIZ ONBELLEK — API'ye ASLA gitmez, hicbir metni "cevrilmeli mi" diye
   * DEGERLENDIRMEZ. Export yolu bunu kullanir.
   *
   * ⚠ NEDEN KARAR VERMEZ: dokunulmazlik kurali (cap/olcu/kod ceviriye
   * GIRMEZ) frontend'de saf modulde durur ve testle muhurlu
   * (`ozellik/teklif/ceviri.ts`). Ayni kurali burada ikinci kez yazmak, iki
   * yerde ayri ayri evrilen IKI GERCEK uretirdi. Onbellek zaten o kuralin
   * CIKTISIDIR: "DN 20" hicbir zaman gonderilmedigi icin onbellekte YOKTUR,
   * dolayisiyla export'ta da degismez. Karar tek yerde kalir, burasi yalnizca
   * kayitli esleseni uygular.
   */
  async onbellekHaritasi(metinler: string[], hedefDil = 'en'): Promise<Record<string, string>> {
    const benzersiz = Array.from(
      new Set(metinler.map((m) => String(m ?? '').trim().replace(/\s+/g, ' ')).filter(Boolean)),
    );
    if (benzersiz.length === 0) return {};
    const kayitlar = await this.prisma.translation.findMany({
      where: { targetLang: hedefDil, sourceText: { in: benzersiz } },
    });
    const harita: Record<string, string> = {};
    for (const k of kayitlar) harita[k.sourceText] = k.translatedText;
    return harita;
  }

  /** Kullanici duzeltmesi — AI'nin uzerine yazar ve bir daha sorulmaz. */
  async duzelt(sourceText: string, translatedText: string, hedefDil = 'en'): Promise<void> {
    const kaynak = String(sourceText ?? '').trim().replace(/\s+/g, ' ');
    const ceviri = String(translatedText ?? '').trim();
    if (!kaynak || !ceviri) throw new BadRequestException('Kaynak ve ceviri bos olamaz.');
    await this.prisma.translation.upsert({
      where: { sourceText_targetLang: { sourceText: kaynak, targetLang: hedefDil } },
      create: { sourceText: kaynak, targetLang: hedefDil, translatedText: ceviri, kaynak: 'manual' },
      update: { translatedText: ceviri, kaynak: 'manual' },
    });
  }
}
