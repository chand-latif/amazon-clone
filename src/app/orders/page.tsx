import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { StatusBadge, formatOrderDate } from "@/components/orders/OrderDetails";
import { AuthSkeleton } from "@/components/Skeletons";
import { requireUser } from "@/lib/auth";
import { formatPrice } from "@/lib/format";
import { productImageUrl } from "@/lib/images";
import { ORDERS_PER_PAGE, getOrders, type Order } from "@/lib/orders";

export const metadata: Metadata = { title: "Your orders", robots: { index: false } };

const MAX_PREVIEW_ITEMS = 4;

function parsePage(value: string | string[] | undefined) {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, 1000) : 1;
}

function OrderCard({ order }: { order: Order }) {
  const shown = order.items.slice(0, MAX_PREVIEW_ITEMS);
  const hidden = order.items.length - shown.length;
  return (
    <li className="overflow-hidden rounded border border-zinc-300 bg-surface shadow-sm" data-testid="order-card">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-2 border-b border-zinc-300 bg-zinc-100 p-4 text-xs text-zinc-700">
        <div>
          <p className="uppercase tracking-wide">Order placed</p>
          <p className="text-sm text-foreground">{formatOrderDate(order.createdAt)}</p>
        </div>
        <div>
          <p className="uppercase tracking-wide">Total</p>
          <p className="text-sm text-foreground">{formatPrice(order.totalCents)}</p>
        </div>
        <div>
          <p className="uppercase tracking-wide">Ship to</p>
          <p className="text-sm text-foreground">{order.address.full_name}</p>
        </div>
        <div className="sm:ml-auto sm:text-right">
          <p className="uppercase tracking-wide">Order # {order.orderNumber}</p>
          <Link href={`/orders/${order.id}`} className="text-sm text-link hover:text-price hover:underline">
            View order details
          </Link>
        </div>
      </div>

      <div className="p-4">
        <div className="mb-3">
          <StatusBadge status={order.status} />
        </div>
        <ul className="space-y-3">
          {shown.map((item) => (
            <li key={item.id} className="flex items-center gap-3">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded bg-white">
                {item.imagePath && <Image src={productImageUrl(item.imagePath)} alt="" fill sizes="64px" className="object-contain p-0.5" />}
              </div>
              <div className="min-w-0 flex-1 text-sm">
                {item.productSlug ? (
                  <Link href={`/p/${item.productSlug}`} className="line-clamp-2 hover:text-link hover:underline">
                    {item.title}
                  </Link>
                ) : (
                  <p className="line-clamp-2">{item.title}</p>
                )}
                <p className="text-xs text-zinc-600">Qty: {item.quantity}</p>
              </div>
              {item.productSlug && (
                <Link href={`/p/${item.productSlug}`} className="hidden shrink-0 rounded-full border border-zinc-400 px-3 py-1 text-xs hover:bg-zinc-100 sm:block">
                  Buy it again
                </Link>
              )}
            </li>
          ))}
        </ul>
        {hidden > 0 && (
          <p className="mt-3 text-xs text-zinc-600">
            + {hidden} more item{hidden === 1 ? "" : "s"}.{" "}
            <Link href={`/orders/${order.id}`} className="text-link underline">
              See all
            </Link>
          </p>
        )}
      </div>
    </li>
  );
}

function Pager({ page, totalPages }: { page: number; totalPages: number }) {
  if (totalPages <= 1) return null;
  const href = (p: number) => (p <= 1 ? "/orders" : `/orders?page=${p}`);
  const base = "rounded border px-4 py-2 text-sm";
  return (
    <nav aria-label="Order pages" className="mt-6 flex items-center justify-center gap-3">
      {page > 1 ? (
        <Link href={href(page - 1)} rel="prev" className={`${base} border-zinc-300 bg-surface hover:bg-zinc-50`}>
          ← Newer orders
        </Link>
      ) : (
        <span aria-disabled className={`${base} border-transparent text-zinc-400`}>
          ← Newer orders
        </span>
      )}
      <span className="text-sm text-zinc-600">
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={href(page + 1)} rel="next" className={`${base} border-zinc-300 bg-surface hover:bg-zinc-50`}>
          Older orders →
        </Link>
      ) : (
        <span aria-disabled className={`${base} border-transparent text-zinc-400`}>
          Older orders →
        </span>
      )}
    </nav>
  );
}

async function OrdersContent({ searchParams }: { searchParams: PageProps<"/orders">["searchParams"] }) {
  const page = parsePage((await searchParams).page);
  await requireUser(page > 1 ? `/orders?page=${page}` : "/orders");

  let result;
  try {
    result = await getOrders(page);
  } catch (error) {
    console.error("Orders failed to load:", error);
    return (
      <div className="mx-auto max-w-2xl rounded bg-surface p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold">We couldn&apos;t load your orders</h1>
        <p className="mt-2 text-sm text-zinc-600">Please refresh the page in a moment.</p>
      </div>
    );
  }

  const { orders, total } = result;
  const totalPages = Math.max(1, Math.ceil(total / ORDERS_PER_PAGE));

  return (
    <div className="mx-auto w-full max-w-4xl py-4">
      <h1 className="mb-4 text-2xl font-medium">Your orders</h1>

      {total === 0 ? (
        <div className="rounded bg-surface px-6 py-12 text-center shadow-sm">
          <h2 className="text-lg font-bold">No orders yet</h2>
          <p className="mt-2 text-sm text-zinc-600">When you place an order, it will show up here.</p>
          <Link href="/" className="mt-4 inline-block rounded-full bg-accent px-5 py-2 text-sm font-medium text-navy hover:bg-accent-hover">
            Start shopping
          </Link>
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded bg-surface px-6 py-12 text-center shadow-sm">
          <h2 className="text-lg font-bold">That page doesn&apos;t exist</h2>
          <p className="mt-2 text-sm text-zinc-600">You have {total} order{total === 1 ? "" : "s"}, which doesn&apos;t reach this page.</p>
          <Link href="/orders" className="mt-4 inline-block rounded-full bg-accent px-5 py-2 text-sm font-medium text-navy hover:bg-accent-hover">
            Back to your orders
          </Link>
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-zinc-600" aria-live="polite">
            {total} order{total === 1 ? "" : "s"}
          </p>
          <ul className="space-y-4">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </ul>
          <Pager page={page} totalPages={totalPages} />
        </>
      )}
    </div>
  );
}

export default function OrdersPage(props: PageProps<"/orders">) {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <OrdersContent searchParams={props.searchParams} />
    </Suspense>
  );
}
