/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  23.09.2026 — UYE IZINLERI (saf, DB YOK) · "Ekip & Izinler" ekrani
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Firma sahibi, alt kullanicinin (uye) hangi modullere girebilecegini secer.
 *  Kural TEK YERDE durur: kapi (`erisim.guard.ts`), kimlik (`kimlik.ts`
 *  teklif kapsami), `/auth/me` ve ekip listesi bu dosyayi okur. Ikiz yazilsaydi
 *  ekran "kapali" der, uc acik kalirdi — bu depoda olculmus hata sinifi.
 *
 *  ── DORT IZIN ────────────────────────────────────────────────────────────
 *   excel           → Excel kesif yukleme (`Yetenek.EXCEL_YUKLE` uclari)
 *   dwg             → DWG/DXF metraj (`Yetenek.DWG_YUKLE` uclari)
 *   firmaTeklifleri → firmanin TUM teklifleri ve tutarlari. KAPALIYSA kisi
 *                     YALNIZ KENDI hazirladigi teklifleri gorur (Emre karari
 *                     23.09: "Yalniz kendi teklifleri"). Liste, pano karti,
 *                     teklif ekrani, cikti ve ceviri AYNI kosuldan gecer.
 *   kutuphane       → Kutuphanem (marka + birim fiyat + iskonto), iscilik
 *                     firmalari ve kutuphaneden fiyat ESLESTIRME.
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
export type UyeIzni = 'excel' | 'dwg' | 'firmaTeklifleri' | 'kutuphane';

/**
 * KANONIK SIRA — ekran sutunlari, denetim kaydi ve DB'ye yazilan dizi bu
 * sirayla. Sira sabit olmazsa ayni izin kumesi denetimde "degisti" gorunurdu.
 */
export const UYE_IZINLERI: readonly UyeIzni[] = [
  'excel',
  'dwg',
  'firmaTeklifleri',
  'kutuphane',
];

/**
 * Yeni uyenin izni ACIKCA verilmediginde (eski istemci, kurumsal girisle
 * otomatik katilim) kullanilan kume: HEPSI. Bugunku davranis budur — izin
 * ozelligi gelmeden once her uye her seyi goruyordu; varsayilani daraltmak
 * dunku bir davetin yarin "neden goremiyorum" demesi olurdu.
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

/** Kisinin ETKIN izinleri (sahip → dordu), kanonik sirada. */
export function etkinIzinler(u: IzinKimligi | null | undefined): UyeIzni[] {
  return UYE_IZINLERI.filter((i) => izinVarMi(u, i));
}

/**
 * GIRDI SUZGECI — istemciden gelen diziyi kanonik kumeye cevirir.
 * Gecersiz (dizi degil / bilinmeyen deger) → `null`; cagiran 400 doner.
 * Tekrarlar atilir, sira kanoniklesir.
 *
 * ⚠ DTO'daki `@IsIn` birinci katmandir; bu fonksiyon servis icinde IKINCI
 * katmandir — DTO'yu atlayan bir yol (dogrudan servis cagrisi, gelecekteki
 * baska bir uc) bilinmeyen bir izni DB'ye yazamasin.
 */
export function izinleriSuz(ham: unknown): UyeIzni[] | null {
  if (!Array.isArray(ham)) return null;
  for (const d of ham) {
    if (typeof d !== 'string' || !(UYE_IZINLERI as readonly string[]).includes(d)) return null;
  }
  return UYE_IZINLERI.filter((i) => ham.includes(i));
}

/**
 * YETENEK → IZIN esligi. Excel ve DWG yuklemesi zaten `@GerekliYetenek` ile
 * isaretli; izin kapisi bu isareti OKUR, ayri bir dekorator istemez. Boylece
 * yarin `EXCEL_YUKLE` tasiyan yeni bir uc eklendiginde izni de kendiliginden
 * uygulanir — unutmanin yonu guvenli taraftir.
 *
 * ⚠ Anahtarlar `Yetenek` enum'unun DIZGE degerleridir (bu dosya Nest
 * servisini import etmesin diye). Kapi (`ekip-izinleri-test.ts`) iki
 * anahtarin enum degerleriyle birebir ayni kaldigini olcer.
 */
export const YETENEK_IZNI: Readonly<Record<string, UyeIzni>> = {
  'excel.yukle': 'excel',
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
 * oldugu teklifler (`Quote.userId`). Karar `firmaTeklifleri` izninden gelir.
 */
export type TeklifKapsami = 'firma' | 'kendi';

export function teklifKapsamiCoz(u: IzinKimligi | null | undefined): TeklifKapsami {
  return izinVarMi(u, 'firmaTeklifleri') ? 'firma' : 'kendi';
}

/** Kapinin 403 govdesindeki kisa ad — ekranda "X izniniz yok" cumlesi. */
export const IZIN_ADI: Readonly<Record<UyeIzni, string>> = {
  excel: 'Excel keşif',
  dwg: 'DWG proje',
  firmaTeklifleri: 'Son teklifler ve tutarlar',
  kutuphane: 'Kütüphanem',
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
      `Bu bölüm için izniniz yok (${IZIN_ADI[izin]}). ` +
      'İzinleri firmanızın ana kullanıcısı Ekip sayfasından açabilir.',
  };
}

/** Denetim kaydi icin kararli metin: "excel,dwg" (bos kume "-"). */
export function izinMetni(izinler: readonly UyeIzni[]): string {
  return izinler.length ? izinler.join(',') : '-';
}
