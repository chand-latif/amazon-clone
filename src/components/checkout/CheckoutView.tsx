"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { deleteAddress, placeOrder, type PlaceOrderResult } from "@/app/checkout/actions";
import { Price } from "@/components/Price";
import { CartSkeleton } from "@/components/Skeletons";
import { reloadCart } from "@/lib/cart/store";
import { useCart } from "@/lib/cart/useCart";
import { useCartProducts } from "@/lib/cart/useCartProducts";
import { countryName } from "@/lib/countries";
import { formatPrice } from "@/lib/format";
import { productImageUrl } from "@/lib/images";
import { computeTotals, untilFreeShippingCents } from "@/lib/pricing";
import { randomUuid } from "@/lib/uuid";
import { AddressForm } from "./AddressForm";

export type CheckoutAddress = {
  id: string;
  full_name: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  phone: string | null;
  is_default: boolean;
};

type PaymentChoice = "approve" | "decline";

const PAYMENT_OPTIONS: { id: PaymentChoice; label: string; note: string }[] = [
  { id: "approve", label: "Demo card ending 4242", note: "The payment goes through." },
  { id: "decline", label: "Demo card ending 0002", note: "Simulates a declined card, to see the error state." },
];

type Failure = Extract<PlaceOrderResult, { ok: false }> | { ok: false; code: "payment"; message: string };

function StepHeading({ n, id, children }: { n: number; id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-3 flex items-center gap-3 text-lg font-bold">
      <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-navy text-sm text-white">
        {n}
      </span>
      {children}
    </h2>
  );
}

