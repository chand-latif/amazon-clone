import Link from "next/link";
import type { ProductCard as Product } from "@/lib/catalog";
import { ProductCard } from "./ProductCard";

/** Horizontally scrolling row of product cards with a heading and "See all" link. */
export function ProductRow({
  title,
  href,
  products,
  discounts,
  id,
}: {
  title: string;
  href?: string;
  products: Product[];
  /** Optional per-product discount percentages (deals strip). */
  discounts?: Record<string, number>;
  id: string;
}) {
  return (
    <section aria-labelledby={id} className="rounded bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-baseline gap-4">
        <h2 id={id} className="text-xl font-bold">
          {title}
        </h2>
        {href && (
          <Link href={href} className="text-sm text-link hover:text-price hover:underline">
            See all
          </Link>
        )}
      </div>
      <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
        {products.map((p, i) => (
          <li key={p.id} className="w-44 shrink-0 snap-start sm:w-52">
            <ProductCard
              product={p}
              discountPct={discounts?.[p.id]}
              priority={i < 2}
              sizes="208px"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
