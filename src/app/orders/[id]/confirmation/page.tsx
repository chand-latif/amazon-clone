import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { OrderDetails, formatOrderDate } from "@/components/orders/OrderDetails";
import { AuthSkeleton } from "@/components/Skeletons";
import { requireUser } from "@/lib/auth";
import { getOrder } from "@/lib/orders";

export const metadata: Metadata = { title: "Order placed", robots: { index: false } };

async function ConfirmationContent({ params }: { params: PageProps<"/orders/[id]/confirmation">["params"] }) {
  const { id } = await params;
  await requireUser(`/orders/${id}/confirmation`);

  let order;
  try {
    order = await getOrder(id);
  } catch (error) {
    console.error("Confirmation failed to load:", error);
    return (
      <div className="mx-auto max-w-xl rounded bg-surface p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold">We couldn&apos;t load your confirmation</h1>
        <p className="mt-2 text-sm text-zinc-600">Your order was placed. You can see it in Your Orders.</p>
        <Link href="/orders" className="mt-4 inline-block rounded-full bg-accent px-5 py-2 text-sm font-medium text-navy hover:bg-accent-hover">
          Your orders
        </Link>
      </div>
    );
  }
  // Someone else's order and a nonexistent one look the same (RLS), so ids can't be probed.
  if (!order) notFound();

  return (
    <div className="space-y-4 py-2">
      <section aria-labelledby="thanks-heading" className="rounded border border-emerald-600 bg-emerald-50 p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <h1 id="thanks-heading" className="text-2xl font-bold text-emerald-900">
              Order placed, thank you!
            </h1>
            <p className="mt-1 text-sm text-emerald-950">
              Order <strong data-testid="order-number">#{order.orderNumber}</strong> · placed on {formatOrderDate(order.createdAt)} · Total{" "}
              <strong>{(order.totalCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}</strong>
            </p>
            <p className="mt-1 text-xs text-emerald-900">This is a demo store: nothing was charged and no email is sent.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href={`/orders/${order.id}`} className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-navy hover:bg-accent-hover">
                View order details
              </Link>
              <Link href="/" className="rounded-full border border-zinc-400 bg-white px-5 py-2 text-sm hover:bg-zinc-50">
                Continue shopping
              </Link>
            </div>
          </div>
        </div>
      </section>

      <OrderDetails order={order} />
    </div>
  );
}

export default function ConfirmationPage(props: PageProps<"/orders/[id]/confirmation">) {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <ConfirmationContent params={props.params} />
    </Suspense>
  );
}
