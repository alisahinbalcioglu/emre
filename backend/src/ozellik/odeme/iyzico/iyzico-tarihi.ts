/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  iyzico TARİH ALANI → Date — SAF, TEK KAYNAK (24.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ÖLÇÜLDÜ (20.08 sandbox, docs/adim0-tutanak/*.json): iyzico abonelik
 *  yanıtlarındaki tarihler epoch ms SAYIDIR — `startPeriod: 1787215031301`,
 *  `endPeriod`, `startDate`, `endDate`, `createdDate`. İstemci tipleri
 *  (`IyzicoSiparis`, `IyzicoAbonelikDetayi`) onları `string` diye tanımlar.
 *
 *  ⚠ TUZAK: tipe inanıp dizeye çeviren kod SESSİZCE bozulur —
 *  `new Date('1789893431301')` ve `Date.parse(1789893431301)` İKİSİ DE
 *  geçersizdir (Invalid Date / NaN). Bu fonksiyon üç biçimi de çözer:
 *  sayı · rakam-dizesi (epoch ms) · ISO dize. Çözülemeyen değer `null`
 *  döner, tarih UYDURULMAZ.
 *
 *  ⚠ TEK YER (24.09): A1 paket değişimi `paket-degisimi.ts` içinde aynı işi
 *  yapan bir kopya taşıyordu; kopya kaldırıldı, o dosya bunu yeniden dışa
 *  verir (`abonelik.servisi.ts` oradan okur). Kopyanın sayı dalı
 *  `new Date(1e20)` gibi geçersiz bir Date'i olduğu gibi döndürüyordu.
 *  ⚠ Tahsilat yolu (`tahsilatBasarili` → `new Date(siparis.endPeriod)`,
 *  `webhook.isleyici` → `new Date(startPeriod)`) HENÜZ buradan okumuyor:
 *  bugün sayı geldiği için doğru; rakam-dizesinde olay işlenemez (sessiz
 *  değil) — mutabakat.job.ts → KAYIP TAHSİLAT, bilinen sınırlar.
 *
 *  Kapılar: `test:mutabakat-kayip-tahsilat` (T), `test:paket-degisimi` (T).
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function iyzicoTarihi(ham: unknown): Date | null {
  let t: Date | null = null;
  if (typeof ham === 'number') {
    if (Number.isFinite(ham) && ham > 0) t = new Date(ham);
  } else if (typeof ham === 'string') {
    const s = ham.trim();
    if (/^\d+$/.test(s)) {
      // Epoch ms DİZE olarak geldiyse: `new Date("1789…")` Invalid Date olurdu.
      const ms = Number(s);
      if (ms > 0) t = new Date(ms);
    } else if (s) {
      t = new Date(s);
    }
  }
  return t && !Number.isNaN(t.getTime()) ? t : null;
}
