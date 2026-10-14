"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CartSkeleton } from "@/components/Skeletons";
import { Price } from "@/components/Price";
import { MAX_QTY } from "@/lib/cart/storage";
import { dismissCartNotice, removeFromCart, setCartQuantity } from "@/lib/cart/store";
import { useCart } from "@/lib/cart/useCart";
import { useCartProducts } from "@/lib/cart/useCartProducts";
import { productImageUrl } from "@/lib/images";

export function CartView() {
  const cart = useCart();
  const ids = useMemo(() => cart.lines.map((l) => l.productId), [cart.lines]);
  const { status, products, isFresh, key, retry } = useCartProducts(ids);

  const [message, setMessage] = useState<string | null>(null); // polite screen-reader announcements
  const [cleanup, setCleanup] = useState<string | null>(null); // visible: what we changed for the user
  const cleanedKey = useRef<string | null>(null);

  // Once fresh product data is in, tidy the cart: drop products that no longer
  // exist and trim quantities to current stock. Only on a *successful* fetch,
  // so a network blip can never empty someone's cart.
  useEffect(() => {
    if (!isFresh || cleanedKey.current === key) return;
    cleanedKey.current = key;

    let removed = 0;
    let adjusted = 0;
    for (const line of cart.lines) {
      const p = products.get(line.productId);
      if (!p) {
        removed++;
        void removeFromCart(line.productId);
      } else if (p.stock > 0 && line.quantity > p.stock) {
        adjusted++;
        void setCartQuantity(line.productId, p.stock, p.stock);
      }
    }
    if (removed > 0 || adjusted > 0) {
      const parts = [
        removed > 0 ? `removed ${removed} item${removed === 1 ? "" : "s"} that ${removed === 1 ? "is" : "are"} no longer available` : null,
        adjusted > 0 ? `lowered ${adjusted} quantit${adjusted === 1 ? "y" : "ies"} to what's in stock` : null,
      ].filter(Boolean);
      setCleanup(`We ${parts.join(" and ")}.`);
    }
  }, [isFresh, key, cart.lines, products]);

  // Subtotal covers items that can actually be bought right now.
  const summary = useMemo(() => {
    let units = 0;
    let cents = 0;
    for (const line of cart.lines) {
      const p = products.get(line.productId);
      if (!p || p.stock < 1) continue;
      const q = Math.min(line.quantity, p.stock);
      units += q;
      cents += q * p.priceCents;
    }
    return { units, cents };
  }, [cart.lines, products]);

  if (cart.status === "loading") return <CartSkeleton />;

  if (cart.lines.length === 0) {
    return (
      <div className="mx-auto max-w-2xl rounded bg-surface px-6 py-12 text-center shadow-sm">
        {cart.error && <p role="alert" className="mb-4 rounded border border-price bg-red-50 p-3 text-sm text-price">{cart.error}</p>}
        <h1 className="text-2xl font-bold">Your cart is empty</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {cart.mode === "guest" ? "Add something to your cart, or sign in to see items you saved earlier." : "Items you add to your cart will show up here."}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href="/" className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-navy hover:bg-accent-hover">
            Continue shopping
          </Link>
          {cart.mode === "guest" && (
            <Link href="/signin?next=%2Fcart" className="rounded-full border border-zinc-400 px-5 py-2 text-sm hover:bg-zinc-100">
              Sign in
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (status === "loading") return <CartSkeleton rows={Math.min(cart.lines.length, 4)} />;

  if (status === "error") {
    return (
      <div className="mx-auto max-w-2xl rounded bg-surface px-6 py-12 text-center shadow-sm">
        <h1 className="text-xl font-bold">We couldn&apos;t load your cart items</h1>
        <p className="mt-2 text-sm text-zinc-600">Your items are safe. This is just a loading problem.</p>
        <button
          type="button"
          onClick={retry}
          className="mt-4 rounded-full bg-accent px-5 py-2 text-sm font-medium text-navy hover:bg-accent-hover"
        >
          Try again
        </button>
      </div>
    );
  }

  const canCheckout = summary.units > 0;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-labelledby="cart-heading" className="rounded bg-surface p-4 shadow-sm lg:p-6">
        <h1 id="cart-heading" className="mb-1 text-2xl font-medium">
          Shopping Cart
        </h1>

        {cart.error && (
          <p role="alert" className="my-3 rounded border border-price bg-red-50 p-3 text-sm text-price">
            {cart.error}
          </p>
        )}
        {cart.notice && (
          <p className="my-3 flex items-start justify-between gap-3 rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
            <span>{cart.notice}</span>
            <button type="button" onClick={dismissCartNotice} className="shrink-0 underline">
              Dismiss
            </button>
          </p>
        )}
        {cleanup && (
          <p className="my-3 flex items-start justify-between gap-3 rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
            <span>{cleanup}</span>
            <button type="button" onClick={() => setCleanup(null)} className="shrink-0 underline">
              Dismiss
            </button>
          </p>
        )}

        <ul className="mt-2 divide-y divide-zinc-200 border-t border-zinc-200">
          {cart.lines.map((line) => {
            const p = products.get(line.productId);
            if (!p) return null; // being removed by the tidy-up above
            const unavailable = p.stock < 1;
            const maxQty = Math.min(MAX_QTY, Math.max(p.stock, 1));
            const shown = Math.min(line.quantity, MAX_QTY);
            const options = Array.from({ length: Math.max(maxQty, shown) }, (_, i) => i + 1);

            return (
              <li key={line.productId} className="flex gap-4 py-4" data-testid="cart-line">
                <Link href={`/p/${p.slug}`} className="relative h-28 w-28 shrink-0 overflow-hidden rounded bg-white sm:h-32 sm:w-32" tabIndex={-1} aria-hidden>
                  {p.imagePath && (
                    <Image src={productImageUrl(p.imagePath)} alt="" fill sizes="128px" className="object-contain p-1" />
                  )}
                </Link>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-x-4">
                    <Link href={`/p/${p.slug}`} className="line-clamp-2 text-base font-medium hover:text-link hover:underline">
                      {p.title}
                    </Link>
                    <Price cents={p.priceCents} className="text-lg" />
                  </div>
                  {p.brand && <p className="text-xs text-zinc-500">{p.brand}</p>}

                  <p className={`mt-1 text-xs font-medium ${unavailable ? "text-price" : p.stock <= 5 ? "text-price" : "text-emerald-700"}`}>
                    {unavailable ? "Currently unavailable. It won't be included in your order." : p.stock <= 5 ? `Only ${p.stock} left in stock` : "In Stock"}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                    <label className="flex items-center gap-2">
                      <span className="sr-only">Quantity for {p.title}</span>
                      <span aria-hidden className="text-zinc-600">
                        Qty:
                      </span>
                      <select
                        value={shown}
                        disabled={unavailable}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          void setCartQuantity(p.id, next, maxQty);
                          setMessage(`Quantity of ${p.title} changed to ${next}.`);
                        }}
                        className="rounded-md border border-zinc-300 bg-zinc-100 px-2 py-1 hover:bg-zinc-200 disabled:opacity-50"
                      >
                        {options.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span aria-hidden className="text-zinc-300">
                      |
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void removeFromCart(p.id);
                        setMessage(`${p.title} was removed from your cart.`);
                      }}
                      className="text-link hover:text-price hover:underline"
                    >
                      Delete
                      <span className="sr-only"> {p.title}</span>
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-2 text-right text-lg">
          Subtotal ({summary.units} {summary.units === 1 ? "item" : "items"}):{" "}
          <Price cents={summary.cents} className="font-bold" />
        </p>
      </section>

      <aside aria-label="Order summary" className="rounded bg-surface p-4 shadow-sm lg:sticky lg:top-28">
        <p className="text-lg">
          Subtotal ({summary.units} {summary.units === 1 ? "item" : "items"}):{" "}
          <span data-testid="cart-subtotal">
            <Price cents={summary.cents} className="font-bold" />
          </span>
        </p>
        <p className="mt-1 text-xs text-zinc-600">Shipping and final prices are confirmed at checkout.</p>

        {canCheckout ? (
          <Link
            href="/checkout"
            className="mt-4 block rounded-full bg-accent px-4 py-2.5 text-center text-sm font-medium text-navy hover:bg-accent-hover"
          >
            Proceed to checkout
          </Link>
        ) : (
          <span className="mt-4 block cursor-not-allowed rounded-full bg-zinc-200 px-4 py-2.5 text-center text-sm font-medium text-zinc-500" aria-disabled>
            Nothing available to check out
          </span>
        )}

        {cart.mode === "guest" && (
          <p className="mt-4 border-t border-zinc-200 pt-3 text-xs text-zinc-600">
            Your cart is saved on this device.{" "}
            <Link href="/signin?next=%2Fcart" className="text-link underline">
              Sign in
            </Link>{" "}
            to keep it across devices.
          </p>
        )}
      </aside>

      <div role="status" aria-live="polite" className="sr-only">
        {message}
      </div>
    </div>
  );
}
