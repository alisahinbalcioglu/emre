#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  SUNUCU URUNLERI KURULUMU — Faz 0 sertlestirmesinin depodaki tek kaynagi
#  (devir Gorev 6, 10.09.2026)
#
#  KULLANIM (sunucuda, root):
#      cd /opt/metaprice
#      bash scripts/sunucu/kur.sh
#      bash scripts/sunucu/kur.sh --uygula
#
#  Varsayilan mod KONTROLDUR ve HICBIR SEY DEGISTIRMEZ: depodaki dosyalarla
#  sunucudakileri md5 ve izin duzeyinde karsilastirir, ufw kurallarini ve
#  zamanlayicilari olcer, farklari listeler.
#
#  NEDEN BETIK: bu dosyalar 06-07.09'da sunucuda ELLE yazildi ve depoda
#  YOKTU (olculdu 09.09: git ls-files aramasi bos). Sunucu kaybolsa yedekler
#  geri gelirdi ama sertlestirme gelmezdi. Artik depo kaynak, sunucu kopya.
#
#  NE YAPAR (--uygula):
#    1. Yalniz md5 veya izni FARKLI olan dosyayi degistirir; ayni olana
#       dokunmaz (tekrar kosmak guvenli). Eski surumu once
#       /var/backups/metaprice-kur altina zaman damgasiyla kopyalar.
#    2. HER kosumda `sshd -t` ve `fail2ban-client -t` ile dogrular (yalniz
#       degisen dosyada degil — yarida kalmis bir onceki kosumu da yakalar).
#       Dogrulama gecmezse BU kosumda kurulan tum dosyalari geri alir ve
#       DURUR: gecersiz yapilandirmayla yeniden yukleme erisimi kesebilir.
#    3. Dogrulama gecerse HER kosumda daemon-reload, ssh ve fail2ban yeniden
#       yuklenir, iki zamanlayici etkinlestirilir (tekrar kosmak yakinsar).
#    4. Kontrol modu dosyalara ek olarak yapilandirmanin GECERLILIGINI ve
#       ssh/fail2ban'in calistigini da olcer.
#    5. ufw: once OpenSSH izni, SONRA etkinlestirme. Ters sira SSH'i keser.
#    6. Sonunda kontrol modunu yeniden kosar ve onun sonucuyla cikar.
#
#  ⚠ DOSYA ADLARINDAKI 00- ONEKI IKI YERDE ZIT ANLAM TASIR:
#    sshd_config.d  -> ILK okunan deger KAZANIR. 50-cloud-init.conf
#                      "PasswordAuthentication yes" yazdigi icin 00- SART.
#    fail2ban/jail.d -> SONRA okunan EZER. 00- burada "en once, en zayif"
#                      demektir; bugun baska jail.d dosyasi olmadigi icin
#                      sorun yok. "Tutarlilik" adina ikisini ayni mantikla
#                      yeniden adlandirmayin.
#
#  CIKIS KODU (KD8): 0 = depo ile sunucu ayni · 1 = fark var / uygulama
#  basarisiz · 2 = on kosul yok
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

MOD="${1:---kontrol}"
case "$MOD" in
  --kontrol|--uygula) ;;
  *) echo "Bilinmeyen mod: $MOD  (--kontrol | --uygula)"; exit 2 ;;
esac

# kaynak|hedef|izin — TEK LISTE. Kapi (test:sunucu) bu listeyi dizinle
# iki yonlu karsilastirir: listede olup dosyasi olmayan ya da dosyasi olup
# listede olmayan her kalem kirmizidir.
KALEMLER="
sbin/metaprice-nobetci.sh|/usr/local/sbin/metaprice-nobetci.sh|755
sbin/metaprice-yedek-bekci.sh|/usr/local/sbin/metaprice-yedek-bekci.sh|755
ssh/00-sertlestirme.conf|/etc/ssh/sshd_config.d/00-sertlestirme.conf|644
fail2ban/00-metaprice.local|/etc/fail2ban/jail.d/00-metaprice.local|644
systemd/metaprice-nobetci.service|/etc/systemd/system/metaprice-nobetci.service|644
systemd/metaprice-nobetci.timer|/etc/systemd/system/metaprice-nobetci.timer|644
systemd/metaprice-yedek-bekci.service|/etc/systemd/system/metaprice-yedek-bekci.service|644
systemd/metaprice-yedek-bekci.timer|/etc/systemd/system/metaprice-yedek-bekci.timer|644
"
ZAMANLAYICILAR="metaprice-nobetci.timer metaprice-yedek-bekci.timer"
UFW_KURALLARI="OpenSSH 80/tcp 443/tcp"
DURUM_DIZINI=/var/lib/metaprice

