/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SUNUCU URUNLERI KAPISI  (devir Gorev 6 + Gorev 7 sayaci, 10.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Faz 0 sertlestirmesi (nobetci, bekci, sshd, fail2ban, systemd birimleri)
 * 06-07.09'da sunucuda ELLE yazildi ve depoda YOKTU. Artik `scripts/sunucu/`
 * tek kaynak, `kur.sh` kurucu. Bu kapi o kablolamanin sessizce kopmasini olcer:
 *
 *   - Kurulum listesi ile dizin AYRISIRSA bir dosya hic kurulmaz (ya da
 *     olmayan dosya kurulmaya calisilir) ve kimse fark etmez.
 *   - CRLF ile giden bir betik sunucuda "bad interpreter" ile olur.
 *   - sshd dogrulamasiz yeniden yuklenirse erisim kesilebilir; ufw OpenSSH
 *     izninden ONCE etkinlestirilirse oturum kesilir.
 *   - Nobetcinin saydigi etiket, backend'in logladigi etiketten AYRISIRSA
 *     denetim kaydi alarmi SESSIZCE susar. Iki dosya ayri dillerde yazildigi
 *     icin ortak sabit yok; esitlik burada olculur.
 *
 * DB, SUNUCU ve AG GEREKTIRMEZ. Cikis: 0 = PASS · digeri = FAIL.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(ad: string, kosul: boolean, detay = ''): void {
  if (kosul) {
    passed++;
    console.log(`  ✓ ${ad}`);
  } else {
    failed++;
    failures.push(`${ad}${detay ? ` — ${detay}` : ''}`);
    console.log(`  ✗ ${ad}${detay ? ` — ${detay}` : ''}`);
  }
}

const KOK = path.join(__dirname, '../..');
const SUNUCU = path.join(KOK, 'scripts/sunucu');
// ⚠ Calisma agaci Windows'ta CRLF olabilir; metin karsilastirmasi LF uzerinden.
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), 'utf8').replace(/\r\n/g, '\n');
/** Kabuk: tam satir `#` yorumlarini soyar — iddia yorumdan degil KODDAN olculsun. */
const kabukKodu = (s: string) => s.replace(/^[ \t]*#.*$/gm, '');
/** TS: blok ve satir yorumlarini soyar. */
const tsKodu = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

function dosyalar(dizin: string, biriktir: string[] = []): string[] {
  for (const g of fs.readdirSync(dizin, { withFileTypes: true })) {
    const tam = path.join(dizin, g.name);
    if (g.isDirectory()) dosyalar(tam, biriktir);
    else biriktir.push(tam);
  }
  return biriktir;
}

function main(): void {
  const kur = kabukKodu(oku('scripts/sunucu/kur.sh'));

  // ── S · KURULUM LISTESI ─────────────────────────────────────────────────
  console.log('\n── S · KURULUM LISTESI ──');
  const blok = /KALEMLER="\n([\s\S]*?)\n"/.exec(kur)?.[1] ?? '';
  const kalemler = blok
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [kaynak, hedef, izin] = s.split('|');
      return { kaynak, hedef, izin };
    });

  // OLCUT: liste gercekten okundu mu? Okunmadiysa asagidaki "her kalem ..."
  // assert'leri BOS kume uzerinde yesil kalirdi.
  check('S-OLCUT kurulum listesi ayristirildi (>= 8 kalem)', kalemler.length >= 8, `kalem=${kalemler.length}`);

  const eksikKaynak = kalemler.filter((k) => !fs.existsSync(path.join(SUNUCU, k.kaynak)));
  check(
    'S1 listedeki her kaynak dosya depoda VAR',
    eksikKaynak.length === 0,
    `eksik=${JSON.stringify(eksikKaynak.map((k) => k.kaynak))}`,
  );

  const listede = new Set(kalemler.map((k) => k.kaynak));
  const dizindekiler = dosyalar(SUNUCU)
    .map((p) => path.relative(SUNUCU, p).split(path.sep).join('/'))
    .filter((p) => p !== 'kur.sh');
  const listedeYok = dizindekiler.filter((p) => !listede.has(p));
  check(
    'S2 scripts/sunucu altindaki her dosya kurulum listesinde (kurulmayan urun yok)',
    listedeYok.length === 0,
    `listede olmayan=${JSON.stringify(listedeYok)}`,
  );

  const izinHatali = kalemler.filter((k) =>
    k.kaynak.startsWith('sbin/') ? k.izin !== '755' : k.izin !== '644',
  );
  check(
    'S3 izinler: betikler 755, yapilandirma ve birimler 644',
    izinHatali.length === 0,
    `hatali=${JSON.stringify(izinHatali)}`,
  );

  // ── T · SATIR SONU ──────────────────────────────────────────────────────
  console.log('\n── T · SATIR SONU ──');
  // Bayt olarak sayilir. 13.09'da kabukta `grep -c $'\r'` ile olculdu ve
  // YANLIS sonuc verdi (Git Bash deseni bosa cevirip her satiri saydi).
  const crli = dosyalar(SUNUCU).filter((p) => fs.readFileSync(p).includes(0x0d));
  check('T1 sunucuya giden hicbir dosyada CR bayti yok', crli.length === 0, `CR iceren=${JSON.stringify(crli)}`);
  check(
    'T2 .gitattributes scripts/sunucu icin eol=lf zorluyor',
    /^scripts\/sunucu\/\*\*\s+text\s+eol=lf\s*$/m.test(oku('.gitattributes')),
  );

  // ── U · KURULUM GUVENLIGI ───────────────────────────────────────────────
  console.log('\n── U · KURULUM GUVENLIGI ──');
  check(
    'U1 varsayilan mod KONTROL (salt okunur) — yanlislikla kosulan betik bir sey degistirmez',
    kur.includes('MOD="${1:---kontrol}"'),
  );
  // Uygula bolumu ayri dilimlenir: `sshd -t` kontrol fonksiyonunda da geciyor,
  // duz indexOf onu bulup sirayi yanlis olcerdi (13.09'da boyle kirmizi dondu).
  const uygulaBas = kur.indexOf('DAMGA=$(date');
  const uygula = uygulaBas !== -1 ? kur.slice(uygulaBas) : '';
  const kontrolFonk = /^kontrol\(\) \{\n([\s\S]*?)\n\}$/m.exec(kur)?.[1] ?? '';
  check('U-OLCUT uygula bolumu ve kontrol fonksiyonu ayristirildi', uygula.length > 0 && kontrolFonk.length > 0);
  const sshdTest = uygula.indexOf('sshd -t');
  const sshdReload = uygula.indexOf('systemctl try-reload-or-restart ssh');
  check(
    'U2 sshd yapilandirmasi yeniden yuklemeden ONCE dogrulaniyor',
    sshdTest !== -1 && sshdReload !== -1 && sshdTest < sshdReload,
    `sshd -t=${sshdTest} reload=${sshdReload}`,
  );
  const ufwIzin = kur.indexOf('ufw allow "$kural"');
  const ufwAc = kur.indexOf('ufw --force enable');
  check(
    'U3 ufw: OpenSSH izni etkinlestirmeden ONCE (ters sira oturumu keser)',
    ufwIzin !== -1 && ufwAc !== -1 && ufwIzin < ufwAc && /UFW_KURALLARI="[^"]*OpenSSH/.test(kur),
    `allow=${ufwIzin} enable=${ufwAc}`,
  );
  const f2bTest = uygula.indexOf('fail2ban-client -t');
  const f2bReload = uygula.indexOf('systemctl reload-or-restart fail2ban');
  check(
    'U4 fail2ban yeniden yuklemeden ONCE dogrulaniyor',
    f2bTest !== -1 && f2bReload !== -1 && f2bTest < f2bReload,
  );
  // 13.09 inceleme bulgusu 1: dogrulama/yukleme "bu kosumda degisen" bayraklarina
  // bagliydi; yarida kalan kosumdan sonra ikinci kosum ikisini de atliyordu.
  check(
    'U5 dogrulama ve yeniden yukleme KOSULSUZ (degisim bayragina bagli degil — yarida kalan kosum yakinsar)',
    !/_DEGISTI/.test(kur) && /^sshd -t|^if ! sshd -t; then$/m.test(uygula) && /^systemctl try-reload-or-restart ssh$/m.test(uygula),
  );
  // 13.09 inceleme bulgusu 2: fail2ban dogrulamasi basarisizken gecersiz dosya diskte kaliyordu.
  const sshdHata = uygula.slice(uygula.indexOf('if ! sshd -t; then'), uygula.indexOf('if ! fail2ban-client -t'));
  const f2bHata = uygula.slice(uygula.indexOf('if ! fail2ban-client -t'), uygula.indexOf('echo "  sshd ve fail2ban yapilandirmasi gecerli"'));
  check(
    'U6 iki dogrulama da basarisizlikta bu kosumda kurulanlarin HEPSINI geri aliyor',
    /geri_al\n[\s\S]*?exit 1/.test(sshdHata) && /geri_al\n[\s\S]*?exit 1/.test(f2bHata) && /for h in \$KURULAN; do/.test(kur),
  );
  check(
    'U7 kontrol modu yapilandirma GECERLILIGINI ve servislerin calistigini olcuyor (md5 esitligi yetmez)',
    kontrolFonk.includes('sshd -t') && kontrolFonk.includes('fail2ban-client -t') && kontrolFonk.includes('systemctl is-active --quiet fail2ban'),
  );

  // ── V · SERTLESTIRME ICERIGI ────────────────────────────────────────────
  console.log('\n── V · SERTLESTIRME ICERIGI ──');
  const sshdKalem = kalemler.find((k) => k.kaynak.startsWith('ssh/'));
  check(
    'V1 sshd dosyasi 00- onekli (OpenSSH ILK degeri alir; 50-cloud-init parola girisini aciyor)',
    !!sshdKalem && /\/sshd_config\.d\/00-/.test(sshdKalem.hedef),
    `hedef=${sshdKalem?.hedef}`,
  );
  const sshd = kabukKodu(oku('scripts/sunucu/ssh/00-sertlestirme.conf'));
  check('V2 sshd: parola girisi KAPALI', /^PasswordAuthentication no$/m.test(sshd));
  check('V3 sshd: root yalniz anahtarla', /^PermitRootLogin prohibit-password$/m.test(sshd));
  const f2b = kabukKodu(oku('scripts/sunucu/fail2ban/00-metaprice.local'));
  check(
    'V4 fail2ban: sshd ve recidive jail etkin',
    /\[sshd\]\s*\nenabled = true/.test(f2b) && /\[recidive\]\s*\nenabled\s*= true/.test(f2b),
  );
  const sbinHedefler = new Set(kalemler.filter((k) => k.kaynak.startsWith('sbin/')).map((k) => k.hedef));
  const birimler = kalemler.filter((k) => k.kaynak.endsWith('.service'));
  const kopukBirim = birimler.filter((k) => {
    const exec = /^ExecStart=(\S+)/m.exec(oku(`scripts/sunucu/${k.kaynak}`))?.[1];
    return !exec || !sbinHedefler.has(exec);
  });
  check(
    'V5 her systemd servisi, listede KURULAN bir betigi calistiriyor',
    birimler.length >= 2 && kopukBirim.length === 0,
    `servis=${birimler.length} kopuk=${JSON.stringify(kopukBirim.map((k) => k.kaynak))}`,
  );

  // ── W · DENETIM SAYACI (Gorev 7) ────────────────────────────────────────
  console.log('\n── W · DENETIM SAYACI ──');
  const nobetci = kabukKodu(oku('scripts/sunucu/sbin/metaprice-nobetci.sh'));
  const servis = tsKodu(oku('backend/src/ozellik/kutuphane/admin/admin.service.ts'));
  const nobetciEtiket = /docker logs --since \d+m metaprice-backend-1 2>&1 \| grep -c '([A-Z-]+)'/.exec(nobetci)?.[1];
  const servisEtiket = /this\.logger\.error\(\s*`([A-Z][A-Z-]+) /.exec(servis)?.[1];
  check(
    'W-OLCUT iki etiket de okundu',
    !!nobetciEtiket && !!servisEtiket,
    `nobetci=${nobetciEtiket} servis=${servisEtiket}`,
  );
  check(
    'W1 nobetcinin saydigi etiket = backend`in logladigi etiket (ayrisirsa alarm SESSIZCE susar)',
    !!nobetciEtiket && nobetciEtiket === servisEtiket,
    `nobetci=${nobetciEtiket} servis=${servisEtiket}`,
  );
  check(
    'W2 sayac saglik kararina bagli (0dan buyukse SORUN)',
    /\[ "\$DENETIM_HATA" -gt 0\s*\] && SORUN="\$SORUN denetim_yazilamadi=\$DENETIM_HATA"/.test(nobetci),
  );
  check(
    'W3 sayac durum.json`a yaziliyor (dis izleme okuyabilsin)',
    /"denetim_yazilamadi_1sa":\$DENETIM_HATA/.test(nobetci),
  );

  // ── Y · DUMP IZINLERI — TUM pg_dump CAGRILARI ───────────────────────────
  // 13.09.2026 bagimsiz canli olcum: rotasyonun kendi yedegi 0644 dogdu ve
  // icinde CLAUDE_API_KEY vardi. Sebep deploy.sh'ta 10.09'da duzeltilen kalibin
  // IKIZIYDI: `docker compose exec`/`docker exec` kabugu backup.sh'taki
  // umask 077'yi miras almaz (olculdu 0022). Kusur uc betikte daha duruyordu.
  // Bu blok tek betige bakmaz: scripts/ altindaki HER pg_dump cagrisi, AYNI
  // calisma baglaminda (sh -c yuku ya da betigin kendisi) ondan once umask 077
  // tasimali. Yeni bir dump noktasi eklendiginde kendiliginden olculur.
  //
  // ── 21.09.2026 · Y2 ONARILDI — KAPI OLCTUGUNU SANDIGI SEYI OLCMUYORDU ──
  // Y2 "tek tirnakli dump yuklerinde kesme isareti yok" diyordu. Iki ayri
  // sebepten YALANCI YESIL veriyordu ve ikisi de olculdu (21.09):
  //   (a) Yalniz `pg_dump` ONCESINE bakiyordu (`metin.slice(0, m.index)`).
  //       Yukun pg_dump SONRASINDAKI yarisi hic olculmuyordu.
  //   (b) Girdiyi `kabukKodu` ile soyuyordu. Bu DOGRU gorunuyor ama degil:
  //       tek tirnakli yukun icindeki `#` satirini DIS kabuk yorum SAYMAZ,
  //       duz metin olarak okur — ve oradaki bir kesme isareti dizgiyi
  //       ERKEN KAPATIR, butun betik sozdizimi hatasi verir.
  // KANIT: deploy.sh yukundeki budama yorumlarina Turkce kesme isareti
  // konuldu; `bash -n` KIRILDI, guvenlik-paket1 F17 KIRMIZI oldu, Y2 YESIL
  // kaldi. Artik olcum HAM metin uzerinde ve yukun TAMAMI icin yapiliyor.
  //
  // Y1 (umask) BILEREK soyulmus metni kullanmaya devam ediyor: yuku IC kabuk
  // calistirir ve IC kabuk icin `#` gercekten yorumdur.
  console.log('\n── Y · DUMP IZINLERI (tum pg_dump cagrilari) ──');
  const betikler = dosyalar(path.join(KOK, 'scripts')).filter((p) => p.endsWith('.sh'));
  // Kapanis tirnagindan SONRA gelmesi kabul edilen karakterler: hepsi kabuk
  // siniri. Turkce ek kesmesi (deploy + kesme + un) HARF birakir ve elenir.
  const SINIR_SONRASI = [' ', '\t', '\n', ')', '"', ';', '|', '&', ''];
  const dumpNoktalari: Array<{
    dosya: string;
    satir: number;
    umaskVar: boolean;
    tekTirnakli: boolean;
    tirnakTemiz: boolean;
    tanik: string;
  }> = [];
  for (const p of betikler) {
    // HAM metin: yorum soyulmaz. `pg_dump -h db` bugun hicbir yorumda GECMIYOR
    // (olculdu 21.09, 5 cagrinin 5'i kod). Yorumda gecmeye baslarsa bu blok
    // onu da bir dump noktasi sayar ve GORUNUR sekilde kirmizi verir.
    const ham = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
    const re = /pg_dump -h db/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(ham))) {
      const once = ham.slice(0, m.index);
      const acici = Math.max(once.lastIndexOf("sh -c '"), once.lastIndexOf('sh -c "'));
      const tekTirnakli = acici !== -1 && once.slice(acici, acici + 7) === "sh -c '";
      const baglam = acici !== -1 ? once.slice(acici) : once;
      let tirnakTemiz = true;
      let tanik = '';
      if (tekTirnakli) {
        const yukBas = acici + "sh -c '".length;
        // Kabugun GERCEKTEN gordugu yuk: acici -> bir sonraki tek tirnak.
        // Tek tirnakli dizgide kacis YOKTUR; ilk tirnak dizgiyi kapatir.
        const kapanis = ham.indexOf("'", yukBas);
        const sonraki = kapanis === -1 ? '' : ham.charAt(kapanis + 1);
        const pgUlasti = kapanis === -1 || kapanis > m.index;
        const sinirTemiz = kapanis !== -1 && SINIR_SONRASI.includes(sonraki);
        tirnakTemiz = pgUlasti && sinirTemiz;
        if (!tirnakTemiz && kapanis !== -1) {
          const satirBas = ham.lastIndexOf('\n', kapanis) + 1;
          tanik = ham.slice(satirBas, kapanis + 8).trim();
        }
      }
      dumpNoktalari.push({
        dosya: path.relative(KOK, p).split(path.sep).join('/'),
        satir: once.split('\n').length,
        // Oncesinde tirnak da olabilir: `sh -c "umask 077; ...` (bekci tek satir yuk).
        // IC kabuk icin `#` yorumdur -> baglam burada SOYULARAK olculur.
        umaskVar: /(^|[\s;("'])umask 077\b/.test(kabukKodu(baglam)),
        tekTirnakli,
        tirnakTemiz,
        tanik,
      });
    }
  }
  check(
    'Y-OLCUT tarama calisti (en az 5 pg_dump noktasi: backup, deploy, sir-dondur, geri-yukle, bekci)',
    dumpNoktalari.length >= 5,
    `bulunan=${JSON.stringify(dumpNoktalari.map((d) => `${d.dosya}:${d.satir}`))}`,
  );
  // FIXTURE KANITI: Y2 yalniz TEK TIRNAKLI yukleri olcer. Hepsi cift tirnakli
  // olsaydi Y2 hicbir sey olcmeden yesil kalirdi. Bugun uc tane var:
  // deploy.sh, geri-yukle.sh, sir-dondur.sh (olculdu 21.09).
  check(
    'Y-OLCUT2 en az uc TEK TIRNAKLI dump yuku olculuyor (yoksa Y2 bos kume uzerinde yesil verir)',
    dumpNoktalari.filter((d) => d.tekTirnakli).length >= 3,
    `tek tirnakli=${JSON.stringify(dumpNoktalari.filter((d) => d.tekTirnakli).map((d) => `${d.dosya}:${d.satir}`))}`,
  );
  const umasksiz = dumpNoktalari.filter((d) => !d.umaskVar);
  check(
    'Y1 her pg_dump ayni calisma baglaminda umask 077 ile doguyor (dump 0600)',
    umasksiz.length === 0,
    `umask'siz=${JSON.stringify(umasksiz.map((d) => `${d.dosya}:${d.satir}`))}`,
  );
  const tirnakKirik = dumpNoktalari.filter((d) => !d.tirnakTemiz);
  check(
    'Y2 tek tirnakli dump yukunun TAMAMI kabuga gidiyor (kesme isareti yuku erken kapatmiyor)',
    tirnakKirik.length === 0,
    `kirik=${JSON.stringify(tirnakKirik.map((d) => `${d.dosya}:${d.satir} → ${d.tanik}`))}`,
  );

  console.log(`\n${'='.repeat(64)}\nSUNUCU URUNLERI: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
  if (failed) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exit(1);
  }
}

main();
