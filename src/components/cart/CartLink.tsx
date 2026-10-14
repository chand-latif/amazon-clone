"use client";

import Link from "next/link";
import { useCartCount } from "@/lib/cart/useCart";

/** Header cart link with a live item count. */
export function CartLink() {
  // null until the cart is known: the server can't see localStorage, so we show
  // no number rather than a wrong "0" that flips after hydration.
  const count = useCartCount();
  const label = count === null ? "Cart" : `Cart, ${count} ${count === 1 ? "item" : "items"}`;

  return (
    <Link
      href="/cart"
      aria-label={label}
      className="flex items-end gap-1 rounded px-2 py-1 hover:outline hover:outline-1 hover:outline-white/60"
    >
      <span className="relative">
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M3 4h2.2l2.1 10.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="9.5" cy="19.2" r="1.3" />
          <circle cx="17" cy="19.2" r="1.3" />
        </svg>
        {count !== null && (
          <span
            aria-hidden
            data-testid="cart-count"
            className="absolute -top-1 left-3 min-w-5 rounded-full bg-accent px-1 text-center text-sm font-bold leading-5 text-navy"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </span>
      <span className="text-sm font-bold">Cart</span>
    </Link>
  );
}
