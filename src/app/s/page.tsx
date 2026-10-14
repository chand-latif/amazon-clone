import type { Metadata } from "next";
import { Suspense } from "react";
import { ResultsBoundary } from "@/components/search/ResultsBoundary";
import { SearchSkeleton } from "@/components/Skeletons";
import { SearchContent } from "./search-content";

export const metadata: Metadata = { title: "Search" };

// The outer Suspense covers the first load (and the client boundary's use of
// search params); ResultsBoundary re-keys an inner one so every filter, sort
// or page change shows the skeleton while new results stream in.
export default function SearchPage(props: PageProps<"/s">) {
  return (
    <Suspense fallback={<SearchSkeleton />}>
      <ResultsBoundary fallback={<SearchSkeleton />}>
        <SearchContent searchParams={props.searchParams} />
      </ResultsBoundary>
    </Suspense>
  );
}
