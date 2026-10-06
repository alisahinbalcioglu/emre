/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  UYE YETKILERI (saf, DB YOK) · "Ekip & Izinler" ekrani
 *  23.09.2026 dort izin · 06.10.2026 IKI YETKIYE indi (ekip/yetki plani B)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Firma sahibi, alt kullanicinin (uye) hangi islere girebilecegini secer.
 *  Kural TEK YERDE durur: kapi (`erisim.guard.ts`), kimlik (`kimlik.ts`
 *  teklif kapsami), `/auth/me` ve ekip listesi bu dosyayi okur. Ikiz yazilsaydi
 *  ekran "kapali" der, uc acik kalirdi — bu depoda olculmus hata sinifi.
 *
 *  ── IKI YETKI (Emre 30.09 plani; goc 20261006100000_uye_yetkileri_fiyat_dwg)
 *   fiyat → Excel kesif yukleme (`Yetenek.EXCEL_YUKLE` uclari), fiyat
 *           ESLESTIRME, Firma kutuphanesi (marka + birim fiyat + iskonto),
 *           iscilik firmalari, teklif formatlari ve firmanin TUM teklifleri.
 *           Eski `excel` + `kutuphane` + `firmaTeklifleri` birlesimi.
 *           KAPALIYSA kisi YALNIZ KENDI hazirladigi teklifleri gorur (Emre
 *           karari 23.09: "Yalniz kendi teklifleri"). Liste, pano karti,
 *           teklif ekrani, cikti ve ceviri AYNI kosuldan gecer.
 *   dwg   → DWG/DXF metraj (`Yetenek.DWG_YUKLE` uclari).
 *  Goc: eski `excel` → `fiyat`, `dwg` → `dwg`; `firmaTeklifleri` ve
 *  `kutuphane` duser (Emre karari 7: Excel acik uye fiyat gormeye baslar).
 *
 *  ── SAHIP HER ZAMAN TAM YETKILI ─────────────────────────────────────────
 *  `firmaRol === 'sahip'` icin saklanan liste OKUNMAZ. Sahibi kendi
 *  kararıyla kilitlemek (ya da ikinci sahibin birinciyi kilitlemesi) ekibi,
 *  aboneligi ve izinleri yoneten kisiyi urunden atardi.
 *
 *  ── FAIL-CLOSED ──────────────────────────────────────────────────────────
 *  Rolu bilinmeyen (alan yok, bozuk) kimlik HICBIR izne sahip DEGILDIR.
 *  Uretimde kimlik her istekte `JwtStrategy.validate`ten gelir ve iki alani
 *  da tasir; alan dusecek olursa sessizce "herkes her seyi gorur" olmasin.
 *
 *  ⚠ Bu dosya Nest/Prisma IMPORT ETMEZ: testte DB'siz olculur ve on yuzdeki
 *  ikiz metin dosyasi (`frontend/ozellik/firma/ekip/izin-metinleri.ts`) ile
 *  anahtar listesi karsilastirilir.
 */

/** Semadaki `UyeIzni` enum'unun dizge karsiligi. */
export type UyeIzni = 'fiyat' | 'dwg';

/**
 * KANONIK SIRA — ekran sutunlari, denetim kaydi ve DB'ye yazilan dizi bu
 * sirayla. Sira sabit olmazsa ayni izin kumesi denetimde "degisti" gorunurdu.
 */
export const UYE_IZINLERI: readonly UyeIzni[] = ['fiyat', 'dwg'];

/**
 * Yeni uyenin yetkisi ACIKCA verilmediginde (eski istemci, kurumsal girisle
 * davetsiz otomatik katilim) kullanilan kume: HEPSI. Davetli katilim
 * davetteki secimi tasir; davet ve yetki degistirme EN AZ BIR yetki ister.
 * ⚠ Semadaki `@default([...])` ve migration'daki `DEFAULT ARRAY[...]` ile
 * BIREBIR ayni olmak zorunda — kapi uc yeri karsilastirir.
 */
export const TUM_IZINLER: readonly UyeIzni[] = UYE_IZINLERI;

/** Kimligin izin kararina giren iki alani (strateji ikisini de doner). */
export type IzinKimligi = {
  firmaRol?: unknown;
  izinler?: unknown;
};

/**
 * IZIN VAR MI — tek karar noktasi.
 *
 *  · sahip → her zaman `true` (liste okunmaz).
 *  · uye   → yalniz saklanan listede varsa.
 *  · diger → `false` (fail-closed; bkz. dosya basligi).
 */
export function izinVarMi(u: IzinKimligi | null | undefined, izin: UyeIzni): boolean {
  if (!u) return false;
  if (u.firmaRol === 'sahip') return true;
  if (u.firmaRol !== 'uye') return false;
  return Array.isArray(u.izinler) && u.izinler.includes(izin);
}

/** Kisinin ETKIN izinleri (sahip → ikisi), kanonik sirada. */
export function etkinIzinler(u: IzinKimligi | null | undefined): UyeIzni[] {
  return UYE_IZINLERI.filter((i) => izinVarMi(u, i));
}

