'use client';

export default function QuoteNewError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <h2 className="text-xl font-bold text-red-600">Sayfa Hatasi</h2>
      <p className="text-sm text-muted-foreground max-w-md text-center">{error.message}</p>
      <pre className="text-xs bg-muted p-4 rounded max-w-lg overflow-auto max-h-40">{error.stack}</pre>
      <button onClick={reset} className="px-4 py-2 bg-primary text-white rounded">Tekrar Dene</button>
    </div>
  );
}
