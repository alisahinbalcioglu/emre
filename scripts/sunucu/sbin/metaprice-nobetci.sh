#!/bin/bash
# MetaPriceX Faz 0.7 — sistem nobetcisi.
# Sunucuda hicbir izleme ajani yoktu: disk %84'e cikti ve kimse haber almadi.
# Bu betik esikleri olcer, journal'a yazar ve /var/lib/metaprice/durum.json'a
# makine-okunur ozet birakir. UptimeRobot gibi bir dis servis bagladiginizda
# uyarilar telefona duser; o zamana kadar 'journalctl -t metaprice-nobetci'.
set -u
DISK_ESIK=80          # yuzde
BELLEK_ESIK=90        # yuzde
YEDEK_ESIK=$((26*3600))

DISK=$(df --output=pcent / | tail -1 | tr -dc '0-9')
BELLEK=$(free | awk '/^Mem:/ {printf "%d", ($2-$7)/$2*100}')
KONTEYNER=$(docker ps -q 2>/dev/null | wc -l)
# Coken birimler. BILINEN_ZARARSIZ listesi ayri sayilir: bu birimler
# uyari uretir ama "sagliksiz" demez. Amac alarm yorgunlugunu onlemek —
# surekli bagiran alarm dinlenmez.
#
# cloud-init-hotplugd: Hetzner hotplug kancasi. OLCULDU (07.09): bugun BIR KEZ
# coktu (10:08) ve o an bir deploy suruyordu; docker veth arayuzu yaratip
# silince udev bunu hotplug sanip kancayi tetikliyor, kanca da Hetzner
# metadata'sini uzlastiramayip cokuyor. "Her deploy'da tekrarlar" DEMIYORUM —
# uc deploy'un yalniz birinde gorundu. Bu sunucuda ozel ag
# YOK, yani kancanin yapacagi gercek bir is de yok. MASKELENMEDI: ileride
# bir Hetzner ozel agi eklenirse servis calismaya devam etsin. Cokerse
# uyari cikar, ama "sagliksiz" bayragini kaldirmaz.
BILINEN_ZARARSIZ="cloud-init-hotplugd.service"
COKEN_LISTE=$(systemctl --failed --no-legend --no-pager 2>/dev/null | awk '{print $2}')
COKEN=0; COKEN_ZARARSIZ=0
for b in $COKEN_LISTE; do
  case " $BILINEN_ZARARSIZ " in
    *" $b "*) COKEN_ZARARSIZ=$((COKEN_ZARARSIZ+1)) ;;
    *)        COKEN=$((COKEN+1)) ;;
  esac
done
SON=$(ls -t /opt/metaprice/backups/metaprice-*.sql.gz /opt/metaprice/backups/bekci-*.sql.gz 2>/dev/null | head -1)
YEDEK_YAS=$([ -n "$SON" ] && echo $(( $(date +%s) - $(stat -c %Y "$SON") )) || echo 999999)

# Denetim kaydi (10.09.2026, devir Gorev 7). Yonetici islemleri artik denetim
# satiriyla AYNI transaction'da: satir yazilamazsa islem geri alinir ve backend
# `DENETIM-YAZILAMADI` etiketiyle HATA loglar (admin.service.ts). Bu sayac o
# etiketi sayar. Olculdu 13.09: Nest Logger satiri ANSI renkli ama etiket
# bolunmuyor, grep sayabiliyor. Log json-file oldugu icin journald'e DUSMEZ,
# kaynak `docker logs`tur.
# Pencere 65 dk: timer saatlik, 5 dk bindirme ayni olayi iki kez raporlayabilir
# ama KACIRMAZ. SINIR: konteyner yeniden yaratilinca (deploy) docker logu
# sifirlanir; deploydan onceki son saatteki bir hata kacabilir.
DENETIM_HATA=$(docker logs --since 65m metaprice-backend-1 2>&1 | grep -c 'DENETIM-YAZILAMADI' | tr -dc '0-9')
DENETIM_HATA=${DENETIM_HATA:-0}

REBOOT=$([ -f /var/run/reboot-required ] && echo 1 || echo 0)
SORUN=""
[ "$DISK"      -ge "$DISK_ESIK"   ] && SORUN="$SORUN disk=%$DISK"
[ "$BELLEK"    -ge "$BELLEK_ESIK" ] && SORUN="$SORUN bellek=%$BELLEK"
[ "$KONTEYNER" -lt 6              ] && SORUN="$SORUN konteyner=$KONTEYNER/6"
[ "$COKEN"     -gt 0              ] && SORUN="$SORUN coken_unit=$COKEN"
[ "$COKEN_ZARARSIZ" -gt 0 ] && logger -t metaprice-nobetci -p user.notice "bilinen-zararsiz coken birim: $COKEN_ZARARSIZ (cloud-init-hotplugd)"
[ "$YEDEK_YAS" -ge "$YEDEK_ESIK"  ] && SORUN="$SORUN yedek_yasi=$((YEDEK_YAS/3600))sa"
[ "$REBOOT"    = "1"               ] && SORUN="$SORUN yeniden_baslatma_gerekiyor(cekirdek_yamasi_askida)"
[ "$DENETIM_HATA" -gt 0           ] && SORUN="$SORUN denetim_yazilamadi=$DENETIM_HATA"

cat > /var/lib/metaprice/durum.json <<JSON
{"zaman":"$(date -Is)","disk_yuzde":$DISK,"bellek_yuzde":$BELLEK,"konteyner":$KONTEYNER,"coken_unit":$COKEN,"coken_unit_zararsiz":$COKEN_ZARARSIZ,"yedek_yasi_saat":$((YEDEK_YAS/3600)),"reboot_gerek":$([ "$REBOOT" = 1 ] && echo true || echo false),"denetim_yazilamadi_1sa":$DENETIM_HATA,"saglikli":$([ -z "$SORUN" ] && echo true || echo false)}
JSON

if [ -z "$SORUN" ]; then
  logger -t metaprice-nobetci -p user.info "TAMAM disk=%$DISK bellek=%$BELLEK konteyner=$KONTEYNER/6 yedek=$((YEDEK_YAS/3600))sa"
else
  logger -t metaprice-nobetci -p user.err "UYARI:$SORUN"
fi
