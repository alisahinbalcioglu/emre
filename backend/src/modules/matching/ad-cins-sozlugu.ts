// ────────────────────────────────────────────
// MEKANIK MALZEME AD-CINS SOZLUGU (Seed v1.0 · 13.07.2026)
// KAYNAK: Mekanik_Malzeme_AD_CINS_Sozlugu.xlsx — 3 Etiket Modeli baslangic
// sozlugu. Bu dosya generator ile Excel'den uretildi; elle guncellenebilir.
// AD eslesmesi: normalize contains, EN UZUN kazanir (TerminologyAlias S2 ile ayni).
// mapTo mevcut ailelere yapilan girisler burada YOK (regex sahibi);
// buradakiler YENI aile slug'laridir — MATERIAL_TYPE_TAGS'e katilir (AD=must).
// ────────────────────────────────────────────

export interface AdSozlukGirdisi {
  slug: string;
  ad: string;
  grup: string;
  /** normalize edilmis kanonik + es anlamli desenler (contains) */
  patterns: string[];
  /** cap sistemi DN iceriyor → celik DN↔inc cevrimi uygulanir */
  dnli: boolean;
}

export const AD_SOZLUGU: AdSozlukGirdisi[] = [
  // ════════════════════════════════════════════════════════════════
  // SEED v1.1 (15.07.2026) — 12 GERCEK yapilandirilmis fiyat listesi
  // (15487 satir) uzerinde olculen aile bosluklari kapatildi.
  // Once %20 satir 'belirsiz' = ESLESMEYE GIREMEZ durumdaydi.
  // Asagidaki girdiler o olcumden cikti; her birinin yaninda kac satiri
  // kurtardigi ve hangi markadan geldigi yazili.
  // ════════════════════════════════════════════════════════════════
  { slug: 'aktuator', ad: 'Aktüatör', grup: 'VANA / OTOMASYON', dnli: false, patterns: ['aktuator', 'actuator', 'disli kutusu', 'vana aktuatoru', 'elektrikli aktuator', 'pnomatik aktuator'] }, // Duyar 22
  { slug: 'aski', ad: 'Askı tiji', grup: 'İZOLASYON / ASKI', dnli: false, patterns: ['aski tiji', 'tij', 'aski cubugu m8', 'aski cubugu m10', 'konsol', 'boru konsolu', 'destek profili', 'sismik aski', 'deprem askisi'] },
  { slug: 'conta', ad: 'Conta', grup: 'BAĞLANTI ELEMANI', dnli: false, patterns: ['conta', 'klingrit', 'klingrit conta', 'flans contasi', 'yedek conta'] }, // Sardogan 29 + Ayvaz
  { slug: 'dubel', ad: 'Dübel', grup: 'BAĞLANTI ELEMANI', dnli: false, patterns: ['dubel', 'celik dubel', 'plastik dubel', 'sac gomlekli dubel', 'kimyasal dubel'] }, // Norm 38
  { slug: 'seviye-elektrodu', ad: 'Seviye elektrodu', grup: 'OTOMASYON', dnli: false, patterns: ['seviye elektrodu', 'kapasitif seviye elektrodu', 'elektrod', 'elektrot'] }, // Ayvaz 28
  // Y-suzgec / strainer. 'suzgec' ailesi YER SUZGECIDIR (banyo) — ayri urun.
  // Desen 'pislik tutucu' (12 karakter) yalin 'suzgec'ten uzun → catismaz.
  { slug: 'pislik-tutucu', ad: 'Pislik tutucu', grup: 'VANA / EKİPMAN', dnli: true, patterns: ['pislik tutucu', 'pislik tutucular', 'y suzgec', 'y-suzgec', 'y tipi suzgec', 'strainer', 'filtre pislik tutucu'] }, // Ayvaz 60 + Duyar 44
  { slug: 'baca', ad: 'Paslanmaz baca', grup: 'ISITMA', dnli: false, patterns: ['paslanmaz baca', 'cift cidarli baca', 'baca seti'] },
  { slug: 'basinc-anahtari', ad: 'Basınç anahtarı', grup: 'YANGIN', dnli: false, patterns: ['basinc anahtari', 'pressure switch', 'presostat'] },
  { slug: 'boyler', ad: 'Boyler', grup: 'ISITMA', dnli: false, patterns: ['boyler', 'serpantinli boyler', 'cift serpantinli boyler', 'akumulasyon tanki'] },
  { slug: 'brulor', ad: 'Brülör', grup: 'ISITMA', dnli: false, patterns: ['brulor', 'dogalgaz bruloru', 'iki kademeli brulor', 'modulasyonlu brulor'] },
  { slug: 'chiller', ad: 'Chiller', grup: 'SOĞUTMA / KLİMA', dnli: false, patterns: ['chiller', 'su sogutma grubu', 'hava sogutmali chiller', 'vidali chiller', 'scroll chiller'] },
  { slug: 'damper', ad: 'Damper', grup: 'HAVALANDIRMA', dnli: false, patterns: ['damper', 'volum damperi', 'yangin damperi', 'geri donussuz damper', 'motorlu damper'] },
  { slug: 'denge-kabi', ad: 'Denge kabı', grup: 'SIHHİ TESİSAT / EKİPMAN', dnli: true, patterns: ['denge kabi', 'hidrolik denge kabi'] },
  { slug: 'difuzor', ad: 'Difüzör', grup: 'HAVALANDIRMA', dnli: false, patterns: ['difuzor', 'swirl difuzor', 'tavan difuzoru'] },
  { slug: 'esanjor', ad: 'Plakalı eşanjör', grup: 'ISITMA', dnli: false, patterns: ['plakali esanjor', 'contali esanjor', 'lehimli esanjor', 'isi degistirici'] },
  { slug: 'fan', ad: 'Fan', grup: 'HAVALANDIRMA', dnli: false, patterns: ['fan', 'aksiyel fan', 'radyal fan', 'hucreli aspirator', 'cati fani', 'duman egzoz fani', 'jet fan', 'kanal tipi fan'] },
  { slug: 'fancoil', ad: 'Fan-coil', grup: 'SOĞUTMA / KLİMA', dnli: false, patterns: ['fan-coil', 'fancoil', 'fan coil', 'kasetli fan-coil', 'gizli tavan tipi fan-coil', 'duvar tipi fan-coil'] },
  { slug: 'genlesme-tanki', ad: 'Genleşme tankı', grup: 'ISITMA', dnli: false, patterns: ['genlesme tanki', 'kapali genlesme deposu', 'membranli tank', 'ekspansiyon'] },
  { slug: 'hidrant', ad: 'Yangın hidrantı', grup: 'YANGIN', dnli: true, patterns: ['yangin hidranti', 'yerustu hidrant', 'yeralti hidrant', 'hidrant'] },
  { slug: 'hidrofor', ad: 'Hidrofor', grup: 'POMPALAR', dnli: false, patterns: ['hidrofor', 'paket hidrofor', 'hidrofor grubu'] },
  { slug: 'itfaiye-agzi', ad: 'İtfaiye bağlantı ağzı', grup: 'YANGIN', dnli: true, patterns: ['itfaiye baglanti agzi', 'itfaiye su alma agzi', 'siamese connection'] },
  // S5 (Aksa gercek dosya): "Vana İstasyonu Kabini" sondan-cozumde 'vana'ya
  // dusuyordu (YANLIS POZITIF — kabin bir vana degildir). Bas isim 'kabin'
  // sondadir, once o cozulur; vana adaylari artik onerilmez.
  { slug: 'kabin', ad: 'Kabin', grup: 'SIHHİ TESİSAT / EKİPMAN', dnli: false, patterns: ['kabin', 'vana istasyonu kabini', 'koruma kabini'] },
  { slug: 'kalorimetre', ad: 'Kalorimetre', grup: 'SIHHİ TESİSAT / EKİPMAN', dnli: true, patterns: ['kalorimetre', 'isi sayaci'] },
  { slug: 'kanal', ad: 'Hava kanalı', grup: 'HAVALANDIRMA', dnli: false, patterns: ['kanal', 'hava kanali', 'galvaniz kanal', 'dikdortgen kanal', 'spiral yuvarlak kanal', 'flexible hava kanali', 'flexible kanal', 'izoleli flexible'] },
  // YALIN AD SART: desenler yalniz cok-kelimeli ifadeler tasiyordu, aile
  // isminin KENDISI yoktu → "Somunlu Kelepçe" (Norm, 293 satir) ailesiz
  // kaliyordu. "En uzun desen kazanir" kurali sayesinde yalin ad eklemek
  // ozel ifadeleri BOZMAZ (orn. 'boru kelepcesi' hala 'kelepce'yi yener).
  { slug: 'kelepce', ad: 'Boru kelepçesi', grup: 'İZOLASYON / ASKI', dnli: false, patterns: ['kelepce', 'boru kelepcesi', 'kaucuklu kelepce', 'aski kelepcesi', 'somunlu kelepce', 'havalandirma kelepcesi'] },
  { slug: 'klima', ad: 'Split klima', grup: 'SOĞUTMA / KLİMA', dnli: false, patterns: ['split klima', 'duvar tipi klima', 'inverter klima'] },
  { slug: 'klima-santrali', ad: 'Klima santrali', grup: 'SOĞUTMA / KLİMA', dnli: false, patterns: ['klima santrali', 'ahu', 'hucreli klima santrali', 'isi geri kazanimli santral'] },
  // YAZIM VARYANTI (S5): sahada cift-L 'kollektör' cok yaygin ("Trafolar
  // Kollektör Grubu") — contains 'kolektor' cift-L'yi YAKALAMAZ, ayri desen.
  { slug: 'kolektor', ad: 'Kolektör', grup: 'ISITMA', dnli: true, patterns: ['kolektor', 'kollektor', 'celik kolektor', 'dagitim kolektoru'] },
  { slug: 'kompansator', ad: 'Kompansatör', grup: 'SIHHİ TESİSAT / EKİPMAN', dnli: true, patterns: ['kompansator', 'eksenel metal koruklu kompansator', 'kaucuk kompansator', 'titresim yutucu'] },
  { slug: 'kondenstop', ad: 'Kondenstop', grup: 'SIHHİ TESİSAT / EKİPMAN', dnli: true, patterns: ['kondenstop', 'buhar kapani', 'termodinamik kondenstop', 'samandirali kondenstop', 'termostatik kondenstop'] },
  { slug: 'kuru-sogutucu', ad: 'Kuru soğutucu', grup: 'SOĞUTMA / KLİMA', dnli: false, patterns: ['kuru sogutucu', 'dry cooler'] },
  { slug: 'manometre', ad: 'Manometre', grup: 'SIHHİ TESİSAT / EKİPMAN', dnli: false, patterns: ['manometre', 'basinc gostergesi', 'gliserinli manometre'] },
  { slug: 'menfez', ad: 'Menfez', grup: 'HAVALANDIRMA', dnli: false, patterns: ['menfez', 'egzoz menfezi', 'emis menfezi', 'lineer menfez', 'kapi menfezi'] },
  // S5 (Aksa gercek dosya, 9 satir): su sisi / water-spray sistemlerinin
  // puskurtme nozullari — sprinkler DEGIL, ayri ailedir.
  { slug: 'nozul', ad: 'Su püskürtme nozulu', grup: 'YANGIN', dnli: false, patterns: ['nozul', 'nozzle', 'su puskurtme nozulu', 'puskurtme nozulu'] },
  { slug: 'panjur', ad: 'Panjur', grup: 'HAVALANDIRMA', dnli: false, patterns: ['panjur', 'dis hava panjuru'] },
  { slug: 'rooftop', ad: 'Rooftop', grup: 'SOĞUTMA / KLİMA', dnli: false, patterns: ['rooftop', 'cati tipi paket klima'] },
  // 'kalorimetre' ('isi sayaci') yalin 'sayac'tan UZUN oldugu icin onu yener —
  // dogrulandi: "kalorimetre sayaci" → kalorimetre, "buhar sayaci" → sayac.
  { slug: 'sayac', ad: 'Su sayacı', grup: 'SIHHİ TESİSAT / EKİPMAN', dnli: true, patterns: ['sayac', 'su sayaci', 'mekanik su sayaci', 'ultrasonik su sayaci', 'buhar sayaci'] },
  // YAZIM VARYANTI: sozluk 'seperator' yazmis, gercek listeler 'separatör'
  // yaziyor (Ayvaz "Buhar separatörü", 36 satir) — ikisi de desen.
  { slug: 'seperator', ad: 'Hava seperatörü', grup: 'SIHHİ TESİSAT / EKİPMAN', dnli: true, patterns: ['seperator', 'separator', 'hava seperatoru', 'hava separatoru', 'buhar seperatoru', 'buhar separatoru', 'mikro kabarcik ayirici', 'tortu seperatoru', 'manyetik seperator', 'camur ayirici'] },
  { slug: 'seviye-gostergesi', ad: 'Seviye göstergesi', grup: 'SIHHİ TESİSAT / EKİPMAN', dnli: false, patterns: ['seviye gostergesi', 'manyetik seviye gostergesi', 'su seviye gostergesi'] },
  { slug: 'sogutma-kulesi', ad: 'Soğutma kulesi', grup: 'SOĞUTMA / KLİMA', dnli: false, patterns: ['sogutma kulesi', 'acik devre kule', 'kapali devre kule'] },
  { slug: 'sprinkler-aksesuar', ad: 'Sprinkler rozeti', grup: 'YANGIN', dnli: false, patterns: ['sprinkler rozeti', 'rozet', 'sprinkler koruma kafesi', 'koruma kafesi'] },
  { slug: 'susturucu', ad: 'Susturucu', grup: 'HAVALANDIRMA', dnli: false, patterns: ['susturucu', 'kulisli susturucu'] },
  { slug: 'suzgec', ad: 'Yer süzgeci', grup: 'SIHHİ TESİSAT / EKİPMAN', dnli: false, patterns: ['yer suzgeci', 'suzgec', 'paslanmaz suzgec', 'cati suzgeci'] },
  { slug: 'temizleme-kapagi', ad: 'Temizleme kapağı', grup: 'SIHHİ TESİSAT / EKİPMAN', dnli: false, patterns: ['temizleme kapagi', 'muayene kapagi'] },
  { slug: 'termometre', ad: 'Termometre', grup: 'SIHHİ TESİSAT / EKİPMAN', dnli: false, patterns: ['termometre', 'sicaklik gostergesi', 'daldirma termometre'] },
  { slug: 'vav', ad: 'VAV ünitesi', grup: 'HAVALANDIRMA', dnli: false, patterns: ['vav unitesi', 'vav kutusu', 'degisken debi unitesi'] },
  { slug: 'vrf', ad: 'VRF dış ünite', grup: 'SOĞUTMA / KLİMA', dnli: false, patterns: ['vrf', 'vrv', 'vrf dis unite', 'vrv dis unite', 'vrf ic unite', 'vrv ic unite', 'kaset tipi ic unite', 'kanal tipi ic unite'] },
  { slug: 'yag-ayirici', ad: 'Yağ ayırıcı', grup: 'SIHHİ TESİSAT / EKİPMAN', dnli: false, patterns: ['yag ayirici', 'gres ayirici'] },
  { slug: 'yangin-dolabi', ad: 'Yangın dolabı', grup: 'YANGIN', dnli: false, patterns: ['yangin dolabi', 'yangin hortumu dolabi', 'makarali yangin dolabi'] },
  { slug: 'yangin-tupu', ad: 'Yangın söndürme tüpü', grup: 'YANGIN', dnli: false, patterns: ['yangin sondurme tupu', 'yangin tupu', 'kkt', 'kopuklu sondurucu', 'co2 tup'] },
  { slug: 'zon-kontrol', ad: 'Zon kontrol istasyonu', grup: 'YANGIN', dnli: true, patterns: ['zon kontrol istasyonu', 'test istasyonu', 'zone control'] },
];

