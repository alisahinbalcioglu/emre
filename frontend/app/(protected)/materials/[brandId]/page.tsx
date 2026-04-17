'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Package, Search, FileText, Trash2, ChevronDown, BookmarkPlus, Upload, X, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import api from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ExcelGrid } from '@/components/excel-grid/ExcelGrid';
import { SheetTabs } from '@/components/excel-grid/SheetTabs';
import type { MultiSheetData, ExcelRowData } from '@/components/excel-grid/types';

/* ── Types ── */

interface PriceListSummary { id: string; name: string; createdAt: string; _count: { items: number } }
interface BrandDetail { brand: { id: string; name: string }; priceLists: PriceListSummary[] }
interface MaterialRow { id: string; materialName: string; unit: string; price: number }
interface PriceListDetail { priceList: { id: string; name: string }; brand: { name: string }; materials: MaterialRow[]; totalCount: number }

function getRole(): string | null {
  try { return JSON.parse(localStorage.getItem('user') || '{}').role ?? null; } catch { return null; }
}

function fmtPrice(v: number) { return v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

/* ── Material class + diameter grouping helpers ── */

const DIAMETER_ORDER = [
  '3/8', '1/2', '3/4', '1', '1 1/4', '1 1/2', '2', '2 1/2', '3', '4', '5', '6', '8', '10', '12',
];

/** Normalize diameters like "11/2" → "1 1/2", "21/2" → "2 1/2" */
function normalizeDiameter(raw: string): string {
  // "11/2" → "1 1/2", "11/4" → "1 1/4", "21/2" → "2 1/2"
  const compact = raw.match(/^(\d)(\d\/\d)$/);
  if (compact) return `${compact[1]} ${compact[2]}`;
  return raw;
}

function parseDiameter(name: string): string {
  // Compact fractions without space: 11/2, 11/4, 21/2
  const compactFrac = name.match(/(\d)(\d\/\d)/);
  if (compactFrac) return normalizeDiameter(compactFrac[1] + compactFrac[2]);
  // Spaced fractions: 1 1/2, 2 1/2
  const spacedFrac = name.match(/(\d+\s+\d+\/\d+)/);
  if (spacedFrac) return spacedFrac[1].trim();
  // Simple fractions: 1/2, 3/4, 3/8
  const simpleFrac = name.match(/(\d+\/\d+)/);
  if (simpleFrac) return simpleFrac[1];
  // DN or Ø notation: DN50, Ø63
  const dnMatch = name.match(/(?:DN|Ø)\s*(\d+)/i);
  if (dnMatch) return dnMatch[1];
  // Bare inch with quote: 4", 2"
  const inchMatch = name.match(/\b(\d+)["''″]/);
  if (inchMatch) return inchMatch[1];
  return '';
}

/**
 * Extract the material class (type) from the name.
 * Groups like: "DIN 2605 90° Dirsek", "EN 1092-1 Düz Flanş", "PPR Boru", "Küresel Vana" etc.
 *
 * Strategy: Take the "standard prefix + type keyword" before numeric dimensions start.
 */
function parseMaterialClass(name: string): string {
  // 1. Try DIN/EN/ISO standard prefix: "DIN 2605 90° Dirsek", "EN 1092-1 Düz Flanş"
  const stdMatch = name.match(
    /^((?:DIN|EN|ISO|TS|ASTM)\s+[\d\-]+(?:\s+\d+°)?\s+[A-Za-zÇçĞğİıÖöŞşÜüâ\-]+(?:\s+[A-Za-zÇçĞğİıÖöŞşÜüâ\-]+)?)/i,
  );
  if (stdMatch) return stdMatch[1].trim();

  // 2. Try generic: take words before first numeric dimension (e.g. "PPR Boru 20mm" → "PPR Boru")
  const genericMatch = name.match(
    /^([A-Za-zÇçĞğİıÖöŞşÜüâ\-]+(?:\s+[A-Za-zÇçĞğİıÖöŞşÜüâ\-]+)*?)(?:\s+\d)/,
  );
  if (genericMatch && genericMatch[1].trim().length >= 3) return genericMatch[1].trim();

  // 3. Fallback: first 2-3 words
  const words = name.split(/\s+/).filter(Boolean);
  const fallback = words.slice(0, Math.min(3, words.length)).join(' ');
  return fallback || 'Diğer';
}

function diameterSortKey(d: string): number {
  const idx = DIAMETER_ORDER.indexOf(d);
  if (idx >= 0) return idx;
  const num = parseFloat(d);
  if (!isNaN(num)) return 100 + num;
  return 999;
}

interface ClassGroup { className: string; items: MaterialRow[] }

function groupAndSort(materials: MaterialRow[]): ClassGroup[] {
  // 1. Group by material class
  const classMap = new Map<string, MaterialRow[]>();
  for (const m of materials) {
    const cls = parseMaterialClass(m.materialName);
    if (!classMap.has(cls)) classMap.set(cls, []);
    classMap.get(cls)!.push(m);
  }

  // 2. Sort items within each class by diameter (small → large)
  classMap.forEach((items) => {
    items.sort((a: MaterialRow, b: MaterialRow) => {
      const da = parseDiameter(a.materialName);
      const db = parseDiameter(b.materialName);
      const diff = diameterSortKey(da) - diameterSortKey(db);
      if (diff !== 0) return diff;
      // Same diameter → sort by full name (Galvaniz/Siyah)
      return a.materialName.localeCompare(b.materialName, 'tr');
    });
  });

  // 3. Sort classes alphabetically by name
  return Array.from(classMap.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'tr'))
    .map(([className, items]) => ({ className, items }));
}

/* ── Page ── */

export default function BrandDetailPage() {
  const params = useParams<{ brandId: string }>();
  const brandId = params.brandId;
  const isAdmin = getRole() === 'admin';

  const [data, setData] = useState<BrandDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Expanded list
  const [expandedListId, setExpandedListId] = useState<string | null>(null);
  const [listMaterials, setListMaterials] = useState<MaterialRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [importingListId, setImportingListId] = useState<string | null>(null);

  // Multi-sheet editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [multiSheet, setMultiSheet] = useState<MultiSheetData | null>(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [liveRowDataBySheet, setLiveRowDataBySheet] = useState<Record<number, ExcelRowData[]>>({});
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [savingEditor, setSavingEditor] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchBrand = useCallback(async () => {
    try {
      const { data: res } = await api.get<BrandDetail>(`/brands/${brandId}/price-lists`);
      setData(res);
      // Tek fiyat listesi varsa otomatik aç — gereksiz tıklama adımını kaldır
      if (res.priceLists.length === 1) {
        const onlyList = res.priceLists[0];
        setExpandedListId(onlyList.id);
        setListLoading(true);
        try {
          const { data: listRes } = await api.get<PriceListDetail>(`/brands/price-lists/${onlyList.id}/materials`);
          setListMaterials(listRes.materials);
        } catch {
          setListMaterials([]);
        } finally {
          setListLoading(false);
        }
      }
      // Birden fazla fiyat listesi varsa → hepsini aç (ilki detaylı)
      if (res.priceLists.length > 1) {
        const firstList = res.priceLists[0];
        setExpandedListId(firstList.id);
        setListLoading(true);
        try {
          const { data: listRes } = await api.get<PriceListDetail>(`/brands/price-lists/${firstList.id}/materials`);
          setListMaterials(listRes.materials);
        } catch {
          setListMaterials([]);
        } finally {
          setListLoading(false);
        }
      }
    } catch {
      toast({ title: 'Hata', description: 'Marka yüklenemedi.', variant: 'destructive' });
    } finally { setIsLoading(false); }
  }, [brandId]);

  useEffect(() => { fetchBrand(); }, [fetchBrand]);

  async function toggleList(listId: string) {
    if (expandedListId === listId) { setExpandedListId(null); setListMaterials([]); return; }
    setExpandedListId(listId); setListLoading(true); setSearch('');
    try {
      const { data: res } = await api.get<PriceListDetail>(`/brands/price-lists/${listId}/materials`);
      setListMaterials(res.materials);
    } catch {
      toast({ title: 'Hata', description: 'Liste yüklenemedi.', variant: 'destructive' });
      setListMaterials([]);
    } finally { setListLoading(false); }
  }

  async function handleImportToLibrary(listId: string, listName: string) {
    if (!window.confirm(`"${listName}" listesindeki tüm malzemeleri kütüphanenize aktarmak istiyor musunuz?`)) return;
    setImportingListId(listId);
    try {
      const { data: res } = await api.post('/library/import-price-list', { brandId, priceListId: listId });
      if (res.imported === 0) {
        toast({ title: 'Bilgi', description: `Bu listedeki malzemeler zaten kütüphanenizde mevcut.` });
      } else {
        toast({ title: 'Aktarıldı', description: `${res.imported} malzeme kütüphanenize eklendi.${res.skipped > 0 ? ` (${res.skipped} zaten mevcuttu)` : ''}` });
      }
    } catch (err: any) {
      toast({ title: 'Hata', description: err?.response?.data?.message || 'Aktarım sırasında hata oluştu.', variant: 'destructive' });
    } finally { setImportingListId(null); }
  }

  async function handleDeleteList(listId: string, listName: string) {
    if (!window.confirm(`"${listName}" listesini silmek istediğinize emin misiniz?`)) return;
    try {
      await api.delete(`/admin/price-lists/${listId}`);
      toast({ title: 'Silindi' });
      if (expandedListId === listId) { setExpandedListId(null); setListMaterials([]); }
      await fetchBrand();
    } catch { toast({ title: 'Hata', variant: 'destructive' }); }
  }

  // ── Multi-sheet Excel handlers (admin) ──

  async function handleExcelUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setParsing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data: res } = await api.post<MultiSheetData>(
        '/admin/materials/parse-full-excel',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );

      if (!res?.sheets || res.sheets.length === 0) {
        toast({ title: 'Excel bos', variant: 'destructive' });
        return;
      }

      const nonEmpty = res.sheets.filter((s) => !s.isEmpty);
      if (nonEmpty.length === 0) {
        toast({ title: 'Hic dolu sheet bulunamadi', variant: 'destructive' });
        return;
      }

      setMultiSheet(res);
      setUploadedFileName(file.name);
      const firstNonEmpty = res.sheets.findIndex((s) => !s.isEmpty);
      setActiveSheetIndex(firstNonEmpty >= 0 ? firstNonEmpty : 0);

      const initialLive: Record<number, ExcelRowData[]> = {};
      res.sheets.forEach((s) => { initialLive[s.index] = s.rowData; });
      setLiveRowDataBySheet(initialLive);

      setEditorOpen(true);
      toast({ title: 'Excel parse edildi', description: `${nonEmpty.length} sayfa yuklendi` });
    } catch (e: any) {
      toast({ title: 'Parse hatasi', description: e?.response?.data?.message ?? 'Bilinmeyen', variant: 'destructive' });
    } finally {
      setParsing(false);
    }
  }

  async function handleSaveFromSheets() {
    if (!multiSheet) return;
    setSavingEditor(true);
    try {
      const sheetsToSend = multiSheet.sheets.map((s) => ({
        name: s.name,
        index: s.index,
        isEmpty: s.isEmpty,
        rowData: liveRowDataBySheet[s.index] ?? s.rowData,
        columnRoles: s.columnRoles,
      }));

      const { data: res } = await api.post(`/admin/brands/${brandId}/save-from-sheets`, {
        sheets: sheetsToSend,
      });

      toast({
        title: 'Kaydedildi',
        description: `${res.totalListsCreated} liste, ${res.totalImported} malzeme`,
      });

      if (res.warnings && res.warnings.length > 0) {
        res.warnings.forEach((w: string) => toast({ title: 'Uyari', description: w }));
      }

      setEditorOpen(false);
      setMultiSheet(null);
      setLiveRowDataBySheet({});
      await fetchBrand();
    } catch (e: any) {
      toast({ title: 'Kaydetme hatasi', description: e?.response?.data?.message ?? 'Bilinmeyen', variant: 'destructive' });
    } finally {
      setSavingEditor(false);
    }
  }

  function closeEditor() {
    if (!confirm('Kaydedilmemis degisiklikler kaybolacak. Emin misiniz?')) return;
    setEditorOpen(false);
    setMultiSheet(null);
    setLiveRowDataBySheet({});
  }

  const filtered = listMaterials.filter(m => m.materialName.toLowerCase().includes(search.toLowerCase()));
  const classGroups = groupAndSort(filtered);

  if (isLoading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  if (!data) return (
    <div>
      <Link href="/materials" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Malzeme Havuzu</Link>
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">Marka bulunamadı.</div>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <Link href="/materials" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />Malzeme Havuzu
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{data.brand.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{data.priceLists.length} fiyat listesi</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} className="hidden" />
            <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={parsing}>
              {parsing ? (
                <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />Yukleniyor...</>
              ) : (
                <><Upload className="mr-1 h-3.5 w-3.5" />Excel Yukle</>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Empty */}
      {data.priceLists.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-20">
          <Package className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Bu markaya henüz fiyat listesi yüklenmemiş.</p>
          <Link href="/materials" className="mt-4 text-sm text-primary underline">Geri dön ve PDF yükle</Link>
        </div>
      )}

      {/* Price Lists (accordion) */}
      <div className="space-y-3">
        {data.priceLists.map((pl) => {
          const isOpen = expandedListId === pl.id;
          return (
            <Card key={pl.id} className="overflow-hidden">
              {/* List header */}
              <button
                type="button"
                onClick={() => toggleList(pl.id)}
                className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-muted/30"
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-semibold">{pl.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {pl._count.items} malzeme · {new Date(pl.createdAt).toLocaleDateString('tr-TR')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-primary hover:bg-primary/10"
                    disabled={importingListId === pl.id}
                    onClick={(e) => { e.stopPropagation(); handleImportToLibrary(pl.id, pl.name); }}
                  >
                    {importingListId === pl.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <><BookmarkPlus className="mr-1 h-3.5 w-3.5" />Kütüphaneme Aktar</>}
                  </Button>
                  {isAdmin && (
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                      onClick={(e) => { e.stopPropagation(); handleDeleteList(pl.id, pl.name); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
                </div>
              </button>

              {/* Expanded: material table */}
              {isOpen && (
                <CardContent className="border-t p-0">
                  {listLoading ? (
                    <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : (
                    <>
                      {/* Search within list */}
                      <div className="border-b px-4 py-3">
                        <div className="relative max-w-xs">
                          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input placeholder="Listede ara..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 pl-8 text-xs" />
                        </div>
                      </div>

                      {filtered.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                          {search ? `"${search}" ile eşleşen malzeme bulunamadı.` : 'Bu listede malzeme yok.'}
                        </p>
                      ) : (
                        <div className="max-h-[600px] overflow-auto">
                          {(() => {
                            let counter = 0;
                            return classGroups.map((group, gi) => {
                              const startIdx = counter;
                              counter += group.items.length;
                              return (
                                <div key={group.className} className={gi > 0 ? 'mt-6 border-t-2 border-primary/20 pt-4' : ''}>
                                  {/* Grup Başlığı */}
                                  <div className="mb-2 flex items-center gap-3 px-4">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                                      <span className="text-xs font-bold text-primary">{gi + 1}</span>
                                    </div>
                                    <div>
                                      <h4 className="text-sm font-bold text-foreground">{group.className}</h4>
                                      <p className="text-[11px] text-muted-foreground">{group.items.length} malzeme</p>
                                    </div>
                                  </div>
                                  {/* Tablo */}
                                  <table className="w-full text-sm">
                                    <thead className="sticky top-0 z-20 bg-muted/95 backdrop-blur">
                                      <tr className="border-b">
                                        <th className="w-12 px-4 py-2 text-left text-xs font-medium text-muted-foreground">#</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Malzeme Adı</th>
                                        <th className="w-24 px-4 py-2 text-left text-xs font-medium text-muted-foreground">Birim</th>
                                        <th className="w-32 px-4 py-2 text-right text-xs font-medium text-muted-foreground">Birim Fiyat</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {group.items.map((m, i) => (
                                        <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30">
                                          <td className="px-4 py-2 text-muted-foreground">{startIdx + i + 1}</td>
                                          <td className="px-4 py-2 font-medium">{m.materialName}</td>
                                          <td className="px-4 py-2 text-muted-foreground">{m.unit}</td>
                                          <td className="px-4 py-2 text-right font-medium">₺{fmtPrice(m.price)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Multi-sheet ExcelGrid Modal */}
      {editorOpen && multiSheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2">
          <div className="w-full h-full max-w-[98vw] max-h-[98vh] rounded-lg bg-background shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b p-3">
              <div>
                <h2 className="text-base font-bold">{uploadedFileName}</h2>
                <p className="text-xs text-muted-foreground">
                  {multiSheet.sheets.filter((s) => !s.isEmpty).length} sayfa ·
                  Her sayfa ayri bir fiyat listesi olarak kaydedilir (sayfa adi = liste adi)
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={closeEditor} disabled={savingEditor}>
                  <X className="mr-1 h-3.5 w-3.5" />Iptal
                </Button>
                <Button size="sm" onClick={handleSaveFromSheets} disabled={savingEditor}>
                  {savingEditor ? (
                    <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />Kaydediliyor...</>
                  ) : (
                    <><Save className="mr-1 h-3.5 w-3.5" />Tum Sayfalari Kaydet</>
                  )}
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="flex-1 overflow-auto">
                <ExcelGrid
                  key={`sheet-${activeSheetIndex}`}
                  data={(() => {
                    const active = multiSheet.sheets[activeSheetIndex] ?? multiSheet.sheets.find((s) => !s.isEmpty);
                    if (!active || !Array.isArray(active.columnDefs) || active.columnDefs.length === 0) {
                      return {
                        columnDefs: [],
                        rowData: [],
                        columnRoles: {},
                        brands: [],
                        headerEndRow: 0,
                      };
                    }
                    return {
                      columnDefs: active.columnDefs,
                      rowData: liveRowDataBySheet[active.index] ?? active.rowData ?? [],
                      columnRoles: active.columnRoles ?? {},
                      brands: [],
                      headerEndRow: active.headerEndRow ?? 0,
                    };
                  })()}
                  brands={[]}
                  currencySymbol="₺"
                  conversionRate={1}
                  onBrandChange={async () => null}
                  onRowDataChange={(rows) => {
                    const active = multiSheet.sheets[activeSheetIndex];
                    if (active) {
                      setLiveRowDataBySheet((prev) => ({ ...prev, [active.index]: rows }));
                    }
                  }}
                />
              </div>
              <SheetTabs
                sheets={multiSheet.sheets.map((s) => ({
                  name: s.name,
                  index: s.index,
                  isEmpty: s.isEmpty,
                }))}
                activeIndex={activeSheetIndex}
                onChange={setActiveSheetIndex}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
