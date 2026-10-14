"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export type SortOption = { value: string; label: string; href: string };

/** Sort dropdown. Navigates to a server-built href, so the URL stays the source of truth. */
export function SortSelect({ value, options }: { value: string; options: SortOption[] }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor="sort-select" className="whitespace-nowrap text-zinc-600">
        Sort by:
      </label>
      <select
        id="sort-select"
        value={value}
        onChange={(e) => {
          const href = options.find((o) => o.value === e.target.value)?.href;
          if (href) router.push(href);
        }}
        className="rounded-md border border-zinc-300 bg-zinc-100 px-2 py-1.5 text-sm hover:bg-zinc-200"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <noscript>
        <ul className="flex gap-2">
          {options.map((o) => (
            <li key={o.value}>
              <Link href={o.href} className="text-link underline">
                {o.label}
              </Link>
            </li>
          ))}
        </ul>
      </noscript>
    </div>
  );
}
