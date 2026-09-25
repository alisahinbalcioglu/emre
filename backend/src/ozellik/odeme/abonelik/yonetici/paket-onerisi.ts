import { AbonelikDurumu, OdemeYontemi, PaketOnerisiDurumu } from '@prisma/client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PAKET DEGISIM ONERISI — SAF KURAL (24.09.2026, yonetici paneli turu A2 Blok 2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Emre (23.09): yonetici yukseltirse (ya da yatay gecis / fiyati artan
 *  degisim / denemedeki firma) musteriye ONAY BAGLANTISI gider. Oneri paketi
 *  DEGISTIRMEZ; firma sahibi A1'in penceresinden sozlesme onayiyla kabul
 *  eder (`POST /abonelik/degistir` + `oneriId`) — tek yol, tek cekirdek.
 *
 *  ── NEDEN "ETKIN DURUM" HESAPLANIR ───────────────────────────────────────
 *  Satirin `durum`u BEKLIYOR kalabilir ama oneri artik gecersizdir:
 *    · suresi doldu (7 gun) — zamanlanmis is YOK, okuyan hesaplar;
 *    · abonelik oneriden sonra DEGISTI — musteri kendi degistirdi, yonetici
 *      dusurdu, donem sonu gecisi uygulandi, iptal edildi, yeni satin alma.
 *  Ikincisini her degisim yoluna "oneriyi kapat" satiri ekleyerek yapmak
 *  bes yolu da bulup baglamak demekti; birini unutmak (bu deponun olculmus
 *  "mekanizma var, baglanti yok" hatasi) gecersiz bir oneriyi kabul
 *  edilebilir birakirdi. Onun yerine oneri, olustugu andaki aboneligin
 *  ANLIK GORUNTUSUNU tasir; goruntu tutmuyorsa oneri kapanmis SAYILIR.
 *
 *  ⚠ KAPANMA TEK YONLU (inceleme O2, 25.09): anlik goruntu yalniz SIMDIYE
 *  bakar. Abonelik IPTAL/SONA_ERDI/ASKIDA'ya dusup ayni kod ve paketle
 *  AKTIF'e donerse (kayip tahsilatin gece oynatilmasi) goruntu yeniden
 *  "ayni" der ve olu sanilan oneri CANLANIRDI. Bu yuzden "oneriden sonra
 *  kapatan bir gecis oldu mu" GECMISTEN olculur (`OneriGecmisi`): durumu
 *  yazan TEK yer `durumDegistir`dir ve her gecis `durum.degisti` olayi birakir.
 *
 *  ⚠ TEK TANIM: panel, musteri yaniti, kabul kontrolu, ret ve yeni oneri
 *  hepsi `oneriDurumu`nu okur (`bekleyenDavetKosulu` ile ayni ilke).
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const ONERI_GECERLILIK_GUN = 7;
const GUN_MS = 86_400_000;
/** Turkiye 2016'dan beri sabit UTC+3 (`trTarih` ile ayni ofset). */
const TR_OFSET_MS = 3 * 3_600_000;

/**
 * Oneri `sonGecerlilik`i: 7. gunun SONU, Turkiye saatiyle (inceleme D7).
 * Ekran ve e-posta "son gun 01.10" der; tam 7×24 saat olsaydi oneri o gun
 * olusturuldugu SAATTE biterdi ve aksam kabul eden musteri "suresi doldu"
 * alirdi.
 */
export function oneriSonGecerlilik(simdi: Date): Date {
  const tr = new Date(simdi.getTime() + TR_OFSET_MS + ONERI_GECERLILIK_GUN * GUN_MS);
  return new Date(
    Date.UTC(tr.getUTCFullYear(), tr.getUTCMonth(), tr.getUTCDate(), 23, 59, 59, 999) - TR_OFSET_MS,
  );
}

/**
 * Oneriyi KALICI kapatan abonelik durumlari. Odeme sorunu (ODEME_BEKLIYOR,
 * KISITLI) KAPATMAZ — paket degismedi, odeme duzelirse oneri kabul edilebilir.
 * ASKIDA kapatir: erisim kapandi, geri donus A1'de "satin al" yoludur.
 */
export const KAPATAN_DURUMLAR: readonly AbonelikDurumu[] = [
  AbonelikDurumu.IPTAL,
  AbonelikDurumu.SONA_ERDI,
  AbonelikDurumu.ASKIDA,
];

export type OneriEtkinDurumu =
  | 'bekliyor'
  | 'suresi-doldu'
  | 'abonelik-degisti'
  | 'satistan-kalkti'
  | 'kabul-edildi'
  | 'reddedildi'
  | 'geri-cekildi'
  | 'kapandi';

/** Kuralin okudugu oneri yuzeyi. */
export interface OneriSatiri {
  durum: PaketOnerisiDurumu;
  sonGecerlilik: Date;
  kaynakPaketSurumuId: string;
  kaynakIyzicoKodu: string | null;
}

/** Kuralin okudugu abonelik yuzeyi (anlik goruntuyle karsilastirilan alanlar). */
export interface OneriAboneligi {
  paketSurumuId: string;
  iyzicoAbonelikKodu: string | null;
  paketGecisTarihi: Date | null;
  durum: AbonelikDurumu;
  /**
   * Oneri yalniz KART aboneligine yapilir. Havale onayi paketi, kodu ve
   * durumu degistirmeden yontemi HAVALE yapar (inceleme O1) — goruntu bunu
   * da gormeli, yoksa oneri "bekliyor" gorunur ama kabul edilemez.
   */
  odemeYontemi: OdemeYontemi;
}

