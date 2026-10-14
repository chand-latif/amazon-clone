// Search state lives entirely in the URL. This module is the single place that
// parses it (untrusted input -> validated filters) and builds it back into hrefs.
// Pure and client-safe: used by server components and client components alike.

export const PAGE_SIZE = 24;

export const SORTS = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "rating", label: "Avg. Customer Review" },
  { value: "newest", label: "Newest Arrivals" },
] as const;

export type SortValue = (typeof SORTS)[number]["value"];

export type SearchFilters = {
  /** Keyword, trimmed. Empty string = no keyword. */
  k: string;
  /** Category slug, or null for all categories. */
  c: string | null;
  /** Price bounds in whole dollars (inclusive), or null. */
  min: number | null;
  max: number | null;
  /** Minimum average rating (1-4), or null. */
  rating: number | null;
  sort: SortValue;
  /** 1-based page number. */
  page: number;
};

export type RawSearchParams = Record<string, string | string[] | undefined>;

export const DEFAULT_FILTERS: SearchFilters = {
  k: "",
  c: null,
  min: null,
  max: null,
  rating: null,
  sort: "featured",
  page: 1,
};

const MAX_PRICE_DOLLARS = 100_000;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseMoney(value: string | undefined) {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(Math.round(n * 100) / 100, MAX_PRICE_DOLLARS);
}

export function parseSearchParams(raw: RawSearchParams): SearchFilters {
  const k = (first(raw.k) ?? "").replace(/\s+/g, " ").trim().slice(0, 100);

  const cRaw = (first(raw.c) ?? "").trim().toLowerCase();
  const c = /^[a-z0-9-]{1,60}$/.test(cRaw) && cRaw !== "all" ? cRaw : null;

  let min = parseMoney(first(raw.min));
  let max = parseMoney(first(raw.max));
  if (min !== null && max !== null && min > max) [min, max] = [max, min];

  const ratingRaw = Number(first(raw.rating));
  const rating = Number.isInteger(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 4 ? ratingRaw : null;

  const sortRaw = first(raw.sort);
  const sort = SORTS.find((s) => s.value === sortRaw)?.value ?? "featured";

  const pageRaw = Number(first(raw.page));
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? Math.min(pageRaw, 1000) : 1;

  return { k, c, min, max, rating, sort, page };
}

/**
 * Href for `base` with `changes` applied. Defaults are omitted so URLs stay
 * short. Any change other than `page` resets to page 1.
 */
export function buildSearchHref(base: SearchFilters, changes: Partial<SearchFilters> = {}) {
  const next: SearchFilters = { ...base, ...changes };
  if (!("page" in changes)) next.page = 1;

  const params = new URLSearchParams();
  if (next.k) params.set("k", next.k);
  if (next.c) params.set("c", next.c);
  if (next.min !== null) params.set("min", String(next.min));
  if (next.max !== null) params.set("max", String(next.max));
  if (next.rating !== null) params.set("rating", String(next.rating));
  if (next.sort !== "featured") params.set("sort", next.sort);
  if (next.page > 1) params.set("page", String(next.page));

  const qs = params.toString();
  return qs ? `/s?${qs}` : "/s";
}

export function hasActiveFilters(f: SearchFilters) {
  return Boolean(f.k || f.c || f.min !== null || f.max !== null || f.rating !== null);
}
