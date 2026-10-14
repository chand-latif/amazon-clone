import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthSkeleton } from "@/components/Skeletons";
import { requireUser } from "@/lib/auth";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Your orders", robots: { index: false } };

async function OrdersContent() {
  const { supabase } = await requireUser("/orders");

  // RLS limits this to the signed-in user's own orders; no user filter needed.
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, order_number, created_at, status, total_cents")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Orders failed to load:", error.message);
    return (
      <div className="mx-auto max-w-2xl rounded bg-surface p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold">We couldn&apos;t load your orders</h1>
        <p className="mt-2 text-sm text-zinc-600">Please refresh the page in a moment.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl py-4">
      <h1 className="mb-4 text-2xl font-medium">Your orders</h1>

      {orders.length === 0 ? (
        <div className="rounded bg-surface px-6 py-12 text-center shadow-sm">
          <h2 className="text-lg font-bold">No orders yet</h2>
          <p className="mt-2 text-sm text-zinc-600">When you place an order, it will show up here.</p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-full bg-accent px-5 py-2 text-sm font-medium text-navy hover:bg-accent-hover"
          >
            Start shopping
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded border border-zinc-300 bg-surface shadow-sm">
          {orders.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
              <div>
                <p className="font-bold">Order #{o.order_number}</p>
                <p className="text-zinc-600">
                  {new Date(o.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}
                </p>
              </div>
              <p className="capitalize text-zinc-700">{o.status}</p>
              <p className="font-medium">{formatPrice(o.total_cents)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <OrdersContent />
    </Suspense>
  );
}
