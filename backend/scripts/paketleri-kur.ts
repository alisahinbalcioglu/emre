/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PAKET KURULUMU — iyzico urun/plan + veritabani satirlari
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Kullanim (sunucuda, /opt/metaprice icinden):
 *      docker compose exec backend npm run seedpaketler
 *      docker compose exec backend npm run seedpaketler -- --uygula
 *
 *  ⚠ NEDEN `seedpaketler` (iki nokta YOK): Hetzner web konsolu TR klavyede
 *  `:` karakterini `;` yaziyor — 01.09'da yasandi, `npm run seed:paketler`
 *  konsola `npm run seed;paketler` olarak dustu ve "Missing script: seed"
 *  hatasi verdi. `deploy.sh` basindaki `$ > | _` listesine `:` de eklenmeli.
 *  Yerel gelistirmede `npm run seed:paketler` de calisir (ayni betik).
 *
 *  ── NEDEN BETIK, NEDEN ELLE PANEL DEGIL ────────────────────────────────
 *  Panelden yapilinca iki referans kodu (urun + plan) elle kopyalanip
 *  `PaketSurumu`a yazilmak zorunda. Bu kodlar 30+ karakterlik rastgele
 *  dizgeler: tek karakter yanlis kopyalanirsa `abonelikBaslat` iyzico'dan
 *  "plan bulunamadi" alir ve kimse abone OLAMAZ. Hata satin alma aninda,
 *  musterinin karsisinda ortaya cikar.
 *  Betik kodu iyzico'nun YANITINDAN alip dogrudan yazar — kopyalama yok.
 *  Ayrica sandbox'ta kurulan yapi, ayni komutla canlida tekrar kurulur.
 *
 *  ── VARSAYILAN PROVA ───────────────────────────────────────────────────
 *  Bu betik iyzico'da GERCEK kayit olusturur ve olusan PLAN SILINEMEZ
 *  (fiyati da degistirilemez). Bu yuzden varsayilan davranis PROVA'dir:
 *  ne yapacagini yazar, hicbir sey yapmaz. `--uygula` bilincli bir eylemdir.
 *
 *  ── IDEMPOTENT ─────────────────────────────────────────────────────────
 *  Ikinci kez kosarsa: iyzico'da ayni adli urun VARSA yeniden yaratmaz
 *  (urun adlari tekildir, yaratmaya calismak hata verir), veritabaninda
 *  ayni `kod` VARSA dokunmaz. Yarim kalan kurulum guvenle tekrarlanabilir.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { IyzicoClient } from '../src/ozellik/odeme/iyzico/iyzico.client';
import { odemeYapilandirildiMi } from '../src/ozellik/odeme/yapilandirma';

/**
 * ⚠ KURULACAK PAKETLER — fiyatlar burada TEK YERDE durur.
 *
 * ⭐ GORUNEN FIYAT DOLAR, SOZLESME TUTARI TL (kullanici karari 29.08).
 *
 * KDV HARIC USD referanslar:
 *   Mekanik  basic 22 $  · pro 28 $
 *   Elektrik basic 22 $  · pro 28 $
 *   MEP      42 $ — iki PRO planin %25 indirimlisi (28+28=56 → 42)
 *
 * TL plan fiyati SU FORMULLE hesaplanir ve iyzico'ya TL olarak yazilir:
 *     TL(brut) = YUVARLA( USD x TCMB_kuru x (1 + KDV/100) )
 *
 * ⚠ NEDEN TL PLAN, NEDEN USD DEGIL — OLCULDU:
 *   · iyzico abonelik planinin fiyati ve para birimi SABITTIR; kuru takip
 *     eden degisken tutar abonelik urununde MUMKUN DEGIL.
 *   · Abonelik dokumani "yabanci para biriminde sadece yabanci kart
 *     kullanilabilir" diyor — musteriler Turk karti tasiyor.
 *   · USD plan calissa bile cevrimi IYZICO kendi kurundan yapardi;
 *     "kesim tarihi kuru" kontrolu yine bizde olmazdi.
 * Dolar yalnizca VITRINDE durur (referansTutar); sozlesme TL'dir.
 *
 * ⚠ KUR KILIDI BEDAVA GELIYOR: plan fiyati degismedigi icin musteri
 * girdigi gunun kurunda KALIR. Kur oynayinca YENI SURUM acilir, yeni
 * uyeler yeni fiyattan gelir, eskiler kendi fiyatinda devam eder —
 * `PaketSurumu` tam bunun icin tasarlandi. Ek kod GEREKMEZ.
 *
 * ⚠ KULLANICI HAKKI HERKESTE 2 (sahip + 1 alt kullanici) ve SABITTIR.
 * ADIM 0 raporundaki "18 kademeli plan zorunlu" bulgusu DEGISKEN koltuk
 * sayisi icindi; koltuk sabit oldugu icin kademeye gerek YOK, bes duz plan
 * yeter. (iyzico'da adet/koltuk carpani olmadigi olculmustu — o kisit
 * burada bir sorun yaratmiyor cunku carpan zaten gerekmiyor.)
 *
 * `kapsam` ve `seviye` yetenek matrisini belirler (capabilities.helper.ts):
 *   kapsam: mechanical | electrical | mep   (mep = ikisi birden)
 *   seviye: core (malzeme) | pro (malzeme + iscilik + dwg)
 *
 * ⚠ TUTARI DEGISTIRIP BETIGI TEKRAR KOSMAK FIYATI GUNCELLEMEZ: iyzico
 * planinin fiyati degismez. Fiyat degisikligi = yeni `kod` + yeni satir.
 */
