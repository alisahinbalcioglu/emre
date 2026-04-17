import api from '@/lib/api';

/**
 * PDF dosyasini backend'e gonderip AI ile parse ettirir, donen
 * Excel binary'sini tarayicidan indirir. Normal kullanici erisimi
 * (admin rolu gerektirmez).
 *
 * @param pdfFile Yuklenecek PDF
 * @param brandName Dosya adi ve sheet adi icin kullanilir (opsiyonel)
 * @returns Indirilmis dosyanin adi
 */
export async function convertPdfToExcel(
  pdfFile: File,
  brandName?: string,
): Promise<string> {
  const formData = new FormData();
  formData.append('file', pdfFile);
  if (brandName) formData.append('brandName', brandName);

  const response = await api.post('/pdf-to-excel/convert', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    responseType: 'blob',
  });

  const blob = response.data as Blob;
  const safeName = (brandName?.trim() || 'fiyat-listesi')
    .replace(/[^a-zA-Z0-9-_ğĞıİöÖüÜşŞçÇ]+/g, '-')
    .slice(0, 64);
  const fileName = `${safeName}.xlsx`;

  // Tarayicidan indirme tetikle
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);

  return fileName;
}
