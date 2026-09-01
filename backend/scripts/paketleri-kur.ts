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
    ad: 'Basic — Mekanik',
    aciklama: 'Mekanik disiplinde malzeme kutuphanesi ve teklif hazirlama.',
    kapsam: 'mechanical' as const,
    seviye: 'core' as const,
    kullaniciHakki: 2,
    aylikTeklifHakki: null as number | null,
    dwgAktif: false,
    usdTutar: 22.0,
    periyot: 'MONTHLY' as const,
    denemeGunu: 30,
    sira: 10,
  },
  {
    kod: 'pro-mek',
    ad: 'Pro — Mekanik',
    aciklama: 'Mekanik: malzeme + iscilik + DWG metraj.',
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
    ad: 'Basic — Elektrik',
    aciklama: 'Elektrik disiplininde malzeme kutuphanesi ve teklif hazirlama.',
    kapsam: 'electrical' as const,
    seviye: 'core' as const,
    kullaniciHakki: 2,
    aylikTeklifHakki: null as number | null,
    dwgAktif: false,
    usdTutar: 22.0,
    periyot: 'MONTHLY' as const,
    denemeGunu: 30,
    sira: 30,
  },
  {
    kod: 'pro-elk',
    ad: 'Pro — Elektrik',
    aciklama: 'Elektrik: malzeme + iscilik + DWG metraj.',
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
    ad: 'Pro — Mekanik + Elektrik',
    aciklama: 'Iki disiplin: malzeme + iscilik + DWG metraj. Ayri ayri almaya gore %25 avantajli.',
    kapsam: 'mep' as const,
    seviye: 'pro' as const,
    kullaniciHakki: 2,
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

const uygula = process.argv.includes('--uygula');
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
    const urunAdi = `MetaPriceX ${p.ad}`;
    let urunKodu = mevcutUrunler.find((u) => u.name === urunAdi)?.referenceCode;

    if (urunKodu) {
      console.log(`  · urun ZATEN VAR → ${urunKodu}`);
    } else if (!uygula) {
      console.log(`  · urun OLUSTURULACAK: "${urunAdi}"`);
      urunKodu = '(prova)';
    } else {
      const urun = await iyzico.urunOlustur({
        ad: urunAdi,
        aciklama: p.aciklama,
      });
      urunKodu = urun.referenceCode;
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
        satistaMi: true,
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
