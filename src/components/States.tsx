import Link from "next/link";

function Panel({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded bg-surface px-6 py-12 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-zinc-500" aria-hidden>
        {icon}
      </div>
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="mx-auto mt-2 max-w-md text-sm text-zinc-600">{children}</div>
    </div>
  );
}

const buttonClass =
  "inline-block rounded-full bg-accent px-5 py-2 text-sm font-medium text-navy hover:bg-accent-hover";

export function EmptyResults({
  keyword,
  clearHref,
  filtered,
  categories,
}: {
  keyword: string;
  clearHref: string;
  /** True when filters/keyword are narrowing the results; false when the catalog is empty. */
  filtered: boolean;
  categories: { slug: string; name: string }[];
}) {
  if (!filtered) {
    return (
      <Panel
        title="Nothing here yet"
        icon={
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7" strokeLinejoin="round" />
          </svg>
        }
      >
        <p>The catalog is empty. Check back soon.</p>
        {process.env.NODE_ENV === "development" && (
          <p className="mt-2 rounded bg-zinc-100 p-2 font-mono text-xs">Dev hint: run npm run seed</p>
        )}
      </Panel>
    );
  }

  return (
    <Panel
      title={keyword ? `No results for “${keyword}”` : "No products match your filters"}
      icon={
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
      }
    >
      <ul className="mx-auto mb-5 list-disc space-y-1 pl-5 text-left">
        <li>Check the spelling, or try a shorter or more general word.</li>
        <li>Widen the price range or lower the rating filter.</li>
        <li>Search all categories instead of just one.</li>
      </ul>
      <Link href={clearHref} className={buttonClass}>
        Clear all filters
      </Link>
      {categories.length > 0 && (
        <div className="mt-6 border-t border-zinc-200 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Browse a category</p>
          <ul className="flex flex-wrap justify-center gap-2">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/s?c=${c.slug}`}
                  className="block rounded-full border border-zinc-300 px-3 py-1 text-sm hover:border-zinc-500 hover:bg-zinc-50"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

export function OutOfRangePage({ total, firstPageHref }: { total: number; firstPageHref: string }) {
  return (
    <Panel
      title="That page doesn't exist"
      icon={
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M5 4h14v16H5zM9 9h6M9 13h4" strokeLinecap="round" />
        </svg>
      }
    >
      <p className="mb-4">
        There are only {total.toLocaleString("en-US")} results, which doesn&apos;t reach this page.
      </p>
      <Link href={firstPageHref} className={buttonClass}>
        Back to the first page
      </Link>
    </Panel>
  );
}

export function ErrorState({ retryHref }: { retryHref: string }) {
  return (
    <Panel
      title="We couldn't load products"
      icon={
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 3 2 20h20L12 3zM12 10v4M12 17v.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      }
    >
      <p className="mb-4">Something went wrong on our end. Please try again in a moment.</p>
      <Link href={retryHref} className={buttonClass}>
        Try again
      </Link>
    </Panel>
  );
}
