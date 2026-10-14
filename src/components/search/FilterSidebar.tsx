import Link from "next/link";
import { StarRating } from "@/components/StarRating";
import type { Category } from "@/lib/catalog";
import { buildSearchHref, type SearchFilters } from "@/lib/search-params";

const PRICE_PRESETS: { label: string; min: number | null; max: number | null }[] = [
  { label: "Under $25", min: null, max: 25 },
  { label: "$25 to $50", min: 25, max: 50 },
  { label: "$50 to $100", min: 50, max: 100 },
  { label: "$100 to $200", min: 100, max: 200 },
  { label: "$200 & above", min: 200, max: null },
];

const RATING_OPTIONS = [4, 3, 2, 1];

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1.5 mt-4 text-sm font-bold first:mt-0">{children}</h3>;
}

function optionClass(active: boolean) {
  return `block rounded px-1 py-0.5 text-sm hover:text-price ${active ? "font-bold text-foreground" : "text-zinc-700"}`;
}

function FilterGroups({ filters, categories, idPrefix }: { filters: SearchFilters; categories: Category[]; idPrefix: string }) {
  return (
    <div>
      <Heading>Department</Heading>
      <ul>
        <li>
          <Link href={buildSearchHref(filters, { c: null })} className={optionClass(!filters.c)} aria-current={!filters.c}>
            All departments
          </Link>
        </li>
        {categories.map((c) => (
          <li key={c.slug}>
            <Link
              href={buildSearchHref(filters, { c: c.slug })}
              className={optionClass(filters.c === c.slug)}
              aria-current={filters.c === c.slug}
            >
              {c.name}
            </Link>
          </li>
        ))}
      </ul>

      <Heading>Customer Reviews</Heading>
      <ul>
        {RATING_OPTIONS.map((r) => (
          <li key={r}>
            <Link
              href={buildSearchHref(filters, { rating: filters.rating === r ? null : r })}
              className={`${optionClass(filters.rating === r)} flex items-center gap-1.5`}
              aria-current={filters.rating === r}
            >
              <StarRating rating={r} />
              <span>&amp; Up</span>
            </Link>
          </li>
        ))}
      </ul>

      <Heading>Price</Heading>
      <ul>
        {PRICE_PRESETS.map((p) => {
          const active = filters.min === p.min && filters.max === p.max;
          return (
            <li key={p.label}>
              <Link
                href={buildSearchHref(filters, active ? { min: null, max: null } : { min: p.min, max: p.max })}
                className={optionClass(active)}
                aria-current={active}
              >
                {p.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Custom range: plain GET form (works without JS); other filters ride along as hidden fields. */}
      <form action="/s" method="get" className="mt-2 flex items-end gap-1.5">
        {filters.k && <input type="hidden" name="k" value={filters.k} />}
        {filters.c && <input type="hidden" name="c" value={filters.c} />}
        {filters.rating !== null && <input type="hidden" name="rating" value={filters.rating} />}
        {filters.sort !== "featured" && <input type="hidden" name="sort" value={filters.sort} />}
        <div>
          <label htmlFor={`${idPrefix}-min`} className="sr-only">
            Minimum price in dollars
          </label>
          <input
            id={`${idPrefix}-min`}
            name="min"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            placeholder="$ Min"
            defaultValue={filters.min ?? ""}
            className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-max`} className="sr-only">
            Maximum price in dollars
          </label>
          <input
            id={`${idPrefix}-max`}
            name="max"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            placeholder="$ Max"
            defaultValue={filters.max ?? ""}
            className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm"
          />
        </div>
        <button type="submit" className="rounded-full border border-zinc-400 px-3 py-1 text-sm hover:bg-zinc-100">
          Go
        </button>
      </form>
    </div>
  );
}

/** Left-hand filters. Collapsible panel on small screens, always visible from lg up. */
export function FilterSidebar({ filters, categories }: { filters: SearchFilters; categories: Category[] }) {
  return (
    <aside aria-label="Filters" className="shrink-0 lg:w-56">
      <details className="rounded bg-surface p-3 shadow-sm lg:hidden">
        <summary className="cursor-pointer text-sm font-bold">Filters</summary>
        <div className="mt-3">
          <FilterGroups filters={filters} categories={categories} idPrefix="m" />
        </div>
      </details>
      <div className="hidden lg:block">
        <FilterGroups filters={filters} categories={categories} idPrefix="d" />
      </div>
    </aside>
  );
}
