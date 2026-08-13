/**
 * AI KULLANIM MALIYETI — TEK KAYNAK.
 *
 * ── NEDEN AYRI MODUL (12.08 olculdu) ────────────────────────────────────────
 * `ai.service.ts` kullanimi `AiUsageLog`a yaziyordu ama token sayilari
 * UYDURMAYDI: cagri yerlerinde elle yazilmis sabitler duruyordu —
 *   ai.service.ts:590  inputTokens: 500, outputTokens: 50
 *   ai.service.ts:668  inputTokens: 1000, outputTokens: cleaned.length * 30
 *   ai.service.ts:686  inputTokens: Math.round(textFallback.length / 4)
 * `response.usage` HICBIR yerde okunmuyordu (tum dosyada tek eslesme yoktu).
 * Dolayisiyla admin panelindeki "toplam token" ve "maliyet" kurguydu; bir
 * ozelligin gercekte ne harcadigi olculemiyordu.
 *
 * Ikinci kusur: fiyat tablosu SAGLAYICI bazliydi (`claude: 0.003/0.015`).
 * Ayni saglayicinin modelleri arasinda 10 kat fark var (Haiku 1$/5$ ↔
 * Fable 10$/50$), yani model degistiginde maliyet sessizce yanlislasiyordu.
 * Fiyat artik MODEL bazli.
 *
 * ⚠ ONBELLEK TOKENLARI AYRI FIYATLANIR — yoksa cevirinin ekonomisi olculemez:
 * okuma ~0.1x, yazma 1.25x (5 dk TTL). Ceviri sozlugu sistem prompt'unda sabit
 * durdugu icin ikinci cagridan itibaren girdinin buyuk kismi ONBELLEK OKUMASI
 * olur; bunu tam fiyattan saymak maliyeti ~10 kat sisirirdi.
 */

/** Anthropic Messages API `usage` alaninin bizim kullandigimiz kesiti. */
export interface AiKullanim {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** Tek cagrinin olculmus kullanimi — loga bu yazilir. */
export interface OlculenKullanim {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  estimatedCost: number;
}

/** 1.000 token basina USD (liste fiyati). */
interface Fiyat {
  input: number;
  output: number;
}

/**
 * MODEL BAZLI LISTE FIYATLARI (USD / 1K token).
 *
 * ⚠ Sonnet 5'in 2026-08-31'e kadar suren tanitim fiyati ($2/$10) BILEREK
 * kullanilmiyor: tarihe bagli fiyat, tarih gecince sessizce yanlis olur.
 * Liste fiyati kullanmak tanitim doneminde maliyeti bir miktar YUKSEK gosterir
 * — butce izlemede guvenli yon budur.
 */
const MODEL_FIYAT: Record<string, Fiyat> = {
  'claude-opus-5': { input: 0.005, output: 0.025 },
  'claude-opus-4-8': { input: 0.005, output: 0.025 },
  'claude-sonnet-5': { input: 0.003, output: 0.015 },
  'claude-sonnet-4-6': { input: 0.003, output: 0.015 },
  'claude-haiku-4-5': { input: 0.001, output: 0.005 },
  'gemini-2.5-flash': { input: 0.0001, output: 0.0004 },
};

/** Model taninmiyorsa saglayicinin en pahali bilinen kademesi varsayilir —
 *  bilinmeyen modeli UCUZ saymak butceyi sessizce asindirirdi. */
const BILINMEYEN_FIYAT: Record<string, Fiyat> = {
  claude: { input: 0.005, output: 0.025 },
  gemini: { input: 0.0001, output: 0.0004 },
  openrouter: { input: 0.005, output: 0.025 },
};

/** Onbellek carpanlari — Anthropic prompt caching fiyatlandirmasi. */
const ONBELLEK_OKUMA_CARPANI = 0.1;
const ONBELLEK_YAZMA_CARPANI = 1.25;

function fiyatBul(model: string | undefined, provider: string): Fiyat {
  if (model && MODEL_FIYAT[model]) return MODEL_FIYAT[model];
  return BILINMEYEN_FIYAT[provider] ?? BILINMEYEN_FIYAT.claude;
}

/** Negatif/NaN/eksik token alanlarini 0'a indirger — log her zaman sonlu sayi tutar. */
function sayi(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

/**
 * API yanitinin `usage` alanini loga yazilabilir olcume cevirir.
 *
 * `usage` YOKSA (saglayici dondurmemis, cagri hata almis) tum alanlar 0 doner —
 * UYDURULMAZ. Sifir maliyet "olculemedi" demektir ve panelde oyle okunmalidir;
 * tahmin uretmek, duzeltmeye calistigimiz kusurun ta kendisiydi.
 */
export function kullanimiOlc(
  usage: AiKullanim | null | undefined,
  model: string | undefined,
  provider: string,
): OlculenKullanim {
  const inputTokens = sayi(usage?.input_tokens);
  const outputTokens = sayi(usage?.output_tokens);
  const cacheWriteTokens = sayi(usage?.cache_creation_input_tokens);
  const cacheReadTokens = sayi(usage?.cache_read_input_tokens);

  const f = fiyatBul(model, provider);
  const maliyet =
    (inputTokens / 1000) * f.input +
    (outputTokens / 1000) * f.output +
    (cacheWriteTokens / 1000) * f.input * ONBELLEK_YAZMA_CARPANI +
    (cacheReadTokens / 1000) * f.input * ONBELLEK_OKUMA_CARPANI;

  return {
    inputTokens,
    outputTokens,
    cacheWriteTokens,
    cacheReadTokens,
    // 4 ondalik: en ucuz cagri bile (Haiku, birkac yuz token) sifira yuvarlanmaz.
    estimatedCost: Math.round(maliyet * 10000) / 10000,
  };
}
