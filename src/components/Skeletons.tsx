// Loading placeholders. Sized like the real thing so layout doesn't jump.

function Bar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-zinc-200 ${className}`} />;
}

export function ProductCardSkeleton() {
  return (
    <div className="flex h-full flex-col rounded bg-surface p-3 shadow-sm" aria-hidden>
      <Bar className="mb-3 aspect-square w-full" />
      <Bar className="mb-2 h-3 w-full" />
      <Bar className="mb-3 h-3 w-2/3" />
      <Bar className="mb-3 h-3 w-1/2" />
      <Bar className="h-6 w-1/3" />
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="rounded bg-surface p-4 shadow-sm" aria-hidden>
      <Bar className="mb-4 h-6 w-48" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="w-44 shrink-0 sm:w-52">
            <ProductCardSkeleton />
          </div>
        ))}
      </div>
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <Bar className="h-64 w-full sm:h-80" />
      <RowSkeleton />
      <RowSkeleton />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function SearchSkeleton() {
  return (
    <div className="flex flex-col gap-4 lg:flex-row" role="status" aria-label="Loading results">
      <aside className="hidden w-60 shrink-0 space-y-3 lg:block" aria-hidden>
        <Bar className="h-5 w-32" />
        {Array.from({ length: 7 }, (_, i) => (
          <Bar key={i} className="h-4 w-40" />
        ))}
        <Bar className="mt-6 h-5 w-24" />
        {Array.from({ length: 4 }, (_, i) => (
          <Bar key={i} className="h-4 w-32" />
        ))}
      </aside>
      <div className="min-w-0 flex-1">
        <Bar className="mb-4 h-8 w-full" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }, (_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </div>
      <span className="sr-only">Loading results…</span>
    </div>
  );
}
