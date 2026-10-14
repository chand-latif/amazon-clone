"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/format";
import { SITE_NAME } from "@/lib/site";

const MAX_PER_ORDER = 10; // matches cart_items.quantity check (1..10)

/**
 * Purchase panel: stock status, quantity, Add to Cart / Buy Now.
 * The buttons validate and announce, but the cart arrives in a later slice,
 * so they say so instead of pretending to work.
 */
export function BuyBox({
  title,
  priceCents,
  stock,
  delivery,
}: {
  title: string;
  priceCents: number;
  stock: number;
  /** e.g. "Ships in 3-5 business days", if the product has shipping info. */
  delivery: string | null;
}) {
  const maxQty = Math.min(MAX_PER_ORDER, stock);
  const [qty, setQty] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const available = stock > 0;
  const safeQty = Math.min(Math.max(qty, 1), Math.max(maxQty, 1));

  const act = (kind: "add" | "buy") => {
    if (!available) return;
    setNotice(
      kind === "add"
        ? `Cart isn't connected yet, so ${safeQty} × “${title}” wasn't added. It arrives in the next update.`
        : "Checkout isn't connected yet. It arrives in a later update.",
    );
  };

  return (
    <section aria-label="Purchase options" className="rounded border border-zinc-300 p-4">
      <p className="text-sm text-zinc-600">
        {safeQty > 1 ? `Total for ${safeQty} items` : "Total"}
      </p>
      <p className="text-2xl font-medium text-price">{formatPrice(priceCents * safeQty)}</p>

      {delivery && <p className="mt-2 text-sm text-zinc-700">{delivery}</p>}

      <p className={`mt-3 text-lg font-medium ${available ? (stock <= 5 ? "text-price" : "text-emerald-700") : "text-zinc-700"}`}>
        {!available ? "Currently unavailable" : stock <= 5 ? `Only ${stock} left in stock - order soon.` : "In Stock"}
      </p>

      {available && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <label htmlFor="qty" className="text-zinc-700">
            Quantity:
          </label>
          <select
            id="qty"
            value={safeQty}
            onChange={(e) => {
              setQty(Number(e.target.value));
              setNotice(null);
            }}
            className="rounded-md border border-zinc-300 bg-zinc-100 px-2 py-1.5 hover:bg-zinc-200"
          >
            {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-4 space-y-2">
        <button
          type="button"
          onClick={() => act("add")}
          disabled={!available}
          className="w-full rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-navy hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500"
        >
          Add to Cart
        </button>
        <button
          type="button"
          onClick={() => act("buy")}
          disabled={!available}
          className="w-full rounded-full bg-orange-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500"
        >
          Buy Now
        </button>
      </div>

      <p role="status" aria-live="polite" className={notice ? "mt-3 rounded bg-amber-50 p-2 text-xs text-amber-900" : "sr-only"}>
        {notice ?? ""}
      </p>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-zinc-200 pt-3 text-xs text-zinc-600">
        <dt>Ships from</dt>
        <dd>{SITE_NAME}</dd>
        <dt>Sold by</dt>
        <dd>{SITE_NAME}</dd>
        <dt>Payment</dt>
        <dd>Secure checkout (demo, no real charges)</dd>
      </dl>
    </section>
  );
}