# ── ADIM 0 · ON KOSUL ────────────────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then echo "ON KOSUL YOK — root olarak kosun."; exit 2; fi
for k in systemctl ufw fail2ban-client sshd md5sum install; do
  command -v "$k" >/dev/null 2>&1 || { echo "ON KOSUL YOK — komut bulunamadi: $k"; exit 2; }
done
while IFS='|' read -r kaynak hedef izin; do
  [ -z "$kaynak" ] && continue
  [ -f "$kaynak" ] || { echo "ON KOSUL YOK — depoda kaynak dosya yok: scripts/sunucu/$kaynak"; exit 2; }
done <<< "$KALEMLER"

# ── KONTROL ──────────────────────────────────────────────────────────────────
kontrol() {
  local fark=0 kaynak hedef izin km hm hi
  echo "── dosyalar (depo -> sunucu) ──"
  while IFS='|' read -r kaynak hedef izin; do
    [ -z "$kaynak" ] && continue
    km=$(md5sum "$kaynak" | cut -d' ' -f1)
    if [ ! -f "$hedef" ]; then
      echo "  EKSIK   $hedef"; fark=$((fark+1)); continue
    fi
    hm=$(md5sum "$hedef" | cut -d' ' -f1)
    hi=$(stat -c %a "$hedef")
    if [ "$km" != "$hm" ]; then
      echo "  FARKLI  $hedef  (depo ${km:0:8} / sunucu ${hm:0:8})"; fark=$((fark+1))
    elif [ "$hi" != "$izin" ]; then
      echo "  IZIN    $hedef  (beklenen $izin / gorulen $hi)"; fark=$((fark+1))
    else
      echo "  AYNI    $hedef"
    fi
  done <<< "$KALEMLER"

  echo "── zamanlayicilar ──"
  for z in $ZAMANLAYICILAR; do
    if systemctl is-enabled --quiet "$z" && systemctl is-active --quiet "$z"; then
      echo "  CALISIYOR  $z"
    else
      echo "  KAPALI     $z"; fark=$((fark+1))
    fi
  done

  echo "── ufw ──"
  # Cikti once degiskene alinir: `set -o pipefail` altinda `ufw status | head`
  # borusu erken kapanirsa ufw SIGPIPE alir ve etkin ufw ETKIN DEGIL gorunur.
  local ufw_durum
  ufw_durum=$(ufw status 2>/dev/null || true)
  if printf '%s\n' "$ufw_durum" | grep -q '^Status: active'; then
    echo "  etkin"
  else
    echo "  ETKIN DEGIL"; fark=$((fark+1))
  fi
  local eklenen
  eklenen=$(ufw show added 2>/dev/null || true)
  for kural in $UFW_KURALLARI; do
    if printf '%s\n' "$eklenen" | grep -qx "ufw allow $kural"; then
      echo "  izinli  $kural"
    else
      echo "  YOK     $kural"; fark=$((fark+1))
    fi
  done

  # Dosya md5'i ayni olsa da diskteki yapilandirma GECERSIZ olabilir (yarida
  # kalan bir --uygula). "0 fark" demeden once gecerliligi de olc.
  echo "── yapilandirma gecerliligi ──"
  if sshd -t 2>/dev/null; then echo "  gecerli   sshd"; else echo "  GECERSIZ  sshd"; fark=$((fark+1)); fi
  if fail2ban-client -t >/dev/null 2>&1; then echo "  gecerli   fail2ban"; else echo "  GECERSIZ  fail2ban"; fark=$((fark+1)); fi

  echo "── calisan servisler ──"
  # ssh socket-activated: soket ya da servis aktifse erisim var.
  if systemctl is-active --quiet ssh.socket || systemctl is-active --quiet ssh; then
    echo "  calisiyor ssh"
  else
    echo "  DURMUS    ssh"; fark=$((fark+1))
  fi
  if systemctl is-active --quiet fail2ban; then echo "  calisiyor fail2ban"; else echo "  DURMUS    fail2ban"; fark=$((fark+1)); fi

  echo "── durum dizini ──"
  if [ -d "$DURUM_DIZINI" ]; then echo "  var  $DURUM_DIZINI"; else echo "  YOK  $DURUM_DIZINI"; fark=$((fark+1)); fi

  echo ""
  if [ "$fark" -eq 0 ]; then
    echo "KONTROL: depo ile sunucu AYNI (0 fark)"
    return 0
  fi
  echo "KONTROL: $fark fark — uygulamak icin: bash scripts/sunucu/kur.sh --uygula"
  return 1
}

