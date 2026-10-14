"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MAX_QTY } from "@/lib/cart/storage";
import { addToCart, type AddResult } from "@/lib/cart/store";
import { useCart } from "@/lib/cart/useCart";
import { formatPrice } from "@/lib/format";
import { SITE_NAME } from "@/lib/site";

/** Purchase panel: stock status, quantity, Add to Cart / Buy Now, wired to the real cart. */
export function BuyBox({
  productId,
  priceCents,
  stock,
  delivery,
}: {
  productId: string;
  priceCents: number;
  stock: number;
  /** e.g. "Ships in 3-5 business days", if the product has shipping info. */
  delivery: string | null;
}) {
  const router = useRouter();
  const cart = useCart();
  const limit = Math.min(MAX_QTY, stock); // most of this product one cart can hold
  const [qty, setQty] = useState(1);
  const [pending, setPending] = useState<"add" | "buy" | null>(null);
  const [result, setResult] = useState<AddResult | null>(null);
  const [failed, setFailed] = useState(false);

  const available = stock > 0;
  const safeQty = Math.min(Math.max(qty, 1), Math.max(limit, 1));
  const inCart = cart.lines.find((l) => l.productId === productId)?.quantity ?? 0;
  const atLimit = available && inCart >= limit;

  const act = async (kind: "add" | "buy") => {
    if (!available || pending) return;
    setPending(kind);
    setFailed(false);
    try {
      const outcome = await addToCart(productId, safeQty, limit);
      if (kind === "buy") {
        router.push("/checkout");
        return;
      }
      setResult(outcome);
    } catch (error) {
      console.error("Add to cart failed:", error);
      setFailed(true);
    } finally {
      setPending(null);
    }
  };

  return (
    <section aria-label="Purchase options" className="rounded border border-zinc-300 p-4">
      <p className="text-sm text-zinc-600">{safeQty > 1 ? `Total for ${safeQty} items` : "Total"}</p>
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
              setResult(null);
            }}
            className="rounded-md border border-zinc-300 bg-zinc-100 px-2 py-1.5 hover:bg-zinc-200"
          >
            {Array.from({ length: limit }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {inCart > 0 && <span className="text-xs text-zinc-600">({inCart} in your cart)</span>}
        </div>
      )}

      <div className="mt-4 space-y-2">
        <button
          type="button"
          onClick={() => act("add")}
          disabled={!available || atLimit || pending !== null}
          className="w-full rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-navy hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500"
        >
          {pending === "add" ? "Adding…" : "Add to Cart"}
        </button>
        <button
          type="button"
          onClick={() => act("buy")}
          disabled={!available || atLimit || pending !== null}
          className="w-full rounded-full bg-orange-500 px-4 py-2.5 text-sm font-medium text-navy hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500"
        >
          {pending === "buy" ? "One moment…" : "Buy Now"}
        </button>
      </div>
      {atLimit && (
        <p className="mt-2 text-xs text-zinc-600">
          You have the maximum available ({limit}) of this item in your cart.
        </p>
      )}

      {/* Announced to screen readers when it changes. */}
      <div role="status" aria-live="polite">
        {result && (
          <div className="mt-3 rounded border border-emerald-600 bg-emerald-50 p-3 text-sm text-emerald-900">
            <p className="font-bold">
              {result.clamped ? `Cart updated: ${result.quantity} in your cart` : "Added to Cart"}
            </p>
            {result.clamped && (
              <p className="mt-1 text-xs">That&apos;s the most you can have of this item ({limit}), so we stopped there.</p>
            )}
            <Link href="/cart" className="mt-2 inline-block text-link underline">
              Go to Cart ({cart.count} {cart.count === 1 ? "item" : "items"})
            </Link>
          </div>
        )}
        {failed && (
          <p className="mt-3 rounded border border-price bg-red-50 p-2 text-xs text-price">
            We couldn&apos;t add that to your cart. Please try again.
          </p>
        )}
      </div>

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