const PAKETLER = [
  {
    kod: 'basic-mek',
    satistaMi: true,
    ad: 'Basic — Mekanik',
    aciklama: 'Mekanik disiplinde malzeme kütüphanesi ve teklif hazırlama.',
    kapsam: 'mechanical' as const,
    seviye: 'core' as const,
    // ⚠ FAZ 7 F1b (Emre karari E-2, 17.09): kullanici hakki FIRMA SAHIBI
    // DAHIL sayilir — Basic 1 · Pro 2 · Pro-MEP 3. Bu deger YALNIZ YENI
    // KURULUMLAR icindir: betik surumlu paketi ATLADIGI icin canliyi
    // DEGISTIRMEZ. Canli guncelleme `scripts/kullanici-hakki-guncelle.ts`
    // ile ve Emre onayindan sonra yapilir.
    kullaniciHakki: 1,
    aylikTeklifHakki: null as number | null,
    dwgAktif: false,
    usdTutar: 22.0,
    periyot: 'MONTHLY' as const,
    denemeGunu: 30,
    sira: 10,
  },
  {
    kod: 'pro-mek',
    satistaMi: true,
    ad: 'Pro — Mekanik',
    aciklama: 'Mekanik: malzeme + işçilik + DWG metraj.',
    kapsam: 'mechanical' as const,
    seviye: 'pro' as const,
    kullaniciHakki: 2,
    aylikTeklifHakki: null as number | null,
    dwgAktif: true,
    usdTutar: 28.0,
    periyot: 'MONTHLY' as const,
    denemeGunu: 30,
    sira: 20,
  },
  {
    kod: 'basic-elk',
    // 17.09 (Emre karari): 16.09'daki "elektrik satistan cekilsin" karari
    // TERSINE dondu — uc elektrik paketi SATISTA KALIYOR, kapsama elektrik
    // sonra eklenecek. Bayrak mekanizmasi DURUYOR (paket basina secilebilir),
    // yalniz degeri bugunku gercege doner: satista 5 surum.
    satistaMi: true,
    ad: 'Basic — Elektrik',
    aciklama: 'Elektrik disiplininde malzeme kütüphanesi ve teklif hazırlama.',
    kapsam: 'electrical' as const,
    seviye: 'core' as const,
    kullaniciHakki: 1,
    aylikTeklifHakki: null as number | null,
    dwgAktif: false,
    usdTutar: 22.0,
    periyot: 'MONTHLY' as const,
    denemeGunu: 30,
    sira: 30,
  },
  {
    kod: 'pro-elk',
    // 17.09 (Emre karari): bkz. basic-elk — elektrik satista KALIYOR.
    satistaMi: true,
    ad: 'Pro — Elektrik',
    aciklama: 'Elektrik: malzeme + işçilik + DWG metraj.',
    kapsam: 'electrical' as const,
    seviye: 'pro' as const,
    kullaniciHakki: 2,
    aylikTeklifHakki: null as number | null,
    dwgAktif: true,
    usdTutar: 28.0,
    periyot: 'MONTHLY' as const,
    denemeGunu: 30,
    sira: 40,
  },
  {
    // MEP = iki disiplin birden. Fiyat, iki PRO planin %25 indirimlisi:
    // 28 + 28 = 56 → 56 x 0.75 = 42. (Basic'ten turetilseydi 44 x 0.75 = 33
    // olurdu; 42 rakami MEP'in PRO seviyesinde oldugunu belirler.)
    kod: 'pro-mep',
    // 17.09 (Emre karari): bkz. basic-elk — elektrik satista KALIYOR.
    satistaMi: true,
    ad: 'Pro — Mekanik + Elektrik',
    aciklama: 'İki disiplin: malzeme + işçilik + DWG metraj. Ayrı ayrı almaya göre %25 avantajlı.',
    kapsam: 'mep' as const,
    seviye: 'pro' as const,
    kullaniciHakki: 3,
    aylikTeklifHakki: null as number | null,
    dwgAktif: true,
    usdTutar: 42.0,
    periyot: 'MONTHLY' as const,
    denemeGunu: 30,
    sira: 50,
  },
];

