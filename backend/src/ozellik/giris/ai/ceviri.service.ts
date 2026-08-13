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

const MODEL = 'claude-opus-5';
/** Tek istekte gonderilecek metin sayisi — cikti tokenini sinirli tutar. */
const PARCA = 150;

export interface CeviriSonucu {
  harita: Record<string, string>;
  onbellekten: number;
  cevrilen: number;
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
    if (benzersiz.length === 0) return { harita: {}, onbellekten: 0, cevrilen: 0 };

    // ── 1) ONBELLEK ────────────────────────────────────────────────────────
    const kayitlar = await this.prisma.translation.findMany({
      where: { targetLang: hedefDil, sourceText: { in: benzersiz } },
    });
    const harita: Record<string, string> = {};
    for (const k of kayitlar) harita[k.sourceText] = k.translatedText;
    const onbellekten = kayitlar.length;

    const eksik = benzersiz.filter((m) => harita[m] === undefined);
    if (eksik.length === 0) return { harita, onbellekten, cevrilen: 0 };

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

    for (let i = 0; i < eksik.length; i += PARCA) {
      const parca = eksik.slice(i, i + PARCA);
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
        await this.ai.logUsage({
          feature: 'translate',
          provider: 'claude',
          model: MODEL,
          success: false,
          errorMessage: (e as Error).message,
        });
        // Parca hatasi digerlerini durdurmaz; cevrilemeyenler Turkce kalir.
        console.error('[Ceviri] parca hatasi:', (e as Error).message);
      }
    }

    return { harita, onbellekten, cevrilen };
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