export function CheckoutView({ addresses }: { addresses: CheckoutAddress[] }) {
  const router = useRouter();
  const cart = useCart();
  const ids = useMemo(() => cart.lines.map((l) => l.productId), [cart.lines]);
  const { status: productStatus, products, retry, refresh } = useCartProducts(ids);

  const [chosenId, setChosenId] = useState<string | null>(null);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [payment, setPayment] = useState<PaymentChoice>("approve");
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  // One key per checkout visit: a retry or double-click can never create a second order.
  const [idempotencyKey] = useState(() => randomUuid());

  // Derived, not synced: the chosen address wins, then one just added, then the default.
  const selected =
    addresses.find((a) => a.id === chosenId) ??
    addresses.find((a) => a.id === justAddedId) ??
    addresses.find((a) => a.is_default) ??
    addresses[0] ??
    null;
  const showAddressForm = adding || addresses.length === 0;

  const rows = cart.lines.map((line) => {
    const p = products.get(line.productId);
    const problem: "missing" | "unavailable" | "limited" | null = !p
      ? "missing"
      : p.stock < 1
        ? "unavailable"
        : line.quantity > p.stock
          ? "limited"
          : null;
    return { line, p, problem };
  });
  const blocking = rows.filter((r) => r.problem);
  const subtotalCents = rows.reduce((sum, r) => (r.p && !r.problem ? sum + r.p.priceCents * r.line.quantity : sum), 0);
  const totals = computeTotals(subtotalCents);
  const unitCount = rows.reduce((n, r) => (r.problem ? n : n + r.line.quantity), 0);
  const moreForFreeShipping = untilFreeShippingCents(subtotalCents);

  if (cart.status === "loading" || cart.mode !== "user") return <CartSkeleton />;

  if (cart.lines.length === 0) {
    return (
      <div className="mx-auto max-w-xl rounded bg-surface px-6 py-12 text-center shadow-sm">
        <h1 className="text-2xl font-bold">Your cart is empty</h1>
        <p className="mt-2 text-sm text-zinc-600">There&apos;s nothing to check out. If you just placed an order, you&apos;ll find it in Your Orders.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href="/" className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-navy hover:bg-accent-hover">
            Continue shopping
          </Link>
          <Link href="/orders" className="rounded-full border border-zinc-400 px-5 py-2 text-sm hover:bg-zinc-100">
            Your orders
          </Link>
        </div>
      </div>
    );
  }

  if (productStatus === "loading") return <CartSkeleton rows={Math.min(cart.lines.length, 3)} />;

  if (productStatus === "error") {
    return (
      <div className="mx-auto max-w-xl rounded bg-surface px-6 py-12 text-center shadow-sm">
        <h1 className="text-xl font-bold">We couldn&apos;t load your order</h1>
        <p className="mt-2 text-sm text-zinc-600">Nothing has been charged. This is just a loading problem.</p>
        <button type="button" onClick={retry} className="mt-4 rounded-full bg-accent px-5 py-2 text-sm font-medium text-navy hover:bg-accent-hover">
          Try again
        </button>
      </div>
    );
  }

  const canPlace = Boolean(selected) && blocking.length === 0 && unitCount > 0 && !submitting;

  async function onPlaceOrder() {
    if (!selected || !canPlace) return;
    setFailure(null);

    if (payment === "decline") {
      setFailure({ ok: false, code: "payment", message: "Your demo card was declined. Choose another payment method and try again. You haven't been charged." });
      return;
    }

    setSubmitting(true);
    const result = await placeOrder({ addressId: selected.id, expectedTotalCents: totals.totalCents, idempotencyKey });

    if (result.ok) {
      // The server emptied the cart; bring the badge and cart page in line before we leave.
      await reloadCart();
      router.push(`/orders/${result.orderId}/confirmation`);
      return; // stay in the submitting state while navigating, so it can't be clicked twice
    }

    setFailure(result);
    // Prices or stock moved: show the user the current numbers.
    if (result.code === "price_changed" || result.code === "cart_unavailable") refresh();
    setSubmitting(false);
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]" aria-busy={submitting}>
      <div className="space-y-4">
        <h1 className="text-2xl font-medium">Checkout</h1>

        {/* 1. Shipping address */}
        <section aria-labelledby="step-address" className="rounded bg-surface p-4 shadow-sm lg:p-6">
          <StepHeading n={1} id="step-address">
            Shipping address
          </StepHeading>

          {addresses.length > 0 && (
            <fieldset>
              <legend className="sr-only">Choose a shipping address</legend>
              <ul className="space-y-2">
                {addresses.map((a) => (
                  <li
                    key={a.id}
                    className={`flex items-start gap-3 rounded border p-3 ${selected?.id === a.id ? "border-accent bg-amber-50" : "border-zinc-300"}`}
                  >
                    <input
                      type="radio"
                      name="shipping-address"
                      id={`addr-${a.id}`}
                      checked={selected?.id === a.id}
                      onChange={() => setChosenId(a.id)}
                      className="mt-1"
                    />
                    <label htmlFor={`addr-${a.id}`} className="min-w-0 flex-1 cursor-pointer text-sm">
                      <span className="block font-bold">{a.full_name}</span>
                      <span className="block">{a.line1}</span>
                      {a.line2 && <span className="block">{a.line2}</span>}
                      <span className="block">
                        {a.city}, {a.region} {a.postal_code}
                      </span>
                      <span className="block">{countryName(a.country)}</span>
                      {a.phone && <span className="block text-zinc-600">Phone: {a.phone}</span>}
                    </label>
                    <form action={deleteAddress}>
                      <input type="hidden" name="addressId" value={a.id} />
                      <button type="submit" className="text-sm text-link hover:text-price hover:underline">
                        Delete<span className="sr-only"> address for {a.full_name}</span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}

          {showAddressForm ? (
            <div className={addresses.length > 0 ? "mt-3" : ""}>
              <AddressForm
                onSaved={(id) => {
                  setJustAddedId(id);
                  setChosenId(id);
                  setAdding(false);
                }}
                onCancel={addresses.length > 0 ? () => setAdding(false) : undefined}
              />
            </div>
          ) : (
            <button type="button" onClick={() => setAdding(true)} className="mt-3 text-sm text-link hover:text-price hover:underline">
              + Add a new address
            </button>
          )}
        </section>

        {/* 2. Payment */}
        <section aria-labelledby="step-payment" className="rounded bg-surface p-4 shadow-sm lg:p-6">
          <StepHeading n={2} id="step-payment">
            Payment method
          </StepHeading>
          <p className="mb-3 rounded bg-zinc-100 p-3 text-xs text-zinc-700">
            <strong>Demo store:</strong> no real payment happens. No card details are collected, sent or stored.
          </p>
          <fieldset>
            <legend className="sr-only">Choose a demo payment method</legend>
            <ul className="space-y-2">
              {PAYMENT_OPTIONS.map((opt) => (
                <li key={opt.id}>
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded border p-3 text-sm ${payment === opt.id ? "border-accent bg-amber-50" : "border-zinc-300"}`}
                  >
                    <input
                      type="radio"
                      name="payment"
                      value={opt.id}
                      checked={payment === opt.id}
                      onChange={() => {
                        setPayment(opt.id);
                        setFailure((f) => (f?.code === "payment" ? null : f));
                      }}
                      className="mt-1"
                    />
                    <span>
                      <span className="block font-bold">{opt.label}</span>
                      <span className="block text-zinc-600">{opt.note}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        </section>

        {/* 3. Review */}
        <section aria-labelledby="step-review" className="rounded bg-surface p-4 shadow-sm lg:p-6">
          <StepHeading n={3} id="step-review">
            Review items
          </StepHeading>

          {blocking.length > 0 && (
            <div role="alert" className="mb-3 rounded border border-price bg-red-50 p-3 text-sm text-price">
              <p className="font-bold">Some items need your attention before you can order.</p>
              <Link href="/cart" className="mt-1 inline-block underline">
                Go to your cart to fix them
              </Link>
            </div>
          )}

          <ul className="divide-y divide-zinc-200">
            {rows.map(({ line, p, problem }) => (
              <li key={line.productId} className="flex gap-3 py-3 first:pt-0" data-testid="checkout-line">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded bg-white">
                  {p?.imagePath && <Image src={productImageUrl(p.imagePath)} alt="" fill sizes="64px" className="object-contain p-0.5" />}
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="line-clamp-2 font-medium">{p?.title ?? "Item no longer available"}</p>
                  <p className="text-zinc-600">Qty: {line.quantity}</p>
                  {problem === "unavailable" && <p className="font-medium text-price">Currently unavailable</p>}
                  {problem === "limited" && p && <p className="font-medium text-price">Only {p.stock} left in stock</p>}
                  {problem === "missing" && <p className="font-medium text-price">This item can no longer be ordered</p>}
                </div>
                {p && !problem && <Price cents={p.priceCents * line.quantity} className="text-base" />}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Summary + place order */}
      <aside aria-label="Order summary" className="rounded bg-surface p-4 shadow-sm lg:sticky lg:top-28">
        <button
          type="button"
          onClick={onPlaceOrder}
          disabled={!canPlace}
          className="w-full rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-navy hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500"
        >
          {submitting ? "Placing your order…" : "Place your order"}
        </button>
        {!selected && <p className="mt-2 text-xs text-zinc-600">Add a shipping address to continue.</p>}

        <div role="alert" aria-live="assertive">
          {failure && (
            <div className="mt-3 rounded border border-price bg-red-50 p-3 text-sm text-price" data-testid="checkout-failure" data-code={failure.code}>
              <p className="font-bold">{failure.message}</p>
              {failure.code === "price_changed" && failure.actualTotalCents !== undefined && (
                <p className="mt-1">
                  Your new total is <strong>{formatPrice(failure.actualTotalCents)}</strong>. Review it and place your order again.
                </p>
              )}
              {failure.code === "cart_unavailable" && (
                <>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {(failure.problems ?? []).map((pr) => (
                      <li key={pr.product_id}>
                        {pr.reason === "out_of_stock"
                          ? `${pr.title}: only ${pr.available ?? 0} left (you have ${pr.requested ?? "more"} in your cart)`
                          : `${pr.title} is no longer available`}
                      </li>
                    ))}
                  </ul>
                  <Link href="/cart" className="mt-2 inline-block underline">
                    Update your cart
                  </Link>
                </>
              )}
              {failure.code === "cart_empty" && (
                <Link href="/orders" className="mt-1 inline-block underline">
                  Check Your Orders
                </Link>
              )}
            </div>
          )}
        </div>

        <h2 className="mt-4 text-base font-bold">Order summary</h2>
        <dl className="mt-2 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt>
              Items ({unitCount}):
            </dt>
            <dd>{formatPrice(totals.subtotalCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Shipping:</dt>
            <dd>{totals.shippingCents === 0 ? "FREE" : formatPrice(totals.shippingCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Estimated tax:</dt>
            <dd>{formatPrice(totals.taxCents)}</dd>
          </div>
          <div className="flex justify-between border-t border-zinc-200 pt-2 text-lg font-bold text-price">
            <dt>Order total:</dt>
            <dd data-testid="checkout-total">{formatPrice(totals.totalCents)}</dd>
          </div>
        </dl>
        {moreForFreeShipping > 0 && (
          <p className="mt-2 rounded bg-emerald-50 p-2 text-xs text-emerald-900">
            Add {formatPrice(moreForFreeShipping)} more to get FREE shipping.
          </p>
        )}
        <p className="mt-3 text-xs text-zinc-600">This is a demo store. Placing an order doesn&apos;t charge anything.</p>
      </aside>
    </div>
  );
}
