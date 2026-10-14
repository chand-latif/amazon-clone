import Image from "next/image";
import Link from "next/link";
import { Price } from "@/components/Price";
import { countryName } from "@/lib/countries";
import { formatPrice } from "@/lib/format";
import { productImageUrl } from "@/lib/images";
import type { Order } from "@/lib/orders";

/** Fixed zone + locale so the server and any client always agree. */
export function formatOrderDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

const STATUS_STYLES: Record<string, string> = {
  placed: "bg-sky-100 text-sky-900",
  shipped: "bg-indigo-100 text-indigo-900",
  delivered: "bg-emerald-100 text-emerald-900",
  cancelled: "bg-zinc-200 text-zinc-700",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${STATUS_STYLES[status] ?? "bg-zinc-200 text-zinc-700"}`}>
      {status}
    </span>
  );
}

/**
 * Everything about one order, rendered purely from the snapshots stored on it
 * (titles, prices, images, address), so later catalog or address edits never
 * change what the customer sees.
 */
export function OrderDetails({ order }: { order: Order }) {
  const a = order.address;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-labelledby="items-heading" className="rounded bg-surface p-4 shadow-sm lg:p-6">
        <h2 id="items-heading" className="mb-3 text-lg font-bold">
          Items in this order
        </h2>
        <ul className="divide-y divide-zinc-200">
          {order.items.map((item) => (
            <li key={item.id} className="flex gap-4 py-4 first:pt-0" data-testid="order-item">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded bg-white">
                {item.imagePath && <Image src={productImageUrl(item.imagePath)} alt="" fill sizes="80px" className="object-contain p-1" />}
              </div>
              <div className="min-w-0 flex-1 text-sm">
                {item.productSlug ? (
                  <Link href={`/p/${item.productSlug}`} className="line-clamp-2 font-medium hover:text-link hover:underline">
                    {item.title}
                  </Link>
                ) : (
                  <p className="line-clamp-2 font-medium">{item.title}</p>
                )}
                <p className="text-zinc-600">
                  Qty: {item.quantity} × {formatPrice(item.unitPriceCents)}
                </p>
                {item.productSlug && (
                  <Link href={`/p/${item.productSlug}`} className="mt-1 inline-block text-link hover:text-price hover:underline">
                    Buy it again
                  </Link>
                )}
              </div>
              <Price cents={item.unitPriceCents * item.quantity} className="text-base" />
            </li>
          ))}
        </ul>
      </section>

      <aside aria-label="Order information" className="space-y-4">
        <section aria-labelledby="ship-heading" className="rounded bg-surface p-4 shadow-sm">
          <h2 id="ship-heading" className="mb-2 text-base font-bold">
            Shipping address
          </h2>
          <address className="text-sm not-italic leading-relaxed">
            <span className="block font-bold">{a.full_name}</span>
            <span className="block">{a.line1}</span>
            {a.line2 && <span className="block">{a.line2}</span>}
            <span className="block">
              {a.city}, {a.region} {a.postal_code}
            </span>
            <span className="block">{countryName(a.country)}</span>
            {a.phone && <span className="block text-zinc-600">Phone: {a.phone}</span>}
          </address>
        </section>

        <section aria-labelledby="pay-heading" className="rounded bg-surface p-4 shadow-sm">
          <h2 id="pay-heading" className="mb-2 text-base font-bold">
            Payment
          </h2>
          <p className="text-sm">{order.paymentMethod === "mock" ? "Demo payment (no real charge)" : order.paymentMethod}</p>
        </section>

        <section aria-labelledby="sum-heading" className="rounded bg-surface p-4 shadow-sm">
          <h2 id="sum-heading" className="mb-2 text-base font-bold">
            Order summary
          </h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>Items:</dt>
              <dd>{formatPrice(order.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Shipping:</dt>
              <dd>{order.shippingCents === 0 ? "FREE" : formatPrice(order.shippingCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Tax:</dt>
              <dd>{formatPrice(order.taxCents)}</dd>
            </div>
            <div className="flex justify-between border-t border-zinc-200 pt-2 text-base font-bold">
              <dt>Order total:</dt>
              <dd data-testid="order-total">{formatPrice(order.totalCents)}</dd>
            </div>
          </dl>
        </section>
      </aside>
    </div>
  );
}
