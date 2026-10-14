"use client";

import { useSearchParams } from "next/navigation";
import { SearchForm } from "./SearchForm";

/**
 * Header search box that mirrors the current URL (keyword + category), so after
 * searching, the box still shows what you searched for. Must sit inside <Suspense>
 * because it reads search params; the header supplies a static SearchForm as fallback.
 */
export function SearchBar() {
  const params = useSearchParams();
  const k = params.get("k") ?? "";
  const c = params.get("c") ?? "all";
  // key: remount when the URL changes so the uncontrolled inputs pick up new defaults.
  return <SearchForm key={`${k}|${c}`} defaultKeyword={k} defaultCategory={c} />;
}
