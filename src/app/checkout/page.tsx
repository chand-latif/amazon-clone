import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckoutView } from "@/components/checkout/CheckoutView";
import { AuthSkeleton } from "@/components/Skeletons";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

async function CheckoutContent() {
  // Real access check; the proxy's redirect is only an optimisation.
  const { supabase } = await requireUser("/checkout");

  // RLS limits this to the caller's own addresses.
  const { data: addresses, error } = await supabase
    .from("addresses")
    .select("id, full_name, line1, line2, city, region, postal_code, country, phone, is_default")
    .order("is_default", { ascending: false })
    .order("full_name")
    .order("id");

  if (error) {
    console.error("Addresses failed to load:", error.message);
    return (
      <div className="mx-auto max-w-xl rounded bg-surface p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold">We couldn&apos;t load checkout</h1>
        <p className="mt-2 text-sm text-zinc-600">Please refresh the page in a moment.</p>
      </div>
    );
  }

  // The cart itself lives client-side (it may still be merging after sign-in),
  // so CheckoutView reads it from the cart store.
  return <CheckoutView addresses={addresses} />;
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <CheckoutContent />
    </Suspense>
  );
}
