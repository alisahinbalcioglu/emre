import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { kimlikCoz } from '../../../altyapi/auth/kimlik';
import { UYE_IZNI_KEY } from '../../../altyapi/auth/decorators/uye-izni.decorator';
import {
  izinVarMi,
  uyeIzniYokGovdesi,
  yeteneklerinIzinleri,
  type UyeIzni,
} from '../../firma/uye-izinleri';
import {
  ErisimKarari,
  ErisimServisi,
  KAPALI_HESAPTA_ACIK,
  Yetenek,
} from './erisim.servisi';

export const YETENEK_KEY = 'gerekenYetenek';

/**
 * Ucun hangi yetenegi gerektirdigini bildirir.
 * `@GerekliYetenek(Yetenek.CIKTI_INDIR)`
 */
export const GerekliYetenek = (...yetenekler: Yetenek[]) =>
  SetMetadata(YETENEK_KEY, yetenekler);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ERISIM KAPISI — "bu firma su an bunu yapabilir mi"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ErisimServisi kararini HTTP katmanina baglar. Karar mantigi BURADA
 *  DEGILDIR (servis tek dogru kaynaktir); bu sinif yalnizca kablolamadir.
 *
 *  ── NEDEN SUNUCUDA DA KAPATILIYOR ───────────────────────────────────────
 *  On yuzde butonu gizlemek KAPATMAK DEGILDIR: uclar dogrudan cagrilabilir
 *  ve kisitli moddaki bir firma `POST /api/quotes/:id/export`'a istek atarak
 *  ciktisini almaya devam edebilir. Kisitli modun tek anlamli yeri sunucudur.
 *
 *  ── TIER GUARD ILE ILISKI (ikisi AYNI SEY DEGIL) ────────────────────────
 *  `TierGuard` "bu paketi SATIN ALDIN MI" sorusunu sorar (yetenek/kapsam).
 *  Bu kapi "ODEMEN GUNCEL MI" sorusunu sorar (abonelik sagligi). Bir firma
 *  Pro paketi satin almis OLABILIR ama odemesi 30 gun gecikmisse ciktisini
 *  indirememelidir. Iki kapi DIK eksenlerdir; biri digerinin yerine gecmez.
 *
 *  ── SESSIZ GECIS YASAK ──────────────────────────────────────────────────
 *  Yetenek metadata'si TANIMSIZSA kapi `true` doner (uc korumasizdir) —
 *  bu, NestJS guard'larinin normal davranisidir ve bilincli birakilmistir:
 *  butun uclara kapi koymak istemiyoruz. Ama metadata VARSA ve firma yoksa
 *  GURULTUYLE durulur (kimlikCoz 403 firlatir), sessizce gecilmez.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class ErisimGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly erisim: ErisimServisi,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // RolesGuard/TierGuard ile AYNI okuma: metot + SINIF, metot ezer.
    // Yalniz getHandler() okunursa @GerekliYetenek'i SINIF duzeyine koyan
    // controller'larda metadata bulunamaz ve kapi sessizce true donerdi
    // (tier.guard.ts:20'de olculmus kusurun ta kendisi).
    const gerekenler = this.reflector.getAllAndOverride<Yetenek[]>(
      YETENEK_KEY,
      [context.getHandler(), context.getClass()],
    );
    const istek = context.switchToHttp().getRequest();

    /**
     * ── UYE IZNI: DORDUNCU EKSEN (23.09.2026, "Ekip & Izinler") ───────────
     * Firma sahibinin alt kullaniciya actigi/kapattigi modul. Odeme ile ILGISI
     * YOK: firmanin aboneligi yurur, yalniz bu KISI o bolume giremez.
     *
     * ⚠ YETENEK KONTROLUNDEN ONCE ve erken `return true`dan ONCE: izin
     *   metadata'si yetenek tasimayan bir uca da konabilir; erken donus onu
     *   sessizce atlardi (bu dosyanin basligindaki "sessiz gecis" kusuru).
     * ⚠ Excel/DWG icin ayri isaret GEREKMEZ: `EXCEL_YUKLE`/`DWG_YUKLE`
     *   yeteneginden izin TURETILIR — yeni bir yukleme ucu izni kendiliginden
     *   tasir, unutulamaz.
     * ⚠ Karar DB'ye gitmez: `izinler` ve `firmaRol` her istekte
     *   `JwtStrategy.validate`in cektigi satirdan gelir, yani sahip izni
     *   kapattigi an bir SONRAKI istek durur (token yenilemesi gerekmez).
     * ⚠ AYRI KOD (`UYE_IZNI_YOK`): `ABONELIK_KISITLI` on yuzde odeme seridini
     *   acar; uyeye "paket secin" demek yanlis eylem olurdu.
     */
    const izinler = new Set<UyeIzni>(yeteneklerinIzinleri(gerekenler));
    const isaretliIzin = this.reflector.getAllAndOverride<UyeIzni | undefined>(
      UYE_IZNI_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isaretliIzin) izinler.add(isaretliIzin);
    for (const izin of izinler) {
      if (!izinVarMi(istek.user, izin)) {
        throw new ForbiddenException(uyeIzniYokGovdesi(izin));
      }
    }

    if (!gerekenler || gerekenler.length === 0) return true;

    const { firmaId } = kimlikCoz(istek.user);

    /**
     * ── KAPATILMIS HESAP: UCUNCU EKSEN (22.09.2026, Emre karari) ──────────
     * Emre: "kaydedilmis tekliflerini gorebilecek, indirebilecek,
     * girebilecek ancak islem yapamayacak."
     *
     * ⚠ BU KAPI KAPATMAYI BILMEZ, cunku `karar()` FIRMA eksenlidir: hesabini
     * kapatan kisinin aboneligi iptal olur, `erisimVar: false` doner ve
     * `ASKIDA_ACIK` yalniz `ABONELIK_YONET` birakir. Yani okuma yetenekleri
     * burada duserdi ve "gorebilecek/indirebilecek" HIC calismazdi — kisi
     * `/quotes`i acar, liste 403 alirdi.
     *
     * ⚠ TEK BASINA KAPI ACMAZ: `JwtAuthGuard` kapali hesabi zaten durduruyor
     * ve ancak `@KapaliHesapIzinli` tasiyan uclari geciriyor. Buradaki izin
     * o listeden GECMIS bir istege uygulanir. Iki kapi da acik olmadan cagri
     * gerceklesmez; biri unutulursa uc KAPALI kalir (guvenli yon).
     */
    const kapaliHesap = istek.user?.hesapKapali === true;

    const karar: ErisimKarari = await this.erisim.karar(firmaId);

    // Karari istege iliştir: controller tekrar sorgu atmadan okuyabilsin.
    istek.erisimKarari = karar;

    for (const y of gerekenler) {
      // Kapatilmis hesabin OKUMA yetenekleri (yukaridaki gerekce).
      if (kapaliHesap && KAPALI_HESAPTA_ACIK.has(y)) continue;
      if (!this.erisim.yetenekKararla(karar, y)) {
        throw new ForbiddenException({
          mesaj: karar.uyari?.baslik ?? 'Erisiminiz kisitli',
          aciklama: karar.uyari?.metin,
          durum: karar.durum,
          saltOkunur: karar.saltOkunur,
          eylem: karar.uyari?.eylem,
          // On yuz bu koda bakarak abonelik seridini/modalini acar.
          kod: 'ABONELIK_KISITLI',
        });
      }
    }

    return true;
  }
}