/** Mevcut ailelere (sprinkler/hortum/pompa/...) es anlamli zenginlestirme —
 *  AD uretmez, resolveAd bunlari da mevcut slug'a cozer. */
export const AD_ZENGINLESTIRME: AdSozlukGirdisi[] = [
  { slug: 'akis-anahtari', ad: 'Akış anahtarı', grup: 'YANGIN', dnli: true, patterns: ['akis anahtari', 'flow switch', 'paddle tip akis anahtari', 'su akis dedektoru'] },
  { slug: 'armatur', ad: 'Batarya', grup: 'SIHHİ TESİSAT / EKİPMAN', dnli: false, patterns: ['batarya', 'lavabo bataryasi', 'eviye bataryasi', 'dus bataryasi'] },
  { slug: 'hortum', ad: 'Esnek sprinkler bağlantı hortumu', grup: 'YANGIN', dnli: true, patterns: ['esnek sprinkler baglanti hortumu', 'sprinkler hortumu', 'esnek sprink baglantisi', 'flexible sprinkler hose', 'fan-coil baglanti elemani', 'fan-coil baglanti hortumu', 'fancoil flex set', 'esnek metal hortum', 'orgulu hortum', 'flex hortum', 'esnek baglanti', 'dogalgaz hortumu', 'sayac hortumu', 'counterflex hortum'] },
  { slug: 'izolasyon', ad: 'Kauçuk köpüğü boru izolasyonu', grup: 'İZOLASYON / ASKI', dnli: true, patterns: ['kaucuk kopugu boru izolasyonu', 'elastomerik kaucuk izolasyon', 'armaflex tip izolasyon', 'cam yunu boru izolasyonu', 'aluminyum folyolu cam yunu', 'prefabrik boru yalitimi', 'vana ceketi', 'tas yunu vana ceketi', 'izolasyon ceketi', 'kanal izolasyonu', 'cam yunu levha', 'kaucuk levha'] },
  { slug: 'kazan', ad: 'Çelik kazan', grup: 'ISITMA', dnli: false, patterns: ['celik kazan', '3 gecisli kazan', 'sicak su kazani', 'yogusmali kazan', 'kondenzasyonlu kazan', 'duvar tipi yogusmali'] },
  { slug: 'kombi', ad: 'Kombi', grup: 'ISITMA', dnli: false, patterns: ['kombi', 'yogusmali kombi', 'hermetik kombi'] },
  { slug: 'pompa', ad: 'Sirkülasyon pompası', grup: 'POMPALAR', dnli: true, patterns: ['sirkulasyon pompasi', 'islak rotorlu pompa', 'kuru rotorlu pompa', 'inline pompa', 'yangin pompasi grubu', 'nfpa20 pompa grubu', 'elektrikli+dizel+jokey', 'dalgic / drenaj pompasi', 'drenaj pompasi', 'pis su pompasi', 'dalgic pompa', 'flatorlu pompa', 'foseptik terfi istasyonu', 'atik su terfi unitesi'] },
  { slug: 'radyator', ad: 'Panel radyatör', grup: 'ISITMA', dnli: false, patterns: ['panel radyator', 'pkkp radyator', 'tip22', 'tip33', 'havlupan', 'havlu radyatoru'] },
  { slug: 'sprinkler', ad: 'Sprinkler', grup: 'YANGIN', dnli: false, patterns: ['sprinkler', 'sprink', 'sprinkler basligi', 'yagmurlama basligi'] },
  { slug: 'vitrifiye', ad: 'Klozet', grup: 'SIHHİ TESİSAT / EKİPMAN', dnli: false, patterns: ['klozet', 'asma klozet', 'gomme rezervuarli klozet', 'lavabo', 'etajerli lavabo', 'canak lavabo', 'ankastre rezervuar', 'gomme rezervuar'] },
];

