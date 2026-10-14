"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type ProductInfo = {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  priceCents: number;
  stock: number;
  imagePath: string | null;
};

type Fetched = { key: string; status: "ready" | "error"; products: Map<string, ProductInfo> };

/**
 * Live product details (price, stock, image) for the lines in the cart. The cart
 * stores only ids and quantities, so this is where prices come from.
 * Removing a line never triggers a skeleton: the details we already have still cover the rest.
 */
export function useCartProducts(ids: string[]) {
  const key = useMemo(() => [...ids].sort().join(","), [ids]);
  const [fetched, setFetched] = useState<Fetched | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    createClient()
      .from("products")
      .select("id, slug, title, brand, price_cents, stock, product_images(path, position)")
      .in("id", key.split(","))
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          console.error("Cart products failed to load:", error?.message);
          setFetched({ key, status: "error", products: new Map() });
          return;
        }
        const products = new Map<string, ProductInfo>();
        for (const row of data) {
          const primary = [...row.product_images].sort((a, b) => a.position - b.position)[0];
          products.set(row.id, {
            id: row.id,
            slug: row.slug,
            title: row.title,
            brand: row.brand,
            priceCents: row.price_cents,
            stock: row.stock,
            imagePath: primary?.path ?? null,
          });
        }
        setFetched({ key, status: "ready", products });
      });
    return () => {
      cancelled = true;
    };
  }, [key, attempt]);

  const empty = key === "";
  const fresh = fetched?.key === key;
  const covered = fetched !== null && ids.every((id) => fetched.products.has(id));

  const status: "loading" | "ready" | "error" = empty
    ? "ready"
    : fresh
      ? fetched.status
      : covered
        ? "ready"
        : "loading";

  return {
    status,
    products: fetched?.products ?? new Map<string, ProductInfo>(),
    /** True only for a completed fetch of exactly the current set of ids. */
    isFresh: !empty && fresh && fetched.status === "ready",
    key,
    /** Start over (clears what we have; used after a load error). */
    retry: () => {
      setFetched(null);
      setAttempt((n) => n + 1);
    },
    /** Re-fetch in the background and swap the data in when it arrives (no loading state). */
    refresh: () => setAttempt((n) => n + 1),
  };
}
