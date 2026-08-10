/**
 * ONAY ↔ REVIZYON KARARLARI (saf — DOM'suz, React'siz, test edilir).
 *
 * KULLANICI BILDIRIMI (07.08, ekran goruntusuyle): "daha once yukledigim dwg yi
 * tekrar yukledigimde segmentlerine ayiramiyorum ve segmentlerine ayrilmis olan
 * cizimlerin uzerinde revize isler yapamiyorum. onaylandi butonunu bozabilmeli
 * ve parcalanmis segmentler geri gelmeli."
 *
 * ── OLCULEN KOK ────────────────────────────────────────────────────────────
 * Onayi geri alma MEKANIZMASI (`unapproveLayer`) kodda ZATEN VARDI; eksik olan
 * ona ulasan YOL idi:
 *   1. Metraj kartindaki "Onayli" dugmesi `disabled={cl.approved}` idi. Devre
 *      disi dugme tiklama olayi URETMEDIGI icin hem kendi isini yapmiyor hem de
 *      kartin (onayi kaldiran) onClick'ine kabarmiyordu — kullanici tam dogru
 *      yere basip hicbir sey olmadigini goruyordu.
 *   2. Onayi kaldirmanin tek yolu kart GOVDESINE tiklamakti; ekranda bunu
 *      soyleyen hicbir yazi yoktu (yalniz HTML title tooltip).
 *   3. O yol bulunsa bile ikinci kusur devreye giriyordu: `selectLayer` bir
 *      TOGGLE'dir; layer zaten seciliyken cagrilinca secimi NULL'a cekiyordu.
 *      Onay kalkiyor ama sag panel bosaliyor, yine revize edilemiyordu.
 *   4. Sag panelde onayli layer icin HICBIR aksiyon dugmesi render edilmiyordu
 *      (iki dalin ikisi de `!approved` / `!calculated` kosuluna bagliydi).
 *
 * Bu modul yalniz KARARLARI tasir; render ve state yazimi cagiranlarda kalir.
 * Kararlar burada oldugu icin bir daha sessizce degistirilemez — bkz.
 * `onay-revizyon.test.ts`, her kriter icin ESKI davranisin ayni kriteri
 * ihlal ettigini de olcer (test gercekten ayirt ediyor mu sorusunun cevabi).
 */

/** Metraj ozet kartindaki tek dugmenin isi. `disabled` ARTIK YOK. */
export type KartAksiyonu = 'onayla' | 'onayi-kaldir';

/**
 * Kart dugmesi ne yapar? Kullanici karari (07.08): TEK DUGME, IKI DURUM —
 * onayli iken ayni dugme onayi kaldirir (kullanicinin bastigi yer burasi).
 */
export function kartAksiyonu(onayli: boolean): KartAksiyonu {
  return onayli ? 'onayi-kaldir' : 'onayla';
}

/** Sag paneldeki (LayerInfoSidebar) aksiyon dugmeleri. */
export type SidebarAksiyonu =
  | 'segmentlere-ayir'
  | 'hesaplamayi-tamamla'
  | 'onayi-kaldir-revize';

/**
 * Secili layer icin hangi aksiyonlar gosterilir?
 *
 * SOZLESME: hesaplama devam etmiyorsa panel ASLA aksiyonsuz kalmaz — her
 * durumun bir cikisi vardir. Onayli layer'in cikisi revizyondur.
 */
export function sidebarAksiyonlari(durum: {
  hesaplandi: boolean;
  onayli: boolean;
  hesaplaniyor: boolean;
}): SidebarAksiyonu[] {
  if (durum.hesaplaniyor) return [];
  if (!durum.hesaplandi) return ['segmentlere-ayir'];
  return durum.onayli ? ['onayi-kaldir-revize'] : ['hesaplamayi-tamamla'];
}

/**
 * Layer secimi iki farkli niyetle degisir; ikisi AYNI fonksiyon olamaz:
 *
 *  - 'toggle' → kullanici layer'a tikladi. Ayni layer'a tekrar tiklamak secimi
 *    KAPATIR (mevcut davranis; "Secimi kaldir" dugmesi de bunu kullanir).
 *  - 'odakla' → sistem o layer'i calisilir hale getiriyor (revizyon). Secim
 *    HER ZAMAN hedefe gider; kapanmasi kullanicinin istedigi seyin tam tersidir.
 *
 * ⚠ PROXY OLCUT YASAGI: "zaten seciliyse" durumunu niyet yerine gecirme —
 * revizyonda kullanici cogu zaman ZATEN o layer'da olur, tam da o yuzden
 * toggle onu disari atardi.
 */
export function secimSonrasi(
  mevcut: string | null,
  hedef: string,
  mod: 'toggle' | 'odakla',
): string | null {
  if (mod === 'odakla') return hedef;
  return mevcut === hedef ? null : hedef;
}

/**
 * Bir layer cizimde CAP RENKLERIYLE (segmentlere ayrilmis) gorunur mu?
 *
 * Onayli layer bilerek ham AutoCAD rengine doner ("bu layer bitti, dikkati basa
 * cek" kurali). Kullanicinin "segmentlerine ayiramiyorum" dedigi gorsel durum
 * budur: onay kalkinca segmentler + T-noktalari + tiklanabilirlik geri gelir.
 */
export function capRenkliGorunur(durum: { hesaplandi: boolean; onayli: boolean }): boolean {
  return durum.hesaplandi && !durum.onayli;
}
