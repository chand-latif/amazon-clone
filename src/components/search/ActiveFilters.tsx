import Link from "next/link";
import { DEFAULT_FILTERS, buildSearchHref, hasActiveFilters, type SearchFilters } from "@/lib/search-params";

function Chip({ label, href }: { label: string; href: string }) {
  return (
    <li>
      <Link
        href={href}
        aria-label={`Remove filter: ${label}`}
        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-surface px-3 py-1 text-xs hover:border-zinc-500"
      >
        {label}
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
          <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
        </svg>
      </Link>
    </li>
  );
}

function priceLabel(min: number | null, max: number | null) {
  if (min !== null && max !== null) return `$${min} – $${max}`;
  if (min !== null) return `$${min} & above`;
  return `Under $${max}`;
}

/** Removable chips for each active filter, plus "Clear all". */
export function ActiveFilters({ filters, categoryName }: { filters: SearchFilters; categoryName: string | null }) {
  if (!hasActiveFilters(filters)) return null;

  return (
    <ul aria-label="Active filters" className="mb-3 flex flex-wrap items-center gap-2">
      {filters.k && <Chip label={`“${filters.k}”`} href={buildSearchHref(filters, { k: "" })} />}
      {filters.c && <Chip label={categoryName ?? filters.c} href={buildSearchHref(filters, { c: null })} />}
      {(filters.min !== null || filters.max !== null) && (
        <Chip label={priceLabel(filters.min, filters.max)} href={buildSearchHref(filters, { min: null, max: null })} />
      )}
      {filters.rating !== null && (
        <Chip label={`${filters.rating}★ & up`} href={buildSearchHref(filters, { rating: null })} />
      )}
      <li>
        <Link
          href={buildSearchHref({ ...DEFAULT_FILTERS, sort: filters.sort })}
          className="text-xs text-link hover:underline"
        >
          Clear all
        </Link>
      </li>
    </ul>
  );
}
