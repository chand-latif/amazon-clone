import { CATEGORIES } from "@/lib/site";

/**
 * Plain GET form to /s (built in the search slice), so it works without JS.
 * `c` is the category slug ("all" = every category); `k` is the keyword.
 */
export function SearchBar() {
  return (
    <form action="/s" method="get" role="search" className="flex h-10 w-full min-w-0 flex-1">
      <label htmlFor="search-category" className="sr-only">
        Search category
      </label>
      <select
        id="search-category"
        name="c"
        defaultValue="all"
        className="w-24 shrink-0 rounded-l-md border-r border-zinc-300 bg-zinc-100 px-2 text-sm text-zinc-700 hover:bg-zinc-200 sm:w-36"
      >
        <option value="all">All</option>
        {CATEGORIES.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name}
          </option>
        ))}
      </select>
      <label htmlFor="search-keyword" className="sr-only">
        Search products
      </label>
      <input
        id="search-keyword"
        name="k"
        type="search"
        placeholder="Search products"
        autoComplete="off"
        className="min-w-0 flex-1 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500"
      />
      <button
        type="submit"
        aria-label="Search"
        className="flex w-11 shrink-0 items-center justify-center rounded-r-md bg-accent text-navy hover:bg-accent-hover"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
      </button>
    </form>
  );
}