/**
 * GIRDI SUZGECI — istemciden gelen diziyi kanonik kumeye cevirir.
 * Gecersiz (dizi degil / bilinmeyen deger — eski izin adlari DAHIL) → `null`;
 * cagiran 400 doner. Tekrarlar atilir, sira kanoniklesir.
 *
 * ⚠ DTO'daki `@IsIn` birinci katmandir; bu fonksiyon servis icinde IKINCI
 * katmandir — DTO'yu atlayan bir yol (dogrudan servis cagrisi, gelecekteki
 * baska bir uc) bilinmeyen bir izni DB'ye yazamasin.
 * ⚠ BOS DIZI burada GECERLIDIR (okuma yolu: bozuk kayit → `[]`, fail-closed).
 * "En az bir yetki" kurali YAZMA yollarinda ayrica uygulanir
 * (`yetkiSecimiGecerli`).
 */
export function izinleriSuz(ham: unknown): UyeIzni[] | null {
  if (!Array.isArray(ham)) return null;
  for (const d of ham) {
    if (typeof d !== 'string' || !(UYE_IZINLERI as readonly string[]).includes(d)) return null;
  }
  return UYE_IZINLERI.filter((i) => ham.includes(i));
}

/**
 * YAZMA KURALI (davet + yetki degistirme): secim gecerli VE en az bir yetki.
 * Yetkisiz uye hicbir isi yapamazdi; koltugu bos yere doldururdu.
 */
export function yetkiSecimiGecerli(secim: readonly UyeIzni[] | null): secim is UyeIzni[] {
  return Array.isArray(secim) && secim.length > 0;
}

/**
 * YETENEK → IZIN esligi. Excel ve DWG yuklemesi zaten `@GerekliYetenek` ile
 * isaretli; izin kapisi bu isareti OKUR, ayri bir dekorator istemez. Boylece
 * yarin `EXCEL_YUKLE` tasiyan yeni bir uc eklendiginde yetkisi de kendiliginden
 * uygulanir — unutmanin yonu guvenli taraftir.
 *
 * ⚠ Anahtarlar `Yetenek` enum'unun DIZGE degerleridir (bu dosya Nest
 * servisini import etmesin diye). Kapi (`ekip-izinleri-test.ts`) iki
 * anahtarin enum degerleriyle birebir ayni kaldigini olcer.
 */
export const YETENEK_IZNI: Readonly<Record<string, UyeIzni>> = {
  'excel.yukle': 'fiyat',
  'dwg.yukle': 'dwg',
};

/** Bir uca giden yeteneklerden hangi uye izinleri turer (tekrarsiz). */
export function yeteneklerinIzinleri(yetenekler: readonly string[] | null | undefined): UyeIzni[] {
  const set = new Set<UyeIzni>();
  for (const y of yetenekler ?? []) {
    const i = YETENEK_IZNI[y];
    if (i) set.add(i);
  }
  return UYE_IZINLERI.filter((i) => set.has(i));
}

/**
 * TEKLIF KAPSAMI — `firma`: firmanin tum teklifleri · `kendi`: yalniz yazari
 * oldugu teklifler (`Quote.userId`). Karar `fiyat` yetkisinden gelir.
 */
export type TeklifKapsami = 'firma' | 'kendi';

export function teklifKapsamiCoz(u: IzinKimligi | null | undefined): TeklifKapsami {
  return izinVarMi(u, 'fiyat') ? 'firma' : 'kendi';
}

/** Kapinin 403 govdesindeki kisa ad — ekranda "X izniniz yok" cumlesi. */
export const IZIN_ADI: Readonly<Record<UyeIzni, string>> = {
  fiyat: 'Fiyatlandırma ve teklifler',
  // Tipografik kesme isareti (’): on yuz metinleriyle ayni (duz `'` React'te kacislanir).
  dwg: 'DWG’den metraj',
};

/**
 * 403 GOVDESI — `ABONELIK_KISITLI`dan AYRI bir kod: on yuz `api.ts` o kodla
 * odeme seridini tetikler; bu durumda odeme yapacak bir sey YOK, izni firma
 * sahibi acar. Iki durumu tek koda baglamak uyeye "paket secin" dedirtirdi.
 */
export function uyeIzniYokGovdesi(izin: UyeIzni): {
  kod: 'UYE_IZNI_YOK';
  izin: UyeIzni;
  mesaj: string;
} {
  return {
    kod: 'UYE_IZNI_YOK',
    izin,
    mesaj:
      `Bu bölüm için yetkiniz yok (${IZIN_ADI[izin]}). ` +
      'Yetkileri firmanızın ana kullanıcısı Ekip sayfasından açabilir.',
  };
}

/** Denetim kaydi icin kararli metin: "fiyat,dwg" (bos kume "-"). */
export function izinMetni(izinler: readonly UyeIzni[]): string {
  return izinler.length ? izinler.join(',') : '-';
}
