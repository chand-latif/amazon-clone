"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

/**
 * Re-keys the Suspense boundary on every URL change, so changing a filter, sort
 * or page shows the skeleton while the new results stream in, instead of
 * freezing the old results with no feedback.
 */
export function ResultsBoundary({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const key = useSearchParams().toString();
  return (
    <Suspense key={key} fallback={fallback}>
      {children}
    </Suspense>
  );
}
