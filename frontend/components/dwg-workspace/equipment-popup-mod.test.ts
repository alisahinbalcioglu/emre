/**
 * P2-6 — EKIPMAN POPUP'I HANGI SEKMEYLE ACILIR (etkisiz ternary kusuru).
 *
 * KUSUR: `EquipmentDetailPopup.tsx:51` ternary'sinin IKI KOLU DA 'library'
 * donuyordu; kosul tamamen etkisizdi. Semptom kozmetik DEGIL:
 * manuel girilmis bir ekipmani duzenlemek icin sembole tekrar tiklayinca
 *   1. popup "Kutuphaneden Sec" sekmesiyle acilir,
 *   2. kullanicinin kendi yazdigi ad/birim YALNIZ manuel sekmede render
 *      edildigi icin ekranda gorunmez (kayit silinmis gibi durur),
 *   3. `canSave = mode === 'library' ? !!selectedItem : ...` false kalir →
 *      "Kaydet" DISABLED; duzenleme yolu tikanir.
 *
 * ⚠ BIR ASSERT TEK KRITERE: uc durumun ucu de ayri test — paylasilan bir
 * assert, kriterlerden birinin hic kanitlanmadigini gizler.
 */
import { describe, it, expect } from 'vitest';
import { ilkMod } from './equipment-popup-mod';

describe('ilkMod — popup acilis sekmesi', () => {
  it('manuel girilmis kayit (libraryItemId null) MANUEL sekmede acilir', () => {
    // Bugun KIRMIZI: 'library' doner → kullanici kendi girdigini goremez.
    expect(ilkMod({ libraryItemId: null })).toBe('manual');
  });

  it('libraryItemId alani hic yoksa da MANUEL sayilir', () => {
    // Eski kayitlarda alan undefined olabilir; null ile ayni sinif.
    expect(ilkMod({})).toBe('manual');
  });

  it('kutuphaneden secilmis kayit KUTUPHANE sekmesinde acilir', () => {
    expect(ilkMod({ libraryItemId: 'lib-1' })).toBe('library');
  });

  it('YENI isaretlemede (existing yok) varsayilan KUTUPHANE modudur', () => {
    // EquipmentDetailPopup.tsx bas yorumu: "Kutuphane modu (default)".
    // Bu assert, fix'in `existing` varligini atlayip varsayilani manuel'e
    // kaydirmasini engelleyen kapidir.
    expect(ilkMod(undefined)).toBe('library');
  });
});