/**
 * Anlik goruntunun GOREMEDIGI iki gercek — cagiran olcer (`oneriGecmisiOku`).
 * Zorunlu parametre: unutan cagri DERLENMEZ.
 */
export interface OneriGecmisi {
  /** Oneriden SONRA abonelik `KAPATAN_DURUMLAR`dan birine gecti mi (`durum.degisti`)? */
  kapatanGecisVar: boolean;
  /** Hedef surum hala satista ve paketi aktif mi (musterinin listesinde mi)? */
  hedefSatista: boolean;
}

const SONUCLANMIS: Record<Exclude<PaketOnerisiDurumu, 'BEKLIYOR'>, OneriEtkinDurumu> = {
  [PaketOnerisiDurumu.KABUL_EDILDI]: 'kabul-edildi',
  [PaketOnerisiDurumu.REDDEDILDI]: 'reddedildi',
  [PaketOnerisiDurumu.GERI_CEKILDI]: 'geri-cekildi',
  [PaketOnerisiDurumu.KAPANDI]: 'kapandi',
};

/**
 * Onerinin BUGUNKU durumu. `bekliyor` yalniz su hepsi tutarsa:
 *   satir BEKLIYOR · suresi gecmemis · abonelik VAR ve anlik goruntu ayni
 *   (etkin paket + iyzico ucu + KART) · degisim kilidi yok · simdi de oneriden
 *   bu yana da KAPATAN bir durum yok · hedef surum hala satista.
 *
 * ⚠ Odeme sorunu (ODEME_BEKLIYOR/KISITLI) oneriyi KAPATMAZ: paket degismedi,
 * odeme duzelirse oneri yine kabul edilebilir. O arada kabul denemesini A1'in
 * karari `ODEME_SORUNU` ("once odeme") ile reddeder.
 */
export function oneriDurumu(
  o: OneriSatiri,
  ab: OneriAboneligi | null,
  simdi: Date,
  gecmis: OneriGecmisi,
): OneriEtkinDurumu {
  if (o.durum !== PaketOnerisiDurumu.BEKLIYOR) return SONUCLANMIS[o.durum];
  if (o.sonGecerlilik.getTime() <= simdi.getTime()) return 'suresi-doldu';
  if (!ab || gecmis.kapatanGecisVar) return 'abonelik-degisti';
  const goruntuAyni =
    ab.paketSurumuId === o.kaynakPaketSurumuId &&
    (ab.iyzicoAbonelikKodu ?? null) === (o.kaynakIyzicoKodu ?? null) &&
    // Kilit = bu donemde bir degisim YAPILDI (iyzico yeni kod dondurmese bile).
    ab.paketGecisTarihi === null &&
    ab.odemeYontemi === OdemeYontemi.KART &&
    !KAPATAN_DURUMLAR.includes(ab.durum);
  if (!goruntuAyni) return 'abonelik-degisti';
  return gecmis.hedefSatista ? 'bekliyor' : 'satistan-kalkti';
}

/** Etkin durumun kisa aciklamasi — yonetici paneli ve musteri seridi AYNI metni okur. */
export const ONERI_DURUM_METNI: Readonly<Record<OneriEtkinDurumu, string>> = {
  bekliyor: 'Müşteri onayı bekleniyor.',
  'suresi-doldu': 'Önerinin süresi doldu.',
  'abonelik-degisti': 'Abonelik öneriden sonra değişti; öneri geçerliliğini yitirdi.',
  'satistan-kalkti': 'Önerilen paket sürümü artık satışta değil; öneri geçerliliğini yitirdi.',
  'kabul-edildi': 'Öneri kabul edildi.',
  reddedildi: 'Öneri reddedildi.',
  'geri-cekildi': 'Öneri geri çekildi.',
  kapandi: 'Öneri kapandı.',
};

export type OneriKabulKarari =
  | { tamam: true }
  | { tamam: false; kod: 'ONERI_GECERSIZ' | 'ONERI_HEDEF_FARKLI'; mesaj: string };

/**
 * Kabul istegi bu oneriyi TUKETEBILIR mi? Kuyrukta, TAZE satirla, iyzico'dan
 * ONCE (`degistir` islemcisinin `kontrol`u). A1'in kendi karari (odeme, kilit,
 * urun) bundan SONRA ayrica calisir.
 *
 * ⚠ BASKA FIRMANIN ONERISI "bulunamadi" ile AYNI cevabi alir: kimlik
 * tahmin eden biri baska firmada oneri VAR MI ogrenemesin.
 */
export function oneriKabulKarari(g: {
  oneri: (OneriSatiri & { firmaId: string; hedefPaketSurumuId: string }) | null;
  firmaId: string;
  paketSurumuId: string;
  ab: OneriAboneligi | null;
  simdi: Date;
  gecmis: OneriGecmisi;
}): OneriKabulKarari {
  const { oneri } = g;
  if (!oneri || oneri.firmaId !== g.firmaId) {
    return { tamam: false, kod: 'ONERI_GECERSIZ', mesaj: 'Bu öneri bulunamadı ya da artık geçerli değil.' };
  }
  if (oneri.hedefPaketSurumuId !== g.paketSurumuId) {
    return {
      tamam: false,
      kod: 'ONERI_HEDEF_FARKLI',
      mesaj: 'Öneri başka bir paket için yapılmış; sayfayı yenileyip öneriyi yeniden açın.',
    };
  }
  const durum = oneriDurumu(oneri, g.ab, g.simdi, g.gecmis);
  if (durum !== 'bekliyor') {
    return { tamam: false, kod: 'ONERI_GECERSIZ', mesaj: ONERI_DURUM_METNI[durum] };
  }
  return { tamam: true };
}
