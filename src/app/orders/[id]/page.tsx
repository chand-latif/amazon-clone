import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { OrderDetails, StatusBadge, formatOrderDate } from "@/components/orders/OrderDetails";
import { AuthSkeleton } from "@/components/Skeletons";
import { requireUser } from "@/lib/auth";
import { getOrder } from "@/lib/orders";

export const metadata: Metadata = { title: "Order details", robots: { index: false } };

async function OrderContent({ params }: { params: PageProps<"/orders/[id]">["params"] }) {
  const { id } = await params;
  await requireUser(`/orders/${id}`);

  let order;
  try {
    order = await getOrder(id);
  } catch (error) {
    console.error("Order failed to load:", error);
    return (
      <div className="mx-auto max-w-xl rounded bg-surface p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold">We couldn&apos;t load this order</h1>
        <p className="mt-2 text-sm text-zinc-600">Please refresh the page in a moment.</p>
      </div>
    );
  }
  if (!order) notFound();

  return (
    <div className="space-y-4 py-2">
      <nav aria-label="Breadcrumb" className="text-xs text-zinc-600">
        <Link href="/orders" className="hover:text-price hover:underline">
          Your orders
        </Link>{" "}
        <span aria-hidden>›</span> Order #{order.orderNumber}
      </nav>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-2xl font-medium">Order #{order.orderNumber}</h1>
        <StatusBadge status={order.status} />
        <p className="text-sm text-zinc-600">Placed on {formatOrderDate(order.createdAt)}</p>
      </div>

      <OrderDetails order={order} />
    </div>
  );
}

export default function OrderPage(props: PageProps<"/orders/[id]">) {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <OrderContent params={props.params} />
    </Suspense>
  );
}