/** Sayfa 2 — CINS YUVALARI (Etiket 2). v1: veri olarak saklanir; motor
 *  entegrasyonu yuksek-frekansli tag'lerle sinirli (yivli/wafer/lug/orgulu),
 *  tam cs- yuva motoru v2. */
export const CINS_YUVALARI: { ad: string; yuva: string; degerler: string[] }[] = [
  { ad: 'Siyah çelik boru', yuva: 'Yüzey/kaplama', degerler: ['kırmızı boyalı', 'astarlı (şeffaf verniksiz)', 'boyasız'] },
  { ad: 'Siyah çelik boru', yuva: 'Uç/bağlantı', degerler: ['düz uçlu', 'dişli (manşonlu)', 'yivli (grooved)'] },
  { ad: 'Siyah çelik boru', yuva: 'Standart/et', degerler: ['EN 10255 orta seri', 'SCH10', 'SCH40', 'dikişsiz'] },
  { ad: 'Galvanizli çelik boru', yuva: 'Uç/bağlantı', degerler: ['dişli (manşonlu)', 'düz uçlu', 'yivli'] },
  { ad: 'Galvanizli çelik boru', yuva: 'Standart/et', degerler: ['EN 10255 orta seri', 'SCH40'] },
  { ad: 'Paslanmaz çelik boru', yuva: 'Malzeme sınıfı', degerler: ['AISI 304', 'AISI 316L'] },
  { ad: 'Paslanmaz çelik boru', yuva: 'Bağlantı', degerler: ['pres fitting', 'kaynaklı', 'dişli'] },
  { ad: 'Bakır boru', yuva: 'Sertlik/format', degerler: ['sert (boy)', 'yumuşak (kangal)'] },
  { ad: 'Bakır boru', yuva: 'İzolasyon', degerler: ['izoleli', 'çıplak'] },
  { ad: 'PPR-C boru', yuva: 'Sınıf/yapı', degerler: ['PN 20', 'PN 25', 'alüminyum folyolu (kompozit)', 'elyaflı (fiber)'] },
  { ad: 'PE-X boru', yuva: 'Bariyer', degerler: ['oksijen bariyerli', 'standart'] },
  { ad: 'HDPE PE100 boru', yuva: 'Basınç sınıfı', degerler: ['PN 10', 'PN 16', 'SDR 11', 'SDR 17'] },
  { ad: 'PVC atık su borusu', yuva: 'Et kalınlığı', degerler: ['3,2 mm', 'entegre contalı'] },
  { ad: 'Dirsek', yuva: 'Malzeme/yüzey', degerler: ['siyah (temper döküm)', 'galvanizli', 'çelik (kaynak)', 'paslanmaz', 'pirinç', 'PPR-C', 'PVC'] },
  { ad: 'Dirsek', yuva: 'Açı', degerler: ['90°', '45°'] },
  { ad: 'Dirsek', yuva: 'Bağlantı', degerler: ['dişli', 'kaynak', 'yivli', 'pres', 'soket'] },
  { ad: 'Te', yuva: 'Malzeme/yüzey', degerler: ['siyah (temper döküm)', 'galvanizli', 'çelik (kaynak)', 'paslanmaz', 'pirinç', 'PPR-C', 'PVC'] },
  { ad: 'Te', yuva: 'Tip', degerler: ['eşit', 'redüksiyonlu', 'mekanik (delme)'] },
  { ad: 'Te', yuva: 'Bağlantı', degerler: ['dişli', 'kaynak', 'yivli', 'soket'] },
  { ad: 'Redüksiyon', yuva: 'Malzeme/yüzey', degerler: ['siyah', 'galvanizli', 'çelik (kaynak)', 'paslanmaz', 'PPR-C'] },
  { ad: 'Redüksiyon', yuva: 'Bağlantı', degerler: ['dişli', 'kaynak', 'yivli'] },
  { ad: 'Manşon', yuva: 'Malzeme/yüzey', degerler: ['siyah', 'galvanizli', 'paslanmaz', 'PPR-C'] },
  { ad: 'Manşon', yuva: 'Bağlantı', degerler: ['dişli', 'soket (kaynak)'] },
  { ad: 'Nipel', yuva: 'Malzeme/yüzey', degerler: ['siyah', 'galvanizli', 'paslanmaz', 'pirinç'] },
  { ad: 'Kep', yuva: 'Malzeme/yüzey', degerler: ['siyah', 'galvanizli', 'paslanmaz'] },
  { ad: 'Kep', yuva: 'Bağlantı', degerler: ['dişli', 'kaynak'] },
  { ad: 'Rakor', yuva: 'Malzeme/yüzey', degerler: ['siyah', 'galvanizli', 'pirinç', 'paslanmaz'] },
  { ad: 'Flanş', yuva: 'Malzeme', degerler: ['çelik', 'galvanizli', 'paslanmaz'] },
  { ad: 'Flanş', yuva: 'Tip', degerler: ['düz', 'kaynak boyunlu', 'kör', 'gevşek'] },
  { ad: 'Flanş', yuva: 'Sınıf', degerler: ['PN 10', 'PN 16', 'PN 25', 'PN 40'] },
  { ad: 'Yivli kaplin', yuva: 'Tip', degerler: ['rijit', 'fleksibl'] },
  { ad: 'Yivli kaplin', yuva: 'Kaplama', degerler: ['kırmızı boyalı', 'galvaniz kaplamalı', 'paslanmaz'] },
  { ad: 'Küresel vana', yuva: 'Gövde malzemesi', degerler: ['pirinç', 'bronz', 'çelik (karbon)', 'paslanmaz', 'pik döküm'] },
  { ad: 'Küresel vana', yuva: 'Bağlantı', degerler: ['dişli', 'flanşlı', 'yivli', 'kaynaklı'] },
  { ad: 'Küresel vana', yuva: 'Geçiş', degerler: ['tam geçişli', 'yarım geçişli'] },
  { ad: 'Küresel vana', yuva: 'Parça', degerler: ['iki parçalı', 'üç parçalı', 'monoblok'] },
  { ad: 'Küresel vana', yuva: 'Sınıf', degerler: ['PN 16', 'PN 25', 'PN 40'] },
  { ad: 'Kelebek vana', yuva: 'Gövde tipi', degerler: ['wafer', 'lug', 'flanşlı', 'dişli redüktörlü'] },
  { ad: 'Kelebek vana', yuva: 'Sit/disk', degerler: ['EPDM sit', 'NBR sit', 'paslanmaz disk', 'sfero disk'] },
  { ad: 'Kelebek vana', yuva: 'Kumanda', degerler: ['kollu', 'redüktörlü (volanlı)', 'motorlu', 'switchli (izlenebilir)'] },
  { ad: 'Sürgülü vana', yuva: 'Mil tipi', degerler: ['OS&Y (yükselen milli)', 'NRS (yükselmeyen milli)'] },
  { ad: 'Sürgülü vana', yuva: 'Gövde', degerler: ['pik döküm', 'sfero döküm', 'pirinç'] },
  { ad: 'Globe vana', yuva: 'Bağlantı', degerler: ['dişli', 'flanşlı'] },
  { ad: 'Çekvalf', yuva: 'Tip', degerler: ['yaylı', 'çalpara (swing)', 'disko (wafer)', 'hidrolik (kontrollü)'] },
  { ad: 'Çekvalf', yuva: 'Gövde', degerler: ['pirinç', 'pik döküm', 'sfero', 'paslanmaz'] },
  { ad: 'Pislik tutucu', yuva: 'Tip', degerler: ['Y tipi', 'sepet tip'] },
  { ad: 'Pislik tutucu', yuva: 'Gövde/bağlantı', degerler: ['pirinç dişli', 'pik döküm flanşlı'] },
  { ad: 'Balans vanası', yuva: 'Tip', degerler: ['statik', 'dinamik', 'basınç bağımsız (PICV)'] },
  { ad: 'Motorlu vana', yuva: 'Yol', degerler: ['2 yollu', '3 yollu'] },
  { ad: 'Motorlu vana', yuva: 'Kumanda', degerler: ['on-off', 'oransal (0-10V)'] },
  { ad: 'Selenoid vana', yuva: 'Konum', degerler: ['normalde kapalı (NC)', 'normalde açık (NO)'] },
  { ad: 'Selenoid vana', yuva: 'Bobin', degerler: ['24V AC', '24V DC', '220V AC'] },
  { ad: 'Basınç düşürücü vana', yuva: 'Tip', degerler: ['pistonlu', 'diyaframlı', 'pilot tesirli'] },
  { ad: 'Emniyet ventili', yuva: 'Ayar', degerler: ['3 bar', '3,5 bar', '6 bar', '8 bar', '10 bar'] },
  { ad: 'Doğalgaz küresel vanası', yuva: 'Onay/sınıf', degerler: ['gaz onaylı (EN 331)', 'flanşlı', 'dişli'] },
  { ad: 'Hidrolik kontrol vanası', yuva: 'Fonksiyon', degerler: ['basınç düşürücü', 'basınç sabitleme', 'seviye kontrol (flatörlü)', 'debi kontrol', 'pompa kontrol', 'relief (tahliye)'] },
  { ad: 'Hidrolik kontrol vanası', yuva: 'Gövde/sınıf', degerler: ['pik GG25', 'sfero GGG40', 'PN 16', 'PN 25', '230 PSI', '360 PSI'] },
  { ad: 'Hidrolik kontrol vanası', yuva: 'Bağlantı', degerler: ['flanşlı', 'dişli', 'kaplin (yivli)'] },
  { ad: 'Hava atıcı (purjör)', yuva: 'Tip', degerler: ['otomatik', 'manuel'] },
  { ad: 'Sprinkler', yuva: 'Montaj/yön', degerler: ['pendent (sarkık)', 'upright (dik)', 'sidewall (duvar)', 'gizli (concealed)'] },
  { ad: 'Sprinkler', yuva: 'Tepki', degerler: ['standart tepkimeli', 'hızlı tepkimeli (quick response)'] },
  { ad: 'Sprinkler', yuva: 'K faktörü', degerler: ['K5.6 (80)', 'K8.0 (115)', 'K11.2 (160)', 'K14 (200)'] },
  { ad: 'Sprinkler', yuva: 'Sıcaklık', degerler: ['57°C', '68°C', '79°C', '93°C', '141°C', '182°C'] },
  { ad: 'Sprinkler', yuva: 'Kaplama', degerler: ['beyaz', 'kromajlı', 'pirinç'] },
  { ad: 'Esnek sprinkler bağlantı hortumu', yuva: 'Tip', degerler: ['örgülü', 'örgüsüz'] },
  { ad: 'Islak alarm vanası', yuva: 'Onay', degerler: ['UL/FM onaylı', 'onaysız'] },
  { ad: 'Test ve drenaj vanası', yuva: 'Bağlantı', degerler: ['yivli', 'dişli'] },
  { ad: 'Akış anahtarı', yuva: 'Tip', degerler: ['paddle (palet) tip'] },
  { ad: 'Yangın dolabı', yuva: 'Tip', degerler: ['camlı', 'sac kapaklı', 'PH etiketli', 'makaralı (25 m)', 'tam gömme'] },
  { ad: 'Yangın hidrantı', yuva: 'Tip', degerler: ['yerüstü', 'yeraltı'] },
  { ad: 'Yangın söndürme tüpü', yuva: 'Tip/dolum', degerler: ['KKT 6 kg', 'KKT 12 kg', 'CO2 5 kg'] },
  { ad: 'Sirkülasyon pompası', yuva: 'Rotor', degerler: ['ıslak rotorlu', 'kuru rotorlu'] },
  { ad: 'Sirkülasyon pompası', yuva: 'Kumanda/format', degerler: ['frekans konvertörlü', 'sabit devirli', 'tekli', 'ikiz'] },
  { ad: 'Hidrofor', yuva: 'Pompa sayısı', degerler: ['tek pompalı', '2 pompalı', '3 pompalı'] },
  { ad: 'Yangın pompası grubu', yuva: 'Konfigürasyon', degerler: ['elektrikli+jokey', 'elektrikli+dizel+jokey'] },
  { ad: 'Dalgıç / drenaj pompası', yuva: 'Tip', degerler: ['flatörlü', 'flatörsüz', 'parçalayıcılı'] },
  { ad: 'Boyler', yuva: 'Serpantin', degerler: ['tek serpantinli', 'çift serpantinli', 'elektrikli'] },
  { ad: 'Genleşme tankı', yuva: 'Sınıf', degerler: ['10 bar', '16 bar', 'değiştirilebilir membranlı'] },
  { ad: 'Plakalı eşanjör', yuva: 'Tip', degerler: ['contalı', 'lehimli'] },
  { ad: 'Panel radyatör', yuva: 'Tip', degerler: ['tip 11', 'tip 22', 'tip 33'] },
  { ad: 'Brülör', yuva: 'Kademe', degerler: ['tek kademeli', 'iki kademeli', 'modülasyonlu'] },
  { ad: 'Paslanmaz baca', yuva: 'Cidar', degerler: ['tek cidarlı', 'çift cidarlı'] },
  { ad: 'Chiller', yuva: 'Soğutma', degerler: ['hava soğutmalı', 'su soğutmalı'] },
  { ad: 'Chiller', yuva: 'Kompresör', degerler: ['scroll', 'vidalı', 'santrifüj', 'free cooling'] },
  { ad: 'Fan-coil', yuva: 'Tip', degerler: ['kasetli (4 yollu)', 'gizli tavan', 'duvar tipi', 'döşeme tipi'] },
  { ad: 'Fan-coil', yuva: 'Boru sistemi', degerler: ['2 borulu', '4 borulu'] },
  { ad: 'Klima santrali', yuva: 'Özellik', degerler: ['ısı geri kazanımlı', 'karışım havalı', 'hijyenik'] },
  { ad: 'VRF iç ünite', yuva: 'Tip', degerler: ['duvar', 'kaset', 'kanal', 'döşeme'] },
  { ad: 'Fan', yuva: 'Tip', degerler: ['aksiyel', 'radyal', 'hücreli aspiratör', 'çatı tipi', 'kanal tipi', 'jet fan', 'duman egzoz (F300)', 'duman egzoz (F400)'] },
  { ad: 'Damper', yuva: 'Tip', degerler: ['volüm', 'yangın (motorlu)', 'yangın (ergiyen elemanlı)', 'geri dönüşsüz'] },
  { ad: 'Menfez', yuva: 'Tip', degerler: ['emiş', 'egzoz', 'lineer', 'kapı transfer'] },
  { ad: 'Hava kanalı', yuva: 'Form', degerler: ['dikdörtgen', 'spiral yuvarlak', 'oval'] },
  { ad: 'Hava kanalı', yuva: 'Sac', degerler: ['galvaniz', 'paslanmaz', 'siyah sac'] },
  { ad: 'Flexible hava kanalı', yuva: 'İzolasyon', degerler: ['izoleli', 'izolesiz'] },
  { ad: 'Su sayacı', yuva: 'Tip', degerler: ['mekanik', 'ultrasonik', 'ön ödemeli'] },
  { ad: 'Manometre', yuva: 'Tip', degerler: ['kuru', 'gliserinli', 'radyal', 'eksenel'] },
  { ad: 'Manometre', yuva: 'Aralık', degerler: ['0-6 bar', '0-10 bar', '0-16 bar', '0-25 bar'] },
  { ad: 'Termometre', yuva: 'Aralık', degerler: ['0-120°C', '0-160°C'] },
  { ad: 'Kompansatör', yuva: 'Tip', degerler: ['eksenel metal körüklü', 'kauçuk (titreşim yutucu)', 'dekoratif'] },
  { ad: 'Kompansatör', yuva: 'Bağlantı', degerler: ['flanşlı', 'dişli', 'kaynaklı'] },
  { ad: 'Esnek metal hortum', yuva: 'Örgü', degerler: ['örgülü', 'örgüsüz'] },
  { ad: 'Kondenstop', yuva: 'Tip', degerler: ['termodinamik', 'şamandıralı', 'termostatik', 'ters kovalı'] },
  { ad: 'Yer süzgeci', yuva: 'Izgara', degerler: ['paslanmaz ızgaralı', 'plastik ızgaralı', 'rögar tipi'] },
  { ad: 'Klozet', yuva: 'Montaj', degerler: ['asma', 'yerden'] },
  { ad: 'Batarya', yuva: 'Kullanım', degerler: ['lavabo', 'eviye', 'duş', 'fotoselli'] },
  { ad: 'Kauçuk köpüğü boru izolasyonu', yuva: 'Et kalınlığı', degerler: ['6 mm', '9 mm', '13 mm', '19 mm', '25 mm'] },
  { ad: 'Kauçuk köpüğü boru izolasyonu', yuva: 'Kaplama', degerler: ['çıplak', 'alüminyum folyolu', 'UV korumalı'] },
  { ad: 'Cam yünü boru izolasyonu', yuva: 'Et kalınlığı', degerler: ['30 mm', '40 mm', '50 mm'] },
  { ad: 'Boru kelepçesi', yuva: 'Tip', degerler: ['kauçuklu', 'kauçuksuz', 'sprinkler askısı'] },
];