/**
 * TL fiyatini "psikolojik" bicime yuvarlar: 1267.20 → 1299, 1612.80 → 1649.
 *
 * Kural: yuz basamagina yuvarla, sonra 49 ya da 99'a tamamla — hangisi
 * YUKARIDA ve YAKINSA. Asagi yuvarlama YAPILMAZ: hesaplanan bedelin altina
 * dusmek gelir kaybidir ve kur zaten anlik, kusurata sadakatin musteriye
 * faydasi yok.
 */
export function fiyatYuvarla(ham: number): number {
  const yuz = Math.floor(ham / 100) * 100;
  for (const aday of [yuz + 49, yuz + 99, yuz + 149, yuz + 199]) {
    if (aday >= ham) return aday;
  }
  return Math.ceil(ham / 100) * 100 + 99;
}

/** USD referanstan KDV DAHIL TL sozlesme tutarini hesaplar. */
export function tlFiyatHesapla(
  usd: number,
  kur: number,
  kdvOrani: number,
): { ham: number; yuvarlanmis: number } {
  const ham = usd * kur * (1 + kdvOrani / 100);
  return { ham, yuvarlanmis: fiyatYuvarla(ham) };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  --denemesiz-ikiz  (FAZ 6.12a, 15.09.2026) — ⚠ HAZIRLANDI, KOSULMADI
 * ═══════════════════════════════════════════════════════════════════════════
 *  Deneme hakki olmayan satin alma (daha once deneme almis firma/kisi) iyzico'ya
 *  DENEMESIZ plan gondermek zorunda: deneme gunu iyzico'da PLANA yazilidir,
 *  abonelik baslatma istegi deneme alani tasimaz. Her satistaki denemeli surum
 *  icin AYNI urun altinda AYNI tutar/periyot ve `trialPeriodDays = 0` bir ikiz
 *  plan kurulur, kodu `PaketSurumu.iyzicoDenemesizPlanKodu`na iyzico YANITINDAN
 *  yazilir (elle kopyalama yok).
 *
 *  Kullanim (once SANDBOX, sonra canli; plan SILINEMEZ):
 *      npm run seedpaketler -- --denemesiz-ikiz            (PROVA)
 *      npm run seedpaketler -- --denemesiz-ikiz --uygula
 *
 *  ⚠ SIRA: ikiz kodlar DB'ye yazilmadan yeni satin alma kodu canliya cikarsa
 *  hakki olmayan satin alma 503 ile durur (kapali hata — denemeli plana
 *  DUSULMEZ). Once bu betik, `paket` olcumuyle kodlar dolu gorulur, SONRA kod.
 *
 *  ⚠ FIYAT YENIDEN HESAPLANMAZ: surumun DB'deki sozlesme tutari kullanilir.
 *  Kur bugun degismis olsa bile ikiz AYNI fiyatta olmali — yoksa deneme hakki
 *  olmayan musteri ayni paket icin baska fiyat oder.
 */
export function denemesizIkizGerekliMi(s: {
  satistaMi: boolean;
  denemeGunu: number;
  iyzicoDenemesizPlanKodu: string | null;
}): boolean {
  return s.satistaMi && s.denemeGunu > 0 && !s.iyzicoDenemesizPlanKodu;
}

/** Ikiz planin iyzico tanimi. SAF — test/deneme-hakki-test.ts DI blogu olcer. */
export function denemesizIkizTanimi(s: {
  tutar: { toFixed(n: number): string } | string | number;
  paraBirimi: string;
  periyot: string;
  periyotAdedi: number;
  paket: { ad: string };
}) {
  const tutarMetni = typeof s.tutar === 'object' ? s.tutar.toFixed(2) : String(s.tutar);
  return {
    ad: `${s.paket.ad} · Aylik · Denemesiz`,
    tutar: Number(tutarMetni),
    paraBirimi: s.paraBirimi as 'TRY' | 'USD' | 'EUR',
    periyot: s.periyot as 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY',
    periyotAdedi: s.periyotAdedi,
    // ⚠ Ikizin TEK farki budur. Surumun deneme gunu buraya YAZILMAZ.
    denemeGunu: 0,
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  --tek-urun  (23.09.2026, paket degisimi) — ⚠ HAZIRLANDI, KOSULMADI
 * ═══════════════════════════════════════════════════════════════════════════
 *  iyzico'nun RESMI kisiti (dokuman, 23.09): abonelik paket degisimi
 *  ("upgrade") yalniz AYNI URUNE ait planlar arasinda yapilabilir. Bu betik
 *  bugune kadar HER PAKETE AYRI URUN aciyordu (`MetaPriceX ${p.ad}`) — o
 *  yapida Basic→Pro gecisi iyzico'da IMKANSIZ, uygulama `URUN_FARKLI` der.
 *
 *  Bu kip satistaki her surum icin TEK URUN altinda:
 *    · ana plani (ayni tutar, periyot, deneme gunu) ve
 *    · denemesiz ikizini (deneme gunu 0 — degisim ve deneme hakki olmayan
 *      satin alma bunu kullanir)
 *  kurar, YENI bir surum satiri yazar (surumNo+1, kodlar iyzico YANITINDAN)
 *  ve eski surumu satistan ceker (`satistaMi=false`). Eski surumdeki mevcut
 *  aboneler ETKILENMEZ (eski plandan cekilmeye devam eder) — ama paket
 *  degistiremez; onlar icin yol yonetici panelidir.
 *
 *  ⚠ FIYAT YENIDEN HESAPLANMAZ (ikiz kipiyle ayni kural): tutar, vitrin
 *  capasi ve kur izi eski surumden AYNEN kopyalanir. Bu bir YAPI gocudur,
 *  fiyat degisikligi degil.
 *
 *  ⚠ BUNDAN SONRA HER PLAN BU URUNE: fiyat degisikligiyle acilacak yeni
 *  surumler de ayni urun altinda olmali, yoksa eski surumdeki musteri yeni
 *  surume gecemez. Yeni paket kuran ana dal da bu urunu kullanir.
 *
 *  Kullanim (once SANDBOX, sonra canli; plan SILINEMEZ):
 *      npm run seedpaketler -- --tek-urun            (PROVA)
 *      npm run seedpaketler -- --tek-urun --uygula
 */
export const TEK_URUN_ADI = 'MetaPriceX Abonelik';

/** SAF — bu surum tek urune TASINMALI mi? */
export function tekUruneTasinmaliMi(
  s: { satistaMi: boolean; iyzicoUrunKodu: string },
  tekUrunKodu: string | null,
): boolean {
  return s.satistaMi && s.iyzicoUrunKodu !== tekUrunKodu;
}

/** SAF — tek urun altindaki ana plan + ikizin iyzico tanimlari. */
export function tekUrunPlanTanimlari(s: {
  tutar: { toFixed(n: number): string } | string | number;
  paraBirimi: string;
  periyot: string;
  periyotAdedi: number;
  denemeGunu: number;
  paket: { ad: string };
}) {
  const ikiz = denemesizIkizTanimi(s);
  const ana = { ...ikiz, ad: `${s.paket.ad} · Aylik`, denemeGunu: s.denemeGunu };
  // Surumde deneme yoksa ana plan ZATEN denemesiz: ikinci plan kurulmaz.
  return { ana, ikiz: s.denemeGunu > 0 ? ikiz : null };
}

async function tekUruneTasi(iyzico: IyzicoClient): Promise<void> {
  let urunler: Array<{ referenceCode: string; name: string }> = [];
  try {
    urunler = await iyzico.urunleriListele();
  } catch (e) {
    console.error(`\n✗ iyzico'ya baglanilamadi: ${e instanceof Error ? e.message : e}\n`);
    process.exit(1);
  }
  let tekUrunKodu: string | null = urunler.find((u) => u.name === TEK_URUN_ADI)?.referenceCode ?? null;
  console.log(
    tekUrunKodu
      ? `  tek urun   : ZATEN VAR → ${tekUrunKodu}`
      : `  tek urun   : OLUSTURULACAK — "${TEK_URUN_ADI}"`,
  );

  const surumler = await prisma.paketSurumu.findMany({
    where: { satistaMi: true },
    include: { paket: true },
    orderBy: [{ paket: { sira: 'asc' } }, { surumNo: 'asc' }],
  });
  const ozet: string[] = [];

  for (const s of surumler) {
    baslik(`${s.paket.kod} · surum ${s.surumNo}`);
    if (!tekUruneTasinmaliMi(s, tekUrunKodu)) {
      console.log('  ⏭  ATLANDI — zaten tek urun altinda');
      ozet.push(`${s.paket.kod}: atlandi (tek urunde)`);
      continue;
    }
    const { ana, ikiz } = tekUrunPlanTanimlari(s);
    const sonNo = await prisma.paketSurumu.aggregate({
      where: { paketId: s.paketId },
      _max: { surumNo: true },
    });
    const yeniNo = (sonNo._max.surumNo ?? s.surumNo) + 1;
    console.log(
      `  eski urun  : ${s.iyzicoUrunKodu}\n` +
        `  ana plan   : "${ana.ad}" — ${ana.tutar} ${ana.paraBirimi}/${ana.periyot}, deneme ${ana.denemeGunu} gun\n` +
        (ikiz ? `  ikiz plan  : "${ikiz.ad}" — deneme 0 gun\n` : '  ikiz plan  : (gerekmez — surumde deneme yok)\n') +
        `  yeni surum : ${yeniNo} (eski surum ${s.surumNo} satistan cekilecek)`,
    );
    if (!uygula) {
      ozet.push(`${s.paket.kod}: TASINACAK → surum ${yeniNo} (${ana.tutar} ${ana.paraBirimi})`);
      continue;
    }

    if (!tekUrunKodu) {
      const urun = await iyzico.urunOlustur({
        ad: TEK_URUN_ADI,
        aciklama: 'MetaPriceX paketleri — paket degisimi icin tum planlar tek urunde.',
      });
      tekUrunKodu = urun.referenceCode;
      console.log(`  ✓ tek urun olusturuldu → ${tekUrunKodu}`);
    }
    const anaPlan = await iyzico.planOlustur(tekUrunKodu, ana);
    console.log(`  ✓ ana plan → ${anaPlan.referenceCode}`);
    const ikizPlan = ikiz ? await iyzico.planOlustur(tekUrunKodu, ikiz) : null;
    if (ikizPlan) console.log(`  ✓ ikiz plan → ${ikizPlan.referenceCode}`);

    // ⚠ TEK ISLEM: yeni surum yazilmadan eski satistan CEKILMEZ — yoksa
    // paket bir an satissiz kalir ve fiyat sayfasi onu gostermez.
    await prisma.$transaction([
      prisma.paketSurumu.create({
        data: {
          paketId: s.paketId,
          surumNo: yeniNo,
          iyzicoPlanKodu: anaPlan.referenceCode,
          iyzicoDenemesizPlanKodu: ikizPlan?.referenceCode ?? null,
          iyzicoUrunKodu: tekUrunKodu,
          // FIYAT AYNEN — yapi gocu, fiyat degisikligi degil.
          tutar: s.tutar,
          paraBirimi: s.paraBirimi,
          referansTutar: s.referansTutar,
          referansParaBirimi: s.referansParaBirimi,
          kurDegeri: s.kurDegeri,
          kurTarihi: s.kurTarihi,
          periyot: s.periyot,
          periyotAdedi: s.periyotAdedi,
          denemeGunu: s.denemeGunu,
          satistaMi: true,
        },
      }),
      prisma.paketSurumu.update({ where: { id: s.id }, data: { satistaMi: false } }),
    ]);
    console.log(`  ✓ surum ${yeniNo} yazildi, surum ${s.surumNo} satistan cekildi`);
    ozet.push(`${s.paket.kod}: TASINDI → surum ${yeniNo} (urun ${tekUrunKodu})`);
  }

  baslik('OZET — tek urun gocu');
  ozet.forEach((x) => console.log(`  ${x}`));
  console.log(
    uygula
      ? '\n  Bitti. Dogrulama:  bash scripts/abonelik-olcum.sh paket\n'
      : '\n  Bu bir PROVAYDI — hicbir sey olusturulmadi.\n' +
          '  Gercekten kurmak icin:  npm run seedpaketler -- --tek-urun --uygula\n',
  );
}

async function denemesizIkizleriKur(iyzico: IyzicoClient): Promise<void> {
  const surumler = await prisma.paketSurumu.findMany({
    where: { satistaMi: true },
    include: { paket: true },
    orderBy: [{ paket: { sira: 'asc' } }, { surumNo: 'asc' }],
  });
  const ozet: string[] = [];
  for (const s of surumler) {
    baslik(`${s.paket.kod} · surum ${s.surumNo}`);
    if (!denemesizIkizGerekliMi(s)) {
      const neden = s.iyzicoDenemesizPlanKodu
        ? `ikiz ZATEN VAR → ${s.iyzicoDenemesizPlanKodu}`
        : 'surumde deneme yok (ana plan zaten denemesiz)';
      console.log(`  ⏭  ATLANDI — ${neden}`);
      ozet.push(`${s.paket.kod}: atlandi (${neden})`);
      continue;
    }
    const tanim = denemesizIkizTanimi(s);
    console.log(
      `  urun       : ${s.iyzicoUrunKodu}\n` +
        `  ana plan   : ${s.iyzicoPlanKodu} (deneme ${s.denemeGunu} gun)\n` +
        `  ikiz plan  : "${tanim.ad}" — ${tanim.tutar} ${tanim.paraBirimi}/${tanim.periyot}, deneme 0 gun`,
    );
    if (!uygula) {
      ozet.push(`${s.paket.kod}: ikiz OLUSTURULACAK (${tanim.tutar} ${tanim.paraBirimi})`);
      continue;
    }
    const plan = await iyzico.planOlustur(s.iyzicoUrunKodu, tanim);
    await prisma.paketSurumu.update({
      where: { id: s.id },
      data: { iyzicoDenemesizPlanKodu: plan.referenceCode },
    });
    console.log(`  ✓ ikiz plan olusturuldu ve yazildi → ${plan.referenceCode}`);
    ozet.push(`${s.paket.kod}: ikiz OLUSTURULDU (plan=${plan.referenceCode})`);
  }
  baslik('OZET — denemesiz ikiz planlar');
  ozet.forEach((s) => console.log(`  ${s}`));
  console.log(
    uygula
      ? '\n  Bitti. Dogrulama:  bash scripts/abonelik-olcum.sh paket\n'
      : '\n  Bu bir PROVAYDI — hicbir sey olusturulmadi.\n' +
          '  Gercekten kurmak icin:  npm run seedpaketler -- --denemesiz-ikiz --uygula\n',
  );
}

const uygula = process.argv.includes('--uygula');
const denemesizIkiz = process.argv.includes('--denemesiz-ikiz');
const tekUrun = process.argv.includes('--tek-urun');
const prisma = new PrismaClient();

function baslik(s: string) {
  console.log(`\n${'─'.repeat(66)}\n${s}\n${'─'.repeat(66)}`);
}

async function main() {
  baslik(
    uygula
      ? 'PAKET KURULUMU — UYGULAMA MODU (iyzico"da gercek kayit olusur)'
      : 'PAKET KURULUMU — PROVA (hicbir sey yazilmaz; --uygula ile calistirin)',
  );

  const config = new ConfigService();

  if (!odemeYapilandirildiMi(config)) {
    console.error(
      '\n✗ iyzico ortam degiskenleri eksik.\n' +
        '  Gerekli: IYZICO_API_KEY, IYZICO_SECRET_KEY, IYZICO_MERCHANT_ID\n' +
        '  Sandbox icin IYZICO_TABAN_URL=https://sandbox-api.iyzipay.com\n',
    );
    process.exit(2); // 2 = ON KOSUL YOK (regresyon sozlesmesi)
  }

  // 6.12a: ikiz kip TCMB kuruna IHTIYAC DUYMAZ (fiyat surumden okunur) ve
  // yeni paket KURMAZ — ayri dal, asagidaki paket dongusune girmez.
  if (denemesizIkiz) {
    const ikizIyzico = new IyzicoClient(config);
    const ikizTaban = config.get('IYZICO_TABAN_URL') ?? 'https://sandbox-api.iyzipay.com';
    console.log(`  kip        : DENEMESIZ IKIZ PLAN`);
    console.log(`  iyzico ucu : ${ikizTaban}`);
    console.log(
      /sandbox/.test(String(ikizTaban))
        ? '  ortam      : SANDBOX'
        : '  ortam      : ⚠ CANLI — olusan planlar SILINEMEZ',
    );
    await denemesizIkizleriKur(ikizIyzico);
    return;
  }

  // 23.09: tek urun gocu da TCMB kuruna ihtiyac duymaz (fiyat surumden).
  if (tekUrun) {
    const tuIyzico = new IyzicoClient(config);
    const tuTaban = config.get('IYZICO_TABAN_URL') ?? 'https://sandbox-api.iyzipay.com';
    console.log(`  kip        : TEK URUN GOCU (paket degisimi icin)`);
    console.log(`  iyzico ucu : ${tuTaban}`);
    console.log(
      /sandbox/.test(String(tuTaban))
        ? '  ortam      : SANDBOX'
        : '  ortam      : ⚠ CANLI — olusan planlar SILINEMEZ',
    );
    await tekUruneTasi(tuIyzico);
    return;
  }

  // ── TCMB kuru: fiyat BURADAN turetilir, elle girilmez ────────────────
  // Elle girilen kur "bu fiyat nereden cikti" sorusunu cevapsiz birakir.
  // Cekilen deger + tarih PaketSurumu'na YAZILIR (denetim izi).
  const { ExchangeRatesService } = await import(
    '../src/ozellik/fiyat/exchange-rates/exchange-rates.service'
  );
  const kurServisi = new ExchangeRatesService();
  const kurlar = await kurServisi.getRates();
  const kur = kurlar.usdTry;
  const kdvOrani = Number(config.get('KDV_ORANI') ?? 20);

  if (!kur || kur <= 1) {
    console.error(
      `\n✗ Gecerli TCMB kuru alinamadi (usdTry=${kur}).\n` +
        '  Fiyat hesaplanamaz; kur alinamadan plan kurulmaz.\n',
    );
    process.exit(1);
  }
  console.log(`  TCMB kuru  : 1 USD = ${kur} TL  (${kurlar.date ?? 'tarih yok'})`);
  console.log(`  KDV orani  : %${kdvOrani}`);

  const iyzico = new IyzicoClient(config);
  const taban = config.get('IYZICO_TABAN_URL') ?? 'https://sandbox-api.iyzipay.com';
  console.log(`  iyzico ucu : ${taban}`);
  console.log(`  paket sayisi: ${PAKETLER.length}`);

  if (/sandbox/.test(String(taban))) {
    console.log('  ortam      : SANDBOX');
  } else {
    console.log('  ortam      : ⚠ CANLI — olusan planlar SILINEMEZ');
  }

  // ── Mevcut iyzico urunleri (ad TEKIL, yeniden yaratilamaz) ───────────
  let mevcutUrunler: Array<{ referenceCode: string; name: string }> = [];
  try {
    mevcutUrunler = await iyzico.urunleriListele();
    console.log(`  iyzico"da mevcut urun: ${mevcutUrunler.length}`);
  } catch (e) {
    console.error(
      `\n✗ iyzico'ya baglanilamadi: ${e instanceof Error ? e.message : e}\n` +
        '  Anahtarlari ve IYZICO_TABAN_URL"i kontrol edin.\n',
    );
    process.exit(1);
  }

  const ozet: string[] = [];

  for (const p of PAKETLER) {
    baslik(`${p.kod} · ${p.ad}`);

    // GORUNEN dolar → SOZLESME TL'si (KDV DAHIL, yuvarlanmis)
    const { ham, yuvarlanmis } = tlFiyatHesapla(p.usdTutar, kur, kdvOrani);
    const tlTutar = yuvarlanmis;
    console.log(
      `  vitrin     : $${p.usdTutar}/ay  (KDV haric referans)`,
      );
    console.log(
      `  sozlesme   : ${tlTutar} TL/ay  KDV DAHIL  ` +
        `(ham ${ham.toFixed(2)} → yuvarlandi)`,
    );

    // ── Veritabaninda zaten var mi? ────────────────────────────────────
    const mevcutPaket = await prisma.paket.findUnique({
      where: { kod: p.kod },
      include: { surumler: true },
    });
    if (mevcutPaket && mevcutPaket.surumler.length > 0) {
      console.log('  ⏭  ATLANDI — bu kod veritabaninda zaten var (surumlu).');
      ozet.push(`${p.kod}: atlandi (mevcut)`);
      continue;
    }

    // ── iyzico urunu ───────────────────────────────────────────────────
    // ⚠ 23.09: TUM paketler TEK urun altinda (`TEK_URUN_ADI`). Eskiden her
    // pakete ayri urun aciliyordu (`MetaPriceX ${p.ad}`) ve iyzico paket
    // degisimini yalniz AYNI urunun planlari arasinda yapar — o yapida
    // musteri paket degistiremezdi. Bkz. `--tek-urun` kipi.
    const urunAdi = TEK_URUN_ADI;
    let urunKodu = mevcutUrunler.find((u) => u.name === urunAdi)?.referenceCode;

    if (urunKodu) {
      console.log(`  · urun ZATEN VAR → ${urunKodu}`);
    } else if (!uygula) {
      console.log(`  · urun OLUSTURULACAK: "${urunAdi}"`);
      urunKodu = '(prova)';
    } else {
      const urun = await iyzico.urunOlustur({
        ad: urunAdi,
        aciklama: 'MetaPriceX paketleri — paket degisimi icin tum planlar tek urunde.',
      });
      urunKodu = urun.referenceCode;
      // ⚠ Liste donguden ONCE cekildi: yeni urun eklenmezse sonraki paket
      // ayni adla IKINCI urunu yaratmaya calisir (ad tekil → iyzico hatasi).
      mevcutUrunler.push({ referenceCode: urun.referenceCode, name: urunAdi });
      console.log(`  ✓ urun olusturuldu → ${urunKodu}`);
    }

    // ── iyzico odeme plani ─────────────────────────────────────────────
    const planAdi = `${p.ad} · Aylik`;
    let planKodu = '(prova)';
    if (!uygula) {
      console.log(
        `  · plan OLUSTURULACAK: "${planAdi}" — ` +
          `${tlTutar} TRY/${p.periyot}, deneme ${p.denemeGunu} gun`,
      );
    } else {
      const plan = await iyzico.planOlustur(urunKodu!, {
        ad: planAdi,
        // ⚠ iyzico'ya TL yazilir — vitrindeki dolar DEGIL.
        tutar: tlTutar,
        paraBirimi: 'TRY',
        periyot: p.periyot,
        periyotAdedi: 1,
        denemeGunu: p.denemeGunu,
      });
      planKodu = plan.referenceCode;
      console.log(`  ✓ plan olusturuldu → ${planKodu}`);
    }

    // ── Veritabani satirlari ───────────────────────────────────────────
    if (!uygula) {
      console.log(`  · Paket + PaketSurumu satiri YAZILACAK (kod=${p.kod})`);
      ozet.push(`${p.kod}: olusturulacak — $${p.usdTutar} → ${tlTutar} TL`);
      continue;
    }

    const paket = mevcutPaket
      ? mevcutPaket
      : await prisma.paket.create({
          data: {
            kod: p.kod,
            ad: p.ad,
            aciklama: p.aciklama,
            sira: p.sira,
            kapsam: p.kapsam,
            seviye: p.seviye,
            kullaniciHakki: p.kullaniciHakki,
            aylikTeklifHakki: p.aylikTeklifHakki,
            dwgAktif: p.dwgAktif,
            aktif: true,
          },
        });

    await prisma.paketSurumu.create({
      data: {
        paketId: paket.id,
        surumNo: 1,
        iyzicoPlanKodu: planKodu,
        iyzicoUrunKodu: urunKodu!,
        // SOZLESME tutari (TL, KDV dahil) — tahsilat ve fatura bunu okur.
        tutar: tlTutar,
        paraBirimi: 'TRY',
        // VITRIN (capa) — yalnizca gosterim; hicbir tahsilat bunu okumaz.
        referansTutar: p.usdTutar,
        referansParaBirimi: 'USD',
        // DENETIM IZI: "bu fiyat nereden cikti" sorusunun cevabi.
        kurDegeri: kur,
        kurTarihi: new Date(),
        periyot: p.periyot,
        periyotAdedi: 1,
        denemeGunu: p.denemeGunu,
        // ⚠ SABIT `true` DEGIL: bayrak paket tanimindan okunur. Bugun bes
        // paketin besi de satista (17.09 karari), ama mekanizma DURUYOR:
        // bir paket satistan cekilirse sabit `true` onu her seed kosumunda
        // yeniden satisa acardi (6.4'te yasandi).
        satistaMi: p.satistaMi,
      },
    });
    console.log('  ✓ veritabani satirlari yazildi');
    ozet.push(`${p.kod}: OLUSTURULDU — $${p.usdTutar} → ${tlTutar} TL (plan=${planKodu})`);
  }

  baslik('OZET');
  ozet.forEach((s) => console.log(`  ${s}`));
  if (!uygula) {
    console.log(
      '\n  Bu bir PROVAYDI — hicbir sey olusturulmadi.\n' +
        // ⚠ IKI NOKTA YOK: bu satir Hetzner konsoluna KOPYALANIYOR ve o
        // konsol `:` karakterini `;` yaziyor (01.09'da yasandi). Onerilen
        // komut da bu yuzden `seedpaketler` es adini kullanmali — yoksa
        // betik kendi cikTisinda calismayan bir komut onermis olur.
        '  Gercekten kurmak icin:  npm run seedpaketler -- --uygula\n',
    );
  } else {
    console.log(
      '\n  Kurulum bitti. Fiyat sayfasini acip kontrol edin: /abonelik\n',
    );
  }
}

// ⚠ YALNIZCA DOGRUDAN CALISTIRILINCA KOS.
// Bu dosya `fiyatYuvarla` / `tlFiyatHesapla` saf fonksiyonlarini DISA ACAR
// ve test paketi (test/fiyat-capasi-test.ts) onlari import eder. Koruma
// olmadan import ETMEK betigi CALISTIRIR: test, iyzico'ya baglanmaya
// calisip "ortam degiskeni eksik" ile cikis 2 verirdi (olculdu — ilk
// kosumda tam olarak bu oldu).
if (require.main === module) {
  main()
    .catch((e) => {
      console.error('\n✗ HATA:', e instanceof Error ? e.message : e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
