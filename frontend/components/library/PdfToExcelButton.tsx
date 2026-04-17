'use client';

import React, { useRef, useState } from 'react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { convertPdfToExcel } from '@/lib/pdf-to-excel';

interface Props {
  /** Sheet adi ve dosya adi icin kullanilir. */
  brandName?: string;
  className?: string;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  size?: 'sm' | 'default' | 'lg';
  label?: string;
}

/**
 * Kullaniciya PDF secmesi icin dosya dialogu acar, backend'e gonderip
 * AI ile parse eder, sonucu Excel olarak indirir. Admin yetkisi
 * gerektirmez — normal kullanici kullanabilir.
 */
export default function PdfToExcelButton({
  brandName,
  className,
  variant = 'outline',
  size = 'default',
  label = "PDF'den Excel'e Cevir",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleClick = () => inputRef.current?.click();

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Input'u sifirla (ayni dosya tekrar secilebilsin)
    if (inputRef.current) inputRef.current.value = '';

    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'Hata',
        description: 'Dosya boyutu 10MB\'dan buyuk olamaz.',
        variant: 'destructive',
      });
      return;
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast({
        title: 'Hata',
        description: 'Sadece PDF dosyalari kabul edilir.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const fileName = await convertPdfToExcel(file, brandName);
      toast({
        title: 'Excel indirildi',
        description: `${fileName} olarak kaydedildi. Kontrol ettikten sonra sisteme Excel olarak yukleyebilirsiniz.`,
      });
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'PDF donusumu basarisiz oldu.';
      toast({
        title: 'Hata',
        description: String(msg),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileSpreadsheet className="h-4 w-4" />
        )}
        <span className="ml-2">{loading ? 'Donusturuluyor...' : label}</span>
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={handleChange}
      />
    </>
  );
}
