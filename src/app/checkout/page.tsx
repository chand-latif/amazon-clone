import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthSkeleton } from "@/components/Skeletons";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

// Placeholder so "Proceed to checkout" and "Buy Now" land somewhere real (and
// sign-in redirect-back has a destination). The real checkout is a later slice.
async function CheckoutContent() {
  await requireUser("/checkout");
  return (
    <div className="mx-auto max-w-xl rounded bg-surface px-6 py-12 text-center shadow-sm">
      <h1 className="text-2xl font-bold">Checkout is almost here</h1>
      <p className="mt-2 text-sm text-zinc-600">Your cart is saved to your account. Placing orders arrives in the next update.</p>
      <Link href="/cart" className="mt-5 inline-block rounded-full bg-accent px-5 py-2 text-sm font-medium text-navy hover:bg-accent-hover">
        Back to your cart
      </Link>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <CheckoutContent />
    </Suspense>
  );
}