if [ "$MOD" = "--kontrol" ]; then
  kontrol && exit 0 || exit 1
fi

# ── UYGULA ───────────────────────────────────────────────────────────────────
DAMGA=$(date +%Y%m%d-%H%M%S)
YEDEK_DIZINI="/var/backups/metaprice-kur/$DAMGA"
KURULAN=""

yedekle() {
  install -d -m 700 "$YEDEK_DIZINI"
  cp -p "$1" "$YEDEK_DIZINI/$(echo "$1" | tr '/' '_')"
}

echo "── dosyalar kuruluyor ──"
while IFS='|' read -r kaynak hedef izin; do
  [ -z "$kaynak" ] && continue
  if [ -f "$hedef" ] && [ "$(md5sum "$kaynak" | cut -d' ' -f1)" = "$(md5sum "$hedef" | cut -d' ' -f1)" ] \
     && [ "$(stat -c %a "$hedef")" = "$izin" ]; then
    echo "  dokunulmadi  $hedef"
    continue
  fi
  if [ -f "$hedef" ]; then yedekle "$hedef"; fi
  install -D -m "$izin" -o root -g root "$kaynak" "$hedef"
  KURULAN="$KURULAN $hedef"
  echo "  kuruldu      $hedef"
done <<< "$KALEMLER"

# Bu kosumda kurulan HER dosyayi eski haline dondurur (onceden yoksa siler).
geri_al() {
  local h yedek
  for h in $KURULAN; do
    yedek="$YEDEK_DIZINI/$(echo "$h" | tr '/' '_')"
    if [ -f "$yedek" ]; then cp -p "$yedek" "$h"; else rm -f "$h"; fi
  done
}

install -d -m 755 "$DURUM_DIZINI"

# ── DOGRULAMA — HER KOSUMDA ─────────────────────────────────────────────────
# ⚠ 13.09 incelemesi: onceki surum dogrulamayi yalniz "bu kosumda degisen"
# dosyaya bagliyordu. Yarida kalan bir kosumdan sonra ikinci kosum dosyalari
# md5-ayni gorup dogrulamayi ve yeniden yuklemeyi atliyor, kontrol yine
# "0 fark" diyordu. Artik ikisi de her kosumda yapilir.
echo "── dogrulama ──"
if ! sshd -t; then
  geri_al
  echo "❌ sshd yapilandirmasi GECERSIZ — bu kosumda kurulanlar GERI ALINDI:${KURULAN:- (yok)} · yeniden yukleme YAPILMADI."
  exit 1
fi
if ! fail2ban-client -t >/dev/null 2>&1; then
  geri_al
  echo "❌ fail2ban yapilandirmasi GECERSIZ — bu kosumda kurulanlar GERI ALINDI:${KURULAN:- (yok)} · yeniden yukleme YAPILMADI."
  exit 1
fi
echo "  sshd ve fail2ban yapilandirmasi gecerli"

# ── YENIDEN YUKLEME — HER KOSUMDA (idempotent) ───────────────────────────────
systemctl daemon-reload
# ssh socket-activated (olculdu 13.09): servis beklemedeyse duz reload hata
# verir; try-reload-or-restart calisiyorsa yeniden yukler, calismiyorsa bir
# sonraki baglanti zaten yeni yapilandirmayi okur.
systemctl try-reload-or-restart ssh
systemctl reload-or-restart fail2ban
for z in $ZAMANLAYICILAR; do
  systemctl enable --now "$z"
done
echo "  daemon-reload · ssh · fail2ban yeniden yuklendi · zamanlayicilar etkin"

echo "── ufw ──"
# ⚠ SIRA: OpenSSH izni etkinlestirmeden ONCE. Ters sira oturumu keser.
for kural in $UFW_KURALLARI; do
  ufw allow "$kural" >/dev/null
done
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
UFW_SIMDI=$(ufw status 2>/dev/null || true)
if ! printf '%s\n' "$UFW_SIMDI" | grep -q '^Status: active'; then
  ufw --force enable >/dev/null
  echo "  ufw etkinlestirildi"
fi

echo ""
kontrol && exit 0 || exit 1
