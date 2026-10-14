import { ProductCard } from "@/components/ProductCard";
import { ActiveFilters } from "@/components/search/ActiveFilters";
import { FilterSidebar } from "@/components/search/FilterSidebar";
import { Pagination } from "@/components/search/Pagination";
import { SortSelect } from "@/components/search/SortSelect";
import { EmptyResults, ErrorState, OutOfRangePage } from "@/components/States";
import { getCategories, searchProducts, type Category, type SearchResult } from "@/lib/catalog";
import {
  PAGE_SIZE,
  SORTS,
  buildSearchHref,
  hasActiveFilters,
  parseSearchParams,
  type RawSearchParams,
} from "@/lib/search-params";

export async function SearchContent({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const filters = parseSearchParams(await searchParams);
  const here = buildSearchHref(filters, { page: filters.page });

  let result: SearchResult;
  try {
    result = await searchProducts(filters);
  } catch (error) {
    console.error("Search failed:", error);
    return <ErrorState retryHref={here} />;
  }

  // Categories only power the sidebar; if they fail, search still works.
  let categories: Category[] = [];
  try {
    categories = await getCategories();
  } catch (error) {
    console.error("Categories failed to load:", error);
  }

  const { products, total } = result;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const categoryName = filters.c ? (categories.find((c) => c.slug === filters.c)?.name ?? null) : null;
  const filtered = hasActiveFilters(filters);

  const from = (filters.page - 1) * PAGE_SIZE + 1;
  const to = from + products.length - 1;

  const heading = filters.k ? `Results for “${filters.k}”` : (categoryName ?? filters.c ?? "All products");

  let body: React.ReactNode;
  if (total === 0) {
    body = (
      <EmptyResults
        keyword={filters.k}
        filtered={filtered}
        clearHref={buildSearchHref({ ...filters, k: "", c: null, min: null, max: null, rating: null })}
        categories={categories}
      />
    );
  } else if (products.length === 0) {
    body = <OutOfRangePage total={total} firstPageHref={buildSearchHref(filters, { page: 1 })} />;
  } else {
    body = (
      <>
        {/* Product titles are h3s, so give them an h2 to sit under (the h1 is the page heading above). */}
        <h2 className="sr-only">Search results</h2>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {products.map((p, i) => (
            <li key={p.id}>
              <ProductCard product={p} priority={i < 4} />
            </li>
          ))}
        </ul>
        <Pagination filters={filters} totalPages={totalPages} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <FilterSidebar filters={filters} categories={categories} />

      <div className="min-w-0 flex-1">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2 rounded bg-surface px-4 py-3 shadow-sm">
          <div>
            <h1 className="text-lg font-bold">{heading}</h1>
            <p className="text-sm text-zinc-600" aria-live="polite">
              {products.length > 0
                ? `${from.toLocaleString("en-US")}–${to.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} results`
                : total === 0
                  ? "0 results"
                  : `${total.toLocaleString("en-US")} results`}
            </p>
          </div>
          <SortSelect
            value={filters.sort}
            options={SORTS.map((s) => ({ ...s, href: buildSearchHref(filters, { sort: s.value }) }))}
          />
        </div>

        <ActiveFilters filters={filters} categoryName={categoryName} />
        {body}
      </div>
    </div>
  );
}
