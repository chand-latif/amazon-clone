import Link from "next/link";
import { buildSearchHref, type SearchFilters } from "@/lib/search-params";

/** Page numbers to show: first, last, and a window around the current page. */
function pageList(current: number, last: number): (number | "…")[] {
  const pages = new Set([1, last, current - 1, current, current + 1].filter((p) => p >= 1 && p <= last));
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("…");
    out.push(p);
  });
  return out;
}

const base = "flex h-9 min-w-9 items-center justify-center rounded border px-3 text-sm";

export function Pagination({ filters, totalPages }: { filters: SearchFilters; totalPages: number }) {
  if (totalPages <= 1) return null;
  const { page } = filters;

  return (
    <nav aria-label="Pagination" className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
      {page > 1 ? (
        <Link href={buildSearchHref(filters, { page: page - 1 })} rel="prev" className={`${base} border-zinc-300 bg-surface hover:bg-zinc-50`}>
          ← Previous
        </Link>
      ) : (
        <span aria-disabled className={`${base} border-transparent text-zinc-400`}>
          ← Previous
        </span>
      )}

      {pageList(page, totalPages).map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} className="px-1 text-zinc-500" aria-hidden>
            …
          </span>
        ) : (
          <Link
            key={p}
            href={buildSearchHref(filters, { page: p })}
            aria-current={p === page ? "page" : undefined}
            aria-label={`Page ${p}`}
            className={`${base} ${p === page ? "border-accent bg-accent/20 font-bold" : "border-zinc-300 bg-surface hover:bg-zinc-50"}`}
          >
            {p}
          </Link>
        ),
      )}

      {page < totalPages ? (
        <Link href={buildSearchHref(filters, { page: page + 1 })} rel="next" className={`${base} border-zinc-300 bg-surface hover:bg-zinc-50`}>
          Next →
        </Link>
      ) : (
        <span aria-disabled className={`${base} border-transparent text-zinc-400`}>
          Next →
        </span>
      )}
    </nav>
  );
}
